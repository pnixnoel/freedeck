#pragma once

#include "Deck.h"
#include <atomic>
#include <cmath>
#include <vector>
#include <memory>
#include <algorithm>

namespace freedeck {

class SyncController {
public:
    SyncController() {
        master_deck_.store(-1, std::memory_order_relaxed);
        sync_enabled_[0].store(false, std::memory_order_relaxed);
        sync_enabled_[1].store(false, std::memory_order_relaxed);
        last_trim_[0] = 1.0;
        last_trim_[1] = 1.0;
        phase_error_[0].store(0.0f, std::memory_order_relaxed);
        phase_error_[1].store(0.0f, std::memory_order_relaxed);
    }

    void set_sync(uint8_t deck, bool enabled) {
        if (deck < 2) {
            sync_enabled_[deck].store(enabled, std::memory_order_relaxed);
            if (!enabled) {
                last_trim_[deck] = 1.0;
            }
        }
    }

    bool is_sync_enabled(uint8_t deck) const {
        return deck < 2 && sync_enabled_[deck].load(std::memory_order_relaxed);
    }

    void set_master(int32_t deck) {
        master_deck_.store(deck, std::memory_order_relaxed);
    }

    int32_t master_deck() const {
        return master_deck_.load(std::memory_order_relaxed);
    }

    float get_phase_error(uint8_t deck) const {
        return deck < 2 ? phase_error_[deck].load(std::memory_order_relaxed) : 0.0f;
    }

