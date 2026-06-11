#include "Deck.h"

namespace freedeck {

namespace {
double snap_to_beat(double pos, double bpm, double offset, const std::vector<double>& beats) {
    if (beats.size() >= 2) {
        auto it = std::lower_bound(beats.begin(), beats.end(), pos);
        if (it == beats.end()) {
            return beats.back();
        }
        if (it == beats.begin()) {
            return beats.front();
        }
        double next = *it;
        double prev = *(it - 1);
        if (std::abs(next - pos) < std::abs(prev - pos)) {
            return next;
        } else {
            return prev;
        }
    } else {
        if (bpm <= 0.0) return pos;
        double beat_duration = 60.0 / bpm;
        double beat_index = std::round((pos - offset) / beat_duration);
        return offset + beat_index * beat_duration;
    }
}
}

Deck::Deck(juce::AudioFormatManager& format_manager)
    : format_manager_(format_manager) {}

std::shared_ptr<DeckPlayback> Deck::playback() const {
    return std::atomic_load(&playback_);
}

void Deck::apply_stretch_settings(const std::shared_ptr<DeckPlayback>& pb) const {
    if (pb == nullptr || pb->time_stretch == nullptr)
        return;

    const float ratio = tempo_ratio_.load(std::memory_order_relaxed);
    const double trim = sync_rate_trim_.load(std::memory_order_relaxed);
    const double effective = ratio * trim;
    const bool key_lock = key_lock_.load(std::memory_order_relaxed);
    pb->time_stretch->set_time_ratio(effective);
    pb->time_stretch->set_pitch_scale(key_lock ? 1.0 : effective);
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
    loaded_file_ = file;

    // Reset sync state on track load
    set_sync_rate_trim(1.0);
    set_nudge_offset_beats(0.0);

    auto analysis_reader = std::unique_ptr<juce::AudioFormatReader>(
        format_manager_.createReaderFor(file));
    if (analysis_reader == nullptr)
        return false;

    duration_seconds_ =
        static_cast<double>(analysis_reader->lengthInSamples) / analysis_reader->sampleRate;

    juce::File sidecar_file = file.getParentDirectory().getChildFile(file.getFileName() + ".json");
    bool loaded_from_sidecar = false;
    analysis_ = TrackAnalysis(); // Reset

    if (sidecar_file.existsAsFile()) {
        const juce::String json_str = sidecar_file.loadFileAsString();
        const juce::var parsed = juce::JSON::parse(json_str);
        if (parsed.isObject()) {
            const double bpm = parsed.getProperty("bpm", 0.0);
            const double grid_offset = parsed.getProperty("grid_offset_seconds", 0.0);
            const juce::var beats_val = parsed.getProperty("beats", juce::var());
            const juce::String key = parsed.getProperty("key", "").toString();

            if (bpm > 0.0) {
                analysis_.bpm = static_cast<float>(bpm);
                analysis_.bpm_valid = true;
                analysis_.bpm_source = AnalysisSource::Audio;
                analysis_.beatgrid_offset_seconds = static_cast<float>(grid_offset);
                analysis_.beatgrid_offset_valid = true;

                if (key.isNotEmpty()) {
                    analysis_.key = key.toStdString();
                    analysis_.key_valid = true;
                    analysis_.key_source = AnalysisSource::Audio;
                }

                if (beats_val.isArray()) {
                    analysis_.beats.clear();
                    const auto* arr = beats_val.getArray();
                    for (int i = 0; i < arr->size(); ++i) {
                        analysis_.beats.push_back((*arr)[i]);
                    }
                    analysis_.beats_valid = true;
                }
                loaded_from_sidecar = true;
            }
        }
    }

    if (!loaded_from_sidecar) {
        const auto container_tags = parse_container_tags(file);
        const auto mono = read_mono_preview(*analysis_reader, 90.0, 11025.0);
        analysis_ = analyze_track(
            *analysis_reader, mono, 11025.0,
            container_tags.getAllKeys().size() > 0 ? &container_tags : nullptr);

        // Save sidecar next to the audio file
        juce::DynamicObject::Ptr json_obj = new juce::DynamicObject();
        json_obj->setProperty("version", 1);
        json_obj->setProperty("file_path", file.getFullPathName());
        json_obj->setProperty("bpm", analysis_.bpm);
        json_obj->setProperty("key", juce::String(analysis_.key));
        json_obj->setProperty("grid_offset_seconds", analysis_.beatgrid_offset_seconds);
        
        juce::Array<juce::var> beats_arr;
        for (double b : analysis_.beats) {
            beats_arr.add(b);
        }
        json_obj->setProperty("beats", beats_arr);
        json_obj->setProperty("edited", false);

        juce::var json_var(json_obj.get());
        juce::String json_text = juce::JSON::toString(json_var);
        sidecar_file.replaceWithText(json_text);
    }

    // Set atomic grid fields
    set_native_bpm(analysis_.bpm);
    set_grid_offset(analysis_.beatgrid_offset_seconds);
    if (analysis_.beats_valid && !analysis_.beats.empty()) {
        auto beats_vec = std::make_shared<const std::vector<double>>(analysis_.beats);
        set_beats(beats_vec);
    } else {
        set_beats(nullptr);
    }

    analysis_reader.reset();

    auto reader = std::unique_ptr<juce::AudioFormatReader>(
        format_manager_.createReaderFor(file));
    if (reader == nullptr)
        return false;

    peaks_ = compute_waveform_peaks(*reader, 512);
    auto pb = rebuild_playback(std::move(reader));
    pb->cue_position = 0.0;
    ensure_playback_prepared(pb);
    std::atomic_store(&playback_, pb);
    return true;
}

void Deck::prepare_to_play(int samples_per_block, double sample_rate) {
    block_size_ = samples_per_block;
    sample_rate_ = sample_rate;

    auto pb = playback();
    if (pb == nullptr)
        return;

    pb->transport->prepareToPlay(samples_per_block, sample_rate);
    pb->time_stretch->prepareToPlay(samples_per_block, sample_rate);

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sample_rate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samples_per_block);
    spec.numChannels = 2;
    pb->eq.prepare(spec);
    pb->filter.prepare(spec);
}

