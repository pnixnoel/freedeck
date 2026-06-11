#include "TrackAnalysis.h"
#include "freedeck/engine.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_dsp/juce_dsp.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cctype>
#include <cstring>
#include <mutex>

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

std::vector<double> detect_beats_dp(
    const std::vector<float>& mono,
    double sample_rate,
    float bpm,
    double duration) {
    
    if (mono.size() < 4096 || sample_rate <= 0.0 || bpm <= 0.f)
        return {};

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
        return {};

    std::vector<float> onset(energy.size(), 0.f);
    onset[0] = energy[0];
    for (size_t i = 1; i < energy.size(); ++i) {
        onset[i] = juce::jmax(0.f, energy[i] - energy[i - 1]);
    }

    const double hop_hz = sample_rate / static_cast<double>(kHop);
    const double delta = hop_hz * 60.0 / bpm;

    int N = static_cast<int>(onset.size());
    std::vector<double> C(N, 0.0);
    std::vector<int> P(N, -1);

    constexpr double lambda = 5.0;

    for (int i = 0; i < N; ++i) {
        C[i] = onset[i];
        P[i] = -1;

        int search_min = static_cast<int>(std::round(i - 2.0 * delta));
        int search_max = static_cast<int>(std::round(i - 0.5 * delta));
        search_min = std::max(0, search_min);
        search_max = std::max(0, search_max);

        double best_prev_score = -1e9;
        int best_prev_idx = -1;

        for (int j = search_min; j <= search_max; ++j) {
            double interval = i - j;
            if (interval <= 0) continue;
            double ratio = interval / delta;
            double cost = -lambda * std::pow(std::log2(ratio), 2.0);
            double score = C[j] + cost;
            if (score > best_prev_score) {
                best_prev_score = score;
                best_prev_idx = j;
            }
        }

        if (best_prev_idx != -1 && best_prev_score + onset[i] > C[i]) {
            C[i] = onset[i] + best_prev_score;
            P[i] = best_prev_idx;
        }
    }

    int best_end_idx = -1;
    double best_end_score = -1e9;
    int search_start = std::max(0, static_cast<int>(N - 3.0 * delta));
    for (int i = search_start; i < N; ++i) {
        if (C[i] > best_end_score) {
            best_end_score = C[i];
            best_end_idx = i;
        }
    }

    if (best_end_idx == -1)
        return {};

    std::vector<int> beat_frames;
    int curr = best_end_idx;
    while (curr != -1) {
        beat_frames.push_back(curr);
        curr = P[curr];
    }
    std::reverse(beat_frames.begin(), beat_frames.end());

    std::vector<double> beats;
    for (int f : beat_frames) {
        double t = static_cast<double>(f) * kHop / sample_rate;
        beats.push_back(t);
    }

    // Extrapolate beats to the end of the track
    if (beats.size() >= 2 && duration > beats.back()) {
        size_t num_to_average = std::min(beats.size() - 1, size_t(8));
        double sum_intervals = 0.0;
        for (size_t i = beats.size() - num_to_average; i < beats.size(); ++i) {
            sum_intervals += (beats[i] - beats[i - 1]);
        }
        double avg_interval = sum_intervals / num_to_average;
        if (avg_interval <= 0.0) avg_interval = 60.0 / bpm;

        double t = beats.back() + avg_interval;
        while (t < duration) {
            beats.push_back(t);
            t += avg_interval;
        }
    } else if (beats.empty() && bpm > 0.f) {
        double beat_duration = 60.0 / bpm;
        double t = 0.0;
        while (t < duration) {
            beats.push_back(t);
            t += beat_duration;
        }
    }

    return beats;
}

bool beats_are_monotonic(const std::vector<double>& beats, double min_gap_seconds) {
    if (beats.size() < 2)
        return !beats.empty();
    for (size_t i = 1; i < beats.size(); ++i) {
        if (beats[i] <= beats[i - 1] + min_gap_seconds)
            return false;
    }
    return true;
}

