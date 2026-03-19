import { invoke } from '@tauri-apps/api/core'
import type { PipelineMetadata } from '../stores/pipelineStore'

interface PipelineResultRaw {
  metadata: PipelineMetadata
  midi_path: string | null
  perf_midi_path: string | null
}

export function startPipeline(input: string, backend = 'transkun', soloPiano = false): Promise<PipelineResultRaw> {
  return invoke<PipelineResultRaw>('start_pipeline', { input, backend, soloPiano })
}

export function saveRecording(bytes: number[]): Promise<string> {
  return invoke<string>('save_recording', { bytes: Array.from(bytes) })
}
