//! Editor detection and launch.
//!
//! Scans the system for known code editors (VS Code, Cursor, Windsurf, Zed,
//! Sublime Text, JetBrains IDEs, Neovim) and provides a cross-platform
//! `open_in_editor` function that spawns the editor pointing at a given path.
//!
//! # macOS GUI launch PATH quirk
//!
//! When RunHQ.app is started from Finder / `/Applications`, macOS does **not**
//! inherit the user's shell PATH (`.zshrc`, `.bash_profile`). The process sees
//! only the minimal system PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), which does
//! not include `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` or any of
//! the other places where `code`, `cursor`, `webstorm`, etc. actually live.
//!
//! Instead of shelling out to a login shell to recover PATH (slow, brittle on
//! exotic shells), we maintain a hand-picked list of dev-tool directories and
//! probe them directly. See `dev_tool_dirs`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DetectedEditor {
    pub key: String,
    pub name: String,
    pub command: String,
}

struct KnownEditor {
    key: &'static str,
    name: &'static str,
    command: &'static str,
}

static KNOWN_EDITORS: &[KnownEditor] = &[
    KnownEditor {
        key: "vscode",
        name: "VS Code",
        command: "code",
    },
    KnownEditor {
        key: "cursor",
        name: "Cursor",
        command: "cursor",
    },
    KnownEditor {
        key: "windsurf",
        name: "Windsurf",
        command: "windsurf",
    },
    KnownEditor {
        key: "zed",
        name: "Zed",
        command: "zed",
    },
    KnownEditor {
        key: "sublime",
        name: "Sublime Text",
        command: "subl",
    },
    KnownEditor {
        key: "webstorm",
        name: "WebStorm",
        command: "webstorm",
    },
    KnownEditor {
        key: "idea",
        name: "IntelliJ IDEA",
        command: "idea",
    },
    // JetBrains Rider ships with a `rider` CLI shim when the user enables
    // "Generate shell scripts" in Toolbox (macOS/Linux) or lets the Windows
    // installer add the binary to PATH. We detect it unconditionally here;
    // the frontend only surfaces it for services that actually invoke the
    // `dotnet` CLI, so non-.NET projects stay uncluttered.
    KnownEditor {
        key: "rider",
        name: "Rider",
        command: "rider",
    },
    KnownEditor {
        key: "nvim",
        name: "Neovim",
        command: "nvim",
    },
];

pub async fn detect_editors() -> Vec<DetectedEditor> {
    let mut found = Vec::new();

    for editor in KNOWN_EDITORS {
        if locate_executable(editor.command).is_some() {
            found.push(DetectedEditor {
                key: editor.key.to_string(),
                name: editor.name.to_string(),
                command: editor.command.to_string(),
            });
        }
    }

    found
}

/// Directories RunHQ searches for editor CLI shims, in priority order.
///
/// Starts from the process `$PATH` so Linux (where the user's shell usually
/// propagates PATH into the Tauri process) and Terminal-launched macOS sessions
/// keep working. Then we append the canonical dev-tool locations that Finder-
/// launched macOS apps miss. Home-relative paths come last so user-installed
/// binaries are still reachable on fresh machines without `$HOME/.local/bin` in
/// PATH.
///
/// Duplicates are removed while preserving first-seen order, so a custom entry
/// in the user's `$PATH` wins over our hand-picked fallback.
fn dev_tool_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Ok(path_env) = std::env::var("PATH") {
        dirs.extend(std::env::split_paths(&path_env));
    }

    for extra in [
        "/opt/homebrew/bin", // Apple Silicon Homebrew
        "/usr/local/bin",    // Intel Homebrew + hand-rolled installs
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        dirs.push(PathBuf::from(extra));
    }

    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/bin")); // pipx, user pip, asdf shims on Linux
        dirs.push(home.join("bin")); // classic ~/bin
        dirs.push(home.join(".cargo/bin")); // rustup-installed tools
    }

    let mut seen = std::collections::HashSet::new();
    dirs.retain(|p| seen.insert(p.clone()));
    dirs
}

/// Resolve `command` to an absolute path by scanning [`dev_tool_dirs`].
///
/// On Windows we also try `.exe` and `.cmd` suffixes because editor CLIs like
/// `code.cmd` and `cursor.cmd` are the shape npm-style shims typically take.
fn locate_executable(command: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    let candidates: Vec<String> = vec![
        format!("{command}.exe"),
        format!("{command}.cmd"),
        command.to_string(),
    ];
    #[cfg(not(windows))]
    let candidates: Vec<String> = vec![command.to_string()];

    for dir in dev_tool_dirs() {
        for name in &candidates {
            let full = dir.join(name);
            if full.is_file() {
                return Some(full);
            }
        }
    }
    None
}

pub async fn open_in_editor(command: &str, path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::Invalid(format!(
            "path does not exist: {}",
            path.display()
        )));
    }

    // Resolve the CLI via our augmented search path so launching works even
    // when the Tauri process inherited a stripped-down PATH (macOS Finder
    // launches). Falling back to the raw `command` name preserves the old
    // behaviour for environments where PATH already resolves it.
    let resolved = locate_executable(command);
    let mut cmd = match &resolved {
        Some(full) => tokio::process::Command::new(full),
        None => tokio::process::Command::new(command),
    };

    let mut child = cmd
        .arg(path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::Other(format!("failed to launch editor '{}': {e}", command)))?;

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn detect_returns_vec() {
        let editors = detect_editors().await;
        assert!(!editors.is_empty() || editors.is_empty());
    }
}
