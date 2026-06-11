#include "freedeck/engine.h"
#include "Deck.h"
#include "Mixer.h"
#include "SyncController.h"

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <atomic>
#include <array>

namespace freedeck {

struct Engine::Impl : juce::AudioIODeviceCallback {
    Impl() : juce_init_(std::make_unique<juce::ScopedJuceInitialiser_GUI>()) {
        format_manager_.registerBasicFormats();
        decks_[0] = std::make_unique<Deck>(format_manager_);
        decks_[1] = std::make_unique<Deck>(format_manager_);
    }

    ~Impl() override {
        stop_audio();
    }

    bool start_audio() {
        if (audio_started_)
            return true;

        const juce::String error = device_manager_.initialiseWithDefaultDevices(0, 2);
        if (error.isNotEmpty())
            return false;

        device_manager_.addAudioCallback(this);
        audio_started_ = true;
        return true;
    }

    void stop_audio() {
        if (!audio_started_)
            return;

        device_manager_.removeAudioCallback(this);
        device_manager_.closeAudioDevice();
        audio_started_ = false;
    }

    bool load_track(uint8_t deck, const std::string& path) {
        if (deck > 1)
            return false;
        return decks_[deck]->load(juce::File(path));
    }

    void set_play(uint8_t deck, bool playing) {
        if (deck <= 1)
            decks_[deck]->set_playing(playing);
    }

    void cue(uint8_t deck) {
        if (deck <= 1)
            decks_[deck]->cue();
    }

    void seek(uint8_t deck, double position_seconds) {
        if (deck <= 1)
            decks_[deck]->seek(position_seconds);
    }

    void set_volume(uint8_t deck, float gain) {
        if (deck <= 1)
            decks_[deck]->set_volume(gain);
    }

    void set_eq(uint8_t deck, uint8_t band, float gain_db) {
        if (deck <= 1)
            decks_[deck]->set_eq(band, gain_db);
    }

    void set_filter(uint8_t deck, float amount) {
        if (deck <= 1)
            decks_[deck]->set_filter(amount);
    }

    void set_trim(uint8_t deck, float gain_db) {
        if (deck <= 1)
            decks_[deck]->set_trim(gain_db);
    }

    void set_tempo(uint8_t deck, float ratio) {
        if (deck <= 1)
            decks_[deck]->set_tempo_ratio(ratio);
    }

    void set_key_lock(uint8_t deck, bool enabled) {
        if (deck <= 1)
            decks_[deck]->set_key_lock(enabled);
    }

    void set_crossfader(float position) {
        mixer_.set_crossfader(position);
    }

    void set_sync(uint8_t deck, bool enabled) {
        sync_controller_.set_sync(deck, enabled);
    }

    void set_master(uint8_t deck) {
        sync_controller_.set_master(deck);
    }

    void set_beatgrid(uint8_t deck, double bpm, double offset) {
        if (deck <= 1) {
            decks_[deck]->set_beatgrid(bpm, offset);
        }
    }

    void set_quantize(uint8_t deck, bool enabled) {
        if (deck <= 1) {
            decks_[deck]->set_quantize(enabled);
        }
    }

    bool quantize_enabled(uint8_t deck) const {
        if (deck > 1) return false;
        return decks_[deck]->quantize_enabled();
    }

    std::vector<double> track_beats(uint8_t deck) const {
        if (deck > 1) return {};
        auto beats_ptr = decks_[deck]->beats();
        if (beats_ptr) {
            return *beats_ptr;
        }
        return {};
    }

    bool is_playing(uint8_t deck) const {
        if (deck > 1)
            return false;
        return decks_[deck]->is_playing();
    }

    double position_seconds(uint8_t deck) const {
        if (deck > 1)
            return 0.0;
        return decks_[deck]->position_seconds();
    }

    double duration_seconds(uint8_t deck) const {
        if (deck > 1)
            return 0.0;
        return decks_[deck]->duration_seconds();
    }

    std::vector<float> waveform_peaks(uint8_t deck) const {
        if (deck > 1)
            return {};
        return decks_[deck]->waveform_peaks();
    }

