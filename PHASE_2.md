# Phase 2: Multi-Instrument Stem Separation (Demucs)

Add `pip install demucs` to the managed venv. Audio gets separated into stems before transcription, producing multi-part MusicXML.

No native code. No prebuilt binaries. Just Python.

## Architecture Change

```
python/pipeline.py
  │
  ├─ 1. separate(audio_path)     ← NEW: Demucs via PyTorch
  │     → vocals.wav, drums.wav, bass.wav, piano.wav, guitar.wav, other.wav
  │
  ├─ 2. transcribe(stem.wav)     ← per melodic stem (skip drums)
  │     → note events per instrument
  │
  ├─ 3. quantize(all_notes)      ← shared tempo/time sig across stems
  │     → quantized score with multiple parts
  │
  └─ 4. to_musicxml(score)       ← multi-part MusicXML
        → <part id="P1">Piano</part>
        → <part id="P2">Bass</part>
        → <part id="P3">Guitar</part>
        → ...
```

## Steps

### 1. Update `python/requirements.txt`

```
basic-pitch>=0.3.0
partitura>=1.5.0
demucs>=4.0.0
numpy
torch
torchaudio
```

PyTorch + Demucs adds ~2 GB to the venv. First install takes 3-5 min depending on connection.

Demucs auto-downloads model weights on first use (~80 MB for htdemucs, ~50 MB for htdemucs_6s). Cached in `~/.cache/torch/hub/`.

### 2. `python/separate.py` — Stem Separation

```python
import torch
import torchaudio
from demucs.pretrained import get_model
from demucs.apply import apply_model

def separate(audio_path, model_name='htdemucs_6s', device=None):
    if device is None:
        device = 'mps' if torch.backends.mps.is_available() else \
                 'cuda' if torch.cuda.is_available() else 'cpu'

    model = get_model(model_name)
    model.to(device)

    wav, sr = torchaudio.load(audio_path)
    if sr != model.samplerate:
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)

    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()

    sources = apply_model(model, wav[None], device=device)[0]
    sources = sources * ref.std() + ref.mean()

    # sources shape: (num_stems, channels, samples)
    # htdemucs_6s stems: drums, bass, other, vocals, guitar, piano
    stem_names = model.sources  # ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']

    return dict(zip(stem_names, sources)), model.samplerate
```

**Demucs model options (from RESEARCH.md):**

| Model | Stems | Speed | Best For |
|-------|-------|-------|----------|
| `htdemucs` | 4 (vocals, drums, bass, other) | Faster | Quick separation, non-piano music |
| `htdemucs_6s` | 6 (+ piano, guitar) | Slower | Piano + multi-instrument (default) |

**Known limitations from research (RESEARCH.md §Key Unsolved Problems):**
- **Spectral ghosting**: Separation artifacts become transcription errors — a piano note partially leaking into the "bass" stem gets double-transcribed
- **Instrument leakage**: Overlapping sources in time/frequency bleed across stems, especially with similar timbres (e.g., piano and guitar in same register)
- Mitigation: post-separation energy thresholding + cross-stem deduplication (notes with matching pitch/onset across stems → keep only the stem with highest energy)

### 3. Update `python/pipeline.py`

```python
def run(audio_path, output_path, use_separation=True, model='htdemucs_6s'):
    if use_separation:
        progress("separating", 0)
        stems, sr = separate(audio_path, model)

        progress("transcribing", 20)
        all_notes = {}
        melodic_stems = ['piano', 'bass', 'guitar', 'vocals', 'other']
        for i, stem_name in enumerate(melodic_stems):
            if stem_name not in stems:
                continue
            # Save stem to temp WAV
            stem_path = save_temp_wav(stems[stem_name], sr, stem_name)
            notes = transcribe(stem_path)
            if len(notes) > 0:
                all_notes[stem_name] = notes
            progress("transcribing", 20 + int(60 * (i + 1) / len(melodic_stems)))
    else:
        progress("transcribing", 0)
        all_notes = {"piano": transcribe(audio_path)}

    progress("generating", 80)
    quantize_and_export(all_notes, output_path)
    progress("done", 100)
```

**Per-stem transcription details (from RESEARCH.md §Stage 2):**
- Basic Pitch requires 22050 Hz mono input — each stem WAV must be resampled/downmixed before transcription
- Basic Pitch does NOT output tempo, time signature, key signature, dynamics, or voice info — these must come from quantization stage
- Per-stem, Basic Pitch processes ~110 windows (2-second windows, 30 frames overlap) for a 3-min song at ~86 fps frame rate
- `@tensorflow/tfjs-node` (used internally by basic-pitch Python) is archived at v3.x — works but no updates
- Overtone hallucination still applies per-stem: use raised thresholds (`onset_threshold=0.6`, `frame_threshold=0.4`) for piano stems

### 4. Update Node.js CLI

Add `--no-separation` flag:

```
audio2sheets song.mp3                      # full pipeline with Demucs
audio2sheets song.mp3 --no-separation      # Phase 1 behavior (solo piano)
audio2sheets song.mp3 --model htdemucs     # 4-stem model (faster)
audio2sheets song.mp3 --model htdemucs_6s  # 6-stem with piano+guitar (default)
```

