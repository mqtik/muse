# audio2sheets — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Consumer (Electron / Tauri / CLI)                                      │
│                                                                         │
│  import { convertAudioToSheet } from 'audio2sheets'                     │
│  // or                                                                  │
│  npx audio2sheets song.mp3 -o song.musicxml                            │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Node.js Layer                                                          │
│                                                                         │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  ┌──────────┐     │
│  │ cli.ts   │→ │ convert.ts │→ │ python-manager.ts │→ │ bridge.ts│     │
│  │          │  │            │  │                    │  │          │     │
│  │ arg parse│  │ orchestrate│  │ find python 3.10+  │  │ spawn    │     │
│  │ file I/O │  │ read result│  │ create venv       │  │ child    │     │
│  │ progress │  │ return XML │  │ pip install deps   │  │ process  │     │
│  └──────────┘  └────────────┘  └──────────────────┘  └────┬─────┘     │
└────────────────────────────────────────────────────────────┼───────────┘
                                                             │
                         ┌───────────────────────────────────┘
                         │  stdin: args
                         │  stderr: {"stage":"transcribing","percent":50}
                         │  stdout: {"output":"/path/to/result.musicxml"}
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Python Layer  (runs inside ~/.audio2sheets/venv/)                      │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ pipeline.py — full pipeline (default)                              │ │
│  │                                                                    │ │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐  │ │
│  │  │ transcribe() │ → │  quantize()  │ → │    to_musicxml()     │  │ │
│  │  │              │   │              │   │                      │  │ │
│  │  │ basic_pitch  │   │ PM2S         │   │ partitura            │  │ │
│  │  │ predict()    │   │ CRNNJoint    │   │ estimate_spelling()  │  │ │
│  │  │              │   │ quantize     │   │ save_musicxml()      │  │ │
│  │  │ audio → MIDI │   │ perf → score │   │ score → .musicxml   │  │ │
│  │  └──────────────┘   └──────────────┘   └──────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Individual scripts (for testing/debugging):                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ transcribe.py│  │ quantize.py  │  │   toxml.py   │                  │
│  │ audio→JSON   │  │ JSON→JSON    │  │  JSON→XML    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│  Phase 2:           Phase 2 diagnostic:                                 │
│  ┌──────────────┐  ┌──────────────┐                                    │
│  │ separate.py  │  │   info.py    │                                    │
│  │ audio→stems  │  │  env check   │                                    │
│  └──────────────┘  └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow — Phase 1 (Solo Piano)

```
  song.mp3
     │
     ▼
 ┌────────────────────────────────────┐
 │  1. TRANSCRIBE (basic_pitch)       │
 │                                    │
 │  MP3 → decode → 22050Hz mono      │
 │  → CNN inference (~17K params)     │
 │  → frames + onsets + contours      │
 │  → outputToNotesPoly()             │
 │                                    │
 │  ⚠ Overtone hallucination          │
 │    onset_threshold: 0.5 → 0.6     │
 │    frame_threshold: 0.3 → 0.4     │
 │                                    │
 │  Output: [(onset, offset,          │
 │            pitch, velocity), ...]  │
 └───────────────┬────────────────────┘
                 │
                 ▼  temp MIDI file
 ┌────────────────────────────────────┐
 │  2. QUANTIZE (PM2S)                │
 │                                    │
 │  CRNNJointPM2S(ticks_per_beat=480) │
 │  → beat tracking (F1: 0.89)       │
 │  → downbeat detection (F1: 0.77)  │
 │  → neural quantization            │
 │  → hand separation (L/R tracks)   │
 │  → key signature detection        │
 │                                    │
 │  Output: Type 1 MIDI with         │
 │    Track 0 (meta), Track 1 (left), │
 │    Track 2 (right), 480 PPQ        │
 └───────────────┬────────────────────┘
                 │
                 ▼
 ┌────────────────────────────────────┐
 │  3. EXPORT (partitura)             │
 │                                    │
 │  → estimate_spelling() (PS13)      │
 │    - C# vs Db from context         │
 │  → save_musicxml()                 │
 │    - divisions, part-list          │
 │    - attributes (key, time, clef)  │
 │    - notes (pitch, duration, type) │
 │    - <chord/> for simultaneous     │
 │    - rests to fill gaps            │
 │                                    │
 │  Output: song.musicxml             │
 └────────────────────────────────────┘
```

