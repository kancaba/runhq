import { useAppStore } from '@/store/useAppStore';
import { ipc } from '@/lib/ipc';
import type { SectionId, ServiceDef, StackDef, Status } from '@/types';
import { StackRow } from './StackRow';
import { ServiceRow } from './ServiceRow';

export interface BodyProps {
  stacks: StackDef[];
  services: ServiceDef[];
  statuses: ReturnType<typeof useAppStore.getState>['statuses'];
  selectedServiceId: string | null;
  selectedStackId: string | null;
  serviceSection: Record<string, SectionId>;
  stackSection: Record<string, SectionId>;
  onSelectService: (id: string) => void;
  onSelectStack: (id: string) => void;
  onEditService: (svc: ServiceDef) => void;
  onDeleteService: (svc: ServiceDef) => void;
  onEditStack: (stack: StackDef) => void;
  onDeleteStack: (stack: StackDef) => void;
  emptyMessage?: string;
}

export function SectionBody({
  stacks,
  services,
  statuses,
  selectedServiceId,
  selectedStackId,
  serviceSection,
  stackSection,
  onSelectService,
  onSelectStack,
  onEditService,
  onDeleteService,
  onEditStack,
  onDeleteStack,
}: BodyProps) {
  if (stacks.length === 0 && services.length === 0) {
    return (
      <div className="border-border/60 mx-2 my-1 rounded-[6px] border border-dashed px-3 py-4 text-center">
        <p className="text-fg-dim text-[10.5px] leading-tight">Drag services or stacks here</p>
      </div>
    );
  }
  return (
    <ul className="mx-2 space-y-0.5">
      {stacks.map((stack) => {
        const running = stack.service_ids.filter((sid) => {
          const st: Status = statuses[sid]?.status ?? 'stopped';
          return st === 'running' || st === 'starting';
        }).length;
        return (
          <li key={`stack:${stack.id}`}>
            <StackRow
              stackId={stack.id}
              currentSectionId={stackSection[stack.id] ?? null}
              name={stack.name}
              total={stack.service_ids.length}
              running={running}
              active={selectedStackId === stack.id}
              onSelect={() => onSelectStack(stack.id)}
              onStart={() => void ipc.startStack(stack.id)}
              onStop={() => void ipc.stopStack(stack.id)}
              onEdit={() => onEditStack(stack)}
              onDelete={() => onDeleteStack(stack)}
            />
          </li>
        );
      })}
      {services.map((svc) => (
        <li key={`svc:${svc.id}`}>
          <ServiceRow
            service={svc}
            status={statuses[svc.id]?.status ?? 'stopped'}
            pid={statuses[svc.id]?.pid ?? undefined}
            selected={selectedServiceId === svc.id}
            currentSectionId={serviceSection[svc.id] ?? null}
            onSelect={() => onSelectService(svc.id)}
            onEdit={() => onEditService(svc)}
            onDelete={() => onDeleteService(svc)}
          />
        </li>
      ))}
    </ul>
  );
}

export function FlatItems(props: BodyProps) {
  if (props.stacks.length === 0 && props.services.length === 0) {
    return (
      <div className="text-fg-dim px-3 py-6 text-center text-[12px]">
        {props.emptyMessage ?? 'No services yet.'}
      </div>
    );
  }
  return <SectionBody {...props} />;
}
