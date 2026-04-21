import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, FolderSearch, Loader2, Plus, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ipc } from '@/lib/ipc';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/cn';
import { runtimeMeta } from '@/lib/runtimes';
import { CATEGORIES } from '@/lib/categories';
import type { ProjectCandidate } from '@/types';

interface Props {
  path: string;
  onClose: () => void;
}

interface CustomCmd {
  label: string;
  cmd: string;
}

interface ProjectConfig {
  selectedIndices: number[];
  customCmds: CustomCmd[];
  category: string;
}

type Step = 1 | 2;

export function ScanDialog({ path, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [configs, setConfigs] = useState<Record<string, ProjectConfig>>({});
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

  const toggleProject = (cwd: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else {
        next.add(cwd);
        if (!configs[cwd]) {
          const c = candidates.find((x) => x.cwd === cwd);
          setConfigs((prev) => ({
            ...prev,
            [cwd]: {
              selectedIndices: c ? [0] : [],
              customCmds: [],
              category: 'other',
            },
          }));
        }
      }
      return next;
    });
  };

  const toggleSuggestion = (cwd: string, idx: number) => {
    setConfigs((prev) => {
      const cfg = prev[cwd] ?? { selectedIndices: [], customCmds: [], category: 'other' };
      const current = cfg.selectedIndices;
      const next = current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx];
      return { ...prev, [cwd]: { ...cfg, selectedIndices: next } };
    });
  };

  const setCategory = (cwd: string, category: string) => {
    setConfigs((prev) => {
      const cfg = prev[cwd] ?? { selectedIndices: [], customCmds: [], category: 'other' };
      return { ...prev, [cwd]: { ...cfg, category } };
    });
  };

  const addCustomCmd = (cwd: string) => {
    const label = customLabel.trim();
    const cmd = customCmd.trim();
    if (!label || !cmd) return;
    setConfigs((prev) => {
      const cfg = prev[cwd] ?? { selectedIndices: [], customCmds: [], category: 'other' };
      return { ...prev, [cwd]: { ...cfg, customCmds: [...cfg.customCmds, { label, cmd }] } };
    });
    setCustomLabel('');
    setCustomCmd('');
    setAddingCustom(null);
  };

  const removeCustomCmd = (cwd: string, idx: number) => {
    setConfigs((prev) => {
      const cfg = prev[cwd] ?? { selectedIndices: [], customCmds: [], category: 'other' };
      return { ...prev, [cwd]: { ...cfg, customCmds: cfg.customCmds.filter((_, i) => i !== idx) } };
    });
  };

  const totalCommands = [...selectedProjects].reduce((sum, cwd) => {
    const cfg = configs[cwd];
    if (!cfg) return sum;
    return sum + cfg.selectedIndices.length + cfg.customCmds.length;
  }, 0);

  const goNext = () => setStep(2);
  const goBack = () => setStep(1);

  const importSelected = async () => {
    const tasks = [...selectedProjects].map(async (cwd) => {
      const candidate = candidates.find((c) => c.cwd === cwd);
      if (!candidate) return;
      const cfg = configs[cwd];
      if (!cfg) return;
      const effective = [
        ...candidate.suggestions,
        ...cfg.customCmds.map((cc) => ({ label: cc.label, cmd: cc.cmd })),
      ];
      const cmds = cfg.selectedIndices
        .map((i) => effective[i])
        .filter((s): s is NonNullable<typeof s> => s != null)
        .map((s) => ({ name: s.label, cmd: s.cmd }));
      const extraCmds = cfg.customCmds.map((cc) => ({ name: cc.label, cmd: cc.cmd }));
      const allCmds = [...cmds, ...extraCmds];
      if (allCmds.length === 0) return;
      const svc = await ipc.addService({
        name: candidate.name,
        cwd: candidate.cwd,
        cmds: allCmds,
        tags: [cfg.category],
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
      title={step === 1 ? 'Detected projects' : 'Configure imports'}
      subtitle={path}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="text-fg-dim mr-auto text-[10px]">
            {step === 1
              ? `${selectedProjects.size} project${selectedProjects.size !== 1 ? 's' : ''} selected`
              : `${totalCommands} command${totalCommands !== 1 ? 's' : ''} across ${selectedProjects.size} project${selectedProjects.size !== 1 ? 's' : ''}`}
          </span>
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={goNext} disabled={selectedProjects.size === 0}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={goBack} leftIcon={<ArrowLeft className="h-3 w-3" />}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={importSelected}
                disabled={totalCommands === 0}
                rightIcon={<ArrowRight className="h-3 w-3" />}
              >
                Import
              </Button>
            </>
          )}
        </>
      }
    >
      {candidates.length === 0 ? (
        <div className="text-fg-dim py-6 text-center text-[11px]">
          Nothing runnable detected. Try a different folder or add a service manually.
        </div>
      ) : step === 1 ? (
        <Step1
          candidates={candidates}
          selectedProjects={selectedProjects}
          onToggle={toggleProject}
        />
      ) : (
        <Step2
          candidates={candidates}
          selectedProjects={selectedProjects}
          configs={configs}
          addingCustom={addingCustom}
          customLabel={customLabel}
          customCmd={customCmd}
          onToggleSuggestion={toggleSuggestion}
          onSetCategory={setCategory}
          onAddCustom={addCustomCmd}
          onRemoveCustom={removeCustomCmd}
          onSetAddingCustom={setAddingCustom}
          onSetCustomLabel={setCustomLabel}
          onSetCustomCmd={setCustomCmd}
        />
      )}
    </Dialog>
  );
}

