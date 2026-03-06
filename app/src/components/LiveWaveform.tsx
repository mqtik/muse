import { onMount, onCleanup } from 'solid-js'

interface LiveWaveformProps {
  analyser: AnalyserNode | null
}

export default function LiveWaveform(props: LiveWaveformProps) {
  let canvas: HTMLCanvasElement | undefined
  let animId = 0

  onMount(() => {
    if (!canvas || !props.analyser) return

    const ctx = canvas.getContext('2d')!
    const analyser = props.analyser
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animId = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const w = canvas!.width
      const h = canvas!.height
      ctx.clearRect(0, 0, w, h)

      const barWidth = (w / bufferLength) * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * h
        const gradient = ctx.createLinearGradient(0, h, 0, h - barHeight)
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)')
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0.8)')
        ctx.fillStyle = gradient
        ctx.fillRect(x, h - barHeight, barWidth - 1, barHeight)
        x += barWidth
      }
    }

    draw()
  })

  onCleanup(() => cancelAnimationFrame(animId))

  return (
    <canvas
      ref={canvas}
      width={500}
      height={80}
      class="w-full max-w-lg h-20 rounded-xl"
    />
  )
}
