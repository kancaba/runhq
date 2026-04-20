import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Zap } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { cn } from '@/lib/cn';
import { useSyncedTheme } from '@/lib/theme';
import { ipc } from '@/lib/ipc';
import type { CommandStatus, ServiceDef, ServiceId, StackDef, Status } from '@/types';
import { isRunning, isSelectable, type FilterMode, type ListItem, type ServiceCmd } from './types';
import { fetchServices, fetchStatus, focusMainWindow } from './hooks';
import { buildItems } from './items';
import { renderRow, type RenderRowDeps } from './renderers';

export function QuickActionBar() {
  useSyncedTheme();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [stacks, setStacks] = useState<StackDef[]>([]);
  const [cmdStatuses, setCmdStatuses] = useState<Record<ServiceId, CommandStatus[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) inputRef.current?.focus();
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch(() => {});
    ipc
      .listStacks()
      .then(setStacks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all(
      services.map(async (svc) => {
        try {
          return [svc.id, (await fetchStatus(svc.id)) as CommandStatus[]] as const;
        } catch {
          return [svc.id, [] as CommandStatus[]] as const;
        }
      }),
    ).then((entries) => {
      const map: Record<string, CommandStatus[]> = {};
      for (const [id, cmds] of entries) map[id] = cmds;
      setCmdStatuses(map);
    });
  }, [services]);

  useEffect(() => {
    setCursor(0);
  }, [query, filter]);

  useEffect(() => {
    scrollRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const hide = useCallback(() => {
    getCurrentWindow().hide();
    setQuery('');
    setCursor(0);
    setFilter('all');
    setExpandedId(null);
  }, []);

  const refreshStatus = useCallback(async (id: ServiceId) => {
    try {
      const cmds = await fetchStatus(id);
      setCmdStatuses((prev) => ({ ...prev, [id]: cmds }));
    } catch {
      // non-critical: status fetch best-effort
    }
  }, []);

  const getCmds = useCallback(
    (svc: ServiceDef): ServiceCmd[] =>
      svc.cmds.map((c) => {
        const cs = (cmdStatuses[svc.id] ?? []).find((s) => s.name === c.name);
        return { name: c.name, cmd: c.cmd, status: (cs?.status ?? 'stopped') as Status };
      }),
    [cmdStatuses],
  );

  const expandedService = useMemo(() => {
    if (!expandedId || expandedId.startsWith('stack:')) return null;
    return services.find((s) => s.id === expandedId) ?? null;
  }, [expandedId, services]);

  const expandedStack = useMemo(() => {
    if (!expandedId || !expandedId.startsWith('stack:')) return null;
    const sid = expandedId.slice('stack:'.length);
    return stacks.find((s) => s.id === sid) ?? null;
  }, [expandedId, stacks]);

  const items = useMemo<ListItem[]>(
    () =>
      buildItems({
        query,
        filter,
        services,
        stacks,
        expandedService,
        expandedStack,
        getCmds,
        hide,
        refreshStatus,
        focusMainWindow,
      }),
    [services, stacks, query, filter, expandedService, expandedStack, getCmds, hide, refreshStatus],
  );

  useEffect(() => {
    if (expandedService || expandedStack) {
      setQuery('');
    }
  }, [expandedService, expandedStack]);

  useEffect(() => {
    if (items.length === 0) return;
    const current = items[cursor];
    if (isSelectable(current)) return;
    for (let n = cursor + 1; n < items.length; n++) {
      if (isSelectable(items[n])) {
        setCursor(n);
        return;
      }
    }
    for (let n = cursor - 1; n >= 0; n--) {
      if (isSelectable(items[n])) {
        setCursor(n);
        return;
      }
    }
  }, [items, cursor]);

  const execute = useCallback(
    async (item: ListItem) => {
      switch (item.type) {
        case 'service':
          setExpandedId(item.service.id);
          break;
        case 'stack':
          setExpandedId(`stack:${item.stack.id}`);
          break;
        case 'expanded-stack':
          setExpandedId(null);
          break;
        case 'stack-action':
          await item.run();
          break;
        case 'expanded-header':
          setExpandedId(null);
          break;
        case 'expanded-cmd':
          if (isRunning(item.cmd.status)) {
            await ipc.stopServiceCmd(item.serviceId, item.cmd.name);
          } else {
            await ipc.startServiceCmd(item.serviceId, item.cmd.name);
          }
          await refreshStatus(item.serviceId);
          break;
        case 'cmd':
          if (isRunning(item.status)) {
            await ipc.stopServiceCmd(item.serviceId, item.cmdName);
          } else {
            await ipc.startServiceCmd(item.serviceId, item.cmdName);
          }
          await refreshStatus(item.serviceId);
          break;
        case 'sub-action':
          await item.run();
          break;
        case 'app-action':
          await item.run();
          break;
      }
    },
    [refreshStatus],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Accept either Cmd (macOS) or Ctrl (Windows/Linux) as the modifier so
    // the `⌘1…⌘4` / `Ctrl+1…Ctrl+4` affordance shown in the list actually
    // triggers on every platform — previously this was macOS-only and the
    // labels were misleading on Windows/Linux.
    if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      const action = items.find(
        (it): it is Extract<typeof it, { type: 'app-action' }> =>
          it.type === 'app-action' &&
          it.id === ['open-app', 'scan', 'toggle-theme', 'shortcuts'][Number(e.key) - 1],
      );
      if (action) execute(action);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (expandedId) {
        setExpandedId(null);
        return;
      }
      if (filter !== 'all') {
        setFilter('all');
        return;
      }
      hide();
      return;
    }
    if (e.key === 'Backspace' && expandedId && query === '') {
      e.preventDefault();
      setExpandedId(null);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => {
        for (let n = i + 1; n < items.length; n++) {
          if (isSelectable(items[n])) return n;
        }
        return i;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => {
        for (let n = i - 1; n >= 0; n--) {
          if (isSelectable(items[n])) return n;
        }
        return i;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const item = items[cursor];
      if (item?.type === 'service') {
        setExpandedId(item.service.id);
      } else if (item?.type === 'stack') {
        setExpandedId(`stack:${item.stack.id}`);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (expandedId) {
        setExpandedId(null);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[cursor];
      if (item && item.type !== 'header' && item.type !== 'cmd-header') execute(item);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setFilter((f) => {
        const modes: FilterMode[] = [
          'all',
          'running',
          'stopped',
          'frontend',
          'backend',
          'database',
          'infra',
          'worker',
          'tooling',
        ];
        const idx = modes.indexOf(f);
        const delta = e.shiftKey ? -1 : 1;
        const next = (idx + delta + modes.length) % modes.length;
        return modes[next]!;
      });
    }
  };

  const filters: Array<{ key: FilterMode; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'running', label: 'Running' },
    { key: 'stopped', label: 'Stopped' },
    { key: 'frontend', label: 'Frontend' },
    { key: 'backend', label: 'Backend' },
    { key: 'database', label: 'Database' },
    { key: 'infra', label: 'Infra' },
    { key: 'worker', label: 'Worker' },
    { key: 'tooling', label: 'Tooling' },
  ];

  const renderRowDeps: RenderRowDeps = {
    cursor,
    execute,
    setCursor,
    setExpandedId,
    refreshStatus,
  };

  const drillName = expandedService?.name ?? expandedStack?.name ?? null;
  const inDrill = Boolean(drillName);

  return (
    <div
      className="pointer-events-auto flex h-screen w-screen items-center justify-center pb-[8vh]"
      onClick={hide}
    >
      <div
        className="quick-action-panel animate-fade-in pointer-events-auto flex w-[620px] flex-col overflow-hidden"
        style={{ maxHeight: 'min(520px, 78vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          {inDrill ? (
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              className="text-fg-dim hover:text-fg hover:bg-surface-muted/60 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition"
              title="Back"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <Zap className="text-accent h-[18px] w-[18px] shrink-0" strokeWidth={2.25} />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inDrill ? `Filter ${drillName}…` : 'Search services, commands, actions…'}
            className="qa-search-input text-fg placeholder:text-fg-dim/80 h-7 w-full bg-transparent text-[15px] font-normal tracking-[-0.01em]"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>

        {!inDrill && (
          <div className="border-border/30 flex flex-wrap items-center gap-1 gap-y-1 border-b px-4 pb-2">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setCursor(0);
                }}
                className={cn(
                  'rounded-app-sm shrink-0 px-2.5 py-0.5 text-[10px] font-medium transition',
                  filter === f.key
                    ? 'bg-accent/15 text-accent'
                    : 'text-fg-dim hover:bg-surface-muted hover:text-fg',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="qa-list min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 && (
            <div className="text-fg-dim py-12 text-center text-[12px]">
              {inDrill
                ? 'No matching commands or actions'
                : services.length === 0
                  ? 'No services configured'
                  : 'No results'}
            </div>
          )}
          {!inDrill && items[0]?.type === 'app-action' && (
            <div className="qa-section-header">Actions</div>
          )}
          {items.map((item, i) => renderRow(item, i, renderRowDeps))}
        </div>

        <div className="border-border/30 bg-surface-muted/30 border-t px-4 py-1.5">
          <div className="text-fg-dim flex items-center gap-3 text-[10px]">
            <span>↑↓ navigate</span>
            {inDrill ? (
              <>
                <span>⏎ run</span>
                <span>← back</span>
                <span>⌫ empty=back</span>
              </>
            ) : (
              <>
                <span>→ details</span>
                <span>⏎ select</span>
                <span>↹ category</span>
              </>
            )}
            <span>esc {inDrill ? 'back' : 'close'}</span>
            <span className="ml-auto flex items-center gap-1">
              <Zap className="text-accent h-2.5 w-2.5" />
              RunHQ
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
