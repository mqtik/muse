import { createSignal, createEffect, Show, onMount } from 'solid-js'
import { convertFileSrc } from '@tauri-apps/api/core'
import { navigateTo, setInput, setActiveBackend, pendingPreview, clearPendingPreview, type Backend } from '../stores/appStore'
import { resetPipeline, updateProgress, setPipelineResult, setPipelineError } from '../stores/pipelineStore'
import { startPipeline } from '../lib/commands'
import { onPipelineProgress } from '../lib/events'
import DropZone from '../components/DropZone'
import PreviewModal from '../components/PreviewModal'
import QuickPlayModal from '../components/QuickPlayModal'
import RecordTab from '../components/RecordTab'
import TopTabBar, { type TabItem } from '../components/TopTabBar'
import AuroraFooter from '../components/AuroraFooter'
import { Music, Mic, Link } from 'lucide-solid'

interface RecentFile {
  name: string
  path: string
  date: string
}

interface PendingFile {
  path: string
  name: string
  audioUrl: string
}

const tabs: TabItem[] = [
  { id: 'record', label: 'Record', icon: <Mic class="w-5 h-5" /> },
  { id: 'audio', label: 'Audio', icon: <Music class="w-5 h-5" /> },
  { id: 'embed', label: 'Embed', icon: <Link class="w-5 h-5" /> },
]

export default function UploadView() {
  const [recentFiles, setRecentFiles] = createSignal<RecentFile[]>([])
  const [pendingFile, setPendingFile] = createSignal<PendingFile | null>(null)
  const [activeTab, setActiveTab] = createSignal('record')
  const [showQuickPlay, setShowQuickPlay] = createSignal(false)

  onMount(() => {
    try {
      const stored = localStorage.getItem('muse:recent')
      if (stored) setRecentFiles(JSON.parse(stored))
    } catch {}
  })

  createEffect(() => {
    const preview = pendingPreview()
    if (preview) {
      setPendingFile({ path: preview.path, name: preview.name, audioUrl: preview.audioUrl })
      clearPendingPreview()
    }
  })

  const addRecent = (path: string, name: string) => {
    const recent = recentFiles().filter((f) => f.path !== path)
    const entry = { name, path, date: new Date().toISOString() }
    const updated = [entry, ...recent].slice(0, 10)
    setRecentFiles(updated)
    localStorage.setItem('muse:recent', JSON.stringify(updated))
  }

  const openPreview = (path: string, name: string) => {
    const audioUrl = convertFileSrc(path)
    setPendingFile({ path, name, audioUrl })
  }

  const handleConfirm = async (backend: Backend) => {
    const file = pendingFile()
    if (!file) return

    setPendingFile(null)
    setInput(file.path, file.name, file.audioUrl)
    setActiveBackend(backend)
    addRecent(file.path, file.name)
    resetPipeline()
    navigateTo('processing')

    const unsub = await onPipelineProgress((p) => updateProgress(p.stage, p.percent))

    try {
      const result = await startPipeline(file.path, backend, backend === 'transkun')
      setPipelineResult(result.metadata, result.midi_path ?? undefined, result.perf_midi_path ?? undefined)
      navigateTo('result')
    } catch (e: any) {
      setPipelineError(typeof e === 'string' ? e : e.message || 'Pipeline failed')
    } finally {
      unsub()
    }
  }

  const handleClose = () => setPendingFile(null)

  return (
    <div class="flex-1 flex flex-col relative overflow-hidden">
      <TopTabBar tabs={tabs} activeTab={activeTab()} onSelect={setActiveTab} />

      <div class="flex-1 flex flex-col items-center justify-center gap-8 p-8 relative z-[1]">
        <Show when={activeTab() === 'audio'}>
          <div class="w-full max-w-md">
            <DropZone onFile={openPreview} onQuickPlay={() => setShowQuickPlay(true)} />
          </div>
        </Show>

        <Show when={activeTab() === 'record'}>
          <RecordTab onRecordingComplete={(path, name, audioUrl) => setPendingFile({ path, name, audioUrl })} />
        </Show>

        <Show when={activeTab() === 'embed'}>
          <div class="flex flex-col items-center gap-4 text-center">
            <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Link class="w-8 h-8 text-accent/50" />
            </div>
            <p class="text-lg font-medium text-text-secondary">Under Construction</p>
            <p class="text-sm text-text-secondary/60">
              Paste a YouTube or Spotify link to transcribe
            </p>
          </div>
        </Show>
      </div>

      <AuroraFooter />

      <Show when={showQuickPlay()}>
        <QuickPlayModal
          recentFiles={recentFiles()}
          builtInFiles={[]}
          onSelect={(path, name) => { setShowQuickPlay(false); openPreview(path, name) }}
          onClose={() => setShowQuickPlay(false)}
        />
      </Show>

      <Show when={pendingFile()}>
        {(file) => (
          <PreviewModal
            audioUrl={file().audioUrl}
            name={file().name}
            onConfirm={handleConfirm}
            onClose={handleClose}
          />
        )}
      </Show>
    </div>
  )
}
