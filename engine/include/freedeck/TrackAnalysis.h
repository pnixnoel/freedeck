#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace freedeck {

enum class AnalysisSource : uint8_t { Unknown = 0, Metadata = 1, Audio = 2 };

struct TrackAnalysis {
    float bpm = 0.f;
    bool bpm_valid = false;
    std::string key;
    bool key_valid = false;
    AnalysisSource bpm_source = AnalysisSource::Unknown;
    AnalysisSource key_source = AnalysisSource::Unknown;
    float beatgrid_offset_seconds = 0.f;
    bool beatgrid_offset_valid = false;
    std::vector<double> beats;
    bool beats_valid = false;
    std::vector<double> downbeats;
    bool downbeats_valid = false;
    float analysis_confidence = 0.f;
    float loudness_rms_db = 0.f;
    std::string analyzer_backend;
    std::string title;
    std::string artist;
    std::string album;
    std::string genre;
    double duration_seconds = 0.0;
};

bool beats_are_monotonic(const std::vector<double>& beats, double min_gap_seconds = 0.05);
std::vector<double> derive_downbeats(const std::vector<double>& beats, int beats_per_bar = 4);
float compute_preview_loudness_db(const std::vector<float>& mono);

std::vector<double> detect_beats_dp(
    const std::vector<float>& mono,
    double sample_rate,
    float bpm,
    double duration);

} // namespace freedeck
