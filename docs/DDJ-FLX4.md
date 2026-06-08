# DDJ-FLX4 Hardware Integration (Deferred)

Hardware control is **not included in v0**. The engine API is designed so MIDI can be added without breaking the UI or Rust bridge.

## Feasibility

The Pioneer DDJ-FLX4 is a **class-compliant USB MIDI device** on macOS. No vendor driver is required for MIDI control (Pioneer's driver is only needed for the built-in audio interface).

JUCE can open the controller via `juce::MidiInput` / CoreMIDI.

## Recommended integration path

```mermaid
flowchart LR
    FLX4[DDJ-FLX4 USB MIDI] --> MidiIn[JUCE MidiInput callback]
    MidiIn --> Map[MidiMapping table]
    Map --> Setters[Engine setters]
    Setters --> UI[Optional UI sync events]
```

### 1. MIDI capture session

With the FLX4 connected, add a debug mode that logs all incoming messages:

```cpp
void onMidiMessage(const juce::MidiMessage& msg) {
    DBG("MIDI: " << msg.getDescription());
}
```

Pioneer does not publish the FLX4 MIDI map publicly; the map must be captured from the device.

### 2. Default map (targets)

| Control | Engine API |
|---------|------------|
| Play / pause | `set_play(deck, bool)` |
| Cue | `cue(deck)` |
| Channel fader | `set_volume(deck, gain)` |
| Crossfader | `set_crossfader(position)` |
| EQ knobs | `set_eq(deck, band, db)` |
| Tempo slider | `set_tempo(deck, ratio)` |
| Jog wheel (later) | scratch / nudge DSP |

### 3. Engine hook

Add to `Engine::Impl` (non-audio thread only):

```cpp
juce::MidiInput::openDevice(deviceId, callback);
```

Route mapped CC/Note messages to the **same atomic setters** the React UI uses via Tauri commands. Never route MIDI through the WebView.

### 4. UI sync

When hardware moves a control, emit a Tauri event (e.g. `hardware-state`) so on-screen knobs/faders track the controller.

## Audio interface (optional, later)

Using the FLX4 as the master output device requires Pioneer's driver and selecting that device in `AudioDeviceManager::initialise()`. Headphone pre-cue is a separate Phase 5 item.

## v0 design guarantee

All transport and mixer state flows through these engine methods:

- `set_play`, `cue`, `seek`
- `set_volume`, `set_eq`, `set_tempo`, `set_crossfader`

MIDI integration only needs to call these — no API changes required.
