import { createSignal } from 'solid-js'
import { Music } from 'lucide-solid'
import { open } from '@tauri-apps/plugin-dialog'

interface DropZoneProps {
  onFile: (path: string, name: string) => void
}

export default function DropZone(props: DropZoneProps) {
  const [dragging, setDragging] = createSignal(false)

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => setDragging(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer?.files
    if (files?.[0]) {
      const file = files[0]
      const path = (file as any).path || file.name
      props.onFile(path, file.name)
    }
  }

  const handleBrowse = async () => {
    const result = await open({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] }],
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
        rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
        ${dragging()
          ? 'border-accent bg-accent/10 scale-[1.02]'
          : 'border-border-glass glass glass-hover animate-pulse-border'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBrowse}
    >
      <div class="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center">
        <Music class="w-8 h-8 text-accent" />
      </div>

      <div class="text-center">
        <p class="text-lg font-medium text-text-primary">Drop audio here</p>
        <p class="text-sm text-text-secondary mt-1">MP3 · WAV · OGG · FLAC</p>
      </div>

      <button
        class="px-5 py-2 rounded-xl glass glass-hover text-sm font-medium text-text-primary transition-colors"
        onClick={(e) => { e.stopPropagation(); handleBrowse() }}
      >
        Browse Files
      </button>
    </div>
  )
}
