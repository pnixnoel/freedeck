# FreeDeck

High-performance cross-platform DJ application — **v0 Phase 1** desktop demo.

## Stack

| Layer | Technology |
|-------|------------|
| Audio engine | C++ / JUCE (CoreAudio on macOS) |
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

## v0 features

- Load two local audio files (MP3, WAV, FLAC, AIFF, M4A, OGG)
- Play / pause / cue per deck
- Click-to-seek waveform with playhead
- Per-deck volume and tempo (varispeed)
- 3-band EQ per deck (low / mid / high)
- Crossfader with equal-power curve
- Master output level meters

## Build release

```bash
cd apps/desktop
pnpm tauri build
```

## Deferred (later phases)

- DDJ-FLX4 MIDI hardware — see [docs/DDJ-FLX4.md](docs/DDJ-FLX4.md)
- Auto-mix / phrase alignment
- Kotlin Multiplatform mobile host
- Supabase sync

## License

FreeDeck is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This project uses the [JUCE](https://juce.com) framework (submodule). JUCE is dual-licensed under AGPL-3.0 and a commercial license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

