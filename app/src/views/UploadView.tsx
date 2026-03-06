import { createSignal, For, onMount } from 'solid-js'
import { convertFileSrc } from '@tauri-apps/api/core'
import { navigateTo, setInput } from '../stores/appStore'
import { resetPipeline, updateProgress, setPipelineResult, setPipelineError } from '../stores/pipelineStore'
import { startPipeline } from '../lib/commands'
import { onPipelineProgress } from '../lib/events'
import DropZone from '../components/DropZone'
import RecordButton from '../components/RecordButton'
import { Clock } from 'lucide-solid'

interface RecentFile {
  name: string
  path: string
  date: string
}

export default function UploadView() {
  const [recentFiles, setRecentFiles] = createSignal<RecentFile[]>([])
  const [soloPiano, setSoloPiano] = createSignal(false)

  onMount(() => {
    try {
      const stored = localStorage.getItem('muse:recent')
      if (stored) setRecentFiles(JSON.parse(stored))
    } catch {}
  })

  const addRecent = (path: string, name: string) => {
    const recent = recentFiles().filter((f) => f.path !== path)
    const entry = { name, path, date: new Date().toISOString() }
    const updated = [entry, ...recent].slice(0, 10)
    setRecentFiles(updated)
    localStorage.setItem('muse:recent', JSON.stringify(updated))
  }

  const handleFile = async (path: string, name: string) => {
    const audioUrl = convertFileSrc(path)
    setInput(path, name, audioUrl)
    addRecent(path, name)
    resetPipeline()
    navigateTo('processing')

    const unsub = await onPipelineProgress((p) => updateProgress(p.stage, p.percent))

    const output = path.replace(/\.[^.]+$/, '.musicxml')
    try {
      const result = await startPipeline(path, output, soloPiano())
      setPipelineResult(result.musicxml, result.metadata, result.midi_path ?? undefined, result.perf_midi_path ?? undefined)
      navigateTo('result')
    } catch (e: any) {
      setPipelineError(typeof e === 'string' ? e : e.message || 'Pipeline failed')
    } finally {
      unsub()
    }
  }

  const handleRecord = () => navigateTo('recording')

  return (
    <div class="flex-1 flex flex-col items-center justify-center gap-8 p-8 animate-fade-in">
      <div class="w-full max-w-md">
        <DropZone onFile={handleFile} />
      </div>

      <label class="flex items-center gap-3 cursor-pointer select-none">
        <div
          class="relative w-10 h-5 rounded-full transition-colors"
          style={{ background: soloPiano() ? '#10b981' : 'rgba(255,255,255,0.1)' }}
          onClick={() => setSoloPiano(!soloPiano())}
        >
          <div
            class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-150"
            style={{ left: soloPiano() ? '22px' : '2px' }}
          />
        </div>
        <span class="text-sm text-text-secondary">
          Solo piano <span style={{ opacity: 0.5 }}>(skip source separation)</span>
        </span>
      </label>

      <div class="flex items-center gap-4 text-text-secondary text-sm">
        <div class="w-12 h-px bg-border-glass" />
        <span>or</span>
        <div class="w-12 h-px bg-border-glass" />
      </div>

      <RecordButton onClick={handleRecord} />

      {recentFiles().length > 0 && (
        <div class="w-full max-w-lg mt-4">
          <div class="flex items-center gap-2 mb-3">
            <Clock class="w-3.5 h-3.5 text-text-secondary" />
            <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">Recent</span>
          </div>
          <div class="flex gap-2 overflow-x-auto pb-2">
            <For each={recentFiles()}>
              {(file) => (
                <button
                  onClick={() => handleFile(file.path, file.name)}
                  class="glass glass-hover rounded-xl px-4 py-2 text-sm whitespace-nowrap transition-colors flex-shrink-0"
                >
                  {file.name}
                </button>
              )}
            </For>
          </div>
        </div>
      )}
    </div>
  )
}
