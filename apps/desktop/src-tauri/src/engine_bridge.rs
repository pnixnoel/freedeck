#[cxx::bridge(namespace = freedeck_bridge)]
mod ffi {
    struct TrackAnalysisDto {
        bpm: f32,
        bpm_valid: bool,
        key: String,
        key_valid: bool,
        beatgrid_offset_seconds: f32,
        beatgrid_offset_valid: bool,
        beats: Vec<f64>,
        beats_valid: bool,
    }

    struct EngineSnapshotDto {
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
    }

    unsafe extern "C++" {
        include!("engine_shim.h");

        type Engine;

        fn new_engine() -> UniquePtr<Engine>;
        fn start_audio(engine: Pin<&mut Engine>) -> bool;
        fn stop_audio(engine: Pin<&mut Engine>);
        fn load_track(engine: Pin<&mut Engine>, deck: u8, path: &str) -> bool;
        fn set_play(engine: Pin<&mut Engine>, deck: u8, playing: bool);
        fn cue(engine: Pin<&mut Engine>, deck: u8);
        fn seek(engine: Pin<&mut Engine>, deck: u8, position_seconds: f64);
        fn set_volume(engine: Pin<&mut Engine>, deck: u8, gain: f32);
        fn set_eq(engine: Pin<&mut Engine>, deck: u8, band: u8, gain_db: f32);
        fn set_filter(engine: Pin<&mut Engine>, deck: u8, amount: f32);
        fn set_trim(engine: Pin<&mut Engine>, deck: u8, gain_db: f32);
        fn set_tempo(engine: Pin<&mut Engine>, deck: u8, ratio: f32);
        fn set_key_lock(engine: Pin<&mut Engine>, deck: u8, enabled: bool);
        fn set_crossfader(engine: Pin<&mut Engine>, position: f32);
        fn is_playing(engine: &Engine, deck: u8) -> bool;
        fn position_seconds(engine: &Engine, deck: u8) -> f64;
        fn duration_seconds(engine: &Engine, deck: u8) -> f64;
        fn waveform_peaks(engine: &Engine, deck: u8) -> Vec<f32>;
        fn track_analysis(engine: &Engine, deck: u8) -> TrackAnalysisDto;
        fn output_left(engine: &Engine) -> f32;
        fn output_right(engine: &Engine) -> f32;
        fn engine_snapshot(engine: &Engine) -> EngineSnapshotDto;
    }
}

pub use ffi::Engine;
pub use ffi::new_engine;
pub use ffi::{
    cue, duration_seconds, engine_snapshot, is_playing, load_track, output_left, output_right,
    position_seconds, seek, set_crossfader, set_eq, set_filter, set_key_lock, set_play, set_tempo,
    set_trim, set_volume, start_audio, track_analysis, waveform_peaks,
};
pub use ffi::EngineSnapshotDto;
