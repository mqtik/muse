import { Show } from 'solid-js'
import { Download } from 'lucide-solid'
import { save } from '@tauri-apps/plugin-dialog'
import { copyFile } from '@tauri-apps/plugin-fs'

interface ExportBarProps {
  inputName: string
  midiPath?: string | null
}

export default function ExportBar(props: ExportBarProps) {
  const baseName = () => props.inputName.replace(/\.[^.]+$/, '')

  const handleExportMIDI = async () => {
    if (!props.midiPath) return
    const path = await save({
      defaultPath: `${baseName()}.mid`,
      filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
    })
    if (path) {
      await copyFile(props.midiPath, path)
    }
  }

  return (
    <div class="flex items-center justify-center gap-3">
      <Show when={props.midiPath}>
        <button
          onClick={handleExportMIDI}
          class="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-text-secondary hover:text-text-primary transition-colors hover:bg-white/5"
        >
          <Download class="w-4 h-4" />
          Export MIDI
        </button>
      </Show>

    </div>
  )
}
