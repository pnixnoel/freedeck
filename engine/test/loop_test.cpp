#include "Deck.h"
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include <iostream>
#include <cassert>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: freedeck_loop_test <audio_file>\n";
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juce_init;
    juce::AudioFormatManager format_manager;
    format_manager.registerBasicFormats();

    freedeck::Deck deck(format_manager);
    deck.prepare_to_play(512, 44100.0);

    if (!deck.load(juce::File(argv[1]))) {
        std::cerr << "Failed to load audio file: " << argv[1] << "\n";
        return 1;
    }

    // Set loop points from 1.0s to 1.5s
    double loop_start = 1.0;
    double loop_end = 1.5;
    deck.set_loop_points(loop_start, loop_end);
    deck.set_loop_active(true);

    assert(deck.loop_active() == true);
    assert(deck.loop_start_seconds() == loop_start);
    assert(deck.loop_end_seconds() == loop_end);

    // Seek to 1.48s (close to end)
    deck.seek(1.48);
    deck.set_playing(true);

    juce::AudioBuffer<float> buffer(2, 512);
    juce::AudioSourceChannelInfo info(&buffer, 0, 512);

    // 512 samples at 44.1kHz is ~0.0116 seconds.
    // Let's run blocks and watch the playhead wrapping.
    for (int i = 0; i < 15; ++i) {
        deck.get_next_audio_block(info);
        double after_pos = deck.position_seconds();
        std::cout << "Block " << i << " pos: " << after_pos << "s" << std::endl;
        
        // Assert position is bound within loop range (with very minor leeway for thread queries)
        assert(after_pos >= loop_start - 0.05);
        assert(after_pos <= loop_end + 0.05);
    }

    std::cout << "Loop test PASSED!" << std::endl;
    return 0;
}
