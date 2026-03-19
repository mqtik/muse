import sys
import json
import argparse
import os
import platform
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


_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
YOURMT3_DIR = os.path.join(_SCRIPT_DIR, "..", "yourmt3")


def _add_yourmt3_to_path():
    amt_src = os.path.join(YOURMT3_DIR, "amt", "src")
    if os.path.isdir(amt_src) and amt_src not in sys.path:
        sys.path.insert(0, amt_src)
    if YOURMT3_DIR not in sys.path:
        sys.path.insert(0, YOURMT3_DIR)


def ensure_yourmt3():
    resolved = os.path.realpath(YOURMT3_DIR)
    if not os.path.isdir(resolved) or not os.path.isfile(os.path.join(resolved, "amt", "src", "model", "ymt3.py")):
        raise RuntimeError(f"YourMT3 model not found at {resolved}. Place the model in the yourmt3/ directory.")


def transcribe_yourmt3(audio_path):
    import contextlib
    import torch
    import numpy as np
    import librosa
    from collections import Counter

    ensure_yourmt3()
    _add_yourmt3_to_path()

    from model_helper import load_model_checkpoint
    from utils.audio import slice_padded_array
    from utils.note2event import mix_notes
    from utils.event2note import merge_zipped_note_events_and_ties_to_notes
    from utils.utils import write_model_output_as_midi

    progress("loading_model", 2)

    model_args = [
        "mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops@last.ckpt",
        "-p", "2024",
        "-tk", "mc13_full_plus_256",
        "-dec", "multi-t5",
        "-nl", "26",
        "-enc", "perceiver-tf",
        "-sqr", "1",
        "-ff", "moe",
        "-wf", "4",
        "-nmoe", "8",
        "-kmoe", "2",
        "-act", "silu",
        "-epe", "rope",
        "-rp", "1",
        "-ac", "spec",
        "-hop", "300",
        "-atc", "1",
        "-pr", "32",
    ]

    old_cwd = os.getcwd()
    os.chdir(YOURMT3_DIR)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            model = load_model_checkpoint(args=model_args, device="cpu")
    finally:
        os.chdir(old_cwd)

    if platform.machine() in ("arm64", "aarch64"):
        torch.backends.quantized.engine = "qnnpack"
    model = torch.ao.quantization.quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8)

    progress("preparing_audio", 10)

    sample_rate = model.audio_cfg['sample_rate']
    input_frames = model.audio_cfg['input_frames']

    audio_np, _ = librosa.load(audio_path, sr=sample_rate, mono=True)
    audio_tensor = torch.from_numpy(audio_np).float().unsqueeze(0)
    audio_segments = slice_padded_array(audio_tensor, input_frames, input_frames)
    audio_segments = torch.from_numpy(audio_segments.astype('float32')).unsqueeze(1)

    progress("transcribing", 15)

    bsz = 8
    n_items = audio_segments.shape[0]
    pred_token_array_file = []
    with torch.inference_mode():
        for i in range(0, n_items, bsz):
            end = min(i + bsz, n_items)
            x = audio_segments[i:end].to(model.device)
            with contextlib.redirect_stdout(sys.stderr):
                preds = model.inference(x).detach().cpu().numpy()
            pred_token_array_file.append(preds)
            progress("transcribing", 15 + int(55 * end / n_items))

    progress("extracting_notes", 70)

    num_channels = model.task_manager.num_decoding_channels
    start_secs_file = [input_frames * i / sample_rate for i in range(n_items)]

    pred_notes_in_file = []
    n_err_cnt = Counter()
    for ch in range(num_channels):
        pred_token_arr_ch = [arr[:, ch, :] for arr in pred_token_array_file]
        zipped_note_events_and_tie, list_events, ne_err_cnt = model.task_manager.detokenize_list_batches(
            pred_token_arr_ch, start_secs_file, return_events=True)
        pred_notes_ch, n_err_cnt_ch = merge_zipped_note_events_and_ties_to_notes(zipped_note_events_and_tie)
        pred_notes_in_file.append(pred_notes_ch)
        n_err_cnt += n_err_cnt_ch
    pred_notes = mix_notes(pred_notes_in_file)

    progress("writing_midi", 85)

    output_dir = _make_temp_dir("yourmt3_")
    track_name = os.path.splitext(os.path.basename(audio_path))[0]

    with contextlib.redirect_stdout(sys.stderr):
        write_model_output_as_midi(pred_notes, output_dir,
                                   track_name, model.midi_output_inverse_vocab)
    midifile = os.path.join(output_dir, "model_output", track_name + ".mid")

    if not os.path.exists(midifile):
        raise RuntimeError("YourMT3 failed to produce MIDI output. No instruments detected in the audio.")

    progress("writing_midi", 95)

    return midifile


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

    from transkun import transcribe_audio as tk_transcribe, filter_notes, apply_sustain_pedal
    source = tk_transcribe(piano_path, device="cpu")
    source = filter_notes(source)

    progress("transcribing", 60)

    import pretty_midi
    import copy

    total_notes = sum(len(inst.notes) for inst in source.instruments)
    if total_notes == 0:
        raise RuntimeError("No notes detected in the audio. Try a longer or louder recording.")

    raw_midi = pretty_midi.PrettyMIDI()
    raw_piano = pretty_midi.Instrument(program=0, name="Piano")
    for inst in source.instruments:
        for note in inst.notes:
            raw_piano.notes.append(copy.deepcopy(note))
    raw_midi.instruments.append(raw_piano)
    raw_midi_path = os.path.join(_make_temp_dir("tk_raw_"), "raw.mid")
    raw_midi.write(raw_midi_path)

    sustained = apply_sustain_pedal(source)
    perf_midi = pretty_midi.PrettyMIDI()
    perf_piano = pretty_midi.Instrument(program=0, name="Piano")
    for inst in sustained.instruments:
        for note in inst.notes:
            perf_piano.notes.append(note)
    perf_midi.instruments.append(perf_piano)
    perf_midi_path = os.path.join(_make_temp_dir("tk_"), "performance.mid")
    perf_midi.write(perf_midi_path)

    progress("transcribing", 65)

    score_midi_path = split_hands(raw_midi_path)

    return score_midi_path, perf_midi_path


