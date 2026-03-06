import { onMount, onCleanup, createEffect } from 'solid-js'
import { OpenSheetMusicDisplay as OSMD } from 'opensheetmusicdisplay'

interface SheetMusicProps {
  musicxml: string
  onCursorReady?: (cursor: any) => void
}

export default function SheetMusic(props: SheetMusicProps) {
  let container: HTMLDivElement | undefined
  let osmd: OSMD | undefined

  onMount(() => {
    if (!container) return

    osmd = new OSMD(container, {
      autoResize: true,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawCredits: false,
      drawPartNames: true,
      drawPartAbbreviations: false,
      drawingParameters: 'default',
      backend: 'svg',
    })

    osmd.setOptions({
      defaultColorMusic: '#e2e8f0',
      defaultColorRest: '#94a3b8',
    })
  })

  createEffect(async () => {
    const xml = props.musicxml
    if (!osmd || !xml) return

    try {
      await osmd.load(xml)
      osmd.render()

      if (osmd.cursor && props.onCursorReady) {
        osmd.cursor.show()
        props.onCursorReady(osmd.cursor)
      }
    } catch (e) {
      console.error('OSMD render error:', e)
    }
  })

  onCleanup(() => {
    osmd?.clear()
  })

  return (
    <div
      ref={container}
      class="w-full h-full overflow-auto p-4"
      style={{ "background": "rgba(255,255,255,0.03)", "border-radius": "12px" }}
    />
  )
}
