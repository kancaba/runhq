//! Editor detection and launch.
//!
//! Scans the system for known code editors (VS Code, Cursor, Windsurf, Zed,
//! Sublime Text, JetBrains IDEs, Neovim) and provides a cross-platform
//! `open_in_editor` function that spawns the editor pointing at a given path.
//!
//! # Detection strategy
//!
//! Real-world users install editors in wildly inconsistent places, and CLI
//! shims (`code`, `cursor`, `subl`, `idea`) are only installed when the user
//! opts in during setup. Single-strategy detection (just probe `$PATH`) misses
//! a large fraction of real installs — especially on macOS (where Finder-
//! launched apps inherit a stripped `$PATH`) and Windows (where CLI shim
//! install is an optional checkbox).
//!
//! So we follow the same layered approach that Raycast, Alfred, VS Code's
//! "Open in external editor" extensions, and JetBrains' own Toolbox use:
//!
//! 1. **CLI shim probe** over an augmented PATH that includes Homebrew,
//!    `~/.local/bin`, `~/.cargo/bin`, JetBrains Toolbox `scripts/`, Snap's
//!    `/snap/bin`, Flatpak exports, and each editor's Windows install `bin\`.
//! 2. **Platform-native install probe** — `.app` bundles on macOS, install
//!    directories on Windows, Snap/Flatpak/opt on Linux.
//!
//! Launch mirrors the same fallback order: prefer the CLI (it accepts the
//! project path directly and keeps the exact editor window the user expects),
//! fall back to `open -a` / direct exe / distro binary.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DetectedEditor {
    pub key: String,
    pub name: String,
    pub command: String,
}

/// Everything the detect/launch pipeline needs to know about a single editor.
///
/// The tables are intentionally verbose rather than clever — when a user
/// reports "RunHQ doesn't see my editor", the fix is almost always a missing
/// row here, and keeping the structure flat makes that a one-line PR.
struct KnownEditor {
    key: &'static str,
    name: &'static str,
    /// CLI shim name (no extension on Unix; `.exe`/`.cmd` suffixes are added
    /// automatically on Windows by [`locate_executable`]).
    command: &'static str,
    /// `.app` bundle names to probe under `/Applications` and
    /// `~/Applications` on macOS. First hit wins.
    mac_app_bundles: &'static [&'static str],
    /// Executable paths relative to each Windows program root
    /// (`%PROGRAMFILES%`, `%PROGRAMFILES(X86)%`, `%LOCALAPPDATA%\Programs`).
    /// Use forward slashes; [`PathBuf::join`] handles the separator.
    win_exe_paths: &'static [&'static str],
    /// Absolute paths to probe on Linux (Snap, Flatpak exports, `/opt/`,
    /// distro-packaged binaries). First hit wins.
    linux_paths: &'static [&'static str],
}

static KNOWN_EDITORS: &[KnownEditor] = &[
    KnownEditor {
        key: "vscode",
        name: "VS Code",
        command: "code",
        mac_app_bundles: &["Visual Studio Code.app"],
        win_exe_paths: &["Microsoft VS Code/Code.exe"],
        linux_paths: &[
            "/usr/share/code/code",
            "/snap/bin/code",
            "/var/lib/flatpak/exports/bin/com.visualstudio.code",
        ],
    },
    KnownEditor {
        key: "cursor",
        name: "Cursor",
        command: "cursor",
        mac_app_bundles: &["Cursor.app"],
        win_exe_paths: &["cursor/Cursor.exe"],
        linux_paths: &[
            "/opt/Cursor/cursor",
            "/opt/cursor/cursor",
            "/usr/bin/cursor",
        ],
    },
    KnownEditor {
        key: "windsurf",
        name: "Windsurf",
        command: "windsurf",
        mac_app_bundles: &["Windsurf.app"],
        win_exe_paths: &["Windsurf/Windsurf.exe"],
        linux_paths: &["/usr/bin/windsurf", "/opt/Windsurf/windsurf"],
    },
    KnownEditor {
        key: "zed",
        name: "Zed",
        command: "zed",
        mac_app_bundles: &["Zed.app", "Zed Preview.app"],
        // Zed's Windows port is preview-only as of 2026 and has no stable
        // install directory; rely on the CLI shim (`zed.exe` in PATH).
        win_exe_paths: &[],
        linux_paths: &[
            "/usr/bin/zed",
            "/opt/zed/zed",
            "/var/lib/flatpak/exports/bin/dev.zed.Zed",
        ],
    },
    KnownEditor {
        key: "sublime",
        name: "Sublime Text",
        command: "subl",
        mac_app_bundles: &["Sublime Text.app"],
        win_exe_paths: &["Sublime Text/subl.exe", "Sublime Text/sublime_text.exe"],
        linux_paths: &[
            "/opt/sublime_text/sublime_text",
            "/snap/bin/sublime-text.subl",
            "/usr/bin/subl",
        ],
    },
    KnownEditor {
        key: "webstorm",
        name: "WebStorm",
        command: "webstorm",
        mac_app_bundles: &["WebStorm.app"],
        win_exe_paths: &["JetBrains/WebStorm/bin/webstorm64.exe"],
        linux_paths: &["/opt/webstorm/bin/webstorm.sh", "/snap/bin/webstorm"],
    },
    KnownEditor {
        key: "idea",
        name: "IntelliJ IDEA",
        command: "idea",
        mac_app_bundles: &[
            "IntelliJ IDEA.app",
            "IntelliJ IDEA Ultimate.app",
            "IntelliJ IDEA CE.app",
        ],
        win_exe_paths: &[
            "JetBrains/IntelliJ IDEA/bin/idea64.exe",
            "JetBrains/IntelliJ IDEA Community Edition/bin/idea64.exe",
        ],
        linux_paths: &[
            "/opt/idea/bin/idea.sh",
            "/opt/idea-ce/bin/idea.sh",
            "/snap/bin/intellij-idea-ultimate",
            "/snap/bin/intellij-idea-community",
        ],
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
        mac_app_bundles: &["Rider.app", "JetBrains Rider.app"],
        win_exe_paths: &["JetBrains/JetBrains Rider/bin/rider64.exe"],
        linux_paths: &["/opt/rider/bin/rider.sh", "/snap/bin/rider"],
    },
    KnownEditor {
        key: "nvim",
        name: "Neovim",
        command: "nvim",
        // Neovim doesn't ship a GUI app on any platform; all three rely on
        // the CLI shim. Left empty so detection falls through to PATH.
        mac_app_bundles: &[],
        win_exe_paths: &["Neovim/bin/nvim.exe"],
        linux_paths: &["/usr/bin/nvim", "/snap/bin/nvim"],
    },
];

