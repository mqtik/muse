import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hasVenv, hasPM2S, runPythonScript } from '../helpers'

const HAS_FULL_STACK = hasVenv() && hasPM2S()

describe.skipIf(!HAS_FULL_STACK)('quantize.py', () => {
  it('quantizes note events to parts with hand assignment', async () => {
    const input = join(tmpdir(), 'test-quantize-input.json')
    const output = join(tmpdir(), 'test-quantize-output.json')

    const noteEvents = {
      noteCount: 8,
      notes: [
        { startTime: 0.1, duration: 0.4, pitch: 60, velocity: 0.8 },
        { startTime: 0.5, duration: 0.4, pitch: 62, velocity: 0.7 },
        { startTime: 1.0, duration: 0.4, pitch: 64, velocity: 0.75 },
        { startTime: 1.5, duration: 0.4, pitch: 65, velocity: 0.8 },
        { startTime: 2.0, duration: 0.4, pitch: 67, velocity: 0.7 },
        { startTime: 2.5, duration: 0.4, pitch: 69, velocity: 0.75 },
        { startTime: 3.0, duration: 0.4, pitch: 71, velocity: 0.8 },
        { startTime: 3.5, duration: 0.4, pitch: 72, velocity: 0.7 },
      ],
    }

    try {
      writeFileSync(input, JSON.stringify(noteEvents))
      await runPythonScript('quantize', [input, '-o', output])

      expect(existsSync(output)).toBe(true)
      const data = JSON.parse(readFileSync(output, 'utf-8'))
      expect(data.parts).toBeDefined()
      expect(data.parts.length).toBeGreaterThanOrEqual(1)

      const allNotes = data.parts.flatMap((p: any) => p.notes)
      expect(allNotes.length).toBeGreaterThanOrEqual(1)

      for (const note of allNotes) {
        expect(note).toHaveProperty('pitch')
        expect(note).toHaveProperty('onset')
        expect(note).toHaveProperty('duration')
        expect(note).toHaveProperty('staff')
      }
    } finally {
      if (existsSync(input)) unlinkSync(input)
      if (existsSync(output)) unlinkSync(output)
    }
  })
})
