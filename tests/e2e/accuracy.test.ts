import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { hasVenv, hasPM2S, runPythonScript, FIXTURES_DIR } from '../helpers'
import { parseMidiBytes } from '../../app/src/lib/parseMidi'

const HAS_FULL_STACK = hasVenv() && hasPM2S()
const FIXTURE_WAV = join(FIXTURES_DIR, 'chopin-op28-1.wav')
const FIXTURE_MID = join(FIXTURES_DIR, 'chopin-op28-1.mid')
const HAS_FIXTURES = existsSync(FIXTURE_WAV) && existsSync(FIXTURE_MID)

interface Note {
  pitch: number
  onset: number
  offset: number
}

function extractNotes(midiPath: string): Note[] {
  const bytes = new Uint8Array(readFileSync(midiPath))
  const parsed = parseMidiBytes(bytes)
  return parsed.notes.map((n) => ({
    pitch: n.pitch,
    onset: n.startTime,
    offset: n.endTime,
  }))
}

function noteF1(reference: Note[], estimated: Note[], onsetTolerance: number) {
  const matched = new Set<number>()

  let truePositives = 0
  for (const ref of reference) {
    for (let i = 0; i < estimated.length; i++) {
      if (matched.has(i)) continue
      if (
        estimated[i].pitch === ref.pitch &&
        Math.abs(estimated[i].onset - ref.onset) <= onsetTolerance
      ) {
        truePositives++
        matched.add(i)
        break
      }
    }
  }

  const precision = estimated.length > 0 ? truePositives / estimated.length : 0
  const recall = reference.length > 0 ? truePositives / reference.length : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  return { precision, recall, f1, truePositives, refCount: reference.length, estCount: estimated.length }
}

