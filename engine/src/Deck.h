#pragma once

#include "Eq.h"
#include "TimeStretch.h"
#include "TrackAnalysis.h"
#include "Waveform.h"
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

namespace freedeck {

struct DeckPlayback {
    std::unique_ptr<juce::AudioFormatReader> reader;
    std::unique_ptr<juce::AudioFormatReaderSource> reader_source;
    std::unique_ptr<juce::AudioTransportSource> transport;
    std::unique_ptr<TimeStretch> time_stretch;
    ThreeBandEq eq;
    double cue_position{0.0};
};

class Deck {
public:
    explicit Deck(juce::AudioFormatManager& format_manager);

    bool load(const juce::File& file);
    void prepare_to_play(int samples_per_block, double sample_rate);
    void release_resources();
    void get_next_audio_block(const juce::AudioSourceChannelInfo& info);

    void set_playing(bool playing);
    void cue();
    void seek(double position_seconds);

    void set_volume(float gain);
    void set_eq(uint8_t band, float gain_db);
    void set_tempo_ratio(float ratio);
    void set_key_lock(bool enabled);

    bool is_playing() const;
    double position_seconds() const;
    double duration_seconds() const;
    std::vector<float> waveform_peaks() const;
    TrackAnalysis track_analysis() const;

private:
    void apply_stretch_settings(const std::shared_ptr<DeckPlayback>& pb) const;

    std::shared_ptr<DeckPlayback> playback() const;
    std::shared_ptr<DeckPlayback> rebuild_playback(
        std::unique_ptr<juce::AudioFormatReader> reader);

    juce::AudioFormatManager& format_manager_;
    mutable std::mutex load_mutex_;
    std::shared_ptr<DeckPlayback> playback_;
    std::atomic<float> volume_{1.0f};
    std::atomic<float> tempo_ratio_{1.0f};
    std::atomic<bool> key_lock_{true};
    double sample_rate_{44100.0};
    int block_size_{512};

    std::vector<float> peaks_;
    double duration_seconds_{0.0};
    TrackAnalysis analysis_;
};

} // namespace freedeck
