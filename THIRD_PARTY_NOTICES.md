# Third-Party Notices

FreeDeck includes or depends on the following third-party software.

## JUCE Framework

- **Location:** `third_party/JUCE` (git submodule)
- **Project:** https://github.com/juce-framework/JUCE
- **License:** Dual-licensed under [AGPL-3.0](third_party/JUCE/LICENSE.md) and the [commercial JUCE license](https://juce.com/legal/juce-8-licence/)

If you build or distribute FreeDeck without a commercial JUCE license, you must comply with the AGPL-3.0 terms for the combined work. See JUCE's license file for full details.

Clone this repository with submodules:

```bash
git clone --recurse-submodules git@github.com:pnixnoel/freedeck.git
```

## Tauri

- **Location:** `apps/desktop/src-tauri/`
- **Project:** https://github.com/tauri-apps/tauri
- **License:** Apache-2.0 / MIT (per crate — see `Cargo.lock`)

## React, Vite, Tailwind CSS

- **Location:** `apps/desktop/`
- **Licenses:** MIT

## Rubber Band Library

- **Location:** Linked by CMake in `engine/` (via `build.rs`)
- **Project:** https://breakfastquay.com/rubberband/
- **License:** GPL-2.0 (verify version bundled by your CMake config)

## Aubio (optional)

- **Location:** Optional external dependency (`FREEDECK_USE_AUBIO=ON` in CMake)
- **Project:** https://aubio.org/
- **License:** GPL-3.0
- **Packaging strategy:** **Dynamic linking** via system `libaubio` (PkgConfig). Release builds ship with Aubio **disabled by default**; enable only after a licensing audit. Runtime failure or low-confidence results fall back to the built-in analyzer.
- **Build Instructions:**
  Install Aubio on your system (e.g., `brew install aubio` on macOS or `sudo apt install libaubio-dev` on Debian/Ubuntu). Run CMake with the `-DFREEDECK_USE_AUBIO=ON` flag.
- **Licensing Implications:**
  Aubio is licensed under the GPL-3.0. Linking Aubio with FreeDeck creates a combined work that is subject to the terms of the GPL-3.0. FreeDeck's own code is licensed under the AGPL-3.0, which is compatible with the GPL-3.0. If you distribute a compiled version of FreeDeck linked with Aubio, you must distribute the source code under the GPL-3.0. If you compile FreeDeck without Aubio, the GPL-3.0 restriction does not apply.

## Essentia (optional)

- **Location:** Optional external dependency (`FREEDECK_USE_ESSENTIA=ON` in CMake)
- **Project:** https://essentia.upf.edu/
- **License:** AGPL-3.0
- **Packaging strategy:** **Dynamic linking** via system `libessentia` (PkgConfig). Release builds ship with Essentia **disabled by default**. Do not bundle non-commercial ML models unless separately licensed. Failure falls back to Aubio (if enabled), then the built-in analyzer.
- **Build Instructions:**
  Install Essentia on your system. Run CMake with the `-DFREEDECK_USE_ESSENTIA=ON` flag.
- **Licensing Implications:**
  Essentia is licensed under the AGPL-3.0. Linking Essentia with FreeDeck creates a combined work that is subject to the terms of the AGPL-3.0 (which matches FreeDeck's own primary license).

---

For the license governing FreeDeck's original source code, see [LICENSE](LICENSE).