std::vector<double> derive_downbeats(const std::vector<double>& beats, int beats_per_bar) {
    std::vector<double> downbeats;
    if (beats.empty() || beats_per_bar < 1)
        return downbeats;
    for (size_t i = 0; i < beats.size(); i += static_cast<size_t>(beats_per_bar))
        downbeats.push_back(beats[i]);
    return downbeats;
}

float compute_preview_loudness_db(const std::vector<float>& mono) {
    if (mono.empty())
        return -100.f;
    double sum_sq = 0.0;
    for (float s : mono)
        sum_sq += static_cast<double>(s) * static_cast<double>(s);
    const double rms = std::sqrt(sum_sq / static_cast<double>(mono.size()));
    if (rms <= 1e-9)
        return -100.f;
    return static_cast<float>(20.0 * std::log10(rms));
}

namespace {

void apply_rhythm_result(TrackAnalysis& out, const TrackAnalysis& rhythm, const char* backend) {
    if (!rhythm.bpm_valid && !rhythm.beats_valid)
        return;
    if (rhythm.bpm_valid) {
        out.bpm = rhythm.bpm;
        out.bpm_valid = true;
        out.bpm_source = AnalysisSource::Audio;
    }
    if (rhythm.beats_valid) {
        out.beats = rhythm.beats;
        out.beats_valid = true;
        out.beatgrid_offset_seconds = rhythm.beatgrid_offset_seconds;
        out.beatgrid_offset_valid = rhythm.beatgrid_offset_valid;
    }
    out.analysis_confidence = rhythm.analysis_confidence;
    out.analyzer_backend = backend;
}

void finalize_analysis(TrackAnalysis& out, const std::vector<float>& mono_preview) {
    if (out.beats_valid && out.beats.size() >= 4) {
        out.downbeats = derive_downbeats(out.beats);
        out.downbeats_valid = !out.downbeats.empty();
    }
    if (!mono_preview.empty())
        out.loudness_rms_db = compute_preview_loudness_db(mono_preview);
    if (out.analyzer_backend.empty()) {
        if (out.bpm_source == AnalysisSource::Metadata || out.key_source == AnalysisSource::Metadata)
            out.analyzer_backend = "metadata";
        else if (out.bpm_valid || out.beats_valid || out.key_valid)
            out.analyzer_backend = "builtin";
    }
}

} // namespace

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

    const bool enough_audio =
        mono_preview.size() > static_cast<size_t>(preview_sample_rate * 4);
    const bool enough_audio_for_key =
        mono_preview.size() > static_cast<size_t>(preview_sample_rate * 8);

#ifdef FREEDECK_USE_ESSENTIA
    if (enough_audio && !out.beats_valid) {
        if (auto essentia_res = detect_bpm_and_beats_essentia(mono_preview, preview_sample_rate))
            apply_rhythm_result(out, *essentia_res, "essentia");
    }
    if (enough_audio_for_key && !out.key_valid) {
        if (auto essentia_key = detect_key_essentia(mono_preview, preview_sample_rate)) {
            out.key = *essentia_key;
            out.key_valid = true;
            out.key_source = AnalysisSource::Audio;
        }
    }
#endif

#ifdef FREEDECK_USE_AUBIO
    if (enough_audio && !out.beats_valid) {
        if (auto aubio_res = detect_bpm_and_beats_aubio(mono_preview, preview_sample_rate))
            apply_rhythm_result(out, *aubio_res, "aubio");
    }
