//! Persisted user configuration.
//!
//! Layout: a single JSON file at `$RUNHQ_HOME/config.json`. Writes are
//! atomic (tmp-file + rename) so a crash mid-save cannot corrupt user data.

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::paths;

pub const CONFIG_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommandEntry {
    pub name: String,
    pub cmd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDef {
    pub id: String,
    pub name: String,
    pub cwd: PathBuf,
    #[serde(default)]
    pub cmds: Vec<CommandEntry>,
    #[serde(default, skip_serializing)]
    pub cmd: Option<String>,
    #[serde(default, skip_serializing)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    #[serde(default)]
    pub path_override: Option<String>,
    #[serde(default)]
    pub pre_command: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub open_browser: bool,
    #[serde(default = "default_grace_ms")]
    pub grace_ms: u64,
}

impl ServiceDef {
    pub fn migrate(&mut self) {
        if self.cmds.is_empty() {
            if let Some(cmd) = self.cmd.take() {
                self.cmds.push(CommandEntry {
                    name: "default".into(),
                    cmd,
                });
            }
        }
    }
}

fn default_grace_ms() -> u64 {
    5_000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub service_ids: Vec<String>,
    #[serde(default)]
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shortcuts {
    #[serde(default = "default_quick_action")]
    pub quick_action: String,
}

impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            quick_action: default_quick_action(),
        }
    }
}

fn default_quick_action() -> String {
    "Cmd+Shift+K".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Prefs {
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub last_scanned_dir: Option<PathBuf>,
    #[serde(default)]
    pub shortcuts: Shortcuts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: u32,
    #[serde(default)]
    pub services: Vec<ServiceDef>,
    #[serde(default)]
    pub stacks: Vec<StackDef>,
    #[serde(default)]
    pub prefs: Prefs,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            services: Vec::new(),
            stacks: Vec::new(),
            prefs: Prefs::default(),
        }
    }
}

/// Thread-safe, persisted store backed by `config.json`.
pub struct Store {
    inner: RwLock<Config>,
    path: PathBuf,
}

impl Store {
    /// Open (or create) the store at the given RunHQ home directory.
    pub fn open(home: &Path) -> Result<Self> {
        let path = paths::config_path().unwrap_or_else(|_| home.join(paths::CONFIG_FILE));
        let config = if path.exists() {
            let raw = fs::read_to_string(&path)
                .with_context(|| format!("reading {}", path.display()))?;
            let mut cfg = serde_json::from_str::<Config>(&raw).unwrap_or_else(|err| {
                tracing::warn!(
                    "config at {} is corrupt ({err}); starting with an empty config",
                    path.display()
                );
                Config::default()
            });
            for svc in &mut cfg.services {
                svc.migrate();
            }
            cfg
        } else {
            let cfg = Config::default();
            write_atomic(&path, &cfg)?;
            cfg
        };
        let needs_persist = config.services.iter().any(|s| !s.cmds.is_empty());
        let store = Self {
            inner: RwLock::new(config),
            path,
        };
        if needs_persist {
            let _ = store.persist();
        }
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn snapshot(&self) -> Config {
        self.inner.read().clone()
    }

    pub fn services(&self) -> Vec<ServiceDef> {
        self.inner.read().services.clone()
    }

    pub fn service(&self, id: &str) -> Option<ServiceDef> {
        self.inner
            .read()
            .services
            .iter()
            .find(|s| s.id == id)
            .cloned()
    }

    pub fn upsert_service(&self, svc: ServiceDef) -> Result<()> {
        {
            let mut cfg = self.inner.write();
            if let Some(existing) = cfg.services.iter_mut().find(|s| s.id == svc.id) {
                *existing = svc;
            } else {
                cfg.services.push(svc);
            }
        }
        self.persist()
    }

    pub fn remove_service(&self, id: &str) -> Result<bool> {
        let removed = {
            let mut cfg = self.inner.write();
            let len_before = cfg.services.len();
            cfg.services.retain(|s| s.id != id);
            len_before != cfg.services.len()
        };
        self.persist()?;
        Ok(removed)
    }

    pub fn update_prefs(&self, mutate: impl FnOnce(&mut Prefs)) -> Result<()> {
        {
            let mut cfg = self.inner.write();
            mutate(&mut cfg.prefs);
        }
        self.persist()
    }

    pub fn stacks(&self) -> Vec<StackDef> {
        self.inner.read().stacks.clone()
    }

    pub fn stack(&self, id: &str) -> Option<StackDef> {
        self.inner
            .read()
            .stacks
            .iter()
            .find(|s| s.id == id)
            .cloned()
    }

    pub fn upsert_stack(&self, stack: StackDef) -> Result<()> {
        {
            let mut cfg = self.inner.write();
            if let Some(existing) = cfg.stacks.iter_mut().find(|s| s.id == stack.id) {
                *existing = stack;
            } else {
                cfg.stacks.push(stack);
            }
        }
        self.persist()
    }

    pub fn remove_stack(&self, id: &str) -> Result<bool> {
        let removed = {
            let mut cfg = self.inner.write();
            let len_before = cfg.stacks.len();
            cfg.stacks.retain(|s| s.id != id);
            len_before != cfg.stacks.len()
        };
        self.persist()?;
        Ok(removed)
    }

    fn persist(&self) -> Result<()> {
        write_atomic(&self.path, &self.snapshot())
    }
}

fn write_atomic(path: &Path, config: &Config) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string_pretty(config)?;
    fs::write(&tmp, body).with_context(|| format!("writing {}", tmp.display()))?;
    fs::rename(&tmp, path).with_context(|| format!("renaming into {}", path.display()))?;
    Ok(())
}
