#include "TrackAnalysis.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_dsp/juce_dsp.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cctype>
#include <cstring>

namespace freedeck {

namespace {

static const char* kPitchNames[] = {
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};

static const float kMajorProfile[12] = {
    6.35f, 2.23f, 3.48f, 2.33f, 4.38f, 4.09f,
    2.52f, 5.19f, 2.39f, 3.66f, 2.29f, 2.88f};
static const float kMinorProfile[12] = {
    6.33f, 2.68f, 3.52f, 5.38f, 2.60f, 3.53f,
    2.54f, 4.75f, 3.98f, 2.69f, 3.34f, 3.17f};

// Camelot wheel: nA = minor, nB = major (standard DJ notation)
static bool camelot_to_key(int num, char letter, std::string& out) {
    if (num < 1 || num > 12) return false;
    static const int kMinorPitch[] = {8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1}; // Ab..C#m
    static const int kMajorPitch[] = {11, 4, 1, 8, 3, 10, 5, 0, 7, 2, 9, 6};  // B..Gb
    const int idx = kMinorPitch[num - 1];
    if (letter == 'A') {
        out = kPitchNames[idx];
        out += "m";
        return true;
    }
    if (letter == 'B') {
        out = kPitchNames[kMajorPitch[num - 1]];
        return true;
    }
    return false;
}

static std::string trim_copy(const std::string& s) {
    size_t start = 0;
    while (start < s.size() && std::isspace(static_cast<unsigned char>(s[start])))
        ++start;
    size_t end = s.size();
    while (end > start && std::isspace(static_cast<unsigned char>(s[end - 1])))
        --end;
    return s.substr(start, end - start);
}

static std::string to_upper_copy(std::string s) {
    for (char& c : s)
        c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    return s;
}

static int pitch_index_from_name(const std::string& name) {
    static const char* names[] = {
        "C", "C#", "DB", "D", "D#", "EB", "E", "F",
        "F#", "GB", "G", "G#", "AB", "A", "A#", "BB", "B"};
    static const int indices[] = {
        0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11};
    const auto upper = to_upper_copy(name);
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); ++i) {
        if (upper == names[i])
            return indices[i];
    }
    return -1;
}

uint32_t read_synchsafe_int(const uint8_t* bytes) {
    return (static_cast<uint32_t>(bytes[0] & 0x7f) << 21) |
           (static_cast<uint32_t>(bytes[1] & 0x7f) << 14) |
           (static_cast<uint32_t>(bytes[2] & 0x7f) << 7) |
           static_cast<uint32_t>(bytes[3] & 0x7f);
}

juce::String id3_text_frame_value(const uint8_t* data, uint32_t size) {
    if (size == 0)
        return {};
    const uint8_t encoding = data[0];
    const uint8_t* text = data + 1;
    const uint32_t text_len = size - 1;
    if (encoding == 0 || encoding == 3)
        return juce::String(reinterpret_cast<const char*>(text),
                            static_cast<int>(text_len)).trim();
    if (encoding == 1 && text_len >= 2) {
        juce::String utf16;
        for (uint32_t i = 0; i + 1 < text_len; i += 2) {
            const juce::juce_wchar wc =
                static_cast<juce::juce_wchar>(text[i]) |
                (static_cast<juce::juce_wchar>(text[i + 1]) << 8);
            if (wc == 0)
                break;
            utf16 += juce::String::charToString(wc);
        }
        return utf16.trim();
    }
    return juce::String(reinterpret_cast<const char*>(text),
                      static_cast<int>(text_len)).trim();
}

float correlate_profile(const std::array<float, 12>& chroma, const float* profile, int shift) {
    float sum = 0.f;
    for (int i = 0; i < 12; ++i) {
        const int idx = (i + shift) % 12;
        sum += chroma[static_cast<size_t>(i)] * profile[idx];
    }
    return sum;
}

} // namespace