## Data Flow — Phase 2 (Multi-Instrument)

```
  song.mp3
     │
     ▼
 ┌────────────────────────────────────┐
 │  0. SEPARATE (Demucs htdemucs_6s)  │
 │                                    │
 │  MP3 → 6 stem WAV files:          │
 │  ┌──────┐ ┌──────┐ ┌───────┐     │
 │  │piano │ │ bass │ │guitar │     │
 │  └──┬───┘ └──┬───┘ └──┬────┘     │
 │  ┌──┴───┐ ┌──┴───┐ ┌──┴────┐     │
 │  │vocals│ │other │ │ drums │     │
 │  └──┬───┘ └──┬───┘ └───────┘     │
 │     │        │      (skipped)     │
 │                                    │
 │  ⚠ Spectral ghosting/leakage      │
 │  → cross-stem deduplication        │
 └───────────────┬────────────────────┘
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
  transcribe  transcribe  transcribe   ... per melodic stem
      │          │          │
      ▼          ▼          ▼
  ┌──────────────────────────────────┐
  │  QUANTIZE + EXPORT               │
  │  shared tempo across all stems    │
  │  → multi-part MusicXML            │
  │                                   │
  │  <part id="P1">Piano</part>      │
  │  <part id="P2">Bass</part>       │
  │  <part id="P3">Guitar</part>     │
  │  <part id="P4">Melody</part>     │
  └──────────────────────────────────┘
```

## Data Flow — Phase 3 (Neural Everything)

```
  song.mp3
     │
     ├──── Demucs (Phase 2)
     │
     ▼
 ┌────────────────────────────────────┐
 │  TRANSCRIBE                        │
 │  Piano: Onsets & Velocities        │
 │         (96.78% F1, 3.1M CNN)      │
 │  Other: Basic Pitch (fallback)     │
 └───────────────┬────────────────────┘
                 │
                 ▼  performance MIDI
 ┌────────────────────────────────────┐
 │  PM2S (5 neural networks)          │
 │                                    │
 │  beat RNN ─────── F1: 0.89        │
 │  downbeat RNN ─── F1: 0.77        │
 │  quantize RNN ─── 480 ticks/beat  │
 │  hands RNN ────── left/right      │
 │  time sig CNN ─── detect meter    │
 │  key sig RNN ──── detect key      │
 └───────────────┬────────────────────┘
                 │
                 ▼  temp MusicXML
 ┌────────────────────────────────────┐
 │  piano_svsep (GNN)                 │
 │  → voice separation                │
 │  → staff assignment                │
 │  → chord clustering                │
 │                                    │
 │  Non-piano: Chew & Wu (partitura) │
 └───────────────┬────────────────────┘
                 │
                 ▼
 ┌────────────────────────────────────┐
 │  PS13 spelling + XSD validation    │
 └───────────────┬────────────────────┘
                 │
                 ▼
            song.musicxml
```

## File Map

