# GitHub Repo Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a private `pnixnoel/freedeck` GitHub repository with AGPL-3.0 licensing and a hardened `.gitignore`, then squash all current work into a single initial commit and push.

**Architecture:** Harden `.gitignore` and run a pre-push audit **before** any remote push — this is a JUCE + CMake + Rust/Tauri + pnpm monorepo with large build artifacts and secret-bearing env files. Licensing files (LICENSE, THIRD_PARTY_NOTICES) are added locally. The remote is created with `gh` but left empty until a verified squash commit is pushed.

**Tech Stack:** Git, GitHub CLI (`gh`), AGPL-3.0, JUCE submodule, Tauri v2, pnpm, CMake, Vitest.

---

## File map

| File | Responsibility |
|------|----------------|
| [`.gitignore`](.gitignore) | **Critical gate** — excludes build outputs, secrets, caches, user media; preserves test fixtures |
| [`LICENSE`](LICENSE) | Full AGPL-3.0 text with copyright header |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | JUCE dual-license + stack dependency notices |
| [`README.md`](README.md) | Clone URL, License section |
| [`package.json`](package.json) | `"license": "AGPL-3.0-or-later"` |
| [`apps/desktop/package.json`](apps/desktop/package.json) | Mirror license field |
| [`.gitmodules`](.gitmodules) | JUCE submodule pointer (already exists — do **not** gitignore) |
| `engine/test/fixtures/*.wav` | Small committed test audio — must stay tracked via gitignore exceptions |

### What must never reach GitHub

| Category | Examples | Risk |
|----------|----------|------|
| Build artifacts | `engine/build/`, `**/target/`, `apps/desktop/dist/`, `*.o`, `*.a`, `*.dylib` | Bloated repo, unusable clones |
| Dependencies | `node_modules/`, `.pnpm-store/` | Hundreds of MB |
| Secrets | `.env`, `.env.local`, `*.pem`, `*.key`, `credentials.json` | Security breach |
| Tauri generated | `apps/desktop/src-tauri/gen/` | Regenerated on build |
| User media | `*.mp3`, loose `*.wav` in repo root | Copyright + repo bloat |
| IDE/OS junk | `.DS_Store`, `.vscode/`, `.cursor/` | Noise |

### Current `.gitignore` gaps

The existing [`.gitignore`](.gitignore) covers basics (`node_modules/`, `engine/build/`, `target/`, `dist/`, `.env`) but is missing:

- Recursive `**/.DS_Store` and `**/.vscode/` (nested `.DS_Store` under `apps/` is currently untracked but not pattern-covered)
- `**/.vite/` and Vitest cache outside `node_modules/`
- `coverage/` from Vitest
- C/C++ artifact globs (`*.o`, `*.a`, `*.dylib`, etc.) if CMake outputs land outside `engine/build/`
- Secret patterns beyond `.env` (`.env.*`, keys, certs)
- User-dropped DJ media at repo root (`*.mp3`, etc.) with exception for `engine/test/fixtures/`
- `.cursor/` session state
- Log files (`*.log`, `pnpm-debug.log*`)
- Tauri bundle artifacts at repo root (`*.dmg`, `*.app` if copied out of `target/`)

---

### Task 1: Harden root `.gitignore`

**Files:**
- Modify: [`.gitignore`](.gitignore) (replace entire file)

- [ ] **Step 1: Replace `.gitignore` with hardened content**

```gitignore
# ── Dependencies ──────────────────────────────────────────────
node_modules/
.pnpm-store/

# ── Frontend build / cache ────────────────────────────────────
apps/desktop/dist/
**/.vite/
coverage/
*.local

# ── Rust / Tauri ──────────────────────────────────────────────
**/target/
apps/desktop/src-tauri/gen/

# ── C++ / CMake ───────────────────────────────────────────────
engine/build/
CMakeCache.txt
CMakeFiles/
cmake_install.cmake
compile_commands.json
Makefile
build.ninja
.ninja_deps
.ninja_log

# C/C++ artifacts (safety net outside ignored build dirs)
*.o
*.obj
*.a
*.lib
*.dylib
*.dll
*.so
*.exe

# ── Tauri bundle outputs (if copied outside target/) ──────────
*.dmg
*.msi
*.AppImage
*.deb

# ── Secrets — NEVER commit ────────────────────────────────────
.env
.env.*
!.env.example
*.pem
*.key
*.p12
credentials.json
**/secrets/

# ── User media (DJ libraries dropped in repo root) ────────────
# Keep engine test fixtures — they are small and required for C++ tests.
/*.mp3
/*.wav
/*.flac
/*.m4a
/*.ogg
/*.aiff
/*.aif
!engine/test/fixtures/

# ── IDE / editor ──────────────────────────────────────────────
.idea/
.vscode/
.cursor/
*.swp
*.swo

# ── OS ────────────────────────────────────────────────────────
.DS_Store
**/.DS_Store
Thumbs.db
Desktop.ini

# ── Logs ──────────────────────────────────────────────────────
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# ── Rust backup ───────────────────────────────────────────────
**/*.rs.bk
```

