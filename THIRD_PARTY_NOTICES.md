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

---

For the license governing FreeDeck's original source code, see [LICENSE](LICENSE).
