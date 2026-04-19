import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CATEGORIES, categoryForTags, type Category } from '@/lib/categories';
import { RUNTIMES, runtimeFromTags, inferRuntimeFromCmds } from '@/lib/runtimes';
import { useAppStore, type SidebarGroupBy, type SidebarStatusFilter } from '@/store/useAppStore';

/**
 * Single surface that replaces the stacked Category/Runtime pill lists the
 * sidebar used to render inline. The goal is to keep the sidebar's default
 * state quiet — a flat alphabetical service list — while still exposing
 * every slicing option one click away for power users. All selections
 * persist via the store (localStorage-backed).
 */

const STATUS_OPTIONS: Array<{ key: SidebarStatusFilter; label: string; hint: string }> = [
  { key: 'all', label: 'All', hint: 'Show everything' },
  { key: 'running', label: 'Running', hint: 'Live processes only' },
  { key: 'stopped', label: 'Stopped', hint: 'Idle services only' },
];

const GROUP_OPTIONS: Array<{ key: SidebarGroupBy; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'category', label: 'Category' },
  { key: 'runtime', label: 'Runtime' },
  { key: 'status', label: 'Status' },
];

export function SidebarFilterMenu() {
  const services = useAppStore((s) => s.services);
  const categoryFilter = useAppStore((s) => s.categoryFilter);
  const runtimeFilter = useAppStore((s) => s.runtimeFilter);
  const statusFilter = useAppStore((s) => s.sidebarStatusFilter);
  const groupBy = useAppStore((s) => s.sidebarGroupBy);
  const setCategoryFilter = useAppStore((s) => s.setCategoryFilter);
  const setRuntimeFilter = useAppStore((s) => s.setRuntimeFilter);
  const setStatusFilter = useAppStore((s) => s.setSidebarStatusFilter);
  const setGroupBy = useAppStore((s) => s.setSidebarGroupBy);
  const resetAll = useAppStore((s) => s.resetSidebarFilters);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  /**
   * Menu lives in a portal at document.body so it can escape the sidebar's
   * `overflow-x-hidden` clip. We compute a fixed position against the
   * trigger's rect and re-run on resize/scroll while open.
   */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const POPOVER_W = 264;
  const GAP = 6;

  // Only show categories/runtimes that actually appear on one or more
  // services — hiding empty buckets removes ~half the noise on small repos.
  const { categoryBuckets, runtimeBuckets } = useMemo(() => {
    const catCounts = new Map<string, number>();
    const rtCounts = new Map<string, number>();
    for (const svc of services) {
      const cat = categoryForTags(svc.tags).key;
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
      const rt = runtimeFromTags(svc.tags) ?? inferRuntimeFromCmds(svc.cmds);
      if (rt) rtCounts.set(rt, (rtCounts.get(rt) ?? 0) + 1);
    }
    return {
      categoryBuckets: CATEGORIES.filter((c) => (catCounts.get(c.key) ?? 0) > 0).map((c) => ({
        ...c,
        count: catCounts.get(c.key) ?? 0,
      })),
      runtimeBuckets: RUNTIMES.filter((r) => (rtCounts.get(r.key) ?? 0) > 0).map((r) => ({
        ...r,
        count: rtCounts.get(r.key) ?? 0,
      })),
    };
  }, [services]);

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (groupBy !== 'none' ? 1 : 0) +
    categoryFilter.length +
    runtimeFilter.length;

  // Click-outside must account for the portaled popover as well as the
  // inline trigger — plain `wrapRef.contains` would miss portal children.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Position the portaled popover under the trigger, right-aligned. Clamp
  // to viewport so it never hangs off the edge on narrow windows.
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const left = Math.min(Math.max(8, rect.right - POPOVER_W), viewportW - POPOVER_W - 8);
      let top = rect.bottom + GAP;
      // If the popover would overflow the bottom, flip above the trigger.
      const popH = popoverRef.current?.offsetHeight ?? 420;
      if (top + popH > viewportH - 8) {
        top = Math.max(8, rect.top - GAP - popH);
      }
      setPos({ top, left });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  const toggleCategory = (key: string) => {
    if (categoryFilter.includes(key)) setCategoryFilter(categoryFilter.filter((k) => k !== key));
    else setCategoryFilter([...categoryFilter, key]);
  };
  const toggleRuntime = (key: string) => {
    if (runtimeFilter.includes(key)) setRuntimeFilter(runtimeFilter.filter((k) => k !== key));
    else setRuntimeFilter([...runtimeFilter, key]);
  };

  const popover = open && pos && (
    <div
      ref={popoverRef}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_W }}
      className="border-border bg-surface-raised rounded-app-lg animate-fade-in z-[60] overflow-hidden border shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
    >
      <FilterMenuBody
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        categoryBuckets={categoryBuckets}
        runtimeBuckets={runtimeBuckets}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        runtimeFilter={runtimeFilter}
        setRuntimeFilter={setRuntimeFilter}
        toggleCategory={toggleCategory}
        toggleRuntime={toggleRuntime}
        activeFilterCount={activeFilterCount}
        onClearAll={() => resetAll()}
      />
    </div>
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter & group"
        aria-expanded={open}
        title="Filter & group"
        className={cn(
          'rounded-app-sm text-fg-muted hover:bg-surface-overlay hover:text-fg relative inline-flex h-5 w-5 items-center justify-center transition',
          open && 'bg-surface-overlay text-fg',
          activeFilterCount > 0 && !open && 'text-accent',
        )}
      >
        <SlidersHorizontal className="h-3 w-3" />
        {activeFilterCount > 0 && (
          <span className="bg-accent text-accent-fg absolute -top-0.5 -right-0.5 flex h-2 w-2 items-center justify-center rounded-full" />
        )}
      </button>
      {popover && createPortal(popover, document.body)}
    </div>
  );
}

