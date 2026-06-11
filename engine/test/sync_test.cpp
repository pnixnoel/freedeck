#include "Deck.h"
#include "SyncController.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

class DummyFormatReader : public juce::AudioFormatReader {
public:
    DummyFormatReader() : juce::AudioFormatReader(nullptr, "DummyFormat") {
        sampleRate = 44100.0;
        bitsPerSample = 16;
        lengthInSamples = 44100 * 1200; // 20 minutes
        numChannels = 2;
    }

    bool readSamples(int* const* destChannels, int numDestChannels, int startOffsetInDest, juce::int64 startSampleInFile, int numSamples) override {
        for (int ch = 0; ch < numDestChannels; ++ch) {
            if (destChannels[ch] != nullptr) {
                std::memset(destChannels[ch] + startOffsetInDest, 0, static_cast<size_t>(numSamples) * sizeof(int));
            }
        }
        return true;
    }
};

class DummyFormat : public juce::AudioFormat {
public:
    DummyFormat() : juce::AudioFormat("DummyFormat", ".dummy") {}

    juce::StringArray getFileExtensions() const override {
        return { ".dummy" };
    }

    bool canHandleFile(const juce::File&) override {
        return true;
    }

    juce::Array<int> getPossibleSampleRates() override {
        return { 44100 };
    }

    juce::Array<int> getPossibleBitDepths() override {
        return { 16 };
    }

    bool canDoStereo() override {
        return true;
    }

    bool canDoMono() override {
        return true;
    }

    juce::AudioFormatReader* createReaderFor(juce::InputStream* sourceStream, bool deleteStreamIfOpeningFails) override {
        if (deleteStreamIfOpeningFails)
            delete sourceStream;
        return new DummyFormatReader();
    }

    std::unique_ptr<juce::AudioFormatWriter> createWriterFor(std::unique_ptr<juce::OutputStream>&, const juce::AudioFormatWriterOptions&) override {
        return nullptr;
    }
};

void run_sync_simulation(double master_bpm, double follower_bpm, double simulation_seconds, bool assert_convergence) {
    juce::AudioFormatManager format_manager;
    format_manager.registerFormat(new DummyFormat(), true);

    freedeck::Deck deck_a(format_manager);
    freedeck::Deck deck_b(format_manager);

    deck_a.prepare_to_play(512, 44100.0);
    deck_b.prepare_to_play(512, 44100.0);

    assert(deck_a.load(juce::File("dummy.dummy")));
    assert(deck_b.load(juce::File("dummy.dummy")));

    // Set grid properties
    deck_a.set_native_bpm(master_bpm);
    deck_a.set_grid_offset(0.0);
    deck_b.set_native_bpm(follower_bpm);
    deck_b.set_grid_offset(0.0);

    freedeck::SyncController sync;
    sync.set_master(0); // Deck A is master
    sync.set_sync(1, true); // Deck B is synced (follower)

    deck_a.set_playing(true);
    deck_b.set_playing(true);

    juce::AudioBuffer<float> buf_a(2, 512);
    juce::AudioBuffer<float> buf_b(2, 512);

    const int total_blocks = static_cast<int>(simulation_seconds * 44100.0 / 512.0);
    
    bool converged = false;
    double max_trim = 1.0;
    double min_trim = 1.0;

    for (int i = 0; i < total_blocks; ++i) {
        sync.update_sync_trim(deck_a, deck_b);

        double trim = deck_b.sync_rate_trim();
        max_trim = std::max(max_trim, trim);
        min_trim = std::min(min_trim, trim);

        // Assert sync rate trim stays within [0.95, 1.05]
        assert(trim >= 0.95 && trim <= 1.05);

        juce::AudioSourceChannelInfo info_a(&buf_a, 0, 512);
        juce::AudioSourceChannelInfo info_b(&buf_b, 0, 512);

        deck_a.get_next_audio_block(info_a);
        deck_b.get_next_audio_block(info_b);

        float phase_err = sync.get_phase_error(1);
        if (std::abs(phase_err) < 0.01) {
            converged = true;
        }

        // After 5 seconds, assert we are converged if requested
        if (assert_convergence && i > (5.0 * 44100.0 / 512.0)) {
            if (std::abs(phase_err) >= 0.01) {
                std::cerr << "Sync failed to converge! Phase error: " << phase_err << " beats at block " << i << "\n";
                assert(false);
            }
        }
    }

    if (assert_convergence) {
        assert(converged);
    }

    std::cout << "Simulation (" << master_bpm << " -> " << follower_bpm << " BPM, " << simulation_seconds << "s): "
              << "converged=" << (converged ? "yes" : "no")
              << " trim_range=[" << min_trim << ", " << max_trim << "]\n";
}

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;

    std::cout << "Running sync convergence tests...\n";
    // Test convergence when follower is slightly faster (120 BPM master, 122 BPM follower)
    run_sync_simulation(120.0, 122.0, 10.0, true);

    // Test convergence when follower is slightly slower (120 BPM master, 118 BPM follower)
    run_sync_simulation(120.0, 118.0, 10.0, true);

    // Test long-term stability (10 minutes)
    std::cout << "Running 10-minute long-term stability test...\n";
    run_sync_simulation(120.0, 124.0, 600.0, true);

    std::cout << "All sync tests passed successfully.\n";
    return 0;
}
