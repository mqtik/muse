import { readFileSync } from 'fs'
import { ensureVenv } from './python-manager'
import { runPipeline } from './bridge'
import { REQUIREMENTS_PATH, PYTHON_DIR } from './paths'
import type { Audio2SheetsOptions, Audio2SheetsResult, ScoreMetadata } from './types'

const KEY_TO_FIFTHS: Record<string, number> = {
  'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
  'Abm': -7, 'Ebm': -6, 'Bbm': -5, 'Fm': -4, 'Cm': -3, 'Gm': -2, 'Dm': -1,
  'Am': 0, 'Em': 1, 'Bm': 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
}

function parseMetadata(stdout: string): ScoreMetadata {
  const lines = stdout.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const result = JSON.parse(lines[i])
      if (result.metadata) {
        const meta = result.metadata
        const keyName = meta.key || 'C'
        const ts = meta.timeSignature || [4, 4]
        return {
          tempo: meta.tempo || 120,
          timeSignature: [ts[0], ts[1]] as [number, number],
          keySignature: KEY_TO_FIFTHS[keyName] ?? 0,
        }
      }
    } catch {}
  }
  return { tempo: 120, timeSignature: [4, 4], keySignature: 0 }
}

export async function convertAudioToSheet(
  inputPath: string,
  outputPath: string,
  options: Audio2SheetsOptions = {},
): Promise<Audio2SheetsResult> {
  const venvPython = await ensureVenv(REQUIREMENTS_PATH)

  const stdout = await runPipeline(venvPython, PYTHON_DIR, inputPath, outputPath, (progress) => {
    options.onProgress?.(progress.stage as any, progress.percent)
  })

  const musicxml = readFileSync(outputPath, 'utf-8')
  const metadata = parseMetadata(stdout)

  return {
    musicxml,
    stems: ['piano'],
    metadata,
  }
}
