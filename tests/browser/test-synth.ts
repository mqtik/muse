import { parseMidiBytes } from '../../app/src/lib/parseMidi'
import { SplendidGrandPiano } from '../../app/node_modules/smplr/dist/index.mjs'

const MIN_NOTE_DURATION = 0.08

function preparePlaybackNotes(notes: any[]): any[] {
  const result = notes.map((n: any) => ({ ...n }))

  const byTrackPitch = new Map<string, any[]>()
  for (const note of result) {
    const key = `${note.track}:${note.pitch}`
    const group = byTrackPitch.get(key) || []
    group.push(note)
    byTrackPitch.set(key, group)
  }

  const removed = new Set<any>()
  for (const group of byTrackPitch.values()) {
    group.sort((a: any, b: any) => a.startTime - b.startTime)
    for (let i = 0; i < group.length - 1; i++) {
      if (group[i].endTime > group[i + 1].startTime) {
        const availableDur = group[i + 1].startTime - group[i].startTime
        if (availableDur < MIN_NOTE_DURATION) {
          removed.add(group[i])
        } else {
          group[i].endTime = group[i + 1].startTime
        }
      }
    }
  }

  const output: any[] = []
  for (const note of result) {
    if (removed.has(note)) continue
    if (note.endTime - note.startTime < MIN_NOTE_DURATION) {
      note.endTime = note.startTime + MIN_NOTE_DURATION
    }
    output.push(note)
  }

  return output
}

;(window as any).testSynth = {
  parseMidiBytes,
  preparePlaybackNotes,
  SplendidGrandPiano,
}
