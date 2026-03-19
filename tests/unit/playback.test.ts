import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseMidiBytes, type MidiNote } from '../../app/src/lib/parseMidi'
import { preparePlaybackNotes } from '../../app/src/lib/midiSynth'

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

function loadMidi(name: string) {
  const path = join(FIXTURES_DIR, name)
  if (!existsSync(path)) return null
  return parseMidiBytes(new Uint8Array(readFileSync(path)))
}

describe('parseMidiBytes', () => {
  it('parses valid MIDI with notes, tracks, tempo', () => {
    const midi = loadMidi('chopin-op28-1.mid')
    if (!midi) return

    expect(midi.notes.length).toBeGreaterThan(0)
    expect(midi.tracks.length).toBeGreaterThan(0)
    expect(midi.duration).toBeGreaterThan(0)
    expect(midi.tempo).toBeGreaterThan(0)
    expect(midi.ppq).toBeGreaterThan(0)
  })

  it('produces notes with valid time ranges', () => {
    const midi = loadMidi('chopin-op28-1.mid')
    if (!midi) return

    for (const note of midi.notes) {
      expect(note.startTime).toBeGreaterThanOrEqual(0)
      expect(note.endTime).toBeGreaterThan(note.startTime)
      expect(note.pitch).toBeGreaterThanOrEqual(0)
      expect(note.pitch).toBeLessThanOrEqual(127)
      expect(note.velocity).toBeGreaterThan(0)
      expect(note.velocity).toBeLessThanOrEqual(127)
      expect(note.track).toBeGreaterThanOrEqual(0)
    }
  })

  it('notes are sorted by start time', () => {
    const midi = loadMidi('chopin-op28-1.mid')
    if (!midi) return

    for (let i = 1; i < midi.notes.length; i++) {
      expect(midi.notes[i].startTime).toBeGreaterThanOrEqual(midi.notes[i - 1].startTime)
    }
  })
})

describe('preparePlaybackNotes', () => {
  it('enforces minimum note duration', () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, endTime: 0.01, velocity: 80, track: 0 },
    ]
    const prepared = preparePlaybackNotes(notes)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].endTime - prepared[0].startTime).toBeGreaterThanOrEqual(0.08)
  })

  it('removes overlapping notes shorter than minimum duration', () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, endTime: 1, velocity: 80, track: 0 },
      { pitch: 60, startTime: 0.05, endTime: 2, velocity: 80, track: 0 },
    ]
    const prepared = preparePlaybackNotes(notes)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].startTime).toBe(0.05)
  })

  it('shortens overlapping notes to avoid collision', () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, endTime: 2, velocity: 80, track: 0 },
      { pitch: 60, startTime: 1, endTime: 3, velocity: 80, track: 0 },
    ]
    const prepared = preparePlaybackNotes(notes)
    expect(prepared).toHaveLength(2)
    expect(prepared[0].endTime).toBeLessThanOrEqual(prepared[1].startTime)
  })

  it('does not modify notes on different tracks', () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, endTime: 2, velocity: 80, track: 0 },
      { pitch: 60, startTime: 0, endTime: 2, velocity: 80, track: 1 },
    ]
    const prepared = preparePlaybackNotes(notes)
    expect(prepared).toHaveLength(2)
    expect(prepared[0].endTime).toBe(2)
    expect(prepared[1].endTime).toBe(2)
  })

  it('does not modify notes on different pitches', () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, endTime: 2, velocity: 80, track: 0 },
      { pitch: 62, startTime: 0, endTime: 2, velocity: 80, track: 0 },
    ]
    const prepared = preparePlaybackNotes(notes)
    expect(prepared).toHaveLength(2)
  })

  it('does not mutate input array', () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, endTime: 0.01, velocity: 80, track: 0 },
    ]
    preparePlaybackNotes(notes)
    expect(notes[0].endTime).toBe(0.01)
  })
})

describe('playback pipeline: MIDI file → parse → prepare', () => {
  it('processes pipeline output MIDI without errors', () => {
    const midi = loadMidi('chopin-op28-1.mid')
    if (!midi) return

    const prepared = preparePlaybackNotes(midi.notes)

    expect(prepared.length).toBeGreaterThan(0)
    expect(prepared.length).toBeLessThanOrEqual(midi.notes.length)

    for (const note of prepared) {
      const dur = note.endTime - note.startTime
      expect(dur).toBeGreaterThanOrEqual(0.08)
    }
  })

  it('produces no overlapping notes on same track+pitch', () => {
    const midi = loadMidi('chopin-op28-1.mid')
    if (!midi) return

    const prepared = preparePlaybackNotes(midi.notes)

    const byTrackPitch = new Map<string, MidiNote[]>()
    for (const note of prepared) {
      const key = `${note.track}:${note.pitch}`
      const group = byTrackPitch.get(key) || []
      group.push(note)
      byTrackPitch.set(key, group)
    }

    for (const group of byTrackPitch.values()) {
      group.sort((a, b) => a.startTime - b.startTime)
      for (let i = 0; i < group.length - 1; i++) {
        expect(
          group[i].endTime,
          `Note at ${group[i].startTime}s overlaps with next at ${group[i + 1].startTime}s`,
        ).toBeLessThanOrEqual(group[i + 1].startTime + 0.001)
      }
    }
  })

  it('pipeline runs synchronously (no blocking)', () => {
    const midi = loadMidi('chopin-op28-1.mid')
    if (!midi) return

    const start = performance.now()
    const prepared = preparePlaybackNotes(midi.notes)
    const elapsed = performance.now() - start

    expect(prepared.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })
})
