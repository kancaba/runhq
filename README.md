<p align="center">
  <img src="docs/icon.png" alt="RunHQ" width="128" height="128" />
</p>

<h1 align="center">RunHQ</h1>
<p align="center">
  <b>The universal local service orchestrator.</b><br />
  Native dev processes — Node, Go, .NET, Python, Java, Rust, Ruby, PHP, Docker — with one UI, one port watchdog, embedded terminal, and unified logs.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" />
  <img alt="status" src="https://img.shields.io/badge/status-MVP-yellow" />
</p>

<p align="center">
  <a href="https://runhq.dev/">
    <img src="docs/dashboard.png" alt="RunHQ dashboard — one window for every local service" width="100%" />
  </a>
</p>

---

## Why?

Terminal tabs are a mess. Containers are heavy. You open a terminal for the web app, another for the API, a third for the worker, a fourth for the database container, then you `lsof -i :3000` because something is still holding the port. RunHQ replaces that ritual with a single always-open control panel — without forcing your code into Docker.

- **Native, not containerized.** Your project runs exactly the way you already run it.
- **Local, private, offline.** No telemetry, no cloud sync, no account.
- **One window to rule them.** Start / stop / restart, kill ports, search logs, in one place.

## Features

### Core

- **Smart project auto-discovery** with 10 runtime providers: Node / Bun / Deno, .NET, Java (Maven & Gradle), Go, Rust, Python, Ruby, PHP, Docker.
- **Process supervisor** with multi-command support and graceful shutdown (SIGTERM → grace → SIGKILL).
- **Unified log stream** with bounded ring buffers (10 k lines) and virtualized rendering.
- **Real-time port watchdog** — list all TCP listeners, search, one-click **Kill port**.
- **Atomic, human-readable JSON config** at `~/.runhq/config.json`.

### Desktop UI

- **Dashboard** with system health bar, service cards, and category grouping (frontend / backend / database / infra / worker / tooling).
- **Embedded terminal** — full PTY via xterm.js with Nerd Font support and theme-aware rendering.
- **Quick Action floating window** — press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> to start/stop services without leaving your editor.
- **Command palette** (<kbd>Cmd</kbd>+<kbd>K</kbd>) with fuzzy search, drill-down into service commands, and favorites.
- **Editor integration** — detect and open projects in VS Code, Cursor, Windsurf, Zed, Sublime, WebStorm, IDEA, Neovim.
- **Category & runtime filters** — narrow the service list by category or runtime at a glance.
- **Auto-update** — in-app update banner with one-click "Update & Restart".
- **System tray** — close hides to tray; quit from tray menu.


## Install

### Homebrew (macOS)

```bash
brew tap erdembas/runhq
brew install --cask runhq
```

Upgrade later with `brew upgrade --cask runhq`.

### Download from GitHub Releases

Grab a pre-built binary for your platform from the [latest release](https://github.com/erdembas/runhq/releases/latest):

- **macOS** — `RunHQ_<version>_aarch64.dmg` (Apple Silicon) or `RunHQ_<version>_x64.dmg` (Intel)
- **Linux** — `runhq_<version>_amd64.deb` or `runhq_<version>_amd64.AppImage`
- **Windows** — `RunHQ_<version>_x64-setup.exe` (installer) or `RunHQ_<version>_x64_en-US.msi`

The app auto-updates in place — you only need to download manually once.

### Build from source

```bash
pnpm install
pnpm tauri:dev
```

## Repository layout

```
runhq/
├── apps/
│   └── desktop/              # React UI + Tauri shell
│       ├── src/              # Frontend (React + Vite + Tailwind + xterm.js)
│       ├── src-tauri/        # Tauri wiring: IPC commands, PTY manager, tray
│       ├── tsconfig.json
│       └── vite.config.ts
├── crates/
│   └── runhq-core/       # Headless Rust core (no Tauri dep)
│       ├── src/              # Domain: supervisor, logs, ports, scanner, editors, state
│       └── tests/            # Integration tests
├── docs/
├── scripts/                  # Distribution helpers (Homebrew cask, winget, icons)
├── Cargo.toml                # Rust workspace
├── pnpm-workspace.yaml       # pnpm workspace
└── package.json              # Workspace root
```

The core crate knows nothing about Tauri. It will eventually power a `RunHQ` CLI too.

## Development

### Prerequisites

- [Node.js 20+](https://nodejs.org/) and [pnpm 9+](https://pnpm.io/)
- [Rust (stable)](https://www.rust-lang.org/tools/install) ≥ 1.77
- Platform deps for Tauri: [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Common tasks

```bash
pnpm install                    # install workspace deps
pnpm tauri:dev                  # run the desktop app (dev mode)
pnpm tauri:build                # bundle release binary

pnpm lint && pnpm typecheck     # frontend quality gates
pnpm format                     # prettier
cargo test -p runhq-core    # core unit/integration tests
cargo clippy --all-targets -- -D warnings
cargo fmt --all
```

### State directory

RunHQ keeps all state under `~/.runhq/`:

```
~/.runhq/
└── config.json         # services, preferences — atomic JSON writes
```

Override with the `RUNHQ_HOME` environment variable (e.g. for tests).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The most impactful contribution is a new runtime provider — see `crates/runhq-core/src/scanner.rs`.

## License

MIT © [Erdem Baş](https://github.com/erdembas). See [LICENSE](./LICENSE).
