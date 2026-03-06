# audio2sheets

Convert audio files (MP3, WAV, OGG, FLAC) to sheet music (MusicXML) with AI-powered transcription and neural quantization.

## Prerequisites

- Node.js >= 18
- Python 3.10+
- Git (for PM2S auto-setup)

Python dependencies and PM2S are installed automatically on first run.

## CLI Usage

```bash
npx audio2sheets song.mp3                     # → song.musicxml
npx audio2sheets song.mp3 -o output.musicxml
npx audio2sheets recording.wav -o score.musicxml
```

### Subcommands

```bash
audio2sheets transcribe song.mp3 -o notes.json    # Audio → note events JSON
audio2sheets quantize notes.json -o score.json     # Note events → quantized score
audio2sheets toxml score.json -o sheet.musicxml    # Quantized score → MusicXML
audio2sheets setup                                  # Force reinstall dependencies
audio2sheets info                                   # Show environment info
```

## Library Usage (Electron / Tauri)

```typescript
import { convertAudioToSheet } from 'audio2sheets'

const result = await convertAudioToSheet('/path/to/song.mp3', '/path/to/output.musicxml', {
  onProgress: (stage, percent) => console.log(`${stage}: ${percent}%`),
})

// result.musicxml  — MusicXML string
// result.stems     — ['piano']
// result.metadata  — { tempo, timeSignature, keySignature }
```

## How It Works

```
Audio File (MP3/WAV/OGG/FLAC)
  → Basic Pitch (note transcription, ~85-90% F1)
  → PM2S (neural beat tracking, quantization, hand separation, key detection)
  → partitura (note spelling, MusicXML export)
```

Node.js manages a Python venv at `~/.audio2sheets/venv/` and PM2S at `~/.audio2sheets/pm2s/`. All ML inference runs in Python.

## Implementation Phases

- [**Phase 1**](./PHASE_1.md) — Solo piano: basic-pitch + PM2S neural quantization
- [**Phase 2**](./PHASE_2.md) — Multi-instrument: Demucs stem separation + per-stem transcription
- [**Phase 3**](./PHASE_3.md) — O&V transcription (96.78% F1), piano_svsep voice separation, benchmarking

## Research

See [RESEARCH.md](./RESEARCH.md) for detailed findings on transcription models, quantization approaches, evaluation metrics, and competitive landscape.

## License

MIT
