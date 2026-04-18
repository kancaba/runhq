import { SidebarFilterMenu } from '../SidebarFilterMenu';

export function WorkspaceHeader({
  servicesCount,
  runningCount,
  stacksCount,
}: {
  servicesCount: number;
  runningCount: number;
  stacksCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
      <span className="text-fg-dim text-[10.5px] font-semibold tracking-[0.18em] uppercase">
        Workspace
      </span>
      <span className="bg-surface-muted text-fg-muted rounded-app-sm px-1.5 text-[10px] tabular-nums">
        {servicesCount + stacksCount}
      </span>
      {runningCount > 0 && (
        <span className="bg-status-running/15 text-status-running rounded-app-sm px-1.5 text-[10px] tabular-nums">
          {runningCount} on
        </span>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <SidebarFilterMenu />
      </div>
    </div>
  );
}
