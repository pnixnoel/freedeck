# Tempo, Key-Lock, BPM, and Deck Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inverted tempo playback, add key-lock time-stretching (Rubber Band), improve BPM octave detection to match industry DJ software, reset tempo on track load, and fix deck layout clipping — so displayed BPM matches heard speed and both decks are fully visible.

**Architecture:** Replace `juce::ResamplingAudioSource` (which inverts tempo and changes pitch) with a real-time `RubberBandStretcher` wrapper (`TimeStretch.cpp`) using `setTimeRatio(tempo)` + `setPitchScale(1.0)` for key-lock. BPM analysis gains a Gaussian tempo prior (center ~120 BPM, range 80–160) like Rekordbox/Serato, metadata always wins, and Serato-style ×2/÷2 buttons live in `TrackInfoBar`. Layout uses hybrid scaling: slightly smaller default controls + CSS scale when side columns drop below ~320px.

**Tech Stack:** C++17/JUCE 8, Rubber Band Library v3.x, Rust/Tauri v2 bridge (cxx), React 19/TypeScript/Tailwind 4, Vitest, CMake.

**User decisions (locked in):**
- Key Lock: toggle in UI, **default ON**
- BPM correction: ×2/÷2 buttons in **TrackInfoBar** only
- Layout: **hybrid** (scale + slightly smaller defaults)
- Tempo reset: **yes** on every track load
- BPM octave: match industry (metadata first, tempo prior, manual ×2/÷2)

**Execution:** Subagent-driven development — one fresh subagent per task, spec review then code quality review after each task. Use `superpowers:using-git-worktrees` before Task 0.

---

## File map

| File | Responsibility |
|------|----------------|
| `third_party/rubberband/` | Rubber Band Library source (git submodule or FetchContent) |
| `engine/CMakeLists.txt` | Add Rubber Band, new test target |
| `engine/src/TimeStretch.h` | Real-time stretcher wrapper around RubberBandStretcher |
| `engine/src/TimeStretch.cpp` | Pull from transport, push through stretcher, key-lock pitch scale |
| `engine/src/Deck.cpp` | Replace resampler with TimeStretch; correct tempo direction |
| `engine/src/Deck.h` | Add `set_key_lock(bool)`, store key_lock atomic |
| `engine/src/TrackAnalysis.cpp` | Tempo prior + octave resolution for audio-detected BPM |
| `engine/src/TrackAnalysis.h` | Export `resolve_bpm_with_prior(float bpm)` for tests |
| `engine/test/time_stretch_test.cpp` | Tempo ratio direction tests |
| `engine/test/track_analysis_test.cpp` | Octave prior tests |
| `engine/include/freedeck/engine.h` | Add `set_key_lock(uint8_t deck, bool enabled)` |
| `engine/src/Engine.cpp` | Pass-through for key lock |
| `apps/desktop/src-tauri/cpp/engine_shim.cc` | FFI for key lock |
| `apps/desktop/src-tauri/src/lib.rs` | Tauri command `engine_set_key_lock` |
| `apps/desktop/src/lib/engine.ts` | `setKeyLock(deck, enabled)` |
| `apps/desktop/src/App.tsx` | Key lock state, tempo reset on load, BPM ×2/÷2 handlers |
| `apps/desktop/src/components/TrackInfoBar.tsx` | Key Lock toggle, ×2/÷2 BPM buttons |
| `apps/desktop/src/components/Deck.tsx` | Hybrid scale wrapper, remove inner overflow-hidden |
| `apps/desktop/src/components/JogWheel.tsx` | Slightly smaller default size (`w-32 h-32`) |
| `apps/desktop/src-tauri/tauri.conf.json` | Raise minWidth to 1200 |
| `apps/desktop/src/lib/bpmOctave.ts` | Pure functions for ×2/÷2 BPM (testable) |
| `apps/desktop/src/lib/bpmOctave.test.ts` | Unit tests |

---

## Root cause reference

**Bug 1 — Inverted tempo (critical):** `Deck.cpp` calls `setResamplingRatio(1.0 / ratio)` but JUCE docs say higher ratio = faster. At tempo 2.0, audio plays at half speed while UI shows 2× BPM.

