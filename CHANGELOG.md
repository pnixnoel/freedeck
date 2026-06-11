# Changelog

All notable changes to FreeDeck are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Analyzer fallback chain: Essentia → Aubio → BuiltIn with monotonic beat validation
- Sidecar JSON v2: `analyzer_backend`, `analysis_confidence`, `downbeats`, `loudness_rms_db`
- Engine test suite registered with CTest (`track_analysis`, `sync`, `beatgrid`, `loop`, `eq`, `filter`)
- Self-contained `loop_test` (generates temp WAV, no CLI args)
- Optional analyzer rollback plan in `docs/RELEASING.md`

### Changed

- Aubio no longer overwrites Essentia/builtin beats; only fills gaps
- Essentia rhythm path requires confidence ≥ 0.3 and monotonic beats

## [0.2.0] - 2026-06-11

### Added

- C++ audio-thread proportional phase lock (Mixxx-style P-control)
- `engine_set_sync`, `engine_set_master`, `engine_set_beatgrid` FFI commands
- Rubber Band `getStartDelay()` latency compensation for phase detection
- Phase meter and MASTER/SYNCED LED indicators
- Quantize toggle with snap-to-beat/bar
- Variable beatgrid array with Ellis DP analysis, persistence, and edit UI MVP
- RT hardening: atomic playback reads, explicit device buffer size
- Optional Essentia key and BPM detection backend (`FREEDECK_USE_ESSENTIA=ON`)
- `license_info()` engine API and telemetry overlay info
- DSP unit tests: `sync_test.cpp` and `beatgrid_test.cpp`

## [0.1.1] - 2026-06-08

### Added

- Bipolar DJ filter (`DjFilter`) with center detent, LP/HF sweep, and resonance — wired to mixer UI and `engine_set_filter`
- Per-deck trim/gain control (±12 dB) via `engine_set_trim`
- Engine snapshot system (`EngineSnapshot` / `DeckSnapshot`) for lock-free state reads
- Per-deck peak meters computed on the audio thread
- Expanded ~60 Hz telemetry event with full deck state (volume, trim, filter, EQ, tempo, key-lock, crossfader gains)
- GeekDataPanel — live engine telemetry overlay for debugging
- DSP unit tests: `eq_test.cpp`, `filter_test.cpp`, `deck_audio_test.cpp`

### Changed

- Telemetry now uses `engine_snapshot()` instead of separate `output_left`/`output_right` polls
- Deck audio chain order: stretch → trim → EQ → filter → volume

## [0.1.0] - 2026-06-08

### Added

- Dual-deck JUCE audio engine with CoreAudio output on macOS
- Rubber Band real-time time-stretch with key-lock toggle
- 3-band EQ per deck (low shelf 250 Hz, peak 1 kHz, high shelf 4 kHz)
- Equal-power crossfader with keyboard shortcuts and bar-timed sweeps
- Soft master limiter (tanh)
- Load-time track analysis: BPM detection (metadata + audio), key detection (chroma FFT), beatgrid offset
- Waveform peak generation (512 points) with scrolling and overview displays
- Frontend one-shot beat sync with 4-bar phrase alignment (`sync.ts`)
- Frontend master/lead deck selection and BPM octave (×2/÷2) display
- Tauri v2 desktop app with React UI (2-deck layout, mixer, library shell)
- cxx FFI bridge: 12 Tauri engine commands + telemetry event
- Engine console test for headless dual-deck playback
- AGPL-3.0 license, third-party notices, project documentation

### Known limitations

- Music library uses mock data; load always requires native file picker
- Sync is one-shot (TypeScript); no continuous phase hold
- Filter/trim knobs were visual-only in this release (addressed in 0.1.1)
- No hot cues, loops, FX rack, MIDI, or headphone cue
- Audio thread uses mutex on playback handle (latency risk, addressed in G1)

[Unreleased]: https://github.com/pnixnoel/freedeck/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pnixnoel/freedeck/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/pnixnoel/freedeck/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/pnixnoel/freedeck/releases/tag/v0.1.0
