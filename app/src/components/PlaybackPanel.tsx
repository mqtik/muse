import { createSignal, Show, For, onMount, onCleanup } from 'solid-js'
import WaveSurfer from 'wavesurfer.js'
import { MidiSynth } from '../lib/midiSynth'
import { Play, Pause, SkipBack, SkipForward, Volume2, Music } from 'lucide-solid'

type Tab = 'original' | 'transcription' | 'score'

interface PlaybackPanelProps {
  audioUrl: string
  scoreMidiPath: string | null
  perfMidiPath: string | null
}

const TRACK_COLORS = ['#8b5cf6', '#f59e0b']

const formatTime = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function OriginalPlayer(props: { audioUrl: string }) {
  let waveformRef: HTMLDivElement | undefined
  let ws: WaveSurfer | undefined
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [volume, setVolume] = createSignal(0.8)

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
    ws.on('audioprocess', (t: number) => setCurrentTime(t))
    ws.on('seeking', (t: number) => setCurrentTime(t))
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))
  })

  onCleanup(() => ws?.destroy())

  const handleVolume = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value)
    setVolume(val)
    ws?.setVolume(val)
  }

  return (
    <>
      <div ref={waveformRef} class="w-full rounded-xl overflow-hidden" />
      <div class="flex items-center justify-between text-xs text-text-secondary px-1">
        <span>{formatTime(currentTime())}</span>
        <span>{formatTime(duration())}</span>
      </div>
      <div class="flex items-center gap-4 justify-center">
        <button onClick={() => ws?.skip(-5)} class="p-2 rounded-lg glass-hover transition-colors">
          <SkipBack class="w-4 h-4 text-text-secondary" />
        </button>
        <button
          onClick={() => ws?.playPause()}
          class="w-10 h-10 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
        >
          {playing()
            ? <Pause class="w-5 h-5 text-white" />
            : <Play class="w-5 h-5 text-white ml-0.5" />
          }
        </button>
        <button onClick={() => ws?.skip(5)} class="p-2 rounded-lg glass-hover transition-colors">
          <SkipForward class="w-4 h-4 text-text-secondary" />
        </button>
        <div class="flex items-center gap-2 ml-4">
          <Volume2 class="w-4 h-4 text-text-secondary" />
          <input
            type="range" min="0" max="1" step="0.01"
            value={volume()} onInput={handleVolume}
            class="w-20 accent-accent"
          />
        </div>
      </div>
    </>
  )
}