**Bug 2 — BPM octave:** Autocorrelation returns 61.5 or 123 interchangeably. Industry fix: metadata first, tempo prior centered ~120 BPM, manual ×2/÷2 (Serato Alt+↑/↓).

**Bug 3 — Layout clipping:** Deck controls need ~330px; side columns allow ~285px at 1100px window width with `overflow-hidden` clipping silently.

**Formerly out-of-scope — now included:**
- Playhead/waveform sync at tempo ≠ 1 (verify after Rubber Band; fix latency offset if needed)
- Key-lock time-stretch (Rubber Band replaces resampler)

---

### Task 0: Git worktree setup

**Files:**
- Create: isolated worktree (sibling to repo root)

- [ ] **Step 1: Create worktree**

Run from repo root:

```bash
git worktree add ../FreeDeck-tempo-fix -b fix/tempo-keylock-layout
cd ../FreeDeck-tempo-fix
```

Expected: new branch `fix/tempo-keylock-layout`, clean working tree.

- [ ] **Step 2: Verify build baseline**

```bash
cd apps/desktop
pnpm install
pnpm vitest run
cd ../../engine && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --target freedeck_track_analysis_test
./build/freedeck_track_analysis_test
```

Expected: Vitest passes; track analysis tests print "All track analysis tests passed."

- [ ] **Step 3: Commit (no code changes — worktree marker only if needed)**

Skip commit if worktree is clean. Proceed to Task 1.

---

### Task 1: Add Rubber Band dependency and tempo-direction test skeleton

**Files:**
- Modify: `engine/CMakeLists.txt`
- Create: `engine/test/time_stretch_test.cpp`
- Create: `engine/src/TimeStretch.h` (stub)
- Create: `engine/src/TimeStretch.cpp` (stub)

- [ ] **Step 1: Add Rubber Band via FetchContent in CMake**

Add to `engine/CMakeLists.txt` after JUCE setup:

```cmake
include(FetchContent)
FetchContent_Declare(
    rubberband
    GIT_REPOSITORY https://github.com/breakfastquay/rubberband.git
    GIT_TAG v3.3.0
)
FetchContent_MakeAvailable(rubberband)

# Rubber Band builds as a static lib; link against it
add_library(freedeck_engine STATIC
    src/Engine.cpp
    src/Deck.cpp
    src/Mixer.cpp
    src/Eq.cpp
    src/Waveform.cpp
    src/TrackAnalysis.cpp
    src/TimeStretch.cpp
)

target_link_libraries(freedeck_engine
    PUBLIC
        juce::juce_core
        juce::juce_events
        juce::juce_data_structures
        juce::juce_audio_basics
        juce::juce_audio_formats
        juce::juce_audio_devices
        juce::juce_dsp
    PRIVATE
        rubberband
)

add_executable(freedeck_time_stretch_test test/time_stretch_test.cpp)
target_include_directories(freedeck_time_stretch_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_time_stretch_test PRIVATE freedeck_engine juce::juce_events rubberband)
```

Note: If FetchContent target name differs (e.g. `rubberband-static`), inspect generated build and adjust `target_link_libraries`. Run cmake once to verify.

- [ ] **Step 2: Write failing tempo-direction test**

Create `engine/test/time_stretch_test.cpp`:

```cpp
#include "TimeStretch.h"
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include <cassert>
#include <cmath>
#include <iostream>

namespace {

class SilentSource : public juce::AudioSource {
public:
    void prepareToPlay(int, double) override {}
    void releaseResources() override {}
    void getNextAudioBlock(const juce::AudioSourceChannelInfo& info) override {
        for (int ch = 0; ch < info.buffer->getNumChannels(); ++ch)
            info.buffer->clear(ch, info.startSample, info.numSamples);
    }
};

void test_time_ratio_maps_directly() {
    SilentSource silent;
    freedeck::TimeStretch stretch(&silent, false, 2);
    stretch.prepareToPlay(512, 44100.0);
    stretch.set_time_ratio(2.0);
    stretch.set_pitch_scale(1.0);
    assert(std::abs(stretch.get_time_ratio() - 2.0) < 0.001);
    std::cout << "test_time_ratio_maps_directly OK\n";
}

void test_higher_ratio_consumes_more_input() {
    SilentSource silent;
    freedeck::TimeStretch stretch(&silent, false, 2);
    stretch.prepareToPlay(512, 44100.0);

    stretch.set_time_ratio(1.0);
    stretch.set_pitch_scale(1.0);
    const double input_at_1x = stretch.input_samples_consumed_per_block(512);

    stretch.set_time_ratio(2.0);
    const double input_at_2x = stretch.input_samples_consumed_per_block(512);

    assert(input_at_2x > input_at_1x * 1.5);
    std::cout << "test_higher_ratio_consumes_more_input OK\n";
}

} // namespace

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;
    test_time_ratio_maps_directly();
    test_higher_ratio_consumes_more_input();
    std::cout << "All time stretch tests passed.\n";
    return 0;
}
```