#endif

    if (!out.bpm_valid && enough_audio) {
        if (auto bpm = detect_bpm(mono_preview, preview_sample_rate)) {
            out.bpm = *bpm;
            out.bpm_valid = true;
            out.bpm_source = AnalysisSource::Audio;
            if (out.analyzer_backend.empty())
                out.analyzer_backend = "builtin";
        }
    }
    if (!out.key_valid && enough_audio_for_key) {
        if (auto key = detect_key(mono_preview, preview_sample_rate)) {
            out.key = *key;
            out.key_valid = true;
            out.key_source = AnalysisSource::Audio;
        }
    }

    if (out.bpm_valid && !out.beats_valid && enough_audio) {
        const double duration =
            static_cast<double>(reader.lengthInSamples) / reader.sampleRate;
        out.beats = detect_beats_dp(mono_preview, preview_sample_rate, out.bpm, duration);
        out.beats_valid = !out.beats.empty();
        if (out.beats_valid) {
            out.beatgrid_offset_seconds = static_cast<float>(out.beats.front());
            out.beatgrid_offset_valid = true;
            if (out.analyzer_backend.empty() || out.analyzer_backend == "metadata")
                out.analyzer_backend = "builtin";
        }
    }

    if (out.bpm_valid && !out.beatgrid_offset_valid && enough_audio) {
        if (auto offset = detect_beatgrid_offset(mono_preview, preview_sample_rate, out.bpm)) {
            out.beatgrid_offset_seconds = *offset;
            out.beatgrid_offset_valid = true;
        }
    }

    finalize_analysis(out, mono_preview);
    return out;
}

#ifdef FREEDECK_USE_AUBIO
#include <aubio/aubio.h>

class AubioBpmDetector {
public:
    explicit AubioBpmDetector(double sample_rate, uint_t win_size = 1024, uint_t hop_size = 512)
        : sample_rate_(sample_rate), hop_size_(hop_size) {
        tempo_ = new_aubio_tempo("default", win_size, hop_size, static_cast<uint_t>(sample_rate));
    }

    ~AubioBpmDetector() {
        if (tempo_) {
            del_aubio_tempo(tempo_);
        }
    }

    bool process(
        const std::vector<float>& mono,
        std::vector<double>& out_beats,
        float& out_bpm,
        float& out_confidence) {
        if (!tempo_) return false;

        fvec_t* in = new_fvec(hop_size_);
        fvec_t* out = new_fvec(1);
        if (!in || !out) {
            if (in) del_fvec(in);
            if (out) del_fvec(out);
            return false;
        }

        size_t offset = 0;
        while (offset + hop_size_ <= mono.size()) {
            for (uint_t i = 0; i < hop_size_; ++i) {
                in->data[i] = mono[offset + i];
            }

            aubio_tempo_do(tempo_, in, out);

            if (out->data[0] != 0.0f) {
                double beat_time = aubio_tempo_get_last_s(tempo_);
                if (beat_time > 0.0) {
                    if (out_beats.empty() || beat_time > out_beats.back() + 0.05) {
                        out_beats.push_back(beat_time);
                    }
                }
            }
            offset += hop_size_;
        }

        out_bpm = aubio_tempo_get_bpm(tempo_);
        out_confidence = static_cast<float>(aubio_tempo_get_confidence(tempo_));

        del_fvec(in);
        del_fvec(out);

        return out_confidence >= 0.05f && beats_are_monotonic(out_beats);
    }

private:
    double sample_rate_;
    uint_t hop_size_;
    aubio_tempo_t* tempo_{nullptr};
};

class AubioOnsetDetector {
public:
    explicit AubioOnsetDetector(double sample_rate, uint_t win_size = 1024, uint_t hop_size = 512)
        : hop_size_(hop_size) {
        onset_ = new_aubio_onset("default", win_size, hop_size, static_cast<uint_t>(sample_rate));
    }

    ~AubioOnsetDetector() {
        if (onset_) {
            del_aubio_onset(onset_);
        }
    }

    bool process(const std::vector<float>& mono, std::vector<double>& out_onsets) {
        if (!onset_) return false;

        fvec_t* in = new_fvec(hop_size_);
        fvec_t* out = new_fvec(1);
        if (!in || !out) {
            if (in) del_fvec(in);
            if (out) del_fvec(out);
            return false;
        }

        size_t offset = 0;
        while (offset + hop_size_ <= mono.size()) {
            for (uint_t i = 0; i < hop_size_; ++i) {
                in->data[i] = mono[offset + i];
            }

            aubio_onset_do(onset_, in, out);

            if (out->data[0] != 0.0f) {
                double onset_time = aubio_onset_get_last_s(onset_);
                if (onset_time > 0.0) {
                    out_onsets.push_back(onset_time);
                }
            }
            offset += hop_size_;
        }

        del_fvec(in);
        del_fvec(out);
        return !out_onsets.empty();
    }

private:
    uint_t hop_size_;
    aubio_onset_t* onset_{nullptr};
};

