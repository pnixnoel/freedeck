#pragma once

#include <cstdint>
#include <memory>
#include "freedeck/engine.h"
#include "rust/cxx.h"

namespace freedeck_bridge {

using Engine = freedeck::Engine;

std::unique_ptr<Engine> new_engine();
bool start_audio(Engine& engine);
void stop_audio(Engine& engine);
bool load_track(Engine& engine, uint8_t deck, rust::Str path);
void set_play(Engine& engine, uint8_t deck, bool playing);
void cue(Engine& engine, uint8_t deck);
void seek(Engine& engine, uint8_t deck, double position_seconds);
void set_volume(Engine& engine, uint8_t deck, float gain);
void set_eq(Engine& engine, uint8_t deck, uint8_t band, float gain_db);
void set_tempo(Engine& engine, uint8_t deck, float ratio);
void set_key_lock(Engine& engine, uint8_t deck, bool enabled);
void set_crossfader(Engine& engine, float position);
bool is_playing(const Engine& engine, uint8_t deck);
double position_seconds(const Engine& engine, uint8_t deck);
double duration_seconds(const Engine& engine, uint8_t deck);
rust::Vec<float> waveform_peaks(const Engine& engine, uint8_t deck);

#ifndef CXXBRIDGE1_STRUCT_freedeck_bridge$TrackAnalysisDto
#define CXXBRIDGE1_STRUCT_freedeck_bridge$TrackAnalysisDto
struct TrackAnalysisDto final {
    float bpm;
    bool bpm_valid;
    rust::String key;
    bool key_valid;
    float beatgrid_offset_seconds;
    bool beatgrid_offset_valid;
};
#endif

TrackAnalysisDto track_analysis(const Engine& engine, uint8_t deck);
float output_left(const Engine& engine);
float output_right(const Engine& engine);

} // namespace freedeck_bridge
