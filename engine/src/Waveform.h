#pragma once

#include <juce_audio_formats/juce_audio_formats.h>
#include <vector>

namespace freedeck {

std::vector<float> compute_waveform_peaks(
    juce::AudioFormatReader& reader,
    int target_points = 512);

} // namespace freedeck
