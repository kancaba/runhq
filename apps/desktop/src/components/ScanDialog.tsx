import { useEffect, useState } from 'react';
import { FolderSearch, Loader2, Plus, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ipc } from '@/lib/ipc';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/cn';
import { runtimeMeta } from '@/lib/runtimes';
import type { ProjectCandidate, Suggestion } from '@/types';

interface Props {
  path: string;
  onClose: () => void;
}

interface CustomCmd {
  label: string;
  cmd: string;
}

export function ScanDialog({ path, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [customCmds, setCustomCmds] = useState<Record<string, CustomCmd[]>>({});
  const [addingCustom, setAddingCustom] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [customCmd, setCustomCmd] = useState('');
  const upsertService = useAppStore((s) => s.upsertService);
  const setSelected = useAppStore((s) => s.setSelected);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await ipc.scanDirectory(path);
        if (!alive) return;
        setCandidates(res);
      } catch (err) {
        console.error('scan failed', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  const toggle = (cwd: string, idx: number) => {
    setPicks((prev) => {
      const current = prev[cwd] ?? [];
      if (current.includes(idx)) {
        const filtered = current.filter((i) => i !== idx);
        if (filtered.length === 0) {
          const copy = { ...prev };
          delete copy[cwd];
          return copy;
        }
        return { ...prev, [cwd]: filtered };
      }
      return { ...prev, [cwd]: [...current, idx] };
    });
  };

  const addCustomCmd = (cwd: string) => {
    const label = customLabel.trim();
    const cmd = customCmd.trim();
    if (!label || !cmd) return;
    setCustomCmds((prev) => ({
      ...prev,
      [cwd]: [...(prev[cwd] ?? []), { label, cmd }],
    }));
    setCustomLabel('');
    setCustomCmd('');
    setAddingCustom(null);
  };

  const removeCustomCmd = (cwd: string, idx: number) => {
    setCustomCmds((prev) => {
      const list = prev[cwd] ?? [];
      return { ...prev, [cwd]: list.filter((_, i) => i !== idx) };
    });
  };

  const getEffectiveSuggestions = (c: ProjectCandidate): Suggestion[] => {
    const customs = (customCmds[c.cwd] ?? []).map((cc) => ({
      label: cc.label,
      cmd: cc.cmd,
    }));
    return [...c.suggestions, ...customs];
  };

  const totalSelected = Object.entries(picks).reduce((sum, [cwd, indices]) => {
    return sum + indices.length + (customCmds[cwd]?.length ?? 0);
  }, 0);

  const importSelected = async () => {
    const tasks = Object.entries(picks).map(async ([cwd, indices]) => {
      const candidate = candidates.find((c) => c.cwd === cwd);
      if (!candidate) return;
      const effective = getEffectiveSuggestions(candidate);
      const cmds = indices
        .map((i) => effective[i])
        .filter((s): s is NonNullable<typeof s> => s != null)
        .map((s) => ({ name: s.label, cmd: s.cmd }));
      const extraCmds = (customCmds[cwd] ?? []).map((cc) => ({
        name: cc.label,
        cmd: cc.cmd,
      }));
      const allCmds = [...cmds, ...extraCmds];
      if (allCmds.length === 0) return;
      const svc = await ipc.addService({
        name: candidate.name,
        cwd: candidate.cwd,
        cmds: allCmds,
        tags: [`runtime:${candidate.runtime}`],
      });
      upsertService(svc);
      setSelected(svc.id);
    });
    await Promise.allSettled(tasks);
    onClose();
  };

  if (loading) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="border-border bg-surface-overlay flex flex-col items-center gap-4 border px-10 py-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="bg-accent/20 absolute inset-0 animate-ping" />
            <div className="bg-accent flex h-12 w-12 items-center justify-center shadow-lg">
              <FolderSearch className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="text-center">
            <div className="text-fg text-[11px] font-semibold">Scanning folder…</div>
            <div className="text-fg-dim mt-1 max-w-xs truncate text-[10px]" title={path}>
              {path}
            </div>
          </div>
          <Loader2 className="text-accent h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <Dialog
      title="Detected projects"
      subtitle={path}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="text-fg-dim mr-auto text-[10px]">
            {totalSelected} command{totalSelected !== 1 ? 's' : ''} selected
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={importSelected} disabled={totalSelected === 0}>
            Import
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <div className="text-fg-dim py-6 text-center text-[11px]">
          Nothing runnable detected. Try a different folder or add a service manually.
        </div>
      ) : (
        <div className="space-y-1.5">
          {candidates.map((c) => {
            const effective = getEffectiveSuggestions(c);
            const selectedIndices = picks[c.cwd] ?? [];
            const customs = customCmds[c.cwd] ?? [];
            const isAdding = addingCustom === c.cwd;
            const customStartIdx = c.suggestions.length;

            return (
              <div
                key={c.cwd}
                className="border-border bg-surface-raised rounded-app-sm border p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-fg truncate text-[11px] font-medium">{c.name}</div>
                    <div className="text-fg-dim truncate text-[10px]" title={c.cwd}>
                      {c.cwd}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {selectedIndices.length + customs.length > 0 && (
                      <span className="bg-accent/10 text-accent rounded-app-sm px-1.5 py-0.5 text-[9px] font-semibold">
                        {selectedIndices.length + customs.length} selected
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-app-sm px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] uppercase',
                        runtimeMeta(c.runtime).bg,
                        runtimeMeta(c.runtime).color,
                      )}
                    >
                      {c.runtime}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {effective.map((s, i) => {
                    const isCustom = i >= customStartIdx;
                    const customIdx = isCustom ? i - customStartIdx : -1;
                    const selected = !isCustom && selectedIndices.includes(i);

                    if (isCustom) {
                      return (
                        <span
                          key={`custom-${i}`}
                          className="border-accent/30 bg-accent/5 text-accent rounded-app-sm inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px]"
                          title={s.cmd}
                        >
                          {s.label}
                          <button
                            type="button"
                            className="hover:text-status-error ml-0.5 transition"
                            onClick={() => removeCustomCmd(c.cwd, customIdx)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    }

                    return (
                      <button
                        key={`${s.label}-${i}`}
                        onClick={() => toggle(c.cwd, i)}
                        className={cn(
                          'rounded-app-sm border px-1.5 py-0.5 text-[10px] transition',
                          selected
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border bg-surface-muted text-fg-muted hover:border-border-strong hover:text-fg',
                        )}
                        title={s.cmd}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                {isAdding ? (
                  <div className="mt-2 flex items-center gap-1">
                    <input
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="Label"
                      className="border-border bg-surface-muted text-fg placeholder:text-fg-dim focus:border-accent rounded-app-sm h-5 w-20 border px-1.5 text-[10px] focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCustomCmd(c.cwd);
                        if (e.key === 'Escape') {
                          setAddingCustom(null);
                          setCustomLabel('');
                          setCustomCmd('');
                        }
                      }}
                      autoFocus
                    />
                    <input
                      value={customCmd}
                      onChange={(e) => setCustomCmd(e.target.value)}
                      placeholder="Command (e.g. make dev)"
                      className="border-border bg-surface-muted text-fg placeholder:text-fg-dim focus:border-accent rounded-app-sm h-5 min-w-0 flex-1 border px-1.5 text-[10px] focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCustomCmd(c.cwd);
                        if (e.key === 'Escape') {
                          setAddingCustom(null);
                          setCustomLabel('');
                          setCustomCmd('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => addCustomCmd(c.cwd)}
                      disabled={!customLabel.trim() || !customCmd.trim()}
                      className="text-accent hover:text-accent/80 disabled:text-fg-dim text-[10px] font-medium transition"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCustom(null);
                        setCustomLabel('');
                        setCustomCmd('');
                      }}
                      className="text-fg-dim hover:text-fg text-[10px] transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingCustom(c.cwd)}
                    className="text-fg-dim hover:text-fg hover:border-border rounded-app-sm mt-2 inline-flex items-center gap-1 border border-dashed border-transparent px-1.5 py-0.5 text-[10px] transition"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Custom command
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