std::string normalize_key_notation(const std::string& raw) {
    auto s = trim_copy(raw);
    if (s.empty()) return {};

    // Camelot: "8A", "12B"
    if (s.size() >= 2) {
        const char last = static_cast<char>(std::toupper(static_cast<unsigned char>(s.back())));
        if ((last == 'A' || last == 'B') && std::isdigit(static_cast<unsigned char>(s[0]))) {
            int num = 0;
            for (size_t i = 0; i + 1 < s.size(); ++i) {
                if (!std::isdigit(static_cast<unsigned char>(s[i])))
                    goto not_camelot;
                num = num * 10 + (s[i] - '0');
            }
            std::string out;
            if (camelot_to_key(num, last, out))
                return out;
        }
    }
not_camelot:

    // "A minor", "F# min", "Am", "F#m"
    std::string upper = to_upper_copy(s);
    bool minor = false;
    if (upper.find("MINOR") != std::string::npos || upper.find(" MIN") != std::string::npos)
        minor = true;

    // Strip mode suffixes
    for (const char* suffix : {" MAJOR", " MAJ", " MINOR", " MIN"}) {
        const auto pos = upper.find(suffix);
        if (pos != std::string::npos)
            upper = upper.substr(0, pos);
    }
    upper = trim_copy(upper);
    if (!upper.empty() && (upper.back() == 'M' || upper.back() == 'm')) {
        minor = true;
        upper.pop_back();
        upper = trim_copy(upper);
    }

    const int idx = pitch_index_from_name(upper);
    if (idx < 0) return {};

    std::string out = kPitchNames[idx];
    if (minor) out += "m";
    return out;
}

std::optional<float> parse_bpm_from_metadata(const juce::StringPairArray& tags) {
    static const char* keys[] = {
        "TBPM", "BPM", "bpm", "TEMPO", juce::WavAudioFormat::acidTempo};
    for (auto* key : keys) {
        if (!tags.containsKey(key)) continue;
        const float v = tags[key].getFloatValue();
        if (v >= 40.f && v <= 250.f) return v;
    }
    return std::nullopt;
}

juce::StringPairArray parse_container_tags(const juce::File& file) {
    juce::StringPairArray tags;
    juce::FileInputStream stream(file);
    if (!stream.openedOk())
        return tags;

    uint8_t header[10]{};
    if (stream.read(header, 10) != 10)
        return tags;
    if (std::memcmp(header, "ID3", 3) != 0)
        return tags;

    const bool v24 = header[3] >= 4;
    const uint32_t tag_size = read_synchsafe_int(header + 6);
    if (tag_size == 0 || tag_size > 16u * 1024u * 1024u)
        return tags;

    juce::MemoryBlock tag_data(tag_size);
    if (stream.read(tag_data.getData(), static_cast<int>(tag_size)) !=
        static_cast<int>(tag_size))
        return tags;

    const uint8_t* cursor = static_cast<const uint8_t*>(tag_data.getData());
    const uint8_t* end = cursor + tag_size;

    while (cursor + 10 <= end) {
        char frame_id[5]{};
        std::memcpy(frame_id, cursor, 4);
        if (frame_id[0] == 0)
            break;

        uint32_t frame_size = 0;
        if (v24)
            frame_size = read_synchsafe_int(cursor + 4);
        else
            frame_size = (static_cast<uint32_t>(cursor[4]) << 24) |
                         (static_cast<uint32_t>(cursor[5]) << 16) |
                         (static_cast<uint32_t>(cursor[6]) << 8) |
                         static_cast<uint32_t>(cursor[7]);

        cursor += 10;
        if (frame_size == 0 || cursor + frame_size > end)
            break;

        if (std::strcmp(frame_id, "TBPM") == 0 || std::strcmp(frame_id, "TKEY") == 0 ||
            std::strcmp(frame_id, "KEY") == 0 || std::strcmp(frame_id, "TXXX") == 0) {
            const auto value = id3_text_frame_value(cursor, frame_size);
            if (value.isNotEmpty()) {
                if (std::strcmp(frame_id, "TXXX") == 0) {
                    const auto desc_end = value.indexOfChar(0);
                    if (desc_end > 0) {
                        const auto desc = value.substring(0, desc_end).toUpperCase();
                        const auto val = value.substring(desc_end + 1).trim();
                        if (desc.contains("BPM") && val.isNotEmpty())
                            tags.set("TBPM", val);
                        else if (desc.contains("KEY") && val.isNotEmpty())
                            tags.set("TKEY", val);
                    }
                } else {
                    tags.set(frame_id, value);
                }
            }
        }

        cursor += frame_size;
    }

    return tags;
}

std::optional<std::string> parse_key_from_metadata(const juce::StringPairArray& tags) {
    static const char* keys[] = {"TKEY", "KEY", "key", "INITIALKEY", "initialkey"};
    for (auto* key : keys) {
        if (!tags.containsKey(key)) continue;
        auto normalized = normalize_key_notation(tags[key].toStdString());
        if (!normalized.empty()) return normalized;
    }
    return std::nullopt;
}

