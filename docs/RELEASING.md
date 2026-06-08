# FreeDeck Release Guide

How versions map to roadmap goals, what ships when, and the checklist for each release.

See [`ROADMAP.md`](../ROADMAP.md) for the full goal ladder.

---

## Versioning

FreeDeck uses [Semantic Versioning](https://semver.org/) with pre-release channels during alpha/beta:

| Channel | Format | Audience |
|---------|--------|----------|
| Internal alpha | `v0.2.0-alpha.N` | Developers, smoke tests |
| Public alpha | `v0.2.0-beta` | Early testers |
| Stable | `v1.0.0+` | General release |

Version is declared in three places (must match on release):

- `package.json` (root)
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`

---

## Release-to-milestone map

| Version | Roadmap goal | What ships |
|---------|--------------|------------|
| **v0.1.0** | G0 | 2-deck engine demo, one-shot TS sync, basic mixer UI |
| **v0.1.1** | G0b | Bipolar filter, trim/gain, engine snapshot telemetry, GeekDataPanel, DSP tests |
| **v0.2.0-alpha.1** | G1 P1 | C++ continuous phase lock, sync FFI commands, RT hardening |
| **v0.2.0-alpha.2** | G1 P2 | Phase meter, MASTER/SYNCED LEDs |
| **v0.2.0-beta** | G1 P3 | Quantize |
| **v0.2.1** | G1 P4 | Variable beatgrid array, persistence, edit UI MVP |
| **v0.3.0** | G2 | Real local library, hot cues, loops |
| **v0.4.0** | G3 | Remaining FX, headphone cue, recording |
| **v0.5.0** | G4 | Auto-Mix engine (USP) |
| **v1.0.0** | G5 | DDJ-FLX4 MIDI, 4-deck, macOS stable (signed + notarized) |
| **v2.0.0** | G6 | KMP mobile (iOS + Android), Supabase cloud sync |

**Current focus:** v0.2.0 (G1 Continuous Beat Sync). Do not tag v0.3.0 until G1 Definition of Done passes.

---

## Platform release order

1. **macOS** (primary) — all v0.x through v1.0
2. **Windows / Linux** — opportunistic via Tauri/JUCE when macOS is stable
3. **iOS + Android together** — v2.0 via KMP (not separate mobile releases)

---

## Per-release checklist

Run this checklist before every tagged release.

### 1. Code quality

- [ ] All engine tests pass:

```bash
cmake -B engine/build -G Ninja engine
cmake --build engine/build
ctest --test-dir engine/build --output-on-failure
```

- [ ] Frontend unit tests pass:

```bash
cd apps/desktop && pnpm test
```

- [ ] Desktop app builds without warnings:

```bash
cd apps/desktop && pnpm tauri build
```

- [ ] Zero dead-code warnings in Rust bridge (clean up unused `stop_audio`, `output_left/right` if still present)

### 2. Version bump

Update version string in all three files:

- `package.json`
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`

### 3. Changelog

- [ ] Add entry to [`CHANGELOG.md`](../CHANGELOG.md) under the new version heading
- [ ] Move items from `[Unreleased]` to the version section
- [ ] Date the release

### 4. Git hygiene

- [ ] All work landed via feature branch + PR (no large uncommitted blobs on `main`)
- [ ] Branch name matches scope (e.g. `feat/continuous-beat-sync`, `feat/filter-trim-telemetry`)

```bash
git checkout -b feat/your-feature
# ... work ...
git push -u origin HEAD
# open PR, review, merge
```

### 5. Tag and GitHub release

```bash
git tag -a v0.2.0-beta -m "v0.2.0-beta: continuous beat sync + quantize"
git push origin v0.2.0-beta
gh release create v0.2.0-beta --title "v0.2.0-beta" --notes-file CHANGELOG_SNIPPET.md
```

### 6. macOS distribution (v1.0+)

For stable releases only:

- [ ] Code-sign the `.app` bundle (Apple Developer certificate)
- [ ] Notarize with `notarytool`
- [ ] Staple notarization ticket
- [ ] Attach `.dmg` to GitHub release

Pre-v1.0 alpha/beta releases may ship unsigned `.app` bundles for internal testing.

---

## G1-specific release gates

Before tagging any v0.2.x release, verify the G1 Definition of Done items relevant to that phase. See [`ROADMAP.md`](../ROADMAP.md#g1--continuous-beat-sync).

### v0.2.0-alpha.1 gate (P1)

- [ ] Two tracks phase-lock for 5+ minutes without audible drift
- [ ] No re-seek on master tempo change while synced
- [ ] `sync_test.cpp` green
- [ ] No new mutex/alloc in audio callback sync path

### v0.2.0-alpha.2 gate (P2)

- [ ] Phase meter moves with live `sync_phase_error`
- [ ] MASTER/SYNCED LEDs reflect engine state

### v0.2.0-beta gate (P3)

- [ ] Quantize snaps waveform seek and cue to beat/bar
- [ ] `sync.test.ts` extended tests green

### v0.2.1 gate (P4)

- [ ] Variable-tempo track locks via beat array
- [ ] Beatgrid persists across reload
- [ ] `beatgrid_test.cpp` green

---

## Manual smoke test (every release)

1. Launch `pnpm tauri dev`
2. Load two tracks with known BPM onto Deck A and Deck B
3. Play both; verify audio, waveforms, meters
4. Adjust EQ, filter, trim, crossfader — verify audible response
5. Press SYNC on follower — verify phrase alignment + continuous hold
6. Change master tempo — verify smooth tracking, no seek jump
7. Run 10+ minutes — verify no drift (G1+)
8. Open GeekDataPanel — verify telemetry values update

---

## Related docs

- [`ROADMAP.md`](../ROADMAP.md) — goals and Definition of Done
- [`CHANGELOG.md`](../CHANGELOG.md) — version history
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — system design
