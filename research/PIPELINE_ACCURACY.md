# Pipeline Accuracy Assessment

Honest stage-by-stage analysis of what works, what doesn't, and where accuracy is lost.

## Stage 1: Source Separation (Demucs htdemucs_6s)

**Model**: htdemucs_6s — 6-stem Hybrid Transformer Demucs
**Stems**: drums, bass, vocals, guitar, piano, other
**Runs on**: CPU only (MPS disabled — flaky convolutions on Apple Silicon)

### What works
- Dedicated piano stem — no guessing which stem is piano
- Strong isolation on clean, well-recorded acoustic piano
- Handles multi-instrument mixes (vocals + piano + bass, etc.)

### What doesn't
- **Synth piano / electric piano** — Model trained on acoustic instruments. Synth pianos bleed into "other" stem or produce artifacts
- **Low-quality recordings** — Phone recordings, compressed YouTube audio, heavy reverb all degrade separation quality
- **Solo piano** — Still runs full separation (~30-60s) even though there's nothing to separate. Could detect solo piano and skip this step
- **Bleeding** — Some drum/vocal energy leaks into piano stem, creating ghost notes in transcription

### Accuracy estimate
- Clean acoustic piano in a mix: **good** (SDR ~7-9 dB)
- Solo piano recording: **unnecessary overhead**, slight quality loss from round-trip
- Synth/electric piano: **poor**

---

## Stage 2: Piano Transcription (Transkun V2)

**Model**: Transformer + Neural Semi-CRF, trained on MAESTRO dataset (concert Steinway)
**Input**: 44.1 kHz audio, processed in 16s segments with 8s overlap
**Output**: MIDI note events (pitch, onset, offset, velocity)

### What works
- Strong note detection on concert piano: F1 0.93-0.95 on MAESTRO (onset+offset)
- Velocity prediction captures dynamics
- Sub-frame onset refinement (±11.6ms precision)
- Handles polyphonic passages well

### What doesn't
- **No sustain pedal** — Default checkpoint (2.0.pt, "No Ext") was trained WITHOUT pedal extension. Notes cut off at key release, not pedal release. An alternative checkpoint WITH pedal exists but isn't shipped
- **Non-Steinway pianos** — Trained exclusively on MAESTRO (Yamaha CFX / Steinway D recordings). Other piano timbres produce worse results
- **Segment boundary artifacts** — 16s chunks with 8s overlap can produce duplicates at boundaries (merged, but imperfectly)
- **Very fast passages** — Notes below 30ms get filtered out by post-processing
- **Velocity accuracy** — Predicted from spectral features, not directly from amplitude. Less reliable for subtle dynamics (pp vs p)

### Available but unused
- **Pedal checkpoint** — Transkun V2 full version predicts CC64 sustain pedal events. Would need to download alternate weights and pass `weight=path` to `transcribe_audio()`
- **Data-augmented checkpoint** — "Transkun V2 Aug" trained with augmentation, better generalization to non-MAESTRO audio

### Accuracy estimates (from published evaluations)
| Dataset | Onset F1 | Onset+Offset F1 | With Velocity |
|---------|----------|-----------------|---------------|
| MAESTRO | 0.96-0.97 | 0.93-0.95 | 0.93-0.95 |
| SMD (synth) | 0.92-0.94 | 0.89-0.92 | N/A |
| MAPS (real) | 0.78-0.82 | 0.66-0.70 | N/A |

The MAPS numbers are concerning — real-world recordings (not concert conditions) see significant accuracy drops.

---

## Stage 3: Tempo Detection (librosa)

**Method**: `librosa.beat.beat_track()` — autocorrelation-based global BPM estimate

### What works
- Fast, lightweight
- Reasonable for steady-tempo pop/rock

### What doesn't
- **Single BPM for entire piece** — Gives one number (e.g., 120). Classical music with rubato, ritardando, accelerando, or tempo changes gets one averaged tempo that's wrong everywhere
- **Octave errors** — Often returns half or double the actual tempo (60 instead of 120, or 240 instead of 120)
- **Range clamping** — Current code clamps to 30-300 BPM, defaults to 120 if out of range. A piece at 40 BPM might get forced to 120

### Better alternatives available
- **PM2S beat tracking** — RNN-based, predicts per-note beats and downbeats. Already downloaded (105MB model). Handles tempo changes naturally because it tracks beats through the note sequence, not from audio
- **madmom** — Strong audio-based beat tracker with tempo change support
- **BeatNet** — Modern transformer-based beat tracker

