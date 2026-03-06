# audio2sheets — Research Findings

## Pipeline Architecture

```
Audio → Decode → Transcribe → Quantize → Voice/Staff Split → Note Spelling → MusicXML
         │          │            │              │                  │
         │          │            │              │                  └─ MIDI 61 = C# or Db?
         │          │            │              └─ Which notes go to which voice/staff?
         │          │            └─ 1.347s → "eighth note on beat 2"
         │          └─ Overtone hallucinations, onset/offset ambiguity
         └─ Format support, resampling to 22050 Hz mono
```

Every arrow is a failure point. Errors compound across stages.

---

## Stage 1: Audio Decoding

Transcription models require mono audio at a specific sample rate (22050 Hz for Basic Pitch, 16000 Hz for some others).

| Approach | Formats | Resampling | Native Deps | Size |
|----------|---------|------------|-------------|------|
| `audio-decode` + resampler | MP3, WAV, OGG, FLAC | Separate step needed | No (pure JS/WASM) | ~2MB |
| `node-web-audio-api` (IRCAM) | MP3, WAV, OGG, FLAC, AAC, ALAC | Built-in (OfflineAudioContext) | Yes (Rust N-API) | ~15MB |
| ffmpeg via `child_process` | Everything | Built-in (`-ar 22050 -ac 1`) | Binary | ~70-100MB |

### `audio-decode`
- Pure JS/WASM, uses `mpg123-decoder` (MP3), `node-wav`, `@wasm-audio-decoders/flac`, etc.
- Returns `AudioBuffer` polyfill with `.getChannelData()` → Float32Array
- Does NOT resample or downmix — returns at file's native sample rate
- 461 npm dependents, last published ~7 months ago

### `node-web-audio-api` (IRCAM)
- Rust N-API bindings to `web-audio-api-rs`, uses Symphonia for decoding
- Provides real `AudioContext` / `OfflineAudioContext`
- `OfflineAudioContext(1, length, 22050)` + `decodeAudioData()` auto-resamples to target rate
- v1.0.7, actively maintained by IRCAM (French audio research institute)
- `decodeAudioData` blocks thread (acceptable for batch processing)

### ffmpeg via `child_process`
- `ffmpeg-static` provides binary, no system install needed
- Single command: decode + resample + mono downmix
- `fluent-ffmpeg` is ARCHIVED (May 2025) — use raw `child_process.spawn()` with args
- `@ffmpeg/ffmpeg` (WASM) does NOT support Node.js

### Resampling Libraries (if using `audio-decode`)

| Library | Type | Quality |
|---------|------|---------|
| `@alexanderolsen/libsamplerate-js` | WASM (libsamplerate) | Excellent |
| `wave-resampler` | Pure JS | Good |
| `wasm-audio-resampler` | WASM (soxr) | Excellent |

44100→22050 is factor-of-2 integer decimation (simplest case). 48000→22050 is fractional (320/147), needs proper library.

### Mono Downmixing

W3C Web Audio spec: `mono[i] = (left[i] + right[i]) * 0.5`. Average prevents clipping. No library needed.

---

## Stage 2: Transcription (Audio → Note Events)

### Model Comparison for Piano

| Model | Params | MAESTRO Onset F1 | Architecture | ONNX Feasible | Node.js Path |
|-------|--------|-------------------|--------------|----------------|-------------|
| **Basic Pitch** | ~17K | ~85-90%* | CNN | Already has ONNX | `@spotify/basic-pitch` (npm) |
| **Onsets & Velocities** | ~3.1M | **96.78%** | Pure CNN | Yes (easy) | ONNX via `onnxruntime-node` |
| **Onsets and Frames** | ~21M | ~94.8% | CNN+LSTM | In TF.js via `@magenta/music` | `@magenta/music` (npm) |
| **ByteDance Piano** | Large | 96.72% | CNN | Possible | Cloud API on Replicate ($0.08/run) |
| **Mobile-AMT** | Small | ~95% | Lightweight CNN+RNN | Yes | ONNX (untested) |
| **hFT-Transformer** | Medium | ~96%+ | Hierarchical Transformer | Possible | Complex |
| **MT3 family** | ~300M+ | N/A | T5 Transformer | No (autoregressive) | Not viable |

*Basic Pitch not typically benchmarked on MAESTRO; estimate based on general-purpose vs specialized models.

### Key Finding: Onsets & Velocities

