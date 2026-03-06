import { execFile } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const AUDIO2SHEETS_DIR = join(homedir(), '.audio2sheets')
const VENV_DIR = join(AUDIO2SHEETS_DIR, 'venv')
const PM2S_DIR = join(AUDIO2SHEETS_DIR, 'pm2s')
const PYTHON_CANDIDATES = platform() === 'win32'
  ? ['python', 'python3', 'py']
  : ['python3.11', 'python3.12', 'python3.10', 'python3', 'python']

const MIN_PYTHON_VERSION = [3, 10]

function getVenvPython(): string {
  if (platform() === 'win32') {
    return join(VENV_DIR, 'Scripts', 'python.exe')
  }
  return join(VENV_DIR, 'bin', 'python')
}

async function findSystemPython(): Promise<string> {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'])
      const match = stdout.trim().match(/Python (\d+)\.(\d+)/)
      if (match) {
        const major = parseInt(match[1])
        const minor = parseInt(match[2])
        if (major === MIN_PYTHON_VERSION[0] &&
            minor >= MIN_PYTHON_VERSION[1]) {
          return candidate
        }
      }
    } catch {}
  }
  throw new Error(
    `Python ${MIN_PYTHON_VERSION.join('.')}+ is required but not found. Install from https://python.org`
  )
}

const PM2S_MODELS: Record<string, string> = {
  'beat/RNNJointBeatModel.pth': 'https://zenodo.org/records/10520196/files/RNNJointBeatModel.pth?download=1',
  'quantisation/RNNJointQuantisationModel.pth': 'https://zenodo.org/records/10520196/files/RNNJointQuantisationModel.pth?download=1',
  'hand_part/RNNHandPartModel.pth': 'https://zenodo.org/records/10520196/files/RNNHandPartModel.pth?download=1',
  'key_signature/RNNKeySignatureModel.pth': 'https://zenodo.org/records/10520196/files/RNNKeySignatureModel.pth?download=1',
  'time_signature/CNNTimeSignatureModel.pth': 'https://zenodo.org/records/10520196/files/CNNTimeSignatureModel.pth?download=1',
}

async function downloadPM2SModels(): Promise<void> {
  const modelsDir = join(PM2S_DIR, 'pm2s', '_model_state_dicts')
  for (const [relPath, url] of Object.entries(PM2S_MODELS)) {
    const destPath = join(modelsDir, relPath)
    if (existsSync(destPath)) continue
    mkdirSync(join(destPath, '..'), { recursive: true })
    await execFileAsync('curl', ['-L', '-o', destPath, url], {
      timeout: 120_000,
    })
  }
}

export async function ensurePM2S(): Promise<string> {
  if (existsSync(join(PM2S_DIR, 'pm2s'))) {
    await downloadPM2SModels()
    return PM2S_DIR
  }

  mkdirSync(AUDIO2SHEETS_DIR, { recursive: true })

  await execFileAsync('git', ['clone', 'https://github.com/cheriell/PM2S.git', PM2S_DIR], {
    timeout: 120_000,
  })

  await downloadPM2SModels()

  return PM2S_DIR
}

export async function ensureVenv(requirementsPath: string): Promise<string> {
  const venvPython = getVenvPython()

  if (existsSync(venvPython)) {
    return venvPython
  }

  const systemPython = await findSystemPython()

  mkdirSync(AUDIO2SHEETS_DIR, { recursive: true })

  await execFileAsync(systemPython, ['-m', 'venv', VENV_DIR])
  await execFileAsync(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
    maxBuffer: 10 * 1024 * 1024,
  })
  await execFileAsync(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 600_000,
  })

  await ensurePM2S()

  return venvPython
}

export async function reinstallDeps(requirementsPath: string): Promise<void> {
  const venvPython = getVenvPython()
  if (!existsSync(venvPython)) {
    throw new Error('Venv does not exist. Run ensureVenv first.')
  }
  await execFileAsync(venvPython, ['-m', 'pip', 'install', '--upgrade', '-r', requirementsPath], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 600_000,
  })
}

export function getPM2SDir(): string {
  return PM2S_DIR
}