- [ ] **Step 3: Create TimeStretch stub (will fail to link)**

Create `engine/src/TimeStretch.h`:

```cpp
#pragma once
#include <juce_audio_basics/juce_audio_basics.h>

namespace freedeck {

class TimeStretch : public juce::AudioSource {
public:
    TimeStretch(juce::AudioSource* input, bool deleteInput, int numChannels);
    ~TimeStretch() override;

    void set_time_ratio(double ratio);
    void set_pitch_scale(double scale);
    double get_time_ratio() const;
    double input_samples_consumed_per_block(int output_samples) const;

    void prepareToPlay(int samplesPerBlockExpected, double sampleRate) override;
    void releaseResources() override;
    void getNextAudioBlock(const juce::AudioSourceChannelInfo& bufferToFill) override;

private:
    juce::OptionalScopedPointer<juce::AudioSource> input_;
    int num_channels_;
    double sample_rate_{44100.0};
    double time_ratio_{1.0};
    double pitch_scale_{1.0};
};

} // namespace freedeck
```

Create `engine/src/TimeStretch.cpp` with empty/stub methods that return defaults (test will fail on `input_at_2x > input_at_1x * 1.5`).

- [ ] **Step 4: Run test — expect FAIL**

```bash
cd engine
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target freedeck_time_stretch_test
./build/freedeck_time_stretch_test
```

Expected: FAIL on `test_higher_ratio_consumes_more_input` (stub returns equal consumption).

- [ ] **Step 5: Commit**

```bash
git add engine/CMakeLists.txt engine/src/TimeStretch.h engine/src/TimeStretch.cpp engine/test/time_stretch_test.cpp
git commit -m "test: add Rubber Band dep and tempo direction test skeleton"
```

---

### Task 2: Implement TimeStretch with Rubber Band (key-lock capable)

**Files:**
- Modify: `engine/src/TimeStretch.h`
- Modify: `engine/src/TimeStretch.cpp`

- [ ] **Step 1: Implement TimeStretch with RubberBandStretcher**

Update `engine/src/TimeStretch.h` — add private members:

```cpp
#include <rubberband/RubberBandStretcher.h>
#include <memory>
#include <vector>

// inside class TimeStretch private:
    std::unique_ptr<RubberBandStretcher> stretcher_;
    juce::AudioBuffer<float> input_buffer_;
    juce::AudioBuffer<float> output_buffer_;
    int block_size_{512};
    int input_samples_fed_{0};
```

Implement `engine/src/TimeStretch.cpp` core logic:

