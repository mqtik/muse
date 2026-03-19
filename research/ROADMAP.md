# Improvement Roadmap

Prioritized by impact on output quality. Each phase builds on the previous.

---

## Phase 1: Core Pipeline ✅

**Goal**: Accurate transcription with hand splitting and sustain pedal.

### 1.1 Wire PM2S into `pipeline.py` ✅

PM2S replaces librosa BPM, pitch-60 hand split, and music21 key inference.

### 1.2 Enable time signature detection ✅

CNN time signature model (2.6MB) enabled via `include_time_signature=True`.

### 1.3 Hand-part classification ✅

PM2S `RNNHandPartProcessor` splits notes into Left/Right Hand tracks. The full quantisation RNN was tested but introduced unacceptable onset drift (mean 119ms, max 459ms on short pieces) — replaced with hand-split-only approach that preserves original performance timing.

### 1.4 Solo piano bypass ✅

`--solo-piano` flag skips Demucs separation. UI toggle in UploadView, recordings default to solo.

### 1.5 Sustain pedal ✅

`apply_sustain_pedal()` from Transkun fork extends note durations based on CC64 events. Applied to performance MIDI only (not fed to PM2S, which expects key-press durations).

### 1.6 MusicXML removal ✅

Entire MusicXML/music21/OpenSheetMusicDisplay chain removed. App outputs MIDI only.

### 1.7 MIDI playback ✅

SplendidGrandPiano (smplr) with lazy AudioContext initialization on first user click. Multi-track playback with per-track mute. Playwright e2e tested.

---

## Phase 2: Better Transcription

**Goal**: More accurate notes and dynamics.

### 2.1 Tune Transkun post-processing thresholds

Current fixed thresholds: `min_duration=0.03`, `merge_window=0.015`, `min_velocity=5`

These need tuning based on real-world results:
- Are ghost notes (very low velocity) making it through?
- Are legitimate grace notes being filtered out?
- Is the merge window too aggressive or too conservative?

Test on a diverse set of recordings (classical, pop, jazz) and adjust.

### 2.2 Transkun velocity criterion

Transkun supports multiple velocity estimation methods:
- `hamming` (default): Most likely velocity (mode)
- `mse`: Expected value (mean)
- `mae`: Median estimate

Test which produces the most musically accurate dynamics. `hamming` may not be the best choice.

### 2.3 Audio preprocessing

Before Demucs/Transkun:
- Normalize volume (peak normalization)
- Remove silence at start/end
- Optional noise reduction for poor recordings

---

## Phase 3: Broader Audio Support

**Goal**: Work well on more than just concert Steinway recordings.

### 3.1 Evaluate alternative transcription models

- **hFT-Transformer**: Newer transformer-based piano transcription
- **Kong's Piano Transcription Transformer**: Strong Onset+Frame model
- **Onsets and Frames V2**: Google's model, well-established

Benchmark against Transkun V2 on a test set of diverse recordings. If one is significantly better on non-MAESTRO audio, add it as an option or replace Transkun.

### 3.2 Multi-instrument support

Currently piano-only. Eventually:
- Use Demucs stems to transcribe each instrument separately
- Combine into a full score with multiple parts
- Each instrument needs its own transcription model (or a general-purpose one)

---

## Phase 4: User Controls

**Goal**: Let users fix what the ML gets wrong.

### 4.1 Override tempo / key / time signature

The UI should let users:
- Set or override tempo (global BPM or tap-tempo)
- Set key signature (dropdown)
- Set time signature (dropdown)

These override PM2S predictions when the user knows better.

### 4.2 Difficulty level

Slider or preset: beginner → advanced
- Beginner: simplified rhythms, no ornaments, basic chords
- Advanced: full transcription with all detail

### 4.3 Interactive correction

Let users click on notes to:
- Switch hand assignment
- Delete spurious notes
- Adjust velocity

This is significant UI work but transforms the tool from "take it or leave it" to "start with AI, refine by hand."

---

## Priority Order

| Task | Effort | Impact | Status |
|------|--------|--------|--------|
| 1.1 PM2S in pipeline | Low | Transformative | ✅ Done |
| 1.2 Time signature | Trivial | Medium | ✅ Done |
| 1.3 Hand-part classification | Medium | High | ✅ Done |
| 1.4 Solo piano bypass | Low | Medium | ✅ Done |
| 1.5 Sustain pedal | Low | High | ✅ Done |
| 1.6 MusicXML removal | Medium | Simplification | ✅ Done |
| 1.7 MIDI playback | Medium | High | ✅ Done |
| 2.1 Threshold tuning | Medium | Medium | Next |
| 2.2 Velocity criterion | Low | Medium | Not started |
| 2.3 Audio preprocessing | Low | Medium | Not started |
| 4.1 User overrides | Medium | High | Not started |
| 3.1 Alt transcription models | High | Variable | Research needed |
| 4.3 Interactive editing | High | High | Major UI feature |