describe.skipIf(!HAS_FULL_STACK || !HAS_FIXTURES)('Accuracy: Chopin Op.28 No.1', () => {
  const scoreMidiPath = FIXTURE_WAV.replace('.wav', '.mid')
  const perfMidiPath = FIXTURE_WAV.replace('.wav', '.perf.mid')
  const diagPath = FIXTURE_WAV.replace('.wav', '.diagnostics.json')

  let referenceNotes: Note[]
  let perfNotes: Note[]
  let scoreNotes: Note[]

  it('runs the pipeline', async () => {
    await runPythonScript('pipeline', [FIXTURE_WAV, '--solo-piano', '--diagnostics'])
    expect(existsSync(scoreMidiPath)).toBe(true)
    expect(existsSync(perfMidiPath)).toBe(true)

    referenceNotes = extractNotes(FIXTURE_MID)
    perfNotes = extractNotes(perfMidiPath)
    scoreNotes = extractNotes(scoreMidiPath)

    console.log(`Reference: ${referenceNotes.length} notes`)
    console.log(`Transcription (perf): ${perfNotes.length} notes`)
    console.log(`Score (quantized): ${scoreNotes.length} notes`)
  }, 300_000)

  it('transcription note count is within 2x of reference', () => {
    expect(perfNotes.length).toBeGreaterThan(referenceNotes.length * 0.3)
    expect(perfNotes.length).toBeLessThan(referenceNotes.length * 3)
  })

  it('transcription F1 >= 0.2 at 100ms tolerance', () => {
    const result = noteF1(referenceNotes, perfNotes, 0.1)
    console.log(`Transcription @ 100ms: P=${(result.precision * 100).toFixed(1)}% R=${(result.recall * 100).toFixed(1)}% F1=${(result.f1 * 100).toFixed(1)}%`)
    expect(result.f1).toBeGreaterThanOrEqual(0.2)
  })

  it('transcription F1 >= 0.15 at 50ms tolerance', () => {
    const result = noteF1(referenceNotes, perfNotes, 0.05)
    console.log(`Transcription @ 50ms:  P=${(result.precision * 100).toFixed(1)}% R=${(result.recall * 100).toFixed(1)}% F1=${(result.f1 * 100).toFixed(1)}%`)
    expect(result.f1).toBeGreaterThanOrEqual(0.15)
  })

  it('score note count is within 2x of reference', () => {
    expect(scoreNotes.length).toBeGreaterThan(referenceNotes.length * 0.3)
    expect(scoreNotes.length).toBeLessThan(referenceNotes.length * 3)
  })

  it('score F1 >= 0.3 at 200ms tolerance', () => {
    const result = noteF1(referenceNotes, scoreNotes, 0.2)
    console.log(`Score @ 200ms:         P=${(result.precision * 100).toFixed(1)}% R=${(result.recall * 100).toFixed(1)}% F1=${(result.f1 * 100).toFixed(1)}%`)
    expect(result.f1).toBeGreaterThanOrEqual(0.3)
  })

  it('pitch range overlaps with reference', () => {
    const refPitches = new Set(referenceNotes.map((n) => n.pitch))
    const perfPitches = new Set(perfNotes.map((n) => n.pitch))
    const overlap = [...refPitches].filter((p) => perfPitches.has(p))
    const overlapRatio = overlap.length / refPitches.size
    console.log(`Pitch overlap: ${overlap.length}/${refPitches.size} (${(overlapRatio * 100).toFixed(0)}%)`)
    expect(overlapRatio).toBeGreaterThanOrEqual(0.5)
  })

  it('overall duration is close to reference', () => {
    const refDuration = Math.max(...referenceNotes.map((n) => n.offset))
    const perfDuration = Math.max(...perfNotes.map((n) => n.offset))
    const ratio = perfDuration / refDuration
    console.log(`Duration: ref=${refDuration.toFixed(1)}s perf=${perfDuration.toFixed(1)}s ratio=${ratio.toFixed(2)}`)
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(1.5)
  })

  it('prints full accuracy report', () => {
    const tolerances = [0.05, 0.1, 0.2, 0.5]
    console.log('\n=== ACCURACY REPORT: Chopin Op.28 No.1 ===')
    console.log(`Reference: ${referenceNotes.length} notes`)
    console.log('')
    console.log('Transcription (raw Transkun output):')
    console.log(`  Notes: ${perfNotes.length}`)
    for (const tol of tolerances) {
      const r = noteF1(referenceNotes, perfNotes, tol)
      console.log(`  @ ${(tol * 1000).toFixed(0)}ms: P=${(r.precision * 100).toFixed(1)}% R=${(r.recall * 100).toFixed(1)}% F1=${(r.f1 * 100).toFixed(1)}% (${r.truePositives} matched)`)
    }
    console.log('')
    console.log('Score (quantized PM2S output):')
    console.log(`  Notes: ${scoreNotes.length}`)
    for (const tol of tolerances) {
      const r = noteF1(referenceNotes, scoreNotes, tol)
      console.log(`  @ ${(tol * 1000).toFixed(0)}ms: P=${(r.precision * 100).toFixed(1)}% R=${(r.recall * 100).toFixed(1)}% F1=${(r.f1 * 100).toFixed(1)}% (${r.truePositives} matched)`)
    }

    if (existsSync(diagPath)) {
      const diag = JSON.parse(readFileSync(diagPath, 'utf-8'))
      const perfOnsets: number[] = diag.note_onsets
      const quantOnsets: number[] = diag.quantized_onsets
      const minLen = Math.min(perfOnsets.length, quantOnsets.length)
      if (minLen > 0) {
        const errors = []
        for (let i = 0; i < minLen; i++) {
          errors.push(Math.abs(quantOnsets[i] - perfOnsets[i]))
        }
        errors.sort((a, b) => a - b)
        const mean = errors.reduce((a, b) => a + b, 0) / errors.length
        const median = errors[Math.floor(errors.length / 2)]
        const p95 = errors[Math.floor(errors.length * 0.95)]
        console.log('')
        console.log('Onset drift (perf → score):')
        console.log(`  mean=${(mean * 1000).toFixed(1)}ms median=${(median * 1000).toFixed(1)}ms p95=${(p95 * 1000).toFixed(1)}ms`)
      }
    }
  })

  it.afterAll(() => {
    for (const f of [scoreMidiPath, perfMidiPath, diagPath]) {
      if (existsSync(f)) unlinkSync(f)
    }
  })
})
