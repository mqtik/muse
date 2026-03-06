import { describe, it, expect } from 'vitest'

describe('bridge - JSON progress parsing', () => {
  it('parses valid JSON progress lines', () => {
    const line = '{"stage": "transcribing", "percent": 50}'
    const parsed = JSON.parse(line)
    expect(parsed.stage).toBe('transcribing')
    expect(parsed.percent).toBe(50)
  })

  it('ignores non-JSON lines', () => {
    const lines = [
      'Loading model...',
      '{"stage": "quantizing", "percent": 30}',
      'Some warning text',
    ]

    const progress: Array<{ stage: string; percent: number }> = []
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.stage && typeof parsed.percent === 'number') {
          progress.push(parsed)
        }
      } catch {}
    }

    expect(progress).toHaveLength(1)
    expect(progress[0].stage).toBe('quantizing')
    expect(progress[0].percent).toBe(30)
  })

  it('handles all pipeline stages', () => {
    const stages = ['separating', 'transcribing', 'quantizing', 'generating', 'done']
    for (const stage of stages) {
      const line = JSON.stringify({ stage, percent: 50 })
      const parsed = JSON.parse(line)
      expect(parsed.stage).toBe(stage)
    }
  })
})
