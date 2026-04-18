import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/cn';
import { readDrag, endDrag, getActiveDrag } from './dnd';

export function UnassignedBlock({
  collapsed,
  onToggle,
  stacksCount,
  servicesCount,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  stacksCount: number;
  servicesCount: number;
  children: React.ReactNode;
}) {
  const total = stacksCount + servicesCount;
  const assignService = useAppStore((s) => s.assignServiceToSection);
  const assignStack = useAppStore((s) => s.assignStackToSection);
  const [isOver, setIsOver] = useState(false);

  const onDragEnter = (e: React.DragEvent) => {
    if (getActiveDrag() == null) return;
    e.preventDefault();
  };
  const onDragOver = (e: React.DragEvent) => {
    if (getActiveDrag() == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) setIsOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    const rel = e.relatedTarget as globalThis.Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setIsOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const payload = readDrag(e);
    if (!payload) return;
    if (payload.kind === 'service') assignService(payload.id, null);
    else assignStack(payload.id, null);
    endDrag();
  };

  return (
    <section
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'animate-slide-in relative mx-1 rounded-[8px] transition-all',
        isOver &&
          'bg-fg-dim/10 shadow-[inset_0_0_0_2px_rgb(var(--fg-dim)/0.8),0_0_0_4px_rgb(var(--fg-dim)/0.12)]',
      )}
    >
      <header
        onClick={onToggle}
        className="hover:bg-surface-overlay/40 sticky top-0 z-10 flex cursor-pointer items-center gap-2 bg-transparent pt-2.5 pr-4 pb-1 pl-2 backdrop-blur-[2px]"
      >
        <ChevronDown
          className={cn('text-fg-dim h-3 w-3 transition-transform', collapsed && '-rotate-90')}
        />
        <span className="bg-fg-dim/40 h-2 w-2 shrink-0 rounded-full" aria-hidden />
        <span className="text-fg-muted min-w-0 flex-1 truncate text-[11.5px] font-semibold tracking-wide">
          Unassigned
        </span>
        {isOver ? (
          <span className="bg-fg-dim/25 text-fg rounded-app-sm inline-flex h-[18px] shrink-0 items-center px-1.5 text-[9.5px] leading-none font-semibold tracking-[0.12em] uppercase">
            Drop
          </span>
        ) : (
          total > 0 && (
            <span className="bg-surface-muted text-fg-dim rounded-app-sm inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center px-1 text-[10px] leading-none tabular-nums">
              {total}
            </span>
          )
        )}
      </header>
      {!collapsed && <div className="pb-1">{children}</div>}
    </section>
  );
}
