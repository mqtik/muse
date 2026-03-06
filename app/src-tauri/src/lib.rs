mod pipeline;
mod setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            pipeline::start_pipeline,
            pipeline::save_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
