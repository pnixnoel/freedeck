#include "Deck.h"

namespace freedeck {

Deck::Deck(juce::AudioFormatManager& format_manager)
    : format_manager_(format_manager) {}

std::shared_ptr<DeckPlayback> Deck::playback() const {
    std::lock_guard<std::mutex> lock(load_mutex_);
    return playback_;
}

void Deck::apply_stretch_settings(const std::shared_ptr<DeckPlayback>& pb) const {
    if (pb == nullptr || pb->time_stretch == nullptr)
        return;

    const float ratio = tempo_ratio_.load(std::memory_order_relaxed);
    const bool key_lock = key_lock_.load(std::memory_order_relaxed);
    pb->time_stretch->set_time_ratio(static_cast<double>(ratio));
    pb->time_stretch->set_pitch_scale(key_lock ? 1.0 : static_cast<double>(ratio));
}

std::shared_ptr<DeckPlayback> Deck::rebuild_playback(
    std::unique_ptr<juce::AudioFormatReader> reader) {
    auto pb = std::make_shared<DeckPlayback>();
    pb->reader = std::move(reader);
    pb->reader_source =
        std::make_unique<juce::AudioFormatReaderSource>(pb->reader.get(), false);
    pb->transport = std::make_unique<juce::AudioTransportSource>();
    pb->transport->setSource(
        pb->reader_source.get(), 0, nullptr, pb->reader->sampleRate);
    pb->time_stretch =
        std::make_unique<TimeStretch>(pb->transport.get(), false, 2);

    apply_stretch_settings(pb);

    if (sample_rate_ > 0.0 && block_size_ > 0) {
        pb->transport->prepareToPlay(block_size_, sample_rate_);
        pb->time_stretch->prepareToPlay(block_size_, sample_rate_);

        juce::dsp::ProcessSpec spec;
        spec.sampleRate = sample_rate_;
        spec.maximumBlockSize = static_cast<juce::uint32>(block_size_);
        spec.numChannels = 2;
        pb->eq.prepare(spec);
        pb->filter.prepare(spec);
    }

    return pb;
}

bool Deck::load(const juce::File& file) {
    std::lock_guard<std::mutex> lock(load_mutex_);

    auto analysis_reader = std::unique_ptr<juce::AudioFormatReader>(
        format_manager_.createReaderFor(file));
    if (analysis_reader == nullptr)
        return false;

    duration_seconds_ =
        static_cast<double>(analysis_reader->lengthInSamples) / analysis_reader->sampleRate;

    const auto container_tags = parse_container_tags(file);
    const auto mono = read_mono_preview(*analysis_reader, 90.0, 11025.0);
    analysis_ = analyze_track(
        *analysis_reader, mono, 11025.0,
        container_tags.getAllKeys().size() > 0 ? &container_tags : nullptr);
    analysis_reader.reset();

    auto reader = std::unique_ptr<juce::AudioFormatReader>(
        format_manager_.createReaderFor(file));
    if (reader == nullptr)
        return false;

    peaks_ = compute_waveform_peaks(*reader, 512);
    playback_ = rebuild_playback(std::move(reader));
    playback_->cue_position = 0.0;
    ensure_playback_prepared(playback_);
    return true;
}

void Deck::prepare_to_play(int samples_per_block, double sample_rate) {
    block_size_ = samples_per_block;
    sample_rate_ = sample_rate;

    std::lock_guard<std::mutex> lock(load_mutex_);
    if (playback_ == nullptr)
        return;

    playback_->transport->prepareToPlay(samples_per_block, sample_rate);
    playback_->time_stretch->prepareToPlay(samples_per_block, sample_rate);

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samples_per_block);
    spec.numChannels = 2;
    playback_->eq.prepare(spec);
    playback_->filter.prepare(spec);
}

void Deck::release_resources() {
    std::lock_guard<std::mutex> lock(load_mutex_);
    if (playback_ == nullptr)
        return;

    playback_->time_stretch->releaseResources();
    playback_->transport->releaseResources();
}

void Deck::ensure_playback_prepared(const std::shared_ptr<DeckPlayback>& pb) {
    if (pb == nullptr || sample_rate_ <= 0.0 || block_size_ <= 0)
        return;
    if (pb->time_stretch->is_prepared())
        return;

    pb->transport->prepareToPlay(block_size_, sample_rate_);
    pb->time_stretch->prepareToPlay(block_size_, sample_rate_);

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate_;
    spec.maximumBlockSize = static_cast<juce::uint32>(block_size_);
    spec.numChannels = 2;
    pb->eq.prepare(spec);
    pb->filter.prepare(spec);
    apply_stretch_settings(pb);
}