### Impact on sheet music
This is upstream of everything — wrong tempo means wrong beat grid means wrong quantization means unreadable notation. Even perfect note detection produces garbage sheet music with wrong tempo.

---

## Stage 4: Hand Separation

**Current method**: Pitch split at MIDI 60 (middle C). Notes >= 60 = right hand, < 60 = left hand.

### What works
- Trivial to implement
- Correct for simple pieces where hands don't cross

### What doesn't
- **Hand crossings** — Chopin, Liszt, and many intermediate pieces have the LH playing above C4 or RH below. Fixed split produces wrong staff assignments
- **Unisons** — Both hands playing the same pitch (or nearby pitches) around C4 get arbitrarily split
- **Threshold is arbitrary** — Why 60? Some pieces sit mostly above C4 in both hands

### Better alternatives available
- **PM2S hand separation** — RNN model (40MB) that predicts left/right for each note based on musical context (voice leading, hand span constraints, temporal patterns). Already downloaded and working in `quantize.py`

---

## Stage 5: Quantization — THE CRITICAL GAP

**Current state**: **None.** Notes go from Transkun (floating-point seconds) directly to pretty_midi to music21.

### Why this is the #1 problem

music21 receives notes at times like 0.4923s, 1.0147s, 2.5034s. It tries to express these as exact rhythmic durations. The result:
- Quarter notes become double-dotted 32nd notes tied to 64th notes
- Simple melodies become walls of ties and bizarre subdivisions
- A pianist cannot sight-read the output

Without quantization, **the entire pipeline is unusable for its stated purpose** (producing readable sheet music).

### What PM2S quantization provides

PM2S `CRNNJointPM2S.convert()` does ALL of the following in one call:
1. **Beat tracking** — Detects beats and downbeats through the note sequence (not audio)
2. **Onset quantization** — Snaps each note onset to the nearest rhythmic grid position
3. **Duration quantization** — Maps note durations to standard rhythmic values
4. **Hand separation** — Classifies each note as left or right hand
5. **Key signature detection** — Predicts key from note patterns
6. **Time signature detection** — Binary: 4-based vs 3-based (limited but better than nothing)

The 186MB quantization RNN model is downloaded but **never instantiated** by the current PM2S code. Instead, PM2S falls back to simpler nearest-beat mapping. This needs to be investigated and fixed — the full model should be used for maximum accuracy.

### What `quantize.py` already does

```python
pm2s = CRNNJointPM2S(ticks_per_beat=480, notes_per_beat=[1, 2, 3, 4, 6, 8])
pm2s.convert(
    performance_midi_file=tmp_perf,
    score_midi_file=tmp_score,
    end_time=end_time,
    include_key_signature=True,
    include_time_signature=False,  # ← currently disabled
)
```

This code exists, works, but is never called from `pipeline.py`.

---

## Stage 6: MusicXML Generation (music21)

**Method**: `converter.parse(midi_path)` → `score.write("musicxml")`

### What works
- Mature library, handles complex notation
- Preserves multiple parts/staves
- Outputs standard MusicXML (compatible with MuseScore, Sibelius, Finale)

### What doesn't
- **Garbage in, garbage out** — If the MIDI has unquantized floating-point times, the MusicXML will have insane rhythms
- **Instrument naming** — Defaults to generic names unless MIDI tracks are named
- **Beam grouping** — Not always optimal without explicit beam break hints
- **Ties** — Generates excessive ties for durations that don't fit standard note values

### Dependency
music21 output quality is almost entirely determined by input MIDI quality. Fix quantization and music21 output becomes dramatically better with zero code changes.

---

## Summary: Where Accuracy Is Lost

| Stage | Accuracy Loss | Impact | Fix Difficulty |
|-------|--------------|--------|----------------|
| No quantization | **Catastrophic** | Sheet music unreadable | Low — PM2S already built |
| Single BPM | **High** | Wrong beat grid everywhere | Low — PM2S beat tracking |
| Pitch-60 hand split | **Medium** | Wrong staff assignments | Low — PM2S hand separation |
| No pedal | **Medium** | Notes sound clipped, missing markings | Medium — download alt checkpoint |
| Non-Steinway audio | **Medium** | Worse transcription accuracy | Hard — need different model |
| music21 notation quirks | **Low** | Suboptimal beaming/ties | Medium — post-processing |

The first three rows are all solved by wiring PM2S into the pipeline. That single integration transforms the output from unusable to usable.