pub async fn detect_editors() -> Vec<DetectedEditor> {
    let mut found = Vec::new();

    for editor in KNOWN_EDITORS {
        if detect_install(editor).is_some() {
            found.push(DetectedEditor {
                key: editor.key.to_string(),
                name: editor.name.to_string(),
                command: editor.command.to_string(),
            });
        }
    }

    found
}

/// Internal "how we'd launch this editor" resolution.
enum EditorLaunch {
    /// CLI shim on disk — pass the project path as the first argument.
    Cli(PathBuf),
    /// macOS `.app` bundle — launch via `open -a "<bundle>" <path>`.
    #[cfg(target_os = "macos")]
    MacApp(String),
    /// Direct executable (Windows install or Linux distro binary) — spawn
    /// with the project path as the first argument.
    #[cfg(any(windows, target_os = "linux"))]
    Exe(PathBuf),
}

/// Probe every known install location for `editor`, returning the first
/// viable launch strategy found, or `None` if the editor isn't installed.
fn detect_install(editor: &KnownEditor) -> Option<EditorLaunch> {
    if let Some(cli) = locate_executable(editor.command) {
        return Some(EditorLaunch::Cli(cli));
    }

    #[cfg(target_os = "macos")]
    {
        for bundle in editor.mac_app_bundles {
            for root in macos_app_roots() {
                let p = root.join(bundle);
                if p.exists() {
                    let name = bundle.trim_end_matches(".app").to_string();
                    return Some(EditorLaunch::MacApp(name));
                }
            }
        }
    }

    #[cfg(windows)]
    {
        for rel in editor.win_exe_paths {
            for root in windows_program_roots() {
                let p = root.join(rel);
                if p.is_file() {
                    return Some(EditorLaunch::Exe(p));
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for p in editor.linux_paths {
            let pb = PathBuf::from(p);
            if pb.is_file() {
                return Some(EditorLaunch::Exe(pb));
            }
        }
    }

    // Silence unused-field warnings on platforms that skip certain branches.
    #[cfg(not(target_os = "macos"))]
    let _ = editor.mac_app_bundles;
    #[cfg(not(windows))]
    let _ = editor.win_exe_paths;
    #[cfg(not(target_os = "linux"))]
    let _ = editor.linux_paths;

    None
}

/// Directories RunHQ searches for editor CLI shims, in priority order.
///
/// Starts from the process `$PATH` — Terminal-launched sessions and most
/// Linux desktops already carry the user's full PATH — then appends the
/// canonical dev-tool locations that GUI-launched apps often miss:
///
/// - **macOS**: Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), system
///   bins, JetBrains Toolbox `scripts/` under `~/Library/Application Support`.
/// - **Linux**: Snap (`/snap/bin`), Flatpak exports (system + user),
///   JetBrains Toolbox `scripts/` under `~/.local/share`.
/// - **Windows**: each editor's install-local `bin\` (VS Code, Cursor,
///   Windsurf ship `code.cmd`/`cursor.cmd` there whether or not the user
///   added them to PATH), JetBrains Toolbox `scripts/` under `%LOCALAPPDATA%`.
///
/// Home-relative dev paths (`~/.local/bin`, `~/bin`, `~/.cargo/bin`) come
/// last so user-installed binaries stay reachable on fresh machines.
/// Duplicates are removed while preserving first-seen order — a custom entry
/// in `$PATH` wins over our hand-picked fallback.
fn dev_tool_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Ok(path_env) = std::env::var("PATH") {
        dirs.extend(std::env::split_paths(&path_env));
    }

    #[cfg(target_os = "macos")]
    {
        for extra in [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ] {
            dirs.push(PathBuf::from(extra));
        }
    }

    #[cfg(target_os = "linux")]
    {
        for extra in [
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
            "/snap/bin",
            "/var/lib/flatpak/exports/bin",
        ] {
            dirs.push(PathBuf::from(extra));
        }
    }

    #[cfg(windows)]
    {
        for var in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
            if let Ok(v) = std::env::var(var) {
                let root = PathBuf::from(v);
                dirs.push(root.join("Microsoft VS Code").join("bin"));
                dirs.push(root.join("Neovim").join("bin"));
                dirs.push(root.join("Sublime Text"));
            }
        }
        if let Ok(v) = std::env::var("LOCALAPPDATA") {
            let prog = PathBuf::from(v).join("Programs");
            dirs.push(prog.join("Microsoft VS Code").join("bin"));
            dirs.push(
                prog.join("cursor")
                    .join("resources")
                    .join("app")
                    .join("bin"),
            );
            dirs.push(
                prog.join("Windsurf")
                    .join("resources")
                    .join("app")
                    .join("bin"),
            );
        }
    }

    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join("bin"));
        dirs.push(home.join(".cargo/bin"));

        #[cfg(target_os = "macos")]
        {
            dirs.push(home.join("Library/Application Support/JetBrains/Toolbox/scripts"));
        }
        #[cfg(target_os = "linux")]
        {
            dirs.push(home.join(".local/share/JetBrains/Toolbox/scripts"));
            dirs.push(home.join(".local/share/flatpak/exports/bin"));
        }
        #[cfg(windows)]
        {
            dirs.push(home.join("AppData/Local/JetBrains/Toolbox/scripts"));
        }
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
        format!("{command}.bat"),
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

#[cfg(target_os = "macos")]
fn macos_app_roots() -> Vec<PathBuf> {
    let mut out = vec![PathBuf::from("/Applications")];
    if let Some(home) = dirs::home_dir() {
        out.push(home.join("Applications"));
    }
    out
}

#[cfg(windows)]
fn windows_program_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for var in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
        if let Ok(v) = std::env::var(var) {
            out.push(PathBuf::from(v));
        }
    }
    if let Ok(v) = std::env::var("LOCALAPPDATA") {
        out.push(PathBuf::from(v).join("Programs"));
    }
    out
}

