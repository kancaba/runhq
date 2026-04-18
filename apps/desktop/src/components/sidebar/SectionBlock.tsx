import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SectionOverflowMenu } from '../SectionMenus';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/cn';
import { sectionColor } from '@/lib/sectionColors';
import { readDrag, endDrag, getActiveDrag } from './dnd';
import type { Section } from '@/types';

export function SectionBlock({
  section,
  collapsed,
  onToggle,
  running,
  total,
  children,
}: {
  section: Section;
  collapsed: boolean;
  onToggle: () => void;
  running: number;
  total: number;
  children: React.ReactNode;
}) {
  const meta = sectionColor(section.color);
  const assignService = useAppStore((s) => s.assignServiceToSection);
  const assignStack = useAppStore((s) => s.assignStackToSection);
  const [isOver, setIsOver] = useState(false);

  const onDragOver = (e: React.DragEvent) => {
    if (getActiveDrag() == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) setIsOver(true);
  };
  const onDragEnter = (e: React.DragEvent) => {
    if (getActiveDrag() == null) return;
    e.preventDefault();
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
    if (payload.kind === 'service') assignService(payload.id, section.id);
    else assignStack(payload.id, section.id);
    endDrag();
  };

  return (
    <section
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn('animate-slide-in relative mx-1 rounded-[8px] transition-all')}
      style={
        isOver
          ? {
              backgroundColor: `${meta.solid}1A`,
              boxShadow: `inset 0 0 0 2px ${meta.solid}, 0 0 0 4px ${meta.solid}1F`,
            }
          : undefined
      }
    >
      <header
        onClick={onToggle}
        className="hover:bg-surface-overlay/40 group sticky top-0 z-10 flex cursor-pointer items-center gap-2 bg-transparent pt-2.5 pr-2 pb-1 pl-2 backdrop-blur-[2px]"
      >
        <ChevronDown
          className={cn('text-fg-dim h-3 w-3 transition-transform', collapsed && '-rotate-90')}
        />
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: meta.solid }}
          aria-hidden
        />
        <span className="text-fg min-w-0 flex-1 truncate text-[11.5px] font-semibold tracking-wide">
          {section.name}
        </span>
        {isOver ? (
          <span
            className="rounded-app-sm inline-flex h-[18px] shrink-0 items-center px-1.5 text-[9.5px] leading-none font-semibold tracking-[0.12em] uppercase"
            style={{
              backgroundColor: `${meta.solid}26`,
              color: meta.solid,
            }}
          >
            Drop
          </span>
        ) : (
          total > 0 && (
            <span
              className={cn(
                'rounded-app-sm inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center px-1 text-[10px] leading-none tabular-nums',
                running > 0
                  ? 'bg-status-running/15 text-status-running'
                  : 'bg-surface-muted text-fg-dim',
              )}
            >
              {running > 0 ? `${running}/${total}` : total}
            </span>
          )
        )}
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <SectionOverflowMenu section={section} />
        </div>
      </header>
      {!collapsed && <div className="pb-1">{children}</div>}
    </section>
  );
}