void Deck::release_resources() {
    auto pb = playback();
    if (pb == nullptr)
        return;

    pb->time_stretch->releaseResources();
    pb->transport->releaseResources();
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

    apply_stretch_settings(pb);

    if (loop_active_.load(std::memory_order_relaxed)) {
        double start = loop_start_seconds_.load(std::memory_order_relaxed);
        double end = loop_end_seconds_.load(std::memory_order_relaxed);
        if (start >= 0.0 && end > start) {
            double current = pb->transport->getCurrentPosition();
            if (current >= end) {
                pb->transport->setPosition(start + (current - end));
            }
        }
    }

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
    state.loop_active = loop_active_.load(std::memory_order_relaxed);
    state.loop_start_seconds = static_cast<float>(loop_start_seconds_.load(std::memory_order_relaxed));
    state.loop_end_seconds = static_cast<float>(loop_end_seconds_.load(std::memory_order_relaxed));

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

    if (pb->transport->isPlaying()) {
        pb->transport->stop();
        pb->transport->setPosition(pb->cue_position);
    } else {
        double current = pb->transport->getCurrentPosition();
        if (quantize_enabled_.load(std::memory_order_relaxed)) {
            auto beats_ptr = beats();
            std::vector<double> empty_beats;
            const std::vector<double>& beats_vec = beats_ptr ? *beats_ptr : empty_beats;
            current = snap_to_beat(current, native_bpm(), grid_offset(), beats_vec);
        }
        pb->cue_position = current;
    }
}

