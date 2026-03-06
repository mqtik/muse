import { describe, it, expect } from 'vitest'

function parseArgs(args: string[]) {
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-o' || arg === '--output') {
      flags.output = args[++i]
    } else if (arg === '--json') {
      flags.json = true
    } else if (arg === '-h' || arg === '--help') {
      flags.help = true
    } else if (arg === '--version') {
      flags.version = true
    } else if (!arg.startsWith('-')) {
      positional.push(arg)
    }
  }

  return { flags, positional }
}

describe('CLI arg parsing', () => {
  it('parses input file as positional', () => {
    const { positional } = parseArgs(['song.mp3'])
    expect(positional).toEqual(['song.mp3'])
  })

  it('parses -o flag', () => {
    const { flags } = parseArgs(['song.mp3', '-o', 'out.musicxml'])
    expect(flags.output).toBe('out.musicxml')
  })

  it('parses --output flag', () => {
    const { flags } = parseArgs(['song.mp3', '--output', 'out.musicxml'])
    expect(flags.output).toBe('out.musicxml')
  })

  it('parses --help flag', () => {
    const { flags } = parseArgs(['--help'])
    expect(flags.help).toBe(true)
  })

  it('parses --version flag', () => {
    const { flags } = parseArgs(['--version'])
    expect(flags.version).toBe(true)
  })

  it('parses --json flag', () => {
    const { flags } = parseArgs(['song.mp3', '--json'])
    expect(flags.json).toBe(true)
  })

  it('parses command + input', () => {
    const { positional } = parseArgs(['transcribe', 'song.mp3'])
    expect(positional).toEqual(['transcribe', 'song.mp3'])
  })

  it('handles no args', () => {
    const { flags, positional } = parseArgs([])
    expect(positional).toEqual([])
    expect(Object.keys(flags)).toHaveLength(0)
  })
})