    TrackAnalysis track_analysis(uint8_t deck) const {
        if (deck > 1)
            return {};
        return decks_[deck]->track_analysis();
    }

    OutputLevels output_levels() const {
        return {
            output_left_.load(std::memory_order_relaxed),
            output_right_.load(std::memory_order_relaxed),
        };
    }

    EngineSnapshot snapshot() const {
        EngineSnapshot snap;
        snap.output_left = output_left_.load(std::memory_order_relaxed);
        snap.output_right = output_right_.load(std::memory_order_relaxed);
        snap.crossfader = mixer_.crossfader();
        snap.crossfader_gain_a = mixer_.deck_gain(0);
        snap.crossfader_gain_b = mixer_.deck_gain(1);
        snap.deck_a = decks_[0]->snapshot();
        snap.deck_b = decks_[1]->snapshot();

        snap.master_deck = sync_controller_.master_deck();
        snap.buffer_size_ms = buffer_size_ms_.load(std::memory_order_relaxed);

        snap.deck_a.synced = sync_controller_.is_sync_enabled(0);
        snap.deck_a.is_master = (snap.master_deck == 0);
        snap.deck_a.sync_phase_error = sync_controller_.get_phase_error(0);

        snap.deck_b.synced = sync_controller_.is_sync_enabled(1);
        snap.deck_b.is_master = (snap.master_deck == 1);
        snap.deck_b.sync_phase_error = sync_controller_.get_phase_error(1);

        return snap;
    }

    void audioDeviceAboutToStart(juce::AudioIODevice* device) override {
        const int block_size = device->getCurrentBufferSizeSamples();
        const double sample_rate = device->getCurrentSampleRate();

        for (auto& deck : decks_)
            deck->prepare_to_play(block_size, sample_rate);

        mix_buffer_.setSize(2, block_size);

        if (sample_rate > 0.0) {
            buffer_size_ms_.store(static_cast<float>(block_size) * 1000.0f / static_cast<float>(sample_rate), std::memory_order_relaxed);
        } else {
            buffer_size_ms_.store(0.0f, std::memory_order_relaxed);
        }
    }

    void audioDeviceStopped() override {
        for (auto& deck : decks_)
            deck->release_resources();
    }

    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override {
        juce::ignoreUnused(inputChannelData, numInputChannels, context);

        if (outputChannelData == nullptr || numOutputChannels < 2)
            return;

        sync_controller_.update_sync_trim(*decks_[0], *decks_[1]);

        if (mix_buffer_.getNumSamples() < numSamples)
            mix_buffer_.setSize(2, numSamples, false, false, true);

        float* left = outputChannelData[0];
        float* right = outputChannelData[1];

        for (int i = 0; i < numSamples; ++i) {
            left[i] = 0.0f;
            right[i] = 0.0f;
        }

        float peak_left = 0.0f;
        float peak_right = 0.0f;

        for (uint8_t deck_index = 0; deck_index < 2; ++deck_index) {
            mix_buffer_.clear();
            juce::AudioSourceChannelInfo info(&mix_buffer_, 0, numSamples);
            decks_[deck_index]->get_next_audio_block(info);

            const float xf_gain = mixer_.deck_gain(deck_index);
            auto* mix_left = mix_buffer_.getWritePointer(0);
            auto* mix_right = mix_buffer_.getWritePointer(1);

            for (int i = 0; i < numSamples; ++i) {
                const float l = mix_left[i] * xf_gain;
                const float r = mix_right[i] * xf_gain;
                left[i] += l;
                right[i] += r;
                peak_left = juce::jmax(peak_left, std::abs(l));
                peak_right = juce::jmax(peak_right, std::abs(r));
            }
        }

        // Soft limiter
        for (int i = 0; i < numSamples; ++i) {
            left[i] = std::tanh(left[i]);
            right[i] = std::tanh(right[i]);
        }

        output_left_.store(peak_left, std::memory_order_relaxed);
        output_right_.store(peak_right, std::memory_order_relaxed);
    }

