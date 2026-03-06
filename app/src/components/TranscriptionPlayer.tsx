import { onMount, onCleanup, createSignal } from 'solid-js'
import { MusicXmlSynth } from '../lib/synth'
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-solid'

interface TranscriptionPlayerProps {
  musicxml: string
  tempo: number
  onTimeUpdate?: (time: number) => void
}

export default function TranscriptionPlayer(props: TranscriptionPlayerProps) {
  const synth = new MusicXmlSynth()
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
    synth.load(props.musicxml, props.tempo || 120)
    setDuration(synth.duration)
    synth.setOnTimeUpdate((t) => {
      setCurrentTime(t)
      props.onTimeUpdate?.(t)
    })
    synth.setOnEnd(() => setPlaying(false))
  })

  onCleanup(() => synth.stop())

  const togglePlay = () => {
    if (playing()) {
      synth.pause()
      setPlaying(false)
    } else {
      if (currentTime() > 0) {
        synth.resume()
      } else {
        synth.play()
      }
      setPlaying(true)
    }
  }

  const skipBack = () => {
    const t = Math.max(0, currentTime() - 5)
    synth.seekTo(t)
    setCurrentTime(t)
  }

  const skipForward = () => {
    const t = Math.min(duration(), currentTime() + 5)
    synth.seekTo(t)
    setCurrentTime(t)
  }

  const handleVolume = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value)
    setVolume(val)
    synth.setVolume(val)
  }

  const handleSeek = (e: MouseEvent) => {
    const bar = e.currentTarget as HTMLDivElement
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const t = pct * duration()
    synth.seekTo(t)
    setCurrentTime(t)
  }

  const progress = () => duration() > 0 ? (currentTime() / duration()) * 100 : 0

  return (
    <div class="glass rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-2 h-2 rounded-full bg-success" />
        <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Transcription Playback
        </span>
      </div>

      <div
        class="w-full h-8 rounded-lg bg-white/5 cursor-pointer relative overflow-hidden"
        onClick={handleSeek}
      >
        <div
          class="absolute inset-y-0 left-0 bg-accent/30 rounded-lg transition-[width] duration-100"
          style={{ width: `${progress()}%` }}
        />
        <div
          class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent shadow-lg transition-[left] duration-100"
          style={{ left: `calc(${progress()}% - 6px)` }}
        />
      </div>

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
