#include "Filter.h"

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

void process_in_blocks(freedeck::DjFilter& filter, juce::AudioBuffer<float>& buffer, float amount) {
    constexpr int block_size = 512;
    const int total = buffer.getNumSamples();
    juce::AudioBuffer<float> chunk(2, block_size);

    for (int offset = 0; offset < total; offset += block_size) {
        const int n = std::min(block_size, total - offset);
        chunk.setSize(2, n, false, false, true);
        for (int ch = 0; ch < 2; ++ch)
            chunk.copyFrom(ch, 0, buffer, ch, offset, n);
        filter.process(chunk, amount);
        for (int ch = 0; ch < 2; ++ch)
            buffer.copyFrom(ch, offset, chunk, ch, 0, n);
    }
}

float peak_tail(const juce::AudioBuffer<float>& buffer, int channel, int tail_samples) {
    float peak = 0.0f;
    const int start = std::max(0, buffer.getNumSamples() - tail_samples);
    const auto* data = buffer.getReadPointer(channel);
    for (int i = start; i < buffer.getNumSamples(); ++i)
        peak = std::max(peak, std::abs(data[i]));
    return peak;
}

void test_lowpass_attenuates_high_frequency() {
    constexpr double sample_rate = 44100.0;
    constexpr int block_size = 512;
    constexpr int num_samples = block_size * 8;

    freedeck::DjFilter filter;
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(block_size);
    spec.numChannels = 2;
    filter.prepare(spec);

    juce::AudioBuffer<float> dry(2, num_samples);
    fill_sine(dry, 10000.0f, static_cast<float>(sample_rate));

    juce::AudioBuffer<float> wet(2, num_samples);
    wet.makeCopyOf(dry);
    process_in_blocks(filter, wet, -1.0f);

    const float dry_peak = peak_amplitude(dry, 0);
    const float wet_peak = peak_tail(wet, 0, block_size);

    assert(wet_peak < dry_peak * 0.25f);
    assert(std::abs(peak_tail(wet, 0, block_size) - peak_tail(wet, 1, block_size)) < 0.05f);

    std::cout << "test_lowpass_attenuates_high_frequency OK\n";
}

void test_highpass_attenuates_low_frequency() {
    constexpr double sample_rate = 44100.0;
    constexpr int num_samples = 512 * 8;
    constexpr int block_size = 512;

    freedeck::DjFilter filter;
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(block_size);
    spec.numChannels = 2;
    filter.prepare(spec);

    juce::AudioBuffer<float> dry(2, num_samples);
    fill_sine(dry, 100.0f, static_cast<float>(sample_rate));

    juce::AudioBuffer<float> wet(2, num_samples);
    wet.makeCopyOf(dry);
    process_in_blocks(filter, wet, 1.0f);

    const float dry_peak = peak_amplitude(dry, 0);
    const float wet_peak = peak_tail(wet, 0, block_size);

    assert(wet_peak < dry_peak * 0.25f);
    assert(std::abs(peak_tail(wet, 0, block_size) - peak_tail(wet, 1, block_size)) < 0.05f);

    std::cout << "test_highpass_attenuates_low_frequency OK\n";
}

void test_center_detent_passthrough() {
    constexpr double sample_rate = 44100.0;
    constexpr int num_samples = 512;

    freedeck::DjFilter filter;
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(num_samples);
    spec.numChannels = 2;
    filter.prepare(spec);

    juce::AudioBuffer<float> dry(2, num_samples);
    fill_sine(dry, 1000.0f, static_cast<float>(sample_rate));

    juce::AudioBuffer<float> wet(2, num_samples);
    wet.makeCopyOf(dry);
    filter.process(wet, 0.0f);

    const float dry_peak = peak_amplitude(dry, 0);
    const float wet_peak = peak_amplitude(wet, 0);

    assert(std::abs(wet_peak - dry_peak) < 0.01f);
    assert(std::abs(peak_amplitude(wet, 0) - peak_amplitude(wet, 1)) < 0.001f);

    std::cout << "test_center_detent_passthrough OK\n";
}

} // namespace

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;
    test_lowpass_attenuates_high_frequency();
    test_highpass_attenuates_low_frequency();
    test_center_detent_passthrough();
    std::cout << "All filter tests passed.\n";
    return 0;
}
