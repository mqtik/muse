import sys
import json
import argparse


def progress(stage, percent):
    print(json.dumps({"stage": stage, "percent": percent}), file=sys.stderr, flush=True)


MIDI_STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
MIDI_ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]


def midi_to_note_attrs(midi_pitch):
    return {
        "step": MIDI_STEPS[midi_pitch % 12],
        "alter": MIDI_ALTERS[midi_pitch % 12],
        "octave": (midi_pitch // 12) - 1,
    }


def main():
    parser = argparse.ArgumentParser(description="Convert quantized score to MusicXML")
    parser.add_argument("input", help="Quantized score JSON path (from quantize)")
    parser.add_argument("-o", "--output", required=True, help="Output MusicXML path")
    args = parser.parse_args()

    progress("generating", 0)

    import partitura as pt

    with open(args.input) as f:
        data = json.load(f)

    progress("generating", 20)

    part = pt.score.Part("P1", "Piano", quarter_duration=480)
    part.add(pt.score.TimeSignature(beats=4, beat_type=4), start=0)

    for part_data in data.get("parts", []):
        for note_data in part_data.get("notes", []):
            attrs = midi_to_note_attrs(note_data["pitch"])
            note = pt.score.Note(
                step=attrs["step"],
                octave=attrs["octave"],
                alter=attrs["alter"],
                voice=note_data.get("voice", 1),
                staff=note_data.get("staff", 1),
            )
            part.add(note, start=int(note_data["onset"]), end=int(note_data["onset"] + note_data["duration"]))

    progress("generating", 50)

    if part.notes:
        spelling = pt.musicanalysis.estimate_spelling(part)
        for note, sp in zip(part.notes, spelling):
            note.step = sp["step"]
            note.alter = sp["alter"]
            note.octave = sp["octave"]

        key = pt.musicanalysis.estimate_key(part)
        if key:
            fifths = _key_name_to_fifths(str(key))
            mode = "minor" if str(key).endswith("m") or str(key).endswith("minor") else "major"
            part.add(pt.score.KeySignature(fifths=fifths, mode=mode), start=0)

    pt.score.add_measures(part)

    progress("generating", 80)

    score = pt.score.Score(partlist=[part])
    pt.save_musicxml(score, args.output)

    progress("done", 100)
    print(json.dumps({"output": args.output}))


KEY_TO_FIFTHS = {
    "Cb": -7, "Gb": -6, "Db": -5, "Ab": -4, "Eb": -3, "Bb": -2, "F": -1,
    "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
    "Abm": -7, "Ebm": -6, "Bbm": -5, "Fm": -4, "Cm": -3, "Gm": -2, "Dm": -1,
    "Am": 0, "Em": 1, "Bm": 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
}


def _key_name_to_fifths(key_name):
    clean = key_name.replace(" minor", "m").replace(" major", "").strip()
    return KEY_TO_FIFTHS.get(clean, 0)


if __name__ == "__main__":
    main()
