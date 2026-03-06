import { createSignal } from 'solid-js'

export type PipelineStage = 'separating' | 'transcribing' | 'quantizing' | 'generating' | 'done' | null

export interface PipelineMetadata {
  key: string
  timeSignature: number[]
  tempo: number
}

const [stage, setStage] = createSignal<PipelineStage>(null)
const [percent, setPercent] = createSignal(0)
const [musicxml, setMusicxml] = createSignal<string | null>(null)
const [midiPath, setMidiPath] = createSignal<string | null>(null)
const [perfMidiPath, setPerfMidiPath] = createSignal<string | null>(null)
const [metadata, setMetadata] = createSignal<PipelineMetadata | null>(null)
const [error, setError] = createSignal<string | null>(null)

export const pipelineStore = {
  get stage() { return stage() },
  get percent() { return percent() },
  get musicxml() { return musicxml() },
  get midiPath() { return midiPath() },
  get perfMidiPath() { return perfMidiPath() },
  get metadata() { return metadata() },
  get error() { return error() },
}

export function updateProgress(s: string, p: number) {
  setStage(s as PipelineStage)
  setPercent(p)
}

export function setPipelineResult(xml: string, meta: PipelineMetadata, midi?: string, perfMidi?: string) {
  setMusicxml(xml)
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
  setMusicxml(null)
  setMidiPath(null)
  setPerfMidiPath(null)
  setMetadata(null)
  setError(null)
}

export { stage, percent, musicxml, midiPath, perfMidiPath, metadata, error }