std::optional<TrackAnalysis> detect_bpm_and_beats_aubio(
    const std::vector<float>& mono,
    double sample_rate) {
    if (mono.size() < 4096 || sample_rate <= 0.0)
        return std::nullopt;

    AubioBpmDetector detector(sample_rate);
    std::vector<double> detected_beats;
    float bpm = 0.f;
    float confidence = 0.f;

    if (!detector.process(mono, detected_beats, bpm, confidence)) {
        return std::nullopt;
    }

    bpm = resolve_bpm_with_prior(bpm);

    if (bpm < 40.f || bpm > 250.f || std::isnan(bpm)) {
        return std::nullopt;
    }

    TrackAnalysis res;
    res.bpm = bpm;
    res.bpm_valid = true;
    res.bpm_source = AnalysisSource::Audio;
    res.beats = detected_beats;
    res.beats_valid = true;
    res.beatgrid_offset_seconds = static_cast<float>(detected_beats.front());
    res.beatgrid_offset_valid = true;
    res.analysis_confidence = confidence;
    res.analyzer_backend = "aubio";

    return res;
}
#endif

#ifdef FREEDECK_USE_ESSENTIA
#include <essentia/algorithmfactory.h>
#include <essentia/essentia.h>

class EssentiaBpmDetector {
public:
    explicit EssentiaBpmDetector(double sample_rate) : sample_rate_(sample_rate) {
        static std::once_flag init_flag;
        std::call_once(init_flag, []() {
            essentia::init();
        });
    }

    bool process(
        const std::vector<float>& mono,
        std::vector<double>& out_beats,
        float& out_bpm,
        float& out_confidence) {
        using namespace essentia;
        using namespace essentia::standard;

        Algorithm* rhythm = AlgorithmFactory::create("RhythmExtractor2013");
        if (!rhythm) return false;

        std::vector<float> beats_float;
        std::vector<float> estimates;
        float bpm = 0.0f;
        float confidence = 0.0f;

        rhythm->input("signal").set(mono);
        rhythm->output("bpm").set(bpm);
        rhythm->output("ticks").set(beats_float);
        rhythm->output("confidence").set(confidence);
        rhythm->output("estimates").set(estimates);

        try {
            rhythm->compute();
        } catch (...) {
            delete rhythm;
            return false;
        }

        delete rhythm;

        if (bpm <= 0.0f || std::isnan(bpm) || confidence < 0.3f) {
            return false;
        }

        out_bpm = resolve_bpm_with_prior(bpm);
        out_confidence = confidence;
        out_beats.clear();
        for (float t : beats_float) {
            out_beats.push_back(static_cast<double>(t));
        }

        return beats_are_monotonic(out_beats);
    }

private:
    double sample_rate_;
};

class EssentiaKeyDetector {
public:
    explicit EssentiaKeyDetector(double sample_rate) : sample_rate_(sample_rate) {
        static std::once_flag init_flag;
        std::call_once(init_flag, []() {
            essentia::init();
        });
    }

    bool process(const std::vector<float>& mono, std::string& out_key) {
        using namespace essentia;
        using namespace essentia::standard;

        Algorithm* key_extractor = AlgorithmFactory::create("KeyExtractor");
        if (!key_extractor) return false;

        std::string key;
        std::string scale;
        float strength = 0.0f;

        key_extractor->input("signal").set(mono);
        key_extractor->output("key").set(key);
        key_extractor->output("scale").set(scale);
        key_extractor->output("strength").set(strength);

        try {
            key_extractor->compute();
        } catch (...) {
            delete key_extractor;
            return false;
        }

        delete key_extractor;

        if (key.empty()) return false;

        std::string raw_key = key;
        if (scale == "minor") {
            raw_key += "m";
        }
        out_key = normalize_key_notation(raw_key);
        return !out_key.empty();
    }

private:
    double sample_rate_;
};

