import { createSignal, onMount, onCleanup } from 'solid-js'
import { Music, Play } from 'lucide-solid'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'

interface DropZoneProps {
  onFile: (path: string, name: string) => void
  onQuickPlay?: () => void
}

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a']

export default function DropZone(props: DropZoneProps) {
  const [dragging, setDragging] = createSignal(false)
  let unlisten: (() => void) | undefined

  onMount(async () => {
    const webview = getCurrentWebview()
    unlisten = await webview.onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        setDragging(true)
      } else if (event.payload.type === 'drop') {
        setDragging(false)
        const paths = event.payload.paths
        const audioFile = paths.find((p) => {
          const ext = p.split('.').pop()?.toLowerCase() || ''
          return AUDIO_EXTENSIONS.includes(ext)
        })
        if (audioFile) {
          const name = audioFile.split('/').pop() || audioFile.split('\\').pop() || audioFile
          props.onFile(audioFile, name)
        }
      } else {
        setDragging(false)
      }
    })
  })

  onCleanup(() => unlisten?.())

  const handleBrowse = async () => {
    const result = await open({
      multiple: false,
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    })
    if (result) {
      const name = result.split('/').pop() || result.split('\\').pop() || result
      props.onFile(result, name)
    }
  }

  return (
    <div
      class={`
        relative flex flex-col items-center justify-center gap-4 p-12
        rounded-2xl transition-all duration-300 cursor-pointer
        ${dragging()
          ? 'border-2 border-dashed border-accent bg-accent/10 scale-[1.02]'
          : ''
        }
      `}
      onClick={handleBrowse}
    >
      <div class="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center">
        <Music class="w-8 h-8 text-accent" />
      </div>

      <div class="text-center">
        <p class="text-lg font-medium text-text-primary">Drop audio here</p>
        <p class="text-sm text-text-secondary mt-1">MP3 · WAV · OGG · FLAC</p>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="px-5 py-2 rounded-xl glass glass-hover text-sm font-medium text-text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); handleBrowse() }}
        >
          Browse Files
        </button>
        <button
          class="px-4 py-2 rounded-xl glass glass-hover text-sm font-medium text-text-primary transition-colors flex items-center gap-1.5"
          onClick={(e) => { e.stopPropagation(); props.onQuickPlay?.() }}
        >
          <Play class="w-3.5 h-3.5" />
          Quick Play
        </button>
      </div>
    </div>
  )
}
