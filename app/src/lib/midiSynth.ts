import { readFile } from '@tauri-apps/plugin-fs'
import { Soundfont, CacheStorage } from 'smplr'
import { parseMidiBytes } from './parseMidi'
import type { MidiNote, ParsedMidi } from './parseMidi'

let _sfCache: CacheStorage | undefined
function getSfCache(): CacheStorage {
  if (!_sfCache) _sfCache = new CacheStorage('audio2sheets-soundfonts')
  return _sfCache
}

export type { MidiNote, MidiTrackInfo, ParsedMidi } from './parseMidi'

const MIN_NOTE_DURATION = 0.08
const SCHEDULE_AHEAD = 0.05
const LOOKAHEAD = 0.5

const GM_INSTRUMENTS: string[] = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  'celesta', 'glockenspiel', 'music_box', 'vibraphone',
  'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ',
  'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
  'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass',
  'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  'violin', 'viola', 'cello', 'contrabass',
  'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2',
  'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  'trumpet', 'trombone', 'tuba', 'muted_trumpet',
  'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax',
  'oboe', 'english_horn', 'bassoon', 'clarinet',
  'piccolo', 'flute', 'recorder', 'pan_flute',
  'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff',
  'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass_lead',
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir',
  'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere',
  'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  'sitar', 'banjo', 'shamisen', 'koto',
  'kalimba', 'bagpipe', 'fiddle', 'shanai',
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock',
  'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet',
  'telephone_ring', 'helicopter', 'applause', 'gunshot',
]

function gmInstrumentName(program: number): string {
  return GM_INSTRUMENTS[Math.max(0, Math.min(127, program))] || 'acoustic_grand_piano'
}

export function preparePlaybackNotes(notes: MidiNote[]): MidiNote[] {
  const result = notes.map((n) => ({ ...n }))

  const byTrackPitch = new Map<string, MidiNote[]>()
  for (const note of result) {
    const key = `${note.track}:${note.pitch}`
    const group = byTrackPitch.get(key) || []
    group.push(note)
    byTrackPitch.set(key, group)
  }

  const removed = new Set<MidiNote>()
  for (const group of byTrackPitch.values()) {
    group.sort((a, b) => a.startTime - b.startTime)
    for (let i = 0; i < group.length - 1; i++) {
      if (group[i].endTime > group[i + 1].startTime) {
        const availableDur = group[i + 1].startTime - group[i].startTime
        if (availableDur < MIN_NOTE_DURATION) {
          removed.add(group[i])
        } else {
          group[i].endTime = group[i + 1].startTime
        }
      }
    }
  }

  const output: MidiNote[] = []
  for (const note of result) {
    if (removed.has(note)) continue
    if (note.endTime - note.startTime < MIN_NOTE_DURATION) {
      note.endTime = note.startTime + MIN_NOTE_DURATION
    }
    output.push(note)
  }

  output.sort((a, b) => a.startTime - b.startTime)
  return output
}

export class MidiSynth {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private trackGains: GainNode[] = []
  private instruments: Soundfont[] = []
  private startedAt = 0
  private pausedAt = 0
  private _playing = false
  private _parsed = false
  private _audioReady = false
  private _audioLoading: Promise<void> | null = null
  private rafId = 0
  private onTimeUpdate?: (time: number) => void
  private onEnd?: () => void
  private _playbackNotes: MidiNote[] = []
  private _scheduledThrough = 0

  parsed: ParsedMidi = { notes: [], tracks: [], duration: 0, tempo: 120, ppq: 480, tempoEventCount: 0 }

  get playing() { return this._playing }
  get loaded() { return this._parsed }
  get duration() { return this.parsed.duration }

  async loadFile(path: string) {
    this.stopNotes()
    this.disposeAudio()
    this._parsed = false
    this._audioReady = false

    const bytes = await readFile(path)
    this.parsed = parseMidiBytes(new Uint8Array(bytes))
    this._parsed = true
  }

  initAudioContext() {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.ctx.resume()
  }

