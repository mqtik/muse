export interface MidiNote {
  pitch: number
  startTime: number
  endTime: number
  velocity: number
  track: number
}

export interface MidiTrackInfo {
  name: string
  noteCount: number
  program: number
}

export interface ParsedMidi {
  notes: MidiNote[]
  tracks: MidiTrackInfo[]
  duration: number
  tempo: number
  ppq: number
  tempoEventCount: number
}

interface TempoEvent {
  tick: number
  usPerBeat: number
}

function readVarLen(buf: Uint8Array, pos: number): [number, number] {
  let val = 0
  let bytes = 0
  while (true) {
    const b = buf[pos + bytes]
    val = (val << 7) | (b & 0x7f)
    bytes++
    if (!(b & 0x80)) break
  }
  return [val, bytes]
}

function tickToSeconds(tick: number, tempoMap: TempoEvent[], ppq: number): number {
  let seconds = 0
  let prevTick = 0
  let currentUsPerBeat = 500_000

  for (const event of tempoMap) {
    if (tick <= event.tick) break
    seconds += ((event.tick - prevTick) / ppq) * (currentUsPerBeat / 1_000_000)
    prevTick = event.tick
    currentUsPerBeat = event.usPerBeat
  }

  seconds += ((tick - prevTick) / ppq) * (currentUsPerBeat / 1_000_000)
  return seconds
}

export function parseMidiBytes(buf: Uint8Array): ParsedMidi {
  let p = 0
  const u16 = () => { const v = (buf[p] << 8) | buf[p + 1]; p += 2; return v }
  const u32 = () => { const v = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]; p += 4; return v }

  p += 4
  u32()
  u16()
  const nTracks = u16()
  const ppq = u16()

  const tempoMap: TempoEvent[] = []
  const rawTracks: Array<{
    noteOns: Array<{ pitch: number; tick: number; vel: number }>
    noteOffs: Array<{ pitch: number; tick: number }>
    name: string
    program: number
  }> = []

  for (let t = 0; t < nTracks; t++) {
    p += 4
    const tLen = u32()
    const tEnd = p + tLen
    let tick = 0
    let running = 0
    let name = ''
    let program = 0
    const noteOns: Array<{ pitch: number; tick: number; vel: number }> = []
    const noteOffs: Array<{ pitch: number; tick: number }> = []

    while (p < tEnd) {
      const [delta, db] = readVarLen(buf, p)
      p += db
      tick += delta

      let status = buf[p]
      if (status & 0x80) {
        if (status < 0xf0) running = status
        p++
      } else {
        status = running
      }

      if (status === 0xff) {
        const mType = buf[p++]
        const [mLen, mlb] = readVarLen(buf, p)
        p += mlb
        if (mType === 0x51 && mLen === 3) {
          const us = (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2]
          tempoMap.push({ tick, usPerBeat: us })
        } else if (mType === 0x03) {
          name = new TextDecoder().decode(buf.slice(p, p + mLen))
        }
        p += mLen
      } else if (status === 0xf0 || status === 0xf7) {
        const [sLen, slb] = readVarLen(buf, p)
        p += slb + sLen
      } else {
        const hi = status & 0xf0
        if (hi === 0x90) {
          const pitch = buf[p++]
          const vel = buf[p++]
          if (vel > 0) {
            noteOns.push({ pitch, tick, vel })
          } else {
            noteOffs.push({ pitch, tick })
          }
        } else if (hi === 0x80) {
          const pitch = buf[p++]
          p++
          noteOffs.push({ pitch, tick })
        } else if (hi === 0xc0) {
          program = buf[p++]
        } else if (hi === 0xd0) {
          p++
        } else {
          p += 2
        }
      }
    }

    rawTracks.push({ noteOns, noteOffs, name, program })
  }

  tempoMap.sort((a, b) => a.tick - b.tick)

  const notes: MidiNote[] = []
  const trackNames: string[] = []
  const trackNoteCounts: number[] = []
  const trackPrograms: number[] = []

  for (let t = 0; t < rawTracks.length; t++) {
    const track = rawTracks[t]
    if (t === 0 && nTracks > 1 && track.noteOns.length === 0) continue

    const trackIdx = nTracks > 1 ? t - 1 : 0
    const pending = new Map<number, Array<{ tick: number; vel: number }>>()
    let noteCount = 0

    const allEvents: Array<{ type: 'on' | 'off'; pitch: number; tick: number; vel: number }> = []
    for (const e of track.noteOns) allEvents.push({ type: 'on', ...e })
    for (const e of track.noteOffs) allEvents.push({ type: 'off', pitch: e.pitch, tick: e.tick, vel: 0 })
    allEvents.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1))

    for (const event of allEvents) {
      if (event.type === 'on') {
        const stack = pending.get(event.pitch) || []
        stack.push({ tick: event.tick, vel: event.vel })
        pending.set(event.pitch, stack)
      } else {
        const stack = pending.get(event.pitch)
        if (stack && stack.length > 0) {
          const on = stack.shift()!
          notes.push({
            pitch: event.pitch,
            startTime: tickToSeconds(on.tick, tempoMap, ppq),
            endTime: tickToSeconds(event.tick, tempoMap, ppq),
            velocity: on.vel,
            track: Math.max(0, trackIdx),
          })
          noteCount++
        }
      }
    }

    if (t > 0 || nTracks === 1) {
      trackNames.push(track.name || `Track ${t}`)
      trackNoteCounts.push(noteCount)
      trackPrograms.push(track.program)
    }
  }

  const mainTempo = tempoMap.length > 0 ? tempoMap[0].usPerBeat : 500_000
  const tempo = Math.round(60_000_000 / mainTempo)
  const duration = notes.length > 0 ? Math.max(...notes.map((n) => n.endTime)) : 0

  return {
    notes: notes.sort((a, b) => a.startTime - b.startTime),
    tracks: trackNames.map((name, i) => ({ name, noteCount: trackNoteCounts[i], program: trackPrograms[i] })),
    duration,
    tempo,
    ppq,
    tempoEventCount: tempoMap.length,
  }
}