def split_hands(performance_midi_path):
    import pretty_midi
    import numpy as np

    progress("quantizing", 68)

    _add_pm2s_to_path()
    from pm2s.io.midi_read import read_note_sequence
    from pm2s.features.hand_part import RNNHandPartProcessor
    from pm2s.features.key_signature import RNNKeySignatureProcessor
    from pm2s.features.time_signature import CNNTimeSignatureProcessor

    note_seq = read_note_sequence(performance_midi_path)

    progress("quantizing", 72)

    hand_parts = RNNHandPartProcessor().process_note_seq(note_seq)
    key_sig = RNNKeySignatureProcessor().process_note_seq(note_seq)
    time_sig = CNNTimeSignatureProcessor().process_note_seq(note_seq)

    progress("quantizing", 76)

    perf = pretty_midi.PrettyMIDI(performance_midi_path)
    all_notes = sorted(
        [n for inst in perf.instruments for n in inst.notes],
        key=lambda n: (n.start, n.pitch),
    )

    score = pretty_midi.PrettyMIDI()
    left = pretty_midi.Instrument(program=0, name="Left Hand")
    right = pretty_midi.Instrument(program=0, name="Right Hand")

    for i, note in enumerate(all_notes):
        if i < len(hand_parts) and hand_parts[i] == 0:
            left.notes.append(note)
        else:
            right.notes.append(note)

    score.instruments.append(left)
    score.instruments.append(right)

    if key_sig:
        ks_name = key_sig[0][0] if isinstance(key_sig[0], (list, tuple)) else key_sig[0]
        if isinstance(ks_name, bytes):
            ks_name = ks_name.decode('utf-8')
        try:
            score.key_signature_changes.append(pretty_midi.KeySignature(
                pretty_midi.key_name_to_key_number(str(ks_name)), 0
            ))
        except Exception:
            pass

    if time_sig:
        ts_str = time_sig if isinstance(time_sig, str) else str(time_sig)
        parts = ts_str.replace("/", " ").split()
        if len(parts) >= 2:
            num, den = int(parts[0]), int(parts[1])
            score.time_signature_changes.append(pretty_midi.TimeSignature(num, den, 0))

    score_midi_path = os.path.join(_make_temp_dir("pm2s_"), "score.mid")
    score.write(score_midi_path)

    progress("quantizing", 79)

    return score_midi_path


