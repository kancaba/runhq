//! Project discovery via pluggable runtime providers.
//!
//! Adding a new provider (e.g. Go, .NET, Python) means implementing
//! [`RuntimeProvider`] and registering it in [`scan`]. Providers return
//! _suggestions_, not decisions — the UI always asks the user to confirm.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

const MAX_DEPTH: usize = 4;
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    ".git",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    ".venv",
    "venv",
    "__pycache__",
    "bin",
    "obj",
    ".gradle",
    ".mvn",
    ".idea",
    ".vscode",
    "vendor",
    ".cargo",
    "pkg",
];

#[derive(Debug, Clone, Serialize)]
pub struct ProjectCandidate {
    pub name: String,
    pub cwd: PathBuf,
    pub runtime: &'static str,
    pub suggestions: Vec<Suggestion>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_manager: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Suggestion {
    pub label: String,
    pub cmd: String,
}

pub trait RuntimeProvider: Sync + Send {
    fn label(&self) -> &'static str;
    fn detect(&self, dir: &Path) -> Option<ProjectCandidate>;
}

fn providers() -> Vec<Box<dyn RuntimeProvider>> {
    vec![
        Box::new(NodeProvider),
        Box::new(DotnetProvider),
        Box::new(JavaMavenProvider),
        Box::new(JavaGradleProvider),
        Box::new(GoProvider),
        Box::new(RustProvider),
        Box::new(PythonProvider),
        Box::new(RubyProvider),
        Box::new(PhpProvider),
        Box::new(DockerProvider),
    ]
}

/// Recursively scan `root`, walking up to [`MAX_DEPTH`] directories deep.
pub fn scan(root: &Path) -> AppResult<Vec<ProjectCandidate>> {
    let providers = providers();
    let mut out = Vec::new();
    walk(root, 0, &providers, &mut out);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    // Deduplicate by cwd: if multiple providers match the same directory
    // (e.g. package.json + docker-compose.yml), keep only the first match
    // which corresponds to the highest-priority provider.
    let mut seen = std::collections::HashSet::new();
    out.retain(|c| seen.insert(c.cwd.clone()));
    Ok(out)
}

/// Detect a project in a single directory, _without_ walking children.
pub fn detect_one(dir: &Path) -> AppResult<Option<ProjectCandidate>> {
    if !dir.is_dir() {
        return Ok(None);
    }
    for provider in providers() {
        if let Some(candidate) = provider.detect(dir) {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

fn walk(
    dir: &Path,
    depth: usize,
    providers: &[Box<dyn RuntimeProvider>],
    out: &mut Vec<ProjectCandidate>,
) {
    if depth > MAX_DEPTH || !dir.is_dir() {
        return;
    }
    for provider in providers {
        if let Some(candidate) = provider.detect(dir) {
            out.push(candidate);
        }
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || IGNORED_DIRS.contains(&name) {
            continue;
        }
        walk(&path, depth + 1, providers, out);
    }
}

fn dir_name(dir: &Path) -> String {
    dir.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed")
        .to_string()
}

// ---- Node / Bun / Deno provider -----------------------------------------

struct NodeProvider;

#[derive(Deserialize)]
struct PackageJson {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    scripts: std::collections::BTreeMap<String, String>,
}

impl RuntimeProvider for NodeProvider {
    fn label(&self) -> &'static str {
        "node"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let pkg_path = dir.join("package.json");
        if !pkg_path.is_file() {
            return None;
        }
        let raw = fs::read_to_string(&pkg_path).ok()?;
        let pkg: PackageJson = serde_json::from_str(&raw).ok()?;

        let name = dir_name(dir);
        let project_name = pkg.name.clone();

        let pm = if dir.join("pnpm-lock.yaml").exists() {
            "pnpm"
        } else if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
            "bun"
        } else if dir.join("yarn.lock").exists() {
            "yarn"
        } else {
            "npm"
        };

        let preferred = ["dev", "start", "serve", "watch"];
        let mut ordered: Vec<String> = preferred
            .iter()
            .filter(|k| pkg.scripts.contains_key(**k))
            .map(|k| (*k).to_string())
            .collect();
        for k in pkg.scripts.keys() {
            if !preferred.contains(&k.as_str()) {
                ordered.push(k.clone());
            }
        }

        let suggestions: Vec<Suggestion> = ordered
            .into_iter()
            .map(|script| Suggestion {
                label: script.clone(),
                cmd: format!("{pm} run {script}"),
            })
            .collect();

        if suggestions.is_empty() {
            return None;
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "node",
            suggestions,
            package_manager: Some(pm.to_string()),
            project_name,
        })
    }
}

// ---- .NET provider -------------------------------------------------------

struct DotnetProvider;

impl RuntimeProvider for DotnetProvider {
    fn label(&self) -> &'static str {
        "dotnet"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let proj_file = fs::read_dir(dir)
            .ok()?
            .flatten()
            .find(|e| {
                let n = e.file_name();
                let n = n.to_string_lossy();
                n.ends_with(".csproj") || n.ends_with(".fsproj") || n.ends_with(".vbproj")
            })?
            .path();

