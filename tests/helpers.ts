import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parseMidiBytes, type MidiNote } from '../app/src/lib/parseMidi'

export const execFileAsync = promisify(execFile)

export const FIXTURES_DIR = join(__dirname, 'fixtures')
export const PYTHON_DIR = join(__dirname, '..', 'python')

const VENV_PYTHON = join(homedir(), '.audio2sheets', 'venv', 'bin', 'python')
const PM2S_DIR = join(homedir(), '.audio2sheets', 'pm2s')
const YOURMT3_DIR = join(__dirname, '..', 'yourmt3')

export function hasVenv(): boolean {
  return existsSync(VENV_PYTHON)
}

export function hasPM2S(): boolean {
  return existsSync(join(PM2S_DIR, 'pm2s'))
}

export function hasYourMT3(): boolean {
  return existsSync(join(YOURMT3_DIR, 'amt', 'src', 'model', 'ymt3.py'))
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
  timeout = 120_000,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(VENV_PYTHON, [join(PYTHON_DIR, `${scriptName}.py`), ...args], {
    maxBuffer: 10 * 1024 * 1024,
    timeout,
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

export const TEST_ENV = {
  hasVenv: hasVenv(),
  hasPM2S: hasPM2S(),
  hasYourMT3: hasYourMT3(),
  hasFullStack: hasVenv() && hasPM2S(),
}

export function getMidiOutputPaths(audioPath: string): { score: string; perf: string } {
  const base = audioPath.replace(/\.[^.]+$/, '')
  return { score: `${base}.mid`, perf: `${base}.perf.mid` }
}

export function tempPath(name: string, ext = 'json'): string {
  return join(tmpdir(), `test-${name}-${Date.now()}.${ext}`)
}

export function loadMidi(path: string) {
  return parseMidiBytes(new Uint8Array(readFileSync(path)))
}

export function cleanupFiles(...paths: string[]) {
  for (const p of paths) {
    if (existsSync(p)) unlinkSync(p)
  }
}

export function validateMidiNotes(notes: MidiNote[], label: string) {
  const zeroDuration = notes.filter((n) => n.endTime - n.startTime <= 0)
  if (zeroDuration.length > 0)
    throw new Error(`[${label}] ${zeroDuration.length} zero-duration notes`)

  const badPitch = notes.filter((n) => n.pitch < 0 || n.pitch > 127)
  if (badPitch.length > 0)
    throw new Error(`[${label}] ${badPitch.length} notes with invalid pitch`)

  const badVel = notes.filter((n) => n.velocity < 1 || n.velocity > 127)
  if (badVel.length > 0)
    throw new Error(`[${label}] ${badVel.length} notes with invalid velocity`)
}

export interface NoteMatchResult {
  precision: number
  recall: number
  f1: number
  truePositives: number
  refCount: number
  estCount: number
}

export function matchNotes(
  reference: { pitch: number; onset: number }[],
  estimated: { pitch: number; onset: number }[],
  onsetTolerance: number,
): NoteMatchResult {
  const matched = new Set<number>()
  let truePositives = 0
  for (const ref of reference) {
    for (let i = 0; i < estimated.length; i++) {
      if (matched.has(i)) continue
      if (estimated[i].pitch === ref.pitch && Math.abs(estimated[i].onset - ref.onset) <= onsetTolerance) {
        truePositives++
        matched.add(i)
        break
      }
    }
  }
  const precision = estimated.length > 0 ? truePositives / estimated.length : 0
  const recall = reference.length > 0 ? truePositives / reference.length : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1, truePositives, refCount: reference.length, estCount: estimated.length }
}
