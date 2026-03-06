import sys
import os
import json


def main():
    info = {
        "python": sys.version,
        "venv": sys.prefix,
        "platform": sys.platform,
    }

    try:
        import torch
        info["torch"] = torch.__version__
        info["cuda"] = torch.cuda.is_available()
        info["mps"] = torch.backends.mps.is_available() if hasattr(torch.backends, "mps") else False
        if info["cuda"]:
            info["cuda_device"] = torch.cuda.get_device_name(0)
    except ImportError:
        info["torch"] = "not installed"

    try:
        import basic_pitch
        info["basic_pitch"] = getattr(basic_pitch, "__version__", "installed")
    except ImportError:
        info["basic_pitch"] = "not installed"

    try:
        import partitura
        info["partitura"] = getattr(partitura, "__version__", "installed")
    except ImportError:
        info["partitura"] = "not installed"

    try:
        import demucs
        info["demucs"] = getattr(demucs, "__version__", "installed")
    except ImportError:
        info["demucs"] = "not installed"

    pm2s_dir = os.path.join(os.path.expanduser("~"), ".audio2sheets", "pm2s")
    if os.path.isdir(pm2s_dir):
        sys.path.insert(0, pm2s_dir)
    try:
        import pm2s
        info["pm2s"] = getattr(pm2s, "__version__", "installed")
    except ImportError:
        info["pm2s"] = "not installed"

    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
