//! Cross-platform TCP listener inspection.
//!
//! Uses the `listeners` crate for the cross-platform bit. We deliberately
//! filter to TCP listeners: developers care about web servers and RPC
//! endpoints, not about every UDP socket the OS keeps open.

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;
use sysinfo::System;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
pub struct ListeningPort {
    pub port: u16,
    pub pid: u32,
    pub process_name: String,
    /// Full parent chain of `pid`, ordered nearest-parent first up to PID 1 / init.
    /// Used so UIs can match listeners to a supervised process whose workers forked.
    #[serde(default)]
    pub ancestor_pids: Vec<u32>,
}

/// Build a child-pid -> parent-pid map via sysinfo. Cheap compared to port lookup.
fn parent_map() -> HashMap<u32, u32> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.processes()
        .iter()
        .filter_map(|(pid, proc)| proc.parent().map(|ppid| (pid.as_u32(), ppid.as_u32())))
        .collect()
}

fn ancestors_of(pid: u32, parents: &HashMap<u32, u32>) -> Vec<u32> {
    let mut chain = Vec::new();
    let mut cur = pid;
    // Cap the walk so a pathological cycle can't livelock us.
    for _ in 0..64 {
        match parents.get(&cur) {
            Some(&ppid) if ppid != 0 && ppid != cur => {
                chain.push(ppid);
                cur = ppid;
            }
            _ => break,
        }
    }
    chain
}

/// Return all local TCP listeners, deduplicated and sorted by port.
pub fn list() -> AppResult<Vec<ListeningPort>> {
    let all = listeners::get_all().map_err(|e| AppError::Other(e.to_string()))?;
    let parents = parent_map();

    let mut out: Vec<ListeningPort> = all
        .into_iter()
        .filter(|l| matches!(l.protocol, listeners::Protocol::TCP))
        .filter(|l| l.socket.port() != 0)
        .map(|l| ListeningPort {
            port: l.socket.port(),
            pid: l.process.pid,
            process_name: l.process.name.clone(),
            ancestor_pids: ancestors_of(l.process.pid, &parents),
        })
        .collect();

    out.sort_by_key(|p| p.port);
    out.dedup_by(|a, b| a.port == b.port && a.pid == b.pid);
    Ok(out)
}

/// Attempt to kill every process listening on `port`.
///
/// Unix: SIGTERM → 1s grace → SIGKILL for stragglers.
/// Windows: `TerminateProcess` (non-graceful) via sysinfo.
pub fn kill_port(port: u16) -> AppResult<Vec<u32>> {
    let victims: Vec<u32> = list()?
        .into_iter()
        .filter(|l| l.port == port)
        .map(|l| l.pid)
        .collect();

    if victims.is_empty() {
        return Ok(Vec::new());
    }

    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        for pid in &victims {
            let _ = kill(Pid::from_raw(*pid as i32), Signal::SIGTERM);
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
        let still = list()?;
        for v in &victims {
            if still.iter().any(|l| l.pid == *v) {
                let _ = kill(Pid::from_raw(*v as i32), Signal::SIGKILL);
            }
        }
    }

    #[cfg(not(unix))]
    {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        for pid in &victims {
            if let Some(proc) = sys.process(sysinfo::Pid::from_u32(*pid)) {
                proc.kill();
            }
        }
    }

    Ok(victims)
}

/// Poll until `port` is listening, or `timeout` elapses.
/// Returns `true` if the port became ready.
pub async fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .is_ok()
        {
            return true;
        }
        if tokio::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}
