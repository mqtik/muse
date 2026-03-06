import type { PipelineMetadata } from '../stores/pipelineStore'
import { Music, Clock, Hash } from 'lucide-solid'

const KEY_NAMES: Record<number, string> = {
  [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F',
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
}

interface MetadataPanelProps {
  metadata: PipelineMetadata
}

export default function MetadataPanel(props: MetadataPanelProps) {
  return (
    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-text-secondary px-1">
        Details
      </h3>
      <div class="glass rounded-xl p-3 flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <Music class="w-4 h-4 text-accent flex-shrink-0" />
          <div>
            <div class="text-xs text-text-secondary">Key</div>
            <div class="text-sm font-medium">
              {props.metadata.key || KEY_NAMES[0]}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <Hash class="w-4 h-4 text-accent flex-shrink-0" />
          <div>
            <div class="text-xs text-text-secondary">Time</div>
            <div class="text-sm font-medium">
              {props.metadata.timeSignature?.[0] || 4}/{props.metadata.timeSignature?.[1] || 4}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <Clock class="w-4 h-4 text-accent flex-shrink-0" />
          <div>
            <div class="text-xs text-text-secondary">Tempo</div>
            <div class="text-sm font-medium">{props.metadata.tempo || 120} BPM</div>
          </div>
        </div>
      </div>
    </div>
  )
}
