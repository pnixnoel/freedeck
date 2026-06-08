#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <cmath>

namespace freedeck {

class Mixer {
public:
    void set_crossfader(float position);
    float crossfader() const;
    float deck_gain(uint8_t deck) const;

private:
    std::atomic<float> crossfader_{0.0f}; // -1 = full A, +1 = full B
};

inline void Mixer::set_crossfader(float position) {
    crossfader_.store(juce::jlimit(-1.0f, 1.0f, position), std::memory_order_relaxed);
}

inline float Mixer::crossfader() const {
    return crossfader_.load(std::memory_order_relaxed);
}

inline float Mixer::deck_gain(uint8_t deck) const {
    const float x = crossfader_.load(std::memory_order_relaxed);
    // Equal-power crossfade
    const float angle = (x + 1.0f) * 0.25f * juce::MathConstants<float>::pi;
    if (deck == 0)
        return std::cos(angle);
    return std::sin(angle);
}

} // namespace freedeck
