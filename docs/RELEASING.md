# Releasing & Distribution

This document describes how to publish RunHQ releases and how users install the application across macOS, Windows, and Linux.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites (one-time setup)](#prerequisites-one-time-setup)
- [Publishing a Release](#publishing-a-release)
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
git tag v0.1.0
       │
       ▼
┌─────────────────────┐
│  release.yml CI      │
│  (4 parallel builds) │
└─────────┬───────────┘
          │
          ├──► GitHub Release (draft)
          │       .dmg, .msi, .exe, .deb, .AppImage
          │
          ├──► Homebrew Tap (auto-updated)
          │       erdembas/homebrew-runhq
          │
          └──► latest.json (Tauri updater manifest)
                  used by installed apps for auto-update
```

---

## Prerequisites (one-time setup)

### 1. Generate signing keys

Tauri v2 updater requires signed update artifacts.

```bash
pnpm --filter @runhq/desktop tauri signer generate -w ~/.tauri/RunHQ.key
```

This outputs a **public key** and a **private key** (encrypted with a password you choose).

### 2. Add GitHub Secrets

Go to **Settings → Secrets and variables → Actions** in the GitHub repo and add:

| Secret                               | Value                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | The private key content from step 1                                                  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you chose                                                               |
| `HOMEBREW_TAP_TOKEN`                 | A Personal Access Token with `repo` scope (for pushing to `erdembas/homebrew-runhq`) |

### 3. Set the public key in config

Open `apps/desktop/src-tauri/tauri.conf.json` and replace `PLACEHOLDER_RUNDERHQ_UPDATER_PUBKEY` with the public key from step 1:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
  }
}
```

### 4. Create the Homebrew tap repository

1. Create a new GitHub repo: `erdembas/homebrew-runhq`
2. Add a `Casks/` directory
3. Copy `scripts/homebrew-cask-template.rb` as `Casks/runhq.rb`

The release workflow will auto-update this file on every release.

---

## Publishing a Release

### 1. Bump version

Update the version in all three locations:

- `apps/desktop/src-tauri/tauri.conf.json` → `"version"`
- `apps/desktop/src-tauri/Cargo.toml` → `version`
- `apps/desktop/package.json` → `"version"`

### 2. Commit and tag

```bash
git add -A
git commit -m "chore: release v0.x.y"
git tag v0.x.y
git push origin main --tags
```

### 3. Verify the CI

The `Release` workflow will:

1. Build for **macOS** (aarch64 + x86_64), **Linux** (Ubuntu), and **Windows** — in parallel.
2. Create a **draft GitHub Release** with all installers attached.
3. Auto-update the **Homebrew tap** with the new version and SHA256.

### 4. Publish the release

Go to **GitHub → Releases → Drafts**, review the assets, and click **Publish**.

> The draft is intentional — it lets you verify artifacts before users see them.

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

Users can update with:

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

1. Fork `https://github.com/microsoft/winget-pkgs`
2. Copy the manifests to `manifests/e/erdembas/RunHQ/{version}/`
3. Replace `{REPLACE_WITH_PRODUCT_CODE_GUID}` in the installer manifest (use `orca` or `lessmsi` to extract from the MSI)
4. Open a PR against `winget-pkgs`

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
2. If a new version is found, a banner appears: "RunHQ X.Y.Z available — Update & Restart".
3. Clicking the button downloads, installs, and relaunches the app.

The update endpoint is:

```
https://github.com/erdembas/runhq/releases/latest/download/latest.json
```

This file is generated automatically by `tauri-apps/tauri-action` and signed with the signing key.

---

## Troubleshooting

### Release CI failed

Check the workflow logs in **Actions → Release**. Common issues:

- Missing `TAURI_SIGNING_PRIVATE_KEY` secret
- Linux dependency installation failure (transient apt issues)
- Frontend build errors (run `pnpm typecheck && pnpm build` locally first)

### Homebrew tap not updated

- Verify `HOMEBREW_TAP_TOKEN` secret is valid and has `repo` scope
- Verify `erdembas/homebrew-runhq` repo exists with a `Casks/` directory

### Updater not working

- Ensure `createUpdaterArtifacts: "v2Compatible"` is in `tauri.conf.json`
- Ensure the public key in `tauri.conf.json` matches the private key in secrets
- Check that `latest.json` exists in the GitHub Release assets
