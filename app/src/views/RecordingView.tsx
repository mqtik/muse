import { createSignal, onCleanup } from 'solid-js'
import { convertFileSrc } from '@tauri-apps/api/core'
import { navigateTo, setInput } from '../stores/appStore'
import { resetPipeline, updateProgress, setPipelineResult, setPipelineError } from '../stores/pipelineStore'
import { startPipeline, saveRecording } from '../lib/commands'
import { onPipelineProgress } from '../lib/events'
import { AudioRecorder } from '../lib/recorder'
import LiveWaveform from '../components/LiveWaveform'
import { Mic, Square } from 'lucide-solid'

export default function RecordingView() {
  const [recording, setRecording] = createSignal(false)
  const [analyser, setAnalyser] = createSignal<AnalyserNode | null>(null)
  const [elapsed, setElapsed] = createSignal(0)

  const recorder = new AudioRecorder()
  let timer: ReturnType<typeof setInterval> | undefined

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      const node = await recorder.start()
      setAnalyser(node)
      setRecording(true)
      setElapsed(0)
      timer = setInterval(() => setElapsed((t) => t + 1), 1000)
    } catch (e) {
      console.error('Mic access denied:', e)
    }
  }

  const stopRecording = async () => {
    if (timer) clearInterval(timer)
    setRecording(false)

    const wavBuffer = await recorder.stop()
    const bytes = Array.from(new Uint8Array(wavBuffer))

    resetPipeline()
    navigateTo('processing')

    try {
      const path = await saveRecording(bytes)
      const audioUrl = convertFileSrc(path)
      setInput(path, 'Recording', audioUrl)

      const unsub = await onPipelineProgress((p) => updateProgress(p.stage, p.percent))
      const output = path.replace(/\.wav$/, '.musicxml')
      const result = await startPipeline(path, output, true)
      setPipelineResult(result.musicxml, result.metadata, result.midi_path ?? undefined, result.perf_midi_path ?? undefined)
      unsub()
      navigateTo('result')
    } catch (e: any) {
      setPipelineError(typeof e === 'string' ? e : e.message || 'Pipeline failed')
    }
  }

  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  startRecording()

  return (
    <div class="flex-1 flex flex-col items-center justify-center gap-8 p-8 animate-fade-in">
      <div class="relative">
        {recording() && (
          <>
            <div class="absolute inset-0 rounded-full bg-accent/20 animate-ping" style={{ "animation-duration": "2s" }} />
            <div class="absolute -inset-4 rounded-full bg-accent/10 animate-ping" style={{ "animation-duration": "2.5s" }} />
          </>
        )}
        <div class="relative w-24 h-24 rounded-full bg-accent/20 border-2 border-accent flex items-center justify-center">
          <Mic class="w-10 h-10 text-accent" />
        </div>
      </div>

      <div class="text-center">
        <div class="flex items-center gap-2 justify-center mb-1">
          <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span class="text-sm font-medium">Recording...</span>
        </div>
        <span class="text-2xl font-mono text-text-secondary">{formatTime(elapsed())}</span>
      </div>

      <LiveWaveform analyser={analyser()} />

      <button
        onClick={stopRecording}
        class="px-8 py-3 rounded-2xl bg-accent hover:bg-accent/80 text-white font-medium transition-colors flex items-center gap-2"
      >
        <Square class="w-4 h-4" />
        Stop & Analyze
      </button>
    </div>
  )
}
