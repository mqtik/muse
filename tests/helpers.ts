import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

export const execFileAsync = promisify(execFile)

export const FIXTURES_DIR = join(__dirname, 'fixtures')
export const PYTHON_DIR = join(__dirname, '..', 'python')

const VENV_PYTHON = join(homedir(), '.audio2sheets', 'venv', 'bin', 'python')
const PM2S_DIR = join(homedir(), '.audio2sheets', 'pm2s')

export function hasVenv(): boolean {
  return existsSync(VENV_PYTHON)
}

export function hasPM2S(): boolean {
  return existsSync(join(PM2S_DIR, 'pm2s'))
}

export function getVenvPython(): string {
  return VENV_PYTHON
}

export function fixture(name: string): string {
  return join(FIXTURES_DIR, name)
}

export async function runPythonScript(
  scriptName: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(VENV_PYTHON, [join(PYTHON_DIR, `${scriptName}.py`), ...args], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  })
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  const { stdout } = await execFileAsync(VENV_PYTHON, [
    '-c',
    `import librosa; print(librosa.get_duration(path="${audioPath}"))`,
  ])
  return parseFloat(stdout.trim())
}

export async function getMidiDuration(midiPath: string): Promise<number> {
  const { stdout } = await execFileAsync(VENV_PYTHON, [
    '-c',
    `import pretty_midi; pm = pretty_midi.PrettyMIDI("${midiPath}"); print(max(n.end for i in pm.instruments for n in i.notes))`,
  ])
  return parseFloat(stdout.trim())
}

export function parseLastJson(stdout: string): any {
  const lines = stdout.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i])
    } catch {}
  }
  throw new Error(`No valid JSON found in stdout: ${stdout.slice(0, 200)}`)
}
