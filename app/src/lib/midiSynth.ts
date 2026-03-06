import { readFile } from '@tauri-apps/plugin-fs'
import { SplendidGrandPiano } from 'smplr'
import { parseMidiBytes } from './parseMidi'
import type { MidiNote, ParsedMidi } from './parseMidi'

export type { MidiNote, MidiTrackInfo, ParsedMidi } from './parseMidi'

const MIN_NOTE_DURATION = 0.08
const SCHEDULE_AHEAD = 0.05

function preparePlaybackNotes(notes: MidiNote[]): MidiNote[] {
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

  return output
}

export class MidiSynth {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private trackGains: GainNode[] = []
  private pianos: SplendidGrandPiano[] = []
  private startedAt = 0
  private pausedAt = 0
  private _playing = false
  private _loaded = false
  private rafId = 0
  private onTimeUpdate?: (time: number) => void
  private onEnd?: () => void

  parsed: ParsedMidi = { notes: [], tracks: [], duration: 0, tempo: 120, ppq: 480, tempoEventCount: 0 }

  get playing() { return this._playing }
  get loaded() { return this._loaded }
  get duration() { return this.parsed.duration }

  async loadFile(path: string) {
    this.stopNotes()
    this.disposeAudio()
    this._loaded = false

    const bytes = await readFile(path)
    this.parsed = parseMidiBytes(new Uint8Array(bytes))

    this.ctx = new AudioContext()

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.4
    this.masterGain.connect(this.ctx.destination)

    const trackCount = Math.max(1, this.parsed.tracks.length)
    this.trackGains = Array.from({ length: trackCount }, () => {
      const g = this.ctx!.createGain()
      g.gain.value = 1
      g.connect(this.masterGain!)
      return g
    })

    this.pianos = await Promise.all(
      this.trackGains.map((gain) =>
        new Promise<SplendidGrandPiano>((resolve) => {
          const piano = new SplendidGrandPiano(this.ctx!, { destination: gain })
          piano.loaded().then(() => resolve(piano))
        })
      )
    )

    this._loaded = true
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
    if (!this.ctx || !this._loaded) return
    this.stopNotes()

    await this.ctx.resume()

    const now = this.ctx.currentTime + SCHEDULE_AHEAD
    this.startedAt = now - fromTime

    const playbackNotes = preparePlaybackNotes(this.parsed.notes)
    for (const note of playbackNotes) {
      if (note.endTime < fromTime) continue
      const piano = this.pianos[note.track] || this.pianos[0]
      const start = now + Math.max(0, note.startTime - fromTime)
      const dur = note.endTime - note.startTime

      piano.start({
        note: note.pitch,
        velocity: note.velocity,
        time: start,
        duration: dur,
      })
    }

    this._playing = true
    this.pausedAt = 0
    this.tick()
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
    for (const piano of this.pianos) {
      piano.stop()
    }
  }

  stop() {
    this.stopNotes()
    this.pausedAt = 0
  }

  private disposeAudio() {
    this.pianos = []
    this.trackGains = []
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.masterGain = null
    this._loaded = false
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
}
