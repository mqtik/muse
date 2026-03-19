# Pipeline

## Transkun Backend

### Solo piano transcription produces hand-split MIDI
- **Given**: A solo piano audio file
- **When**: The pipeline runs with `--backend transkun --solo-piano`
- **Then**: A score MIDI with "Left Hand" and "Right Hand" tracks is produced, plus a performance MIDI

### Non-solo piano separates piano stem first
- **Given**: A multi-instrument audio file
- **When**: The pipeline runs with `--backend transkun` (without `--solo-piano`)
- **Then**: Demucs isolates the piano stem before transcription, progress reports "separating" stage

### Transcription detects notes with valid pitch and timing
- **Given**: An audio file with audible piano notes
- **When**: The pipeline transcribes it
- **Then**: The output MIDI contains notes with pitches 0-127, positive durations, and total duration within 15% of the audio duration

### Empty audio produces an error
- **Given**: A silent audio file
- **When**: The pipeline transcribes it
- **Then**: An error is raised: "No notes detected"

### Diagnostics flag writes onset data
- **Given**: An audio file
- **When**: The pipeline runs with `--diagnostics`
- **Then**: A `.diagnostics.json` file is written alongside the MIDI output

## YourMT3 Backend

### Multi-instrument transcription produces multi-track MIDI
- **Given**: An audio file with instruments
- **When**: The pipeline runs with `--backend yourmt3`
- **Then**: A MIDI file with instrument-named tracks is produced (e.g., "Acoustic Piano", "Violin")

### YourMT3 output copies to both score and perf paths
- **Given**: An audio file
- **When**: The pipeline runs with `--backend yourmt3`
- **Then**: Both `input.mid` and `input.perf.mid` are created with identical content

### YourMT3 downloads model on first use
- **Given**: The YourMT3 model directory does not exist
- **When**: The pipeline runs with `--backend yourmt3`
- **Then**: Progress reports "downloading" stage, model is downloaded to `~/.audio2sheets/yourmt3/`

## Metadata Extraction

### Extracts key, tempo, time signature from MIDI
- **Given**: A MIDI file with key/tempo/time signature events
- **When**: Metadata is extracted
- **Then**: The result contains `key`, `tempo`, `timeSignature`, and `instruments` fields

### Defaults when metadata is missing
- **Given**: A MIDI file with no key/tempo events
- **When**: Metadata is extracted
- **Then**: Defaults to key=C, tempo=120, timeSignature=[4,4]

## Progress Reporting

### Reports stages via stderr JSON
- **Given**: The pipeline is running
- **When**: Each stage begins
- **Then**: A JSON line `{"stage": "<name>", "percent": <n>}` is written to stderr

### Final result is JSON on stdout
- **Given**: The pipeline completes successfully
- **When**: It finishes
- **Then**: A single JSON line with `midi`, `perf_midi`, and `metadata` is written to stdout
