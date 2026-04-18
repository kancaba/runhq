import type { CategoryKey } from '@/lib/categories';
import type { ServiceDef, ServiceId, StackDef, Status } from '@/types';

export type FilterMode = 'all' | 'running' | 'stopped' | CategoryKey;

export interface ServiceCmd {
  name: string;
  cmd: string;
  status: Status;
}

export type ListItem =
  | {
      type: 'app-action';
      id: string;
      label: string;
      subtitle: string;
      shortcut: string;
      icon: React.ReactNode;
      run: () => Promise<void>;
    }
  | { type: 'header'; label: string }
  | { type: 'service'; service: ServiceDef; cmds: ServiceCmd[] }
  | { type: 'expanded-header'; service: ServiceDef; cmds: ServiceCmd[] }
  | {
      type: 'sub-action';
      serviceId: ServiceId;
      label: string;
      subtitle?: string;
      icon: React.ReactNode;
      danger?: boolean;
      run: () => Promise<void>;
    }
  | { type: 'cmd-header' }
  | { type: 'expanded-cmd'; serviceId: ServiceId; cmd: ServiceCmd }
  | {
      type: 'cmd';
      serviceId: ServiceId;
      serviceName: string;
      cmdName: string;
      cmd: string;
      status: Status;
    }
  | { type: 'stack'; stack: StackDef; runningCount: number }
  | {
      type: 'expanded-stack';
      stack: StackDef;
      services: ServiceDef[];
      cmdsPerService: Record<ServiceId, ServiceCmd[]>;
    }
  | {
      type: 'stack-action';
      stackId: string;
      label: string;
      icon: React.ReactNode;
      danger?: boolean;
      run: () => Promise<void>;
    };

export function isRunning(s: Status | undefined) {
  return s === 'running' || s === 'starting';
}

export function isSelectable(item: ListItem | undefined) {
  return !!item && item.type !== 'header' && item.type !== 'cmd-header';
}
