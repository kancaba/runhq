import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RotateCw } from 'lucide-react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Bottom-of-window banner that surfaces in-app updates.
 *
 * Why this is a full state machine (vs. a single "Update & Restart" click
 * handler): Tauri's updater downloads the new bundle synchronously from the
 * UI's point of view — `downloadAndInstall` can easily take 20–60s on a
 * 30–80MB macOS .app payload. Without a visible phase change, users click the
 * CTA, see nothing happen, assume the app froze, and force-quit. On next
 * launch the binary has already been swapped in, so the install "worked" but
 * the UX felt broken. We fix that by rendering a progress bar driven by the
 * updater's own download events, then flipping to an "Installing…" state
 * until `relaunch()` fires.
 */
type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; loaded: number; total: number | null }
  | { phase: 'installing'; version: string }
  | { phase: 'error'; version: string; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  // We cache the `Update` resource returned by `check()` so the install click
  // doesn't have to hit the update endpoint a second time. The handle is
  // invalidated (set back to null) whenever an install fails so that Retry
  // goes through a fresh `check()` — a half-consumed Resource can't be reused.
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const update = await check();
        if (cancelled) return;
        if (update) {
          updateRef.current = update;
          setState({ phase: 'available', version: update.version });
        }
      } catch (err) {
        // A failing check shouldn't nag the user — we just stay idle and the
        // next app launch will try again.
        console.error('update check failed', err);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async () => {
    let update = updateRef.current;
    let version = '';
    try {
      if (!update) {
        update = await check();
        if (!update) {
          setState({ phase: 'idle' });
          return;
        }
        updateRef.current = update;
      }
      version = update.version;
      let total: number | null = null;
      let loaded = 0;
      setState({ phase: 'downloading', version, loaded: 0, total: null });

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          setState({ phase: 'downloading', version, loaded: 0, total });
        } else if (event.event === 'Progress') {
          loaded += event.data.chunkLength;
          setState({ phase: 'downloading', version, loaded, total });
        } else if (event.event === 'Finished') {
          setState({ phase: 'installing', version });
        }
      });

      // downloadAndInstall resolves after the bundle has been swapped in.
      // Relaunch is the last step — if it throws, we surface it so the user
      // can quit/restart manually instead of being stuck on an install screen.
      await relaunch();
    } catch (err) {
      console.error('update install failed', err);
      updateRef.current = null;
      setState({
        phase: 'error',
        version,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (state.phase === 'idle') return null;

  const pct =
    state.phase === 'downloading' && state.total
      ? Math.min(100, Math.round((state.loaded / state.total) * 100))
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-accent/25 bg-accent/10 text-fg flex items-center gap-3 border-t px-4 py-2 text-[12px]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {state.phase === 'available' && (
          <>
            <span className="bg-accent h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
            <span className="truncate">
              <span className="text-accent font-semibold">RunHQ {state.version}</span> available
            </span>
          </>
        )}

        {state.phase === 'downloading' && (
          <>
            <Loader2 className="text-accent h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.4} />
            <span className="truncate">
              Downloading <span className="font-medium">RunHQ {state.version}</span>
              <span className="text-fg-muted ml-1 tabular-nums">
                {' · '}
                {state.total != null
                  ? `${formatBytes(state.loaded)} of ${formatBytes(state.total)}`
                  : formatBytes(state.loaded)}
              </span>
            </span>
            {pct != null && (
              <>
                <div
                  className="bg-accent/20 relative ml-2 h-1 w-28 shrink-0 overflow-hidden rounded-full"
                  aria-hidden
                >
                  <div
                    className="bg-accent absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-fg-muted shrink-0 text-[11px] tabular-nums">{pct}%</span>
              </>
            )}
          </>
        )}

        {state.phase === 'installing' && (
          <>
            <Loader2 className="text-accent h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.4} />
            <span className="truncate">
              Installing <span className="font-medium">RunHQ {state.version}</span>
              <span className="text-fg-muted ml-1">· restarting in a moment…</span>
            </span>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={2.4} />
            <span className="truncate">
              <span className="font-medium text-red-300">Update failed.</span>
              {state.message && (
                <span className="text-fg-muted ml-1 truncate">{state.message}</span>
              )}
            </span>
          </>
        )}
      </div>

      {state.phase === 'available' && (
        <button
          type="button"
          onClick={install}
          className="btn-primary rounded-app-sm shrink-0 px-3 py-1 text-[11px] font-medium"
        >
          Update &amp; Restart
        </button>
      )}

      {state.phase === 'error' && (
        <button
          type="button"
          onClick={install}
          className="btn-chrome rounded-app-sm flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
        >
          <RotateCw className="h-3 w-3" strokeWidth={2.4} />
          Retry
        </button>
      )}
    </div>
  );
}
