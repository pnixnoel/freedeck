#include "Deck.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

namespace {

juce::File write_test_wav(double duration_seconds, double sample_rate = 44100.0) {
    const int num_samples = static_cast<int>(duration_seconds * sample_rate);
    juce::AudioBuffer<float> buffer(1, num_samples);
    buffer.clear();

    for (int i = 0; i < num_samples; ++i) {
        const double t = static_cast<double>(i) / sample_rate;
        buffer.setSample(0, i, static_cast<float>(0.25 * std::sin(2.0 * juce::MathConstants<double>::pi * 440.0 * t)));
    }

    juce::File temp_file = juce::File::getSpecialLocation(juce::File::tempDirectory)
                               .getChildFile("freedeck_loop_test.wav");
    temp_file.deleteFile();

    juce::WavAudioFormat wav_format;
    std::unique_ptr<juce::OutputStream> stream(temp_file.createOutputStream());
    if (!stream) {
        throw std::runtime_error("failed to create temp wav stream");
    }

    const juce::AudioFormatWriterOptions options =
        juce::AudioFormatWriterOptions{}.withSampleRate(sample_rate).withNumChannels(1).withBitsPerSample(16);
    std::unique_ptr<juce::AudioFormatWriter> writer(wav_format.createWriterFor(stream, options));
    if (!writer) {
        throw std::runtime_error("failed to create wav writer");
    }

    writer->writeFromAudioSampleBuffer(buffer, 0, num_samples);
    writer.reset();
    return temp_file;
}

} // namespace

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;
    juce::AudioFormatManager format_manager;
    format_manager.registerBasicFormats();

    const juce::File temp_file = write_test_wav(3.0);
    freedeck::Deck deck(format_manager);
    deck.prepare_to_play(512, 44100.0);

    if (!deck.load(temp_file)) {
        std::cerr << "Failed to load generated audio file\n";
        temp_file.deleteFile();
        return 1;
    }

    const double loop_start = 1.0;
    const double loop_end = 1.5;
    deck.set_loop_points(loop_start, loop_end);
    deck.set_loop_active(true);

    assert(deck.loop_active());
    assert(deck.loop_start_seconds() == loop_start);
    assert(deck.loop_end_seconds() == loop_end);

    deck.seek(1.48);
    deck.set_playing(true);

    juce::AudioBuffer<float> buffer(2, 512);
    juce::AudioSourceChannelInfo info(&buffer, 0, 512);

    for (int i = 0; i < 15; ++i) {
        deck.get_next_audio_block(info);
        const double after_pos = deck.position_seconds();
        assert(after_pos >= loop_start - 0.05);
        assert(after_pos <= loop_end + 0.05);
    }

    temp_file.deleteFile();
    std::cout << "Loop test PASSED!" << std::endl;
    return 0;
}