```
audio2sheets/
├── src/                          ← Node.js (TypeScript)
│   ├── cli.ts                    ← CLI entry: arg parsing, subcommands
│   ├── index.ts                  ← Library entry: public API exports
│   ├── convert.ts                ← Orchestrator: venv + bridge + result
│   ├── bridge.ts                 ← Spawns Python, parses JSON progress
│   ├── python-manager.ts         ← Venv lifecycle: create, install, find
│   ├── paths.ts                  ← Path constants (PYTHON_DIR, REQUIREMENTS)
│   └── types.ts                  ← TypeScript interfaces
│
├── python/                       ← Python (ML backend)
│   ├── requirements.txt          ← pip dependencies per phase
│   ├── pipeline.py               ← Full pipeline: audio → MusicXML
│   ├── transcribe.py             ← Stage: audio → note events JSON
│   ├── quantize.py               ← Stage: note events → quantized score JSON
│   ├── toxml.py                  ← Stage: quantized score → MusicXML
│   ├── separate.py               ← Stage: audio → stem WAVs (Phase 2)
│   └── info.py                   ← Diagnostic: env, GPU, packages
│
├── tests/                        ← Test suite (TDD)
│   ├── fixtures/                 ← Test audio files (.gitignored)
│   │   └── generate-fixtures.py  ← Synthesize known-good test audio
│   ├── e2e/                      ← End-to-end CLI tests
│   │   ├── pipeline.test.ts      ← Full pipeline: MP3 → MusicXML
│   │   └── subcommands.test.ts   ← Each CLI subcommand
│   ├── integration/              ← Python script tests via bridge
│   │   ├── transcribe.test.ts    ← transcribe.py output validation
│   │   ├── quantize.test.ts      ← quantize.py output validation
│   │   └── toxml.test.ts         ← toxml.py output validation
│   └── unit/                     ← Node.js unit tests
│       ├── python-manager.test.ts← Venv detection/creation
│       └── bridge.test.ts        ← JSON progress parsing
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── README.md
├── ARCHITECTURE.md               ← This file
├── PHASE_1.md
├── PHASE_2.md
├── PHASE_3.md
└── RESEARCH.md
```

## Node ↔ Python Protocol

```
Node.js (bridge.ts)                    Python (any script)
─────────────────                      ──────────────────
spawn('python', [script, args])  ──→   sys.argv parsing

                                 ←──   stderr: {"stage":"transcribing","percent":0}
  onProgress({stage, percent})   ←──   stderr: {"stage":"transcribing","percent":50}
                                 ←──   stderr: {"stage":"quantizing","percent":80}
                                 ←──   stderr: {"stage":"done","percent":100}

  JSON.parse(stdout)             ←──   stdout: {"output":"/path/to/file.musicxml"}
  resolve(result)

  reject(new Error(stderr))      ←──   exit code != 0
```

## Venv Lifecycle

```
First run:
┌──────────────────────────────────────────────┐
│ 1. Find system Python (python3 or python)    │
│ 2. Verify version 3.10+                     │
│ 3. Create venv at ~/.audio2sheets/venv/      │
│ 4. pip install -r requirements.txt           │
│ 5. Run pipeline with venv Python             │
└──────────────────────────────────────────────┘

Subsequent runs:
┌──────────────────────────────────────────────┐
│ 1. Check ~/.audio2sheets/venv/ exists        │
│ 2. Run pipeline with venv Python             │
└──────────────────────────────────────────────┘

Force reinstall:
┌──────────────────────────────────────────────┐
│ audio2sheets setup                           │
│ → pip install --upgrade -r requirements.txt  │
└──────────────────────────────────────────────┘
```

## Test Strategy (TDD via CLI)

### Synthetic Test Fixtures

All tests depend on deterministic input → expected output. We generate our own
test audio files with known notes so we can verify every stage of the pipeline
against ground truth.

```
tests/fixtures/generate-fixtures.py
  │
  │  Uses numpy to synthesize sine waves at exact MIDI frequencies
  │  and scipy.io.wavfile to write 22050 Hz mono WAV files.
  │
  │  No soundfonts, no fluidsynth, no external dependencies.
  │  Pure math → known frequencies → known MIDI pitches.
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Fixture                │ Notes              │ Tests                  │
│────────────────────────┼────────────────────┼────────────────────────│
│ single-c4.wav          │ C4 (261.63 Hz)     │ Simplest possible:     │
│                        │ 1 second           │ 1 note, correct pitch  │
│────────────────────────┼────────────────────┼────────────────────────│
│ c-major-scale.wav      │ C4 D4 E4 F4 G4    │ Sequential notes:      │
│                        │ A4 B4 C5           │ pitch accuracy,        │
│                        │ 0.5s each          │ onset timing, ordering │
│────────────────────────┼────────────────────┼────────────────────────│
│ c-major-chord.wav      │ C4+E4+G4           │ Polyphony:             │
│                        │ simultaneous        │ multiple pitches at    │
│                        │ 2 seconds           │ same onset, chord      │
│────────────────────────┼────────────────────┼────────────────────────│
│ two-hands.wav          │ C3 (left) +        │ Staff assignment:      │
│                        │ C5 (right)          │ pitch < 60 → bass     │
│                        │ simultaneous        │ pitch >= 60 → treble  │
│────────────────────────┼────────────────────┼────────────────────────│
│ silence.wav            │ (none)              │ Edge case:             │
│                        │ 2 seconds           │ no notes, no crash    │
│────────────────────────┼────────────────────┼────────────────────────│
│ short-burst.wav        │ C4, 100ms           │ Edge case:             │
│                        │                     │ minimum duration       │
│────────────────────────┼────────────────────┼────────────────────────│
│ long-note.wav          │ C4, 8 seconds       │ Sustained notes:       │
│                        │                     │ duration accuracy      │
└─────────────────────────────────────────────────────────────────────┘

Each fixture has a matching JSON ground truth:

  single-c4.expected.json
  {
    "notes": [
      {"pitch": 60, "startTime": 0.0, "duration": 1.0}
    ]
  }

  c-major-scale.expected.json
  {
    "notes": [
      {"pitch": 60, "startTime": 0.0, "duration": 0.5},
      {"pitch": 62, "startTime": 0.5, "duration": 0.5},
      {"pitch": 64, "startTime": 1.0, "duration": 0.5},
      ...
    ]
  }
```