std::vector<float> read_mono_preview(
    juce::AudioFormatReader& reader,
    double max_seconds,
    double target_sample_rate) {
    const int num_channels = juce::jmax(1, static_cast<int>(reader.numChannels));
    const double track_seconds =
        reader.sampleRate > 0.0
            ? static_cast<double>(reader.lengthInSamples) / reader.sampleRate
            : 0.0;
    const double seconds = juce::jmin(max_seconds, track_seconds);
    const int64_t max_samples =
        static_cast<int64_t>(seconds * reader.sampleRate);
    const int block = 4096;
    juce::AudioBuffer<float> buf(num_channels, block);
    std::vector<float> mono;
    if (max_samples <= 0 || reader.sampleRate <= 0.0)
        return mono;

    mono.reserve(static_cast<size_t>(seconds * target_sample_rate));

    const double ratio = target_sample_rate / reader.sampleRate;
    double phase = 0.0;

    for (int64_t offset = 0; offset < max_samples; offset += block) {
        const int to_read = static_cast<int>(
            juce::jmin<int64_t>(block, max_samples - offset));
        if (!reader.read(&buf, 0, to_read, offset, true, true))
            break;

        for (int i = 0; i < to_read; ++i) {
            float s = 0.f;
            for (int ch = 0; ch < num_channels; ++ch)
                s += buf.getSample(ch, i);
            s /= static_cast<float>(num_channels);

            phase += ratio;
            while (phase >= 1.0) {
                mono.push_back(s);
                phase -= 1.0;
            }
        }
    }
    return mono;
}

std::optional<float> detect_bpm(const std::vector<float>& mono, double sample_rate) {
    if (mono.size() < 4096 || sample_rate <= 0.0)
        return std::nullopt;

    constexpr int kHop = 512;
    std::vector<float> energy;
    energy.reserve(mono.size() / static_cast<size_t>(kHop) + 1);

    for (size_t start = 0; start < mono.size(); start += static_cast<size_t>(kHop)) {
        const size_t end = juce::jmin(start + static_cast<size_t>(kHop), mono.size());
        float frame_energy = 0.f;
        for (size_t i = start; i < end; ++i)
            frame_energy += mono[i] * mono[i];
        energy.push_back(frame_energy);
    }

    if (energy.size() < 16)
        return std::nullopt;

    std::vector<float> onset(energy.size(), 0.f);
    onset[0] = energy[0];
    for (size_t i = 1; i < energy.size(); ++i)
        onset[i] = juce::jmax(0.f, energy[i] - energy[i - 1]);

    const size_t n = onset.size();
    std::vector<float> ac(n, 0.f);
    for (size_t lag = 0; lag < n; ++lag) {
        double sum = 0.0;
        for (size_t i = 0; i + lag < n; ++i)
            sum += static_cast<double>(onset[i]) * static_cast<double>(onset[i + lag]);
        ac[lag] = static_cast<float>(sum);
    }
    if (ac[0] > 0.f) {
        for (float& v : ac)
            v /= ac[0];
    }

    constexpr float kMinBpm = 50.f;
    constexpr float kMaxBpm = 250.f;
    const float hop_hz = static_cast<float>(sample_rate) / static_cast<float>(kHop);
    const int min_lag = static_cast<int>(hop_hz * 60.f / kMaxBpm);
    const int max_lag = static_cast<int>(hop_hz * 60.f / kMinBpm);

    int best_lag = min_lag;
    float best_score = -1.f;
    for (int lag = min_lag; lag <= max_lag && lag < static_cast<int>(n); ++lag) {
        if (ac[static_cast<size_t>(lag)] > best_score) {
            best_score = ac[static_cast<size_t>(lag)];
            best_lag = lag;
        }
    }

    if (best_lag <= 0 || best_score <= 0.f)
        return std::nullopt;

    const int double_lag = juce::jmax(1, best_lag / 2);
    if (double_lag >= min_lag &&
        ac[static_cast<size_t>(double_lag)] > best_score * 1.05f)
        best_lag = double_lag;

    float bpm = 60.f * hop_hz / static_cast<float>(best_lag);
    bpm = resolve_bpm_with_prior(bpm);
    if (bpm < kMinBpm || bpm > kMaxBpm)
        return std::nullopt;
    return bpm;
}

