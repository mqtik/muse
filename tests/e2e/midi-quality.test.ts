import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  hasVenv,
  hasPM2S,
  runPythonScript,
  getAudioDuration,
  getMidiDuration,
} from '../helpers'
import { parseMidiBytes } from '../../app/src/lib/parseMidi'

const HAS_FULL_STACK = hasVenv() && hasPM2S()
const MP3_DIR = join(__dirname, '..', '..', 'mp3_files')

interface TestCase {
  name: string
  file: string
}

const TEST_CASES: TestCase[] = [
  { name: 'The Urn', file: 'The Urn.mp3' },
  { name: 'Playing Townes', file: 'Playing Townes.mp3' },
].filter((tc) => existsSync(join(MP3_DIR, tc.file)))

function verifyMidi(
  parsed: ReturnType<typeof parseMidiBytes>,
  pythonDuration: number,
  audioDuration: number,
  name: string,
) {
  expect(
    pythonDuration,
    `[${name}] Python MIDI duration (${pythonDuration.toFixed(1)}s) within 15% of audio (${audioDuration.toFixed(1)}s)`,
  ).toBeGreaterThan(audioDuration * 0.85)
  expect(
    pythonDuration,
    `[${name}] Python MIDI duration (${pythonDuration.toFixed(1)}s) within 15% of audio (${audioDuration.toFixed(1)}s)`,
  ).toBeLessThan(audioDuration * 1.15)

  expect(
    Math.abs(parsed.duration - pythonDuration),
    `[${name}] TS duration (${parsed.duration.toFixed(1)}s) should match Python (${pythonDuration.toFixed(1)}s) within 2s`,
  ).toBeLessThan(2)

  const zeroDuration = parsed.notes.filter((n) => n.endTime - n.startTime <= 0)
  expect(zeroDuration.length, `[${name}] No zero-duration notes`).toBe(0)

  const badPitch = parsed.notes.filter((n) => n.pitch < 0 || n.pitch > 127)
  expect(badPitch.length, `[${name}] All pitches 0-127`).toBe(0)

  const badVel = parsed.notes.filter((n) => n.velocity < 1 || n.velocity > 127)
  expect(badVel.length, `[${name}] All velocities 1-127`).toBe(0)

  expect(parsed.notes.length, `[${name}] Reasonable note count`).toBeGreaterThan(10)

  expect(parsed.tracks.length, `[${name}] Two tracks`).toBe(2)
  expect(parsed.tracks.map((t) => t.name)).toContain('Left Hand')
  expect(parsed.tracks.map((t) => t.name)).toContain('Right Hand')
}

describe.skipIf(!HAS_FULL_STACK || TEST_CASES.length === 0)('MIDI quality (e2e)', () => {
  for (const tc of TEST_CASES) {
    it(`${tc.name}: duration matches audio, parser agrees with Python`, async () => {
      const audioPath = join(MP3_DIR, tc.file)
      const output = join(tmpdir(), `test-midi-${tc.name.replace(/\s/g, '_')}-${Date.now()}.musicxml`)
      const midiPath = output.replace('.musicxml', '.mid')

      try {
        const audioDuration = await getAudioDuration(audioPath)
        expect(audioDuration).toBeGreaterThan(30)

        await runPythonScript('pipeline', [audioPath, '-o', output, '--solo-piano'])

        expect(existsSync(midiPath)).toBe(true)

        const pythonDuration = await getMidiDuration(midiPath)
        const midiBytes = new Uint8Array(readFileSync(midiPath))
        const parsed = parseMidiBytes(midiBytes)

        verifyMidi(parsed, pythonDuration, audioDuration, tc.name)
      } finally {
        if (existsSync(output)) unlinkSync(output)
        if (existsSync(midiPath)) unlinkSync(midiPath)
      }
    }, 300_000)
  }
})
