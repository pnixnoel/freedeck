#pragma once

#include <juce_dsp/juce_dsp.h>

namespace freedeck {

class DjFilter {
public:
    void prepare(const juce::dsp::ProcessSpec& spec);
    void reset();
    void process(juce::AudioBuffer<float>& buffer, float amount);

private:
    static constexpr float kDetentThreshold = 0.02f;
    static constexpr float kLpFloorHz = 150.0f;
    static constexpr float kHpCeilingHz = 6000.0f;
    static constexpr float kResonanceBase = 0.707f;
    static constexpr float kResonanceSlope = 0.9f;
    static constexpr float kSmoothingSeconds = 0.025f;

    juce::dsp::StateVariableTPTFilter<float> svf_;
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> cutoff_sm_;
    juce::dsp::ProcessSpec spec_{};
    bool active_{false};
    int last_type_{-1};
};

} // namespace freedeck
