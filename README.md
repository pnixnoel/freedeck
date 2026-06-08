# FreeDeck

High-performance cross-platform DJ application — **v0.1.1** desktop alpha.

> **Current focus:** [Continuous Beat Sync](ROADMAP.md#g1--continuous-beat-sync) (G1 / v0.2.0) — industry-standard engine-owned phase lock with variable beatgrids. See the [implementation plan](.cursor/plans/continuous_beat_sync_ffd91553.plan.md).

## Project status

| Doc | What it covers |
|-----|----------------|
| [ROADMAP.md](ROADMAP.md) | Goal ladder, current TODOs, Serato/Rekordbox parity matrix |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, DSP flow, sync control loop, latency |
| [docs/RELEASING.md](docs/RELEASING.md) | Version mapping, release checklist |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Audio engine | C++ / JUCE (CoreAudio on macOS) |
| Time-stretch | Rubber Band (real-time) |
| Desktop host | Tauri v2 + Rust |
| FFI bridge | `cxx` (in-process, zero IPC) |
| UI | React + Vite + Tailwind v4 |

## Prerequisites (macOS Apple Silicon)

- Xcode Command Line Tools / Xcode
- [Homebrew](https://brew.sh)
- Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- CMake, Ninja, pnpm:

```bash
brew install cmake ninja pnpm
cargo install tauri-cli --version "^2"
```

Clone with submodules:

```bash
git clone --recurse-submodules git@github.com:pnixnoel/freedeck.git
cd FreeDeck
# or after clone:
git submodule update --init --recursive
```

## Project layout

```
FreeDeck/
  engine/              # JUCE audio engine (Shared Brain)
  apps/desktop/        # Tauri + React app
  third_party/JUCE/    # JUCE submodule
  docs/                # Architecture, releasing, specs
```

## Run (development)

```bash
pnpm install
cd apps/desktop
pnpm tauri dev
```

Or from repo root:

```bash
pnpm install
pnpm tauri dev
```

## Engine-only test (no UI)

Build and run the console mixer to verify CoreAudio + dual-deck playback:

```bash
cmake -B engine/build -G Ninja engine
cmake --build engine/build
./engine/build/freedeck_console_test /path/to/trackA.wav /path/to/trackB.wav
```

## Current features (v0.1.1)

- Load two local audio files (MP3, WAV, FLAC, AIFF, M4A, OGG)
- Play / pause / cue per deck
- Click-to-seek waveform with playhead and beatgrid lines
- Rubber Band time-stretch with key-lock toggle
- Per-deck volume, tempo, 3-band EQ, bipolar filter, trim/gain
- Crossfader with equal-power curve and keyboard shortcuts
- Master and per-deck level meters
- One-shot beat sync with 4-bar phrase alignment (TypeScript — continuous engine sync is G1)
- Load-time BPM/key/beatgrid-offset analysis
- Engine telemetry overlay (GeekDataPanel) for debugging

## Build release

```bash
cd apps/desktop
pnpm tauri build
```

See [docs/RELEASING.md](docs/RELEASING.md) for the full release checklist.

## Roadmap summary

| Version | Focus |
|---------|-------|
| v0.1.x | 2-deck demo + pro mixer controls (**done**) |
| **v0.2.0** | **Continuous Beat Sync (current)** |
| v0.3.0 | Real library, hot cues, loops |
| v0.5.0 | Auto-Mix engine (USP) |
| v1.0.0 | DDJ-FLX4 MIDI, macOS stable |
| v2.0.0 | KMP mobile + cloud sync |

Full details: [ROADMAP.md](ROADMAP.md)

## Deferred

- DDJ-FLX4 MIDI hardware — see [docs/DDJ-FLX4.md](docs/DDJ-FLX4.md)
- Auto-mix / intelligent transitions (G4)
- Real music library (currently mock data)
- Kotlin Multiplatform mobile host (G6)
- Supabase cloud sync (G6)

## License

FreeDeck is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This project uses the [JUCE](https://juce.com) framework (submodule). JUCE is dual-licensed under AGPL-3.0 and a commercial license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
