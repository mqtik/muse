import { createSignal } from 'solid-js'

export type AppView = 'upload' | 'recording' | 'processing' | 'result'

const [view, setView] = createSignal<AppView>('upload')
const [inputPath, setInputPath] = createSignal<string | null>(null)
const [inputName, setInputName] = createSignal<string | null>(null)
const [audioUrl, setAudioUrl] = createSignal<string | null>(null)

export const appStore = {
  get view() { return view() },
  get inputPath() { return inputPath() },
  get inputName() { return inputName() },
  get audioUrl() { return audioUrl() },
}

export function navigateTo(v: AppView) {
  setView(v)
}

export function setInput(path: string, name: string, url?: string) {
  setInputPath(path)
  setInputName(name)
  if (url) setAudioUrl(url)
}

export function resetApp() {
  setView('upload')
  setInputPath(null)
  setInputName(null)
  setAudioUrl(null)
}

export { view, audioUrl }
