mod engine;

use engine::{
    get_engine_options_internal, kill_lingering_engine, restart_engine_internal,
    search_position_internal, set_engine_options_internal, start_engine_internal,
    stop_engine_internal, stop_search_internal, EngineState, EngineStatusPayload, SharedEngine,
    UciOptionMeta,
};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

#[tauri::command]
async fn start_engine(
    app: AppHandle,
    state: State<'_, SharedEngine>,
    custom_path: Option<String>,
) -> Result<String, String> {
    start_engine_internal(app, state.inner().clone(), custom_path).await
}

#[tauri::command]
async fn search_position(
    state: State<'_, SharedEngine>,
    fen: String,
    moves: Vec<String>,
    search_type: Option<String>,
    limit_value: Option<u64>,
    movetime_ms: Option<u64>,
    depth: Option<u32>,
    is_ai_move: Option<bool>,
    search_id: Option<u64>,
) -> Result<u64, String> {
    search_position_internal(
        state.inner().clone(),
        fen,
        moves,
        search_type,
        limit_value,
        movetime_ms,
        depth,
        is_ai_move.unwrap_or(false),
        search_id,
    )
    .await
}

#[tauri::command]
async fn stop_search(state: State<'_, SharedEngine>) -> Result<(), String> {
    stop_search_internal(state.inner().clone()).await
}

#[tauri::command]
async fn stop_engine(app: AppHandle, state: State<'_, SharedEngine>) -> Result<(), String> {
    stop_engine_internal(app, state.inner().clone()).await
}

#[tauri::command]
async fn get_engine_status(
    app: AppHandle,
    state: State<'_, SharedEngine>,
) -> Result<EngineStatusPayload, String> {
    let st = state.inner().lock().await;
    Ok(st.get_status(Some(&app)))
}

#[tauri::command]
async fn get_engine_options(state: State<'_, SharedEngine>) -> Result<Vec<UciOptionMeta>, String> {
    get_engine_options_internal(state.inner().clone()).await
}

#[tauri::command]
async fn set_engine_options(
    state: State<'_, SharedEngine>,
    options: Vec<(String, String)>,
) -> Result<(), String> {
    set_engine_options_internal(state.inner().clone(), options).await
}

#[tauri::command]
async fn restart_engine(
    app: AppHandle,
    state: State<'_, SharedEngine>,
    custom_path: Option<String>,
) -> Result<String, String> {
    restart_engine_internal(app, state.inner().clone(), custom_path).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine_state: SharedEngine = Arc::new(Mutex::new(EngineState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(engine_state)
        .invoke_handler(tauri::generate_handler![
            start_engine,
            search_position,
            stop_search,
            stop_engine,
            get_engine_status,
            get_engine_options,
            set_engine_options,
            restart_engine
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // The async runtime may already be stopping. Kill by pid here.
                kill_lingering_engine();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                kill_lingering_engine();
            }
        });
}
