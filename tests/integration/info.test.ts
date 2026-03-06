import { describe, it, expect } from 'vitest'
import { hasVenv, runPythonScript } from '../helpers'

describe.skipIf(!hasVenv())('info.py', () => {
  it('returns valid JSON with environment info', async () => {
    const { stdout } = await runPythonScript('info')
    const info = JSON.parse(stdout)

    expect(info.python).toBeDefined()
    expect(info.platform).toBeDefined()
    expect(info.venv).toBeDefined()
    expect(info).toHaveProperty('basic_pitch')
    expect(info).toHaveProperty('partitura')
    expect(info).toHaveProperty('torch')
    expect(info).toHaveProperty('pm2s')
  })
})
