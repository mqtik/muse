# MIDI Playback

## Parsing

### Parses valid MIDI into notes with timing data
- **Given**: A valid MIDI file
- **When**: `parseMidiBytes` is called
- **Then**: Returns notes with `startTime`, `endTime`, `pitch`, `velocity`, `track`, plus `duration`, `tempo`, `ppq`, and `tracks`

### Notes are sorted by start time
- **Given**: A parsed MIDI file
- **When**: Notes are returned
- **Then**: Each note's `startTime` >= the previous note's `startTime`

### All note properties are in valid ranges
- **Given**: A parsed MIDI file
- **When**: Notes are returned
- **Then**: Pitches are 0-127, velocities are 1-127, durations are positive

## Playback Preparation

### Enforces minimum note duration
- **Given**: A note shorter than 80ms
- **When**: `preparePlaybackNotes` processes it
- **Then**: The note's duration is extended to at least 80ms

### Removes overlapping notes on same pitch+track
- **Given**: Two notes on the same pitch and track that overlap within 80ms
- **When**: `preparePlaybackNotes` processes them
- **Then**: The shorter overlap note is removed

### Shortens earlier note to prevent collision
- **Given**: Two notes on the same pitch and track where the first extends past the second's start
- **When**: `preparePlaybackNotes` processes them
- **Then**: The first note's end is truncated to the second's start time

### Does not modify notes on different tracks or pitches
- **Given**: Two overlapping notes on different tracks (or different pitches)
- **When**: `preparePlaybackNotes` processes them
- **Then**: Both notes remain unchanged

### Does not mutate the input array
- **Given**: An array of notes
- **When**: `preparePlaybackNotes` is called
- **Then**: The original array and its note objects are not modified

## Performance

### Parse + prepare completes under 300ms for real MIDI
- **Given**: A real pipeline-produced MIDI file
- **When**: `parseMidiBytes` + `preparePlaybackNotes` are called
- **Then**: Total wall time is under 300ms

## Multi-track

### Score MIDI has Left Hand and Right Hand tracks (Transkun)
- **Given**: A MIDI produced by the Transkun backend
- **When**: Parsed
- **Then**: Exactly two tracks named "Left Hand" and "Right Hand"

### Multi-instrument MIDI has named instrument tracks (YourMT3)
- **Given**: A MIDI produced by the YourMT3 backend
- **When**: Parsed
- **Then**: One or more tracks with instrument names (e.g., "Acoustic Piano")
