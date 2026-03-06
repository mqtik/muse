import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hasVenv, runPythonScript, fixture } from '../helpers'

describe.skipIf(!hasVenv())('transcribe.py', () => {
  it('transcribes single-c4.wav to ~1 note near pitch 60', async () => {
    const output = join(tmpdir(), 'test-transcribe-c4.json')
    try {
      await runPythonScript('transcribe', [fixture('single-c4.wav'), '-o', output])

      expect(existsSync(output)).toBe(true)
      const data = JSON.parse(readFileSync(output, 'utf-8'))
      expect(data.noteCount).toBeGreaterThanOrEqual(1)
      expect(data.notes.length).toBeGreaterThanOrEqual(1)

      const pitches = data.notes.map((n: any) => n.pitch)
      const nearC4 = pitches.some((p: number) => Math.abs(p - 60) <= 1)
      expect(nearC4).toBe(true)
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })

  it('transcribes silence-2s.wav to 0 notes', async () => {
    const output = join(tmpdir(), 'test-transcribe-silence.json')
    try {
      await runPythonScript('transcribe', [fixture('silence-2s.wav'), '-o', output])

      expect(existsSync(output)).toBe(true)
      const data = JSON.parse(readFileSync(output, 'utf-8'))
      expect(data.noteCount).toBe(0)
      expect(data.notes).toHaveLength(0)
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })

  it('supports --onset-threshold and --frame-threshold args', async () => {
    const output = join(tmpdir(), 'test-transcribe-thresholds.json')
    try {
      await runPythonScript('transcribe', [
        fixture('single-c4.wav'),
        '-o', output,
        '--onset-threshold', '0.6',
        '--frame-threshold', '0.4',
      ])

      expect(existsSync(output)).toBe(true)
      const data = JSON.parse(readFileSync(output, 'utf-8'))
      expect(data).toHaveProperty('notes')
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })
})
