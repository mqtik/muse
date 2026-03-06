import { Mic } from 'lucide-solid'

interface RecordButtonProps {
  onClick: () => void
}

export default function RecordButton(props: RecordButtonProps) {
  return (
    <div class="flex flex-col items-center gap-3">
      <button
        class="
          relative w-20 h-20 rounded-full bg-accent/20 border-2 border-accent/40
          flex items-center justify-center transition-all duration-200
          hover:bg-accent/30 hover:border-accent/60 hover:scale-105
          active:scale-95
        "
        onClick={props.onClick}
      >
        <Mic class="w-8 h-8 text-accent" />
      </button>
      <span class="text-sm text-text-secondary">Tap to record</span>
    </div>
  )
}
