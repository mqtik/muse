import { For } from 'solid-js'
import { Check } from 'lucide-solid'

const STAGES = [
  { id: 'separating', label: 'Isolating piano' },
  { id: 'transcribing', label: 'Transcribing notes' },
  { id: 'quantizing', label: 'Quantizing rhythm' },
  { id: 'generating', label: 'Generating sheet music' },
]

const STAGE_ORDER = ['separating', 'transcribing', 'quantizing', 'generating', 'done']

interface ProgressStepsProps {
  currentStage: string | null
}

export default function ProgressSteps(props: ProgressStepsProps) {
  const currentIndex = () => STAGE_ORDER.indexOf(props.currentStage || '')

  return (
    <div class="flex flex-col gap-3">
      <For each={STAGES}>
        {(step) => {
          const stepIndex = () => STAGE_ORDER.indexOf(step.id)
          const isComplete = () => currentIndex() > stepIndex()
          const isCurrent = () => props.currentStage === step.id

          return (
            <div class="flex items-center gap-3">
              <div class={`
                w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                ${isComplete()
                  ? 'bg-success text-white'
                  : isCurrent()
                    ? 'bg-accent text-white'
                    : 'bg-white/10 text-text-secondary'
                }
              `}>
                {isComplete()
                  ? <Check class="w-3.5 h-3.5" />
                  : isCurrent()
                    ? <div class="w-2 h-2 rounded-full bg-white animate-pulse" />
                    : <div class="w-2 h-2 rounded-full bg-current opacity-50" />
                }
              </div>
              <span class={`text-sm transition-colors ${
                isComplete() ? 'text-success' : isCurrent() ? 'text-text-primary' : 'text-text-secondary'
              }`}>
                {step.label}
              </span>
            </div>
          )
        }}
      </For>
    </div>
  )
}