    juce::AudioDeviceManager device_manager_;
    juce::AudioFormatManager format_manager_;
    std::array<std::unique_ptr<Deck>, 2> decks_;
    Mixer mixer_;
    juce::AudioBuffer<float> mix_buffer_;
    std::atomic<float> output_left_{0.0f};
    std::atomic<float> output_right_{0.0f};
    bool audio_started_{false};
    std::unique_ptr<juce::ScopedJuceInitialiser_GUI> juce_init_;
    SyncController sync_controller_;
    std::atomic<float> buffer_size_ms_{0.0f};
};

Engine::Engine() : impl_(std::make_unique<Impl>()) {}
Engine::~Engine() = default;

bool Engine::start_audio() { return impl_->start_audio(); }
void Engine::stop_audio() { impl_->stop_audio(); }
bool Engine::load_track(uint8_t deck, const std::string& path) {
    return impl_->load_track(deck, path);
}
void Engine::set_play(uint8_t deck, bool playing) { impl_->set_play(deck, playing); }
void Engine::cue(uint8_t deck) { impl_->cue(deck); }
void Engine::seek(uint8_t deck, double position_seconds) {
    impl_->seek(deck, position_seconds);
}
void Engine::set_volume(uint8_t deck, float gain) { impl_->set_volume(deck, gain); }
void Engine::set_eq(uint8_t deck, uint8_t band, float gain_db) {
    impl_->set_eq(deck, band, gain_db);
}
void Engine::set_filter(uint8_t deck, float amount) {
    impl_->set_filter(deck, amount);
}
void Engine::set_trim(uint8_t deck, float gain_db) {
    impl_->set_trim(deck, gain_db);
}
void Engine::set_tempo(uint8_t deck, float ratio) { impl_->set_tempo(deck, ratio); }
void Engine::set_key_lock(uint8_t deck, bool enabled) { impl_->set_key_lock(deck, enabled); }
void Engine::set_crossfader(float position) { impl_->set_crossfader(position); }
void Engine::set_sync(uint8_t deck, bool enabled) { impl_->set_sync(deck, enabled); }
void Engine::set_master(uint8_t deck) { impl_->set_master(deck); }
void Engine::set_beatgrid(uint8_t deck, double bpm, double offset) {
    impl_->set_beatgrid(deck, bpm, offset);
}
void Engine::set_quantize(uint8_t deck, bool enabled) {
    impl_->set_quantize(deck, enabled);
}
bool Engine::is_playing(uint8_t deck) const { return impl_->is_playing(deck); }
bool Engine::quantize_enabled(uint8_t deck) const {
    return impl_->quantize_enabled(deck);
}
double Engine::position_seconds(uint8_t deck) const {
    return impl_->position_seconds(deck);
}
double Engine::duration_seconds(uint8_t deck) const {
    return impl_->duration_seconds(deck);
}
std::vector<float> Engine::waveform_peaks(uint8_t deck) const {
    return impl_->waveform_peaks(deck);
}
TrackAnalysis Engine::track_analysis(uint8_t deck) const {
    return impl_->track_analysis(deck);
}
std::vector<double> Engine::track_beats(uint8_t deck) const {
    return impl_->track_beats(deck);
}
OutputLevels Engine::output_levels() const { return impl_->output_levels(); }
EngineSnapshot Engine::snapshot() const { return impl_->snapshot(); }

LicenseInfo Engine::license_info() const {
    LicenseInfo info;
#ifdef FREEDECK_USE_AUBIO
    info.aubio_linked = true;
    info.aubio_license = "GPL-3.0";
#else
    info.aubio_linked = false;
    info.aubio_license = "";
#endif

#ifdef FREEDECK_USE_ESSENTIA
    info.essentia_linked = true;
    info.essentia_license = "AGPL-3.0";
#else
    info.essentia_linked = false;
    info.essentia_license = "";
#endif
    return info;
}

std::unique_ptr<Engine> new_engine() {
    return std::make_unique<Engine>();
}

} // namespace freedeck
