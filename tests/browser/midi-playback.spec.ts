import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT = join(__dirname, '..', '..')
const MIDI_FIXTURE = join(ROOT, 'tests', 'fixtures', 'test-c-major.mid')
const BUNDLE_PATH = join(__dirname, 'test-synth.bundle.js')

test.beforeAll(() => {
  execSync(
    'npx esbuild tests/browser/test-synth.ts --bundle --format=iife ' +
      '--outfile=tests/browser/test-synth.bundle.js ' +
      '--external:@tauri-apps/plugin-fs ' +
      "--define:import.meta.url=\"''\" --target=es2020",
    { cwd: ROOT },
  )
})

const midiBytes = Array.from(readFileSync(MIDI_FIXTURE))

async function setupPage(page: any) {
  await page.goto('about:blank')
  const bundleCode = readFileSync(BUNDLE_PATH, 'utf-8')
  await page.addScriptTag({ content: bundleCode })
}

test('parseMidiBytes parses MIDI correctly in browser', async ({ page }) => {
  await setupPage(page)

  const result = await page.evaluate((bytes: number[]) => {
    const { parseMidiBytes } = (window as any).testSynth
    const parsed = parseMidiBytes(new Uint8Array(bytes))
    return {
      noteCount: parsed.notes.length,
      duration: parsed.duration,
      trackCount: parsed.tracks.length,
      trackName: parsed.tracks[0]?.name,
      tempo: parsed.tempo,
      ppq: parsed.ppq,
    }
  }, midiBytes)

  expect(result.noteCount).toBe(6)
  expect(result.duration).toBe(1.5)
  expect(result.trackCount).toBe(1)
  expect(result.trackName).toBe('Piano')
  expect(result.tempo).toBe(120)
  expect(result.ppq).toBe(480)
})

test('preparePlaybackNotes enforces minimum duration and removes overlaps', async ({ page }) => {
  await setupPage(page)

  const result = await page.evaluate((bytes: number[]) => {
    const { parseMidiBytes, preparePlaybackNotes } = (window as any).testSynth
    const parsed = parseMidiBytes(new Uint8Array(bytes))
    const prepared = preparePlaybackNotes(parsed.notes)

    return {
      inputCount: parsed.notes.length,
      outputCount: prepared.length,
      allPositiveDuration: prepared.every(
        (n: any) => n.endTime - n.startTime > 0,
      ),
      allValidPitch: prepared.every(
        (n: any) => n.pitch >= 0 && n.pitch <= 127,
      ),
      minDuration: Math.min(
        ...prepared.map((n: any) => n.endTime - n.startTime),
      ),
    }
  }, midiBytes)

  expect(result.outputCount).toBe(6)
  expect(result.allPositiveDuration).toBe(true)
  expect(result.allValidPitch).toBe(true)
  expect(result.minDuration).toBeGreaterThanOrEqual(0.079)
})

test('SplendidGrandPiano loads samples and schedules notes', async ({ page }) => {
  await setupPage(page)

  const result = await page.evaluate(async (bytes: number[]) => {
    const { parseMidiBytes, preparePlaybackNotes, SplendidGrandPiano } =
      (window as any).testSynth

    const parsed = parseMidiBytes(new Uint8Array(bytes))
    const prepared = preparePlaybackNotes(parsed.notes)

    const ctx = new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const loadStart = performance.now()
    const piano = new SplendidGrandPiano(ctx)

    const loadResult = await Promise.race([
      piano.loaded().then(() => ({ ok: true, error: null })),
      new Promise<{ ok: boolean; error: string }>((resolve) =>
        setTimeout(
          () => resolve({ ok: false, error: 'Timed out after 20s' }),
          20_000,
        ),
      ),
    ])
    const loadTime = performance.now() - loadStart

    if (!loadResult.ok) {
      ctx.close()
      return {
        loaded: false,
        loadTime: Math.round(loadTime),
        error: loadResult.error,
        scheduled: 0,
        contextState: ctx.state,
      }
    }

    let scheduled = 0
    const now = ctx.currentTime + 0.1
    for (const note of prepared) {
      piano.start({
        note: note.pitch,
        velocity: note.velocity,
        time: now + note.startTime,
        duration: note.endTime - note.startTime,
      })
      scheduled++
    }

    await new Promise((r) => setTimeout(r, 300))
    const finalState = ctx.state
    ctx.close()

    return {
      loaded: true,
      loadTime: Math.round(loadTime),
      error: null,
      scheduled,
      contextState: finalState,
    }
  }, midiBytes)

  console.log('Piano load result:', JSON.stringify(result, null, 2))

  expect(result.loaded, `Piano failed to load: ${result.error}`).toBe(true)
  expect(result.loadTime).toBeLessThan(20_000)
  expect(result.scheduled).toBe(6)
  expect(result.contextState).toBe('running')
})

test('full playback flow: parse → prepare → AudioContext → schedule', async ({ page }) => {
  await setupPage(page)

  const result = await page.evaluate(async (bytes: number[]) => {
    const { parseMidiBytes, preparePlaybackNotes, SplendidGrandPiano } =
      (window as any).testSynth

    const ctx = new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.4
    masterGain.connect(ctx.destination)

    const trackGain = ctx.createGain()
    trackGain.gain.value = 1
    trackGain.connect(masterGain)

    const piano = new SplendidGrandPiano(ctx, { destination: trackGain })

    const loaded = await Promise.race([
      piano.loaded().then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 20_000)),
    ])

    if (!loaded) {
      ctx.close()
      return { success: false, error: 'Piano load timeout', phase: 'load' }
    }

    const parsed = parseMidiBytes(new Uint8Array(bytes))
    if (parsed.notes.length === 0) {
      ctx.close()
      return { success: false, error: 'No notes parsed', phase: 'parse' }
    }

    const prepared = preparePlaybackNotes(parsed.notes)
    if (prepared.length === 0) {
      ctx.close()
      return {
        success: false,
        error: 'No notes after prepare',
        phase: 'prepare',
      }
    }

    const SCHEDULE_AHEAD = 0.05
    const now = ctx.currentTime + SCHEDULE_AHEAD
    const startedAt = now

    for (const note of prepared) {
      const start = now + note.startTime
      const dur = note.endTime - note.startTime
      piano.start({
        note: note.pitch,
        velocity: note.velocity,
        time: start,
        duration: dur,
      })
    }

    await new Promise((r) => setTimeout(r, 500))
    const elapsed = ctx.currentTime - startedAt

    ctx.close()

    return {
      success: true,
      error: null,
      notesParsed: parsed.notes.length,
      notesPrepared: prepared.length,
      duration: parsed.duration,
      elapsed: Math.round(elapsed * 1000),
      contextWasRunning: true,
    }
  }, midiBytes)

  console.log('Full playback result:', JSON.stringify(result, null, 2))

  expect(result.success, `Failed at ${result.phase}: ${result.error}`).toBe(
    true,
  )
  expect(result.notesParsed).toBe(6)
  expect(result.notesPrepared).toBe(6)
  expect(result.elapsed).toBeGreaterThan(0)
})