interface FilterBody {
  statusFilter: SidebarStatusFilter;
  setStatusFilter: (v: SidebarStatusFilter) => void;
  groupBy: SidebarGroupBy;
  setGroupBy: (v: SidebarGroupBy) => void;
  categoryBuckets: Array<Category & { count: number }>;
  runtimeBuckets: Array<{ key: string; label: string; color: string; count: number }>;
  categoryFilter: string[];
  setCategoryFilter: (keys: string[]) => void;
  runtimeFilter: string[];
  setRuntimeFilter: (keys: string[]) => void;
  toggleCategory: (key: string) => void;
  toggleRuntime: (key: string) => void;
  activeFilterCount: number;
  onClearAll: () => void;
}

function FilterMenuBody({
  statusFilter,
  setStatusFilter,
  groupBy,
  setGroupBy,
  categoryBuckets,
  runtimeBuckets,
  categoryFilter,
  setCategoryFilter,
  runtimeFilter,
  setRuntimeFilter,
  toggleCategory,
  toggleRuntime,
  activeFilterCount,
  onClearAll,
}: FilterBody) {
  return (
    <>
      <div className="max-h-[70vh] overflow-y-auto">
        <MenuSection label="Show">
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  title={opt.hint}
                  className={cn(
                    'rounded-app-sm flex-1 px-2 py-1 text-[11px] font-medium transition',
                    active
                      ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.25)]'
                      : 'text-fg-muted hover:bg-surface-overlay hover:text-fg',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </MenuSection>

        <div className="border-border/60 border-t" />

        <MenuSection label="Group by">
          <div className="grid grid-cols-4 gap-1">
            {GROUP_OPTIONS.map((opt) => {
              const active = groupBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setGroupBy(opt.key)}
                  className={cn(
                    'rounded-app-sm px-2 py-1 text-[11px] font-medium transition',
                    active
                      ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.25)]'
                      : 'text-fg-muted hover:bg-surface-overlay hover:text-fg',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </MenuSection>

        {categoryBuckets.length > 1 && (
          <>
            <div className="border-border/60 border-t" />
            <MenuSection
              label="Category"
              action={
                categoryFilter.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter([])}
                    className="text-fg-dim hover:text-fg text-[10px] font-medium"
                  >
                    Reset
                  </button>
                ) : null
              }
            >
              <div className="space-y-0.5">
                {categoryBuckets.map((c) => (
                  <CheckRow
                    key={c.key}
                    checked={categoryFilter.includes(c.key)}
                    onToggle={() => toggleCategory(c.key)}
                    leading={<span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden />}
                    label={c.label}
                    count={c.count}
                    tone={c as Category}
                  />
                ))}
              </div>
            </MenuSection>
          </>
        )}

        {runtimeBuckets.length > 1 && (
          <>
            <div className="border-border/60 border-t" />
            <MenuSection
              label="Runtime"
              action={
                runtimeFilter.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setRuntimeFilter([])}
                    className="text-fg-dim hover:text-fg text-[10px] font-medium"
                  >
                    Reset
                  </button>
                ) : null
              }
            >
              <div className="space-y-0.5">
                {runtimeBuckets.map((r) => (
                  <CheckRow
                    key={r.key}
                    checked={runtimeFilter.includes(r.key)}
                    onToggle={() => toggleRuntime(r.key)}
                    leading={
                      <span
                        className={cn(
                          'font-mono text-[9.5px] font-semibold tracking-wide uppercase',
                          r.color,
                        )}
                      >
                        {r.label}
                      </span>
                    }
                    label=""
                    count={r.count}
                  />
                ))}
              </div>
            </MenuSection>
          </>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className="border-border/60 bg-surface-overlay/60 flex items-center justify-between border-t px-3 py-2">
          <span className="text-fg-dim text-[10.5px]">
            {activeFilterCount} active{activeFilterCount === 1 ? ' filter' : ' filters'}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-fg-muted hover:text-fg flex items-center gap-1 text-[11px] font-medium transition"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        </div>
      )}
    </>
  );
}

function MenuSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-2.5 pb-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-fg-dim text-[9.5px] font-semibold tracking-[0.14em] uppercase">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function CheckRow({
  checked,
  onToggle,
  leading,
  label,
  count,
}: {
  checked: boolean;
  onToggle: () => void;
  leading: React.ReactNode;
  label: string;
  count: number;
  tone?: Category;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'rounded-app-sm group flex w-full items-center gap-2 px-2 py-1 text-left transition',
        checked ? 'bg-accent/10 text-fg' : 'text-fg-muted hover:bg-surface-overlay hover:text-fg',
      )}
    >
      <span
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition',
          checked
            ? 'bg-accent border-accent text-accent-fg'
            : 'border-border/80 group-hover:border-border-strong',
        )}
      >
        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {leading}
        {label && <span className="truncate text-[11.5px] font-medium">{label}</span>}
      </span>
      <span className="text-fg-dim text-[10px] tabular-nums">{count}</span>
    </button>
  );
}
