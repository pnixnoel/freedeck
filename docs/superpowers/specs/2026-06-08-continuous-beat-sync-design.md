# Continuous Beat Sync — Requirements

**Status:** Approved for implementation (G1 / v0.2.0)

**Implementation plan:** [`.cursor/plans/continuous_beat_sync_ffd91553.plan.md`](../../../.cursor/plans/continuous_beat_sync_ffd91553.plan.md)

**Architecture:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md)

---

## Problem

FreeDeck's SYNC button performs a one-shot tempo match and seek in TypeScript. After that single alignment, decks drift apart over minutes. Master tempo changes trigger hard re-seeks that cause audible jumps. There is no phase feedback, no quantize, and beatgrids are a single BPM + offset — insufficient for variable-tempo tracks.

Pro DJ software (Serato, Rekordbox, Traktor, Mixxx) maintains continuous phase alignment by adjusting playback rate every audio buffer. FreeDeck must match this behavior to reach industry parity and to unblock the Auto-Mix USP (G4).

---

## Goals

1. **Continuous phase lock** — follower deck stays beat-aligned with master for the full mix session
2. **Industry-standard SYNC UX** — Beat Sync vs Tempo Sync modes, phase meter, quantize
3. **Variable beatgrid** — sparse beat position array supporting tempo-changing tracks
4. **Latency-safe** — sync math on audio thread only, Rubber Band delay compensated, zero new RT hazards

## Non-goals (this spec)

- Auto-mix transitions (G4)
- MIDI controller sync (G5)
- Network sync / Ableton Link
- Full per-beat drag editing UI (stretch goal; MVP is offset nudge + set-downbeat)

---

## User-facing behavior

### SYNC button states

| State | LED | Behavior |
|-------|-----|----------|
| Off | Dim | Deck plays at user's tempo; no engine sync |
| Beat Sync | Solid SYNCED | BPM + phase locked to master; pitch fader taken over |
| Tempo Sync | Blinking/dim | BPM locked, phase offset free; user maintains manual offset |
| Master | Solid MASTER | This deck sets group tempo; other synced decks follow |

### Expected flows

**F1 — Engage sync on follower**

1. User plays Deck A (master), loads Deck B
2. User presses SYNC on Deck B
3. System performs one-shot phrase + beat snap (`alignFollowerToMaster`)
4. System calls `engine.setSync(B, true)` and `engine.setMaster(A)`
5. Engine continuously corrects B's playback rate; no further seeks
6. Phase meter shows near-zero error within seconds

**F2 — Master tempo change while synced**

1. User moves master pitch fader
2. Follower's effective BPM tracks smoothly via engine P-control
3. No seek, no audible jump

**F3 — Manual phase offset (Tempo Sync)**

1. User drags follower pitch fader while Beat Sync engaged
2. UI switches to Tempo Sync mode (blinking SYNC)
3. Phase offset is preserved
4. On pitch fader release, Beat Sync re-engages and P-control re-locks phase

**F4 — Re-sync after drift**

1. User presses SYNC again while in Tempo Sync or after long manual nudge
2. One-shot snap re-aligns phrase + beat
3. Continuous hold resumes

**F5 — Quantize on**

1. User enables quantize toggle
2. Waveform click-seek snaps to nearest beat
3. Cue set snaps to nearest beat
4. Sync engage snaps to nearest bar

**F6 — Variable-tempo track (Phase 4)**

1. Track with tempo drift is analyzed into `beats[]` array at load
2. Sync uses local BPM at playhead, not global average
3. Phase lock holds across tempo changes within the track

### Acceptance criteria

| ID | Criterion |
|----|-----------|
| AE1 | Two constant-BPM tracks remain phase-locked for 10+ minutes; residual error < 0.01 beat |
| AE2 | Master tempo change while synced produces no seek and no audible pitch wobble beyond ±5% trim |
| AE3 | SYNC engage aligns to nearest 4-bar phrase boundary + within-bar beat |
| AE4 | Phase meter reflects live `sync_phase_error` from engine telemetry |
| AE5 | Nudge/pitch-bend creates temporary offset; phase re-locks within 5 seconds of release |
| AE6 | Variable-tempo test track (≥5 BPM drift) stays locked via beat array (Phase 4) |
| AE7 | No new mutex lock or heap allocation on audio callback sync path |
| AE8 | Edited beatgrid persists across app restart (Phase 4) |

---

## Mathematical requirements

### Phase representation

All phase math uses **beat-fraction space** `[0, 1)`, not wall-clock seconds. This is invariant to tempo.

```
beatDistance(pos) = fractional part of beat index at position pos
phaseError = shortestCircularDelta(masterBeatDistance, followerBeatDistance)
// range: [-0.5, 0.5]
```

### Rate correction (proportional control)