void Deck::seek(double position_seconds) {
    auto pb = playback();
    if (pb == nullptr)
        return;

    double final_pos = position_seconds;
    if (quantize_enabled_.load(std::memory_order_relaxed)) {
        auto beats_ptr = beats();
        std::vector<double> empty_beats;
        const std::vector<double>& beats_vec = beats_ptr ? *beats_ptr : empty_beats;
        final_pos = snap_to_beat(final_pos, native_bpm(), grid_offset(), beats_vec);
    }
    pb->transport->setPosition(final_pos);
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

void Deck::set_native_bpm(double bpm) {
    native_bpm_.store(bpm, std::memory_order_relaxed);
}

double Deck::native_bpm() const {
    return native_bpm_.load(std::memory_order_relaxed);
}

void Deck::set_grid_offset(double offset) {
    grid_offset_.store(offset, std::memory_order_relaxed);
}

double Deck::grid_offset() const {
    return grid_offset_.load(std::memory_order_relaxed);
}

void Deck::set_beatgrid(double bpm, double offset) {
    set_native_bpm(bpm);
    set_grid_offset(offset);

    // Regenerate beats array
    double duration = duration_seconds_;
    std::vector<double> new_beats;
    if (bpm > 0.0) {
        double beat_duration = 60.0 / bpm;
        double t = offset;
        while (t >= beat_duration) t -= beat_duration;
        for (; t < duration; t += beat_duration) {
            new_beats.push_back(t);
        }
    }
    set_beats(std::make_shared<const std::vector<double>>(new_beats));

    save_sidecar();
}

void Deck::save_sidecar() const {
    if (loaded_file_ == juce::File())
        return;

    juce::File sidecar_file = loaded_file_.getParentDirectory().getChildFile(loaded_file_.getFileName() + ".json");

    juce::DynamicObject::Ptr json = new juce::DynamicObject();
    json->setProperty("bpm", native_bpm());
    json->setProperty("grid_offset_seconds", grid_offset());
    json->setProperty("key", juce::String(analysis_.key));

    auto beats_ptr = beats();
    juce::Array<juce::var> beats_arr;
    if (beats_ptr) {
        for (double b : *beats_ptr) {
            beats_arr.add(b);
        }
    }
    json->setProperty("beats", beats_arr);

    juce::var json_var(json.get());
    juce::String json_text = juce::JSON::toString(json_var);
    sidecar_file.replaceWithText(json_text);
}

void Deck::set_sync_rate_trim(double trim) {
    sync_rate_trim_.store(trim, std::memory_order_relaxed);
}

double Deck::sync_rate_trim() const {
    return sync_rate_trim_.load(std::memory_order_relaxed);
}

void Deck::set_nudge_offset_beats(double nudge) {
    nudge_offset_beats_.store(nudge, std::memory_order_relaxed);
}

double Deck::nudge_offset_beats() const {
    return nudge_offset_beats_.load(std::memory_order_relaxed);
}

void Deck::set_beats(std::shared_ptr<const std::vector<double>> beats) {
    std::atomic_store(&beats_, beats);
}

std::shared_ptr<const std::vector<double>> Deck::beats() const {
    return std::atomic_load(&beats_);
}

void Deck::set_quantize(bool enabled) {
    quantize_enabled_.store(enabled, std::memory_order_relaxed);
}

bool Deck::quantize_enabled() const {
    return quantize_enabled_.load(std::memory_order_relaxed);
}

double Deck::start_delay_seconds() const {
    auto pb = playback();
    if (pb == nullptr || pb->time_stretch == nullptr)
        return 0.0;
    return pb->time_stretch->start_delay_seconds();
}

double Deck::audible_position_seconds() const {
    auto pb = playback();
    if (pb == nullptr || pb->transport == nullptr)
        return 0.0;
    double pos = pb->transport->getCurrentPosition();
    return pos - start_delay_seconds();
}

void Deck::set_loop_points(double start_seconds, double end_seconds) {
    loop_start_seconds_.store(start_seconds, std::memory_order_relaxed);
    loop_end_seconds_.store(end_seconds, std::memory_order_relaxed);
}

void Deck::set_loop_active(bool active) {
    loop_active_.store(active, std::memory_order_relaxed);
}

bool Deck::loop_active() const {
    return loop_active_.load(std::memory_order_relaxed);
}

double Deck::loop_start_seconds() const {
    return loop_start_seconds_.load(std::memory_order_relaxed);
}

double Deck::loop_end_seconds() const {
    return loop_end_seconds_.load(std::memory_order_relaxed);
}

} // namespace freedeck
