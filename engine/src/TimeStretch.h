#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <rubberband/RubberBandStretcher.h>

#include <memory>

namespace freedeck {

class TimeStretch : public juce::AudioSource {
public:
    TimeStretch(juce::AudioSource* input, bool deleteInput, int numChannels);
    ~TimeStretch() override;

    void set_time_ratio(double ratio);
    void set_pitch_scale(double scale);
    double get_time_ratio() const;
    double input_samples_consumed_per_block(int output_samples) const;

    void prepareToPlay(int samplesPerBlockExpected, double sampleRate) override;
    void releaseResources() override;
    void getNextAudioBlock(const juce::AudioSourceChannelInfo& bufferToFill) override;

    bool is_prepared() const;
    double start_delay_seconds() const;

private:
    juce::OptionalScopedPointer<juce::AudioSource> input_;
    int num_channels_;
    double dj_tempo_ratio_{1.0};
    double pitch_scale_{1.0};
    int block_size_{512};
    int last_input_samples_{0};
    int start_delay_remaining_{0};
    double sample_rate_{44100.0};

    std::unique_ptr<RubberBand::RubberBandStretcher> stretcher_;
    juce::AudioBuffer<float> input_buffer_;
    juce::AudioBuffer<float> retrieve_buffer_;
};

} // namespace freedeck
