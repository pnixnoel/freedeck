mod engine_bridge;

use cxx::UniquePtr;
use engine_bridge::Engine;
use parking_lot::Mutex;
use serde::Serialize;
use std::pin::Pin;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State, Manager};

struct EngineHolder {
    engine: Mutex<UniquePtr<Engine>>,
}

// Engine lives on the C++ heap; all access is serialized by the mutex.
unsafe impl Send for EngineHolder {}
unsafe impl Sync for EngineHolder {}

struct DbState {
    conn: Mutex<rusqlite::Connection>,
}

#[derive(Clone, Serialize, serde::Deserialize)]
struct LibraryTrack {
    id: String,
    path: String,
    artist: String,
    title: String,
    album: String,
    genre: String,
    duration: f64,
    bpm: f32,
    key: String,
    play_count: i32,
}

#[derive(Clone, Serialize, serde::Deserialize)]
struct CuePoint {
    track_id: String,
    index: i32,
    position: f64,
}

#[derive(Clone, Serialize, serde::Deserialize)]
struct SavedLoop {
    track_id: String,
    index: i32,
    start_seconds: f64,
    end_seconds: f64,
    active: bool,
}

use std::hash::{Hash, Hasher};
fn get_track_id(path: &str) -> String {
    let mut hasher = std::hash::DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn scan_directory(dir: &std::path::Path, files: &mut Vec<std::path::PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_directory(&path, files);
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "mp3" || ext_lower == "wav" || ext_lower == "aif" || ext_lower == "aiff" || ext_lower == "flac" || ext_lower == "m4a" {
                        files.push(path);
                    }
                }
            }
        }
    }
}

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
    crossfader: f32,
    crossfader_gain_a: f32,
    crossfader_gain_b: f32,
    deck_a_peak_left: f32,
    deck_a_peak_right: f32,
    deck_a_volume: f32,
    deck_a_trim_gain: f32,
    deck_a_filter: f32,
    deck_a_eq_low_db: f32,
    deck_a_eq_mid_db: f32,
    deck_a_eq_high_db: f32,
    deck_a_tempo: f32,
    deck_a_key_lock: bool,
    deck_a_loaded: bool,
    deck_a_synced: bool,
    deck_a_is_master: bool,
    deck_a_sync_phase_error: f32,
    deck_a_loop_active: bool,
    deck_a_loop_start_seconds: f32,
    deck_a_loop_end_seconds: f32,
    deck_b_peak_left: f32,
    deck_b_peak_right: f32,
    deck_b_volume: f32,
    deck_b_trim_gain: f32,
    deck_b_filter: f32,
    deck_b_eq_low_db: f32,
    deck_b_eq_mid_db: f32,
    deck_b_eq_high_db: f32,
    deck_b_tempo: f32,
    deck_b_key_lock: bool,
    deck_b_loaded: bool,
    deck_b_synced: bool,
    deck_b_is_master: bool,
    deck_b_sync_phase_error: f32,
    deck_b_loop_active: bool,
    deck_b_loop_start_seconds: f32,
    deck_b_loop_end_seconds: f32,
    master_deck: i32,
    buffer_size_ms: f32,
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
fn engine_set_filter(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    amount: f32,
) -> Result<(), String> {
    let _ =
        with_engine_mut(&state, |engine| engine_bridge::set_filter(engine, deck, amount));
    Ok(())
}

#[tauri::command]
fn engine_set_trim(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    gain_db: f32,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_trim(engine, deck, gain_db));
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
fn engine_set_sync(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    enabled: bool,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_sync(engine, deck, enabled));
    Ok(())
}

#[tauri::command]
fn engine_set_quantize(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    enabled: bool,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_quantize(engine, deck, enabled));
    Ok(())
}

#[tauri::command]
fn engine_set_master(
    state: State<Arc<EngineHolder>>,
    deck: u8,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_master(engine, deck));
    Ok(())
}

