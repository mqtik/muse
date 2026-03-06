export type ProgressStage = 'separating' | 'transcribing' | 'quantizing' | 'generating' | 'done'

export interface Audio2SheetsOptions {
  onProgress?: (stage: ProgressStage, percent: number) => void
}

export interface Audio2SheetsResult {
  musicxml: string
  stems: string[]
  metadata: ScoreMetadata
}

export interface ScoreMetadata {
  tempo: number
  timeSignature: [number, number]
  keySignature: number
}
