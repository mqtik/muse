import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import WaveSurfer from 'wavesurfer.js'
import { Play, Pause, X } from 'lucide-solid'
import type { Backend } from '../stores/appStore'

interface PreviewModalProps {
  audioUrl: string
  name: string
  onConfirm: (backend: Backend) => void
  onClose: () => void
}

export default function PreviewModal(props: PreviewModalProps) {
  let waveformRef: HTMLDivElement | undefined
  let ws: WaveSurfer | undefined
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [backend, setBackend] = createSignal<Backend | null>(null)
  const [ready, setReady] = createSignal(false)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  onMount(() => {
    if (!waveformRef) return

    ws = WaveSurfer.create({
      container: waveformRef,
      waveColor: 'rgba(139, 92, 246, 0.3)',
      progressColor: 'rgba(139, 92, 246, 0.7)',
      cursorColor: '#8b5cf6',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 56,
      normalize: true,
    })

    ws.load(props.audioUrl)

    ws.on('ready', () => {
      setDuration(ws!.getDuration())
      setReady(true)
    })
    ws.on('audioprocess', (t: number) => setCurrentTime(t))
    ws.on('seeking', (t: number) => setCurrentTime(t))
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))
  })

  onCleanup(() => ws?.destroy())

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      ws?.pause()
      props.onClose()
    }
  }

  const handleClose = () => {
    ws?.pause()
    props.onClose()
  }

  const handleConfirm = () => {
    const b = backend()
    if (!b) return
    ws?.pause()
    props.onConfirm(b)
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0, 0, 0, 0.6)', 'backdrop-filter': 'blur(8px)', '-webkit-backdrop-filter': 'blur(8px)' }}
      onClick={handleBackdropClick}
    >
      <div
        class="w-full max-w-md glass rounded-2xl p-6 flex flex-col gap-5 animate-fade-in"
        style={{ background: 'rgba(20, 20, 35, 0.95)', border: '1px solid rgba(139, 92, 246, 0.15)' }}
      >
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-text-primary truncate pr-4">{props.name}</h2>
          <button
            onClick={handleClose}
            class="p-1.5 rounded-lg glass-hover transition-colors flex-shrink-0"
          >
            <X class="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div class="flex flex-col gap-2">
          <div ref={waveformRef} class="w-full rounded-xl overflow-hidden" />
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-3">
              <button
                onClick={() => ws?.playPause()}
                class="w-8 h-8 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
              >
                <Show when={playing()} fallback={<Play class="w-4 h-4 text-white ml-0.5" />}>
                  <Pause class="w-4 h-4 text-white" />
                </Show>
              </button>
              <span class="text-xs text-text-secondary font-mono">
                {formatTime(currentTime())} / {formatTime(duration())}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">Mode</span>
          <div class="flex items-center gap-1 p-1 rounded-xl glass">
            {(['transkun', 'yourmt3'] as Backend[]).map((b) => (
              <button
                onClick={() => setBackend(b)}
                class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: backend() === b ? 'rgba(139,92,246,0.2)' : 'transparent',
                  color: backend() === b ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                }}
              >
                {b === 'transkun' ? 'Solo Piano' : 'Multi-Instrument'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleConfirm}
          disabled={!ready() || !backend()}
          class="w-full py-3 rounded-xl bg-accent hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >
          Transcribe
        </button>
      </div>
    </div>
  )
}
