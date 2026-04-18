import type { Status } from '@/types';

export const STATUS_DOT: Record<Status, string> = {
  running: 'bg-status-running',
  starting: 'bg-status-starting animate-pulse',
  stopping: 'bg-status-starting animate-pulse',
  crashed: 'bg-status-error',
  stopped: 'bg-surface-muted',
  exited: 'bg-surface-muted',
};

export const STATUS_LABEL: Record<Status, string> = {
  running: 'Running',
  starting: 'Starting…',
  stopping: 'Stopping…',
  crashed: 'Crashed',
  stopped: 'Stopped',
  exited: 'Exited',
};