def _write_diagnostics(perf_midi_path, score_midi_path, diagnostics_path):
    import pretty_midi

    perf = pretty_midi.PrettyMIDI(perf_midi_path)
    score = pretty_midi.PrettyMIDI(score_midi_path)

    perf_onsets = sorted(n.start for i in perf.instruments for n in i.notes)
    score_onsets = sorted(n.start for i in score.instruments for n in i.notes)

    left_count = sum(len(i.notes) for i in score.instruments if i.name == "Left Hand")
    right_count = sum(len(i.notes) for i in score.instruments if i.name == "Right Hand")

    data = {
        "note_onsets": [float(t) for t in perf_onsets],
        "score_onsets": [float(t) for t in score_onsets],
        "hand_split": {"left": left_count, "right": right_count},
    }

    with open(diagnostics_path, "w") as f:
        json.dump(data, f)


def extract_metadata_from_midi(midi_path):
    import mido

    mid = mido.MidiFile(midi_path)
    metadata = {"key": "C", "timeSignature": [4, 4], "tempo": 120}

    for track in mid.tracks:
        for msg in track:
            if msg.type == 'key_signature':
                metadata["key"] = msg.key
                break
            if msg.type == 'time_signature':
                metadata["timeSignature"] = [msg.numerator, msg.denominator]
            if msg.type == 'set_tempo':
                metadata["tempo"] = round(mido.tempo2bpm(msg.tempo))

    instruments = []
    for track in mid.tracks:
        if track.name:
            instruments.append(track.name)
    metadata["instruments"] = instruments

    return metadata


def main():
    parser = argparse.ArgumentParser(description="audio2sheets pipeline")
    parser.add_argument("input", help="Audio file path")
    parser.add_argument("--backend", choices=["transkun", "yourmt3"], default="transkun")
    parser.add_argument("--solo-piano", action="store_true", help="Skip Demucs separation (input is solo piano)")
    parser.add_argument("--diagnostics", action="store_true", help="Write quantization diagnostics JSON")
    args = parser.parse_args()

    try:
        base = os.path.splitext(args.input)[0]
        midi_copy = base + ".mid"
        perf_copy = base + ".perf.mid"

        if args.backend == "yourmt3":
            yourmt3_midi = transcribe_yourmt3(args.input)
            shutil.copy2(yourmt3_midi, midi_copy)
            shutil.copy2(yourmt3_midi, perf_copy)
            metadata = extract_metadata_from_midi(yourmt3_midi)
        else:
            if not args.solo_piano:
                progress("separating", 0)

            score_midi_path, perf_midi_path = transcribe_audio(args.input, solo_piano=args.solo_piano)
            shutil.copy2(score_midi_path, midi_copy)
            shutil.copy2(perf_midi_path, perf_copy)
            metadata = extract_metadata_from_midi(score_midi_path)

            if args.diagnostics:
                diag_path = base + ".diagnostics.json"
                _write_diagnostics(perf_copy, midi_copy, diag_path)

        progress("done", 100)
        print(json.dumps({"midi": midi_copy, "perf_midi": perf_copy, "metadata": metadata}))

    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    finally:
        _cleanup_temp_dirs()


if __name__ == "__main__":
    main()
