import { describe, it, expect } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileAsync, hasVenv, hasPM2S, fixture } from '../helpers'

const CLI_PATH = join(__dirname, '..', '..', 'dist', 'cli.js')
const HAS_FULL_STACK = hasVenv() && hasPM2S()

describe('CLI', () => {
  it('shows help with --help', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--help'])
    expect(stdout).toContain('audio2sheets')
    expect(stdout).toContain('Usage')
    expect(stdout).toContain('Commands')
  })

  it('shows version with --version', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--version'])
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('exits with error for nonexistent file', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, '/nonexistent/file.mp3'])
      expect.unreachable('should have thrown')
    } catch (err: any) {
      expect(err.stderr || err.stdout).toContain('not found')
    }
  })
})

describe.skipIf(!HAS_FULL_STACK)('CLI e2e', () => {
  it('converts fixture WAV to MusicXML', async () => {
    const output = join(tmpdir(), 'test-cli-e2e.musicxml')
    try {
      await execFileAsync('node', [CLI_PATH, fixture('single-c4.wav'), '-o', output], {
        timeout: 120_000,
      })
      expect(existsSync(output)).toBe(true)
    } finally {
      if (existsSync(output)) unlinkSync(output)
    }
  })

  it('info command returns JSON', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, 'info'], {
      timeout: 60_000,
    })
    const info = JSON.parse(stdout.trim())
    expect(info.python).toBeDefined()
  })
})