#[tauri::command]
fn engine_set_beatgrid(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    bpm: f64,
    offset: f64,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| engine_bridge::set_beatgrid(engine, deck, bpm, offset));
    Ok(())
}

#[tauri::command]
fn engine_track_beats(
    state: State<Arc<EngineHolder>>,
    deck: u8,
) -> Result<Vec<f64>, String> {
    with_engine(&state, |engine| engine_bridge::track_beats(engine, deck))
}

#[derive(Clone, Serialize)]
struct LicenseInfoPayload {
    aubio_linked: bool,
    essentia_linked: bool,
    aubio_license: String,
    essentia_license: String,
}

#[tauri::command]
fn engine_get_license_info(
    state: State<Arc<EngineHolder>>,
) -> Result<LicenseInfoPayload, String> {
    with_engine(&state, |engine| {
        let info = engine_bridge::license_info(engine);
        LicenseInfoPayload {
            aubio_linked: info.aubio_linked,
            essentia_linked: info.essentia_linked,
            aubio_license: info.aubio_license.clone(),
            essentia_license: info.essentia_license.clone(),
        }
    })
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
    beats: Vec<f64>,
    beats_valid: bool,
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
            beats: dto.beats,
            beats_valid: dto.beats_valid,
        }
    })
}

#[tauri::command]
fn engine_set_loop_points(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    start_seconds: f64,
    end_seconds: f64,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| {
        engine_bridge::set_loop_points(engine, deck, start_seconds, end_seconds)
    });
    Ok(())
}

#[tauri::command]
fn engine_set_loop_active(
    state: State<Arc<EngineHolder>>,
    deck: u8,
    active: bool,
) -> Result<(), String> {
    let _ = with_engine_mut(&state, |engine| {
        engine_bridge::set_loop_active(engine, deck, active)
    });
    Ok(())
}

