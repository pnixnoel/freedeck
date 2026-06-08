#include "Filter.h"

#include <cmath>

namespace freedeck {

void DjFilter::prepare(const juce::dsp::ProcessSpec& spec) {
    spec_ = spec;
    svf_.prepare(spec);
    svf_.reset();
    cutoff_sm_.reset(spec.sampleRate, kSmoothingSeconds);
    cutoff_sm_.setCurrentAndTargetValue(20000.0f);
    active_ = false;
    last_type_ = -1;
}

void DjFilter::reset() {
    svf_.reset();
    cutoff_sm_.setCurrentAndTargetValue(20000.0f);
    active_ = false;
    last_type_ = -1;
}

void DjFilter::process(juce::AudioBuffer<float>& buffer, float amount) {
    if (spec_.sampleRate <= 0.0)
        return;

    amount = juce::jlimit(-1.0f, 1.0f, amount);

    if (std::abs(amount) <= kDetentThreshold) {
        if (active_) {
            svf_.reset();
            active_ = false;
            last_type_ = -1;
        }
        return;
    }

    const float t = std::abs(amount);
    const float nyq = static_cast<float>(spec_.sampleRate) * 0.45f;
    const int type = amount < 0.0f ? 0 : 1;

    const float cutoff = (type == 0)
        ? juce::jmin(nyq, 20000.0f * std::pow(kLpFloorHz / 20000.0f, t))
        : 20.0f * std::pow(kHpCeilingHz / 20.0f, t);

    const float reso = kResonanceBase + kResonanceSlope * t;

    if (!active_ || type != last_type_) {
        cutoff_sm_.setCurrentAndTargetValue(cutoff);
        svf_.reset();
    } else {
        cutoff_sm_.setTargetValue(cutoff);
    }

    active_ = true;
    last_type_ = type;

    svf_.setType(type == 0 ? juce::dsp::StateVariableTPTFilterType::lowpass
                           : juce::dsp::StateVariableTPTFilterType::highpass);
    svf_.setResonance(reso);

    const int num_channels = buffer.getNumChannels();
    const int num_samples = buffer.getNumSamples();
    auto* const* data = buffer.getArrayOfWritePointers();

    for (int i = 0; i < num_samples; ++i) {
        svf_.setCutoffFrequency(cutoff_sm_.getNextValue());
        for (int ch = 0; ch < num_channels; ++ch)
            data[ch][i] = svf_.processSample(ch, data[ch][i]);
    }
}

} // namespace freedeck
