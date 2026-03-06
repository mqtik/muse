# Transkun V2 Fork — Next Steps

We replaced Basic Pitch (~85-90% F1) with Transkun V2 (98.32% F1) in the audio2sheets pipeline. The model is excellent but the repo ([Yujia-Yan/Transkun](https://github.com/Yujia-Yan/Transkun)) is unmaintained — sole author is inactive, 19 open issues, 0 community contributors. MIT licensed, 56MB model, compact codebase (~10 Python files).

Forking to fix the tooling around the model, not the model itself.

## Phase 1: Low-Hanging Fruit

### 1. Python 3.13 compatibility ([#29](https://github.com/Yujia-Yan/Transkun/issues/29))
- `audioop` was removed in Python 3.13
- Replace with `audioop-lts` drop-in package
- Update `setup.py` / add `pyproject.toml`

### 2. Noise & reverb filtering ([#10](https://github.com/Yujia-Yan/Transkun/issues/10), [#12](https://github.com/Yujia-Yan/Transkun/issues/12))
- Model picks up room reverb as rapid repeated phantom notes
- Add post-processing: minimum note duration threshold, merge near-duplicate notes on same pitch within small time window
- Optional velocity floor to discard very quiet ghost notes

### 3. Clean up installation ([#4](https://github.com/Yujia-Yan/Transkun/issues/4), [#20](https://github.com/Yujia-Yan/Transkun/issues/20))
- Replace `setup.py` with `pyproject.toml`
- Pin dependency versions properly
- Drop unnecessary deps (seaborn, matplotlib, tensorboard are training-only)
- Separate `pip install transkun` (inference) from `pip install transkun[train]` (full)

## Phase 2: Practical Improvements

### 4. Sustain pedal alignment ([#23](https://github.com/Yujia-Yan/Transkun/issues/23), [#13](https://github.com/Yujia-Yan/Transkun/issues/13))
- Notes are slightly before sustain pedal events, causing choppy playback
- Transkun already detects pedal events — post-process MIDI to extend note durations through active sustain regions
- This is the #1 accuracy complaint from real users

### 5. Python API
- Current interface is CLI-only (`python -m transkun.transcribe input.mp3 output.mid`)
- Add a proper importable API: `transkun.transcribe(path) -> PrettyMIDI`
- Eliminates subprocess overhead in our pipeline

### 6. Apple Metal (MPS) support ([#22](https://github.com/Yujia-Yan/Transkun/issues/22))
- Currently forced to `--device cpu` on Apple Silicon due to numerical issues
- Test and fix MPS compatibility for ~3-5x speedup on Mac

## Phase 3: Nice to Have

### 7. Fine-tuning support ([#24](https://github.com/Yujia-Yan/Transkun/issues/24))
- Published checkpoints only have `state_dict`, missing optimizer state
- Re-export full checkpoints to enable fine-tuning on custom datasets

### 8. High-frequency accuracy ([#30](https://github.com/Yujia-Yan/Transkun/issues/30))
- Notes above C8 are poorly detected
- Would require model-level investigation (mel spectrogram frequency range, training data distribution)

## Won't Do

- **Realtime transcription** — fundamentally offline design (16s segments, 8s hops), author confirmed this
- **ONNX export** — not needed for our use case
- **Model architecture changes** — 98.32% F1 is already SOTA, not worth the risk