function Step1({
  candidates,
  selectedProjects,
  onToggle,
}: {
  candidates: ProjectCandidate[];
  selectedProjects: Set<string>;
  onToggle: (cwd: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {candidates.map((c) => {
        const selected = selectedProjects.has(c.cwd);
        return (
          <button
            key={c.cwd}
            type="button"
            onClick={() => onToggle(c.cwd)}
            className={cn(
              'border-border bg-surface-raised rounded-app-sm w-full border p-2.5 text-left transition',
              selected && 'border-accent/60 bg-accent/5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-fg truncate text-[11px] font-medium">{c.name}</div>
                {c.project_name && c.project_name !== c.name ? (
                  <div className="text-fg-dim truncate text-[10px]">
                    <span className="text-fg-muted">Project:</span> {c.project_name}
                  </div>
                ) : (
                  <div className="text-fg-dim truncate text-[10px]" title={c.cwd}>
                    {c.cwd}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-app-sm px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] uppercase',
                    runtimeMeta(c.runtime).bg,
                    runtimeMeta(c.runtime).color,
                  )}
                >
                  {c.runtime}
                </span>
                <div
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition',
                    selected ? 'border-accent bg-accent text-white' : 'border-border-strong',
                  )}
                >
                  {selected && <X className="h-2.5 w-2.5" strokeWidth={3} />}
                </div>
              </div>
            </div>
            <div className="text-fg-dim mt-1 flex flex-wrap gap-1">
              {c.suggestions.map((s) => (
                <span
                  key={s.label}
                  className="bg-surface-muted rounded-app-sm px-1.5 py-0.5 text-[9px]"
                  title={s.cmd}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Step2({
  candidates,
  selectedProjects,
  configs,
  addingCustom,
  customLabel,
  customCmd,
  onToggleSuggestion,
  onSetCategory,
  onAddCustom,
  onRemoveCustom,
  onSetAddingCustom,
  onSetCustomLabel,
  onSetCustomCmd,
}: {
  candidates: ProjectCandidate[];
  selectedProjects: Set<string>;
  configs: Record<string, ProjectConfig>;
  addingCustom: string | null;
  customLabel: string;
  customCmd: string;
  onToggleSuggestion: (cwd: string, idx: number) => void;
  onSetCategory: (cwd: string, category: string) => void;
  onAddCustom: (cwd: string) => void;
  onRemoveCustom: (cwd: string, idx: number) => void;
  onSetAddingCustom: (cwd: string | null) => void;
  onSetCustomLabel: (v: string) => void;
  onSetCustomCmd: (v: string) => void;
}) {
  const selected = candidates.filter((c) => selectedProjects.has(c.cwd));

  return (
    <div className="space-y-3">
      {selected.map((c) => {
        const cfg = configs[c.cwd] ?? {
          selectedIndices: [],
          customCmds: [],
          category: 'other',
        };
        const isAdding = addingCustom === c.cwd;

        return (
          <div key={c.cwd} className="border-border bg-surface-raised rounded-app-sm border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-fg truncate text-[12px] font-semibold">{c.name}</div>
                <div className="text-fg-dim truncate text-[10px]" title={c.cwd}>
                  {c.cwd}
                </div>
              </div>
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

            <div className="mt-2.5">
              <div className="text-fg-dim mb-1 text-[9px] font-semibold tracking-wider uppercase">
                Category
              </div>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => onSetCategory(c.cwd, cat.key)}
                    className={cn(
                      'rounded-app-sm border px-2 py-0.5 text-[10px] transition',
                      cfg.category === cat.key
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface-muted text-fg-muted hover:border-border-strong hover:text-fg',
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2.5">
              <div className="text-fg-dim mb-1 text-[9px] font-semibold tracking-wider uppercase">
                Commands
              </div>
              <div className="flex flex-wrap gap-1">
                {c.suggestions.map((s, i) => {
                  const selected = cfg.selectedIndices.includes(i);
                  return (
                    <button
                      key={`${s.label}-${i}`}
                      onClick={() => onToggleSuggestion(c.cwd, i)}
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
                {cfg.customCmds.map((cc, i) => (
                  <span
                    key={`custom-${i}`}
                    className="border-accent/30 bg-accent/5 text-accent rounded-app-sm inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px]"
                    title={cc.cmd}
                  >
                    {cc.label}
                    <button
                      type="button"
                      className="hover:text-status-error ml-0.5 transition"
                      onClick={() => onRemoveCustom(c.cwd, i)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>

              {isAdding ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <input
                    value={customLabel}
                    onChange={(e) => onSetCustomLabel(e.target.value)}
                    placeholder="Label"
                    className="border-border bg-surface-muted text-fg placeholder:text-fg-dim focus:border-accent rounded-app-sm h-5 w-20 border px-1.5 text-[10px] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onAddCustom(c.cwd);
                      if (e.key === 'Escape') {
                        onSetAddingCustom(null);
                        onSetCustomLabel('');
                        onSetCustomCmd('');
                      }
                    }}
                    autoFocus
                  />
                  <input
                    value={customCmd}
                    onChange={(e) => onSetCustomCmd(e.target.value)}
                    placeholder="Command (e.g. make dev)"
                    className="border-border bg-surface-muted text-fg placeholder:text-fg-dim focus:border-accent rounded-app-sm h-5 min-w-0 flex-1 border px-1.5 text-[10px] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onAddCustom(c.cwd);
                      if (e.key === 'Escape') {
                        onSetAddingCustom(null);
                        onSetCustomLabel('');
                        onSetCustomCmd('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onAddCustom(c.cwd)}
                    disabled={!customLabel.trim() || !customCmd.trim()}
                    className="text-accent hover:text-accent/80 disabled:text-fg-dim text-[10px] font-medium transition"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetAddingCustom(null);
                      onSetCustomLabel('');
                      onSetCustomCmd('');
                    }}
                    className="text-fg-dim hover:text-fg text-[10px] transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetAddingCustom(c.cwd)}
                  className="text-fg-dim hover:text-fg hover:border-border rounded-app-sm mt-1.5 inline-flex items-center gap-1 border border-dashed border-transparent px-1.5 py-0.5 text-[10px] transition"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Custom command
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
