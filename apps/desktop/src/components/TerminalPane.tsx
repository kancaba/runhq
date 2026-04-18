import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { listen } from '@tauri-apps/api/event';
import { ipc } from '@/lib/ipc';

interface Props {
  id: string;
  cwd: string;
}

function cssVar(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return '#000000';
  if (raw.startsWith('#')) return raw;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
    return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  return raw;
}

const NERD_FONT_STACK =
  '"MesloLGS NF", "MesloLGS Nerd Font", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "Hack Nerd Font", "Menlo", "Monaco", "Consolas", "Courier New", monospace';

function buildTheme(): Record<string, string> {
  const isDark = document.documentElement.classList.contains('dark');
  const base: Record<string, string> = {
    background: cssVar('--surface-muted'),
    foreground: cssVar('--fg'),
    cursor: cssVar('--accent'),
  };
  if (isDark) {
    return {
      ...base,
      cursorAccent: cssVar('--surface'),
      selectionBackground: cssVar('--accent') + '44',
      selectionForeground: cssVar('--fg'),
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    };
  }
  return {
    ...base,
    cursorAccent: '#ffffff',
    selectionBackground: cssVar('--accent') + '33',
    selectionForeground: '#1e2028',
    black: '#e4e4e8',
    red: '#e0203e',
    green: '#058452',
    yellow: '#946a08',
    blue: '#4138c2',
    magenta: '#a0208a',
    cyan: '#0a7375',
    white: '#3f4454',
    brightBlack: '#b0b3bc',
    brightRed: '#e0203e',
    brightGreen: '#058452',
    brightYellow: '#946a08',
    brightBlue: '#4138c2',
    brightMagenta: '#a0208a',
    brightCyan: '#0a7375',
    brightWhite: '#1e2028',
  };
}

export function TerminalPane({ id, cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: NERD_FONT_STACK,
      letterSpacing: 0,
      lineHeight: 1.25,
      scrollback: 10_000,
      theme: buildTheme(),
      allowProposedApi: true,
      allowTransparency: false,
    });

    const unicodeAddon = new Unicode11Addon();
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = '11';

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      fit.fit();
      const { cols, rows } = term;
      void ipc.terminalCreate(id, cwd, cols, rows);
      // Drop the caret straight into the terminal the moment it mounts —
      // users almost always want to start typing immediately (new tab, new
      // shell, switched back from another panel). Focusing here instead of
      // relying on the user to click the empty black box saves a click per
      // terminal open and matches the muscle memory of every modern IDE's
      // integrated terminal.
      term.focus();
    });

    term.onData((data) => {
      const encoded = new TextEncoder().encode(data);
      void ipc.terminalWrite(id, Array.from(encoded));
    });

    let alive = true;
    const unsubPromise = listen<{ id: string; data: number[] }>('terminal://output', (event) => {
      if (event.payload.id === id && alive) {
        const bytes = new Uint8Array(event.payload.data);
        term.write(bytes);
      }
    });

    const observer = new MutationObserver(() => {
      if (!alive) return;
      term.options.theme = buildTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!alive) return;
      try {
        fit.fit();
        const { cols: c, rows: r } = term;
        void ipc.terminalResize(id, c, r);
      } catch {
        // ignore fit errors during teardown
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      alive = false;
      observer.disconnect();
      resizeObserver.disconnect();
      void ipc.terminalDestroy(id);
      void unsubPromise.then((fn) => fn());
      term.dispose();
    };
  }, [id, cwd]);

  return <div ref={containerRef} className="h-full w-full" style={{ minHeight: '200px' }} />;
}