std::optional<TrackAnalysis> detect_bpm_and_beats_essentia(
    const std::vector<float>& mono,
    double sample_rate) {
    if (mono.size() < 4096 || sample_rate <= 0.0)
        return std::nullopt;

    EssentiaBpmDetector detector(sample_rate);
    std::vector<double> detected_beats;
    float bpm = 0.f;
    float confidence = 0.f;

    if (!detector.process(mono, detected_beats, bpm, confidence))
        return std::nullopt;

    if (bpm < 40.f || bpm > 250.f || std::isnan(bpm))
        return std::nullopt;

    TrackAnalysis res;
    res.bpm = bpm;
    res.bpm_valid = true;
    res.bpm_source = AnalysisSource::Audio;
    res.beats = detected_beats;
    res.beats_valid = true;
    res.beatgrid_offset_seconds = static_cast<float>(detected_beats.front());
    res.beatgrid_offset_valid = true;
    res.analysis_confidence = confidence;
    res.analyzer_backend = "essentia";
    return res;
}

std::optional<std::string> detect_key_essentia(
    const std::vector<float>& mono,
    double sample_rate) {
    if (mono.size() < 4096 || sample_rate <= 0.0)
        return std::nullopt;

    std::string essentia_key;
    EssentiaKeyDetector detector(sample_rate);
    if (!detector.process(mono, essentia_key))
        return std::nullopt;
    return essentia_key;
}
#endif

juce::var analysis_to_sidecar_json(const TrackAnalysis& analysis, const juce::String& file_path) {
    juce::DynamicObject::Ptr json_obj = new juce::DynamicObject();
    json_obj->setProperty("version", 2);
    json_obj->setProperty("file_path", file_path);
    json_obj->setProperty("bpm", analysis.bpm);
    json_obj->setProperty("key", juce::String(analysis.key));
    json_obj->setProperty("grid_offset_seconds", analysis.beatgrid_offset_seconds);
    json_obj->setProperty("analyzer_backend", juce::String(analysis.analyzer_backend));
    json_obj->setProperty("analysis_confidence", analysis.analysis_confidence);
    json_obj->setProperty("loudness_rms_db", analysis.loudness_rms_db);
    json_obj->setProperty("edited", false);

    juce::Array<juce::var> beats_arr;
    for (double b : analysis.beats)
        beats_arr.add(b);
    json_obj->setProperty("beats", beats_arr);

    juce::Array<juce::var> downbeats_arr;
    for (double b : analysis.downbeats)
        downbeats_arr.add(b);
    json_obj->setProperty("downbeats", downbeats_arr);

    return juce::var(json_obj.get());
}

bool analysis_from_sidecar_json(const juce::var& parsed, TrackAnalysis& out) {
    if (!parsed.isObject())
        return false;

    const double bpm = parsed.getProperty("bpm", 0.0);
    if (bpm <= 0.0)
        return false;

    out.bpm = static_cast<float>(bpm);
    out.bpm_valid = true;
    out.bpm_source = AnalysisSource::Audio;
    out.beatgrid_offset_seconds =
        static_cast<float>(parsed.getProperty("grid_offset_seconds", 0.0));
    out.beatgrid_offset_valid = true;

    const juce::String key = parsed.getProperty("key", "").toString();
    if (key.isNotEmpty()) {
        out.key = key.toStdString();
        out.key_valid = true;
        out.key_source = AnalysisSource::Audio;
    }

    const juce::var beats_val = parsed.getProperty("beats", juce::var());
    if (beats_val.isArray()) {
        out.beats.clear();
        const auto* arr = beats_val.getArray();
        for (int i = 0; i < arr->size(); ++i)
            out.beats.push_back((*arr)[i]);
        out.beats_valid = !out.beats.empty();
    }

    const juce::var downbeats_val = parsed.getProperty("downbeats", juce::var());
    if (downbeats_val.isArray()) {
        out.downbeats.clear();
        const auto* arr = downbeats_val.getArray();
        for (int i = 0; i < arr->size(); ++i)
            out.downbeats.push_back((*arr)[i]);
        out.downbeats_valid = !out.downbeats.empty();
    } else if (out.beats_valid) {
        out.downbeats = derive_downbeats(out.beats);
        out.downbeats_valid = !out.downbeats.empty();
    }

    out.analyzer_backend = parsed.getProperty("analyzer_backend", "").toString().toStdString();
    out.analysis_confidence =
        static_cast<float>(parsed.getProperty("analysis_confidence", 0.0));
    out.loudness_rms_db =
        static_cast<float>(parsed.getProperty("loudness_rms_db", 0.0));
    return true;
}

