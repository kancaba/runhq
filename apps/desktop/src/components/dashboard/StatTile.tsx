import { cn } from '@/lib/cn';

export function StatTile({
  label,
  value,
  tone,
  icon,
  badge,
  active,
}: {
  label: string;
  value: number;
  tone: 'running' | 'starting' | 'stopped' | 'error';
  icon: React.ReactNode;
  badge?: string;
  active?: boolean;
}) {
  const toneCfg = {
    running: {
      text: 'text-status-running',
      chip: 'bg-status-running/12 text-status-running',
      activeBg: 'bg-gradient-to-br from-status-running/8 to-transparent border-status-running/25',
    },
    starting: {
      text: 'text-status-starting',
      chip: 'bg-status-starting/15 text-status-starting',
      activeBg: 'bg-gradient-to-br from-status-starting/8 to-transparent border-status-starting/25',
    },
    stopped: {
      text: 'text-fg-muted',
      chip: 'bg-surface-muted text-fg-muted',
      activeBg: '',
    },
    error: {
      text: 'text-status-error',
      chip: 'bg-status-error/12 text-status-error',
      activeBg: 'bg-gradient-to-br from-status-error/8 to-transparent border-status-error/30',
    },
  }[tone];

  return (
    <div
      className={cn(
        'glass relative flex items-center gap-3 overflow-hidden p-4 transition',
        active && toneCfg.activeBg,
      )}
    >
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneCfg.chip)}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-2xl leading-none font-semibold tabular-nums', toneCfg.text)}>
            {value}
          </span>
          {badge != null && (
            <span className="text-fg-dim text-[11px] font-medium tabular-nums">{badge}</span>
          )}
        </div>
        <div className="text-fg-dim mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
          {label}
        </div>
      </div>
    </div>
  );
}