- [ ] **Step 2: Verify patterns match known build dirs**

Run:

```bash
cd /Users/icedrip/Desktop/FreeDeck

# Each must print a matching .gitignore rule:
git check-ignore -v node_modules/.keep 2>/dev/null || \
  git check-ignore -v node_modules 2>/dev/null
git check-ignore -v engine/build/CMakeCache.txt
git check-ignore -v apps/desktop/dist/index.html
git check-ignore -v apps/desktop/src-tauri/target/CACHEDIR.TAG
git check-ignore -v apps/desktop/src-tauri/gen/schemas/capabilities.json
git check-ignore -v .env.local
git check-ignore -v apps/desktop/.DS_Store
```

Expected: each path is matched by a rule in `.gitignore`.

- [ ] **Step 3: Verify test fixtures are NOT ignored**

Run:

```bash
git check-ignore -v engine/test/fixtures/tone_a.wav
```

Expected: **exit code 1** (not ignored). These files must remain committable.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: harden gitignore for Tauri, CMake, secrets, and user media"
```

---

### Task 2: Pre-push audit (mandatory gate before squash)

**Files:**
- None created — verification only

- [ ] **Step 1: Scan for tracked files that should be ignored**

Run:

```bash
cd /Users/icedrip/Desktop/FreeDeck

# Flag tracked binaries, env files, or build artifacts
git ls-files | rg -i '\.(dylib|so|dll|exe|o|a|wasm|env|pem|key|log|dmg|app)$' || true

# Flag large tracked files over 1 MB (excluding submodule)
git ls-files -z | while IFS= read -r -d '' f; do
  [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")" -gt 1048576 ] && echo "$f"
done
```

Expected: only `engine/test/fixtures/*.wav` (small) and third-party/submodule paths if any; **no** `.env`, **no** `target/` or `dist/` files, **no** multi-MB accidental binaries in FreeDeck-owned paths.

- [ ] **Step 2: Dry-run staging and inspect what would be committed**

Run:

```bash
git add -A --dry-run | head -80
echo "---"
git add -A --dry-run | wc -l
```

Expected: **zero** lines mentioning `node_modules/`, `target/`, `engine/build/`, `dist/`, `.env`, `.DS_Store`, or `src-tauri/gen/`.

- [ ] **Step 3: If any bad files are tracked, remove from index**

If Step 1 found tracked build artifacts or secrets:

```bash
# Example — adjust paths to match findings:
git rm -r --cached apps/desktop/dist/ 2>/dev/null || true
git rm --cached .env 2>/dev/null || true
git rm --cached **/.DS_Store 2>/dev/null || true
```

Then re-run Steps 1–2 until clean.

---

### Task 3: Create private GitHub repo (no push)

**Files:**
- Remote: `origin` → `git@github.com:pnixnoel/freedeck.git`

- [ ] **Step 1: Create repo via GitHub CLI**

Run:

```bash
cd /Users/icedrip/Desktop/FreeDeck

gh repo create freedeck \
  --private \
  --owner pnixnoel \
  --description "High-performance cross-platform DJ application" \
  --source=. \
  --remote=origin
```

Expected: `Created repository pnixnoel/freedeck` — **no push**.

- [ ] **Step 2: Verify remote**

Run:

```bash
git remote -v
gh repo view pnixnoel/freedeck --json visibility,name -q '.visibility + " " + .name'
```

Expected: `origin git@github.com:pnixnoel/freedeck.git` and `PRIVATE freedeck`.

---

### Task 4: Add AGPL-3.0 LICENSE

**Files:**
- Create: [`LICENSE`](LICENSE)

- [ ] **Step 1: Download and customize AGPL-3.0**

Run:

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE

# Prepend copyright (insert at line 1):
# Copyright (C) 2026 pnixnoel
#
# (blank line, then existing AGPL text)
```

