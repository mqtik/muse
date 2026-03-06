# Improvement Roadmap

Prioritized by impact on output quality. Each phase builds on the previous.

---

## Phase 1: Quantized, Readable Sheet Music

**Goal**: Transform output from unreadable noise into usable notation.

### 1.1 Wire PM2S into `pipeline.py`

Insert PM2S quantization between Transkun and music21. `quantize.py` already has the integration — port it into the main pipeline.

**Replaces**: librosa BPM, pitch-60 hand split, music21 key inference
**Files**: `python/pipeline.py`, `python/quantize.py` (reference)

### 1.2 Enable time signature detection

PM2S has a CNN time signature model (2.6MB) that's currently disabled (`include_time_signature=False`). Enable it.

### 1.3 Investigate the quantisation RNN

The 186MB `RNNJointQuantisationModel` is downloaded but never used. PM2S falls back to simpler nearest-beat tick mapping. Investigate:
- Does the quantisation processor work when called directly?
- Does it produce meaningfully better onset positions than nearest-beat?
- Can we modify `CRNNJointPM2S.convert()` to use it?

If it improves quality, integrate it. The model was trained specifically for this — it should outperform the heuristic.

### 1.4 Solo piano bypass

If the input is already solo piano (no other instruments), skip Demucs separation entirely. Saves 30-60s and avoids quality loss from unnecessary source separation round-trip.

Detection: Run a quick RMS check or use Demucs but compare piano stem energy to total energy. If piano is >90% of the mix, it's solo piano.

---

## Phase 2: Sustain Pedal + Better Transcription

**Goal**: Notes that sound right and reflect actual performance.

### 2.1 Download and ship Transkun V2 pedal checkpoint

The default `2.0.pt` was trained without pedal extension. A full Transkun V2 checkpoint exists that predicts CC64 sustain pedal events. Download it, ship it, and use it as the default.

**Impact**: Notes extend through pedal sustain periods. MIDI playback sounds correct. Sheet music gets pedal markings.

### 2.2 Tune Transkun post-processing thresholds

Current fixed thresholds: `min_duration=0.03`, `merge_window=0.015`, `min_velocity=5`

These need tuning based on real-world results:
- Are ghost notes (very low velocity) making it through?
- Are legitimate grace notes being filtered out?
- Is the merge window too aggressive or too conservative?

Test on a diverse set of recordings (classical, pop, jazz) and adjust.

### 2.3 Transkun velocity criterion

Transkun supports multiple velocity estimation methods:
- `hamming` (default): Most likely velocity (mode)
- `mse`: Expected value (mean)
- `mae`: Median estimate

Test which produces the most musically accurate dynamics. `hamming` may not be the best choice.

---

## Phase 3: Notation Quality

**Goal**: Sheet music that looks professionally typeset.

### 3.1 MusicXML post-processing

After music21 generates MusicXML, clean up:
- Excessive ties (merge tied notes into single longer notes where possible)
- Beam grouping (ensure eighth notes are beamed by beat, not arbitrarily)
- Rest consolidation (merge adjacent rests into single longer rests)
- Remove redundant accidentals

### 3.2 Simplification mode

For intermediate pianists, offer a "simplified" output:
- Remove ornamental notes below a velocity threshold
- Reduce dense chords to triads
- Simplify complex rhythms (triple-dotted → simpler approximation)
- This is a post-processing step on the quantized MIDI, before music21

### 3.3 Fingering suggestions

Not ML — rule-based fingering based on hand span, common patterns, and voice leading. Applied as annotations in MusicXML.

---

## Phase 4: Broader Audio Support

**Goal**: Work well on more than just concert Steinway recordings.

### 4.1 Evaluate alternative transcription models

- **hFT-Transformer**: Newer transformer-based piano transcription
- **Kong's Piano Transcription Transformer**: Strong Onset+Frame model
- **Onsets and Frames V2**: Google's model, well-established

Benchmark against Transkun V2 on a test set of diverse recordings. If one is significantly better on non-MAESTRO audio, add it as an option or replace Transkun.

### 4.2 Audio preprocessing

Before Demucs/Transkun:
- Normalize volume (peak normalization)
- Remove silence at start/end
- Optional noise reduction for poor recordings

### 4.3 Multi-instrument support

Currently piano-only. Eventually:
- Use Demucs stems to transcribe each instrument separately
- Combine into a full score with multiple parts
- Each instrument needs its own transcription model (or a general-purpose one)

This is a large scope expansion — Phase 4+ territory.

---

## Phase 5: User Controls

**Goal**: Let users fix what the ML gets wrong.

### 5.1 Override tempo / key / time signature

The UI should let users:
- Set or override tempo (global BPM or tap-tempo)
- Set key signature (dropdown)
- Set time signature (dropdown)

These override PM2S predictions when the user knows better.

### 5.2 Quantization strength

Slider: strict → loose
- Strict: snap everything to the nearest grid position
- Loose: preserve some timing nuance (swing, rubato)

### 5.3 Difficulty level

Slider or preset: beginner → advanced
- Beginner: simplified rhythms, no ornaments, basic chords
- Advanced: full transcription with all detail

### 5.4 Interactive correction

Let users click on notes in the sheet music to:
- Move to a different beat position
- Change duration
- Switch hand assignment
- Delete spurious notes

This is significant UI work but transforms the tool from "take it or leave it" to "start with AI, refine by hand."

---

## Priority Order

| Phase | Effort | Impact | Status |
|-------|--------|--------|--------|
| 1.1 PM2S in pipeline | Low | **Transformative** | `quantize.py` exists |
| 1.2 Time signature | Trivial | Medium | One flag flip |
| 1.3 Quantisation RNN | Medium | High | Investigation needed |
| 1.4 Solo piano bypass | Low | Medium | Not started |
| 2.1 Pedal checkpoint | Low | High | Download + flag |
| 2.2 Threshold tuning | Medium | Medium | Needs test set |
| 3.1 MusicXML cleanup | Medium | Medium | Not started |
| 5.1 User overrides | Medium | High | UI + pipeline |
| 4.1 Alt models | High | Variable | Research needed |
| 5.4 Interactive editing | High | High | Major UI feature |
