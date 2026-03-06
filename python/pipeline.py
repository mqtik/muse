import sys
import json
import argparse
import os
import shutil
import tempfile


def progress(stage, percent):
    print(json.dumps({"stage": stage, "percent": percent}), file=sys.stderr, flush=True)


_temp_dirs = []


def _make_temp_dir(prefix):
    d = tempfile.mkdtemp(prefix=prefix)
    _temp_dirs.append(d)
    return d


def _cleanup_temp_dirs():
    for d in _temp_dirs:
        shutil.rmtree(d, ignore_errors=True)
    _temp_dirs.clear()


def _add_pm2s_to_path():
    pm2s_dir = os.path.join(os.path.expanduser("~"), ".audio2sheets", "pm2s")
    if os.path.isdir(pm2s_dir) and pm2s_dir not in sys.path:
        sys.path.insert(0, pm2s_dir)


def separate_piano_stem(audio_path):
    import torch
    import numpy as np
    import librosa
    import soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    progress("separating", 5)

    model = get_model("htdemucs_6s")
    model.to("cpu")

    progress("separating", 15)

    audio_np, _ = librosa.load(audio_path, sr=model.samplerate, mono=False)
    if audio_np.ndim == 1:
        audio_np = np.stack([audio_np, audio_np])
    wav = torch.from_numpy(audio_np).float()

    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()

    progress("separating", 25)

    sources = apply_model(model, wav[None], device="cpu")[0]
    sources = sources * ref.std() + ref.mean()

    progress("separating", 35)

    stem_names = model.sources
    piano_idx = stem_names.index("piano") if "piano" in stem_names else None
    if piano_idx is None:
        raise RuntimeError(f"No piano stem in model. Available stems: {stem_names}")

    piano_stem = sources[piano_idx].cpu().numpy()
    piano_path = os.path.join(_make_temp_dir("demucs_"), "piano.wav")
    sf.write(piano_path, piano_stem.T, model.samplerate)

    progress("separating", 40)

    return piano_path


def transcribe_audio(audio_path, solo_piano=False):
    audio_path = os.path.abspath(audio_path)

    if solo_piano:
        piano_path = audio_path
        progress("transcribing", 5)
    else:
        piano_path = separate_piano_stem(audio_path)
        progress("transcribing", 45)

    from transkun import transcribe_audio as tk_transcribe, filter_notes
    source = tk_transcribe(piano_path, device="cpu")
    source = filter_notes(source)

    progress("transcribing", 60)

    import pretty_midi

    perf_midi = pretty_midi.PrettyMIDI()
    piano = pretty_midi.Instrument(program=0, name="Piano")

    total_notes = 0
    for inst in source.instruments:
        for note in inst.notes:
            piano.notes.append(note)
            total_notes += 1

    if total_notes == 0:
        raise RuntimeError("No notes detected in the audio. Try a longer or louder recording.")

    perf_midi.instruments.append(piano)
    perf_midi_path = os.path.join(_make_temp_dir("tk_"), "performance.mid")
    perf_midi.write(perf_midi_path)

    progress("transcribing", 65)

    score_midi_path = quantize_midi(perf_midi_path)

    return score_midi_path, perf_midi_path


def quantize_midi(performance_midi_path):
    import pretty_midi

    progress("quantizing", 68)

    _add_pm2s_to_path()
    from pm2s import CRNNJointPM2S

    perf = pretty_midi.PrettyMIDI(performance_midi_path)
    end_time = perf.get_end_time() + 1.0

    progress("quantizing", 72)

    pm2s = CRNNJointPM2S(ticks_per_beat=480, notes_per_beat=[1, 2, 3, 4, 6, 8], use_quantisation_rnn=True)

    score_midi_path = os.path.join(_make_temp_dir("pm2s_"), "score.mid")
    pm2s.convert(
        performance_midi_file=performance_midi_path,
        score_midi_file=score_midi_path,
        end_time=end_time,
        include_key_signature=True,
        include_time_signature=True,
    )

    progress("quantizing", 79)

    return score_midi_path


def convert_midi_to_musicxml(midi_path, output_path):
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning)
    from music21 import converter

    progress("generating", 82)

    score = converter.parse(midi_path)

    progress("generating", 88)

    instruments_found = []
    for part in score.parts:
        name = part.partName
        if not name:
            inst = part.getInstrument()
            name = getattr(inst, 'instrumentName', None)
        if name:
            instruments_found.append(name)

    progress("generating", 92)

    score.write("musicxml", fp=output_path)

    progress("generating", 96)

    metadata = extract_metadata_from_musicxml(output_path)
    metadata["instruments"] = instruments_found

    return metadata


def extract_metadata_from_musicxml(path):
    from xml.etree import ElementTree as ET
    metadata = {"key": "C", "timeSignature": [4, 4], "tempo": 120}

    try:
        tree = ET.parse(path)
        root = tree.getroot()

        for attr in root.iter("attributes"):
            ts = attr.find("time")
            if ts is not None:
                beats_el = ts.find("beats")
                bt_el = ts.find("beat-type")
                if beats_el is not None and bt_el is not None:
                    metadata["timeSignature"] = [int(beats_el.text), int(bt_el.text)]
                    break

            ks = attr.find("key")
            if ks is not None:
                fifths_el = ks.find("fifths")
                mode_el = ks.find("mode")
                if fifths_el is not None:
                    fifths = int(fifths_el.text)
                    mode = mode_el.text if mode_el is not None else "major"
                    metadata["key"] = fifths_to_key_name(fifths, mode)

        for direction in root.iter("direction"):
            sound = direction.find(".//sound")
            if sound is not None and "tempo" in sound.attrib:
                metadata["tempo"] = int(float(sound.attrib["tempo"]))
                break
    except Exception:
        pass

    return metadata


FIFTHS_MAJOR = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"]
FIFTHS_MINOR = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"]


def fifths_to_key_name(fifths, mode="major"):
    idx = fifths + 7
    if mode == "minor":
        return FIFTHS_MINOR[idx] if 0 <= idx < len(FIFTHS_MINOR) else "Am"
    return FIFTHS_MAJOR[idx] if 0 <= idx < len(FIFTHS_MAJOR) else "C"


def main():
    parser = argparse.ArgumentParser(description="audio2sheets pipeline (Transkun V2 → music21)")
    parser.add_argument("input", help="Audio file path")
    parser.add_argument("-o", "--output", required=True, help="Output MusicXML path")
    parser.add_argument("--solo-piano", action="store_true", help="Skip Demucs separation (input is solo piano)")
    args = parser.parse_args()

    try:
        if not args.solo_piano:
            progress("separating", 0)
        score_midi_path, perf_midi_path = transcribe_audio(args.input, solo_piano=args.solo_piano)

        midi_copy = args.output.rsplit(".", 1)[0] + ".mid"
        perf_copy = args.output.rsplit(".", 1)[0] + ".perf.mid"
        shutil.copy2(score_midi_path, midi_copy)
        shutil.copy2(perf_midi_path, perf_copy)

        progress("generating", 80)
        metadata = convert_midi_to_musicxml(score_midi_path, args.output)

        progress("done", 100)
        print(json.dumps({"output": args.output, "midi": midi_copy, "perf_midi": perf_copy, "metadata": metadata}))

    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    finally:
        _cleanup_temp_dirs()


if __name__ == "__main__":
    main()
