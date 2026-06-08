mod engine_bridge;

use cxx::UniquePtr;
use engine_bridge::Engine;
use parking_lot::Mutex;
use serde::Serialize;
use std::pin::Pin;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

struct EngineHolder {
    engine: Mutex<UniquePtr<Engine>>,
}

// Engine lives on the C++ heap; all access is serialized by the mutex.
unsafe impl Send for EngineHolder {}
unsafe impl Sync for EngineHolder {}

#[derive(Clone, Serialize)]
struct TelemetryEvent {
    deck_a_position: f64,
    deck_b_position: f64,
    deck_a_duration: f64,
    deck_b_duration: f64,
    deck_a_playing: bool,
    deck_b_playing: bool,
    output_left: f32,
    output_right: f32,
}

fn with_engine_mut<F, R>(holder: &EngineHolder, f: F) -> Result<R, String>
where
    F: FnOnce(Pin<&mut Engine>) -> R,
{
    let mut guard = holder.engine.lock();
    if guard.is_null() {
        return Err("Engine not initialized".into());
    }
    Ok(f(guard.pin_mut()))
}

fn with_engine<F, R>(holder: &EngineHolder, f: F) -> Result<R, String>
where
    F: FnOnce(&Engine) -> R,
{
    let guard = holder.engine.lock();
    if guard.is_null() {
        return Err("Engine not initialized".into());
    }
    Ok(f(guard.as_ref().expect("engine")))
}

#[tauri::command]
fn engine_start(state: State<Arc<EngineHolder>>) -> Result<bool, String> {
    with_engine_mut(&state, engine_bridge::start_audio)
}

#[tauri::command]
fn engine_load_track(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    path: String,
) -> Result<bool, String> {
    with_engine_mut(&state, |engine| engine_bridge::load_track(engine, deck, &path))
}

#[tauri::command]
fn engine_set_play(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    playing: bool,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_play(engine, deck, playing));
    Ok(())
}

#[tauri::command]
fn engine_cue(state: State<Arc<EngineHolder>>, deck: u8) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::cue(engine, deck));
    Ok(())
}

#[tauri::command]
fn engine_seek(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    position_seconds: f64,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::seek(engine, deck, position_seconds));
    Ok(())
}

#[tauri::command]
fn engine_set_volume(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    gain: f32,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_volume(engine, deck, gain));
    Ok(())
}

#[tauri::command]
fn engine_set_eq(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    band: u8,
    gain_db: f32,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_eq(engine, deck, band, gain_db));
    Ok(())
}

#[tauri::command]
fn engine_set_tempo(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    ratio: f32,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_tempo(engine, deck, ratio));
    Ok(())
}

#[tauri::command]
fn engine_set_key_lock(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    enabled: bool,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_key_lock(engine, deck, enabled));
    Ok(())
}

#[tauri::command]
fn engine_set_crossfader(
    state: State<Arc<EngineHolder>>,
    position: f32,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_crossfader(engine, position));
    Ok(())
}

#[tauri::command]
fn engine_waveform_peaks(
    state: State<Arc<EngineHolder>>,
    deck: u8,
) -> Result<Vec<f32>, String> {
    with_engine(&state, |engine| engine_bridge::waveform_peaks(engine, deck))
}

#[derive(Clone, serde::Serialize)]
struct TrackAnalysisPayload {
    bpm: f32,
    bpm_valid: bool,
    key: String,
    key_valid: bool,
    beatgrid_offset_seconds: f32,
    beatgrid_offset_valid: bool,
}

#[tauri::command]
fn engine_track_analysis(
    state: State<Arc<EngineHolder>>,
    deck: u8,
) -> Result<TrackAnalysisPayload, String> {
    with_engine(&state, |engine| {
        let dto = engine_bridge::track_analysis(engine, deck);
        TrackAnalysisPayload {
            bpm: dto.bpm,
            bpm_valid: dto.bpm_valid,
            key: dto.key,
            key_valid: dto.key_valid,
            beatgrid_offset_seconds: dto.beatgrid_offset_seconds,
            beatgrid_offset_valid: dto.beatgrid_offset_valid,
        }
    })
}

fn spawn_telemetry_emitter(app: AppHandle, holder: Arc<EngineHolder>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(16));

            let guard = holder.engine.lock();
            if guard.is_null() {
                continue;
            }

            let engine = guard.as_ref().expect("engine");
            let payload = TelemetryEvent {
                deck_a_position: engine_bridge::position_seconds(engine, 0),
                deck_b_position: engine_bridge::position_seconds(engine, 1),
                deck_a_duration: engine_bridge::duration_seconds(engine, 0),
                deck_b_duration: engine_bridge::duration_seconds(engine, 1),
                deck_a_playing: engine_bridge::is_playing(engine, 0),
                deck_b_playing: engine_bridge::is_playing(engine, 1),
                output_left: engine_bridge::output_left(engine),
                output_right: engine_bridge::output_right(engine),
            };
            drop(guard);

            let _ = app.emit("telemetry", payload);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let holder = Arc::new(EngineHolder {
        engine: Mutex::new(engine_bridge::new_engine()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(holder.clone())
        .invoke_handler(tauri::generate_handler![
            engine_start,
            engine_load_track,
            engine_set_play,
            engine_cue,
            engine_seek,
            engine_set_volume,
            engine_set_eq,
            engine_set_tempo,
            engine_set_key_lock,
            engine_set_crossfader,
            engine_waveform_peaks,
            engine_track_analysis,
        ])
        .setup(move |app| {
            spawn_telemetry_emitter(app.handle().clone(), holder);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
