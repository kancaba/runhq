# Releasing & Distribution

This document describes how RunHQ releases are cut, how versions propagate across the monorepo, and how users install the application across macOS, Windows, and Linux.

RunHQ uses **[Release Please](https://github.com/googleapis/release-please)** to automate versioning and changelog generation from [Conventional Commits](https://www.conventionalcommits.org/). You almost never bump a version by hand.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Versioning Policy](#versioning-policy)
- [Conventional Commits Cheat Sheet](#conventional-commits-cheat-sheet)
- [Normal Release Flow](#normal-release-flow)
  - [1. Land commits on `main`](#1-land-commits-on-main)
  - [2. Release Please opens a Release PR](#2-release-please-opens-a-release-pr)
  - [3. Merging the Release PR](#3-merging-the-release-pr)
  - [4. Binary build & publish](#4-binary-build--publish)
- [Prerequisites (one-time setup)](#prerequisites-one-time-setup)
- [Manual Overrides](#manual-overrides)
  - [Forcing a specific version](#forcing-a-specific-version)
  - [Cutting an emergency hotfix](#cutting-an-emergency-hotfix)
  - [Pre-releases / release candidates](#pre-releases--release-candidates)
- [Distribution Channels](#distribution-channels)
  - [GitHub Releases](#github-releases)
  - [Homebrew (macOS)](#homebrew-macos)
  - [Winget (Windows)](#winget-windows)
  - [Linux](#linux)
- [Auto-Update System](#auto-update-system)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Developer pushes conventional commits to `main`
       │
       ▼
┌──────────────────────────────┐
│  release-please.yml workflow │
│  analyses commits since tag  │
└──────────┬───────────────────┘
           │
           ▼  (opens/updates a single rolling "Release PR")
┌──────────────────────────────┐
│  Release PR                  │
│  • version bumped in 5 files │
│  • CHANGELOG.md updated      │
└──────────┬───────────────────┘
           │   Maintainer reviews → merges
           ▼
┌──────────────────────────────┐
│  release-please              │
│  • creates git tag  v0.x.y   │
│  • creates GitHub Release    │
└──────────┬───────────────────┘
           │   Release published event
           ▼
┌──────────────────────────────┐
│  release.yml CI              │
│  builds installers in parallel│
│  (macOS ARM + x64, Linux, Win)│
└──────────┬───────────────────┘
           │
           ├──► Uploads DMG / MSI / EXE / DEB / AppImage to the Release
           │
           ├──► Uploads signed `latest.json` (Tauri updater manifest)
           │
           └──► Auto-updates the Homebrew tap (erdembas/homebrew-runhq)

Installed apps auto-update by polling the Cloudflare-proxied endpoint:
    https://runhq.dev/api/updates/latest   →  proxies to `latest.json`
```

---

## Versioning Policy

RunHQ follows **[Semantic Versioning 2.0.0](https://semver.org/)**: `MAJOR.MINOR.PATCH`.

| Change                                      | Pre-1.0 behaviour                | Post-1.0 behaviour |
| ------------------------------------------- | -------------------------------- | ------------------ |
| `feat:`                                     | Bumps MINOR                      | Bumps MINOR        |
| `fix:`, `perf:`, `refactor:`                | Bumps PATCH                      | Bumps PATCH        |
| `feat!:` or `BREAKING CHANGE:` footer       | Bumps MINOR (pre-1.0 convention) | Bumps MAJOR        |
| `docs:`, `chore:`, `ci:`, `test:`, `style:` | No bump                          | No bump            |

The single source of truth for the current version is `.github/.release-please-manifest.json`. Release Please keeps the following five files in sync from there:

- `package.json` (root)
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml` (anchored by `# x-release-please-version`)
- `crates/runhq-core/Cargo.toml` (anchored by `# x-release-please-version`)

**Do not edit these version fields manually.** Let Release Please do it — otherwise the manifest drifts out of sync and the next release will misbehave.

---

## Conventional Commits Cheat Sheet

Every commit on `main` should follow this format:

```
<type>(<scope>): <short imperative subject>

<optional body explaining the "why">

<optional footer, e.g. `BREAKING CHANGE:` or `Refs: #123`>
```

### Common types

| Type       | When to use                                 | Example                                             |
| ---------- | ------------------------------------------- | --------------------------------------------------- |
| `feat`     | User-facing new capability                  | `feat(desktop): add service group quick switcher`   |
| `fix`      | Bug fix visible to users                    | `fix(core): handle orphan child processes on Linux` |
| `perf`     | Performance improvement                     | `perf(scanner): cache directory reads`              |
| `refactor` | Internal restructuring, no behaviour change | `refactor(ipc): extract dispatch into trait`        |
| `docs`     | Documentation only                          | `docs(readme): clarify install steps`               |
| `test`     | Test-only changes                           | `test(core): cover SIGTERM reaping`                 |
| `build`    | Build system / toolchain                    | `build: migrate Tailwind v3 → v4`                   |
| `ci`       | CI/CD pipeline changes                      | `ci: add release-please workflow`                   |
| `chore`    | Housekeeping, deps, configs                 | `chore(deps): bump tauri 2.1 → 2.2`                 |
| `style`    | Formatting, no logic                        | `style: apply prettier to docs/`                    |
| `revert`   | Reverting a prior commit                    | `revert: feat(desktop): drop group switcher`        |

### Scopes used in this repo

- `desktop` — anything in `apps/desktop/src/**`
- `core` — anything in `crates/runhq-core/**`
- `tauri` — anything in `apps/desktop/src-tauri/**`
- `docs` — content under `docs/**`
- `ci`, `deps`, `build` — self-explanatory

### Breaking changes

Either append `!` after the type/scope **or** add a `BREAKING CHANGE:` footer:

```
feat(core)!: rename RunConfig to ServiceConfig

BREAKING CHANGE: The Rust struct `RunConfig` has been renamed to
`ServiceConfig`. All consumers must update imports.
```

Both forms trigger a MAJOR bump (after 1.0).

---

## Normal Release Flow

This is the happy path you'll use 95% of the time. You do **not** run any release commands manually.

### 1. Land commits on `main`

Work on a feature branch, open a PR, merge it with **squash-merge** so that the commit on `main` uses the PR title as its commit message. The `Validate PR title` check enforces Conventional Commits on PR titles.

```bash
git checkout -b feat/service-groups
# ... work, commit ...
git push -u origin feat/service-groups
gh pr create --fill
# after review, squash-merge from GitHub UI
```

> ⚠️ **Do not** rewrite or edit the commit subject when squashing. Release Please reads the exact Conventional Commit wording to decide version bumps and generate the changelog.

### 2. Release Please opens a Release PR

As soon as a qualifying commit (`feat:`, `fix:`, `perf:`, etc.) lands on `main`, the `release-please.yml` workflow:

1. Walks the git history since the previous tag (e.g. `v0.1.0`).
2. Aggregates the commits and computes the next version.
3. Opens (or updates, if already open) a single Release PR titled:

   ```
   chore: release 0.2.0
   ```

   The PR body contains the auto-generated changelog. Its diff touches only:
   - `CHANGELOG.md` (new section at the top)
   - The five version fields listed in [Versioning Policy](#versioning-policy)
   - `.github/.release-please-manifest.json`

You can keep merging more `feat:` / `fix:` commits onto `main` while the Release PR is open — Release Please will keep updating both the version and the changelog on the PR in place. The Release PR is a **rolling, batched release candidate**.

### 3. Merging the Release PR

When you decide the batch is ready to ship:

1. Open the Release PR, re-read the generated changelog.
2. Make sure all required status checks are green (CI, Cloudflare Pages preview, etc.).
3. **Squash-merge** the Release PR.

Release Please reacts to the merge by:

- Creating a git tag `vX.Y.Z` pointing at the merge commit.
- Creating a **published** GitHub Release with the changelog as its body.
- Marking the Release PR as closed.

### 4. Binary build & publish

The published GitHub Release triggers `release.yml`:

1. Builds in parallel: **macOS** (aarch64 + x86_64), **Linux** (amd64), **Windows**.
2. Uploads the installers to the same GitHub Release:
   - `RunHQ_{ver}_aarch64.dmg`, `RunHQ_{ver}_x64.dmg`
   - `RunHQ_{ver}_x64_en-US.msi`, `RunHQ_{ver}_x64-setup.exe`
   - `RunHQ_{ver}_amd64.deb`, `RunHQ_{ver}_amd64.AppImage`
3. Generates and signs `latest.json` (the Tauri updater manifest) and attaches it.
4. Pushes the updated Cask to `erdembas/homebrew-runhq`.

Once assets are uploaded, installed apps on user machines pick up the update through the [Auto-Update System](#auto-update-system) on their next launch.

> 💡 If you want to sanity-check before users see the release, you can toggle `"draft": true` in `.github/release-please-config.json`. In that mode the Release is created as a draft and you must click **Publish** manually in the GitHub UI.

---

## Prerequisites (one-time setup)

These steps only need to happen once per repo / per maintainer machine.

### 1. Generate signing keys

Tauri v2 updater requires signed update artifacts.

```bash
pnpm --filter @runhq/desktop tauri signer generate -w ~/.tauri/RunHQ.key
```

This outputs a **public key** and a **private key** (encrypted with a password you choose).

### 2. Add GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                               | Value                                                          |
| ------------------------------------ | -------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | The private key content from step 1                            |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you chose                                         |
| `HOMEBREW_TAP_TOKEN`                 | A PAT with `repo` scope (to push to `erdembas/homebrew-runhq`) |

### 3. Set the public key in config

Open `apps/desktop/src-tauri/tauri.conf.json` and set the `pubkey` to the public key from step 1:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
  }
}
```

### 4. Create the Homebrew tap repository

1. Create a new GitHub repo: `erdembas/homebrew-runhq`.
2. Add a `Casks/` directory.
3. Copy `scripts/homebrew-cask-template.rb` as `Casks/runhq.rb`.

The release workflow will auto-update this file on every release.

### 5. Create the baseline tag

Release Please computes bumps relative to the previous tag. The very first time you enable it, create a baseline tag matching the current manifest:

```bash
git tag -a v0.1.0 -m "Initial baseline release"
git push origin v0.1.0
```

After this, Release Please will open its first Release PR as soon as the next `feat:` / `fix:` commit lands.

---

## Manual Overrides

Use these sparingly. They exist for genuine edge cases.

### Forcing a specific version

Append a `Release-As:` trailer to any commit message on `main`:

```bash
git commit --allow-empty -m "chore: cut 1.0.0

Release-As: 1.0.0"
git push origin main
```

Release Please will open a Release PR bumping directly to `1.0.0`, regardless of what the commit history would otherwise imply. Use this to:

- Promote from `0.x` to `1.0.0` when the API is stable.
- Jump to a marketing-aligned version.
- Recover from a botched version that needs to be skipped.

### Cutting an emergency hotfix

If a critical `fix:` needs to ship **now** without waiting for batched commits:

1. Land the `fix:` commit on `main`.
2. Wait ~1 minute for Release Please to open/update the Release PR.
3. Squash-merge the Release PR immediately.

The binary build pipeline takes over from there.

### Pre-releases / release candidates

Not currently wired up. To enable, set `"prerelease": true` in `.github/release-please-config.json` and use a `Release-As:` trailer like `Release-As: 1.0.0-rc.1`. Tags of the form `vX.Y.Z-rc.N` are treated as pre-releases by GitHub and should be excluded from the `latest.json` feed manually (or via a dedicated pre-release channel — future work).

---

## Distribution Channels

### GitHub Releases

Every release includes:

| Platform              | Files                                                 | Install                         |
| --------------------- | ----------------------------------------------------- | ------------------------------- |
| macOS (Apple Silicon) | `RunHQ_{ver}_aarch64.dmg`                             | Open DMG → drag to Applications |
| macOS (Intel)         | `RunHQ_{ver}_x64.dmg`                                 | Open DMG → drag to Applications |
| Windows               | `RunHQ_{ver}_x64_en-US.msi` / `.exe`                  | Double-click installer          |
| Linux                 | `RunHQ_{ver}_amd64.deb`, `RunHQ_{ver}_amd64.AppImage` | `dpkg -i` or `chmod +x && ./`   |

### Homebrew (macOS)

```bash
brew tap erdembas/runhq
brew install --cask RunHQ
```

Users update with:

```bash
brew upgrade --cask RunHQ
```

The Cask file is automatically updated by the release workflow.

### Winget (Windows)

After the first release is published:

```bash
./scripts/generate-winget-manifest.sh 0.1.0
```

This creates manifest YAML files under `winget-manifests/`. Then:

1. Fork `https://github.com/microsoft/winget-pkgs`.
2. Copy the manifests to `manifests/e/erdembas/RunHQ/{version}/`.
3. Replace `{REPLACE_WITH_PRODUCT_CODE_GUID}` in the installer manifest (use `orca` or `lessmsi` to extract from the MSI).
4. Open a PR against `winget-pkgs`.

Once merged, users can install with:

```powershell
winget install erdembas.RunHQ
```

### Linux

The CI produces both `.deb` and `.AppImage`:

```bash
# Debian/Ubuntu
sudo dpkg -i RunHQ_0.1.0_amd64.deb

# Any distro (AppImage)
chmod +x RunHQ_0.1.0_amd64.AppImage
./RunHQ_0.1.0_amd64.AppImage
```

---

## Auto-Update System

RunHQ uses the built-in Tauri v2 updater. After the initial install:

1. On every app launch, the frontend calls `check()` from `@tauri-apps/plugin-updater`.
2. If a new version is available, a banner appears: "RunHQ X.Y.Z available — Update & Restart".
3. Clicking the button downloads the new installer, verifies its signature, installs, and relaunches the app.

The updater endpoints (in order, with automatic fallback) are:

1. `https://runhq.dev/api/updates/latest` — Cloudflare Pages Function that proxies the GitHub manifest, adds edge caching, and isolates clients from GitHub rate limits.
2. `https://github.com/erdembas/runhq/releases/latest/download/latest.json` — direct fallback to the GitHub Release asset.

The `latest.json` file is generated automatically by `tauri-apps/tauri-action` during `release.yml` and signed with the private key stored in `TAURI_SIGNING_PRIVATE_KEY`.

---

## Troubleshooting

### Release PR didn't appear after a `feat:` / `fix:` commit

- Check the **Actions → Release Please** run for errors.
- Verify the commit subject on `main` actually follows Conventional Commits (squash-merges sometimes drop the format).
- Ensure `.github/.release-please-manifest.json` exists and is valid JSON.
- Ensure a baseline tag (e.g. `v0.1.0`) exists and points into the main branch history.

### Release PR has no version bump / empty changelog

- Only `feat:`, `fix:`, `perf:`, `refactor:`, `revert:`, `docs:`, `build:` appear in the changelog by default. `chore:` / `ci:` / `test:` / `style:` are hidden (see `changelog-sections` in `release-please-config.json`).
- If every commit since the last tag is hidden, Release Please won't open a PR.

### Versions are out of sync across files

This can happen if someone hand-edited a version field. To recover:

1. Decide the correct current version.
2. Set it in `.github/.release-please-manifest.json` and all five tracked files manually.
3. Commit as `chore: resync version manifests` on `main`.
4. The next `feat:` / `fix:` commit will bring the Release PR back in sync.

### Release CI failed

Check the workflow logs in **Actions → Release**. Common issues:

- Missing `TAURI_SIGNING_PRIVATE_KEY` secret.
- Linux dependency installation failure (transient apt issues — just re-run the job).
- Frontend build errors (run `pnpm typecheck && pnpm build` locally first).

### Homebrew tap not updated

- Verify `HOMEBREW_TAP_TOKEN` is valid and has `repo` scope.
- Verify `erdembas/homebrew-runhq` exists with a `Casks/` directory.

### Updater not working on installed app

- Ensure `createUpdaterArtifacts: "v2Compatible"` is in `tauri.conf.json`.
- Ensure the public key in `tauri.conf.json` matches the private key in secrets.
- Check that `latest.json` exists in the GitHub Release assets and returns HTTP 200 from both updater endpoints:

  ```bash
  curl -s https://runhq.dev/api/updates/latest | head -c 200
  curl -sL https://github.com/erdembas/runhq/releases/latest/download/latest.json | head -c 200
  ```

- If the proxy endpoint returns a 502, check Cloudflare Pages Function logs — most failures come from upstream rate limits or an outage on GitHub.
