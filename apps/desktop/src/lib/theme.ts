import { useCallback, useEffect, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';

export type Theme = 'light' | 'dark' | 'system';

/**
 * Shared with every boot script and side webview (quick-action,
 * tray-hint) — single key, single vocabulary.
 */
export const THEME_STORAGE_KEY = 'rhq-theme';

/**
 * Broadcast channel. Any window that changes the theme emits this event
 * so the main window + all sibling webviews stay in lock-step. Payload:
 * `{ theme: 'light' | 'dark' | 'system' }`. `system` is allowed so the
 * "system follows OS" intent survives the wire and every listener can
 * re-resolve it against its own `matchMedia` (the OS preference is the
 * same per-machine, so the result is identical everywhere).
 */
const THEME_EVENT = 'runhq://theme-changed';

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function effectiveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

/**
 * Writes the `dark` class + persists the preference. `system` is stored
 * as the *absence* of a key so subsequent reloads pick up OS drift.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const eff = effectiveTheme(theme);
  document.documentElement.classList.toggle('dark', eff === 'dark');
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage can be blocked in edge sandboxes — not fatal for UX.
  }
}

/**
 * Apply locally **and** announce to peers. Use this from one-off call
 * sites (command palette's "Toggle Theme", future tray menu item, …)
 * instead of touching localStorage + the `dark` class by hand.
 */
export async function broadcastTheme(theme: Theme): Promise<void> {
  applyTheme(theme);
  try {
    await emit(THEME_EVENT, { theme });
  } catch {
    // Emit can fail in non-Tauri contexts (unit tests, web preview).
  }
}

/**
 * Subscribe to cross-window theme changes. Returns a disposer.
 * Listeners receive the raw payload theme (including `system`), so they
 * can decide whether to feed it back into state (main app) or simply
 * re-apply the class (palette, tray hint).
 */
export function subscribeTheme(
  onChange: (theme: Theme) => void,
): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;
  listen<{ theme: Theme }>(THEME_EVENT, (e) => {
    if (!e.payload) return;
    const next = e.payload.theme;
    if (next === 'light' || next === 'dark' || next === 'system') onChange(next);
  })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch(() => {
      // swallow: event bus missing in non-Tauri context
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // noop
  }
  return 'system';
}

/**
 * Main-app hook: keeps local state, applies the theme to the DOM, and
 * participates in the cross-window sync dance. Calling `setTheme` is
 * authoritative — it updates this window *and* every listener in the
 * process (quick-action, tray-hint, …). Incoming events from peers
 * feed back into `setThemeState`, which is a no-op when the value is
 * unchanged so there is no emit-loop risk.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return subscribeTheme((incoming) => setThemeState(incoming));
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    // Fire-and-forget; `applyTheme` already ran via effect → local
    // window is authoritative even if the emit drops.
    void emit(THEME_EVENT, { theme: next }).catch(() => {});
  }, []);

  return { theme, effective: effectiveTheme(theme), setTheme };
}

/**
 * Lightweight hook for side webviews (quick-action, tray-hint). Just
 * subscribes to the theme channel and mirrors changes to the DOM +
 * localStorage. No local state, no emit. Use this when the window
 * doesn't *originate* theme changes on its own.
 */
export function useSyncedTheme(): void {
  useEffect(() => {
    return subscribeTheme((next) => applyTheme(next));
  }, []);
}
