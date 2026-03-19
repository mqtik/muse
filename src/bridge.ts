import { spawn } from 'child_process'
import { join } from 'path'

export interface PipelineProgress {
  stage: string
  percent: number
}

export function runPipeline(
  venvPython: string,
  pythonDir: string,
  inputPath: string,
  onProgress?: (progress: PipelineProgress) => void,
  backend?: string,
): Promise<string> {
  const extraArgs = backend ? ['--backend', backend] : []
  return runPythonScript(venvPython, pythonDir, 'pipeline', inputPath, undefined, onProgress, extraArgs)
}

export function runPythonScript(
  venvPython: string,
  pythonDir: string,
  scriptName: string,
  inputPath?: string,
  outputPath?: string,
  onProgress?: (progress: PipelineProgress) => void,
  extraArgs?: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(pythonDir, `${scriptName}.py`)
    const args = [scriptPath]
    if (inputPath) args.push(inputPath)
    if (outputPath) args.push('-o', outputPath)
    if (extraArgs) args.push(...extraArgs)

    const proc = spawn(venvPython, args)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk

      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.stage && typeof parsed.percent === 'number') {
            onProgress?.(parsed)
          }
        } catch {}
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        const errMsg = stderr
          .split('\n')
          .filter((l) => !l.startsWith('{'))
          .join('\n')
          .trim()
        reject(new Error(errMsg || `Python exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`))
    })
  })
}