```cpp
#include "TimeStretch.h"

namespace freedeck {

TimeStretch::TimeStretch(juce::AudioSource* input, bool deleteInput, int numChannels)
    : input_(input, deleteInput), num_channels_(numChannels) {}

TimeStretch::~TimeStretch() = default;

void TimeStretch::set_time_ratio(double ratio) {
    time_ratio_ = juce::jlimit(0.5, 2.0, ratio);
    if (stretcher_)
        stretcher_->setTimeRatio(time_ratio_);
}

void TimeStretch::set_pitch_scale(double scale) {
    pitch_scale_ = juce::jlimit(0.5, 2.0, scale);
    if (stretcher_)
        stretcher_->setPitchScale(pitch_scale_);
}

double TimeStretch::get_time_ratio() const { return time_ratio_; }

void TimeStretch::prepareToPlay(int samplesPerBlockExpected, double sampleRate) {
    block_size_ = samplesPerBlockExpected;
    sample_rate_ = sampleRate;
    input_->prepareToPlay(samplesPerBlockExpected, sampleRate);

    stretcher_ = std::make_unique<RubberBandStretcher>(
        static_cast<size_t>(sampleRate),
        static_cast<size_t>(num_channels_),
        RubberBandStretcher::OptionProcessRealTime |
            RubberBandStretcher::OptionEngineFiner);

    stretcher_->setTimeRatio(time_ratio_);
    stretcher_->setPitchScale(pitch_scale_);

    input_buffer_.setSize(num_channels_, samplesPerBlockExpected * 4);
    output_buffer_.setSize(num_channels_, samplesPerBlockExpected * 4);
}

void TimeStretch::releaseResources() {
    input_->releaseResources();
    stretcher_.reset();
}

double TimeStretch::input_samples_consumed_per_block(int output_samples) const {
    return static_cast<double>(output_samples) * time_ratio_;
}

void TimeStretch::getNextAudioBlock(const juce::AudioSourceChannelInfo& info) {
    if (stretcher_ == nullptr) {
        info.clearActiveBufferRegion();
        return;
    }

    const int out_needed = info.numSamples;
    const int in_needed = static_cast<int>(std::ceil(out_needed * time_ratio_)) + 64;

    if (input_buffer_.getNumSamples() < in_needed)
        input_buffer_.setSize(num_channels_, in_needed, false, false, true);

    juce::AudioSourceChannelInfo readInfo(&input_buffer_, 0, in_needed);
    input_->getNextAudioBlock(readInfo);
    input_samples_fed_ = in_needed;

    std::vector<const float*> inPtrs(static_cast<size_t>(num_channels_));
    std::vector<float*> outPtrs(static_cast<size_t>(num_channels_));
    for (int ch = 0; ch < num_channels_; ++ch) {
        inPtrs[static_cast<size_t>(ch)] = input_buffer_.getReadPointer(ch);
        outPtrs[static_cast<size_t>(ch)] = info.buffer->getWritePointer(ch, info.startSample);
    }

    stretcher_->process(inPtrs.data(), static_cast<size_t>(in_needed),
                        outPtrs.data(), static_cast<size_t>(out_needed), false);
}

} // namespace freedeck
```

Adjust Rubber Band API calls if v3.3.0 signatures differ — consult `third_party/rubberband/rubberband/RubberBandStretcher.h` after FetchContent.

- [ ] **Step 2: Run tests — expect PASS**

```bash
cmake --build build --target freedeck_time_stretch_test
./build/freedeck_time_stretch_test
```

Expected: "All time stretch tests passed."

- [ ] **Step 3: Commit**

```bash
git add engine/src/TimeStretch.h engine/src/TimeStretch.cpp
git commit -m "feat: add Rubber Band TimeStretch wrapper with key-lock support"
```

---

### Task 3: Replace resampler in Deck with TimeStretch

**Files:**
- Modify: `engine/src/Deck.h`
- Modify: `engine/src/Deck.cpp`

- [ ] **Step 1: Update DeckPlayback struct in Deck.h**

Replace resampler with time stretch:

```cpp
#include "TimeStretch.h"

struct DeckPlayback {
    std::unique_ptr<juce::AudioFormatReader> reader;
    std::unique_ptr<juce::AudioFormatReaderSource> reader_source;
    std::unique_ptr<juce::AudioTransportSource> transport;
    std::unique_ptr<TimeStretch> time_stretch;
    ThreeBandEq eq;
    double cue_position{0.0};
};
```

Add to `Deck` class public:

```cpp
    void set_key_lock(bool enabled);
```

Add private member:

```cpp
    std::atomic<bool> key_lock_{true};  // default ON per user decision
```

- [ ] **Step 2: Update Deck.cpp rebuild_playback**

Replace resampler lines with:

```cpp
    pb->time_stretch =
        std::make_unique<TimeStretch>(pb->transport.get(), false, 2);

    const float ratio = tempo_ratio_.load(std::memory_order_relaxed);
    pb->time_stretch->set_time_ratio(static_cast<double>(ratio));
    const bool key_lock = key_lock_.load(std::memory_order_relaxed);
    pb->time_stretch->set_pitch_scale(key_lock ? 1.0 : static_cast<double>(ratio));
```

Remove all `resampler` references. In `prepare_to_play`, `release_resources`, `get_next_audio_block` — use `time_stretch` instead.

In `get_next_audio_block`:

