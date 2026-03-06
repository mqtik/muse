import { createMemo, For } from 'solid-js'
import { Music } from 'lucide-solid'

interface TrackListProps {
  musicxml: string
}

interface Track {
  id: string
  name: string
  clef: string
}

const CLEF_LABELS: Record<string, string> = {
  G: 'Treble',
  F: 'Bass',
  C: 'Alto',
}

export default function TrackList(props: TrackListProps) {
  const tracks = createMemo<Track[]>(() => {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(props.musicxml, 'text/xml')
      const partList = doc.querySelectorAll('score-partwise > part-list > score-part')
      const parts = doc.querySelectorAll('score-partwise > part')

      return Array.from(partList).map((scorePart, i) => {
        const id = scorePart.getAttribute('id') || `P${i + 1}`
        const name = scorePart.querySelector('part-name')?.textContent?.trim() || `Part ${i + 1}`

        let clef = ''
        const partEl = parts[i]
        if (partEl) {
          const clefSign = partEl.querySelector('attributes > clef > sign')?.textContent
          if (clefSign) clef = CLEF_LABELS[clefSign] || clefSign
        }

        return { id, name, clef }
      })
    } catch {
      return []
    }
  })

  return (
    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-text-secondary px-1">
        Tracks
      </h3>
      <For each={tracks()}>
        {(track) => (
          <div class="glass rounded-xl p-3 flex items-center gap-2">
            <Music class="w-4 h-4 text-accent flex-shrink-0" />
            <div>
              <div class="text-sm font-medium">{track.name}</div>
              {track.clef && (
                <div class="text-xs text-text-secondary">{track.clef} clef</div>
              )}
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
