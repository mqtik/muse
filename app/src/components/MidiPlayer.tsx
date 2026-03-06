import { onMount, onCleanup, createSignal, For } from 'solid-js'
import { MidiSynth } from '../lib/midiSynth'
import { Play, Pause, SkipBack, SkipForward, Volume2, Music } from 'lucide-solid'

interface MidiPlayerProps {
  midiPath: string
  onTimeUpdate?: (time: number) => void
}

export default function MidiPlayer(props: MidiPlayerProps) {
  const synth = new MidiSynth()
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [volume, setVolume] = createSignal(0.8)
  const [trackEnabled, setTrackEnabled] = createSignal<boolean[]>([])
  const [trackNames, setTrackNames] = createSignal<string[]>([])
  const [trackCounts, setTrackCounts] = createSignal<number[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | null>(null)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  onMount(async () => {
    try {
      await synth.loadFile(props.midiPath)
      setDuration(synth.duration)
      setTrackNames(synth.parsed.tracks.map((t) => t.name))
      setTrackCounts(synth.parsed.tracks.map((t) => t.noteCount))
      setTrackEnabled(synth.parsed.tracks.map(() => true))
      setLoaded(true)

      synth.setOnTimeUpdate((t) => {
        setCurrentTime(t)
        props.onTimeUpdate?.(t)
      })
      synth.setOnEnd(() => setPlaying(false))
    } catch (e: any) {
      console.error('MidiPlayer load failed:', e, 'path:', props.midiPath)
      setLoadError(e?.message || String(e))
    }
  })

  onCleanup(() => synth.stop())

  const [loading, setLoading] = createSignal(false)

  const togglePlay = async () => {
    if (playing()) {
      synth.pause()
      setPlaying(false)
    } else {
      setLoading(true)
      if (currentTime() > 0) {
        await synth.resume()
      } else {
        await synth.play()
      }
      setLoading(false)
      synth.setVolume(volume())
      trackEnabled().forEach((enabled, i) => synth.setTrackEnabled(i, enabled))
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

  const toggleTrack = (index: number) => {
    const current = trackEnabled()
    const updated = [...current]
    updated[index] = !updated[index]
    setTrackEnabled(updated)
    synth.setTrackEnabled(index, updated[index])
  }

  const progress = () => (duration() > 0 ? (currentTime() / duration()) * 100 : 0)

  const TRACK_COLORS = ['#8b5cf6', '#f59e0b']

  if (loadError()) {
    return (
      <div class="glass rounded-2xl p-4">
        <div class="flex items-center gap-2 text-red-400 text-xs">
          <span class="font-medium">MIDI load failed:</span>
          <span class="opacity-70">{loadError()}</span>
        </div>
      </div>
    )
  }

  return (
    <div class="glass rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-emerald-400" />
          <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">
            MIDI Audio
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <For each={trackNames()}>
            {(name, i) => (
              <button
                onClick={() => toggleTrack(i())}
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: trackEnabled()[i()]
                    ? `${TRACK_COLORS[i()]}20`
                    : 'rgba(255,255,255,0.03)',
                  color: trackEnabled()[i()]
                    ? TRACK_COLORS[i()]
                    : 'rgba(255,255,255,0.3)',
                  border: `1px solid ${trackEnabled()[i()] ? `${TRACK_COLORS[i()]}40` : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <Music style={{ width: '12px', height: '12px' }} />
                {name}
                <span style={{ opacity: 0.6 }}>({trackCounts()[i()]})</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div
        class="w-full h-8 rounded-lg bg-white/5 cursor-pointer relative overflow-hidden"
        onClick={handleSeek}
      >
        <div
          class="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-100"
          style={{ width: `${progress()}%`, background: 'rgba(16, 185, 129, 0.3)' }}
        />
        <div
          class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-lg transition-[left] duration-100"
          style={{ left: `calc(${progress()}% - 6px)`, background: '#10b981' }}
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
          disabled={!loaded() || loading()}
          class="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
          style={{ background: '#10b981' }}
        >
          {loading() ? (
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : playing() ? (
            <Pause class="w-5 h-5 text-white" />
          ) : (
            <Play class="w-5 h-5 text-white ml-0.5" />
          )}
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
            class="w-20 accent-emerald-400"
          />
        </div>
      </div>
    </div>
  )
}
