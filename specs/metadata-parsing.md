# Metadata Parsing

## Key Signature Mapping

### Maps major keys to correct fifths values
- **Given**: Pipeline output with key "G"
- **When**: Metadata is parsed
- **Then**: `keySignature` is 1 (one sharp)

### Maps minor keys to correct fifths values
- **Given**: Pipeline output with key "Am"
- **When**: Metadata is parsed
- **Then**: `keySignature` is 0

### Defaults to C major when key is missing
- **Given**: Pipeline output with no key in metadata
- **When**: Metadata is parsed
- **Then**: `keySignature` is 0

## Time Signature

### Parses time signature array
- **Given**: Pipeline output with `timeSignature: [3, 4]`
- **When**: Metadata is parsed
- **Then**: `timeSignature` is `[3, 4]`

### Defaults to 4/4 when missing
- **Given**: Pipeline output with no time signature
- **When**: Metadata is parsed
- **Then**: `timeSignature` is `[4, 4]`

## Instruments

### Parses instrument names from metadata
- **Given**: Pipeline output with `instruments: ["Piano", "Violin"]`
- **When**: Metadata is parsed
- **Then**: `instruments` array contains "Piano" and "Violin"

## Error Resilience

### Handles invalid JSON gracefully
- **Given**: Non-JSON pipeline output
- **When**: Metadata is parsed
- **Then**: Returns defaults (C major, 4/4, 120 BPM)
