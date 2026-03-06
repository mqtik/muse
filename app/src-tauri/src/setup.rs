use std::path::PathBuf;

fn audio2sheets_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".audio2sheets")
}

pub fn get_venv_python() -> PathBuf {
    let venv = audio2sheets_dir().join("venv");
    if cfg!(target_os = "windows") {
        venv.join("Scripts").join("python.exe")
    } else {
        venv.join("bin").join("python")
    }
}

pub fn get_python_dir() -> PathBuf {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("python");
    if dev_path.exists() {
        return dev_path;
    }
    let exe = std::env::current_exe().expect("Could not find executable path");
    exe.parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .expect("Could not find app directory")
        .join("python")
}
