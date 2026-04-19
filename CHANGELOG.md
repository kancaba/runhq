# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2](https://github.com/erdembas/runhq/compare/v0.1.1...v0.1.2) (2026-04-19)


### Bug Fixes

* **macos:** ad-hoc sign bundle and strip quarantine via brew postflight ([00c7625](https://github.com/erdembas/runhq/commit/00c762503f8a2cf4bc378a0ef5a0e22938295d6d))


### Documentation

* explain ad-hoc signing strategy and demote Apple Dev ID to optional ([8b5163b](https://github.com/erdembas/runhq/commit/8b5163b4e1aa61018aab12475f01e01acae05d5c))
* update installation instructions for macOS and add first launch troubleshooting steps ([6dc0d68](https://github.com/erdembas/runhq/commit/6dc0d68db75f9ee0d73f2f3786a338ac216cdef5))

## [0.1.1](https://github.com/erdembas/runhq/compare/v0.1.0...v0.1.1) (2026-04-19)


### Documentation

* **landing:** surface editor + terminal in hero lead ([80eeb25](https://github.com/erdembas/runhq/commit/80eeb252e2adaa8da6cf02cefd200206f23c8f1c))
* **readme:** add dashboard screenshot above the fold ([614cf49](https://github.com/erdembas/runhq/commit/614cf493df96f330bb21612fae5dad4a1633ebec))

## [0.1.0] - 2026-04-18

### Added
- Initial MVP release of RunHQ.
- Auto-detection of 10 runtime types: Node, .NET, Java (Maven/Gradle), Go, Rust, Python, Ruby, PHP, Docker.
- Service lifecycle management (start/stop/restart) with multi-command support.
- Stacks for grouped orchestration with start-all/stop-all/restart-all.
- Real-time log streaming with virtualized rendering and URL detection.
- Embedded terminal (PTY) per service via xterm.js.
- Port watchdog with kill capability and PID-to-service attribution.
- Quick Action command palette (Cmd/Ctrl+K) with drill-down navigation.
- Sidebar with sections, drag-and-drop, and collapsible groups.
- First-run onboarding tour.
- System tray integration (hide-to-tray on window close).
- Light/dark/system theme with cross-window sync.
- Global keyboard shortcuts with customisation.
- Project scanning with multi-select import.
- Editor detector (VS Code, Cursor, Windsurf, Zed, Sublime, WebStorm, IDEA, Neovim).
- CI pipeline (lint, typecheck, clippy, test) on macOS, Windows, Linux.
- Release pipeline with Homebrew cask generation.

[0.1.0]: https://github.com/erdembas/runhq/releases/tag/v0.1.0