void Deck::update_peak_meters(
    const juce::AudioBuffer<float>& buffer, int start_sample, int num_samples) {
    float peak_l = 0.0f;
    float peak_r = 0.0f;
    const int channels = buffer.getNumChannels();
    for (int ch = 0; ch < channels; ++ch) {
        const auto* data = buffer.getReadPointer(ch);
        for (int i = 0; i < num_samples; ++i) {
            const float sample = std::abs(data[start_sample + i]);
            if (ch == 0)
                peak_l = juce::jmax(peak_l, sample);
            else if (ch == 1)
                peak_r = juce::jmax(peak_r, sample);
        }
    }
    if (channels == 1)
        peak_r = peak_l;
    peak_left_.store(peak_l, std::memory_order_relaxed);
    peak_right_.store(peak_r, std::memory_order_relaxed);
}

void Deck::get_next_audio_block(const juce::AudioSourceChannelInfo& info) {
    info.clearActiveBufferRegion();

    auto pb = playback();
    if (pb == nullptr) {
        peak_left_.store(0.0f, std::memory_order_relaxed);
        peak_right_.store(0.0f, std::memory_order_relaxed);
        return;
    }

    ensure_playback_prepared(pb);
    apply_stretch_settings(pb);

    pb->time_stretch->getNextAudioBlock(info);

    juce::AudioBuffer<float> buffer(
        info.buffer->getArrayOfWritePointers(),
        info.buffer->getNumChannels(),
        info.startSample,
        info.numSamples);

    buffer.applyGain(trim_gain_.load(std::memory_order_relaxed));
    pb->eq.process(buffer);
    pb->filter.process(buffer, filter_amount_.load(std::memory_order_relaxed));

    const float gain = volume_.load(std::memory_order_relaxed);
    buffer.applyGain(gain);
    update_peak_meters(buffer, info.startSample, info.numSamples);
}

DeckSnapshot Deck::snapshot() const {
    DeckSnapshot state;
    state.peak_left = peak_left_.load(std::memory_order_relaxed);
    state.peak_right = peak_right_.load(std::memory_order_relaxed);
    state.volume = volume_.load(std::memory_order_relaxed);
    state.trim_gain = trim_gain_.load(std::memory_order_relaxed);
    state.filter_amount = filter_amount_.load(std::memory_order_relaxed);
    state.tempo_ratio = tempo_ratio_.load(std::memory_order_relaxed);
    state.key_lock = key_lock_.load(std::memory_order_relaxed);

    auto pb = playback();
    state.loaded = pb != nullptr;
    if (pb != nullptr) {
        state.eq_low_db = pb->eq.gain_db(0);
        state.eq_mid_db = pb->eq.gain_db(1);
        state.eq_high_db = pb->eq.gain_db(2);
    }

    return state;
}

void Deck::set_playing(bool playing) {
    auto pb = playback();
    if (pb == nullptr)
        return;

    if (playing)
        pb->transport->start();
    else
        pb->transport->stop();
}

void Deck::cue() {
    auto pb = playback();
    if (pb == nullptr)
        return;

    pb->transport->stop();
    pb->transport->setPosition(pb->cue_position);
}

void Deck::seek(double position_seconds) {
    auto pb = playback();
    if (pb == nullptr)
        return;

    pb->transport->setPosition(position_seconds);
}

void Deck::set_volume(float gain) {
    volume_.store(juce::jlimit(0.0f, 2.0f, gain), std::memory_order_relaxed);
}

void Deck::set_eq(uint8_t band, float gain_db) {
    auto pb = playback();
    if (pb != nullptr)
        pb->eq.set_gain_db(band, gain_db);
}

void Deck::set_filter(float amount) {
    filter_amount_.store(juce::jlimit(-1.0f, 1.0f, amount), std::memory_order_relaxed);
}

void Deck::set_trim(float gain_db) {
    gain_db = juce::jlimit(-12.0f, 12.0f, gain_db);
    trim_gain_.store(juce::Decibels::decibelsToGain(gain_db), std::memory_order_relaxed);
}

void Deck::set_tempo_ratio(float ratio) {
    tempo_ratio_.store(juce::jlimit(0.5f, 2.0f, ratio), std::memory_order_relaxed);
}

void Deck::set_key_lock(bool enabled) {
    key_lock_.store(enabled, std::memory_order_relaxed);
}

bool Deck::is_playing() const {
    auto pb = playback();
    return pb != nullptr && pb->transport->isPlaying();
}

double Deck::position_seconds() const {
    auto pb = playback();
    if (pb == nullptr)
        return 0.0;
    return pb->transport->getCurrentPosition();
}

double Deck::duration_seconds() const {
    return duration_seconds_;
}

std::vector<float> Deck::waveform_peaks() const {
    std::lock_guard<std::mutex> lock(load_mutex_);
    return peaks_;
}

TrackAnalysis Deck::track_analysis() const {
    std::lock_guard<std::mutex> lock(load_mutex_);
    return analysis_;
}

} // namespace freedeck
