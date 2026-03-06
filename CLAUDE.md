# CLAUDE.md

Quick reference for working on audio2sheets.

## Architecture

**Hybrid Tauri 2 + SolidJS + Python ML pipeline.** Three layers:

1. **Frontend** (`app/src/`): SolidJS UI — upload/record audio, show progress, display sheet music
2. **Rust backend** (`app/src-tauri/src/`): Tauri commands — spawns Python subprocess, streams progress
3. **Python pipeline** (`python/pipeline.py`): Demucs separation → Transkun transcription → music21 MusicXML

### Tauri ↔ Python Communication

Python subprocess communicates via stdio:
- **stderr**: JSON progress lines `{"stage": "separating", "percent": 25}`
- **stdout**: Final result JSON `{"output": "path.musicxml", "midi": "path.mid", "metadata": {...}}`
- **exit code 1**: Error (last non-JSON stderr line is the error message)

Rust reads stderr in a thread, emits `pipeline:progress` events to the frontend.

### Pipeline Stages

```
Audio (MP3/WAV)
  → Demucs htdemucs_6s (CPU) → piano stem WAV
  → librosa beat_track → BPM estimate
  → Transkun V2 (CPU) → MIDI notes
  → Split by pitch (>=60 = right hand)
  → pretty_midi → MIDI file
  → music21 → MusicXML + metadata
```

### Known Limitations

- **No sustain pedal** — Transkun V2 doesn't output CC64 events. Notes end at key release.
- **Single BPM** — librosa gives one tempo for the whole piece. Rubato/tempo changes produce wrong grids.
- **No quantization** — Notes are at raw predicted times. MusicXML rhythm notation is messy.
- **Concert piano only** — Model trained on MAESTRO (Steinway). Synths/electric pianos produce garbage.

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

Key Python dependencies: `torch`, `demucs`, `librosa`, `transkun` (custom fork), `music21` (custom fork), `pretty_midi`

## Key Files

| File | Role |
|------|------|
| `python/pipeline.py` | Full end-to-end pipeline (Demucs → Transkun → music21) |
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

## Tech Stack

Tauri 2 • SolidJS 1.9 • TypeScript 5.8 • Vite 6.3 • Tailwind 4.1 • PyTorch • Demucs • Transkun V2 • music21 • OpenSheetMusicDisplay
