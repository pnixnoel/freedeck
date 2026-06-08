#include "Eq.h"

#include <limits>

namespace freedeck {

void ThreeBandEq::prepare(const juce::dsp::ProcessSpec& spec) {
    spec_ = spec;
    chain_.prepare(spec);
    reset();
    // Force coefficient push — default gains are 0 dB and applied_* also start at 0.
    applied_low_ = std::numeric_limits<float>::quiet_NaN();
    applied_mid_ = std::numeric_limits<float>::quiet_NaN();
    applied_high_ = std::numeric_limits<float>::quiet_NaN();
    update_coefficients();
}

void ThreeBandEq::reset() {
    chain_.reset();
}

float ThreeBandEq::gain_db(uint8_t band) const {
    switch (band) {
        case 0: return low_gain_.load(std::memory_order_relaxed);
        case 1: return mid_gain_.load(std::memory_order_relaxed);
        case 2: return high_gain_.load(std::memory_order_relaxed);
        default: return 0.0f;
    }
}

void ThreeBandEq::set_gain_db(uint8_t band, float gain_db) {
    gain_db = juce::jlimit(-24.0f, 24.0f, gain_db);
    switch (band) {
        case 0: low_gain_.store(gain_db, std::memory_order_relaxed); break;
        case 1: mid_gain_.store(gain_db, std::memory_order_relaxed); break;
        case 2: high_gain_.store(gain_db, std::memory_order_relaxed); break;
        default: break;
    }
}

void ThreeBandEq::update_coefficients() {
    const float low = low_gain_.load(std::memory_order_relaxed);
    const float mid = mid_gain_.load(std::memory_order_relaxed);
    const float high = high_gain_.load(std::memory_order_relaxed);

    if (low != applied_low_ || mid != applied_mid_ || high != applied_high_) {
        applied_low_ = low;
        applied_mid_ = mid;
        applied_high_ = high;

        const float sample_rate = static_cast<float>(spec_.sampleRate);
        auto& low_filter = chain_.get<0>();
        auto& mid_filter = chain_.get<1>();
        auto& high_filter = chain_.get<2>();

        *low_filter.state =
            *juce::dsp::IIR::Coefficients<float>::makeLowShelf(
                sample_rate, 250.0f, 0.707f, juce::Decibels::decibelsToGain(low));

        *mid_filter.state =
            *juce::dsp::IIR::Coefficients<float>::makePeakFilter(
                sample_rate, 1000.0f, 0.707f, juce::Decibels::decibelsToGain(mid));

        *high_filter.state =
            *juce::dsp::IIR::Coefficients<float>::makeHighShelf(
                sample_rate, 4000.0f, 0.707f, juce::Decibels::decibelsToGain(high));
    }
}

void ThreeBandEq::process(juce::AudioBuffer<float>& buffer) {
    update_coefficients();
    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);
    chain_.process(context);
}

} // namespace freedeck
