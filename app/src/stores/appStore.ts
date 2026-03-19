import { createSignal } from 'solid-js'

export type AppView = 'upload' | 'recording' | 'processing' | 'result'

export type Backend = 'transkun' | 'yourmt3'

const [view, setView] = createSignal<AppView>('upload')
const [inputPath, setInputPath] = createSignal<string | null>(null)
const [inputName, setInputName] = createSignal<string | null>(null)
const [audioUrl, setAudioUrl] = createSignal<string | null>(null)
const [backend, setBackend] = createSignal<Backend>('transkun')

interface PendingPreview {
  path: string
  name: string
  audioUrl: string
}

const [pendingPreview, setPendingPreviewSignal] = createSignal<PendingPreview | null>(null)

export const appStore = {
  get view() { return view() },
  get inputPath() { return inputPath() },
  get inputName() { return inputName() },
  get audioUrl() { return audioUrl() },
  get backend() { return backend() },
}

export function navigateTo(v: AppView) {
  setView(v)
}

export function setInput(path: string, name: string, url?: string) {
  setInputPath(path)
  setInputName(name)
  if (url) setAudioUrl(url)
}

export function setActiveBackend(b: Backend) {
  setBackend(b)
}

export function setPendingPreview(path: string, name: string, audioUrl: string) {
  setPendingPreviewSignal({ path, name, audioUrl })
}

export function clearPendingPreview() {
  setPendingPreviewSignal(null)
}

export function resetApp() {
  setView('upload')
  setInputPath(null)
  setInputName(null)
  setAudioUrl(null)
  setBackend('transkun')
}

export { view, audioUrl, backend, pendingPreview }
