import { Show } from 'solid-js'
import { stage, percent, error } from '../stores/pipelineStore'
import { resetApp } from '../stores/appStore'
import ProgressSteps from '../components/ProgressSteps'
import { Loader2, AlertCircle } from 'lucide-solid'

export default function ProcessingView() {
  return (
    <div class="flex-1 flex flex-col items-center justify-center gap-8 p-8 animate-fade-in">
      <Show when={!error()} fallback={
        <div class="flex flex-col items-center gap-6">
          <div class="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <AlertCircle class="w-8 h-8 text-red-400" />
          </div>
          <div class="text-center max-w-md">
            <p class="text-lg font-medium mb-2">Processing Failed</p>
            <p class="text-sm text-text-secondary">{error()}</p>
          </div>
          <button
            onClick={resetApp}
            class="px-6 py-2.5 rounded-xl glass glass-hover text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      }>
        <div class="glass rounded-2xl p-8 flex flex-col items-center gap-6 min-w-[320px]">
          <Loader2 class="w-10 h-10 text-accent animate-spin" />

          <div class="text-center">
            <p class="text-lg font-medium mb-1">Transcribing...</p>
            <div class="w-48 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                class="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${percent()}%` }}
              />
            </div>
            <p class="text-xs text-text-secondary mt-2">{percent()}%</p>
          </div>
        </div>

        <ProgressSteps currentStage={stage()} />
      </Show>
    </div>
  )
}
