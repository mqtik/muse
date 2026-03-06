import { listen, type UnlistenFn } from '@tauri-apps/api/event'

interface PipelineProgress {
  stage: string
  percent: number
}

export function onPipelineProgress(callback: (progress: PipelineProgress) => void): Promise<UnlistenFn> {
  return listen<PipelineProgress>('pipeline:progress', (event) => {
    callback(event.payload)
  })
}
