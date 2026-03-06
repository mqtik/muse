interface NoteEvent {
  pitch: number
  startTime: number
  duration: number
  partIndex: number
}

export function parseMusicXmlNotes(musicxml: string, bpm: number): NoteEvent[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(musicxml, 'text/xml')
  const parts = doc.querySelectorAll('score-partwise > part')
  const notes: NoteEvent[] = []
  const beatDuration = 60 / bpm

  const STEP_TO_SEMITONE: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  }

  parts.forEach((part, partIndex) => {
    let currentTime = 0
    let divisions = 1

    const measures = part.querySelectorAll('measure')
    measures.forEach((measure) => {
      const divEl = measure.querySelector('attributes > divisions')
      if (divEl) divisions = parseInt(divEl.textContent || '1') || 1

      const elements = measure.children
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]

        if (el.tagName === 'forward') {
          const dur = parseInt(el.querySelector('duration')?.textContent || '0')
          currentTime += (dur / divisions) * beatDuration
        }

        if (el.tagName === 'backup') {
          const dur = parseInt(el.querySelector('duration')?.textContent || '0')
          currentTime -= (dur / divisions) * beatDuration
        }

        if (el.tagName !== 'note') continue

        const durationEl = el.querySelector('duration')
        const dur = parseInt(durationEl?.textContent || '0')
        const durationSec = (dur / divisions) * beatDuration

        const isRest = el.querySelector('rest')
        const isChord = el.querySelector('chord')

        if (!isChord) {
          // handled below
        }

        if (isRest) {
          if (!isChord) currentTime += durationSec
          continue
        }

        const pitchEl = el.querySelector('pitch')
        if (!pitchEl) {
          if (!isChord) currentTime += durationSec
          continue
        }

        const step = pitchEl.querySelector('step')?.textContent || 'C'
        const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4')
        const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0')

        const midi = (octave + 1) * 12 + (STEP_TO_SEMITONE[step] || 0) + alter

        const noteStart = isChord ? currentTime - durationSec : currentTime

        notes.push({
          pitch: midi,
          startTime: Math.max(0, isChord ? noteStart : currentTime),
          duration: Math.max(0.05, durationSec),
          partIndex,
        })

        if (!isChord) currentTime += durationSec
      }
    })
  })

  return notes.sort((a, b) => a.startTime - b.startTime)
}

export class MusicXmlSynth {
  private ctx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private scheduledNodes: OscillatorNode[] = []
  private notes: NoteEvent[] = []
  private startedAt = 0
  private pausedAt = 0
  private _playing = false
  private _duration = 0
  private rafId = 0
  private onTimeUpdate?: (time: number) => void
  private onEnd?: () => void

  get playing() { return this._playing }
  get duration() { return this._duration }

  load(musicxml: string, bpm: number) {
    this.stop()
    this.notes = parseMusicXmlNotes(musicxml, bpm)
    if (this.notes.length > 0) {
      const last = this.notes.reduce((a, b) =>
        a.startTime + a.duration > b.startTime + b.duration ? a : b
      )
      this._duration = last.startTime + last.duration
    }
  }

  setOnTimeUpdate(cb: (time: number) => void) { this.onTimeUpdate = cb }
  setOnEnd(cb: () => void) { this.onEnd = cb }

  setVolume(v: number) {
    if (this.gainNode) this.gainNode.gain.value = v * 0.3
  }

  play(fromTime = 0) {
    this.stop()
    this.ctx = new AudioContext()
    this.gainNode = this.ctx.createGain()
    this.gainNode.gain.value = 0.3
    this.gainNode.connect(this.ctx.destination)

    const now = this.ctx.currentTime
    this.startedAt = now - fromTime

    for (const note of this.notes) {
      if (note.startTime + note.duration < fromTime) continue

      const freq = 440 * Math.pow(2, (note.pitch - 69) / 12)
      const osc = this.ctx.createOscillator()
      const env = this.ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.connect(env)
      env.connect(this.gainNode!)

      const attackTime = 0.02
      const releaseTime = Math.min(0.1, note.duration * 0.3)
      const start = now + Math.max(0, note.startTime - fromTime)
      const end = start + note.duration

      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(0.8, start + attackTime)
      env.gain.setValueAtTime(0.8, end - releaseTime)
      env.gain.linearRampToValueAtTime(0, end)

      osc.start(start)
      osc.stop(end + 0.01)
      this.scheduledNodes.push(osc)
    }

    this._playing = true
    this.tick()
  }

  private tick = () => {
    if (!this._playing || !this.ctx) return
    const elapsed = this.ctx.currentTime - this.startedAt
    this.onTimeUpdate?.(elapsed)

    if (elapsed >= this._duration) {
      this._playing = false
      this.onEnd?.()
      return
    }
    this.rafId = requestAnimationFrame(this.tick)
  }

  pause() {
    if (!this._playing || !this.ctx) return
    this.pausedAt = this.ctx.currentTime - this.startedAt
    this.stop()
  }

  resume() {
    if (this.pausedAt > 0) {
      this.play(this.pausedAt)
      this.pausedAt = 0
    }
  }

  stop() {
    this._playing = false
    cancelAnimationFrame(this.rafId)
    for (const osc of this.scheduledNodes) {
      try { osc.stop() } catch {}
    }
    this.scheduledNodes = []
    this.ctx?.close()
    this.ctx = null
  }

  getCurrentTime(): number {
    if (!this.ctx || !this._playing) return this.pausedAt
    return this.ctx.currentTime - this.startedAt
  }

  seekTo(time: number) {
    const wasPlaying = this._playing
    this.stop()
    this.pausedAt = time
    if (wasPlaying) this.resume()
  }
}
