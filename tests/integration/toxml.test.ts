import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hasVenv, runPythonScript } from '../helpers'

describe.skipIf(!hasVenv())('toxml.py', () => {
  it('converts quantized JSON to valid MusicXML', async () => {
    const input = join(tmpdir(), 'test-toxml-input.json')
    const output = join(tmpdir(), 'test-toxml-output.musicxml')

    const quantizedData = {
      parts: [
        {
          name: 'Piano',
          notes: [
            { pitch: 60, onset: 0, duration: 480, voice: 1, staff: 1 },
            { pitch: 62, onset: 480, duration: 480, voice: 1, staff: 1 },
            { pitch: 64, onset: 960, duration: 480, voice: 1, staff: 1 },
          ],
        },
      ],
    }

    try {
      writeFileSync(input, JSON.stringify(quantizedData))
      await runPythonScript('toxml', [input, '-o', output])

      expect(existsSync(output)).toBe(true)
      const xml = readFileSync(output, 'utf-8')
      expect(xml).toContain('<note')
      expect(xml).toContain('<score-partwise')
    } finally {
      if (existsSync(input)) unlinkSync(input)
      if (existsSync(output)) unlinkSync(output)
    }
  })
})
