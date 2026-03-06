import numpy as np
import os

SAMPLE_RATE = 22050
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def midi_to_freq(midi_note):
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))


def generate_tone(freq, duration, sample_rate=SAMPLE_RATE, amplitude=0.5):
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    wave = amplitude * np.sin(2 * np.pi * freq * t)
    envelope = np.ones_like(wave)
    attack = int(0.01 * sample_rate)
    release = int(0.05 * sample_rate)
    if attack > 0:
        envelope[:attack] = np.linspace(0, 1, attack)
    if release > 0:
        envelope[-release:] = np.linspace(1, 0, release)
    return wave * envelope


def write_wav(filename, samples, sample_rate=SAMPLE_RATE):
    import struct

    samples = np.clip(samples, -1.0, 1.0)
    int_samples = (samples * 32767).astype(np.int16)
    data = int_samples.tobytes()

    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, "wb") as f:
        num_samples = len(int_samples)
        data_size = num_samples * 2
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))
        f.write(struct.pack("<H", 1))
        f.write(struct.pack("<H", 1))
        f.write(struct.pack("<I", sample_rate))
        f.write(struct.pack("<I", sample_rate * 2))
        f.write(struct.pack("<H", 2))
        f.write(struct.pack("<H", 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(data)

    print(f"  {filename} ({num_samples / sample_rate:.1f}s, {os.path.getsize(filepath)} bytes)")


def generate_single_c4():
    freq = midi_to_freq(60)
    samples = generate_tone(freq, 1.0)
    pad = np.zeros(int(SAMPLE_RATE * 0.1))
    samples = np.concatenate([pad, samples, pad])
    write_wav("single-c4.wav", samples)


def generate_c_major_scale():
    scale = [60, 62, 64, 65, 67, 69, 71, 72]
    all_samples = []
    for note in scale:
        freq = midi_to_freq(note)
        tone = generate_tone(freq, 0.5)
        all_samples.append(tone)
    pad = np.zeros(int(SAMPLE_RATE * 0.1))
    samples = np.concatenate([pad] + all_samples + [pad])
    write_wav("c-major-scale.wav", samples)


def generate_c_major_chord():
    freqs = [midi_to_freq(n) for n in [60, 64, 67]]
    t = np.linspace(0, 2.0, int(SAMPLE_RATE * 2.0), endpoint=False)
    wave = sum(0.3 * np.sin(2 * np.pi * f * t) for f in freqs)
    envelope = np.ones_like(wave)
    attack = int(0.01 * SAMPLE_RATE)
    release = int(0.1 * SAMPLE_RATE)
    envelope[:attack] = np.linspace(0, 1, attack)
    envelope[-release:] = np.linspace(1, 0, release)
    samples = wave * envelope
    pad = np.zeros(int(SAMPLE_RATE * 0.1))
    samples = np.concatenate([pad, samples, pad])
    write_wav("c-major-chord.wav", samples)


def generate_two_hands():
    t = np.linspace(0, 2.0, int(SAMPLE_RATE * 2.0), endpoint=False)
    low = 0.4 * np.sin(2 * np.pi * midi_to_freq(48) * t)
    high = 0.4 * np.sin(2 * np.pi * midi_to_freq(72) * t)
    wave = low + high
    envelope = np.ones_like(wave)
    attack = int(0.01 * SAMPLE_RATE)
    release = int(0.1 * SAMPLE_RATE)
    envelope[:attack] = np.linspace(0, 1, attack)
    envelope[-release:] = np.linspace(1, 0, release)
    samples = wave * envelope
    pad = np.zeros(int(SAMPLE_RATE * 0.1))
    samples = np.concatenate([pad, samples, pad])
    write_wav("two-hands.wav", samples)


def generate_silence():
    samples = np.zeros(int(SAMPLE_RATE * 2.0))
    write_wav("silence-2s.wav", samples)


if __name__ == "__main__":
    print("Generating test fixtures...")
    generate_single_c4()
    generate_c_major_scale()
    generate_c_major_chord()
    generate_two_hands()
    generate_silence()
    print("Done!")
