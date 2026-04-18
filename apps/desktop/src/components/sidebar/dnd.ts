import type { SectionId, ServiceDef } from '@/types';

export const COLLAPSED_W = 52;
export const MIN_W = 250;
export const MAX_W = 400;
export const DEFAULT_W = 320;

export const UNASSIGNED: SectionId = '__unassigned__';

export const DND_MIME = 'application/x-runhq-item';

export type DndKind = 'service' | 'stack';

export interface DragPayload {
  kind: DndKind;
  id: string;
}

let activeDrag: DragPayload | null = null;

export function beginDrag(e: React.DragEvent, kind: DndKind, id: string): void {
  try {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind, id }));
    e.dataTransfer.setData('text/plain', `${kind}:${id}`);
    e.dataTransfer.effectAllowed = 'move';
  } catch {
    // dataTransfer may be readonly in some environments
  }
  activeDrag = { kind, id };
}

export function endDrag(): void {
  activeDrag = null;
}

export function readDrag(e: React.DragEvent): DragPayload | null {
  if (activeDrag) return activeDrag;
  const raw = e.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { kind?: string; id?: string };
    if ((p.kind === 'service' || p.kind === 'stack') && typeof p.id === 'string') {
      return { kind: p.kind, id: p.id };
    }
    return null;
  } catch {
    return null;
  }
}

export function getActiveDrag(): DragPayload | null {
  return activeDrag;
}

export interface ServiceGroup {
  key: string;
  label: string;
  dot?: string;
  color?: string;
  services: ServiceDef[];
}
