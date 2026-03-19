import { Show } from 'solid-js'
import { resetApp, appStore, audioUrl } from '../stores/appStore'
import { midiPath, perfMidiPath, metadata } from '../stores/pipelineStore'
import PlaybackPanel from '../components/PlaybackPanel'
import ExportBar from '../components/ExportBar'
import AuroraFooter from '../components/AuroraFooter'
import { ArrowLeft } from 'lucide-solid'

export default function ResultView() {
  const metadataLine = () => {
    const meta = metadata()
    if (!meta) return null
    const parts: string[] = []
    if (meta.key) parts.push(meta.key)
    const ts = meta.timeSignature
    if (ts?.length === 2) parts.push(`${ts[0]}/${ts[1]}`)
    if (meta.tempo) parts.push(`${Math.round(meta.tempo)} BPM`)
    return parts.join(' · ')
  }

  return (
    <div class="flex-1 flex flex-col h-full animate-fade-in relative">
      <button
        onClick={resetApp}
        class="absolute top-4 left-4 z-10 p-2 rounded-full transition-colors hover:bg-white/5"
      >
        <ArrowLeft class="w-5 h-5 text-text-secondary" />
      </button>

      <div class="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-16">
        <Show when={appStore.inputName}>
          <span class="text-xs text-text-secondary tracking-wide">
            {appStore.inputName}
          </span>
        </Show>

        <Show when={audioUrl()}>
          {(url) => (
            <PlaybackPanel
              audioUrl={url()}
              scoreMidiPath={midiPath()}
              perfMidiPath={perfMidiPath()}
              instruments={metadata()?.instruments}
            />
          )}
        </Show>

        <Show when={metadataLine()}>
          <span class="text-xs text-text-secondary tracking-wide">
            {metadataLine()}
          </span>
        </Show>

        <ExportBar inputName={appStore.inputName || 'output'} midiPath={midiPath()} />
      </div>

      <AuroraFooter />
    </div>
  )
}
