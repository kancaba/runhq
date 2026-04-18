import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayCircle, RotateCcw } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { ipc } from '@/lib/ipc';
import { cn } from '@/lib/cn';
import type { Prefs, Shortcuts } from '@/types';

const DEFAULT_SHORTCUTS: Shortcuts = {
  quick_action: 'Cmd+Shift+K',
};

const SHORTCUT_LABELS: Record<keyof Shortcuts, string> = {
  quick_action: 'Quick Action Bar',
};

const SHORTCUT_DESCRIPTIONS: Record<keyof Shortcuts, string> = {
  quick_action:
    'Open the Spotlight-like search bar from anywhere. The app window will be brought to front if hidden.',
};

function normalizeShortcut(raw: string): string {
  return raw
    .replace(/CommandOrControl/g, 'Cmd')
    .replace(/Command/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/Super/g, 'Cmd')
    .replace(/Meta/g, 'Cmd');
}

function parseKeyboardEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey)
    parts.push(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? 'Cmd' : 'Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key;
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
    const k = key.length === 1 ? key.toUpperCase() : key;
    parts.push(k);
  }
  return parts.join('+');
}

interface ShortcutRowProps {
  id: keyof Shortcuts;
  value: string;
  onChange: (id: keyof Shortcuts, value: string) => void;
  onReset: (id: keyof Shortcuts) => void;
}

function ShortcutRow({ id, value, onChange, onReset }: ShortcutRowProps) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (recording) inputRef.current?.focus();
  }, [recording]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();
      const shortcut = parseKeyboardEvent(e);
      const hasModifier = e.metaKey || e.ctrlKey;
      if (!hasModifier) return;
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      onChange(id, shortcut);
      setRecording(false);
    },
    [recording, id, onChange],
  );

  useEffect(() => {
    if (!recording) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, handleKeyDown]);

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-fg text-[12px] font-medium">{SHORTCUT_LABELS[id]}</div>
        <div className="text-fg-dim text-[10px]">{SHORTCUT_DESCRIPTIONS[id]}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          ref={inputRef}
          type="button"
          onBlur={() => setRecording(false)}
          onClick={() => setRecording(true)}
          className={cn(
            'border-border bg-surface-muted hover:border-border-strong rounded-app-sm min-w-[140px] border px-3 py-1.5 text-left transition',
            recording && 'border-accent ring-accent/30 ring-2',
          )}
        >
          {recording ? (
            <span className="text-accent text-[11px]">Press shortcut…</span>
          ) : (
            <span className="flex items-center gap-1">
              {value.split('+').map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-fg-dim text-[10px]">+</span>}
                  <Kbd className="text-[10px]">{part}</Kbd>
                </span>
              ))}
            </span>
          )}
        </button>
        <button
          type="button"
          title="Reset to default"
          onClick={() => onReset(id)}
          className="text-fg-dim hover:text-fg inline-flex h-6 w-6 items-center justify-center transition"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

interface ShortcutSettingsProps {
  onClose: () => void;
  /** Called when the user clicks "Replay welcome tour". The caller is
   *  responsible for actually opening the tour UI; we just surface the
   *  action because this dialog is the natural home for discoverability
   *  features. */
  onReplayTour?: () => void;
}

export function ShortcutSettings({ onClose, onReplayTour }: ShortcutSettingsProps) {
  const [shortcuts, setShortcuts] = useState<Shortcuts>(DEFAULT_SHORTCUTS);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.getPrefs().then((p) => {
      setPrefs(p);
      if (p.shortcuts) setShortcuts(p.shortcuts);
    });
  }, []);

  const handleChange = (id: keyof Shortcuts, value: string) => {
    setShortcuts((prev) => ({ ...prev, [id]: value }));
  };

  const handleReset = (id: keyof Shortcuts) => {
    setShortcuts((prev) => ({ ...prev, [id]: DEFAULT_SHORTCUTS[id] }));
  };

  const handleResetAll = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await ipc.updatePrefs({
        ...prefs,
        theme: prefs?.theme ?? null,
        last_scanned_dir: prefs?.last_scanned_dir ?? null,
        shortcuts,
      });
      setPrefs(updated);
      onClose();
    } catch (err) {
      console.error('failed to save shortcuts', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose} size="md">
      <div className="flex flex-col gap-1">
        {(Object.keys(DEFAULT_SHORTCUTS) as Array<keyof Shortcuts>).map((id) => (
          <ShortcutRow
            key={id}
            id={id}
            value={normalizeShortcut(shortcuts[id] ?? DEFAULT_SHORTCUTS[id])}
            onChange={handleChange}
            onReset={handleReset}
          />
        ))}
      </div>
      <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
        <Button variant="ghost" size="sm" onClick={handleResetAll}>
          Reset All
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Apply'}
          </Button>
        </div>
      </div>
      <p className="text-fg-dim mt-3 text-[10px]">
        Changes to the Quick Action shortcut take effect after restarting the app. A modifier key
        (Cmd/Ctrl) is required for all shortcuts.
      </p>

      {onReplayTour && (
        <div className="border-border mt-4 border-t pt-3">
          <button
            type="button"
            onClick={onReplayTour}
            className="text-fg-dim hover:text-fg inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Replay welcome tour
          </button>
        </div>
      )}
    </Dialog>
  );
}
