import { Show } from 'solid-js'
import { Download, ExternalLink } from 'lucide-solid'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile, copyFile } from '@tauri-apps/plugin-fs'

interface ExportBarProps {
  musicxml: string
  inputName: string
  midiPath?: string | null
}

export default function ExportBar(props: ExportBarProps) {
  const baseName = () => props.inputName.replace(/\.[^.]+$/, '')

  const handleExportMusicXML = async () => {
    const path = await save({
      defaultPath: `${baseName()}.musicxml`,
      filters: [{ name: 'MusicXML', extensions: ['musicxml'] }],
    })
    if (path) {
      await writeTextFile(path, props.musicxml)
    }
  }

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
    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-text-secondary px-1">
        Export
      </h3>
      <div class="flex flex-col gap-2">
        <button
          onClick={handleExportMusicXML}
          class="glass glass-hover rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm transition-colors"
        >
          <Download class="w-4 h-4 text-accent" />
          MusicXML
        </button>

        <Show when={props.midiPath}>
          <button
            onClick={handleExportMIDI}
            class="glass glass-hover rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm transition-colors"
          >
            <Download class="w-4 h-4 text-accent" />
            MIDI
          </button>
        </Show>

        <button
          class="glass glass-hover rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm transition-colors"
          onClick={() => {}}
        >
          <ExternalLink class="w-4 h-4 text-accent" />
          Open in Polaro Piano
        </button>
      </div>
    </div>
  )
}