Use bounded P-control modeled on Mixxx `calcSyncAdjustment`, **not** a literal PLL:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Deadband | 0.01 beat | ~10 ms at 120 BPM; absorbs Rubber Band jitter |
| Catch-up threshold | 0.20 beat | Switch to max trim instead of seek |
| Max trim | ±5% | Inaudible pitch wobble |
| Kp | 0.7 | Mixxx default; stable with Rubber Band delay |
| Slew limit | ±2% per callback | Prevents rate jumps |

### Latency compensation

```
audiblePosition = transportPosition - (stretcher.getStartDelay() / sampleRate)
```

Both master and follower positions must use audible (delay-compensated) positions for phase comparison.

### Variable beatgrid interpolation

```
i = index of beat immediately before audiblePosition
beatDistance = (pos - beats[i]) / (beats[i+1] - beats[i])
localBpm = 60 / (beats[i+1] - beats[i])
```

---

## Data model

### Per-deck runtime (atomics on audio thread)

| Field | Type | Set by | Read by |
|-------|------|--------|---------|
| `native_bpm_` | `atomic<double>` | Load, `set_beatgrid`, UI ×2/÷2 | P-control ratio calc |
| `grid_offset_` | `atomic<double>` | Load, `set_beatgrid`, edit UI | Phase detector |
| `sync_rate_trim_` | `atomic<double>` | P-control (audio thread) | `apply_stretch_settings` |
| `nudge_offset_beats_` | `atomic<double>` | Pitch bend (control thread) | P-control ratio calc |
| `beats_` | `atomic<shared_ptr<const vector<double>>>` | Analysis, edit, persist | Phase detector (P4) |

### Engine-level

| Field | Type | Purpose |
|-------|------|---------|
| `master_deck_` | `atomic<int>` | Which deck (0/1) sets group tempo |
| `sync_enabled_[2]` | `atomic<bool>` | Per-deck sync engagement |

### Persistence (Phase 4)

JSON sidecar per track, keyed by absolute file path:

```json
{
  "version": 1,
  "file_path": "/Users/me/Music/track.mp3",
  "bpm": 128.0,
  "grid_offset_seconds": 0.42,
  "beats": [0.42, 0.89, 1.36],
  "downbeats": [0, 4, 8],
  "edited": true
}
```

Stored via Tauri fs in app data directory. Loaded on `engine_load_track`; saved on grid edit.

### Telemetry additions

| Field | Type | Rate |
|-------|------|------|
| `sync_phase_error` | `f32` (beats, signed) | 60 Hz |
| `deck_a_synced` / `deck_b_synced` | `bool` | 60 Hz |
| `master_deck` | `i32` | 60 Hz |
| `buffer_size_ms` | `f32` | 60 Hz |

---

## Latency constraints

| Rule | Requirement |
|------|-------------|
| Sync computation | Audio callback thread only |
| Sync commands | Queued via atomics; consumed next callback |
| Phase comparison | Uses audible (delay-compensated) positions |
| Beatgrid swap | `atomic<shared_ptr>` — no mutex on audio thread |
| No file I/O | Ever on audio thread |
| Device buffer | Explicit 128–256 samples; exposed in telemetry |
| Rubber Band | `setTimeRatio` called from same thread as `process()` |

### RT hardening (parallel with P1)

These existing gaps must be fixed as part of G1, not deferred:

- `Deck::playback()` mutex on every audio block → atomic `shared_ptr`
- `ensure_playback_prepared()` on audio thread → load thread only
- `TimeStretch` vector resize on audio thread → pre-allocate in `prepareToPlay`
- `Deck::load()` synchronous analysis blocking audio → background thread (P4 or parallel)

---

## API surface (new FFI commands)

| Command | Args | Effect |
|---------|------|--------|
| `engine_set_sync` | `deck: u8, enabled: bool` | Enable/disable continuous sync on deck |
| `engine_set_master` | `deck: u8` | Set master deck for sync group |
| `engine_set_beatgrid` | `deck: u8, bpm: f64, offset: f64` | Update grid params (TS authoritative for ×2/÷2) |
| `engine_track_beats` | `deck: u8` → `Vec<f64>` | Return beat position array (P4) |

---

## Phased delivery

| Phase | Scope | Release |
|-------|-------|---------|
| P1 | Core P-control + FFI + TS wiring + RT hardening | v0.2.0-alpha.1 |
| P2 | Phase meter + LEDs + telemetry | v0.2.0-alpha.2 |
| P3 | Quantize | v0.2.0-beta |
| P4 | Variable grid + analysis + persistence + edit MVP | v0.2.1 |

---

## References

- [Mixxx SyncLock developer guide](https://github.com/mixxxdj/mixxx/wiki/Developer-Guide-SyncLock)
- [Serato SYNC documentation](https://support.serato.com/hc/en-us/articles/203056994-SYNC-with-Serato-DJ)
- [Rubber Band real-time integration](https://breakfastquay.com/rubberband/integration.html)
- [Ellis 2007 — Beat Tracking by Dynamic Programming](https://www.ee.columbia.edu/~dpwe/pubs/Ellis07-beattrack.pdf)
- [Ableton Link — latency compensation pattern](https://ableton.github.io/link/)
