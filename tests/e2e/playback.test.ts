import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { hasVenv, hasPM2S, runPythonScript, FIXTURES_DIR } from '../helpers'
import { parseMidiBytes } from '../../app/src/lib/parseMidi'
import { preparePlaybackNotes } from '../../app/src/lib/midiSynth'

const HAS_FULL_STACK = hasVenv() && hasPM2S()
const FIXTURE_WAV = join(FIXTURES_DIR, 'chopin-op28-1.wav')
const HAS_FIXTURE = existsSync(FIXTURE_WAV)

describe.skipIf(!HAS_FULL_STACK || !HAS_FIXTURE)('Playback: pipeline MIDI → instant play', () => {
  const scoreMidiPath = FIXTURE_WAV.replace('.wav', '.mid')
  const perfMidiPath = FIXTURE_WAV.replace('.wav', '.perf.mid')

  it('produces MIDI that parses and prepares for playback instantly', async () => {
    if (!existsSync(scoreMidiPath)) {
      await runPythonScript('pipeline', [FIXTURE_WAV, '--solo-piano'])
    }

    expect(existsSync(scoreMidiPath)).toBe(true)
    expect(existsSync(perfMidiPath)).toBe(true)

    for (const path of [scoreMidiPath, perfMidiPath]) {
      const bytes = new Uint8Array(readFileSync(path))
      const parseStart = performance.now()
      const parsed = parseMidiBytes(bytes)
      const parseTime = performance.now() - parseStart

      expect(parsed.notes.length).toBeGreaterThan(0)
      expect(parsed.duration).toBeGreaterThan(0)
      expect(parseTime).toBeLessThan(100)

      const prepStart = performance.now()
      const prepared = preparePlaybackNotes(parsed.notes)
      const prepTime = performance.now() - prepStart

      expect(prepared.length).toBeGreaterThan(0)
      expect(prepTime).toBeLessThan(200)

      for (const note of prepared) {
        expect(note.endTime - note.startTime).toBeGreaterThanOrEqual(0.079)
        expect(note.pitch).toBeGreaterThanOrEqual(0)
        expect(note.pitch).toBeLessThanOrEqual(127)
      }

      const byTrackPitch = new Map<string, typeof prepared>()
      for (const note of prepared) {
        const key = `${note.track}:${note.pitch}`
        const group = byTrackPitch.get(key) || []
        group.push(note)
        byTrackPitch.set(key, group)
      }
      for (const group of byTrackPitch.values()) {
        group.sort((a, b) => a.startTime - b.startTime)
        for (let i = 0; i < group.length - 1; i++) {
          expect(group[i].endTime).toBeLessThanOrEqual(group[i + 1].startTime + 0.001)
        }
      }
    }
  }, 300_000)

  it('score MIDI has two tracks (Left Hand / Right Hand)', () => {
    if (!existsSync(scoreMidiPath)) return

    const parsed = parseMidiBytes(new Uint8Array(readFileSync(scoreMidiPath)))
    expect(parsed.tracks.length).toBe(2)
    expect(parsed.tracks.map((t) => t.name)).toContain('Left Hand')
    expect(parsed.tracks.map((t) => t.name)).toContain('Right Hand')
  })

  it('all note durations are schedulable (no zero/negative)', () => {
    if (!existsSync(scoreMidiPath)) return

    const parsed = parseMidiBytes(new Uint8Array(readFileSync(scoreMidiPath)))
    const prepared = preparePlaybackNotes(parsed.notes)

    const zeroDuration = prepared.filter((n) => n.endTime - n.startTime <= 0)
    expect(zeroDuration).toHaveLength(0)

    const negativeDuration = prepared.filter((n) => n.endTime < n.startTime)
    expect(negativeDuration).toHaveLength(0)
  })

  it.afterAll(() => {
    for (const f of [scoreMidiPath, perfMidiPath]) {
      if (existsSync(f)) unlinkSync(f)
    }
  })
})
