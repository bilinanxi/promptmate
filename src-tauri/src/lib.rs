pub mod ai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ai::save_ai_api_key,
            ai::delete_ai_api_key,
            ai::has_ai_api_key,
            ai::list_ai_models,
            ai::test_ai_provider,
            ai::complete_prompt_fields,
            ai::optimize_composed_prompt,
            ai::generate_prompt_from_image,
            ai::generate_prompt_from_video,
            ai::cancel_ai_request
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
