import sys
import json
import argparse
import tempfile
import os


def progress(stage, percent):
    print(json.dumps({"stage": stage, "percent": percent}), file=sys.stderr, flush=True)


def get_pm2s_path():
    pm2s_dir = os.path.join(os.path.expanduser("~"), ".audio2sheets", "pm2s")
    if os.path.isdir(pm2s_dir) and pm2s_dir not in sys.path:
        sys.path.insert(0, pm2s_dir)
    return pm2s_dir


def notes_to_midi(notes, output_path):
    import pretty_midi

    midi = pretty_midi.PrettyMIDI()
    piano = pretty_midi.Instrument(program=0, name="Piano")

    for note in notes:
        midi_note = pretty_midi.Note(
            velocity=max(1, min(127, int(note["velocity"] * 127))),
            pitch=note["pitch"],
            start=note["startTime"],
            end=note["startTime"] + note["duration"],
        )
        piano.notes.append(midi_note)

    midi.instruments.append(piano)
    midi.write(output_path)


def main():
    parser = argparse.ArgumentParser(description="Quantize note events to musical score")
    parser.add_argument("input", help="Note events JSON path (from transcribe)")
    parser.add_argument("-o", "--output", required=True, help="Output quantized JSON path")
    args = parser.parse_args()

    progress("quantizing", 0)

    with open(args.input) as f:
        data = json.load(f)

    notes = data["notes"]

    tmp_perf = tempfile.mktemp(suffix=".mid", prefix="audio2sheets_quantize_perf_")
    tmp_score = tempfile.mktemp(suffix=".mid", prefix="audio2sheets_quantize_score_")

    try:
        notes_to_midi(notes, tmp_perf)

        progress("quantizing", 20)

        quantized = False
        try:
            import pretty_midi
            perf = pretty_midi.PrettyMIDI(tmp_perf)
            end_time = perf.get_end_time() + 1.0

            get_pm2s_path()
            from pm2s import CRNNJointPM2S

            pm2s = CRNNJointPM2S(ticks_per_beat=480, notes_per_beat=[1, 2, 3, 4, 6, 8])
            pm2s.convert(
                performance_midi_file=tmp_perf,
                score_midi_file=tmp_score,
                end_time=end_time,
                include_key_signature=True,
                include_time_signature=False,
            )
            quantized = True
        except Exception:
            pass

        progress("quantizing", 60)

        parts = []

        if quantized:
            import partitura as pt
            score = pt.load_score_midi(tmp_score)

            progress("quantizing", 80)

            for i, part in enumerate(score.parts):
                part_notes = []
                for note in part.notes_tied:
                    part_notes.append({
                        "pitch": int(note.midi_pitch),
                        "onset": float(note.start.t) if hasattr(note.start, "t") else float(note.start),
                        "duration": float(note.duration),
                        "voice": int(getattr(note, "voice", 1)),
                        "staff": int(i + 1),
                    })
                hand = "left" if i == 0 else "right"
                parts.append({"name": f"Piano ({hand})", "hand": hand, "notes": part_notes})
        else:
            progress("quantizing", 80)

            bpm = 120.0
            ticks_per_beat = 480
            ticks_per_second = ticks_per_beat * bpm / 60.0

            part_notes = []
            for note in notes:
                onset_ticks = round(note["startTime"] * ticks_per_second)
                dur_ticks = round(note["duration"] * ticks_per_second)
                if dur_ticks < 1:
                    dur_ticks = ticks_per_beat
                part_notes.append({
                    "pitch": note["pitch"],
                    "onset": onset_ticks,
                    "duration": dur_ticks,
                    "voice": 1,
                    "staff": 1,
                })
            parts.append({"name": "Piano (right)", "hand": "right", "notes": part_notes})

        result = {"parts": parts}

        with open(args.output, "w") as f:
            json.dump(result, f, indent=2)

        progress("done", 100)
        print(json.dumps({"output": args.output}))

    finally:
        for f in [tmp_perf, tmp_score]:
            if os.path.exists(f):
                os.unlink(f)


if __name__ == "__main__":
    main()