std::optional<float> detect_beatgrid_offset(
    const std::vector<float>& mono,
    double sample_rate,
    float bpm) {
    if (mono.size() < 4096 || sample_rate <= 0.0 || bpm <= 0.f)
        return std::nullopt;

    constexpr int kHop = 512;
    std::vector<float> energy;
    energy.reserve(mono.size() / static_cast<size_t>(kHop) + 1);

    for (size_t start = 0; start < mono.size(); start += static_cast<size_t>(kHop)) {
        const size_t end = juce::jmin(start + static_cast<size_t>(kHop), mono.size());
        float frame_energy = 0.f;
        for (size_t i = start; i < end; ++i)
            frame_energy += mono[i] * mono[i];
        energy.push_back(frame_energy);
    }

    if (energy.size() < 16)
        return std::nullopt;

    std::vector<float> onset(energy.size(), 0.f);
    onset[0] = energy[0];
    for (size_t i = 1; i < energy.size(); ++i)
        onset[i] = juce::jmax(0.f, energy[i] - energy[i - 1]);

    const float hop_hz = static_cast<float>(sample_rate) / static_cast<float>(kHop);
    const size_t max_frames = juce::jmin(
        onset.size(),
        static_cast<size_t>(juce::jmax(16.f, hop_hz * 30.f)));

    float mean = 0.f;
    for (size_t i = 0; i < max_frames; ++i)
        mean += onset[i];
    mean /= static_cast<float>(max_frames);

    float variance = 0.f;
    for (size_t i = 0; i < max_frames; ++i) {
        const float d = onset[i] - mean;
        variance += d * d;
    }
    const float stddev = std::sqrt(variance / static_cast<float>(max_frames));
    const float threshold = mean + 2.f * stddev;

    size_t peak_frame = 0;
    bool found = false;
    if (onset[0] > threshold) {
        peak_frame = 0;
        found = true;
    }
    if (!found) {
        for (size_t i = 1; i + 1 < max_frames; ++i) {
            if (onset[i] > threshold && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) {
                peak_frame = i;
                found = true;
                break;
            }
        }
    }
    if (!found) {
        for (size_t i = 1; i < max_frames; ++i) {
            if (onset[i] > threshold) {
                peak_frame = i;
                found = true;
                break;
            }
        }
    }
    if (!found)
        return 0.f;

    float offset_seconds =
        static_cast<float>(peak_frame) * static_cast<float>(kHop) /
        static_cast<float>(sample_rate);

    const float beat_seconds = 60.f / bpm;
    const float remainder = std::fmod(offset_seconds, beat_seconds);
    if (remainder > beat_seconds * 0.5f)
        offset_seconds = offset_seconds - remainder + beat_seconds;
    else
        offset_seconds -= remainder;

    return juce::jmax(0.f, offset_seconds);
}

float resolve_bpm_with_prior(float bpm) {
    if (bpm <= 0.f)
        return bpm;

    bpm = std::round(bpm * 10.f) / 10.f;

    // Preserve true half-time readings (e.g. 60 BPM hip-hop / downtempo).
    if (bpm >= 57.f && bpm <= 60.5f)
        return bpm;

    auto prior_score = [](float candidate) {
        const float diff = candidate - 120.f;
        return std::exp(-(diff * diff) / (2.f * 25.f * 25.f));
    };

    if (bpm < 80.f) {
        const float doubled = bpm * 2.f;
        if (doubled >= 80.f && doubled <= 200.f &&
            prior_score(doubled) > prior_score(bpm))
            return std::round(doubled * 10.f) / 10.f;
    }

    if (bpm > 150.f) {
        const float halved = bpm * 0.5f;
        if (halved >= 60.f && prior_score(halved) > prior_score(bpm))
            return std::round(halved * 10.f) / 10.f;
    }

    return bpm;
}

