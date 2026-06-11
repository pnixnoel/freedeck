#include "TrackAnalysis.h"

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

namespace {

std::vector<float> make_click_mono(
    double bpm, double duration_seconds, double sample_rate = 11025.0) {
    const int num_samples = static_cast<int>(duration_seconds * sample_rate);
    std::vector<float> mono(static_cast<size_t>(num_samples), 0.f);
    const double interval = sample_rate * 60.0 / bpm;
    for (int i = 0; i < num_samples; ++i) {
        const double beat_pos = std::fmod(static_cast<double>(i), interval);
        if (beat_pos < sample_rate * 0.002)
            mono[static_cast<size_t>(i)] = 1.f;
    }
    return mono;
}

std::vector<float> make_delayed_click_mono(
    double bpm,
    double delay_seconds,
    double duration_seconds,
    double sample_rate = 11025.0) {
    const int num_samples = static_cast<int>(duration_seconds * sample_rate);
    std::vector<float> mono(static_cast<size_t>(num_samples), 0.f);
    const double interval = sample_rate * 60.0 / bpm;
    const int delay_samples = static_cast<int>(delay_seconds * sample_rate);
    for (int i = delay_samples; i < num_samples; ++i) {
        const double beat_pos = std::fmod(static_cast<double>(i - delay_samples), interval);
        if (beat_pos < sample_rate * 0.002)
            mono[static_cast<size_t>(i)] = 1.f;
    }
    return mono;
}

std::vector<float> make_major_chord_mono(double duration_seconds, double sample_rate = 11025.0) {
    const int num_samples = static_cast<int>(duration_seconds * sample_rate);
    std::vector<float> mono(static_cast<size_t>(num_samples), 0.f);
    const float freqs[] = {261.63f, 329.63f, 392.00f};
    for (int i = 0; i < num_samples; ++i) {
        float s = 0.f;
        for (float f : freqs)
            s += std::sin(2.f * juce::MathConstants<float>::pi * f *
                          static_cast<float>(i) / static_cast<float>(sample_rate));
        mono[static_cast<size_t>(i)] = s / 3.f;
    }
    return mono;
}

void test_parse_bpm_from_metadata() {
    juce::StringPairArray tags;
    tags.set("BPM", "128");
    auto bpm = freedeck::parse_bpm_from_metadata(tags);
    assert(bpm.has_value());
    assert(std::abs(*bpm - 128.f) < 0.01f);

    tags.set("TBPM", "87.5");
    bpm = freedeck::parse_bpm_from_metadata(tags);
    assert(bpm.has_value());
    assert(std::abs(*bpm - 87.5f) < 0.01f);

    std::cout << "test_parse_bpm_from_metadata OK\n";
}

void test_parse_key_from_metadata() {
    juce::StringPairArray tags;
    tags.set("KEY", "F#m");
    auto key = freedeck::parse_key_from_metadata(tags);
    assert(key.has_value());
    assert(*key == "F#m");

    tags = juce::StringPairArray();
    tags.set("TKEY", "11A");
    key = freedeck::parse_key_from_metadata(tags);
    assert(key.has_value());
    assert(*key == "F#m");

    std::cout << "test_parse_key_from_metadata OK\n";
}

void test_detect_bpm_click_track() {
    const auto mono = make_click_mono(120.0, 30.0);
    auto bpm = freedeck::detect_bpm(mono, 11025.0);
    assert(bpm.has_value());
    assert(*bpm >= 117.f && *bpm <= 123.f);
    std::cout << "test_detect_bpm_click_track OK (" << *bpm << ")\n";
}

void test_detect_bpm_half_tempo_guard() {
    const auto mono = make_click_mono(60.0, 30.0);
    auto bpm = freedeck::detect_bpm(mono, 11025.0);
    assert(bpm.has_value());
    assert(*bpm >= 58.f && *bpm <= 62.f);
    std::cout << "test_detect_bpm_half_tempo_guard OK (" << *bpm << ")\n";
}

void test_detect_key_major_chord() {
    const auto mono = make_major_chord_mono(8.0);
    auto key = freedeck::detect_key(mono, 11025.0);
    assert(key.has_value());
    assert(*key == "C" || *key == "Am");
    std::cout << "test_detect_key_major_chord OK (" << *key << ")\n";
}

void test_analyze_track_metadata_first() {
    class FakeReader : public juce::AudioFormatReader {
    public:
        FakeReader() : juce::AudioFormatReader(nullptr, "fake") {
            sampleRate = 44100.0;
            bitsPerSample = 16;
            lengthInSamples = 0;
            numChannels = 1;
            metadataValues.set("BPM", "130");
            metadataValues.set("KEY", "Am");
        }
        bool readSamples(int* const*, int, int, juce::int64, int) override { return true; }
    } reader;

    const auto mono = make_click_mono(120.0, 5.0);
    auto result = freedeck::analyze_track(reader, mono, 11025.0);
    assert(result.bpm_valid);
    assert(std::abs(result.bpm - 130.f) < 0.01f);
    assert(result.bpm_source == freedeck::AnalysisSource::Metadata);
    assert(result.key_valid);
    assert(result.key == "Am");
    std::cout << "test_analyze_track_metadata_first OK\n";
}

void test_parse_id3_container_tags() {
    juce::MemoryBlock mp3;
    const char id3_header[] = {
        'I', 'D', '3', 3, 0, 0, 0, 0, 0, 0x10};
    mp3.append(id3_header, sizeof(id3_header));

  // TBPM frame: "TBPM" + size 6 + flags + encoding 0 + "128.0"
    const uint8_t tbpm_frame[] = {
        'T', 'B', 'P', 'M', 0, 0, 0, 6, 0, 0, 0, '1', '2', '8', '.', '0'};
    mp3.append(tbpm_frame, sizeof(tbpm_frame));

    const juce::File temp = juce::File::getSpecialLocation(juce::File::tempDirectory)
                                .getChildFile("freedeck_id3_test.mp3");
    temp.replaceWithData(mp3.getData(), mp3.getSize());

    const auto tags = freedeck::parse_container_tags(temp);
    temp.deleteFile();

    auto bpm = freedeck::parse_bpm_from_metadata(tags);
    assert(bpm.has_value());
    assert(std::abs(*bpm - 128.f) < 0.01f);
    std::cout << "test_parse_id3_container_tags OK\n";
}

void test_analyze_track_audio_fallback() {
    class FakeReader : public juce::AudioFormatReader {
    public:
        FakeReader() : juce::AudioFormatReader(nullptr, "fake") {
            sampleRate = 44100.0;
            bitsPerSample = 16;
            lengthInSamples = 0;
            numChannels = 1;
        }
        bool readSamples(int* const*, int, int, juce::int64, int) override { return true; }
    } reader;

    const auto mono = make_click_mono(120.0, 20.0);
    auto result = freedeck::analyze_track(reader, mono, 11025.0);
    assert(result.bpm_valid);
    assert(result.bpm >= 117.f && result.bpm <= 123.f);
    assert(result.bpm_source == freedeck::AnalysisSource::Audio);
    std::cout << "test_analyze_track_audio_fallback OK\n";
}

void test_resolve_bpm_prefers_dj_range() {
    const float resolved = freedeck::resolve_bpm_with_prior(61.5f);
    assert(resolved >= 120.f && resolved <= 126.f);
    std::cout << "test_resolve_bpm_prefers_dj_range OK (" << resolved << ")\n";
}

void test_resolve_bpm_keeps_in_range_values() {
    const float resolved = freedeck::resolve_bpm_with_prior(128.f);
    assert(std::abs(resolved - 128.f) < 0.1f);
    std::cout << "test_resolve_bpm_keeps_in_range_values OK\n";
}

void test_resolve_bpm_keeps_true_half_time() {
    const float resolved = freedeck::resolve_bpm_with_prior(60.f);
    assert(std::abs(resolved - 60.f) < 0.1f);
    std::cout << "test_resolve_bpm_keeps_true_half_time OK\n";
}

void test_detect_beatgrid_offset_click_at_start() {
    const auto mono = make_click_mono(120.0, 20.0);
    auto offset = freedeck::detect_beatgrid_offset(mono, 11025.0, 120.f);
    assert(offset.has_value());
    assert(*offset < 0.15f);
    std::cout << "test_detect_beatgrid_offset_click_at_start OK (" << *offset << ")\n";
}

void test_detect_beatgrid_offset_delayed_downbeat() {
    const auto mono = make_delayed_click_mono(120.0, 0.5, 20.0);
    auto offset = freedeck::detect_beatgrid_offset(mono, 11025.0, 120.f);
    assert(offset.has_value());
    assert(std::abs(*offset - 0.5f) < 0.15f);
    std::cout << "test_detect_beatgrid_offset_delayed_downbeat OK (" << *offset << ")\n";
}

void test_analyze_track_includes_beatgrid_offset() {
    class FakeReader : public juce::AudioFormatReader {
    public:
        FakeReader() : juce::AudioFormatReader(nullptr, "fake") {
            sampleRate = 44100.0;
            bitsPerSample = 16;
            lengthInSamples = 0;
            numChannels = 1;
        }
        bool readSamples(int* const*, int, int, juce::int64, int) override { return true; }
    } reader;

    const auto mono = make_delayed_click_mono(120.0, 0.5, 20.0);
    auto result = freedeck::analyze_track(reader, mono, 11025.0);
    assert(result.bpm_valid);
    assert(result.beatgrid_offset_valid);
    assert(std::abs(result.beatgrid_offset_seconds - 0.5f) < 0.15f);
    std::cout << "test_analyze_track_includes_beatgrid_offset OK\n";
}

#ifdef FREEDECK_USE_AUBIO
void test_aubio_analyzer() {
    const auto mono = make_click_mono(120.0, 10.0, 44100.0);
    auto res = freedeck::detect_bpm_and_beats_aubio(mono, 44100.0);
    assert(res.has_value());
    assert(res->bpm_valid);
    assert(res->bpm >= 115.f && res->bpm <= 125.f);
    assert(res->beats_valid);
    assert(res->beats.size() > 5);
    for (size_t i = 1; i < res->beats.size(); ++i) {
        assert(res->beats[i] > res->beats[i - 1]);
    }
    std::cout << "test_aubio_analyzer OK (" << res->bpm << " BPM, " << res->beats.size() << " beats)\n";
}

void test_aubio_vs_builtin_comparison() {
    const auto mono = make_click_mono(125.0, 15.0, 44100.0);
    
    // Built-in detection
    auto bpm_builtin = freedeck::detect_bpm(mono, 44100.0);
    assert(bpm_builtin.has_value());
    
    // Aubio detection
    auto res_aubio = freedeck::detect_bpm_and_beats_aubio(mono, 44100.0);
    assert(res_aubio.has_value());
    assert(res_aubio->bpm_valid);
    
    float diff = std::abs(*bpm_builtin - res_aubio->bpm);
    assert(diff <= 2.0f);
    
    std::cout << "test_aubio_vs_builtin_comparison OK (Built-in: " << *bpm_builtin 
              << " BPM, Aubio: " << res_aubio->bpm << " BPM, diff: " << diff << ")\n";
}
#endif

} // namespace

