import { Layers, Plus } from 'lucide-react';
import { AddSectionButton } from '../SectionMenus';
import { modChord } from '@/lib/platform';

export function CreateActionsFooter({
  onAddService,
  onAddStack,
}: {
  onAddService: () => void;
  onAddStack: () => void;
}) {
  const cta =
    'border-border/80 bg-surface-raised text-fg hover:bg-surface-overlay hover:border-border-strong hover:shadow-md focus-visible:border-border-strong rounded-app-sm flex min-w-0 flex-1 items-center justify-center gap-1 border px-2 py-1.5 text-[11px] font-semibold shadow-sm transition active:scale-[0.98]';
  return (
    <div className="border-border/60 bg-surface-raised/95 border-t px-2 py-2 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onAddService}
          title={`New service (${modChord('N')})`}
          className={cta}
        >
          <Plus className="h-3 w-3 shrink-0" />
          <span className="truncate">Service</span>
        </button>
        <button type="button" onClick={onAddStack} title="New stack" className={cta}>
          <Layers className="h-3 w-3 shrink-0" />
          <span className="truncate">Stack</span>
        </button>
        <AddSectionButton className={cta}>
          <Plus className="h-3 w-3 shrink-0" />
          <span className="truncate">Section</span>
        </AddSectionButton>
      </div>
    </div>
  );
}