std::optional<std::string> detect_key(const std::vector<float>& mono, double sample_rate) {
    if (mono.size() < 8192 || sample_rate <= 0.0)
        return std::nullopt;

    constexpr int kFftSize = 4096;
    constexpr int kHop = 2048;
    const int order = static_cast<int>(std::log2(kFftSize));
    juce::dsp::FFT fft(order);
    std::vector<float> fft_data(static_cast<size_t>(kFftSize * 2), 0.f);
    std::vector<float> window(static_cast<size_t>(kFftSize));
    for (int i = 0; i < kFftSize; ++i)
        window[static_cast<size_t>(i)] =
            0.5f * (1.f - std::cos(2.f * juce::MathConstants<float>::pi * static_cast<float>(i) /
                                    static_cast<float>(kFftSize - 1)));

    std::array<float, 12> chroma{};
    int frame_count = 0;

    for (size_t start = 0; start + static_cast<size_t>(kFftSize) <= mono.size();
         start += static_cast<size_t>(kHop)) {
        std::fill(fft_data.begin(), fft_data.end(), 0.f);
        for (int i = 0; i < kFftSize; ++i)
            fft_data[static_cast<size_t>(i)] =
                mono[start + static_cast<size_t>(i)] * window[static_cast<size_t>(i)];

        fft.performFrequencyOnlyForwardTransform(fft_data.data());

        for (int bin = 1; bin <= kFftSize / 2; ++bin) {
            const float freq =
                static_cast<float>(bin) * static_cast<float>(sample_rate) /
                static_cast<float>(kFftSize);
            if (freq < 50.f) continue;

            const float mag = fft_data[static_cast<size_t>(bin)];
            if (mag <= 0.f) continue;

            const float midi = 69.f + 12.f * std::log2(freq / 440.f);
            const int pc = ((static_cast<int>(std::round(midi)) % 12) + 12) % 12;
            chroma[static_cast<size_t>(pc)] += mag;
        }
        ++frame_count;
    }

    if (frame_count == 0)
        return std::nullopt;

    float max_chroma = 0.f;
    for (float v : chroma)
        max_chroma = juce::jmax(max_chroma, v);
    if (max_chroma <= 0.f)
        return std::nullopt;
    for (float& v : chroma)
        v /= max_chroma;

    float best_score = -1.f;
    int best_shift = 0;
    bool best_minor = false;
    for (int shift = 0; shift < 12; ++shift) {
        const float major_score = correlate_profile(chroma, kMajorProfile, shift);
        const float minor_score = correlate_profile(chroma, kMinorProfile, shift);
        if (major_score > best_score) {
            best_score = major_score;
            best_shift = shift;
            best_minor = false;
        }
        if (minor_score > best_score) {
            best_score = minor_score;
            best_shift = shift;
            best_minor = true;
        }
    }

    std::string out = kPitchNames[static_cast<size_t>(best_shift)];
    if (best_minor) out += "m";
    return out;
}

static juce::StringPairArray merge_metadata(
    const juce::StringPairArray& reader_tags,
    const juce::StringPairArray* extra_metadata) {
    juce::StringPairArray merged = reader_tags;
    if (extra_metadata == nullptr)
        return merged;
    for (auto& key : extra_metadata->getAllKeys()) {
        if (!merged.containsKey(key))
            merged.set(key, (*extra_metadata)[key]);
    }
    return merged;
}

TrackAnalysis analyze_track(
    juce::AudioFormatReader& reader,
    const std::vector<float>& mono_preview,
    double preview_sample_rate,
    const juce::StringPairArray* extra_metadata) {
    TrackAnalysis out;
    const auto tags = merge_metadata(reader.metadataValues, extra_metadata);

    if (auto bpm = parse_bpm_from_metadata(tags)) {
        out.bpm = *bpm;
        out.bpm_valid = true;
        out.bpm_source = AnalysisSource::Metadata;
    }
    if (auto key = parse_key_from_metadata(tags)) {
        out.key = *key;
        out.key_valid = true;
        out.key_source = AnalysisSource::Metadata;
    }

    if (!out.bpm_valid &&
        mono_preview.size() > static_cast<size_t>(preview_sample_rate * 4)) {
        if (auto bpm = detect_bpm(mono_preview, preview_sample_rate)) {
            out.bpm = *bpm;
            out.bpm_valid = true;
            out.bpm_source = AnalysisSource::Audio;
        }
    }
    if (!out.key_valid &&
        mono_preview.size() > static_cast<size_t>(preview_sample_rate * 8)) {
        if (auto key = detect_key(mono_preview, preview_sample_rate)) {
            out.key = *key;
            out.key_valid = true;
            out.key_source = AnalysisSource::Audio;
        }
    }
    if (out.bpm_valid &&
        mono_preview.size() > static_cast<size_t>(preview_sample_rate * 4)) {
        if (auto offset = detect_beatgrid_offset(mono_preview, preview_sample_rate, out.bpm)) {
            out.beatgrid_offset_seconds = *offset;
            out.beatgrid_offset_valid = true;
        }
    }
    return out;
}

} // namespace freedeck