int main() {
    std::cout << "Starting tests..." << std::endl;
    std::cout << "Running test_parse_bpm_from_metadata..." << std::endl;
    test_parse_bpm_from_metadata();
    std::cout << "Running test_parse_key_from_metadata..." << std::endl;
    test_parse_key_from_metadata();
    std::cout << "Running test_detect_bpm_click_track..." << std::endl;
    test_detect_bpm_click_track();
    std::cout << "Running test_detect_bpm_half_tempo_guard..." << std::endl;
    test_detect_bpm_half_tempo_guard();
    std::cout << "Running test_detect_key_major_chord..." << std::endl;
    test_detect_key_major_chord();
    std::cout << "Running test_analyze_track_metadata_first..." << std::endl;
    test_analyze_track_metadata_first();
    std::cout << "Running test_parse_id3_container_tags..." << std::endl;
    test_parse_id3_container_tags();
    std::cout << "Running test_analyze_track_audio_fallback..." << std::endl;
    test_analyze_track_audio_fallback();
    std::cout << "Running test_resolve_bpm_prefers_dj_range..." << std::endl;
    test_resolve_bpm_prefers_dj_range();
    std::cout << "Running test_resolve_bpm_keeps_in_range_values..." << std::endl;
    test_resolve_bpm_keeps_in_range_values();
    std::cout << "Running test_resolve_bpm_keeps_true_half_time..." << std::endl;
    test_resolve_bpm_keeps_true_half_time();
    std::cout << "Running test_detect_beatgrid_offset_click_at_start..." << std::endl;
    test_detect_beatgrid_offset_click_at_start();
    std::cout << "Running test_detect_beatgrid_offset_delayed_downbeat..." << std::endl;
    test_detect_beatgrid_offset_delayed_downbeat();
    std::cout << "Running test_analyze_track_includes_beatgrid_offset..." << std::endl;
    test_analyze_track_includes_beatgrid_offset();
#ifdef FREEDECK_USE_AUBIO
    std::cout << "Running test_aubio_analyzer..." << std::endl;
    test_aubio_analyzer();
    std::cout << "Running test_aubio_vs_builtin_comparison..." << std::endl;
    test_aubio_vs_builtin_comparison();
#endif
    std::cout << "All track analysis tests passed.\n";
    return 0;
}
