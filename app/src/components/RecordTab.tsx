import { createSignal, onCleanup } from 'solid-js'
import { convertFileSrc } from '@tauri-apps/api/core'
import { saveRecording } from '../lib/commands'
import { AudioRecorder } from '../lib/recorder'

const COLS = 9
const ROWS = 6

interface RecordTabProps {
  onRecordingComplete: (path: string, name: string, audioUrl: string) => void
}

export default function RecordTab(props: RecordTabProps) {
  let recorder: AudioRecorder | undefined
  let analyser: AnalyserNode | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let animFrame: number | undefined

  const [expanded, setExpanded] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [levels, setLevels] = createSignal<number[]>(new Array(COLS).fill(0))
  const [expandScale, setExpandScale] = createSignal(1)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const calcExpandScale = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const larger = Math.max(vw, vh)
    return (larger / 140) * 1.5
  }

  const updateLevels = () => {
    if (!analyser) return
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)

    const usableBins = Math.floor(analyser.frequencyBinCount * 0.6)
    const bandSize = Math.floor(usableBins / COLS)
    const newLevels = Array.from({ length: COLS }, (_, i) => {
      const start = i * bandSize
      let sum = 0
      for (let j = start; j < start + bandSize; j++) sum += dataArray[j]
      const avg = sum / bandSize / 255
      const boosted = Math.pow(avg, 0.6)
      return Math.round(boosted * ROWS)
    })
    setLevels(newLevels)
    animFrame = requestAnimationFrame(updateLevels)
  }

  const startRecording = async () => {
    setExpandScale(calcExpandScale())
    setExpanded(true)

    recorder = new AudioRecorder()
    try {
      analyser = await recorder.start()
    } catch (e) {
      console.error('Mic access denied:', e)
      setExpanded(false)
      return
    }

    setElapsed(0)
    timer = setInterval(() => setElapsed((t) => t + 1), 1000)
    animFrame = requestAnimationFrame(updateLevels)
  }

  const stopRecording = async () => {
    if (timer) clearInterval(timer)
    if (animFrame) cancelAnimationFrame(animFrame)
    setLevels(new Array(COLS).fill(0))
    setExpanded(false)

    if (!recorder) return

    const wavBuffer = await recorder.stop()
    const bytes = Array.from(new Uint8Array(wavBuffer))

    try {
      const path = await saveRecording(bytes)
      const audioUrl = convertFileSrc(path)
      props.onRecordingComplete(path, 'Recording', audioUrl)
    } catch (e) {
      console.error('Failed to save recording:', e)
    }
  }

  onCleanup(() => {
    if (timer) clearInterval(timer)
    if (animFrame) cancelAnimationFrame(animFrame)
  })

  const STAGGER_DELAYS = [0.3, 0.2, 0.1, 0.15, 0.05, 0.1, 0.15, 0.2, 0.25]

  return (
    <div class="relative flex flex-col items-center justify-center gap-6 w-full h-full">
      <button
        onClick={startRecording}
        class="w-[140px] h-[140px] rounded-full bg-accent flex items-center justify-center cursor-pointer"
        classList={{ 'hover:scale-105 active:scale-95 transition-all duration-300': !expanded() }}
        style={{
          position: expanded() ? 'fixed' : 'relative',
          top: expanded() ? '50%' : 'auto',
          left: expanded() ? '50%' : 'auto',
          'margin-top': expanded() ? '-70px' : '0',
          'margin-left': expanded() ? '-70px' : '0',
          'box-shadow': expanded() ? 'none' : '0 0 60px rgba(139,92,246,0.25), 0 0 120px rgba(139,92,246,0.1)',
          'z-index': expanded() ? 50 : 'auto',
          'pointer-events': expanded() ? 'none' : 'auto',
          transform: expanded()
            ? `scale(${expandScale()})`
            : 'scale(1)',
          transition: 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s ease',
        }}
      >
        <svg
          class="w-16 h-16"
          viewBox="0 0 24 24"
          fill="white"
          style={{
            transition: 'all 0.6s cubic-bezier(0.23, 1, 0.32, 1)',
            opacity: expanded() ? 0 : 1,
            transform: expanded() ? 'scale(4)' : 'scale(1)',
          }}
        >
          <path d="M12 15c1.66 0 2.99-1.34 2.99-3l.01-6c0-1.66-1.34-3-3-3s-3 1.34-3 3v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1s-5.3-2.1-5.3-5.1h-1.7c0 3.42 2.72 6.23 6 6.72v3.28h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
        </svg>
      </button>
      <span
        class="relative text-sm text-text-secondary"
        style={{
          opacity: expanded() ? 0 : 1,
          transition: 'opacity 0.3s ease',
          'pointer-events': expanded() ? 'none' : 'auto',
        }}
      >
        Tap to record
      </span>

      <div
        class="fixed inset-0"
        style={{
          'z-index': 49,
          background: '#8b5cf6',
          opacity: expanded() ? 1 : 0,
          visibility: expanded() ? 'visible' : 'hidden',
          transition: 'opacity 0.6s cubic-bezier(0.23, 1, 0.32, 1), visibility 0s linear ' + (expanded() ? '0s' : '0.8s'),
          'pointer-events': expanded() ? 'auto' : 'none',
        }}
      />

      <div
        class="fixed inset-0 flex items-end justify-center"
        style={{
          'z-index': 51,
          visibility: expanded() ? 'visible' : 'hidden',
          opacity: expanded() ? 1 : 0,
          transition: 'opacity 0.6s cubic-bezier(0.23, 1, 0.32, 1) 0.15s, visibility 0s linear ' + (expanded() ? '0s' : '0.8s'),
        }}
      >
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex" style={{ perspective: '400px' }}>
          {levels().map((level, colIdx) => (
            <div
              class="flex flex-col"
              style={{
                margin: '12px',
                'transform-origin': 'bottom center',
                transform: expanded() ? 'rotateX(0)' : 'rotateX(-90deg)',
                transition: `transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${STAGGER_DELAYS[colIdx]}s`,
              }}
            >
              {Array.from({ length: ROWS }, (_, dotIdx) => {
                const lit = dotIdx >= (ROWS - level)
                return (
                  <div
                    class="rounded-full"
                    style={{
                      width: '16px',
                      height: '16px',
                      margin: '10px 0',
                      background: 'white',
                      opacity: lit ? 1 : 0.3,
                      transition: 'opacity 0.12s ease',
                      'box-shadow': lit ? '0 0 8px rgba(255,255,255,0.3)' : 'none',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <div class="absolute top-1/2 left-1/2 -translate-x-1/2" style={{ 'margin-top': '160px' }}>
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span class="text-2xl font-mono text-white/80">{formatTime(elapsed())}</span>
          </div>
        </div>

        <button
          onClick={stopRecording}
          class="w-[60px] h-[60px] rounded-full flex items-center justify-center cursor-pointer group"
          style={{ 'margin-bottom': '6vh', background: 'rgba(0,0,0,0.3)' }}
        >
          <svg class="w-10 h-10 fill-white transition-colors duration-300 group-hover:fill-[#ff6347]" viewBox="0 0 24 24">
            <path d="M6 6h12v12H6z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
