#include "Waveform.h"
#include <cmath>

namespace freedeck {

std::vector<float> compute_waveform_peaks(
    juce::AudioFormatReader& reader,
    int target_points) {
    target_points = juce::jmax(64, target_points);

    const auto total_samples = reader.lengthInSamples;
    if (total_samples <= 0)
        return {};

    const int num_channels = static_cast<int>(reader.numChannels);
    const int64_t block_size =
        juce::jmax<int64_t>(1, total_samples / static_cast<int64_t>(target_points));

    std::vector<float> peaks(static_cast<size_t>(target_points), 0.0f);
    juce::AudioBuffer<float> temp_buffer(num_channels, static_cast<int>(block_size));

    int point_index = 0;
    int64_t position = 0;

    while (position < total_samples && point_index < target_points) {
        const int samples_to_read = static_cast<int>(
            juce::jmin<int64_t>(block_size, total_samples - position));

        if (!reader.read(&temp_buffer, 0, samples_to_read, position, true, true))
            break;

        float peak = 0.0f;
        for (int ch = 0; ch < num_channels; ++ch) {
            const float* data = temp_buffer.getReadPointer(ch);
            for (int i = 0; i < samples_to_read; ++i)
                peak = juce::jmax(peak, std::abs(data[i]));
        }

        peaks[static_cast<size_t>(point_index)] = peak;
        ++point_index;
        position += block_size;
    }

    peaks.resize(static_cast<size_t>(point_index));

    float max_peak = 0.0f;
    for (float p : peaks)
        max_peak = juce::jmax(max_peak, p);
    if (max_peak > 0.0f)
        for (float& p : peaks)
            p /= max_peak;

    return peaks;
}

} // namespace freedeck