**Best candidate for high-quality piano transcription in Node.js:**
- [GitHub: andres-fr/iamusica_training](https://github.com/andres-fr/iamusica_training)
- Pure CNN → trivial ONNX export
- 96.78% onset F1 on MAESTRO (state-of-the-art for pure-CNN approach)
- Real-time capable on commodity hardware
- Only 3.1M params (~180x Basic Pitch, but still small)
- Piano-specific by design

### Overtone Hallucination Mitigation

Basic Pitch's overtone problem can be partially addressed:

1. **Tune existing parameters**: Raise `onset_threshold` (0.5→0.6-0.7), `frame_threshold` (0.3→0.4-0.5) for piano
2. **Harmonic suppression post-processor**: For each note, check concurrent notes at harmonic intervals (+12, +19, +24 semitones). Suppress if velocity < 35% of fundamental AND no independent onset
3. **Use a better model**: Onsets & Velocities is piano-specific and trained on MAESTRO — inherently less prone to overtone confusion because the model has learned piano harmonic structure

### Basic Pitch Details

- **Input**: 22050 Hz mono Float32Array
- **Raw output**: frames (n_times × 88), onsets (n_times × 88), contours (n_times × 264)
- **Frame rate**: 86 fps (22050/256)
- **Window**: 2 seconds (43,844 samples), 30 frames overlap
- **Post-processing**: `outputToNotesPoly()` → `addPitchBendsToNoteEvents()` → `noteFramesToTime()`
- **Speed**: ~6-17s for 3-min song (Node.js with tfjs-node), ~110 windows processed sequentially
- **Does NOT output**: tempo, time signature, key signature, dynamics, voice info
- **`@tensorflow/tfjs-node`**: Archived, stuck at v3.x — potential maintenance risk

### Onsets and Frames via `@magenta/music`

- Full TF.js port exists: `OnsetsAndFrames` class
- Uses **unidirectional** LSTMs (Python version uses bidirectional) — slightly lower accuracy
- Requires browser `AudioContext` for resampling — needs adaptation for pure Node.js
- Community headless fork: [GoldenBread/magenta-js.music](https://github.com/GoldenBread/magenta-js.music)
- ~40-80 MB model size

### NeuralNote / RTNeural (C++ via N-API)

[NeuralNote](https://github.com/DamRsn/NeuralNote) runs Basic Pitch in C++ using RTNeural + ONNXRuntime. The model inference code (`Lib/Model`) is separable from the JUCE plugin framework. Could be wrapped as a Node.js N-API addon for native performance. However, `onnxruntime-node` directly is simpler and more flexible.

### Commercial APIs

- **Klangio API**: [api-docs.klang.io](https://api-docs.klang.io/) — supports piano, guitar, bass, vocals. MusicXML + MIDI output. Developer pricing requires contacting sales.
- **ByteDance on Replicate**: [replicate.com/bytedance/piano-transcription](https://replicate.com/bytedance/piano-transcription) — $0.078/run, ~6 min/transcription, 96.72% onset F1, includes pedal detection.

---

## Stage 3: Quantization (Continuous Time → Musical Notation)

### The Problem

Converting `{startTime: 1.347s, duration: 0.298s}` into `{beat: 2, duration: "eighth"}` requires:
1. Knowing the tempo (which can vary — rubato, accelerando)
2. Handling expressive timing (performers deviate 20-50ms intentionally)
3. Detecting tuplets (triplets vs sloppy timing)
4. Deciding ties vs dots based on beat boundaries
5. Filling rests between notes

### Available Pre-Trained Models

| Tool | Pre-trained | Framework | What It Does | Quality |
|------|-------------|-----------|-------------|---------|
| **PM2S** | Yes (auto-download from Zenodo) | PyTorch | Beat + downbeat + quantization + hand separation + time/key sig | Good |
| **MIDI2ScoreTransformer** | Yes (GitHub releases) | PyTorch Lightning | End-to-end performance-MIDI → score tokens | Best (SOTA) |
| **partitura** | N/A (rule-based) | Python | Pitch spelling, voice separation, basic quantization | Basic |
| **music21** | N/A (rule-based) | Python | Grid snapping (16th + triplet-8th default) | Fair |
| **MuseScore CLI** | N/A | C++ binary | MIDI import with quantization options | Poor for perf. MIDI |

### PM2S — Most Practical Option

[GitHub: cheriell/PM2S](https://github.com/cheriell/PM2S) (ISMIR 2022)

Full pipeline with 5 pre-trained neural networks:
1. **Beat tracking** (RNN) — F1: 0.8884
2. **Downbeat tracking** — F1: 0.7731
3. **Quantization** (RNN) — onset positions + note values
4. **Hand part separation** (RNN) — left/right hand
5. **Time signature detection** (CNN)
6. **Key signature detection** (RNN)

Weights auto-download from Zenodo. Has working `demo.ipynb`. MIT license. Output: quantized MIDI (480 ticks/beat).

### MIDI2ScoreTransformer — Best Quality But Research Code

[GitHub: TimFelixBeyer/MIDI2ScoreTransformer](https://github.com/TimFelixBeyer/MIDI2ScoreTransformer) (ISMIR 2024)

Checkpoint available in GitHub Releases. Outperforms PM2S and HMMs on MUSTER metrics. BUT:
- Requires custom forks of 3+ packages
- Requires MuseScore binary
- Incomplete inference documentation
- Research code, not production-ready

### music21 Quantization

Snaps to grid defined by `quarterLengthDivisors` (default: 16th notes + triplet 8ths). Works well with sequencer-originated MIDI. For live/performance MIDI, the docs explicitly say to use Finale instead. No beat tracking — purely mathematical snapping.

### MuseScore CLI

```bash
mscore -o output.musicxml input.mid
mscore -M midi_import_options.xml -o output.musicxml input.mid
```
Quality is poor for real piano performances — produces spurious 128th notes even with "human performance" flag. Community consensus: pre-quantize before importing.

### Beat Tracking in JS/Node.js

| Tool | Type | Platform | Quality |
|------|------|----------|---------|
| **essentia.js** | WASM (C++ compiled) | Node + browser | Decent (DSP-based) |
| **web-audio-beat-detector** | Pure JS | Node + browser | Basic (energy-based) |
| **beat_this** (CPJKU, ISMIR 2024) | PyTorch | Python only | Best (Transformer) |
| **BeatNet** (ISMIR 2021) | PyTorch | Python only | Excellent (CRNN + particle filtering) |

essentia.js is the only viable JS option. Includes `BeatTrackerMultiFeature`, `BeatTrackerDegara`, `RhythmExtractor2013`. Requires 44100 Hz input.

---

## Stage 4: Voice and Staff Separation

### Available Pre-Trained Models

| Tool | Pre-trained | Input | Predicts | Quality |
|------|-------------|-------|----------|---------|
| **piano_svsep** (ISMIR 2024) | Yes (in repo) | Quantized MusicXML | Voice + staff + chords | High |
| **EngravingGNN** (2025) | Not released yet | Quantized input | Voice + staff + spelling + key + clef + stems | Highest |
| **partitura** | N/A (rule-based) | MIDI/MusicXML | Voice (Chew & Wu), spelling (PS13), key (Krumhansl) | Basic |

### piano_svsep — "Cluster and Separate"

[GitHub: CPJKU/piano_svsep](https://github.com/CPJKU/piano_svsep) (ISMIR 2024 Best Paper Nominee)

GNN for voice separation, staff assignment, chord clustering. Pre-trained weights at `pretrained_models/model.ckpt`. MIT license.

```bash
python launch_scripts/predict.py \
  --model_path pretrained_models/model.ckpt \
  --score_path input.musicxml \
  --save_path output.mei
```

**Critical limitation**: Input must be QUANTIZED music (MusicXML). Needs PM2S or similar upstream.

**ONNX feasibility**: Low — GNNs have variable-sized graph inputs, making ONNX export non-trivial.

### partitura — Practical Rule-Based Alternative

[GitHub: CPJKU/partitura](https://github.com/CPJKU/partitura) (327 stars, pip-installable)

Includes:
- Pitch spelling (Meredith's PS13 algorithm)
- Voice separation (Chew & Wu algorithm)
- Key signature estimation (Krumhansl 1990 profiles)
- MIDI quantization (configurable)
- MusicXML/MIDI/MEI import/export

Lighter alternative to GNN models. Good baseline.

---

## Stage 5: Note Spelling (Enharmonic Resolution)

MIDI note 61 = C# or Db? Depends on key, harmonic context, surrounding notes.

| Approach | Quality | Available |
|----------|---------|-----------|
| **Key-based lookup** | Low | Trivial |
| **Krumhansl-Schmuckler** key detection + lookup | Medium | partitura, music21 |
| **PS13 algorithm** (Meredith) | Good | partitura |
| **EngravingGNN** multi-task prediction | Best | Not yet released |

---

## Stage 6: MusicXML Generation & Validation

### Structural Requirements

- `divisions` (time units per quarter note, typically 4-16)
- `part-list` structure with score-parts
- `attributes` block (key, time, clef, divisions) at start of each part
- Notes: pitch (step/alter/octave), duration, type, voice, staff
- `<chord/>` tag for simultaneous notes in same voice
- Tied notes at beat boundaries
- Beam grouping per time signature convention
- Rests to fill gaps

### MusicXML Validation

| Tool | How | What It Checks |
|------|-----|---------------|
| **xmllint + XSD** | `xmllint --schema musicxml.xsd file.musicxml --noout` | XML structure against official schema |
| **MuseScore CLI** | `mscore --export-to /dev/null file.musicxml` | Practical import test |
| **music21** | `score.isWellFormedNotation()` | Musical structure (not XML syntax) |
| **lxml (Python)** | `XMLSchema.validate()` | Programmatic XSD validation |

Official MusicXML 4.0 XSD from [W3C GitHub](https://github.com/w3c/musicxml). Note: XSD has broken external URLs that need patching (change `http://www.musicxml.org/xsd/` to local paths).

---

## Benchmarking & Automated Validation

### Metrics Stack

| Tool | What It Measures | Format | Install |
|------|-----------------|--------|---------|
| **mir_eval** | Note-level P/R/F1 (onset, pitch, offset) | MIDI arrays | `pip install mir_eval` |
| **musicdiff** | Notation-level edit distance (OMR-NED) | MusicXML | `pip install musicdiff` |
| **MUSTER** | 6 score transcription error rates | MusicXML | ZIP from GitHub |
| **MV2H** | Multi-pitch, voice, meter, value, harmony | Custom format | Java |
| **mpteval** | Musical performance metrics (timing, articulation, harmony, dynamics) | MIDI | `pip install mpteval` |

### mir_eval (Gold Standard for Note Accuracy)

```python
import mir_eval
scores = mir_eval.transcription.evaluate(
    ref_intervals, ref_pitches,    # ground truth: (n,2) seconds, (n,) Hz
    est_intervals, est_pitches     # predicted
)
# Returns: onset_p, onset_r, onset_f, note_p, note_r, note_f, note_w_offset_p/r/f
```

Default tolerances: onset ±50ms, pitch ±50 cents, offset 20% of duration or 50ms minimum.

### musicdiff (Notation-Level Comparison)

```bash
python3 -m musicdiff -o omrned -- ground_truth.musicxml predicted.musicxml
```

Outputs OMR-NED (Normalized Edit Distance) as JSON. Compares notes, beams, ornaments, ties, dynamics.

### Benchmark Datasets

| Dataset | Content | Format | Size | Ground Truth |
|---------|---------|--------|------|-------------|
| **MAESTRO v3** | 1,276 piano performances | WAV + MIDI | 101 GB (full) / 56 MB (MIDI-only) | Aligned MIDI (3ms accuracy) |
| **ASAP** | 222 scores, 1,068 performances | **MusicXML** + MIDI | ~2 GB | MusicXML + aligned perf MIDI |
| **MAPS** | ~65 hours piano | WAV + MIDI | ~40 GB | Aligned MIDI |
| **MusicNet** | 330 recordings (multi-instrument) | WAV + CSV labels | ~50 GB | Note labels |
| **Slakh2100** | 2,100 multi-track songs | FLAC + MIDI per stem | ~90 GB | Per-stem MIDI |

**MAESTRO** = best for audio-to-MIDI accuracy (piano). Download: `https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.zip`

**ASAP** = best for notation-level accuracy (has MusicXML ground truth). [GitHub: fosfrancesco/asap-dataset](https://github.com/fosfrancesco/asap-dataset)

### Benchmark Pipeline Design

```bash
audio2sheets benchmark --dataset maestro --subset test --output results.json
```

1. Load dataset metadata, filter to test split
2. For each audio file:
   - Run pipeline: audio → MusicXML
   - Validate MusicXML with xmllint
   - Convert both ground truth MIDI and predicted MusicXML to note arrays (via partitura)
   - Run mir_eval: onset F1, note F1, note-with-offset F1
3. Aggregate: mean/median across test set
4. Write results.json with per-file + aggregate scores

Two-tier evaluation:
- **Tier 1**: MIDI proxy — convert both to note arrays, compare with mir_eval
- **Tier 2**: Notation quality — compare MusicXML with musicdiff (ASAP dataset only)

---

## Competitive Landscape

| Tool | Price | Input | Output | Quality | Multi-instrument |
|------|-------|-------|--------|---------|-----------------|
| **AnthemScore** | $29-99 | Audio | MusicXML, MIDI | Good (solo) | No |
| **Klangio** | Subscription | Audio | MusicXML, MIDI, PDF | Mixed reviews | Limited |
| **Music Demixer** | Subscription | Audio | MusicXML, MIDI, PDF | Errors compound | Yes (Demucs) |
| **Melodyne** | $99-699 | Audio | MIDI only | Best pitch detection | No |
| **RipX DAW** | $99 | Audio | MIDI only | Good polyphonic | Limited |
| **ScoreCloud** | Free-$20/mo | Audio/Mic | MusicXML | Degrades on complex | No |

All tools produce "usable, not perfect" for solo piano. The "last mile" (MIDI → readable notation) is the least automated and most underserved part.

---

## Key Unsolved Problems in the Field

1. **Polyphonic multi-instrument separation** — overlapping sources in time/frequency
2. **Spectral ghosting** — separation artifacts become transcription errors
3. **Instrument leakage** — MT3 randomly reassigns notes between instruments
4. **Overtone vs fundamental confusion** — harmonics transcribed as real notes
5. **Onset/offset ambiguity** — when does a sustained note end?
6. **Expressive timing vs notation grid** — rubato breaks quantization
7. **Musical intent vs acoustic reality** — grace notes, articulation, phrasing

---

## References

### Transcription Models
- [Basic Pitch (Spotify)](https://github.com/spotify/basic-pitch) — ICASSP 2022
- [Basic Pitch TS](https://github.com/spotify/basic-pitch-ts)
- [Onsets & Velocities](https://github.com/andres-fr/iamusica_training) — EUSIPCO 2023, [arxiv 2303.04485](https://arxiv.org/abs/2303.04485)
- [Onsets and Frames (@magenta/music)](https://www.npmjs.com/package/@magenta/music)
- [ByteDance Piano Transcription](https://github.com/bytedance/piano_transcription)
- [NeuralNote](https://github.com/DamRsn/NeuralNote) — Basic Pitch in C++ via RTNeural
- [Mobile-AMT](https://eurasip.org/Proceedings/Eusipco/Eusipco2024/pdfs/0000036.pdf) — EUSIPCO 2024
- [MT3 (Google Magenta)](https://github.com/magenta/mt3)
- [MR-MT3](https://arxiv.org/abs/2403.10024)
- [YourMT3+](https://arxiv.org/abs/2407.04822)

### Quantization & Score Conversion
- [PM2S](https://github.com/cheriell/PM2S) — ISMIR 2022, pre-trained models on Zenodo
- [MIDI2ScoreTransformer](https://github.com/TimFelixBeyer/MIDI2ScoreTransformer) — ISMIR 2024, [arxiv 2410.00210](https://arxiv.org/abs/2410.00210)
- [partitura](https://github.com/CPJKU/partitura) — rule-based, pip-installable
- [essentia.js](https://github.com/MTG/essentia.js) — beat tracking in JS/Node
- [beat_this](https://github.com/CPJKU/beat_this) — ISMIR 2024, Transformer beat tracker

### Voice/Staff Separation & Engraving
- [piano_svsep](https://github.com/CPJKU/piano_svsep) — ISMIR 2024, [arxiv 2407.21030](https://arxiv.org/abs/2407.21030)
- [EngravingGNN](https://arxiv.org/html/2509.19412) — TENOR 2025 (code not yet released)

### Benchmarking & Evaluation
- [mir_eval](https://github.com/mir-evaluation/mir_eval)
- [musicdiff](https://github.com/gregchapman-dev/musicdiff) — MusicXML notation diff
- [MUSTER](https://amtevaluation.github.io/) — score transcription error rates
- [MV2H](https://github.com/apmcleod/MV2H) — multi-metric evaluation (Java)
- [mpteval](https://pypi.org/project/mpteval/) — musical performance metrics
- [MAESTRO v3](https://magenta.tensorflow.org/datasets/maestro) — piano benchmark dataset
- [ASAP dataset](https://github.com/fosfrancesco/asap-dataset) — notation benchmark (MusicXML ground truth)

### Stem Separation
- [Demucs / HTDemucs (Meta)](https://github.com/facebookresearch/demucs)

### Other
- [ML Techniques in AMT Survey (2024)](https://arxiv.org/html/2406.15249v1)
- [Klangio API](https://api-docs.klang.io/)
- [MusicXML 4.0 XSD (W3C)](https://github.com/w3c/musicxml)
