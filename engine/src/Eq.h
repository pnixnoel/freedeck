#pragma once

#include <juce_dsp/juce_dsp.h>
#include <atomic>

namespace freedeck {

class ThreeBandEq {
public:
    void prepare(const juce::dsp::ProcessSpec& spec);
    void reset();
    void set_gain_db(uint8_t band, float gain_db);
    void process(juce::AudioBuffer<float>& buffer);

private:
    void update_coefficients();

    juce::dsp::ProcessorChain<
        juce::dsp::IIR::Filter<float>,
        juce::dsp::IIR::Filter<float>,
        juce::dsp::IIR::Filter<float>>
        chain_;

    juce::dsp::ProcessSpec spec_{};
    std::atomic<float> low_gain_{0.0f};
    std::atomic<float> mid_gain_{0.0f};
    std::atomic<float> high_gain_{0.0f};
    float applied_low_{0.0f};
    float applied_mid_{0.0f};
    float applied_high_{0.0f};
};

} // namespace freedeck
