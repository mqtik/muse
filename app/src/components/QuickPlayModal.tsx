import { For, Show } from 'solid-js'
import { X, Play, Music, Clock } from 'lucide-solid'

interface RecentFile {
  name: string
  path: string
  date: string
}

interface SampleFile {
  name: string
  path: string
  description: string
}

interface QuickPlayModalProps {
  recentFiles: RecentFile[]
  builtInFiles: SampleFile[]
  onSelect: (path: string, name: string) => void
  onClose: () => void
}

const BUILT_IN_SAMPLES: SampleFile[] = []

export default function QuickPlayModal(props: QuickPlayModalProps) {
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose()
  }

  const samples = () => props.builtInFiles.length > 0 ? props.builtInFiles : BUILT_IN_SAMPLES

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0, 0, 0, 0.6)', 'backdrop-filter': 'blur(8px)', '-webkit-backdrop-filter': 'blur(8px)' }}
      onClick={handleBackdropClick}
    >
      <div
        class="w-full max-w-md glass rounded-2xl p-6 flex flex-col gap-4 animate-fade-in max-h-[80vh]"
        style={{ background: 'rgba(20, 20, 35, 0.95)', border: '1px solid rgba(139, 92, 246, 0.15)' }}
      >
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-text-primary">Quick Play</h2>
          <button
            onClick={props.onClose}
            class="p-1.5 rounded-lg glass-hover transition-colors flex-shrink-0"
          >
            <X class="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div class="flex flex-col gap-4 overflow-y-auto">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <Music class="w-3.5 h-3.5 text-text-secondary" />
              <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">Built-in Samples</span>
            </div>
            <Show
              when={samples().length > 0}
              fallback={
                <p class="text-sm text-text-secondary/50 italic px-1">No samples available yet</p>
              }
            >
              <div class="flex flex-col gap-1">
                <For each={samples()}>
                  {(file) => (
                    <button
                      onClick={() => props.onSelect(file.path, file.name)}
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl glass glass-hover transition-colors text-left group"
                    >
                      <div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/25 transition-colors">
                        <Play class="w-3.5 h-3.5 text-accent ml-0.5" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-text-primary truncate">{file.name}</p>
                        <p class="text-xs text-text-secondary/60 truncate">{file.description}</p>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={props.recentFiles.length > 0}>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <Clock class="w-3.5 h-3.5 text-text-secondary" />
                <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">Recent</span>
              </div>
              <div class="flex flex-col gap-1">
                <For each={props.recentFiles}>
                  {(file) => (
                    <button
                      onClick={() => props.onSelect(file.path, file.name)}
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl glass glass-hover transition-colors text-left group"
                    >
                      <div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/25 transition-colors">
                        <Play class="w-3.5 h-3.5 text-accent ml-0.5" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-text-primary truncate">{file.name}</p>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
