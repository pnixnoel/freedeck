#include "Deck.h"
#include "TrackAnalysis.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

std::vector<float> make_click_mono(
    double bpm, double duration_seconds, double sample_rate = 11025.0) {
    const int num_samples = static_cast<int>(duration_seconds * sample_rate);
    std::vector<float> mono(static_cast<size_t>(num_samples), 0.f);
    const double interval = sample_rate * 60.0 / bpm;
    for (int i = 0; i < num_samples; ++i) {
        const double beat_pos = std::fmod(static_cast<double>(i), interval);
        if (beat_pos < sample_rate * 0.002)
            mono[static_cast<size_t>(i)] = 1.f;
    }
    return mono;
}

class DummyFormatReader : public juce::AudioFormatReader {
public:
    DummyFormatReader() : juce::AudioFormatReader(nullptr, "DummyFormat") {
        sampleRate = 44100.0;
        bitsPerSample = 16;
        lengthInSamples = 44100 * 60; // 1 minute
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

void test_ellis_dp_beat_tracking() {
    std::cout << "Testing Ellis DP beat tracking...\n";
    // 120 BPM = 0.5s interval. Run for 10 seconds.
    const auto mono = make_click_mono(120.0, 10.0, 11025.0);
    const auto beats = freedeck::detect_beats_dp(mono, 11025.0, 120.f, 10.0);

    assert(!beats.empty());
    // Verify detected beat intervals are approximately 0.5 seconds
    for (size_t i = 1; i < beats.size(); ++i) {
        double interval = beats[i] - beats[i - 1];
        assert(std::abs(interval - 0.5) < 0.05);
    }
    std::cout << "test_ellis_dp_beat_tracking OK (" << beats.size() << " beats)\n";
}

void test_variable_tempo_extrapolation() {
    std::cout << "Testing variable tempo extrapolation...\n";
    // Audio signal is 10 seconds. Track duration is 30 seconds.
    const auto mono = make_click_mono(120.0, 10.0, 11025.0);
    const auto beats = freedeck::detect_beats_dp(mono, 11025.0, 120.f, 30.0);

    assert(!beats.empty());
    // The beats should extend near the end of 30 seconds
    assert(beats.back() >= 29.0 && beats.back() <= 30.0);

    // Verify all beat intervals are approximately 0.5 seconds
    for (size_t i = 1; i < beats.size(); ++i) {
        double interval = beats[i] - beats[i - 1];
        assert(std::abs(interval - 0.5) < 0.05);
    }
    std::cout << "test_variable_tempo_extrapolation OK (total beats=" << beats.size() << ", duration=" << beats.back() << "s)\n";
}

void test_sidecar_persistence() {
    std::cout << "Testing sidecar persistence round-trip...\n";
    
    juce::AudioFormatManager format_manager;
    format_manager.registerFormat(new DummyFormat(), true);

    freedeck::Deck deck(format_manager);
    deck.prepare_to_play(512, 44100.0);

    juce::File temp_file = juce::File::getCurrentWorkingDirectory().getChildFile("temp_test_track.dummy");
    temp_file.replaceWithText(""); // create empty file

    assert(deck.load(temp_file));

    // Modify beatgrid and save sidecar
    deck.set_beatgrid(124.0, 0.25);

    // Verify sidecar file exists next to it
    juce::File sidecar_file = temp_file.getParentDirectory().getChildFile(temp_file.getFileName() + ".json");
    assert(sidecar_file.existsAsFile());

    // Load into a new deck to verify round-trip
    freedeck::Deck deck_loaded(format_manager);
    deck_loaded.prepare_to_play(512, 44100.0);
    assert(deck_loaded.load(temp_file));

    assert(std::abs(deck_loaded.native_bpm() - 124.0) < 0.01);
    assert(std::abs(deck_loaded.grid_offset() - 0.25) < 0.01);
    assert(deck_loaded.beats() != nullptr);
    assert(!deck_loaded.beats()->empty());

    // Clean up
    temp_file.deleteFile();
    sidecar_file.deleteFile();

    std::cout << "test_sidecar_persistence OK\n";
}

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;

    test_ellis_dp_beat_tracking();
    test_variable_tempo_extrapolation();
    test_sidecar_persistence();

    std::cout << "All beatgrid tests passed successfully.\n";
    return 0;
}