**Why sine waves work**: Basic Pitch is trained on polyphonic audio and handles
pure tones well — a single-frequency sine at 261.63 Hz maps cleanly to MIDI 60
(C4). Sine waves avoid timbre ambiguity, making test assertions straightforward.
If Basic Pitch struggles with pure sines (overtone model expects harmonics), we
fall back to summing harmonics: `f + 0.5*2f + 0.25*3f` to simulate piano-like
timbre, still at known frequencies.

**Ground truth tolerances**: Basic Pitch operates at ~86 fps (11.6ms per frame).
Tests allow ±50ms onset tolerance and ±1 semitone pitch tolerance to account
for model imprecision on synthetic audio. These match mir_eval defaults.

### Test Layers

```
Layer 1: Unit Tests (fast, no Python)
├── bridge.ts JSON parsing
├── python-manager.ts path detection
└── cli.ts argument parsing

Layer 2: Integration Tests (need Python + venv)
├── transcribe.py + single-c4.wav → JSON has 1 note at pitch 60?
├── transcribe.py + c-major-scale.wav → JSON has 8 notes in order?
├── transcribe.py + silence.wav → JSON has 0 notes, no crash?
├── quantize.py + transcribe output → valid JSON with parts/notes?
├── toxml.py + quantize output → valid XML, parseable, has <note> elements?
└── info.py → JSON with python version, package versions?

Layer 3: E2E Tests (full pipeline)
├── single-c4.wav → MusicXML → parse → 1 note, pitch C4?
├── c-major-scale.wav → MusicXML → parse → 8 notes, correct order?
├── c-major-chord.wav → MusicXML → has <chord/> tags?
├── two-hands.wav → MusicXML → notes on staff 1 and staff 2?
├── CLI exit codes: 0 on success, non-zero on bad input
├── CLI --help and --version work
├── CLI missing input file → helpful error message
└── Progress: stderr contains valid JSON lines with stage + percent
```

## Quality Targets by Phase

```
Phase 1 (PM2S neural quantization):
├── Onset F1: ~85-90% (Basic Pitch)
├── Beat tracking: F1 0.89 (PM2S)
├── Quantization: neural, 480 ticks/beat (PM2S)
├── Hand separation: neural L/R (PM2S)
├── Key detection: neural (PM2S)
├── Spelling: PS13 (partitura)
└── MusicXML with real metadata

Phase 2 (+ Demucs):
├── Same per-stem accuracy as Phase 1
├── Multi-instrument MusicXML output
└── Cross-stem deduplication

Phase 3 (neural):
├── Onset F1: 96.78% (Onsets & Velocities, piano)
├── Beat tracking: F1 0.89 (PM2S)
├── Downbeat: F1 0.77 (PM2S)
├── Neural quantization (handles rubato)
├── Voice separation (piano_svsep GNN)
└── Benchmarked against MAESTRO + ASAP
```
