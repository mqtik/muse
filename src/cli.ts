#!/usr/bin/env node

import { resolve, basename, extname } from 'path'
import { existsSync } from 'fs'
import { convertAudioToSheet } from './convert'
import { ensureVenv, reinstallDeps } from './python-manager'
import { runPythonScript } from './bridge'
import { REQUIREMENTS_PATH, PYTHON_DIR } from './paths'

const SUPPORTED_FORMATS = ['.mp3', '.wav', '.ogg', '.flac']

const COMMANDS: Record<string, string> = {
  convert:    'Full pipeline: audio → MusicXML (default)',
  transcribe: 'Audio → raw note events (JSON)',
  quantize:   'Note events JSON → quantized score (JSON)',
  toxml:      'Quantized score JSON → MusicXML',
  separate:   'Audio → stem WAV files (Demucs)',
  setup:      'Force (re)install Python dependencies',
  info:       'Show venv path, installed packages, GPU info',
}

function printUsage() {
  console.log(`
audio2sheets - Convert audio files to sheet music

Usage:
  audio2sheets <input.mp3> [-o output.musicxml]    Full pipeline (default)
  audio2sheets <command> [args]                     Run a specific stage

Commands:`)
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(14)} ${desc}`)
  }
  console.log(`
Options:
  -o, --output <path>   Output file path
  --json                Output raw JSON instead of formatted text
  -h, --help            Show this help
  --version             Show version

Examples:
  audio2sheets song.mp3                            Full pipeline → song.musicxml
  audio2sheets song.mp3 -o score.musicxml          Full pipeline with custom output
  audio2sheets transcribe song.mp3                 Just transcription → notes JSON
  audio2sheets transcribe song.mp3 -o notes.json   Save transcription to file
  audio2sheets quantize notes.json -o score.json   Quantize note events
  audio2sheets toxml score.json -o sheet.musicxml  Generate MusicXML from score
  audio2sheets separate song.mp3 -o ./stems/       Separate into stems
  audio2sheets setup                               Reinstall Python deps
  audio2sheets info                                Show environment info
`)
}

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

function isAudioFile(path: string): boolean {
  return SUPPORTED_FORMATS.includes(extname(path).toLowerCase())
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2))

  if (flags.version) {
    const pkg = require('../package.json')
    console.log(pkg.version)
    process.exit(0)
  }

  if (flags.help || positional.length === 0) {
    printUsage()
    process.exit(0)
  }

  const first = positional[0]
  const command = COMMANDS[first] ? first : 'convert'
  const inputArgs = command === first ? positional.slice(1) : positional
  const inputPath = inputArgs[0] ? resolve(inputArgs[0]) : ''
  const outputPath = flags.output ? resolve(flags.output as string) : ''

  try {
    switch (command) {
      case 'setup': {
        console.log('[audio2sheets] Installing Python dependencies...')
        const venv = await ensureVenv(REQUIREMENTS_PATH)
        await reinstallDeps(REQUIREMENTS_PATH)
        console.log(`[audio2sheets] Done. Venv: ${venv}`)
        break
      }

      case 'info': {
        const venv = await ensureVenv(REQUIREMENTS_PATH)
        const result = await runPythonScript(venv, PYTHON_DIR, 'info')
        console.log(result)
        break
      }

      case 'transcribe': {
        requireInput(inputPath)
        const out = outputPath || resolve(basename(inputPath, extname(inputPath)) + '.notes.json')
        console.log(`[audio2sheets] Transcribing ${basename(inputPath)}...`)
        const venv = await ensureVenv(REQUIREMENTS_PATH)
        const result = await runPythonScript(venv, PYTHON_DIR, 'transcribe', inputPath, out)
        console.log(result || `[audio2sheets] Done → ${out}`)
        break
      }

      case 'quantize': {
        requireInput(inputPath)
        const out = outputPath || resolve(basename(inputPath, extname(inputPath)) + '.quantized.json')
        console.log(`[audio2sheets] Quantizing ${basename(inputPath)}...`)
        const venv = await ensureVenv(REQUIREMENTS_PATH)
        const result = await runPythonScript(venv, PYTHON_DIR, 'quantize', inputPath, out)
        console.log(result || `[audio2sheets] Done → ${out}`)
        break
      }

      case 'toxml': {
        requireInput(inputPath)
        const out = outputPath || resolve(basename(inputPath, extname(inputPath)) + '.musicxml')
        console.log(`[audio2sheets] Generating MusicXML from ${basename(inputPath)}...`)
        const venv = await ensureVenv(REQUIREMENTS_PATH)
        const result = await runPythonScript(venv, PYTHON_DIR, 'toxml', inputPath, out)
        console.log(result || `[audio2sheets] Done → ${out}`)
        break
      }

      case 'separate': {
        requireInput(inputPath)
        const out = outputPath || resolve('stems')
        console.log(`[audio2sheets] Separating ${basename(inputPath)}...`)
        const venv = await ensureVenv(REQUIREMENTS_PATH)
        const result = await runPythonScript(venv, PYTHON_DIR, 'separate', inputPath, out)
        console.log(result || `[audio2sheets] Done → ${out}/`)
        break
      }

      case 'convert':
      default: {
        requireInput(inputPath)
        const ext = extname(inputPath).toLowerCase()
        if (!SUPPORTED_FORMATS.includes(ext)) {
          console.error(`Unsupported format: ${ext}. Supported: ${SUPPORTED_FORMATS.join(', ')}`)
          process.exit(1)
        }

        const out = outputPath || resolve(basename(inputPath, extname(inputPath)) + '.musicxml')
        console.log(`[audio2sheets] Processing ${basename(inputPath)}...`)

        await convertAudioToSheet(inputPath, out, {
          onProgress: (stage, percent) => {
            process.stdout.write(`\r[audio2sheets] ${stage}... ${percent}%`)
          },
        })

        console.log(`\n[audio2sheets] Done → ${out}`)
        break
      }
    }
  } catch (err: any) {
    console.error(`\n[audio2sheets] Error: ${err.message}`)
    process.exit(1)
  }
}

function requireInput(inputPath: string) {
  if (!inputPath) {
    console.error('[audio2sheets] Missing input file.')
    process.exit(1)
  }
  if (!existsSync(inputPath)) {
    console.error(`[audio2sheets] File not found: ${inputPath}`)
    process.exit(1)
  }
}

main()
