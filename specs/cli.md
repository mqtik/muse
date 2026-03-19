# CLI

## Help & Version

### Shows help with --help
- **Given**: The CLI is invoked with `--help`
- **When**: It runs
- **Then**: Output contains "audio2sheets", "Usage", "Commands", and "--backend"

### Shows version with --version
- **Given**: The CLI is invoked with `--version`
- **When**: It runs
- **Then**: Output is a semver string (e.g., "0.0.1")

## Error Handling

### Exits with error for nonexistent file
- **Given**: The CLI is invoked with a path that doesn't exist
- **When**: It runs
- **Then**: Exit code is non-zero, stderr contains "not found"

### Rejects invalid backend value
- **Given**: The CLI is invoked with `--backend invalid`
- **When**: It runs
- **Then**: Exit code is non-zero, output contains "Invalid backend"

## Convert Command

### Converts audio to MIDI with default backend
- **Given**: A valid audio file and the full Python stack
- **When**: `audio2sheets song.mp3` is run
- **Then**: Produces `song.mid` and `song.perf.mid`

### Converts audio with YourMT3 backend
- **Given**: A valid audio file and YourMT3 installed
- **When**: `audio2sheets song.mp3 --backend yourmt3` is run
- **Then**: Produces `song.mid` with instrument track names

## Info Command

### Returns environment JSON
- **Given**: The Python venv is set up
- **When**: `audio2sheets info` is run
- **Then**: Output is valid JSON with a `python` field
