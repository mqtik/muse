import { createSignal, Show, For, onMount, onCleanup } from 'solid-js'
import WaveSurfer from 'wavesurfer.js'
import { MidiSynth } from '../lib/midiSynth'
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-solid'

type Tab = 'original' | 'perf' | 'score'

interface PlaybackPanelProps {
  audioUrl: string
  scoreMidiPath: string | null
  perfMidiPath: string | null
  instruments?: string[]
}

const TRACK_COLORS = [
  '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#a855f7', '#06b6d4', '#e11d48',
]

const TAB_COLOR: Record<Tab, string> = {
  original: '#8b5cf6',
  perf: '#f59e0b',
  score: '#10b981',
}

const TAB_LABEL: Record<Tab, string> = {
  original: 'Original',
  perf: 'Perf',
  score: 'Score',
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function PlaybackPanel(props: PlaybackPanelProps) {
  let waveformRef: HTMLDivElement | undefined
  let ws: WaveSurfer | undefined

  const perfSynth = new MidiSynth()
  const scoreSynth = new MidiSynth()

  const isMultiInstrument = () => {
    const inst = props.instruments || []
    return inst.length > 0 && !inst.every((n) => n === 'Left Hand' || n === 'Right Hand')
  }

  const availableTabs = (): Tab[] => {
    const tabs: Tab[] = ['original']
    if (props.perfMidiPath) tabs.push('perf')
    if (props.scoreMidiPath && !isMultiInstrument()) tabs.push('score')
    return tabs
  }

  const defaultTab = () => props.scoreMidiPath ? 'score' as Tab : 'original' as Tab
  const [activeTab, setActiveTab] = createSignal<Tab>(defaultTab())

  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)

  const [perfLoaded, setPerfLoaded] = createSignal(false)
  const [scoreLoaded, setScoreLoaded] = createSignal(false)
  const [perfError, setPerfError] = createSignal<string | null>(null)
  const [scoreError, setScoreError] = createSignal<string | null>(null)

  const [scoreTrackEnabled, setScoreTrackEnabled] = createSignal<boolean[]>([])
  const [scoreTrackNames, setScoreTrackNames] = createSignal<string[]>([])
  const [scoreTrackCounts, setScoreTrackCounts] = createSignal<number[]>([])

  const [wsReady, setWsReady] = createSignal(false)
  let wsDuration = 0

  const syncWaveformCursor = (midiTime: number) => {
    if (!ws || wsDuration <= 0) return
    const ratio = Math.max(0, Math.min(1, midiTime / wsDuration))
    ws.seekTo(ratio)
  }

  onMount(() => {
    if (waveformRef) {
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
        setWsReady(true)
        wsDuration = ws!.getDuration()
        if (activeTab() === 'original') setDuration(wsDuration)
      })
      ws.on('audioprocess', (t: number) => {
        if (activeTab() === 'original') setCurrentTime(t)
      })
      ws.on('seeking', (t: number) => {
        if (activeTab() === 'original') setCurrentTime(t)
      })
      ws.on('play', () => {
        if (activeTab() === 'original') setPlaying(true)
      })
      ws.on('pause', () => {
        if (activeTab() === 'original') setPlaying(false)
      })
      ws.on('finish', () => {
        if (activeTab() === 'original') setPlaying(false)
      })
    }

    if (props.perfMidiPath) {
      perfSynth.loadFile(props.perfMidiPath).then(() => {
        setPerfLoaded(true)
        perfSynth.setOnTimeUpdate((t) => {
          if (activeTab() === 'perf') {
            setCurrentTime(t)
            syncWaveformCursor(t)
          }
        })
        perfSynth.setOnEnd(() => {
          if (activeTab() === 'perf') {
            setPlaying(false)
            setCurrentTime(0)
            syncWaveformCursor(0)
          }
        })
        MidiSynth.preloadInstruments(perfSynth.parsed.tracks.map((t) => t.program))
        if (activeTab() === 'perf') setDuration(perfSynth.duration)
      }).catch((e: any) => setPerfError(e?.message || String(e)))
    }

    if (props.scoreMidiPath) {
      scoreSynth.loadFile(props.scoreMidiPath).then(() => {
        setScoreLoaded(true)
        setScoreTrackNames(scoreSynth.parsed.tracks.map((t) => t.name))
        setScoreTrackCounts(scoreSynth.parsed.tracks.map((t) => t.noteCount))
        setScoreTrackEnabled(scoreSynth.parsed.tracks.map(() => true))
        scoreSynth.setOnTimeUpdate((t) => {
          if (activeTab() === 'score') {
            setCurrentTime(t)
            syncWaveformCursor(t)
          }
        })
        scoreSynth.setOnEnd(() => {
          if (activeTab() === 'score') {
            setPlaying(false)
            setCurrentTime(0)
            syncWaveformCursor(0)
          }
        })
        MidiSynth.preloadInstruments(scoreSynth.parsed.tracks.map((t) => t.program))
        if (activeTab() === 'score') setDuration(scoreSynth.duration)
      }).catch((e: any) => setScoreError(e?.message || String(e)))
    }
  })

  onCleanup(() => {
    ws?.destroy()
    perfSynth.dispose()
    scoreSynth.dispose()
  })

  const pauseAll = () => {
    ws?.pause()
    if (perfSynth.playing) perfSynth.pause()
    if (scoreSynth.playing) scoreSynth.pause()
    setPlaying(false)
  }

  const switchTab = (tab: Tab) => {
    if (tab === activeTab()) return
    pauseAll()
    setActiveTab(tab)
    if (tab === 'original' && ws) {
      setCurrentTime(ws.getCurrentTime())
      setDuration(ws.getDuration())
    } else if (tab === 'perf' && perfLoaded()) {
      setCurrentTime(perfSynth.getCurrentTime())
      setDuration(perfSynth.duration)
      syncWaveformCursor(perfSynth.getCurrentTime())
    } else if (tab === 'score' && scoreLoaded()) {
      setCurrentTime(scoreSynth.getCurrentTime())
      setDuration(scoreSynth.duration)
      syncWaveformCursor(scoreSynth.getCurrentTime())
    }
  }

  const activeSynth = () => activeTab() === 'perf' ? perfSynth : scoreSynth

  const handleWaveformClick = (e: MouseEvent) => {
    const tab = activeTab()
    if (tab === 'original') return
    const rect = waveformRef!.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const synth = activeSynth()
    const t = pct * synth.duration
    synth.seekTo(t)
    setCurrentTime(t)
    syncWaveformCursor(t)
  }

  const togglePlay = async () => {
    const tab = activeTab()
    if (playing()) {
      pauseAll()
      return
    }
    if (tab === 'original' && ws) {
      ws.playPause()
    } else {
      const synth = activeSynth()
      synth.initAudioContext()
      await synth.play(synth.getCurrentTime())
      synth.setVolume(0.8)
      if (tab === 'score') {
        scoreTrackEnabled().forEach((enabled, i) => synth.setTrackEnabled(i, enabled))
      }
      setPlaying(true)
    }
  }

  const skipBack = () => {
    const tab = activeTab()
    if (tab === 'original' && ws) {
      ws.skip(-5)
    } else {
      const synth = activeSynth()
      const t = Math.max(0, currentTime() - 5)
      synth.seekTo(t)
      setCurrentTime(t)
      syncWaveformCursor(t)
    }
  }

  const skipForward = () => {
    const tab = activeTab()
    if (tab === 'original' && ws) {
      ws.skip(5)
    } else {
      const synth = activeSynth()
      const t = Math.min(duration(), currentTime() + 5)
      synth.seekTo(t)
      setCurrentTime(t)
      syncWaveformCursor(t)
    }
  }

  const toggleTrack = (index: number) => {
    const current = scoreTrackEnabled()
    const updated = [...current]
    updated[index] = !updated[index]
    setScoreTrackEnabled(updated)
    scoreSynth.setTrackEnabled(index, updated[index])
  }

  const color = () => TAB_COLOR[activeTab()]

  const isReady = () => {
    const tab = activeTab()
    if (tab === 'original') return wsReady()
    if (tab === 'perf') return perfLoaded()
    return scoreLoaded()
  }

  const activeError = () => {
    const tab = activeTab()
    if (tab === 'perf') return perfError()
    if (tab === 'score') return scoreError()
    return null
  }

  const showTracks = () => activeTab() === 'score' && scoreTrackNames().length > 1

  return (
    <div class="flex flex-col gap-5 w-full max-w-lg mx-auto">
      <div class="flex items-center justify-center">
        <div class="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <For each={availableTabs()}>
            {(tab) => (
              <button
                onClick={() => switchTab(tab)}
                class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeTab() === tab ? `${TAB_COLOR[tab]}20` : 'transparent',
                  color: activeTab() === tab ? TAB_COLOR[tab] : 'rgba(255,255,255,0.4)',
                }}
              >
                {TAB_LABEL[tab]}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={activeError()}>
        <div class="text-red-400 text-xs text-center">
          MIDI load failed: {activeError()}
        </div>
      </Show>

      <div class="w-full" onClick={handleWaveformClick}>
        <div
          ref={waveformRef}
          class="w-full rounded-xl overflow-hidden transition-opacity duration-200"
          style={{ opacity: wsReady() ? 1 : 0.3 }}
        />
      </div>

      <div class="flex items-center justify-between text-xs text-text-secondary px-1 -mt-3">
        <span>{formatTime(currentTime())}</span>
        <span>{formatTime(duration())}</span>
      </div>

      <div class="flex items-center gap-6 justify-center">
        <button onClick={skipBack} class="p-2 rounded-full transition-colors hover:bg-white/5">
          <SkipBack class="w-5 h-5 text-text-secondary" />
        </button>
        <button
          onClick={togglePlay}
          disabled={!isReady()}
          class="w-14 h-14 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
          style={{ background: color() }}
        >
          {playing()
            ? <Pause class="w-6 h-6 text-white" />
            : <Play class="w-6 h-6 text-white ml-0.5" />
          }
        </button>
        <button onClick={skipForward} class="p-2 rounded-full transition-colors hover:bg-white/5">
          <SkipForward class="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ 'grid-template-rows': showTracks() ? '1fr' : '0fr' }}
      >
        <div class="overflow-hidden">
          <div class="flex items-center justify-center gap-1.5 flex-wrap pt-1">
            <For each={scoreTrackNames()}>
              {(name, i) => (
                <button
                  onClick={() => toggleTrack(i())}
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: scoreTrackEnabled()[i()] ? `${TRACK_COLORS[i()]}20` : 'rgba(255,255,255,0.03)',
                    color: scoreTrackEnabled()[i()] ? TRACK_COLORS[i()] : 'rgba(255,255,255,0.3)',
                  }}
                >
                  <Music style={{ width: '12px', height: '12px' }} />
                  {name}
                  <span style={{ opacity: 0.6 }}>({scoreTrackCounts()[i()]})</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
