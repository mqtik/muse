# CLAUDE.md

Quick reference for working on audio2sheets.

## Architecture

**Hybrid Tauri 2 + SolidJS + Python ML pipeline.** Three layers:

1. **Frontend** (`app/src/`): SolidJS UI — upload/record audio, show progress, MIDI playback
2. **Rust backend** (`app/src-tauri/src/`): Tauri commands — spawns Python subprocess, streams progress
3. **Python pipeline** (`python/pipeline.py`): Dual-backend — Transkun (solo piano) or YourMT3+ (multi-instrument)

### Tauri ↔ Python Communication

Python subprocess communicates via stdio:
- **stderr**: JSON progress lines `{"stage": "separating", "percent": 25}`
- **stdout**: Final result JSON `{"midi": "path.mid", "perf_midi": "path.perf.mid", "metadata": {...}}`
- **exit code 1**: Error (last non-JSON stderr line is the error message)

Rust reads stderr in a thread, emits `pipeline:progress` events to the frontend.

### Pipeline Stages

**Transkun backend** (default, `--backend transkun`):
```
Audio → Demucs htdemucs_6s → piano stem → Transkun V2 → PM2S hand-split → score MIDI + perf MIDI
```

**YourMT3+ backend** (`--backend yourmt3`):
```
Audio → YourMT3+ (YPTF.MoE+Multi) → multi-track MIDI (single file, copied to both .mid and .perf.mid)
```

YourMT3+ model lives at `yourmt3/` in the project root (bundled with the app).

### Known Limitations

- **Transkun: Concert piano only** — Model trained on MAESTRO (Steinway). Synths/electric pianos produce garbage.
- **Quantization onset drift** — PM2S RNN introduces ~164ms mean onset drift (p95=385ms). See `--diagnostics` flag.
- **YourMT3+: CPU inference is slow** — ~2 min for 30s audio on CPU.

## Running & Building

```bash
# Tauri desktop app
cd app
npm install
npm run dev              # Vite dev server + Tauri window
npm run build            # Vite production build
npm run tauri build      # Full desktop app build

# Node.js CLI library
npm run build            # TypeScript → dist/
npm run dev              # TypeScript watch
npm test                 # Vitest
```

**DO NOT** kill the app or run build commands automatically — user manages process lifecycle.

## Python Environment

```bash
# Venv lives at ~/.audio2sheets/venv/
# Created automatically on first pipeline run, or manually:
python3 -m venv ~/.audio2sheets/venv
~/.audio2sheets/venv/bin/pip install -r python/requirements.txt
```

Key Python dependencies: `torch`, `demucs`, `librosa`, `transkun` (custom fork), `pretty_midi`, `mido`

## Key Files

| File | Role |
|------|------|
| `python/pipeline.py` | Dual-backend pipeline (Transkun or YourMT3+) |
| `app/src-tauri/src/pipeline.rs` | Tauri commands: `start_pipeline`, `save_recording` |
| `app/src-tauri/src/setup.rs` | Python venv/script path discovery |
| `app/src/stores/pipelineStore.ts` | Frontend pipeline state (progress, result, metadata) |
| `app/src/stores/appStore.ts` | View navigation state |
| `app/src/views/` | Page-level views (Upload, Recording, Processing, Result) |
| `app/src/lib/commands.ts` | Tauri `invoke()` wrappers |
| `app/src/lib/events.ts` | Tauri event listeners (`pipeline:progress`) |
| `src/cli.ts` | Node.js CLI entry point |
| `src/convert.ts` | Node.js pipeline orchestration |
| `src/python-manager.ts` | Venv setup, pip install |

## Code Quality

**TypeScript only** — Never create `.js` files for new code.

**No comments** — Code should be self-documenting. If you feel a comment is needed, refactor to be clearer.

**Quality over shortcuts** — Always choose the approach that produces the highest-quality output, even if it's more complex or slower. This is a long-term project. Use the best available models and algorithms (e.g., the full PM2S quantization RNN, not simpler nearest-beat heuristics). Never trade accuracy for implementation speed.

**Commit messages**: One line, precise and short. Do not mention Claude or reference this file.

## Testing Standards

### What to Test

- User-visible behavior and public API outcomes
- Test observable outcomes, not internal state

### How to Write Tests

- Use helpers from `tests/helpers.ts`: `loadMidi()`, `validateMidiNotes()`, `matchNotes()`, `TEST_ENV`, `cleanupFiles()`, `getMidiOutputPaths()`, `tempPath()`
- Never duplicate stubs, factories, or constants across test files
- Never use raw `readFileSync` + `parseMidiBytes` — use `loadMidi()`
- Never redeclare `HAS_FULL_STACK` — use `TEST_ENV.hasFullStack`

### The Deliberate Bug Rule

When writing a new test, introduce one intentionally wrong assertion, verify it fails, then fix it. This proves the test validates real behavior.

### Test File Locations

| Directory | Framework | Purpose |
|-----------|-----------|---------|
| `tests/unit/` | Vitest | Pure logic, no I/O |
| `tests/integration/` | Vitest | Python script execution |
| `tests/e2e/` | Vitest | Full pipeline runs |
| `tests/browser/` | Playwright | Browser-based MIDI playback |
| `tests/fixtures/` | — | Test audio/MIDI files |
| `tests/helpers.ts` | — | Shared utilities |

## Tech Stack

Tauri 2 • SolidJS 1.9 • TypeScript 5.8 • Vite 6.3 • Tailwind 4.1 • PyTorch • Demucs • Transkun V2 • YourMT3+ • PM2S • smplr