        let name = dir_name(dir);
        let project_name = fs::read_to_string(&proj_file).ok().and_then(|raw| {
            let open = "<AssemblyName>";
            let close = "</AssemblyName>";
            let start = raw.find(open)?;
            let content_start = start + open.len();
            let end = raw[content_start..].find(close)?;
            Some(raw[content_start..content_start + end].trim().to_string())
        });

        let mut suggestions = vec![
            Suggestion {
                label: "run".into(),
                cmd: "dotnet run".into(),
            },
            Suggestion {
                label: "watch".into(),
                cmd: "dotnet watch".into(),
            },
        ];

        if dir.join("Program.cs").exists() || dir.join("Program.fs").exists() {
            suggestions.push(Suggestion {
                label: "build".into(),
                cmd: "dotnet build".into(),
            });
        }

        if dir
            .join("Tests") /*.csproj*/
            .is_dir()
            || has_file_pattern(dir, "*Tests.csproj")
        {
            suggestions.push(Suggestion {
                label: "test".into(),
                cmd: "dotnet test".into(),
            });
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "dotnet",
            suggestions,
            package_manager: None,
            project_name,
        })
    }
}

// ---- Java Maven provider -------------------------------------------------

struct JavaMavenProvider;

impl RuntimeProvider for JavaMavenProvider {
    fn label(&self) -> &'static str {
        "java-maven"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        if !dir.join("pom.xml").is_file() {
            return None;
        }

        let name = dir_name(dir);

        let mut suggestions = vec![
            Suggestion {
                label: "spring-boot:run".into(),
                cmd: "mvn spring-boot:run".into(),
            },
            Suggestion {
                label: "compile".into(),
                cmd: "mvn compile".into(),
            },
            Suggestion {
                label: "test".into(),
                cmd: "mvn test".into(),
            },
            Suggestion {
                label: "package".into(),
                cmd: "mvn package -DskipTests".into(),
            },
        ];