### 5. GPU Acceleration

Demucs via PyTorch gets GPU for free:
- **NVIDIA**: CUDA (install `torch` with CUDA support)
- **Apple Silicon**: MPS (works out of the box with recent PyTorch)
- **CPU**: Falls back automatically, ~2-5x realtime

The `python-manager.ts` detects GPU availability and installs the right PyTorch variant:

```typescript
async function detectGPU(): Promise<'cuda' | 'mps' | 'cpu'> {
    // macOS arm64 → MPS (torch.backends.mps.is_available())
    // nvidia-smi exists → CUDA (pip install torch with CUDA index URL)
    // Fallback → CPU (default pip torch is CPU-only)
}
```

**PyTorch install variants:**
- CPU: `pip install torch torchaudio` (default, ~800 MB)
- CUDA 11.8: `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118` (~2.5 GB)
- CUDA 12.1: `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121` (~2.5 GB)
- MPS (macOS): standard `pip install torch torchaudio` already includes MPS support

### 6. Per-Stem Instrument Mapping

| Demucs Stem | Transcribe? | MusicXML Part | GM Program | Clef |
|-------------|------------|---------------|------------|------|
| piano | Yes | Piano | 0 | Grand (treble + bass) |
| bass | Yes | Bass | 33 | Bass |
| guitar | Yes | Guitar | 25 | Treble |
| vocals | Yes | Melody | 73 | Treble |
| other | Yes | Other | 48 | Treble |
| drums | No | — | — | — |

Piano gets a grand staff (2 staves). Other instruments get single staff.

### 7. Smart Stem Filtering

Don't include empty or near-silent stems:

```python
def has_meaningful_content(notes, min_notes=5, min_duration=2.0):
    if len(notes) < min_notes:
        return False
    total_duration = sum(n.duration for n in notes)
    return total_duration >= min_duration
```

### 8. Cross-Stem Deduplication

Address spectral ghosting by removing duplicate notes that appear in multiple stems:

```python
def deduplicate_across_stems(all_notes, onset_tolerance=0.05, pitch_tolerance=0):
    """For notes with matching pitch/onset across stems, keep only the loudest."""
    for stem_a, stem_b in combinations(all_notes.keys(), 2):
        for note_a in all_notes[stem_a]:
            for note_b in all_notes[stem_b]:
                if abs(note_a.onset - note_b.onset) < onset_tolerance and \
                   note_a.pitch == note_b.pitch:
                    if note_a.velocity < note_b.velocity:
                        mark_for_removal(note_a)
                    else:
                        mark_for_removal(note_b)
```

## Performance

| Song Length | Separation (MPS/GPU) | Separation (CPU) | Transcription | Total (GPU) | Total (CPU) |
|-------------|---------------------|------------------|---------------|-------------|-------------|
| 1 min | ~5s | ~2-5 min | ~20s/stem | ~2 min | ~6 min |
| 3 min | ~15s | ~6-15 min | ~60s/stem | ~6 min | ~18 min |
| 5 min | ~25s | ~10-25 min | ~100s/stem | ~10 min | ~27 min |

GPU makes separation 10-30x faster. Transcription speed is the same (basic-pitch uses TensorFlow, not PyTorch — GPU has no effect on transcription).

## Venv Size

Phase 1: ~600 MB (TensorFlow + basic-pitch + partitura)
Phase 2: ~2.5 GB (+ PyTorch + Demucs)

### Venv Management

```typescript
async function ensureVenv(features: ('transcription' | 'separation')[]): Promise<string> {
    // Install only what's needed
    // Phase 1: basic requirements
    // Phase 2: + demucs requirements (only if separation requested)
}
```

Or just install everything upfront and eat the 2.5 GB. Simpler.

## Test Fixtures

**Multi-instrument benchmark datasets (from RESEARCH.md §Benchmarking):**

| Dataset | Content | Format | Size | Use |
|---------|---------|--------|------|-----|
| **Slakh2100** | 2,100 multi-track songs | FLAC + MIDI per stem | ~90 GB | Per-stem ground truth for separation accuracy |
| **MusicNet** | 330 recordings (multi-instrument) | WAV + CSV labels | ~50 GB | Multi-instrument note labels |

**Manual test files:**

| File | Source | Tests |
|------|--------|-------|
| Piano + Violin duo | Musopen chamber | 2-instrument separation |
| Piano Trio (piano + violin + cello) | Musopen trios | 3-instrument separation with strings |
| String Quartet + Piano | Musopen | Full ensemble — Demucs 6-stem |
| Pop/rock song | User-provided | Vocals + drums + bass + guitar + other — full Demucs pipeline |

## What This Phase Delivers

- `audio2sheets song.mp3` produces multi-instrument MusicXML
- Demucs 6-stem separation (piano, bass, guitar, vocals, drums, other)
- Per-stem transcription → per-instrument MusicXML parts
- GPU acceleration on NVIDIA (CUDA) and Apple Silicon (MPS)
- Smart filtering of empty/silent stems
- Cross-stem deduplication to mitigate spectral ghosting
- `--no-separation` flag for solo piano fast path
