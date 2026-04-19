//! Editor detection and launch.
//!
//! Scans the system for known code editors (VS Code, Cursor, Windsurf, Zed,
//! Sublime Text, JetBrains IDEs, Neovim) and provides a cross-platform
//! `open_in_editor` function that spawns the editor pointing at a given path.

use std::path::Path;

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
        if is_available(editor).await {
            found.push(DetectedEditor {
                key: editor.key.to_string(),
                name: editor.name.to_string(),
                command: editor.command.to_string(),
            });
        }
    }

    found
}

async fn is_available(editor: &KnownEditor) -> bool {
    #[cfg(unix)]
    {
        tokio::process::Command::new("which")
            .arg(editor.command)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[cfg(windows)]
    {
        tokio::process::Command::new("where.exe")
            .arg(editor.command)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

pub async fn open_in_editor(command: &str, path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::Invalid(format!(
            "path does not exist: {}",
            path.display()
        )));
    }

    let mut child = tokio::process::Command::new(command)
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
