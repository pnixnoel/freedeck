#include "engine_shim.h"
#include "freedeck/engine.h"

namespace freedeck_bridge {

std::unique_ptr<Engine> new_engine() {
    return freedeck::new_engine();
}

bool start_audio(Engine& engine) {
    return engine.start_audio();
}

void stop_audio(Engine& engine) {
    engine.stop_audio();
}

bool load_track(Engine& engine, uint8_t deck, rust::Str path) {
    return engine.load_track(deck, std::string(path));
}

void set_play(Engine& engine, uint8_t deck, bool playing) {
    engine.set_play(deck, playing);
}

void cue(Engine& engine, uint8_t deck) {
    engine.cue(deck);
}

void seek(Engine& engine, uint8_t deck, double position_seconds) {
    engine.seek(deck, position_seconds);
}

void set_volume(Engine& engine, uint8_t deck, float gain) {
    engine.set_volume(deck, gain);
}

void set_eq(Engine& engine, uint8_t deck, uint8_t band, float gain_db) {
    engine.set_eq(deck, band, gain_db);
}

void set_filter(Engine& engine, uint8_t deck, float amount) {
    engine.set_filter(deck, amount);
}

void set_trim(Engine& engine, uint8_t deck, float gain_db) {
    engine.set_trim(deck, gain_db);
}

void set_tempo(Engine& engine, uint8_t deck, float ratio) {
    engine.set_tempo(deck, ratio);
}

void set_key_lock(Engine& engine, uint8_t deck, bool enabled) {
    engine.set_key_lock(deck, enabled);
}

void set_crossfader(Engine& engine, float position) {
    engine.set_crossfader(position);
}

bool is_playing(const Engine& engine, uint8_t deck) {
    return engine.is_playing(deck);
}

double position_seconds(const Engine& engine, uint8_t deck) {
    return engine.position_seconds(deck);
}

double duration_seconds(const Engine& engine, uint8_t deck) {
    return engine.duration_seconds(deck);
}

rust::Vec<float> waveform_peaks(const Engine& engine, uint8_t deck) {
    const auto peaks = engine.waveform_peaks(deck);
    rust::Vec<float> out;
    out.reserve(peaks.size());
    for (float v : peaks)
        out.push_back(v);
    return out;
}

TrackAnalysisDto track_analysis(const Engine& engine, uint8_t deck) {
    const auto analysis = engine.track_analysis(deck);
    TrackAnalysisDto out;
    out.bpm = analysis.bpm;
    out.bpm_valid = analysis.bpm_valid;
    out.key = analysis.key;
    out.key_valid = analysis.key_valid;
    out.beatgrid_offset_seconds = analysis.beatgrid_offset_seconds;
    out.beatgrid_offset_valid = analysis.beatgrid_offset_valid;
    out.beats_valid = analysis.beats_valid;
    for (double b : analysis.beats) {
        out.beats.push_back(b);
    }
    return out;
}

float output_left(const Engine& engine) {
    return engine.output_levels().left;
}

float output_right(const Engine& engine) {
    return engine.output_levels().right;
}

EngineSnapshotDto engine_snapshot(const Engine& engine) {
    const auto snap = engine.snapshot();
    EngineSnapshotDto out;
    out.output_left = snap.output_left;
    out.output_right = snap.output_right;
    out.crossfader = snap.crossfader;
    out.crossfader_gain_a = snap.crossfader_gain_a;
    out.crossfader_gain_b = snap.crossfader_gain_b;
    out.deck_a_peak_left = snap.deck_a.peak_left;
    out.deck_a_peak_right = snap.deck_a.peak_right;
    out.deck_a_volume = snap.deck_a.volume;
    out.deck_a_trim_gain = snap.deck_a.trim_gain;
    out.deck_a_filter = snap.deck_a.filter_amount;
    out.deck_a_eq_low_db = snap.deck_a.eq_low_db;
    out.deck_a_eq_mid_db = snap.deck_a.eq_mid_db;
    out.deck_a_eq_high_db = snap.deck_a.eq_high_db;
    out.deck_a_tempo = snap.deck_a.tempo_ratio;
    out.deck_a_key_lock = snap.deck_a.key_lock;
    out.deck_a_loaded = snap.deck_a.loaded;
    out.deck_b_peak_left = snap.deck_b.peak_left;
    out.deck_b_peak_right = snap.deck_b.peak_right;
    out.deck_b_volume = snap.deck_b.volume;
    out.deck_b_trim_gain = snap.deck_b.trim_gain;
    out.deck_b_filter = snap.deck_b.filter_amount;
    out.deck_b_eq_low_db = snap.deck_b.eq_low_db;
    out.deck_b_eq_mid_db = snap.deck_b.eq_mid_db;
    out.deck_b_eq_high_db = snap.deck_b.eq_high_db;
    out.deck_b_tempo = snap.deck_b.tempo_ratio;
    out.deck_b_key_lock = snap.deck_b.key_lock;
    out.deck_b_loaded = snap.deck_b.loaded;
    return out;
}

} // namespace freedeck_bridge
