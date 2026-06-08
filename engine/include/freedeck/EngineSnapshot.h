#pragma once

#include <cstdint>

namespace freedeck {

struct DeckSnapshot {
    float peak_left = 0.0f;
    float peak_right = 0.0f;
    float volume = 1.0f;
    float trim_gain = 1.0f;
    float filter_amount = 0.0f;
    float eq_low_db = 0.0f;
    float eq_mid_db = 0.0f;
    float eq_high_db = 0.0f;
    float tempo_ratio = 1.0f;
    bool key_lock = true;
    bool loaded = false;
};

struct EngineSnapshot {
    float output_left = 0.0f;
    float output_right = 0.0f;
    float crossfader = 0.0f;
    float crossfader_gain_a = 1.0f;
    float crossfader_gain_b = 0.0f;
    DeckSnapshot deck_a;
    DeckSnapshot deck_b;
};

} // namespace freedeck