TrackAnalysis analyze_file(const std::string& path) {
    juce::AudioFormatManager format_manager;
    format_manager.registerBasicFormats();

    juce::File file(path);
    auto reader = std::unique_ptr<juce::AudioFormatReader>(format_manager.createReaderFor(file));
    TrackAnalysis out;
    if (reader == nullptr) {
        return out;
    }

    out.duration_seconds = static_cast<double>(reader->lengthInSamples) / reader->sampleRate;

    // Get metadata from reader tags
    juce::String title = reader->metadataValues.getValue("title", reader->metadataValues.getValue("Title", reader->metadataValues.getValue("TITLE", "")));
    if (title.isEmpty()) {
        title = file.getFileNameWithoutExtension();
    }
    juce::String artist = reader->metadataValues.getValue("artist", reader->metadataValues.getValue("Artist", reader->metadataValues.getValue("ARTIST", "")));
    juce::String album = reader->metadataValues.getValue("album", reader->metadataValues.getValue("Album", reader->metadataValues.getValue("ALBUM", "")));
    juce::String genre = reader->metadataValues.getValue("genre", reader->metadataValues.getValue("Genre", reader->metadataValues.getValue("GENRE", "")));

    out.title = title.toStdString();
    out.artist = artist.toStdString();
    out.album = album.toStdString();
    out.genre = genre.toStdString();

    // Check sidecar json
    juce::File sidecar_file = file.getParentDirectory().getChildFile(file.getFileName() + ".json");
    bool loaded_from_sidecar = false;

    if (sidecar_file.existsAsFile()) {
        const juce::String json_str = sidecar_file.loadFileAsString();
        const juce::var parsed = juce::JSON::parse(json_str);
        loaded_from_sidecar = analysis_from_sidecar_json(parsed, out);
    }

    if (!loaded_from_sidecar) {
        const auto container_tags = parse_container_tags(file);
        const auto mono = read_mono_preview(*reader, 90.0, 11025.0);
        auto analysis = analyze_track(
            *reader, mono, 11025.0,
            container_tags.getAllKeys().size() > 0 ? &container_tags : nullptr);

        out.bpm = analysis.bpm;
        out.bpm_valid = analysis.bpm_valid;
        out.bpm_source = analysis.bpm_source;
        out.key = analysis.key;
        out.key_valid = analysis.key_valid;
        out.key_source = analysis.key_source;
        out.beatgrid_offset_seconds = analysis.beatgrid_offset_seconds;
        out.beatgrid_offset_valid = analysis.beatgrid_offset_valid;
        out.beats = analysis.beats;
        out.beats_valid = analysis.beats_valid;
        out.downbeats = analysis.downbeats;
        out.downbeats_valid = analysis.downbeats_valid;
        out.analysis_confidence = analysis.analysis_confidence;
        out.loudness_rms_db = analysis.loudness_rms_db;
        out.analyzer_backend = analysis.analyzer_backend;

        const juce::String json_text =
            juce::JSON::toString(analysis_to_sidecar_json(out, file.getFullPathName()));
        sidecar_file.replaceWithText(json_text);
    }

    return out;
}

} // namespace freedeck
