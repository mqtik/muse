use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

use crate::setup::{get_python_dir, get_venv_python};

#[derive(Clone, Serialize)]
pub struct PipelineProgress {
    pub stage: String,
    pub percent: u32,
}

#[derive(Clone, Serialize)]
pub struct PipelineResult {
    pub musicxml: String,
    pub metadata: PipelineMetadata,
    pub midi_path: Option<String>,
    pub perf_midi_path: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PipelineMetadata {
    pub key: String,
    #[serde(rename = "timeSignature")]
    pub time_signature: Vec<u32>,
    #[serde(default = "default_tempo")]
    pub tempo: u32,
}

fn default_tempo() -> u32 {
    120
}

#[derive(Deserialize)]
struct PythonProgress {
    stage: Option<String>,
    percent: Option<u32>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct PythonResult {
    output: Option<String>,
    midi: Option<String>,
    perf_midi: Option<String>,
    metadata: Option<PipelineMetadata>,
}

#[tauri::command]
pub async fn start_pipeline(
    app: AppHandle,
    input: String,
    output: String,
    solo_piano: Option<bool>,
) -> Result<PipelineResult, String> {
    let venv_python = get_venv_python();
    if !venv_python.exists() {
        return Err("Python environment not set up. Please run setup first.".to_string());
    }

    let python_dir = get_python_dir();
    let script = python_dir.join("pipeline.py");
    if !script.exists() {
        return Err(format!(
            "Pipeline script not found at {}",
            script.display()
        ));
    }

    let mut args = vec![
        script.to_str().unwrap().to_string(),
        input.clone(),
        "-o".to_string(),
        output.clone(),
    ];
    if solo_piano.unwrap_or(false) {
        args.push("--solo-piano".to_string());
    }

    let mut child = Command::new(venv_python.to_str().unwrap())
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start pipeline: {}", e))?;

    let stderr = child.stderr.take().expect("Failed to capture stderr");
    let stderr_reader = BufReader::new(stderr);
    let app_clone = app.clone();

    let stderr_handle = std::thread::spawn(move || {
        let mut last_error_line = String::new();
        for line in stderr_reader.lines() {
            if let Ok(line) = line {
                if let Ok(progress) = serde_json::from_str::<PythonProgress>(&line) {
                    if let (Some(stage), Some(percent)) = (progress.stage, progress.percent) {
                        let _ = app_clone.emit(
                            "pipeline:progress",
                            PipelineProgress { stage, percent },
                        );
                    }
                } else if !line.trim().is_empty() {
                    last_error_line = line;
                }
            }
        }
        last_error_line
    });

    let stdout_output = {
        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let reader = BufReader::new(stdout);
        let mut full_output = String::new();
        for line in reader.lines() {
            if let Ok(line) = line {
                if !full_output.is_empty() {
                    full_output.push('\n');
                }
                full_output.push_str(&line);
            }
        }
        full_output
    };

    let status = child
        .wait()
        .map_err(|e| format!("Pipeline process error: {}", e))?;
    let last_error = stderr_handle.join().unwrap_or_default();

    if !status.success() {
        let detail = if last_error.is_empty() {
            "Check that the audio file is valid.".to_string()
        } else {
            last_error
        };
        return Err(format!("Pipeline failed: {}", detail));
    }

    let mut metadata = PipelineMetadata {
        key: "C".to_string(),
        time_signature: vec![4, 4],
        tempo: 120,
    };
    let mut midi_path: Option<String> = None;
    let mut perf_midi_path: Option<String> = None;

    for line in stdout_output.lines().rev() {
        if let Ok(result) = serde_json::from_str::<PythonResult>(line) {
            if let Some(meta) = result.metadata {
                metadata = meta;
            }
            if let Some(mp) = result.midi {
                midi_path = Some(mp);
            }
            if let Some(pm) = result.perf_midi {
                perf_midi_path = Some(pm);
            }
            break;
        }
    }

    let musicxml = std::fs::read_to_string(&output)
        .map_err(|e| format!("Failed to read output MusicXML: {}", e))?;

    let _ = app.emit("pipeline:progress", PipelineProgress {
        stage: "done".to_string(),
        percent: 100,
    });

    Ok(PipelineResult { musicxml, metadata, midi_path, perf_midi_path })
}

#[tauri::command]
pub fn save_recording(bytes: Vec<u8>) -> Result<String, String> {
    let tmp = std::env::temp_dir().join(format!(
        "muse_recording_{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Failed to save recording: {}", e))?;
    Ok(tmp.to_string_lossy().to_string())
}
