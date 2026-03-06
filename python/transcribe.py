import sys
import json
import argparse


def progress(stage, percent):
    print(json.dumps({"stage": stage, "percent": percent}), file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio to note events")
    parser.add_argument("input", help="Audio file path (.mp3, .wav, .ogg, .flac)")
    parser.add_argument("-o", "--output", required=True, help="Output JSON path")
    parser.add_argument("--onset-threshold", type=float, default=0.5)
    parser.add_argument("--frame-threshold", type=float, default=0.3)
    args = parser.parse_args()

    progress("transcribing", 0)

    from basic_pitch.inference import predict

    _, midi_data, note_events = predict(
        args.input,
        onset_threshold=args.onset_threshold,
        frame_threshold=args.frame_threshold,
    )

    progress("transcribing", 90)

    notes = []
    for onset, offset, pitch, velocity, pitch_bends in note_events:
        notes.append({
            "startTime": float(onset),
            "duration": float(offset - onset),
            "pitch": int(pitch),
            "velocity": float(velocity),
        })

    result = {
        "noteCount": len(notes),
        "notes": notes,
    }

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    progress("done", 100)
    print(json.dumps({"output": args.output, "noteCount": len(notes)}))


if __name__ == "__main__":
    main()