        if dir.join("mvnw").exists() {
            for s in &mut suggestions {
                s.cmd = s.cmd.replace("mvn", "./mvnw");
            }
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "java",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Java Gradle provider ------------------------------------------------

struct JavaGradleProvider;

impl RuntimeProvider for JavaGradleProvider {
    fn label(&self) -> &'static str {
        "java-gradle"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let is_gradle =
            dir.join("build.gradle").is_file() || dir.join("build.gradle.kts").is_file();
        if !is_gradle {
            return None;
        }

        let name = dir_name(dir);

        let gradle = if dir.join("gradlew").exists() {
            "./gradlew"
        } else {
            "gradle"
        };

        let mut suggestions = vec![
            Suggestion {
                label: "bootRun".into(),
                cmd: format!("{gradle} bootRun"),
            },
            Suggestion {
                label: "build".into(),
                cmd: format!("{gradle} build"),
            },
            Suggestion {
                label: "test".into(),
                cmd: format!("{gradle} test"),
            },
        ];

        if dir.join("Dockerfile").exists() {
            suggestions.push(Suggestion {
                label: "dockerBuild".into(),
                cmd: format!("{gradle} dockerBuild"),
            });
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "java",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Go provider ---------------------------------------------------------

struct GoProvider;

impl RuntimeProvider for GoProvider {
    fn label(&self) -> &'static str {
        "go"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        if !dir.join("go.mod").is_file() {
            return None;
        }

        let name = dir_name(dir);

        let mut suggestions = vec![
            Suggestion {
                label: "run".into(),
                cmd: "go run .".into(),
            },
            Suggestion {
                label: "build".into(),
                cmd: "go build".into(),
            },
            Suggestion {
                label: "test".into(),
                cmd: "go test ./...".into(),
            },
        ];

        if dir.join("main.go").is_file() {
            suggestions.insert(
                0,
                Suggestion {
                    label: "run main.go".into(),
                    cmd: "go run main.go".into(),
                },
            );
        }

        if dir.join("Makefile").is_file() {
            suggestions.push(Suggestion {
                label: "make".into(),
                cmd: "make".into(),
            });
        }

        if dir.join("air.toml").is_file() || dir.join(".air.toml").is_file() {
            suggestions.insert(
                0,
                Suggestion {
                    label: "air (live reload)".into(),
                    cmd: "air".into(),
                },
            );
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "go",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Rust provider -------------------------------------------------------

struct RustProvider;

impl RuntimeProvider for RustProvider {
    fn label(&self) -> &'static str {
        "rust"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        if !dir.join("Cargo.toml").is_file() {
            return None;
        }

        let name = dir_name(dir);

        let mut suggestions = vec![
            Suggestion {
                label: "run".into(),
                cmd: "cargo run".into(),
            },
            Suggestion {
                label: "build".into(),
                cmd: "cargo build".into(),
            },
            Suggestion {
                label: "test".into(),
                cmd: "cargo test".into(),
            },
        ];

        if dir.join("Dockerfile").exists() {
            suggestions.push(Suggestion {
                label: "clippy".into(),
                cmd: "cargo clippy".into(),
            });
        }

        if dir.join("tailwind.config.js").exists() || dir.join("tailwind.config.ts").exists() {
            suggestions.push(Suggestion {
                label: "trunk serve".into(),
                cmd: "trunk serve".into(),
            });
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "rust",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Python provider -----------------------------------------------------

struct PythonProvider;

impl RuntimeProvider for PythonProvider {
    fn label(&self) -> &'static str {
        "python"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let has_pyproject = dir.join("pyproject.toml").is_file();
        let has_setup_py = dir.join("setup.py").is_file();
        let has_manage = dir.join("manage.py").is_file();
        let has_requirements = dir.join("requirements.txt").is_file();
        let has_main = dir.join("main.py").is_file() || dir.join("app.py").is_file();

        if !has_pyproject && !has_setup_py && !has_manage && !has_requirements && !has_main {
            return None;
        }

        let name = dir_name(dir);

        let mut suggestions = Vec::new();

        if has_manage {
            suggestions.push(Suggestion {
                label: "runserver".into(),
                cmd: "python manage.py runserver".into(),
            });
            suggestions.push(Suggestion {
                label: "migrate".into(),
                cmd: "python manage.py migrate".into(),
            });
        }

        if has_main {
            suggestions.push(Suggestion {
                label: "run main".into(),
                cmd: "python main.py".into(),
            });
        }

        if dir.join("app.py").exists() && !has_main {
            suggestions.push(Suggestion {
                label: "run app".into(),
                cmd: "python app.py".into(),
            });
        }

        if dir.join("flask_app.py").exists() {
            suggestions.push(Suggestion {
                label: "flask run".into(),
                cmd: "flask run".into(),
            });
        }

        if dir.join("Makefile").is_file() {
            suggestions.push(Suggestion {
                label: "make".into(),
                cmd: "make".into(),
            });
        }

        if dir.join("docker-compose.yml").is_file() || dir.join("docker-compose.yaml").is_file() {
            suggestions.push(Suggestion {
                label: "docker compose up".into(),
                cmd: "docker compose up".into(),
            });
        }

        if has_pyproject {
            if dir.join("uv.lock").exists() {
                suggestions.push(Suggestion {
                    label: "uv run".into(),
                    cmd: "uv run".into(),
                });
            } else if dir.join("poetry.lock").exists() {
                suggestions.push(Suggestion {
                    label: "poetry run".into(),
                    cmd: "poetry run python".into(),
                });
            }
        }

        if suggestions.is_empty() {
            return None;
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "python",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Ruby provider -------------------------------------------------------

struct RubyProvider;

impl RuntimeProvider for RubyProvider {
    fn label(&self) -> &'static str {
        "ruby"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let has_gemfile = dir.join("Gemfile").is_file();
        let has_rakefile = dir.join("Rakefile").is_file();
        let has_rb_main = dir.join("main.rb").is_file() || dir.join("app.rb").is_file();

        if !has_gemfile && !has_rakefile && !has_rb_main {
            return None;
        }

        let name = dir_name(dir);
        let mut suggestions = Vec::new();

        if dir.join("config.ru").is_file() {
            suggestions.push(Suggestion {
                label: "rackup".into(),
                cmd: "bundle exec rackup".into(),
            });
        }

        if dir.join("config/routes.rb").is_file() || dir.join("bin/rails").is_file() {
            suggestions.push(Suggestion {
                label: "rails server".into(),
                cmd: "bundle exec rails server".into(),
            });
            suggestions.push(Suggestion {
                label: "rails console".into(),
                cmd: "bundle exec rails console".into(),
            });
        }

        if has_rakefile {
            suggestions.push(Suggestion {
                label: "rake".into(),
                cmd: "bundle exec rake".into(),
            });
        }

        if dir.join("main.rb").is_file() {
            suggestions.push(Suggestion {
                label: "run main".into(),
                cmd: "ruby main.rb".into(),
            });
        }

        if dir.join("app.rb").is_file() {
            suggestions.push(Suggestion {
                label: "run app".into(),
                cmd: "ruby app.rb".into(),
            });
        }

        if has_gemfile {
            suggestions.push(Suggestion {
                label: "install".into(),
                cmd: "bundle install".into(),
            });
        }

        if suggestions.is_empty() {
            return None;
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "ruby",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- PHP provider --------------------------------------------------------

struct PhpProvider;

impl RuntimeProvider for PhpProvider {
    fn label(&self) -> &'static str {
        "php"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let has_composer = dir.join("composer.json").is_file();
        let has_artisan = dir.join("artisan").is_file();
        let has_index = dir.join("index.php").is_file();
        let has_public_index = dir.join("public/index.php").is_file();

        if !has_composer && !has_artisan && !has_index && !has_public_index {
            return None;
        }

        let name = dir_name(dir);

        let mut suggestions = Vec::new();

        if has_artisan {
            suggestions.push(Suggestion {
                label: "serve".into(),
                cmd: "php artisan serve".into(),
            });
            suggestions.push(Suggestion {
                label: "migrate".into(),
                cmd: "php artisan migrate".into(),
            });
            suggestions.push(Suggestion {
                label: "test".into(),
                cmd: "php artisan test".into(),
            });
        }

        if has_public_index {
            suggestions.push(Suggestion {
                label: "built-in server".into(),
                cmd: "php -S localhost:8000 -t public".into(),
            });
        } else if has_index && !has_artisan {
            suggestions.push(Suggestion {
                label: "built-in server".into(),
                cmd: "php -S localhost:8000".into(),
            });
        }

        if has_composer {
            suggestions.push(Suggestion {
                label: "install".into(),
                cmd: "composer install".into(),
            });
        }

        if dir.join("vendor/bin/phpunit").exists() {
            suggestions.push(Suggestion {
                label: "phpunit".into(),
                cmd: "vendor/bin/phpunit".into(),
            });
        }

        if suggestions.is_empty() {
            return None;
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "php",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Docker provider -----------------------------------------------------

struct DockerProvider;

impl RuntimeProvider for DockerProvider {
    fn label(&self) -> &'static str {
        "docker"
    }

    fn detect(&self, dir: &Path) -> Option<ProjectCandidate> {
        let has_compose = dir.join("docker-compose.yml").is_file()
            || dir.join("docker-compose.yaml").is_file()
            || dir.join("compose.yml").is_file()
            || dir.join("compose.yaml").is_file();
        let has_dockerfile = dir.join("Dockerfile").is_file();

        if !has_compose && !has_dockerfile {
            return None;
        }

        let name = dir_name(dir);
        let mut suggestions = Vec::new();

        if has_compose {
            suggestions.push(Suggestion {
                label: "compose up".into(),
                cmd: "docker compose up".into(),
            });
            suggestions.push(Suggestion {
                label: "compose up (build)".into(),
                cmd: "docker compose up --build".into(),
            });
            suggestions.push(Suggestion {
                label: "compose down".into(),
                cmd: "docker compose down".into(),
            });
        }

        if has_dockerfile {
            suggestions.push(Suggestion {
                label: "build".into(),
                cmd: format!("docker build -t {name} ."),
            });
        }

        Some(ProjectCandidate {
            name,
            cwd: dir.to_path_buf(),
            runtime: "docker",
            suggestions,
            package_manager: None,
            project_name: None,
        })
    }
}

// ---- Helpers -------------------------------------------------------------

fn has_file_pattern(dir: &Path, pattern: &str) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    let prefix = pattern.trim_end_matches('*');
    entries.flatten().any(|e| {
        let name = e.file_name();
        let name = name.to_string_lossy();
        name.starts_with(prefix) && name.ends_with(".csproj")
    })
}