The first lines of `LICENSE` must read:

```
Copyright (C) 2026 pnixnoel

                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007
...
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add AGPL-3.0 license"
```

---

### Task 5: Add THIRD_PARTY_NOTICES

**Files:**
- Create: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)

- [ ] **Step 1: Create notices file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add THIRD_PARTY_NOTICES.md
git commit -m "chore: add third-party license notices"
```

---

### Task 6: Update README and package metadata

**Files:**
- Modify: [`README.md`](README.md)
- Modify: [`package.json`](package.json)
- Modify: [`apps/desktop/package.json`](apps/desktop/package.json)

- [ ] **Step 1: Fix clone URL in README**

In [`README.md`](README.md), replace:

```bash
git clone --recurse-submodules <repo-url>
```

with:

```bash
git clone --recurse-submodules git@github.com:pnixnoel/freedeck.git
```

- [ ] **Step 2: Add License section to README**

Append to [`README.md`](README.md):

```markdown
## License

FreeDeck is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This project uses the [JUCE](https://juce.com) framework (submodule). JUCE is dual-licensed under AGPL-3.0 and a commercial license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
```

- [ ] **Step 3: Add license fields to package.json files**

In [`package.json`](package.json), add after `"description"`:

```json
"license": "AGPL-3.0-or-later",
```

In [`apps/desktop/package.json`](apps/desktop/package.json), add after `"version"`:

```json
"license": "AGPL-3.0-or-later",
```

- [ ] **Step 4: Commit**

```bash
git add README.md package.json apps/desktop/package.json
git commit -m "docs: add license metadata and GitHub clone URL"
```

---

### Task 7: Squash all work and push as first commit

**Files:**
- Git history rewritten to single commit on `main`

**Preconditions:** Tasks 1–6 complete; Task 2 audit passes; WIP builds (`pnpm test`, `pnpm tauri dev` smoke test).

- [ ] **Step 1: Re-run pre-push audit (Task 2)**

Must pass before continuing.

- [ ] **Step 2: Squash via orphan branch**

```bash
cd /Users/icedrip/Desktop/FreeDeck

git add -A
git checkout --orphan main
git add -A

git commit -m "$(cat <<'EOF'
feat: FreeDeck v0 — JUCE engine + Tauri + React desktop DJ app

Initial release: dual-deck playback, waveforms, mixer, crossfader,
tempo/keylock, and track analysis. Licensed under AGPL-3.0.
EOF
)"
```

- [ ] **Step 3: Final staged-file sanity check**

Run:

```bash
git ls-tree -r HEAD --name-only | rg -i '(node_modules|/target/|engine/build|/dist/|\.env|\.DS_Store|src-tauri/gen/)' && echo "FAIL: bad paths in commit" || echo "PASS: commit tree clean"
```

Expected: `PASS: commit tree clean`

- [ ] **Step 4: Push to private remote**

```bash
git push -u origin main
```

Expected: remote has exactly **one commit**; repo remains **private**.

- [ ] **Step 5: Verify on GitHub**

Run:

```bash
gh repo view pnixnoel/freedeck --json visibility,defaultBranchRef -q '.visibility + " commits=" + (.defaultBranchRef.target.history.totalCount|tostring)'
```

Expected: `PRIVATE commits=1`

---

## Self-review checklist

| Requirement | Task |
|-------------|------|
| Hardened `.gitignore` before push | Task 1 |
| Pre-push audit gate | Task 2, Step 1 in Task 7 |
| Private GitHub repo | Task 3 |
| AGPL-3.0 LICENSE | Task 4 |
| JUCE third-party notice | Task 5 |
| README + package.json license | Task 6 |
| Single squashed first commit | Task 7 |
| Test fixtures remain committable | Task 1 Step 3 |
| JUCE submodule not gitignored | File map note |

---

## Future open-source (no action now)

When ready to go public: GitHub Settings → Change visibility → Public. AGPL + THIRD_PARTY_NOTICES already in place.