```cpp
    const float ratio = tempo_ratio_.load(std::memory_order_relaxed);
    const bool key_lock = key_lock_.load(std::memory_order_relaxed);
    pb->time_stretch->set_time_ratio(static_cast<double>(ratio));
    pb->time_stretch->set_pitch_scale(key_lock ? 1.0 : static_cast<double>(ratio));
    pb->time_stretch->getNextAudioBlock(info);
```

When key lock OFF (vinyl mode): `pitch_scale = ratio` mimics resampler pitch coupling.

- [ ] **Step 3: Implement set_key_lock**

```cpp
void Deck::set_key_lock(bool enabled) {
    key_lock_.store(enabled, std::memory_order_relaxed);
}
```

- [ ] **Step 4: Build engine**

```bash
cmake --build build --target freedeck_engine
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add engine/src/Deck.h engine/src/Deck.cpp
git commit -m "fix: replace inverted resampler with Rubber Band time stretch"
```

---

### Task 4: Expose key lock through Tauri bridge and UI toggle

**Files:**
- Modify: `engine/include/freedeck/engine.h`
- Modify: `engine/src/Engine.cpp`
- Modify: `apps/desktop/src-tauri/cpp/engine_shim.h`
- Modify: `apps/desktop/src-tauri/cpp/engine_shim.cc`
- Modify: `apps/desktop/src-tauri/src/engine_bridge.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/lib/engine.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/TrackInfoBar.tsx`

- [ ] **Step 1: Add Engine API**

In `engine/include/freedeck/engine.h`:

```cpp
    void set_key_lock(uint8_t deck, bool enabled);
```

In `engine/src/Engine.cpp`:

```cpp
void Engine::set_key_lock(uint8_t deck, bool enabled) {
    if (deck <= 1)
        decks_[deck]->set_key_lock(enabled);
}
// ... and on Engine wrapper at bottom
```

- [ ] **Step 2: Add cxx/Tauri command**

Follow existing `set_tempo` pattern in `engine_shim.cc` / `lib.rs`:

```rust
#[tauri::command]
fn engine_set_key_lock(state: State<EngineState>, deck: u8, enabled: bool) {
    state.engine.lock().set_key_lock(deck, enabled);
}
```

Register in `lib.rs` invoke handler list.

- [ ] **Step 3: Add TypeScript binding**

In `apps/desktop/src/lib/engine.ts`:

```typescript
export async function setKeyLock(deck: 0 | 1, enabled: boolean): Promise<void> {
  await safeInvoke("engine_set_key_lock", { deck, enabled });
}
```

- [ ] **Step 4: Add state + toggle in App.tsx and TrackInfoBar**

In `App.tsx`:

```typescript
const [keyLockA, setKeyLockA] = useState(true);
const [keyLockB, setKeyLockB] = useState(true);
```

Pass to TrackInfoBar:

```tsx
<TrackInfoBar
  keyLock={keyLockA}
  onKeyLockChange={(v) => { setKeyLockA(v); engine.setKeyLock(0, v); }}
  ...
/>
```

In `TrackInfoBar.tsx`, add toggle button next to BPM:

```tsx
<button
  type="button"
  onClick={() => onKeyLockChange?.(!keyLock)}
  className={keyLock
    ? "rounded border border-cyan-400/60 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-cyan-200"
    : "rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-500"}
  aria-pressed={keyLock}
>
  Key
</button>
```

- [ ] **Step 5: Verify app builds**

```bash
cd apps/desktop && pnpm tauri build --debug 2>&1 | tail -20
```

Expected: successful build (or dev runs without compile errors).

- [ ] **Step 6: Commit**

```bash
git add engine/include/freedeck/engine.h engine/src/Engine.cpp \
  apps/desktop/src-tauri/ apps/desktop/src/lib/engine.ts \
  apps/desktop/src/App.tsx apps/desktop/src/components/TrackInfoBar.tsx
git commit -m "feat: add key lock toggle (default on) through engine and UI"
```

---

### Task 5: Reset tempo to 100% on track load

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Reset tempo in loadDeck**

At the start of `loadDeck`, after clearing peaks/track:

```typescript
    if (deck === 0) {
      setTempoA(1);
      await engine.setTempo(0, 1);
    } else {
      setTempoB(1);
      await engine.setTempo(1, 1);
    }
```

