#include "TimeStretch.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace freedeck {

TimeStretch::TimeStretch(juce::AudioSource* input, bool deleteInput, int numChannels)
    : input_(input, deleteInput), num_channels_(numChannels) {}

TimeStretch::~TimeStretch() = default;

void TimeStretch::set_time_ratio(double dj_ratio) {
    // DJ tempo: 2.0 = double playback speed. Rubber Band time ratio is inverted
    // (duration stretch factor: 2.0 = half speed).
    dj_tempo_ratio_ = juce::jlimit(0.5, 2.0, dj_ratio);
    if (stretcher_ != nullptr)
        stretcher_->setTimeRatio(1.0 / dj_tempo_ratio_);
}

void TimeStretch::set_pitch_scale(double scale) {
    pitch_scale_ = juce::jlimit(0.5, 2.0, scale);
    if (stretcher_ != nullptr)
        stretcher_->setPitchScale(pitch_scale_);
}

double TimeStretch::get_time_ratio() const {
    return dj_tempo_ratio_;
}

double TimeStretch::input_samples_consumed_per_block(int output_samples) const {
    juce::ignoreUnused(output_samples);
    if (last_input_samples_ > 0)
        return static_cast<double>(last_input_samples_);
    return static_cast<double>(output_samples) * dj_tempo_ratio_;
}

void TimeStretch::prepareToPlay(int samplesPerBlockExpected, double sampleRate) {
    block_size_ = samplesPerBlockExpected;
    input_->prepareToPlay(samplesPerBlockExpected, sampleRate);

    stretcher_ = std::make_unique<RubberBand::RubberBandStretcher>(
        static_cast<size_t>(sampleRate),
        static_cast<size_t>(num_channels_),
        RubberBand::RubberBandStretcher::OptionProcessRealTime |
            RubberBand::RubberBandStretcher::OptionEngineFiner);

    stretcher_->setTimeRatio(1.0 / dj_tempo_ratio_);
    stretcher_->setPitchScale(pitch_scale_);

    const int max_in = samplesPerBlockExpected * 4 + 256;
    stretcher_->setMaxProcessSize(static_cast<size_t>(max_in));

    input_buffer_.setSize(num_channels_, max_in);
    retrieve_buffer_.setSize(num_channels_, samplesPerBlockExpected);
    last_input_samples_ = 0;
}

void TimeStretch::releaseResources() {
    input_->releaseResources();
    stretcher_.reset();
    input_buffer_.setSize(num_channels_, 0);
    retrieve_buffer_.setSize(num_channels_, 0);
    last_input_samples_ = 0;
}

void TimeStretch::getNextAudioBlock(const juce::AudioSourceChannelInfo& info) {
    if (stretcher_ == nullptr) {
        info.clearActiveBufferRegion();
        return;
    }

    const int out_needed = info.numSamples;
    int out_written = 0;
    int total_input = 0;

    while (out_written < out_needed) {
        const size_t required = stretcher_->getSamplesRequired();
        const int in_to_read =
            static_cast<int>(std::max(required, static_cast<size_t>(1)));

        if (input_buffer_.getNumSamples() < in_to_read)
            input_buffer_.setSize(num_channels_, in_to_read, false, false, true);

        juce::AudioSourceChannelInfo readInfo(&input_buffer_, 0, in_to_read);
        input_->getNextAudioBlock(readInfo);
        total_input += in_to_read;

        std::vector<const float*> in_ptrs(static_cast<size_t>(num_channels_));
        for (int ch = 0; ch < num_channels_; ++ch)
            in_ptrs[static_cast<size_t>(ch)] = input_buffer_.getReadPointer(ch);

        stretcher_->process(in_ptrs.data(), static_cast<size_t>(in_to_read), false);

        const int avail = stretcher_->available();
        if (avail <= 0)
            break;

        const int to_retrieve = std::min(avail, out_needed - out_written);
        if (retrieve_buffer_.getNumSamples() < to_retrieve)
            retrieve_buffer_.setSize(num_channels_, to_retrieve, false, false, true);

        std::vector<float*> retrieve_ptrs(static_cast<size_t>(num_channels_));
        for (int ch = 0; ch < num_channels_; ++ch)
            retrieve_ptrs[static_cast<size_t>(ch)] = retrieve_buffer_.getWritePointer(ch);

        stretcher_->retrieve(retrieve_ptrs.data(), static_cast<size_t>(to_retrieve));

        for (int ch = 0; ch < info.buffer->getNumChannels(); ++ch) {
            info.buffer->copyFrom(
                ch,
                info.startSample + out_written,
                retrieve_buffer_,
                ch,
                0,
                to_retrieve);
        }
        out_written += to_retrieve;
    }

    last_input_samples_ = total_input;

    if (out_written < out_needed) {
        for (int ch = 0; ch < info.buffer->getNumChannels(); ++ch)
            info.buffer->clear(ch, info.startSample + out_written, out_needed - out_written);
    }
}

} // namespace freedeck
