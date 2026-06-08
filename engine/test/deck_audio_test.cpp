#include "Deck.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cmath>
#include <iostream>

static float max_abs(const juce::AudioBuffer<float>& buf) {
    float peak = 0.0f;
    for (int ch = 0; ch < buf.getNumChannels(); ++ch) {
        const float* data = buf.getReadPointer(ch);
        for (int i = 0; i < buf.getNumSamples(); ++i)
            peak = std::max(peak, std::abs(data[i]));
    }
    return peak;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: freedeck_deck_audio_test <audio_file>\n";
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juce_init;
    juce::AudioFormatManager format_manager;
    format_manager.registerBasicFormats();

    freedeck::Deck deck(format_manager);
    deck.prepare_to_play(512, 44100.0);

    if (!deck.load(juce::File(argv[1]))) {
        std::cerr << "Failed to load: " << argv[1] << "\n";
        return 1;
    }

    deck.set_playing(true);

    juce::AudioBuffer<float> buf(2, 512);
    float peak = 0.0f;
    for (int i = 0; i < 200; ++i) {
        juce::AudioSourceChannelInfo info(&buf, 0, 512);
        deck.get_next_audio_block(info);
        peak = std::max(peak, max_abs(buf));
    }

    std::cout << "deck_peak=" << peak << " pos=" << deck.position_seconds() << "\n";
    return peak > 0.001f ? 0 : 1;
}