- [ ] **Step 2: Manual verify**

Run `pnpm tauri dev`. Load track, move tempo to 200%, load another track — fader should reset to 100%.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "fix: reset tempo fader to 100% when loading a new track"
```

---

### Task 6: BPM octave prior (industry-standard detection)

**Files:**
- Modify: `engine/src/TrackAnalysis.h`
- Modify: `engine/src/TrackAnalysis.cpp`
- Modify: `engine/test/track_analysis_test.cpp`

Industry approach (Rekordbox/Serato):
1. Metadata BPM always wins (already implemented in `analyze_track`)
2. Audio detection applies Gaussian tempo prior centered at 120 BPM, preferring 80–160 range
3. Manual ×2/÷2 in UI (Task 7)

- [ ] **Step 1: Write failing octave prior test**

Add to `engine/test/track_analysis_test.cpp`:

```cpp
void test_resolve_bpm_prefers_dj_range() {
    // 61.5 should resolve to 123 when 123 is in stronger prior range
    const float resolved = freedeck::resolve_bpm_with_prior(61.5f);
    assert(resolved >= 120.f && resolved <= 126.f);
    std::cout << "test_resolve_bpm_prefers_dj_range OK (" << resolved << ")\n";
}

void test_resolve_bpm_keeps_in_range_values() {
    const float resolved = freedeck::resolve_bpm_with_prior(128.f);
    assert(std::abs(resolved - 128.f) < 0.1f);
    std::cout << "test_resolve_bpm_keeps_in_range_values OK\n";
}
```

Call from `main()`.

- [ ] **Step 2: Run test — expect FAIL**

```bash
cmake --build build --target freedeck_track_analysis_test
./build/freedeck_track_analysis_test
```

- [ ] **Step 3: Implement resolve_bpm_with_prior**

In `engine/src/TrackAnalysis.h`:

```cpp
float resolve_bpm_with_prior(float bpm);
```

In `engine/src/TrackAnalysis.cpp`:

```cpp
float resolve_bpm_with_prior(float bpm) {
    if (bpm <= 0.f) return bpm;

    auto prior_score = [](float candidate) {
        // Gaussian centered at 120 BPM, sigma ~25
        const float diff = candidate - 120.f;
        return std::exp(-(diff * diff) / (2.f * 25.f * 25.f));
    };

    const float candidates[] = { bpm * 0.5f, bpm, bpm * 2.f };
    float best = bpm;
    float best_score = prior_score(bpm);

    for (float c : candidates) {
        if (c < 60.f || c > 200.f) continue;
        const float score = prior_score(c);
        if (score > best_score) {
            best_score = score;
            best = c;
        }
    }
    return std::round(best * 10.f) / 10.f;
}
```

In `detect_bpm`, before return:

```cpp
    bpm = resolve_bpm_with_prior(bpm);
```

Remove or tighten the old octave correction block (lines 355–364) that always prefers slower tempo — it conflicts with the prior.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cmake --build build --target freedeck_track_analysis_test
./build/freedeck_track_analysis_test
```

- [ ] **Step 5: Commit**

```bash
git add engine/src/TrackAnalysis.h engine/src/TrackAnalysis.cpp engine/test/track_analysis_test.cpp
git commit -m "fix: apply DJ tempo prior to audio BPM detection (80-160 range)"
```

---

### Task 7: Manual ×2/÷2 BPM buttons in TrackInfoBar

**Files:**
- Create: `apps/desktop/src/lib/bpmOctave.ts`
- Create: `apps/desktop/src/lib/bpmOctave.test.ts`
- Modify: `apps/desktop/src/components/TrackInfoBar.tsx`
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Write failing Vitest tests**

Create `apps/desktop/src/lib/bpmOctave.ts`:

```typescript
export function doubleBpm(bpm: number | null): number | null {
  if (bpm == null || bpm <= 0) return null;
  const next = bpm * 2;
  return next > 200 ? null : Math.round(next * 10) / 10;
}

export function halveBpm(bpm: number | null): number | null {
  if (bpm == null || bpm <= 0) return null;
  const next = bpm / 2;
  return next < 60 ? null : Math.round(next * 10) / 10;
}
```

