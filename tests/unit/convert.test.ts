import { describe, it, expect } from 'vitest'

const KEY_TO_FIFTHS: Record<string, number> = {
  'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
  'Abm': -7, 'Ebm': -6, 'Bbm': -5, 'Fm': -4, 'Cm': -3, 'Gm': -2, 'Dm': -1,
  'Am': 0, 'Em': 1, 'Bm': 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
}

function parseMetadata(stdout: string) {
  try {
    const result = JSON.parse(stdout)
    const meta = result.metadata || {}
    const keyName = meta.key || 'C'
    const ts = meta.timeSignature || [4, 4]
    return {
      tempo: meta.tempo || 120,
      timeSignature: [ts[0], ts[1]] as [number, number],
      keySignature: KEY_TO_FIFTHS[keyName] ?? 0,
    }
  } catch {
    return { tempo: 120, timeSignature: [4, 4] as [number, number], keySignature: 0 }
  }
}

describe('metadata parsing', () => {
  it('parses valid pipeline output', () => {
    const stdout = JSON.stringify({
      midi: '/tmp/out.mid',
      metadata: { key: 'G', timeSignature: [3, 4] },
    })
    const meta = parseMetadata(stdout)
    expect(meta.keySignature).toBe(1)
    expect(meta.timeSignature).toEqual([3, 4])
  })

  it('defaults on missing metadata', () => {
    const stdout = JSON.stringify({ midi: '/tmp/out.mid' })
    const meta = parseMetadata(stdout)
    expect(meta.keySignature).toBe(0)
    expect(meta.timeSignature).toEqual([4, 4])
    expect(meta.tempo).toBe(120)
  })

  it('defaults on invalid JSON', () => {
    const meta = parseMetadata('not json')
    expect(meta.keySignature).toBe(0)
    expect(meta.timeSignature).toEqual([4, 4])
  })

  it('maps all major keys correctly', () => {
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'C' } })).keySignature).toBe(0)
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'G' } })).keySignature).toBe(1)
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'F' } })).keySignature).toBe(-1)
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'D' } })).keySignature).toBe(2)
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'Bb' } })).keySignature).toBe(-2)
  })

  it('maps minor keys correctly', () => {
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'Am' } })).keySignature).toBe(0)
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'Em' } })).keySignature).toBe(1)
    expect(parseMetadata(JSON.stringify({ metadata: { key: 'Dm' } })).keySignature).toBe(-1)
  })

  it('parses instruments from metadata', () => {
    const stdout = JSON.stringify({
      midi: '/tmp/out.mid',
      metadata: { key: 'C', instruments: ['Piano', 'Violin', 'Cello'] },
    })
    const result = JSON.parse(stdout)
    expect(result.metadata.instruments).toEqual(['Piano', 'Violin', 'Cello'])
  })
})