  private async ensureAudio() {
    if (this._audioReady) return
    if (this._audioLoading) {
      await this._audioLoading
      return
    }
    if (!this.ctx) return

    this._audioLoading = (async () => {
      this.masterGain = this.ctx!.createGain()
      this.masterGain.gain.value = 0.4
      this.masterGain.connect(this.ctx!.destination)

      const trackCount = Math.max(1, this.parsed.tracks.length)
      this.trackGains = Array.from({ length: trackCount }, () => {
        const g = this.ctx!.createGain()
        g.gain.value = 1
        g.connect(this.masterGain!)
        return g
      })

      this.instruments = []
      for (let i = 0; i < trackCount; i++) {
        const program = this.parsed.tracks[i]?.program ?? 0
        const name = gmInstrumentName(program)
        let sf: Soundfont
        try {
          sf = new Soundfont(this.ctx!, { instrument: name, destination: this.trackGains[i], storage: getSfCache() })
          await sf.loaded()
        } catch {
          sf = new Soundfont(this.ctx!, { instrument: 'acoustic_grand_piano', destination: this.trackGains[i], storage: getSfCache() })
          await sf.loaded()
        }
        this.instruments.push(sf)
      }

      this._audioReady = true
    })()

    await this._audioLoading
  }

  setOnTimeUpdate(cb: (time: number) => void) { this.onTimeUpdate = cb }
  setOnEnd(cb: () => void) { this.onEnd = cb }

  setVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = v * 0.4
  }

  setTrackEnabled(track: number, enabled: boolean) {
    if (this.trackGains[track] && this.ctx) {
      this.trackGains[track].gain.setTargetAtTime(enabled ? 1 : 0, this.ctx.currentTime, 0.02)
    }
  }

  async play(fromTime = 0) {
    if (!this._parsed) return
    await this.ensureAudio()
    if (!this.ctx || !this._audioReady) return
    this.stopNotes()

    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }

    const now = this.ctx.currentTime + SCHEDULE_AHEAD
    this.startedAt = now - fromTime
    this._playbackNotes = preparePlaybackNotes(this.parsed.notes)
    this._scheduledThrough = fromTime
    this._playing = true
    this.pausedAt = 0
    this.scheduleChunk()
    this.tick()
  }

  private scheduleChunk() {
    if (!this._playing || !this.ctx) return
    const elapsed = this.ctx.currentTime - this.startedAt
    const scheduleUntil = elapsed + LOOKAHEAD
    if (scheduleUntil <= this._scheduledThrough) return

    const now = this.ctx.currentTime
    for (const note of this._playbackNotes) {
      if (note.startTime < this._scheduledThrough) continue
      if (note.startTime > scheduleUntil) break
      const instrument = this.instruments[note.track] || this.instruments[0]
      const start = now + (note.startTime - elapsed)
      const dur = note.endTime - note.startTime
      instrument.start({
        note: note.pitch,
        velocity: note.velocity,
        time: Math.max(now, start),
        duration: dur,
      })
    }
    this._scheduledThrough = scheduleUntil
  }

  private tick = () => {
    if (!this._playing || !this.ctx) return
    const elapsed = this.ctx.currentTime - this.startedAt
    this.onTimeUpdate?.(elapsed)
    if (elapsed >= this.parsed.duration) {
      this._playing = false
      this.onEnd?.()
      return
    }
    this.scheduleChunk()
    this.rafId = requestAnimationFrame(this.tick)
  }

  pause() {
    if (!this._playing || !this.ctx) return
    this.pausedAt = this.ctx.currentTime - this.startedAt
    this.stopNotes()
  }

  async resume() {
    if (this.pausedAt > 0) {
      await this.play(this.pausedAt)
    }
  }

  private stopNotes() {
    this._playing = false
    cancelAnimationFrame(this.rafId)
    this._playbackNotes = []
    this._scheduledThrough = 0
    for (const inst of this.instruments) {
      inst.stop()
    }
  }

  stop() {
    this.stopNotes()
    this.pausedAt = 0
  }

  private disposeAudio() {
    for (const inst of this.instruments) {
      inst.disconnect()
    }
    this.instruments = []
    this.trackGains = []
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.masterGain = null
    this._audioReady = false
    this._audioLoading = null
  }

  dispose() {
    this.stopNotes()
    this.disposeAudio()
  }

  getCurrentTime(): number {
    if (!this.ctx || !this._playing) return this.pausedAt
    return this.ctx.currentTime - this.startedAt
  }

  seekTo(time: number) {
    const wasPlaying = this._playing
    this.stopNotes()
    this.pausedAt = time
    if (wasPlaying) this.play(time)
  }

  static async preloadInstruments(programs: number[]) {
    const unique = [...new Set(programs.map((p) => gmInstrumentName(p)))]
    const ctx = new AudioContext()
    try {
      for (const name of unique) {
        const sf = new Soundfont(ctx, { instrument: name, storage: getSfCache() })
        await sf.loaded()
        sf.disconnect()
      }
    } finally {
      ctx.close()
    }
  }
}
