# Phase 3: Neural Quantization, Voice Separation & Polish

Replace rule-based quantization with ML models. Add voice/staff separation. Benchmark against ground truth.

## What Changes

| Stage | Phase 1-2 (rule-based) | Phase 3 (ML) |
|-------|----------------------|--------------|
| Beat tracking | IOI histogram | PM2S beat RNN (F1: 0.8884) |
| Downbeat | Assumed from 4/4 | PM2S downbeat RNN (F1: 0.7731) |
| Quantization | Snap to nearest grid | PM2S quantization RNN |
| Hand separation | Pitch threshold (>=60) | PM2S hand RNN |
| Time signature | Default 4/4 | PM2S time sig CNN |
| Key signature | Krumhansl (partitura) | PM2S key sig RNN |
| Voice separation | None | piano_svsep GNN (ISMIR 2024 Best Paper Nominee) |
| Note spelling | Naive (always sharps) | partitura PS13 (Meredith algorithm) |
| Transcription (piano) | Basic Pitch (~85-90% F1) | Onsets & Velocities (96.78% F1) |

## Steps

### 1. Integrate PM2S

[PM2S](https://github.com/cheriell/PM2S) — ISMIR 2022. Five pre-trained neural networks for the full MIDI → score pipeline.

Add to `python/requirements.txt`:
```
pm2s @ git+https://github.com/cheriell/PM2S.git
```

PM2S weights auto-download from Zenodo on first use.

```python
from pm2s import PM2S

pm2s = PM2S()
result = pm2s.process(midi_path)
# result contains:
#   beats, downbeats (with confidence)
#   quantized note onsets/durations (480 ticks/beat)
#   hand part assignment (left/right per note)
#   time signature
#   key signature
```

**PM2S sub-network details (from RESEARCH.md §Stage 3):**

| Sub-network | Architecture | Metric | Score |
|-------------|-------------|--------|-------|
| Beat tracking | RNN | F1 | 0.8884 |
| Downbeat tracking | RNN | F1 | 0.7731 |
| Quantization | RNN | onset positions + note values | 480 ticks/beat output |
| Hand part separation | RNN | left/right per note | — |
| Time signature | CNN | classification | — |
| Key signature | RNN | classification | — |

Weights auto-download from Zenodo. Has working `demo.ipynb`. MIT license.

**Why PM2S over alternatives (from RESEARCH.md §Stage 3):**
- **MIDI2ScoreTransformer** (ISMIR 2024) is higher quality (SOTA on MUSTER metrics) BUT requires custom forks of 3+ packages, MuseScore binary, and has incomplete inference docs — research code, not production-ready
- **music21** quantization is purely mathematical grid snapping (16th + triplet-8th default) — docs explicitly say to use Finale for live/performance MIDI
- **MuseScore CLI** (`mscore -o output.musicxml input.mid`) produces spurious 128th notes even with "human performance" flag
- PM2S is the best balance of quality, pre-trained availability, and production readiness

**Future upgrade path**: When MIDI2ScoreTransformer matures or EngravingGNN (TENOR 2025) releases its code, swap in as a drop-in replacement for PM2S.

### 2. Integrate piano_svsep

[piano_svsep](https://github.com/CPJKU/piano_svsep) — ISMIR 2024 Best Paper Nominee. GNN for voice separation, staff assignment, chord clustering.

```
piano_svsep @ git+https://github.com/CPJKU/piano_svsep.git
```

Pre-trained weights at `pretrained_models/model.ckpt` in the repo.

**Exact CLI usage (from RESEARCH.md §Stage 4):**

```bash
python launch_scripts/predict.py \
  --model_path pretrained_models/model.ckpt \
  --score_path input.musicxml \
  --save_path output.mei
```

**Critical requirement**: Input must be quantized MusicXML. Pipeline becomes:

```
audio → transcribe → PM2S quantize → export temp MusicXML
  → piano_svsep predict → voiced/staffed MusicXML → final output
```

**Known limitations (from RESEARCH.md §Stage 4):**
- ONNX export is non-trivial — GNNs have variable-sized graph inputs
- Only works for piano (piano-specific model)
- Output is MEI format — needs conversion back to MusicXML via partitura
- Requires quantized input — quality depends on PM2S output quality

**Alternative for non-piano stems**: partitura's rule-based Chew & Wu voice separation algorithm — less accurate but works on any instrument.

**Future upgrade**: EngravingGNN (TENOR 2025, [arxiv 2509.19412](https://arxiv.org/html/2509.19412)) predicts voice + staff + spelling + key + clef + stems in a single multi-task GNN. Code not yet released, but would replace piano_svsep + PS13 + key estimation in one model.

### 3. Upgrade Transcription to Onsets & Velocities

Replace basic-pitch with [Onsets & Velocities](https://github.com/andres-fr/iamusica_training) for piano stems:

- **96.78% onset F1** on MAESTRO (vs ~85-90% for basic-pitch) — EUSIPCO 2023
- Pure CNN, 3.1M params (~180x Basic Pitch's ~17K, but still small)
- Piano-specific by design — trained on MAESTRO, inherently less prone to overtone confusion
- Real-time capable on commodity hardware
- Trivial ONNX export (pure CNN, no recurrent layers)

```python
import onnxruntime as ort

session = ort.InferenceSession("onsets_velocities.onnx")
output = session.run(None, {"audio": audio_array})
```

**ONNX export path:**
1. Load PyTorch checkpoint from `iamusica_training` repo
2. `torch.onnx.export()` — straightforward for pure CNNs
3. Run inference via `onnxruntime` (avoids PyTorch dependency for transcription)

Keep basic-pitch as fallback for non-piano stems (guitar, bass, vocals) — basic-pitch is instrument-agnostic while Onsets & Velocities is piano-only.

**Other transcription options evaluated (from RESEARCH.md §Stage 2):**

| Model | Why Not (for now) |
|-------|------------------|
| Onsets and Frames (`@magenta/music`) | Uses unidirectional LSTMs (Python uses bidirectional) — lower accuracy, requires browser `AudioContext` |
| ByteDance Piano Transcription | 96.72% F1 but large model, no easy ONNX path |
| MT3 family | ~300M+ params, autoregressive T5 Transformer — not ONNX-feasible, randomly reassigns notes between instruments |
| Mobile-AMT (EUSIPCO 2024) | ~95% F1, lightweight but untested ONNX path |
| hFT-Transformer | ~96%+ F1 but complex Hierarchical Transformer architecture |

### 4. Note Spelling with PS13

Use partitura's Meredith PS13 algorithm (from RESEARCH.md §Stage 5):

```python
import partitura

score = partitura.load_musicxml(temp_musicxml)
partitura.musicanalysis.estimate_spelling(score)
partitura.save_musicxml(score, output_path)
```

Resolves MIDI 61 → C# or Db based on surrounding harmonic context.

**Note spelling quality ladder (from RESEARCH.md §Stage 5):**

| Approach | Quality |
|----------|---------|
| Key-based lookup | Low — fixed mapping ignoring context |
| Krumhansl-Schmuckler key detection + lookup | Medium — detects key but doesn't handle modulations |
| PS13 algorithm (Meredith) | Good — context-aware, handles chromatic passages |
| EngravingGNN multi-task prediction | Best — but not yet released |

PS13 is the best currently available option. Already in partitura, no extra dependencies.

### 5. MusicXML Validation

Validate output against the official MusicXML 4.0 XSD:

```python
from lxml import etree

xsd = etree.XMLSchema(etree.parse("musicxml.xsd"))
doc = etree.parse(output_path)
xsd.validate(doc)
```

**Validation options (from RESEARCH.md §Stage 6):**

| Tool | How | What It Checks |
|------|-----|---------------|
| `lxml` + XSD (Python) | `XMLSchema.validate()` | Programmatic XSD validation — use in pipeline |
| `xmllint` + XSD | `xmllint --schema musicxml.xsd file.musicxml --noout` | CLI alternative |
| MuseScore CLI | `mscore --export-to /dev/null file.musicxml` | Practical import test — catches musical issues XSD misses |
| music21 | `score.isWellFormedNotation()` | Musical structure (not XML syntax) |

Official XSD from [W3C GitHub](https://github.com/w3c/musicxml). **Important**: XSD has broken external URLs — change `http://www.musicxml.org/xsd/` to local paths before use.

**MusicXML structural requirements (from RESEARCH.md §Stage 6):**
- `divisions` element (time units per quarter note, typically 4-16)
- `part-list` structure with score-parts
- `attributes` block (key, time, clef, divisions) at start of each part
- Notes: pitch (step/alter/octave), duration, type, voice, staff
- `<chord/>` tag for simultaneous notes in same voice
- Tied notes at beat boundaries
- Beam grouping per time signature convention
- Rests to fill gaps

### 6. Benchmarking

#### Metrics Stack (from RESEARCH.md §Benchmarking)

| Tool | What It Measures | Install |
|------|-----------------|---------|
| **mir_eval** | Note-level P/R/F1 (onset, pitch, offset) | `pip install mir_eval` |
| **musicdiff** | Notation-level edit distance (OMR-NED) | `pip install musicdiff` |
| **MUSTER** | 6 score transcription error rates | ZIP from [GitHub](https://amtevaluation.github.io/) |
| **MV2H** | Multi-pitch, voice, meter, value, harmony | Java |
| **mpteval** | Musical performance metrics (timing, articulation, harmony, dynamics) | `pip install mpteval` |

#### Note-Level Accuracy (mir_eval + MAESTRO)

```python
import mir_eval

scores = mir_eval.transcription.evaluate(
    ref_intervals, ref_pitches,
    est_intervals, est_pitches
)
```

**Default tolerances**: onset ±50ms, pitch ±50 cents, offset 20% of duration or 50ms minimum.

**MAESTRO v3 dataset:**
- 1,276 piano performances
- WAV + aligned MIDI (3ms accuracy)
- 101 GB full / 56 MB MIDI-only
- Download: `https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.zip`

Add a benchmark command:
```bash
audio2sheets benchmark --dataset maestro --split test --output results.json
```

#### Notation Quality (musicdiff + ASAP)

```bash
python3 -m musicdiff -o omrned -- ground_truth.musicxml predicted.musicxml
```

Outputs OMR-NED (Normalized Edit Distance) as JSON. Compares notes, beams, ornaments, ties, dynamics.

**ASAP dataset:**
- 222 scores, 1,068 performances
- MusicXML + aligned performance MIDI
- ~2 GB
- [GitHub: fosfrancesco/asap-dataset](https://github.com/fosfrancesco/asap-dataset)

#### Benchmark Pipeline Design (from RESEARCH.md §Benchmarking)

Two-tier evaluation:
- **Tier 1**: MIDI proxy — convert both ground truth MIDI and predicted MusicXML to note arrays (via partitura), compare with mir_eval
- **Tier 2**: Notation quality — compare MusicXML with musicdiff (ASAP dataset only, which has MusicXML ground truth)

```bash
audio2sheets benchmark --dataset maestro --subset test --output results.json
audio2sheets benchmark --dataset asap --tier notation --output notation_results.json
```

### 7. Beat Tracking in Node.js (Optional)

For future Node.js-native beat tracking without Python (from RESEARCH.md §Stage 3):

| Tool | Type | Quality |
|------|------|---------|
| **essentia.js** | WASM (C++ compiled) | Decent — `BeatTrackerMultiFeature`, `BeatTrackerDegara`, `RhythmExtractor2013`. Requires 44100 Hz input |
| **web-audio-beat-detector** | Pure JS | Basic (energy-based) |
| **beat_this** (CPJKU, ISMIR 2024) | PyTorch (Python only) | Best — Transformer beat tracker |

essentia.js is the only viable JS option if we ever want to move beat tracking out of Python.

### 8. Updated Pipeline

```
python/pipeline.py (Phase 3)
  │
  ├─ 1. separate()              ← Demucs (Phase 2)
  │
  ├─ 2. transcribe()            ← Onsets & Velocities for piano (96.78% F1),
  │                                basic-pitch for others (~85-90% F1)
  │
  ├─ 3. pm2s.process()          ← beat (F1: 0.89) / downbeat (F1: 0.77) /
  │                                quantize / hands / time-sig / key-sig
  │
  ├─ 4. export temp MusicXML    ← partitura
  │
  ├─ 5. piano_svsep.predict()   ← voice separation + staff assignment (piano only)
  │     partitura Chew & Wu     ← voice separation (non-piano stems)
  │
  ├─ 6. estimate_spelling()     ← PS13 note spelling (Meredith algorithm)
  │
  ├─ 7. validate()              ← lxml XSD validation against MusicXML 4.0
  │
  └─ 8. output final MusicXML
```

## Updated Requirements

```
basic-pitch>=0.3.0
partitura>=1.5.0
demucs>=4.0.0
onnxruntime>=1.16.0
pm2s @ git+https://github.com/cheriell/PM2S.git
piano_svsep @ git+https://github.com/CPJKU/piano_svsep.git
mir_eval
musicdiff
torch
torchaudio
numpy
lxml
```

Total venv size: ~3-4 GB.

## Competitive Context (from RESEARCH.md §Competitive Landscape)

| Tool | Output | Quality | Multi-instrument |
|------|--------|---------|-----------------|
| AnthemScore ($29-99) | MusicXML, MIDI | Good (solo) | No |
| Klangio (subscription) | MusicXML, MIDI, PDF | Mixed reviews | Limited |
| Melodyne ($99-699) | MIDI only | Best pitch detection | No |
| **audio2sheets (Phase 3)** | MusicXML | Neural quantization + voice separation | Yes (Demucs) |

The "last mile" (MIDI → readable notation) is the least automated and most underserved part of the competitive landscape. Phase 3 specifically targets this gap with PM2S + piano_svsep.

## What This Phase Delivers

- Neural beat/downbeat tracking (PM2S, F1: 0.89/0.77) — handles rubato, tempo changes
- Neural quantization — proper note values instead of grid snapping
- Left/right hand separation for piano (PM2S)
- Voice separation and staff assignment (piano_svsep GNN)
- Correct note spelling (C# vs Db) via PS13 (Meredith algorithm)
- Upgraded piano transcription (Onsets & Velocities, 96.78% F1 on MAESTRO)
- MusicXML 4.0 schema validation (lxml + official XSD)
- Benchmark suite: mir_eval (MAESTRO) + musicdiff (ASAP)
- Measurable, reproducible quality metrics
- Future-ready for EngravingGNN and MIDI2ScoreTransformer upgrades
