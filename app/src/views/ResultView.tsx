import { Show } from 'solid-js'
import { resetApp, appStore, audioUrl } from '../stores/appStore'
import { musicxml, midiPath, perfMidiPath, metadata } from '../stores/pipelineStore'
import PlaybackPanel from '../components/PlaybackPanel'
import SheetMusic from '../components/SheetMusic'
import MetadataPanel from '../components/MetadataPanel'
import ExportBar from '../components/ExportBar'
import { ArrowLeft } from 'lucide-solid'

export default function ResultView() {
  return (
    <div class="flex-1 flex flex-col h-full animate-fade-in">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border-glass">
        <button
          onClick={resetApp}
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-hover text-sm transition-colors"
        >
          <ArrowLeft class="w-4 h-4" />
          New
        </button>
        <span class="text-sm font-medium text-text-secondary">
          {appStore.inputName}
        </span>
        <div class="w-16" />
      </div>

      <div class="flex-1 flex overflow-hidden">
        <div class="w-56 flex-shrink-0 p-4 flex flex-col gap-6 overflow-y-auto border-r border-border-glass">
          <Show when={metadata()}>
            {(meta) => <MetadataPanel metadata={meta()} />}
          </Show>

          <Show when={musicxml()}>
            {(xml) => <ExportBar musicxml={xml()} inputName={appStore.inputName || 'output'} midiPath={midiPath()} />}
          </Show>
        </div>

        <div class="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          <Show when={audioUrl()}>
            {(url) => (
              <PlaybackPanel
                audioUrl={url()}
                scoreMidiPath={midiPath()}
                perfMidiPath={perfMidiPath()}
              />
            )}
          </Show>

          <div class="flex-1 overflow-auto">
            <Show when={musicxml()}>
              {(xml) => <SheetMusic musicxml={xml()} />}
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
