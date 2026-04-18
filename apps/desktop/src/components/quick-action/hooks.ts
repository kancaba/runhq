import { ipc } from '@/lib/ipc';
import type { CommandStatus, ServiceDef, ServiceId } from '@/types';

export async function fetchServices(): Promise<ServiceDef[]> {
  return ipc.listServices();
}

export async function fetchStatus(id: ServiceId): Promise<CommandStatus[]> {
  const st = await ipc.serviceStatus(id);
  return st.commands ?? [];
}

export async function focusMainWindow() {
  try {
    await ipc.focusMainWindow();
  } catch (err) {
    console.error('focus_main_window failed', err);
  }
}
