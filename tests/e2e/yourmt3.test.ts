import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  TEST_ENV,
  runPythonScript,
  getAudioDuration,
  getMidiDuration,
  loadMidi,
  cleanupFiles,
  getMidiOutputPaths,
  validateMidiNotes,
} from '../helpers'

const MP3_DIR = join(__dirname, '..', '..', 'mp3_files')
const SHORT_PIANO = join(MP3_DIR, 'Short-tension-piano.mp3')
const HAS_AUDIO = existsSync(SHORT_PIANO)

describe.skipIf(!TEST_ENV.hasVenv || !TEST_ENV.hasYourMT3 || !HAS_AUDIO)('YourMT3 backend (e2e)', () => {
  const { score, perf } = getMidiOutputPaths(SHORT_PIANO)

  it('multi-instrument transcription produces multi-track MIDI', async () => {
    try {
      await runPythonScript('pipeline', [SHORT_PIANO, '--backend', 'yourmt3'])

      expect(existsSync(score), 'score MIDI exists').toBe(true)

      const parsed = loadMidi(score)
      expect(parsed.notes.length, 'has notes').toBeGreaterThan(0)
      expect(parsed.tracks.length, 'has tracks').toBeGreaterThanOrEqual(1)

      const trackNames = parsed.tracks.map((t) => t.name)
      const hasInstrumentNames = trackNames.some((n) => n !== 'Left Hand' && n !== 'Right Hand' && n.length > 0)
      expect(hasInstrumentNames, 'tracks have instrument names').toBe(true)
    } finally {
      cleanupFiles(score, perf)
    }
  }, 300_000)

  it('YourMT3 output copies to both score and perf paths', async () => {
    try {
      await runPythonScript('pipeline', [SHORT_PIANO, '--backend', 'yourmt3'])

      expect(existsSync(score), 'score exists').toBe(true)
      expect(existsSync(perf), 'perf exists').toBe(true)

      const scoreBytes = readFileSync(score)
      const perfBytes = readFileSync(perf)
      expect(scoreBytes.equals(perfBytes), 'score and perf are identical').toBe(true)
    } finally {
      cleanupFiles(score, perf)
    }
  }, 300_000)

  it('transcription notes have valid pitch and timing', async () => {
    try {
      await runPythonScript('pipeline', [SHORT_PIANO, '--backend', 'yourmt3'])

      const parsed = loadMidi(score)
      validateMidiNotes(parsed.notes, 'YourMT3')

      const audioDuration = await getAudioDuration(SHORT_PIANO)
      const midiDuration = await getMidiDuration(score)
      expect(midiDuration, 'MIDI duration within range of audio').toBeGreaterThan(audioDuration * 0.5)
      expect(midiDuration, 'MIDI duration within range of audio').toBeLessThan(audioDuration * 1.5)
    } finally {
      cleanupFiles(score, perf)
    }
  }, 300_000)

  it('metadata includes instrument names', async () => {
    try {
      const { stdout } = await runPythonScript('pipeline', [SHORT_PIANO, '--backend', 'yourmt3'])

      const lines = stdout.trim().split('\n')
      let result: any
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          result = JSON.parse(lines[i])
          if (result.midi) break
        } catch {}
      }

      expect(result).toBeDefined()
      expect(result.metadata.instruments).toBeDefined()
      expect(result.metadata.instruments.length).toBeGreaterThanOrEqual(1)
    } finally {
      cleanupFiles(score, perf)
    }
  }, 300_000)
})