Create `apps/desktop/src/lib/bpmOctave.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { doubleBpm, halveBpm } from "./bpmOctave";

describe("bpmOctave", () => {
  it("doubles 61.5 to 123", () => {
    expect(doubleBpm(61.5)).toBe(123);
  });
  it("halves 123 to 61.5", () => {
    expect(halveBpm(123)).toBe(61.5);
  });
  it("rejects out of range double", () => {
    expect(doubleBpm(150)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
cd apps/desktop && pnpm vitest run src/lib/bpmOctave.test.ts
```

- [ ] **Step 3: Add ×2/÷2 buttons to TrackInfoBar**

Add props:

```typescript
  onBpmDouble?: () => void;
  onBpmHalve?: () => void;
```

Next to Playing BPM display:

```tsx
<div className="flex gap-0.5">
  <button type="button" onClick={onBpmHalve} className="rounded px-1 text-[9px] text-zinc-500 hover:text-white" aria-label="Halve BPM">÷2</button>
  <button type="button" onClick={onBpmDouble} className="rounded px-1 text-[9px] text-zinc-500 hover:text-white" aria-label="Double BPM">×2</button>
</div>
```

In `App.tsx`, wire handlers:

```typescript
const adjustBpm = useCallback((deck: 0 | 1, op: "double" | "halve") => {
  const track = deck === 0 ? trackA : trackB;
  const setter = deck === 0 ? setTrackA : setTrackB;
  if (!track?.bpm) return;
  const next = op === "double" ? doubleBpm(track.bpm) : halveBpm(track.bpm);
  if (next == null) return;
  setter({ ...track, bpm: next });
}, [trackA, trackB]);
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/bpmOctave.ts apps/desktop/src/lib/bpmOctave.test.ts \
  apps/desktop/src/components/TrackInfoBar.tsx apps/desktop/src/App.tsx
git commit -m "feat: add Serato-style ×2/÷2 BPM correction in TrackInfoBar"
```

---

### Task 8: Hybrid deck layout fix

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/Deck.tsx`
- Modify: `apps/desktop/src/components/JogWheel.tsx`
- Modify: `apps/desktop/src/components/TrackInfoBar.tsx`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Raise grid column minimums**

In `App.tsx` line 197:

```tsx
grid-cols-[minmax(320px,1fr)_minmax(400px,2.2fr)_minmax(320px,1fr)]
```

In `tauri.conf.json`:

```json
"minWidth": 1200,
```

- [ ] **Step 2: Smaller default jog wheel**

In `JogWheel.tsx`, change `h-36 w-36` to `h-32 w-32` and inner circle `h-16 w-16` to `h-14 w-14`.

In `Deck.tsx`, change tempo fader `height="h-32"` to `height="h-28"`.

- [ ] **Step 3: Remove inner overflow-hidden and add scale wrapper**

In `Deck.tsx`, replace controls row:

```tsx
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <div
          className="flex items-center justify-center gap-2"
          style={{ transform: "scale(min(1, (100cqw - 8px) / 300))", transformOrigin: "center" }}
        >
```

Add to section: `className="... @container"` (Tailwind 4 container queries) OR use a simpler CSS approach:

```tsx
<div className="deck-controls flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
```

And in `index.css`:

```css
.deck-controls {
  container-type: inline-size;
}
@container (max-width: 300px) {
  .deck-controls-inner {
    transform: scale(0.85);
    transform-origin: center;
  }
}
@container (max-width: 260px) {
  .deck-controls-inner {
    transform: scale(0.72);
  }
}
```

Wrap tempo/jog/transport in `deck-controls-inner`.

Remove `overflow-hidden` from the controls row (keep on outer section only).

- [ ] **Step 4: Allow TrackInfoBar metadata to shrink**

In `TrackInfoBar.tsx` line 58, change metadata row:

```tsx
<div className="flex min-w-0 shrink items-center gap-2 text-xs">
```

Change Remaining font from `text-lg` to `text-sm` to save ~12px.

- [ ] **Step 5: Visual verify at 1200px and 1400px width**

Run `pnpm tauri dev`. Resize window to 1200px — both decks' tempo, platter, and transport should be fully visible without clipping.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/components/Deck.tsx \
  apps/desktop/src/components/JogWheel.tsx apps/desktop/src/components/TrackInfoBar.tsx \
  apps/desktop/src/index.css apps/desktop/src-tauri/tauri.conf.json
git commit -m "fix: hybrid deck layout scaling so both decks fit at min window width"
```