function MidiPlayer(props: { midiPath: string; showTracks: boolean; accentColor: string }) {
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

  onMount(async () => {
    try {
      await synth.loadFile(props.midiPath)
      setDuration(synth.duration)
      setTrackNames(synth.parsed.tracks.map((t) => t.name))
      setTrackCounts(synth.parsed.tracks.map((t) => t.noteCount))
      setTrackEnabled(synth.parsed.tracks.map(() => true))
      setLoaded(true)
      synth.setOnTimeUpdate((t) => setCurrentTime(t))
      synth.setOnEnd(() => {
        setPlaying(false)
        setCurrentTime(0)
      })
    } catch (e: any) {
      setLoadError(e?.message || String(e))
    }
  })

  onCleanup(() => synth.dispose())

  const togglePlay = async () => {
    if (playing()) {
      synth.pause()
      setPlaying(false)
    } else {
      await synth.play(synth.getCurrentTime())
      synth.setVolume(volume())
      trackEnabled().forEach((enabled, i) => synth.setTrackEnabled(i, enabled))
      setPlaying(true)
    }
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

  const handleVolume = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value)
    setVolume(val)
    synth.setVolume(val)
  }

  const progress = () => (duration() > 0 ? (currentTime() / duration()) * 100 : 0)
  const loading = () => !loaded() && !loadError()

  return (
    <>
      <Show when={loadError()}>
        <div class="flex items-center gap-2 text-red-400 text-xs py-4">
          <span class="font-medium">MIDI load failed:</span>
          <span class="opacity-70">{loadError()}</span>
        </div>
      </Show>

      <Show when={!loadError()}>
        <Show when={props.showTracks && trackNames().length > 1}>
          <div class="flex items-center gap-1.5">
            <For each={trackNames()}>
              {(name, i) => (
                <button
                  onClick={() => toggleTrack(i())}
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: trackEnabled()[i()] ? `${TRACK_COLORS[i()]}20` : 'rgba(255,255,255,0.03)',
                    color: trackEnabled()[i()] ? TRACK_COLORS[i()] : 'rgba(255,255,255,0.3)',
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
        </Show>

        <div
          class="w-full h-8 rounded-lg bg-white/5 cursor-pointer relative overflow-hidden"
          onClick={handleSeek}
        >
          <div
            class="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-100"
            style={{ width: `${progress()}%`, background: `${props.accentColor}30` }}
          />
          <div
            class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-lg transition-[left] duration-100"
            style={{ left: `calc(${progress()}% - 6px)`, background: props.accentColor }}
          />
        </div>

        <div class="flex items-center justify-between text-xs text-text-secondary px-1">
          <span>{formatTime(currentTime())}</span>
          <span>{formatTime(duration())}</span>
        </div>

        <div class="flex items-center gap-4 justify-center">
          <button onClick={() => { const t = Math.max(0, currentTime() - 5); synth.seekTo(t); setCurrentTime(t) }} class="p-2 rounded-lg glass-hover transition-colors">
            <SkipBack class="w-4 h-4 text-text-secondary" />
          </button>
          <button
            onClick={togglePlay}
            disabled={loading()}
            class="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
            style={{ background: props.accentColor }}
          >
            {loading() ? (
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : playing() ? (
              <Pause class="w-5 h-5 text-white" />
            ) : (
              <Play class="w-5 h-5 text-white ml-0.5" />
            )}
          </button>
          <button onClick={() => { const t = Math.min(duration(), currentTime() + 5); synth.seekTo(t); setCurrentTime(t) }} class="p-2 rounded-lg glass-hover transition-colors">
            <SkipForward class="w-4 h-4 text-text-secondary" />
          </button>
          <div class="flex items-center gap-2 ml-4">
            <Volume2 class="w-4 h-4 text-text-secondary" />
            <input
              type="range" min="0" max="1" step="0.01"
              value={volume()} onInput={handleVolume}
              class="w-20"
              style={{ "accent-color": props.accentColor }}
            />
          </div>
        </div>
      </Show>
    </>
  )
}

export default function PlaybackPanel(props: PlaybackPanelProps) {
  const hasPerfMidi = () => !!props.perfMidiPath
  const hasScoreMidi = () => !!props.scoreMidiPath

  const availableTabs = (): Tab[] => {
    const tabs: Tab[] = ['original']
    if (hasPerfMidi()) tabs.push('transcription')
    if (hasScoreMidi()) tabs.push('score')
    return tabs
  }

  const defaultTab = () => hasScoreMidi() ? 'score' as Tab : 'original' as Tab
  const [activeTab, setActiveTab] = createSignal<Tab>(defaultTab())

  const tabLabels: Record<Tab, string> = {
    original: 'Original',
    transcription: 'Transcription',
    score: 'Score',
  }

  const tabColors: Record<Tab, string> = {
    original: '#8b5cf6',
    transcription: '#f59e0b',
    score: '#10b981',
  }

  return (
    <div class="glass rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center gap-1.5">
        <For each={availableTabs()}>
          {(tab) => (
            <button
              onClick={() => setActiveTab(tab)}
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: activeTab() === tab ? `${tabColors[tab]}20` : 'transparent',
                color: activeTab() === tab ? tabColors[tab] : 'rgba(255,255,255,0.4)',
                border: `1px solid ${activeTab() === tab ? `${tabColors[tab]}40` : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {tabLabels[tab]}
            </button>
          )}
        </For>
      </div>

      <Show when={activeTab() === 'original'}>
        <OriginalPlayer audioUrl={props.audioUrl} />
      </Show>

      <Show when={activeTab() === 'transcription' && props.perfMidiPath}>
        <MidiPlayer midiPath={props.perfMidiPath!} showTracks={false} accentColor="#f59e0b" />
      </Show>

      <Show when={activeTab() === 'score' && props.scoreMidiPath}>
        <MidiPlayer midiPath={props.scoreMidiPath!} showTracks={true} accentColor="#10b981" />
      </Show>
    </div>
  )
}