#[tauri::command]
fn library_get_tracks(db: State<'_, DbState>) -> Result<Vec<LibraryTrack>, String> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, path, artist, title, album, genre, duration, bpm, key, play_count FROM tracks")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([], |row| {
            Ok(LibraryTrack {
                id: row.get(0)?,
                path: row.get(1)?,
                artist: row.get(2)?,
                title: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                duration: row.get(6)?,
                bpm: row.get(7)?,
                key: row.get(8)?,
                play_count: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tracks = Vec::new();
    for row in rows {
        tracks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tracks)
}

#[tauri::command]
fn library_delete_track(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute("DELETE FROM tracks WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cue_points WHERE track_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM saved_loops WHERE track_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn library_get_track_id(path: String) -> String {
    get_track_id(&path)
}

#[tauri::command]
fn library_import_folder(db: State<'_, DbState>, folder_path: String) -> Result<usize, String> {
    let dir = std::path::Path::new(&folder_path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Invalid folder path".into());
    }

    let mut files = Vec::new();
    scan_directory(dir, &mut files);

    let mut imported_count = 0;
    let conn = db.conn.lock();

    for file in files {
        let path_str = file.to_string_lossy().into_owned();
        let id = get_track_id(&path_str);

        let mut stmt = conn
            .prepare("SELECT 1 FROM tracks WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let exists = stmt.exists([&id]).map_err(|e| e.to_string())?;

        if !exists {
            let analysis = engine_bridge::analyze_file(&path_str);
            let beats_json = serde_json::to_string(&analysis.beats).unwrap_or_else(|_| "[]".to_string());

            conn.execute(
                "INSERT INTO tracks (id, path, artist, title, album, genre, duration, bpm, key, beats, play_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
                rusqlite::params![
                    id,
                    path_str,
                    analysis.artist,
                    analysis.title,
                    analysis.album,
                    analysis.genre,
                    analysis.duration_seconds,
                    analysis.bpm,
                    analysis.key,
                    beats_json,
                ],
            )
            .map_err(|e| e.to_string())?;

            imported_count += 1;
        }
    }

    Ok(imported_count)
}

#[tauri::command]
fn library_get_cues(db: State<'_, DbState>, track_id: String) -> Result<Vec<CuePoint>, String> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT track_id, idx, position FROM cue_points WHERE track_id = ?1")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([&track_id], |row| {
            Ok(CuePoint {
                track_id: row.get(0)?,
                index: row.get(1)?,
                position: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cues = Vec::new();
    for row in rows {
        cues.push(row.map_err(|e| e.to_string())?);
    }
    Ok(cues)
}

#[tauri::command]
fn library_set_cue(
    db: State<'_, DbState>,
    track_id: String,
    index: i32,
    position: f64,
) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute(
        "INSERT OR REPLACE INTO cue_points (track_id, idx, position) VALUES (?1, ?2, ?3)",
        rusqlite::params![track_id, index, position],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn library_delete_cue(db: State<'_, DbState>, track_id: String, index: i32) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute(
        "DELETE FROM cue_points WHERE track_id = ?1 AND idx = ?2",
        rusqlite::params![track_id, index],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn library_get_loops(db: State<'_, DbState>, track_id: String) -> Result<Vec<SavedLoop>, String> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT track_id, idx, start_seconds, end_seconds, active FROM saved_loops WHERE track_id = ?1")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([&track_id], |row| {
            let active_int: i32 = row.get(4)?;
            Ok(SavedLoop {
                track_id: row.get(0)?,
                index: row.get(1)?,
                start_seconds: row.get(2)?,
                end_seconds: row.get(3)?,
                active: active_int != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut loops = Vec::new();
    for row in rows {
        loops.push(row.map_err(|e| e.to_string())?);
    }
    Ok(loops)
}

#[tauri::command]
fn library_set_loop(
    db: State<'_, DbState>,
    track_id: String,
    index: i32,
    start_seconds: f64,
    end_seconds: f64,
    active: bool,
) -> Result<(), String> {
    let conn = db.conn.lock();
    let active_int = if active { 1 } else { 0 };
    conn.execute(
        "INSERT OR REPLACE INTO saved_loops (track_id, idx, start_seconds, end_seconds, active) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![track_id, index, start_seconds, end_seconds, active_int],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn library_increment_play_count(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
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
            let snap = engine_bridge::engine_snapshot(engine);
            let payload = TelemetryEvent {
                deck_a_position: engine_bridge::position_seconds(engine, 0),
                deck_b_position: engine_bridge::position_seconds(engine, 1),
                deck_a_duration: engine_bridge::duration_seconds(engine, 0),
                deck_b_duration: engine_bridge::duration_seconds(engine, 1),
                deck_a_playing: engine_bridge::is_playing(engine, 0),
                deck_b_playing: engine_bridge::is_playing(engine, 1),
                output_left: snap.output_left,
                output_right: snap.output_right,
                crossfader: snap.crossfader,
                crossfader_gain_a: snap.crossfader_gain_a,
                crossfader_gain_b: snap.crossfader_gain_b,
                deck_a_peak_left: snap.deck_a_peak_left,
                deck_a_peak_right: snap.deck_a_peak_right,
                deck_a_volume: snap.deck_a_volume,
                deck_a_trim_gain: snap.deck_a_trim_gain,
                deck_a_filter: snap.deck_a_filter,
                deck_a_eq_low_db: snap.deck_a_eq_low_db,
                deck_a_eq_mid_db: snap.deck_a_eq_mid_db,
                deck_a_eq_high_db: snap.deck_a_eq_high_db,
                deck_a_tempo: snap.deck_a_tempo,
                deck_a_key_lock: snap.deck_a_key_lock,
                deck_a_loaded: snap.deck_a_loaded,
                deck_a_synced: snap.deck_a_synced,
                deck_a_is_master: snap.deck_a_is_master,
                deck_a_sync_phase_error: snap.deck_a_sync_phase_error,
                deck_a_loop_active: snap.deck_a_loop_active,
                deck_a_loop_start_seconds: snap.deck_a_loop_start_seconds,
                deck_a_loop_end_seconds: snap.deck_a_loop_end_seconds,
                deck_b_peak_left: snap.deck_b_peak_left,
                deck_b_peak_right: snap.deck_b_peak_right,
                deck_b_volume: snap.deck_b_volume,
                deck_b_trim_gain: snap.deck_b_trim_gain,
                deck_b_filter: snap.deck_b_filter,
                deck_b_eq_low_db: snap.deck_b_eq_low_db,
                deck_b_eq_mid_db: snap.deck_b_eq_mid_db,
                deck_b_eq_high_db: snap.deck_b_eq_high_db,
                deck_b_tempo: snap.deck_b_tempo,
                deck_b_key_lock: snap.deck_b_key_lock,
                deck_b_loaded: snap.deck_b_loaded,
                deck_b_synced: snap.deck_b_synced,
                deck_b_is_master: snap.deck_b_is_master,
                deck_b_sync_phase_error: snap.deck_b_sync_phase_error,
                deck_b_loop_active: snap.deck_b_loop_active,
                deck_b_loop_start_seconds: snap.deck_b_loop_start_seconds,
                deck_b_loop_end_seconds: snap.deck_b_loop_end_seconds,
                master_deck: snap.master_deck,
                buffer_size_ms: snap.buffer_size_ms,
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
            engine_set_filter,
            engine_set_trim,
            engine_set_tempo,
            engine_set_key_lock,
            engine_set_crossfader,
            engine_waveform_peaks,
            engine_track_analysis,
            engine_set_sync,
            engine_set_master,
            engine_set_beatgrid,
            engine_track_beats,
            engine_set_quantize,
            engine_get_license_info,
            engine_set_loop_points,
            engine_set_loop_active,
            library_get_tracks,
            library_delete_track,
            library_get_track_id,
            library_import_folder,
            library_get_cues,
            library_set_cue,
            library_delete_cue,
            library_get_loops,
            library_set_loop,
            library_increment_play_count,
        ])
        .setup(move |app| {
            let local_data_dir = app.path().app_local_data_dir().unwrap();
            std::fs::create_dir_all(&local_data_dir).unwrap();
            let db_path = local_data_dir.join("library.db");
            let conn = rusqlite::Connection::open(db_path).expect("failed to open database");
            
            conn.execute(
                "CREATE TABLE IF NOT EXISTS tracks (
                    id TEXT PRIMARY KEY,
                    path TEXT UNIQUE NOT NULL,
                    artist TEXT,
                    title TEXT,
                    album TEXT,
                    genre TEXT,
                    duration REAL NOT NULL,
                    bpm REAL NOT NULL,
                    key TEXT,
                    beats TEXT,
                    play_count INTEGER DEFAULT 0
                )",
                [],
            ).expect("failed to create tracks table");

            conn.execute(
                "CREATE TABLE IF NOT EXISTS cue_points (
                    track_id TEXT NOT NULL,
                    idx INTEGER NOT NULL,
                    position REAL NOT NULL,
                    PRIMARY KEY (track_id, idx)
                )",
                [],
            ).expect("failed to create cue_points table");

            conn.execute(
                "CREATE TABLE IF NOT EXISTS saved_loops (
                    track_id TEXT NOT NULL,
                    idx INTEGER NOT NULL,
                    start_seconds REAL NOT NULL,
                    end_seconds REAL NOT NULL,
                    active INTEGER DEFAULT 0,
                    PRIMARY KEY (track_id, idx)
                )",
                [],
            ).expect("failed to create saved_loops table");

            app.manage(DbState {
                conn: Mutex::new(conn),
            });

            spawn_telemetry_emitter(app.handle().clone(), holder);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
