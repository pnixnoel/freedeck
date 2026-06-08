#pragma once

#include <cstdint>
#include <string>

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
};

} // namespace freedeck
