#include "Eq.h"

namespace freedeck {

void ThreeBandEq::prepare(const juce::dsp::ProcessSpec& spec) {
    spec_ = spec;
    chain_.prepare(spec);
    reset();
    update_coefficients();
}

void ThreeBandEq::reset() {
    chain_.reset();
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

        *low_filter.coefficients =
            *juce::dsp::IIR::Coefficients<float>::makeLowShelf(
                sample_rate, 250.0f, 0.707f, juce::Decibels::decibelsToGain(low));

        *mid_filter.coefficients =
            *juce::dsp::IIR::Coefficients<float>::makePeakFilter(
                sample_rate, 1000.0f, 0.707f, juce::Decibels::decibelsToGain(mid));

        *high_filter.coefficients =
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
