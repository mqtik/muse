# Quantization: The Critical Missing Piece

## The Problem

Transkun outputs notes at raw floating-point times:
```
Note(pitch=60, start=0.4923, end=0.9847, velocity=72)
Note(pitch=64, start=0.5012, end=1.0034, velocity=68)
Note(pitch=67, start=0.4989, end=0.9912, velocity=65)
```

These three notes are a C major chord landing on beat 1 — but their onsets differ by ~9ms (natural human timing). music21 tries to notate each independently, producing three different rhythmic values tied together. A pianist sees noise instead of a simple chord on beat 1.

**Quantization** snaps these to a rhythmic grid:
```
Note(pitch=60, start=beat_1, duration=quarter_note)
Note(pitch=64, start=beat_1, duration=quarter_note)
Note(pitch=67, start=beat_1, duration=quarter_note)
```

Now music21 produces a clean quarter-note chord. The sheet music is instantly readable.

## What PM2S Provides

PM2S (Performance MIDI-to-Score) is already installed at `~/.audio2sheets/pm2s/`. It includes 5 neural models totaling ~620MB.

### The Full Pipeline (via `CRNNJointPM2S.convert()`)

1. **Read note sequence** — Extracts pitch, onset, duration, velocity from performance MIDI
2. **Beat tracking** (RNNJointBeatModel, 105MB) — Predicts beat and downbeat positions through the note sequence. Uses dynamic programming post-processing to fill gaps and enforce consistent tempo
3. **Hand separation** (RNNHandPartModel, 40MB) — Classifies each note as left (0) or right (1) hand based on musical context
4. **Key signature** (RNNKeySignatureModel, 40MB) — Predicts key from note patterns, outputs changes when key shifts
5. **Time signature** (CNNTimeSignatureModel, 2.6MB) — Binary classification: 4-based (4/4, 2/4) vs 3-based (3/4, 6/8)
6. **Time-to-tick mapping** — Maps continuous time to MIDI ticks using detected beats
7. **Write score MIDI** — Outputs quantized MIDI with proper beat structure

### The Unused Quantization RNN (186MB)

PM2S includes a `RNNJointQuantisationModel` (186MB) that predicts:
- **Onset position**: Where within a beat a note falls (24 subdivisions per beat)
- **Note value**: The rhythmic duration (from the `notes_per_beat` vocabulary)

This model is **downloaded but never instantiated**. The current `CRNNJointPM2S` code does NOT use it — instead, it maps notes to the nearest beat tick based on temporal proximity alone.

This is a significant quality gap. The quantization RNN was trained to understand musical context — it knows that a note slightly before a beat is probably ON the beat, not a syncopation. Simple nearest-tick mapping doesn't have this understanding.

### Investigation needed

The `RNNJointQuantisationProcessor` class exists in PM2S's `features/quantisation.py`. It:
1. Takes the note sequence + beat predictions as input
2. Runs through the quantisation RNN
3. Outputs `(onset_position, note_value)` per note

We need to either:
- **Modify PM2S's `CRNNJointPM2S` to use the quantisation processor** instead of simple tick mapping
- **Or call the quantisation processor separately** after beat detection, using its output to build the score MIDI

The first approach is cleaner. The second gives more control.

## What `quantize.py` Already Does

```python
from pm2s import CRNNJointPM2S

pm2s = CRNNJointPM2S(
    ticks_per_beat=480,
    notes_per_beat=[1, 2, 3, 4, 6, 8]
)
pm2s.convert(
    performance_midi_file=tmp_perf,
    score_midi_file=tmp_score,
    end_time=end_time,
    include_key_signature=True,
    include_time_signature=False,
)
```

This script:
- Takes a performance MIDI (from Transkun)
- Runs PM2S to produce a score MIDI (quantized)
- Extracts parts with hand separation using partitura
- Outputs structured JSON with quantized note data

It already handles the PM2S integration. The gap is that `pipeline.py` never calls it.

## Integration Plan

### Option A: Wire PM2S directly into `pipeline.py`

After Transkun produces the performance MIDI, insert PM2S quantization before music21:

```
Transkun → performance MIDI
  → PM2S convert() → score MIDI (quantized, with hands/key/time sig)
  → music21 → MusicXML
```

This replaces:
- librosa BPM detection (PM2S does beat tracking)
- Pitch-60 hand split (PM2S does hand separation)
- music21 key guessing (PM2S does key detection)

### Option B: Use the quantisation RNN for higher quality

Extend PM2S's `CRNNJointPM2S` to use `RNNJointQuantisationProcessor`:

1. After beat detection, run quantisation RNN on the note sequence
2. Use predicted onset positions + note values for grid placement
3. Fall back to nearest-beat mapping only when quantisation model disagrees with beat grid

This is more complex but produces better results — the 186MB model was trained specifically for this task.

### Recommended: Start with Option A, then upgrade to Option B

Option A is already built (`quantize.py`). Get it working in the pipeline first. Then investigate the quantisation RNN to see if it meaningfully improves output quality.

## `notes_per_beat` Vocabulary

PM2S quantizes to these subdivisions per beat:
- `1` — quarter note (on the beat)
- `2` — eighth notes
- `3` — triplet eighth notes
- `4` — sixteenth notes
- `6` — sextuplet sixteenth notes (triplet sixteenths)
- `8` — thirty-second notes

This covers most standard rhythmic patterns. Missing: dotted rhythms, quintuplets, septuplets — but those are rare enough that this vocabulary handles 95%+ of piano music.

## Expected Impact

**Before quantization**: Sheet music is a wall of 64th notes, ties, and bizarre subdivisions. Unreadable.

**After quantization**: Notes snap to quarter/eighth/sixteenth grid. Clean rhythms, proper measure boundaries, readable notation. The single biggest quality improvement possible in this pipeline.