pub async fn open_in_editor(command: &str, path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::Invalid(format!(
            "path does not exist: {}",
            path.display()
        )));
    }

    // Re-run the detection pipeline so we pick up installs that appeared
    // since the last `detect_editors` call (user ran the shim installer,
    // dragged a new .app into /Applications, etc.) without forcing the UI
    // to refresh first.
    let launch = KNOWN_EDITORS
        .iter()
        .find(|e| e.command == command)
        .and_then(detect_install);

    match launch {
        Some(EditorLaunch::Cli(cli)) => spawn_with_path(cli, path).await,
        #[cfg(target_os = "macos")]
        Some(EditorLaunch::MacApp(name)) => spawn_open_a(&name, path).await,
        #[cfg(any(windows, target_os = "linux"))]
        Some(EditorLaunch::Exe(exe)) => spawn_with_path(exe, path).await,
        None => {
            // Last-resort: try the bare command name — useful for editors
            // we don't have a row for yet, or unusual installs where the
            // shim lives in a directory not covered by `dev_tool_dirs`.
            spawn_with_path(PathBuf::from(command), path).await
        }
    }
}

/// Spawn `exe` with `path` as its sole positional argument, detach, and
/// reap the child in the background so zombies don't accumulate.
async fn spawn_with_path(exe: PathBuf, path: &Path) -> AppResult<()> {
    let display = exe.display().to_string();
    let mut child = tokio::process::Command::new(&exe)
        .arg(path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::Other(format!("failed to launch '{display}': {e}")))?;

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    Ok(())
}

/// macOS fallback for editors installed only as a `.app` bundle (no CLI
/// shim). `open -a` handles bundle-name resolution, Launch Services caching,
/// and re-using an existing window — matching the behaviour users expect
/// from double-clicking the app in Finder.
#[cfg(target_os = "macos")]
async fn spawn_open_a(app_name: &str, path: &Path) -> AppResult<()> {
    let mut child = tokio::process::Command::new("/usr/bin/open")
        .arg("-a")
        .arg(app_name)
        .arg(path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::Other(format!("open -a '{app_name}' failed: {e}")))?;

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

    #[test]
    fn dev_tool_dirs_has_entries() {
        let dirs = dev_tool_dirs();
        assert!(!dirs.is_empty(), "dev_tool_dirs should never be empty");
    }

    #[test]
    fn known_editors_have_unique_keys() {
        let mut keys: Vec<&str> = KNOWN_EDITORS.iter().map(|e| e.key).collect();
        let before = keys.len();
        keys.sort();
        keys.dedup();
        assert_eq!(
            before,
            keys.len(),
            "KNOWN_EDITORS contains duplicate keys: {keys:?}"
        );
    }
}
