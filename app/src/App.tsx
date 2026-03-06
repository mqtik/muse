import { Switch, Match } from 'solid-js'
import { view } from './stores/appStore'
import UploadView from './views/UploadView'
import RecordingView from './views/RecordingView'
import ProcessingView from './views/ProcessingView'
import ResultView from './views/ResultView'

export default function App() {
  return (
    <div class="w-full h-full flex flex-col bg-bg-primary">
      <Switch>
        <Match when={view() === 'upload'}>
          <UploadView />
        </Match>
        <Match when={view() === 'recording'}>
          <RecordingView />
        </Match>
        <Match when={view() === 'processing'}>
          <ProcessingView />
        </Match>
        <Match when={view() === 'result'}>
          <ResultView />
        </Match>
      </Switch>
    </div>
  )
}
