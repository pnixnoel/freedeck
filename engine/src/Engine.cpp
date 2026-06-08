#include "freedeck/engine.h"
#include "Deck.h"
#include "Mixer.h"

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

    void audioDeviceAboutToStart(juce::AudioIODevice* device) override {
        const int block_size = device->getCurrentBufferSizeSamples();
        const double sample_rate = device->getCurrentSampleRate();

        for (auto& deck : decks_)
            deck->prepare_to_play(block_size, sample_rate);

        mix_buffer_.setSize(2, block_size);
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
void Engine::set_tempo(uint8_t deck, float ratio) { impl_->set_tempo(deck, ratio); }
void Engine::set_key_lock(uint8_t deck, bool enabled) { impl_->set_key_lock(deck, enabled); }
void Engine::set_crossfader(float position) { impl_->set_crossfader(position); }
bool Engine::is_playing(uint8_t deck) const { return impl_->is_playing(deck); }
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
OutputLevels Engine::output_levels() const { return impl_->output_levels(); }

std::unique_ptr<Engine> new_engine() {
    return std::make_unique<Engine>();
}

} // namespace freedeck
