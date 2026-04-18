use std::fs;
use std::io::Write;

use runhq_core::scanner;
use tempfile::TempDir;

fn mktemp(prefix: &str) -> TempDir {
    tempfile::Builder::new()
        .prefix(prefix)
        .tempdir()
        .expect("tempdir")
}

#[test]
fn detects_node_project_with_scripts() {
    let dir = mktemp("rhq-node");
    let project = dir.path().join("web");
    fs::create_dir_all(&project).unwrap();
    let mut pkg = fs::File::create(project.join("package.json")).unwrap();
    writeln!(
        pkg,
        r#"{{"name":"acme-web","scripts":{{"dev":"vite","build":"vite build"}}}}"#
    )
    .unwrap();

    let hits = scanner::scan(dir.path()).unwrap();
    assert_eq!(hits.len(), 1);
    let hit = &hits[0];
    assert_eq!(hit.name, "acme-web");
    assert_eq!(hit.runtime, "node");
    assert_eq!(hit.suggestions.first().unwrap().label, "dev");
}

#[test]
fn skips_node_modules_and_dist() {
    let dir = mktemp("rhq-ignore");
    let nested = dir.path().join("node_modules").join("x");
    fs::create_dir_all(&nested).unwrap();
    fs::write(nested.join("package.json"), r#"{"scripts":{"dev":"x"}}"#).unwrap();

    let hits = scanner::scan(dir.path()).unwrap();
    assert!(hits.is_empty(), "node_modules must be skipped");
}

#[test]
fn chooses_pnpm_when_lockfile_present() {
    let dir = mktemp("rhq-pnpm");
    let project = dir.path().join("api");
    fs::create_dir_all(&project).unwrap();
    fs::write(
        project.join("package.json"),
        r#"{"scripts":{"dev":"tsx src"}}"#,
    )
    .unwrap();
    fs::write(project.join("pnpm-lock.yaml"), "").unwrap();

    let hits = scanner::scan(dir.path()).unwrap();
    let s = &hits[0].suggestions[0];
    assert!(s.cmd.starts_with("pnpm "), "got: {}", s.cmd);
}
