# Phase 1: Solo Piano Pipeline with Neural Quantization

Node.js CLI that manages its own Python environment. User only needs Python 3.10+ installed.

## Pipeline

```
Audio (MP3/WAV/OGG/FLAC)
  │
  ▼
┌──────────────────────────────────────────┐
│  1. TRANSCRIBE — basic-pitch v0.4.0      │
│                                          │
│  predict(audio_path) → midi_data         │
│  midi_data.write(tmp_perf.mid)           │
│                                          │
│  Input: file path (librosa handles       │
│    decode + resample to 22050Hz)         │
│  Output: PrettyMIDI object              │
└────────────────┬─────────────────────────┘
                 │  performance MIDI (unquantized)
                 ▼
┌──────────────────────────────────────────┐
│  2. QUANTIZE — PM2S (5 neural networks)  │
│                                          │
│  CRNNJointPM2S().convert(               │
│    perf.mid → score.mid                  │
│  )                                       │
│                                          │
│  Outputs quantized MIDI with:            │
│  - Beat-aligned note positions (480 PPQ) │
│  - Hand separation (L/R → 2 tracks)     │
│  - Key signature detection              │
│  - Tempo from beat spacing              │
└────────────────┬─────────────────────────┘
                 │  score MIDI (quantized, 480 PPQ)
                 ▼
┌──────────────────────────────────────────┐
│  3. EXPORT — partitura v1.8.0            │
│                                          │
│  load_score_midi(score.mid)              │
│  estimate_spelling(part) → apply         │
│  save_musicxml(score, output.musicxml)   │
│                                          │
│  Output: MusicXML 3.1 Partwise           │
└──────────────────────────────────────────┘
```

## Architecture

```
audio2sheets (Node.js)
  │
  ├─ cli.ts              ← entry point, subcommands
  ├─ python-manager.ts   ← creates venv, clones PM2S, installs deps
  ├─ bridge.ts           ← spawns Python scripts, parses JSON output
  ├─ paths.ts            ← shared path constants
  │
  └─ python/             ← Python backend (all ML work)
     ├─ requirements.txt
     ├─ pipeline.py      ← full pipeline: audio → MusicXML
     ├─ transcribe.py    ← audio → note events JSON
     ├─ quantize.py      ← note events → quantized score JSON
     ├─ toxml.py         ← quantized score → MusicXML
     ├─ separate.py      ← Demucs stem separation (Phase 2)
     └─ info.py          ← environment diagnostics
```

## Steps

### 1. Transcription (`python/transcribe.py`)

Uses `basic_pitch.inference.predict()` with configurable thresholds.

```python
from basic_pitch.inference import predict

_, midi_data, note_events = predict(
    audio_path,
    onset_threshold=0.5,   # raise to 0.6 for piano
    frame_threshold=0.3,   # raise to 0.4 for piano
)
```

### 2. Neural Quantization (`python/pipeline.py` → PM2S)

PM2S replaces the rule-based `performance_to_score()` with 5 neural networks:

```python
from pm2s import CRNNJointPM2S

pm2s = CRNNJointPM2S(ticks_per_beat=480, notes_per_beat=[1, 2, 3, 4, 6, 8])
pm2s.convert(
    performance_midi_file="perf.mid",
    score_midi_file="score.mid",
    include_key_signature=True,
)
```

PM2S provides:
- Beat tracking (F1: 0.89) and downbeat detection (F1: 0.77)
- Neural quantization at 480 ticks/beat
- Hand separation (left/right → 2 MIDI tracks)
- Key signature detection

### 3. MusicXML Export (`python/pipeline.py` → partitura)

```python
import partitura as pt

score = pt.load_score_midi("score.mid")
for part in score.parts:
    spelling = pt.musicanalysis.estimate_spelling(part)
    for note, sp in zip(part.notes, spelling):
        note.step, note.alter, note.octave = sp["step"], sp["alter"], sp["octave"]
pt.save_musicxml(score, "output.musicxml")
```

### 4. Node ↔ Python Communication

Progress via JSON lines on stderr. Result + metadata on stdout.

```
stderr: {"stage": "transcribing", "percent": 0}
stderr: {"stage": "quantizing", "percent": 40}
stderr: {"stage": "generating", "percent": 70}
stderr: {"stage": "done", "percent": 100}
stdout: {"output": "/path/to/output.musicxml", "metadata": {"key": "C", "timeSignature": [4, 4]}}
```

## Python Dependencies

```
basic-pitch>=0.3.0       # audio → MIDI transcription
partitura>=1.5.0          # MusicXML export, note spelling
numpy                     # required by all
torch                     # required by PM2S
mido                      # required by PM2S
mir_eval                  # required by PM2S

# PM2S (cloned to ~/.audio2sheets/pm2s/)
# Model weights auto-download from Zenodo on first use
```

Python 3.10+ only (PM2S + torch compatibility).

## Auto-Setup on First Run

```
$ audio2sheets song.mp3

[audio2sheets] First run — setting up Python environment...
[audio2sheets] Creating virtual environment at ~/.audio2sheets/venv/
[audio2sheets] Installing dependencies...
[audio2sheets] Cloning PM2S...
[audio2sheets] Setup complete.
[audio2sheets] Processing song.mp3...
```

1. Finds system Python (verifies 3.10-3.11)
2. Creates venv at `~/.audio2sheets/venv/`
3. Installs pip dependencies
4. Clones PM2S to `~/.audio2sheets/pm2s/`
5. Installs PM2S requirements

## What This Phase Delivers

- `audio2sheets song.mp3 -o song.musicxml` works end-to-end
- Neural quantization via PM2S (vs naive grid-snap)
- Hand separation (left/right from PM2S, not pitch threshold)
- Key signature detection
- Note spelling estimation (PS13 via partitura)
- Valid MusicXML output with real metadata
- Individual stage testing: `transcribe`, `quantize`, `toxml` subcommands
- Library export: `import { convertAudioToSheet } from 'audio2sheets'`

## Upgrade Path

- **Phase 2**: Demucs multi-instrument + per-stem transcription
- **Phase 3**: O&V piano transcription (96.78% F1), piano_svsep voice separation
