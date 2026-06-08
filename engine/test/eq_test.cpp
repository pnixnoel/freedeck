#include "Eq.h"

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cassert>
#include <cmath>
#include <iostream>

namespace {

float peak_amplitude(const juce::AudioBuffer<float>& buffer, int channel) {
    float peak = 0.0f;
    const auto* data = buffer.getReadPointer(channel);
    for (int i = 0; i < buffer.getNumSamples(); ++i)
        peak = std::max(peak, std::abs(data[i]));
    return peak;
}

void fill_sine(juce::AudioBuffer<float>& buffer, float frequency_hz, float sample_rate) {
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        auto* data = buffer.getWritePointer(ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i) {
            const float t = static_cast<float>(i) / sample_rate;
            data[i] = std::sin(juce::MathConstants<float>::twoPi * frequency_hz * t);
        }
    }
}

void test_stereo_eq_attenuates_both_channels_equally() {
    constexpr double sample_rate = 44100.0;
    constexpr int num_samples = 4096;

    freedeck::ThreeBandEq eq;
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(num_samples);
    spec.numChannels = 2;
    eq.prepare(spec);

    juce::AudioBuffer<float> dry(2, num_samples);
    fill_sine(dry, 440.0f, static_cast<float>(sample_rate));

    const float dry_left = peak_amplitude(dry, 0);
    const float dry_right = peak_amplitude(dry, 1);
    assert(std::abs(dry_left - dry_right) < 0.001f);

    juce::AudioBuffer<float> wet(2, num_samples);
    wet.makeCopyOf(dry);

    eq.set_gain_db(0, -24.0f);
    eq.set_gain_db(1, -24.0f);
    eq.set_gain_db(2, -24.0f);
    eq.process(wet);

    const float wet_left = peak_amplitude(wet, 0);
    const float wet_right = peak_amplitude(wet, 1);

    assert(wet_left < dry_left * 0.5f);
    assert(wet_right < dry_right * 0.5f);
    assert(std::abs(wet_left - wet_right) < 0.05f);

    std::cout << "test_stereo_eq_attenuates_both_channels_equally OK\n";
}

void test_eq_unity_preserves_signal() {
    constexpr double sample_rate = 44100.0;
    constexpr int num_samples = 512;

    freedeck::ThreeBandEq eq;
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(num_samples);
    spec.numChannels = 2;
    eq.prepare(spec);

    juce::AudioBuffer<float> buf(2, num_samples);
    fill_sine(buf, 440.0f, static_cast<float>(sample_rate));

    const float dry = peak_amplitude(buf, 0);
    eq.process(buf);
    const float wet = peak_amplitude(buf, 0);

    assert(wet > dry * 0.9f);
    std::cout << "test_eq_unity_preserves_signal OK (dry=" << dry << " wet=" << wet << ")\n";
}

} // namespace

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;
    test_stereo_eq_attenuates_both_channels_equally();
    test_eq_unity_preserves_signal();
    std::cout << "All EQ tests passed.\n";
    return 0;
}
