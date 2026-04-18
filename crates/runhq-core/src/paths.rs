//! Filesystem paths used by RunHQ.
//!
//! The state directory lives at `~/.runhq/` by default — matching the
//! convention used by tools like `.cargo`, `.docker`, `.npm`. It can be
//! overridden globally with the `RUNHQ_HOME` environment variable.

use std::path::PathBuf;

use anyhow::{Context, Result};

pub const CONFIG_FILE: &str = "config.json";

/// Resolve the RunHQ home directory.
///
/// Precedence:
/// 1. `RUNHQ_HOME` environment variable (when non-empty).
/// 2. `~/.runhq`.
///
/// If a legacy `~/.RunHQ` directory exists from earlier builds and the new
/// lowercase path is missing, it is migrated in-place (renamed) so user state
/// is preserved across the switch to `~/.runhq`.
pub fn runhq_home() -> Result<PathBuf> {
    if let Ok(custom) = std::env::var("RUNHQ_HOME") {
        if !custom.trim().is_empty() {
            return Ok(PathBuf::from(custom));
        }
    }
    let home = dirs::home_dir().context("could not determine user home directory")?;
    let target = home.join(".runhq");
    migrate_legacy_home(&home, &target);
    Ok(target)
}

pub fn config_path() -> Result<PathBuf> {
    Ok(runhq_home()?.join(CONFIG_FILE))
}

/// On case-sensitive filesystems (Linux, default macOS APFS setups),
/// `~/.RunHQ` and `~/.runhq` are distinct directories. If a legacy casing
/// exists and the lowercase one does not, rename it so we don't orphan state.
///
/// On case-insensitive filesystems the two names refer to the same directory
/// and the rename is a no-op.
fn migrate_legacy_home(home: &std::path::Path, target: &std::path::Path) {
    let legacy = home.join(".RunHQ");
    if !legacy.exists() || legacy == *target {
        return;
    }
    if target.exists() {
        return;
    }
    if let Err(err) = std::fs::rename(&legacy, target) {
        eprintln!(
            "runhq: failed to migrate {} -> {}: {err}",
            legacy.display(),
            target.display()
        );
    }
}
