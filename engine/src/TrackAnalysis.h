#pragma once

#include "freedeck/TrackAnalysis.h"
#include <juce_audio_formats/juce_audio_formats.h>
#include <optional>
#include <string>
#include <vector>

namespace freedeck {

std::optional<float> parse_bpm_from_metadata(const juce::StringPairArray& tags);
std::optional<std::string> parse_key_from_metadata(const juce::StringPairArray& tags);
juce::StringPairArray parse_container_tags(const juce::File& file);
std::string normalize_key_notation(const std::string& raw);

std::vector<float> read_mono_preview(
    juce::AudioFormatReader& reader,
    double max_seconds = 90.0,
    double target_sample_rate = 11025.0);

std::optional<float> detect_bpm(const std::vector<float>& mono, double sample_rate);
std::optional<float> detect_beatgrid_offset(
    const std::vector<float>& mono,
    double sample_rate,
    float bpm);
std::optional<std::string> detect_key(const std::vector<float>& mono, double sample_rate);

float resolve_bpm_with_prior(float bpm);

TrackAnalysis analyze_track(
    juce::AudioFormatReader& reader,
    const std::vector<float>& mono_preview,
    double preview_sample_rate,
    const juce::StringPairArray* extra_metadata = nullptr);

#ifdef FREEDECK_USE_AUBIO
std::optional<TrackAnalysis> detect_bpm_and_beats_aubio(
    const std::vector<float>& mono,
    double sample_rate);
#endif

#ifdef FREEDECK_USE_ESSENTIA
std::optional<TrackAnalysis> detect_bpm_and_beats_essentia(
    const std::vector<float>& mono,
    double sample_rate);
std::optional<std::string> detect_key_essentia(
    const std::vector<float>& mono,
    double sample_rate);
#endif

juce::var analysis_to_sidecar_json(const TrackAnalysis& analysis, const juce::String& file_path);
bool analysis_from_sidecar_json(const juce::var& parsed, TrackAnalysis& out);

} // namespace freedeck
