#pragma once

#include "freedeck/EngineSnapshot.h"
#include "freedeck/TrackAnalysis.h"
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace freedeck {

// EQ band indices: 0=low, 1=mid, 2=high
constexpr uint8_t kEqLow = 0;
constexpr uint8_t kEqMid = 1;
constexpr uint8_t kEqHigh = 2;

struct OutputLevels {
    float left = 0.0f;
    float right = 0.0f;
};

class Engine {
public:
    Engine();
    ~Engine();

    Engine(const Engine&) = delete;
    Engine& operator=(const Engine&) = delete;

    bool start_audio();
    void stop_audio();

    bool load_track(uint8_t deck, const std::string& path);
    void set_play(uint8_t deck, bool playing);
    void cue(uint8_t deck);
    void seek(uint8_t deck, double position_seconds);

    void set_volume(uint8_t deck, float gain);
    void set_eq(uint8_t deck, uint8_t band, float gain_db);
    void set_filter(uint8_t deck, float amount);
    void set_trim(uint8_t deck, float gain_db);
    void set_tempo(uint8_t deck, float ratio);
    void set_key_lock(uint8_t deck, bool enabled);
    void set_crossfader(float position);

    bool is_playing(uint8_t deck) const;
    double position_seconds(uint8_t deck) const;
    double duration_seconds(uint8_t deck) const;
    std::vector<float> waveform_peaks(uint8_t deck) const;
    TrackAnalysis track_analysis(uint8_t deck) const;
    OutputLevels output_levels() const;
    EngineSnapshot snapshot() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

// Factory for cxx FFI
std::unique_ptr<Engine> new_engine();

} // namespace freedeck
