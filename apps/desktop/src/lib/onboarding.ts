/**
 * Onboarding / first-run flags.
 *
 * Kept intentionally tiny and localStorage-only — these are purely UI hints
 * that can safely reset (e.g. if a user clears webview storage they just see
 * the tour again). Persisting to `runhq-core` prefs would be overkill for
 * something the user can always re-trigger from the settings.
 *
 * Versioned keys so future tour revisions can re-introduce themselves to
 * existing users without a migration.
 */

const TOUR_SEEN_KEY = 'runhq.onboarding.tour.v1';
const TRAY_HINT_SEEN_KEY = 'runhq.onboarding.tray-hint.v1';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / quota errors are non-fatal — the worst case is the
    // user sees the tour an extra time next launch.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // no-op
  }
}

export function hasSeenTour(): boolean {
  return safeGet(TOUR_SEEN_KEY) === '1';
}

export function markTourSeen(): void {
  safeSet(TOUR_SEEN_KEY, '1');
}

export function resetTour(): void {
  safeRemove(TOUR_SEEN_KEY);
}

export function hasSeenTrayHint(): boolean {
  return safeGet(TRAY_HINT_SEEN_KEY) === '1';
}

export function markTrayHintSeen(): void {
  safeSet(TRAY_HINT_SEEN_KEY, '1');
}

export function resetTrayHint(): void {
  safeRemove(TRAY_HINT_SEEN_KEY);
}
