import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT = join(__dirname, '..', '..')
const BUNDLE_PATH = join(__dirname, 'test-synth.bundle.js')

const SCORE_MIDI = join(ROOT, 'mp3_files', 'Short-tension-piano.mid')
const PERF_MIDI = join(ROOT, 'mp3_files', 'Short-tension-piano.perf.mid')

test.beforeAll(() => {
  execSync(
    'npx esbuild tests/browser/test-synth.ts --bundle --format=iife ' +
      '--outfile=tests/browser/test-synth.bundle.js ' +
      "--define:import.meta.url=\"''\" --target=es2020",
    { cwd: ROOT },
  )

  if (!existsSync(SCORE_MIDI) || !existsSync(PERF_MIDI)) {
    execSync(
      '~/.audio2sheets/venv/bin/python python/pipeline.py "mp3_files/Short-tension-piano.mp3" --solo-piano',
      { cwd: ROOT, timeout: 300_000 },
    )
  }
})

async function setupPage(page: any) {
  await page.goto('about:blank')
  const bundleCode = readFileSync(BUNDLE_PATH, 'utf-8')
  await page.addScriptTag({ content: bundleCode })
}

for (const [label, midiPath] of [
  ['Transcription (perf)', PERF_MIDI],
  ['Score (hand-split)', SCORE_MIDI],
]) {
  test(`${label}: parses, loads piano, and plays`, async ({ page }) => {
    await setupPage(page)
    const bytes = Array.from(readFileSync(midiPath))

    const result = await page.evaluate(async (bytes: number[]) => {
      const { parseMidiBytes, preparePlaybackNotes, SplendidGrandPiano } =
        (window as any).testSynth

      const parsed = parseMidiBytes(new Uint8Array(bytes))
      const prepared = preparePlaybackNotes(parsed.notes)

      const ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()

      const gain = ctx.createGain()
      gain.gain.value = 0.4
      gain.connect(ctx.destination)

      const piano = new SplendidGrandPiano(ctx, { destination: gain })
      const loaded = await Promise.race([
        piano.loaded().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 20_000)),
      ])

      if (!loaded) {
        ctx.close()
        return {
          success: false,
          error: 'Piano samples did not load',
          noteCount: parsed.notes.length,
          tracks: parsed.tracks.map((t: any) => `${t.name}(${t.noteCount})`),
        }
      }

      const now = ctx.currentTime + 0.05
      let scheduled = 0
      for (const note of prepared) {
        piano.start({
          note: note.pitch,
          velocity: note.velocity,
          time: now + note.startTime,
          duration: note.endTime - note.startTime,
        })
        scheduled++
      }

      await new Promise((r) => setTimeout(r, 2000))
      const elapsed = ctx.currentTime - now

      ctx.close()

      return {
        success: true,
        error: null,
        noteCount: parsed.notes.length,
        preparedCount: prepared.length,
        scheduled,
        tracks: parsed.tracks.map((t: any) => `${t.name}(${t.noteCount})`),
        duration: parsed.duration,
        tempo: parsed.tempo,
        elapsed: Math.round(elapsed * 1000),
        contextState: 'running',
      }
    }, bytes)

    console.log(`\n${label} result:`, JSON.stringify(result, null, 2))

    expect(result.success, `Failed: ${result.error}`).toBe(true)
    expect(result.noteCount).toBeGreaterThan(0)
    expect(result.scheduled).toBe(result.preparedCount)
    expect(result.elapsed).toBeGreaterThan(0)
  })
}

test('Score and Transcription have same note onsets', async ({ page }) => {
  await setupPage(page)

  const perfBytes = Array.from(readFileSync(PERF_MIDI))
  const scoreBytes = Array.from(readFileSync(SCORE_MIDI))

  const result = await page.evaluate(
    ({ perfBytes, scoreBytes }) => {
      const { parseMidiBytes } = (window as any).testSynth
      const perf = parseMidiBytes(new Uint8Array(perfBytes))
      const score = parseMidiBytes(new Uint8Array(scoreBytes))

      const perfOnsets = perf.notes
        .map((n: any) => n.startTime)
        .sort((a: number, b: number) => a - b)
      const scoreOnsets = score.notes
        .map((n: any) => n.startTime)
        .sort((a: number, b: number) => a - b)

      const maxDrift = perfOnsets.reduce(
        (max: number, onset: number, i: number) => {
          if (i >= scoreOnsets.length) return max
          return Math.max(max, Math.abs(onset - scoreOnsets[i]))
        },
        0,
      )

      return {
        perfNotes: perf.notes.length,
        scoreNotes: score.notes.length,
        perfTracks: perf.tracks.length,
        scoreTracks: score.tracks.length,
        scoreTrackNames: score.tracks.map((t: any) => t.name),
        maxDriftMs: Math.round(maxDrift * 1000),
        perfDuration: perf.duration,
        scoreDuration: score.duration,
      }
    },
    { perfBytes, scoreBytes },
  )

  console.log('\nOnset comparison:', JSON.stringify(result, null, 2))

  expect(result.perfNotes).toBe(result.scoreNotes)
  expect(result.scoreTracks).toBe(2)
  expect(result.scoreTrackNames).toContain('Left Hand')
  expect(result.scoreTrackNames).toContain('Right Hand')
  expect(result.maxDriftMs).toBeLessThan(5)
})
