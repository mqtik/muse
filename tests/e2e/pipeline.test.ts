import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hasVenv, hasPM2S, runPythonScript, fixture, parseLastJson } from '../helpers'

const HAS_FULL_STACK = hasVenv() && hasPM2S()

describe.skipIf(!HAS_FULL_STACK)('pipeline.py (e2e)', () => {
  it('converts single-c4.wav to valid MusicXML', async () => {
    const output = join(tmpdir(), 'test-pipeline-c4.musicxml')
    try {
      const { stdout } = await runPythonScript('pipeline', [
        fixture('single-c4.wav'), '-o', output,
      ])

      expect(existsSync(output)).toBe(true)
      const xml = readFileSync(output, 'utf-8')
      expect(xml).toContain('<score-partwise')
      expect(xml).toContain('<note')

      const result = parseLastJson(stdout)
      expect(result.output).toBe(output)
      expect(result.metadata).toBeDefined()
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })

  it('converts c-major-scale.wav to MusicXML with multiple notes', async () => {
    const output = join(tmpdir(), 'test-pipeline-scale.musicxml')
    try {
      await runPythonScript('pipeline', [
        fixture('c-major-scale.wav'), '-o', output,
      ])

      expect(existsSync(output)).toBe(true)
      const xml = readFileSync(output, 'utf-8')
      const noteCount = (xml.match(/<note/g) || []).length
      expect(noteCount).toBeGreaterThanOrEqual(4)
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })

  it('converts two-hands.wav with notes in multiple parts', async () => {
    const output = join(tmpdir(), 'test-pipeline-hands.musicxml')
    try {
      await runPythonScript('pipeline', [
        fixture('two-hands.wav'), '-o', output,
      ])

      expect(existsSync(output)).toBe(true)
      const xml = readFileSync(output, 'utf-8')
      expect(xml).toContain('<score-partwise')

      const partCount = (xml.match(/<part /g) || []).length
      expect(partCount).toBeGreaterThanOrEqual(1)
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })

  it('returns metadata with key and time signature', async () => {
    const output = join(tmpdir(), 'test-pipeline-meta.musicxml')
    try {
      const { stdout } = await runPythonScript('pipeline', [
        fixture('c-major-chord.wav'), '-o', output,
      ])

      const result = parseLastJson(stdout)
      expect(result.metadata).toBeDefined()
      expect(result.metadata.key).toBeDefined()
      expect(result.metadata.timeSignature).toBeDefined()
      expect(result.metadata.timeSignature).toHaveLength(2)
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })
})
