import sys
import json
import argparse
import os


def progress(stage, percent):
    print(json.dumps({"stage": stage, "percent": percent}), file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(description="Separate audio into instrument stems (Demucs)")
    parser.add_argument("input", help="Audio file path")
    parser.add_argument("-o", "--output", required=True, help="Output directory for stem WAV files")
    parser.add_argument("--model", default="htdemucs_6s", help="Demucs model (default: htdemucs_6s)")
    args = parser.parse_args()

    progress("separating", 0)

    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    device = "mps" if torch.backends.mps.is_available() else \
             "cuda" if torch.cuda.is_available() else "cpu"

    progress("separating", 10)

    model = get_model(args.model)
    model.to(device)

    progress("separating", 20)

    wav, sr = torchaudio.load(args.input)
    if sr != model.samplerate:
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)

    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()

    progress("separating", 30)

    sources = apply_model(model, wav[None], device=device)[0]
    sources = sources * ref.std() + ref.mean()

    progress("separating", 90)

    os.makedirs(args.output, exist_ok=True)

    stem_names = model.sources
    stem_files = {}
    for i, name in enumerate(stem_names):
        stem_path = os.path.join(args.output, f"{name}.wav")
        torchaudio.save(stem_path, sources[i].cpu(), model.samplerate)
        stem_files[name] = stem_path

    progress("done", 100)
    print(json.dumps({"output": args.output, "stems": stem_files}))


if __name__ == "__main__":
    main()
