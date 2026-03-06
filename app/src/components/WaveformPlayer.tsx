import { onMount, onCleanup, createSignal } from 'solid-js'
import WaveSurfer from 'wavesurfer.js'
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-solid'

interface WaveformPlayerProps {
  audioUrl: string
  onTimeUpdate?: (time: number) => void
}

export default function WaveformPlayer(props: WaveformPlayerProps) {
  let waveformRef: HTMLDivElement | undefined
  let ws: WaveSurfer | undefined
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [volume, setVolume] = createSignal(0.8)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  onMount(() => {
    if (!waveformRef) return

    ws = WaveSurfer.create({
      container: waveformRef,
      waveColor: 'rgba(139, 92, 246, 0.4)',
      progressColor: 'rgba(139, 92, 246, 0.8)',
      cursorColor: '#8b5cf6',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 64,
      normalize: true,
    })

    ws.load(props.audioUrl)
    ws.setVolume(volume())

    ws.on('ready', () => setDuration(ws!.getDuration()))
    ws.on('audioprocess', (t: number) => {
      setCurrentTime(t)
      props.onTimeUpdate?.(t)
    })
    ws.on('seeking', (t: number) => {
      setCurrentTime(t)
      props.onTimeUpdate?.(t)
    })
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))
  })

  onCleanup(() => ws?.destroy())

  const togglePlay = () => ws?.playPause()
  const skipBack = () => ws?.skip(-5)
  const skipForward = () => ws?.skip(5)

  const handleVolume = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value)
    setVolume(val)
    ws?.setVolume(val)
  }

  return (
    <div class="glass rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-2 h-2 rounded-full bg-accent" />
        <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Original Audio
        </span>
      </div>
      <div ref={waveformRef} class="w-full rounded-xl overflow-hidden" />

      <div class="flex items-center justify-between text-xs text-text-secondary px-1">
        <span>{formatTime(currentTime())}</span>
        <span>{formatTime(duration())}</span>
      </div>

      <div class="flex items-center gap-4 justify-center">
        <button onClick={skipBack} class="p-2 rounded-lg glass-hover transition-colors">
          <SkipBack class="w-4 h-4 text-text-secondary" />
        </button>

        <button
          onClick={togglePlay}
          class="w-10 h-10 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
        >
          {playing()
            ? <Pause class="w-5 h-5 text-white" />
            : <Play class="w-5 h-5 text-white ml-0.5" />
          }
        </button>

        <button onClick={skipForward} class="p-2 rounded-lg glass-hover transition-colors">
          <SkipForward class="w-4 h-4 text-text-secondary" />
        </button>

        <div class="flex items-center gap-2 ml-4">
          <Volume2 class="w-4 h-4 text-text-secondary" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume()}
            onInput={handleVolume}
            class="w-20 accent-accent"
          />
        </div>
      </div>
    </div>
  )
}