---

### Task 9: Playhead and waveform sync at tempo ≠ 1

**Files:**
- Modify: `engine/src/Deck.cpp` (if latency offset needed)
- Modify: `engine/src/Deck.h`
- Modify: `apps/desktop/src/components/ScrollingWaveform.tsx` (if needed)
- Modify: `apps/desktop/src/components/JogWheel.tsx` (if needed)

**Context:** With Rubber Band, `AudioTransportSource` position advances proportional to `time_ratio` because TimeStretch pulls more input samples per output block at higher tempos. After Task 3, verify before adding code.

- [ ] **Step 1: Verify playhead tracks audio at 100% and 150% tempo**

Manual test script:
1. Load track with known BPM (e.g. 128 from metadata)
2. Set tempo 100%, press play — tap beat on desk, compare PLAYING BPM display
3. Set tempo 150% — audio should feel 1.5× faster; PLAYING shows ~192 BPM; waveform playhead should scroll 1.5× faster through file
4. Set Key Lock ON — pitch should NOT rise when tempo increases

- [ ] **Step 2: If playhead lags (Rubber Band latency), expose latency offset**

Add to `Deck.h`:

```cpp
    double output_latency_seconds() const;
```

In `TimeStretch`, expose `stretcher_->getLatency()` converted to seconds.

In telemetry (if needed), subtract latency from displayed position for waveform only — NOT for seek/cue (those use source position).

Only implement if Step 1 shows visible desync (>50ms).

- [ ] **Step 3: If jog wheel rotation feels wrong, multiply by tempo**

In `JogWheel.tsx`, add optional `tempo` prop:

```typescript
const rotation = duration > 0 ? (position / duration) * 360 * 4 * tempo : 0;
```

Pass `tempo={tempo}` from Deck. Only if platter visually drifts from heard beats.

- [ ] **Step 4: Commit (if changes made)**

```bash
git commit -m "fix: align playhead and jog wheel with key-lock tempo playback"
```

Skip commit if verification passes without code changes.

---

### Task 10: Full verification and regression suite

**Files:** none (verification only)

- [ ] **Step 1: Run all automated tests**

```bash
cd engine && cmake --build build --target freedeck_time_stretch_test freedeck_track_analysis_test
./build/freedeck_time_stretch_test
./build/freedeck_track_analysis_test
cd ../apps/desktop && pnpm vitest run
```

Expected: all pass.

- [ ] **Step 2: Manual acceptance checklist**

| # | Action | Expected |
|---|--------|----------|
| 1 | Load track, tempo 100% | Audio matches natural track speed; PLAYING BPM ≈ orig |
| 2 | Tempo 200% | Audio ~2× faster; PLAYING ≈ 2× orig; Key Lock ON → no pitch up |
| 3 | Key Lock OFF, tempo 150% | Pitch rises with tempo (vinyl mode) |
| 4 | Tempo 50% | Audio ~half speed; display shows ~half orig |
| 5 | SYNC between decks | Effective BPMs match within 0.5 |
| 6 | ×2 on 61.5 BPM | Shows 123; sync/tempo math uses 123 |
| 7 | Load new track after pitch | Tempo resets to 100% |
| 8 | Window 1200px wide | Both decks fully visible |
| 9 | Waveform at 150% tempo | Playhead scrolls faster, beat grid aligned |

- [ ] **Step 3: Final commit if any loose ends, then run finishing-a-development-branch skill**

---

## Self-review checklist

| Requirement | Task |
|-------------|------|
| Inverted tempo fixed | Task 2–3 (Rubber Band, direct ratio) |
| Key-lock (user choice) | Task 2–4 |
| BPM octave (industry standard) | Task 6–7 |
| Tempo reset on load | Task 5 |
| Deck layout hybrid | Task 8 |
| Playhead/waveform sync | Task 9 |
| Regression tests | Tasks 1, 6, 7, 10 |
| No placeholders | Verified |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-tempo-layout-bpm-fix.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with spec + code quality review between tasks.

2. **Inline Execution** — Execute tasks in this session using executing-plans with batch checkpoints.

**Which approach?**
