import { createSignal } from 'solid-js'

export type PipelineStage = 'separating' | 'transcribing' | 'quantizing' | 'loading_model' | 'preparing_audio' | 'extracting_notes' | 'writing_midi' | 'done' | null

export interface PipelineMetadata {
  key: string
  timeSignature: number[]
  tempo: number
  instruments?: string[]
}

const [stage, setStage] = createSignal<PipelineStage>(null)
const [percent, setPercent] = createSignal(0)
const [midiPath, setMidiPath] = createSignal<string | null>(null)
const [perfMidiPath, setPerfMidiPath] = createSignal<string | null>(null)
const [metadata, setMetadata] = createSignal<PipelineMetadata | null>(null)
const [error, setError] = createSignal<string | null>(null)

export const pipelineStore = {
  get stage() { return stage() },
  get percent() { return percent() },
  get midiPath() { return midiPath() },
  get perfMidiPath() { return perfMidiPath() },
  get metadata() { return metadata() },
  get error() { return error() },
}

export function updateProgress(s: string, p: number) {
  setStage(s as PipelineStage)
  setPercent(p)
}

export function setPipelineResult(meta: PipelineMetadata, midi?: string, perfMidi?: string) {
  setMetadata(meta)
  if (midi) setMidiPath(midi)
  if (perfMidi) setPerfMidiPath(perfMidi)
  setStage('done')
  setPercent(100)
}

export function setPipelineError(msg: string) {
  setError(msg)
}

export function resetPipeline() {
  setStage(null)
  setPercent(0)
  setMidiPath(null)
  setPerfMidiPath(null)
  setMetadata(null)
  setError(null)
}

export { stage, percent, midiPath, perfMidiPath, metadata, error }
