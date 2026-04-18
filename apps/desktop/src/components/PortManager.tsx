import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ExternalLink, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { useAppStore } from '@/store/useAppStore';
import { ipc } from '@/lib/ipc';
import { cn } from '@/lib/cn';
import { localUrl } from '@/lib/url';
import type { ListeningPort } from '@/types';

interface Props {
  onClose: () => void;
}

type Scope = 'apps' | 'all';

interface PortRow {
  port: ListeningPort;
  owner: { id: string; name: string } | null;
}

export function PortManager({ onClose }: Props) {
  const ports = useAppStore((s) => s.ports);
  const setPorts = useAppStore((s) => s.setPorts);
  const services = useAppStore((s) => s.services);
  const statuses = useAppStore((s) => s.statuses);

  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('apps');
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Reverse index: any PID owned by a running HQ service (direct or via a
  // supervised command) maps back to the service. Lets us attribute forked
  // workers (pnpm → next-dev → listener) to their parent service.
  const pidOwner = useMemo(() => {
    const map = new Map<number, { id: string; name: string }>();
    for (const svc of services) {
      const st = statuses[svc.id];
      if (!st) continue;
      const isRunning = st.status === 'running' || st.status === 'starting';
      if (!isRunning) continue;
      const owner = { id: svc.id, name: svc.name };
      if (st.pid != null) map.set(st.pid, owner);
      for (const c of st.commands ?? []) {
        if (c.pid != null) map.set(c.pid, owner);
      }
    }
    return map;
  }, [services, statuses]);

  const ownerOf = useCallback(
    (p: ListeningPort) => {
      const direct = pidOwner.get(p.pid);
      if (direct) return direct;
      for (const anc of p.ancestor_pids ?? []) {
        const hit = pidOwner.get(anc);
        if (hit) return hit;
      }
      // Declared-port fallback: a running service with a pinned `port` field
      // keeps being attributed even if PID lookup hasn't caught up yet.
      for (const svc of services) {
        if (svc.port == null || svc.port !== p.port) continue;
        const st = statuses[svc.id];
        if (st?.status !== 'running' && st?.status !== 'starting') continue;
        return { id: svc.id, name: svc.name };
      }
      return null;
    },
    [pidOwner, services, statuses],
  );

  const classified = useMemo<PortRow[]>(
    () => ports.map((p) => ({ port: p, owner: ownerOf(p) })),
    [ports, ownerOf],
  );

  const appPorts = useMemo(() => classified.filter((r) => r.owner != null), [classified]);

  const scoped = scope === 'apps' ? appPorts : classified;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(({ port: p, owner }) => {
      if (p.port.toString().includes(q)) return true;
      if (p.process_name.toLowerCase().includes(q)) return true;
      if (p.pid.toString().includes(q)) return true;
      if (owner?.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [scoped, search]);

  const handleKill = (port: number) => {
    setPendingConfirm({
      message: `Kill all processes on port ${port}?`,
      onConfirm: async () => {
        setPendingConfirm(null);
        setBusy(port);
        try {
          await ipc.killPort(port);
          const refreshed = await ipc.listPorts();
          setPorts(refreshed);
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const subtitle =
    scope === 'apps'
      ? `${appPorts.length} app port${appPorts.length === 1 ? '' : 's'}`
      : `${classified.length} listening port${classified.length === 1 ? '' : 's'}`;

  return (
    <Dialog title="Port Manager" subtitle={subtitle} onClose={onClose} size="lg">
      <div className="flex flex-col gap-2.5">
        {/* Scope toggle + search share one row so they read as filters,
            not as two separate toolbars. Counts live inside each segment so
            users know upfront whether switching to "All" will actually help. */}
        <div className="flex items-center gap-2">
          <SegmentedToggle
            value={scope}
            onChange={setScope}
            options={[
              { value: 'apps', label: 'Apps', count: appPorts.length },
              { value: 'all', label: 'All', count: classified.length },
            ]}
          />
          <div className="relative flex-1">
            <Search className="text-fg-dim absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                scope === 'apps' ? 'Search app ports…' : 'Search by port, process, service, or PID…'
              }
              className="border-border bg-surface-raised text-fg placeholder:text-fg-dim focus:border-accent rounded-app-sm h-7 w-full border pr-2 pl-7 text-[11px] transition focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-fg-dim py-10 text-center text-[11px]">
            {scope === 'apps' && appPorts.length === 0 ? (
              <span>
                No listening ports from your running services.
                <br />
                Start a service that binds a port to see it here.
              </span>
            ) : classified.length === 0 ? (
              'No listening ports detected.'
            ) : (
              'No matches.'
            )}
          </div>
        ) : (
          <div className="border-border rounded-app-sm overflow-hidden border">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="bg-surface-muted/70 text-fg-dim border-border border-b text-[9px] font-semibold tracking-wider uppercase">
                  <th className="px-2.5 py-1.5">Port</th>
                  <th className="px-2.5 py-1.5">PID</th>
                  <th className="px-2.5 py-1.5">Process</th>
                  <th className="px-2.5 py-1.5">Service</th>
                  {/* Header intentionally empty: actions reveal on row hover,
                      so a labelled column would create visual noise for a
                      purely utility affordance. `sr-only` keeps a11y honest. */}
                  <th className="w-[1%] px-2.5 py-1.5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ port: p, owner }) => {
                  const isBusy = busy === p.port;
                  return (
                    <tr
                      key={`${p.port}-${p.pid}`}
                      className="group border-border/70 hover:bg-surface-raised/40 border-t transition last:border-t-0"
                    >
                      <td className="px-2.5 py-1.5">
                        <span className="text-accent font-semibold tabular-nums">:{p.port}</span>
                      </td>
                      <td className="text-fg-dim px-2.5 py-1.5 tabular-nums">{p.pid}</td>
                      <td className="px-2.5 py-1.5">
                        <span className="text-fg-muted max-w-[220px] truncate">
                          {p.process_name}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5">
                        {owner ? (
                          <span className="bg-accent/10 text-accent rounded-app-sm px-1.5 py-0.5 text-[9px] font-medium">
                            {owner.name}
                          </span>
                        ) : (
                          <span className="text-fg-dim">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            title="Open in browser"
                            className="text-fg-dim hover:bg-accent/10 hover:text-accent rounded-app-sm inline-flex h-5 w-5 items-center justify-center transition"
                            onClick={() => void ipc.openUrl(localUrl(p.port))}
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            title="Kill port"
                            className={cn(
                              'rounded-app-sm inline-flex h-5 w-5 items-center justify-center transition',
                              isBusy
                                ? 'text-fg-dim opacity-50'
                                : 'text-fg-dim hover:bg-status-error/10 hover:text-status-error',
                            )}
                            onClick={() => void handleKill(p.port)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </Dialog>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/** Small pill-segmented toggle; count lives inside the segment so the
 *  "bigger bucket" is obvious without tooltips. Matches the Tabs idiom
 *  elsewhere in the app for visual family resemblance. */
function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
}) {
  return (
    <div
      role="tablist"
      className="border-border bg-surface-muted/70 rounded-app-sm inline-flex shrink-0 items-center gap-0 border p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-app-sm inline-flex h-6 items-center gap-1.5 px-2 text-[11px] font-medium transition',
              active ? 'bg-surface-overlay text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span>{opt.label}</span>
            <span
              className={cn('text-[10px] tabular-nums', active ? 'text-fg-muted' : 'text-fg-dim')}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