    // Proportional control loop, runs on the audio thread
    void update_sync_trim(Deck& deck_a, Deck& deck_b) {
        int32_t master_idx = master_deck_.load(std::memory_order_relaxed);
        if (master_idx < 0 || master_idx > 1) {
            // No master deck, reset trims if synced
            if (sync_enabled_[0].load(std::memory_order_relaxed)) deck_a.set_sync_rate_trim(1.0);
            if (sync_enabled_[1].load(std::memory_order_relaxed)) deck_b.set_sync_rate_trim(1.0);
            phase_error_[0].store(0.0f, std::memory_order_relaxed);
            phase_error_[1].store(0.0f, std::memory_order_relaxed);
            return;
        }

        Deck* master = (master_idx == 0) ? &deck_a : &deck_b;
        Deck* follower = (master_idx == 0) ? &deck_b : &deck_a;
        uint8_t follower_idx = 1 - master_idx;

        // Reset master trim just in case
        master->set_sync_rate_trim(1.0);
        phase_error_[master_idx].store(0.0f, std::memory_order_relaxed);

        if (!sync_enabled_[follower_idx].load(std::memory_order_relaxed)) {
            follower->set_sync_rate_trim(1.0);
            phase_error_[follower_idx].store(0.0f, std::memory_order_relaxed);
            return;
        }

        if (!master->is_playing() || !follower->is_playing()) {
            // Keep current trim but don't adjust phase if either is not playing
            phase_error_[follower_idx].store(0.0f, std::memory_order_relaxed);
            return;
        }

        // 1. Get audible positions
        double master_pos = master->audible_position_seconds();
        double follower_pos = follower->audible_position_seconds();

        // 2. Get beats arrays (for Phase 4 variable grid)
        auto master_beats_ptr = master->beats();
        auto follower_beats_ptr = follower->beats();

        std::vector<double> empty_beats;
        const std::vector<double>& master_beats = master_beats_ptr ? *master_beats_ptr : empty_beats;
        const std::vector<double>& follower_beats = follower_beats_ptr ? *follower_beats_ptr : empty_beats;

        // 3. Compute beat distances and local BPMs
        double master_local_bpm = 120.0;
        double master_beat_dist = get_beat_distance(
            master_pos,
            master->native_bpm(),
            master->grid_offset(),
            master_beats,
            master_local_bpm
        );

        double follower_local_bpm = 120.0;
        double follower_beat_dist = get_beat_distance(
            follower_pos,
            follower->native_bpm(),
            follower->grid_offset(),
            follower_beats,
            follower_local_bpm
        );

        // 4. Compute effective BPM of the master
        double master_tempo_ratio = master->snapshot().tempo_ratio; // standard tempo ratio
        double master_effective_bpm = master_local_bpm * master_tempo_ratio;

        // 5. Take over follower tempo ratio to match master BPM
        if (follower_local_bpm > 0.0) {
            double target_tempo_ratio = master_effective_bpm / follower_local_bpm;
            follower->set_tempo_ratio(static_cast<float>(target_tempo_ratio));
        }

        // 6. Compute phase error (follower - master circular delta)
        double phase_err = shortest_circular_delta(master_beat_dist, follower_beat_dist);

        // Add pitch nudge offset in beats (nudge_offset_beats_ is controlled by UI pitch bend)
        double nudge = follower->nudge_offset_beats();
        phase_err += nudge;

        phase_error_[follower_idx].store(static_cast<float>(phase_err), std::memory_order_relaxed);

        // 7. P-controller for sync rate trim
        constexpr double Kp = 0.7;
        double target_trim = 1.0;
        double abs_err = std::abs(phase_err);

        if (abs_err < 0.01) {
            target_trim = 1.0; // deadband
        } else if (phase_err > 0.20) {
            target_trim = 0.95; // max slow down
        } else if (phase_err < -0.20) {
            target_trim = 1.05; // max speed up
        } else {
            target_trim = 1.0 - phase_err * Kp;
        }

        // Slew limit of ±2% (±0.02) per block
        double last_t = last_trim_[follower_idx];
        double diff = target_trim - last_t;
        diff = std::clamp(diff, -0.02, 0.02);
        double next_trim = std::clamp(last_t + diff, 0.95, 1.05);

        last_trim_[follower_idx] = next_trim;
        follower->set_sync_rate_trim(next_trim);
    }

private:
    // Helper to compute fractional beat distance
    double get_beat_distance(
        double audible_pos,
        double bpm,
        double grid_offset,
        const std::vector<double>& beats,
        double& out_local_bpm
    ) const {
        if (beats.size() >= 2) {
            auto it = std::upper_bound(beats.begin(), beats.end(), audible_pos);
            if (it == beats.end()) {
                double last_beat = beats.back();
                double prev_beat = beats[beats.size() - 2];
                double interval = last_beat - prev_beat;
                if (interval <= 0.0) interval = 0.5;
                double beats_since = (audible_pos - last_beat) / interval;
                out_local_bpm = 60.0 / interval;
                double frac = beats_since - std::floor(beats_since);
                return frac;
            } else if (it == beats.begin()) {
                double first_beat = beats.front();
                double next_beat = beats[1];
                double interval = next_beat - first_beat;
                if (interval <= 0.0) interval = 0.5;
                double beats_before = (first_beat - audible_pos) / interval;
                out_local_bpm = 60.0 / interval;
                double frac = 1.0 - (beats_before - std::floor(beats_before));
                if (frac >= 1.0) frac -= 1.0;
                return frac;
            } else {
                size_t idx = static_cast<size_t>(std::distance(beats.begin(), it) - 1);
                double t0 = beats[idx];
                double t1 = beats[idx + 1];
                double interval = t1 - t0;
                if (interval <= 0.0) interval = 0.5;
                out_local_bpm = 60.0 / interval;
                double frac = (audible_pos - t0) / interval;
                return std::clamp(frac, 0.0, 1.0);
            }
        } else {
            if (bpm <= 0.0) bpm = 120.0;
            double beat_duration = 60.0 / bpm;
            double beat_index = (audible_pos - grid_offset) / beat_duration;
            out_local_bpm = bpm;
            double frac = beat_index - std::floor(beat_index);
            return frac;
        }
    }

    double shortest_circular_delta(double master, double follower) const {
        double delta = follower - master;
        while (delta < -0.5) delta += 1.0;
        while (delta > 0.5) delta -= 1.0;
        return delta;
    }

    std::atomic<int32_t> master_deck_;
    std::atomic<bool> sync_enabled_[2];
    std::atomic<float> phase_error_[2];
    double last_trim_[2];
};

} // namespace freedeck
