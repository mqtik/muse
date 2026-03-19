export type ProgressStage = 'separating' | 'transcribing' | 'quantizing' | 'done'

export type Backend = 'transkun' | 'yourmt3'

export interface Audio2SheetsOptions {
  backend?: Backend
  onProgress?: (stage: ProgressStage, percent: number) => void
}

export interface Audio2SheetsResult {
  midi: string
  perfMidi: string
  metadata: ScoreMetadata
}

export interface ScoreMetadata {
  tempo: number
  timeSignature: [number, number]
  keySignature: number
}
