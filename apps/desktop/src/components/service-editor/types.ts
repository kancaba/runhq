import type { CommandEntry } from '@/types';

export interface EnvRow {
  key: string;
  value: string;
}

export const DEFAULT_GRACE_MS = 5_000;

export const NODE_PACKAGE_MANAGERS = ['npm', 'yarn', 'pnpm', 'bun'] as const;
export type NodePackageManager = (typeof NODE_PACKAGE_MANAGERS)[number];

export function rewritePmInCmd(cmd: string, target: NodePackageManager): string {
  const rewritten = cmd.replace(/\b(npm|yarn|pnpm|bun)\b/g, target);
  if (target === 'yarn' || target === 'bun') {
    return rewritten.replace(new RegExp(`\\b${target} run\\b`, 'g'), target);
  }
  return rewritten;
}

export function inferPmFromCmds(cmds: CommandEntry[]): NodePackageManager {
  const pmRe = /\b(npm|yarn|pnpm|bun)\b/;
  for (const c of cmds) {
    const m = c.cmd.match(pmRe);
    if (m && NODE_PACKAGE_MANAGERS.includes(m[1] as NodePackageManager)) {
      return m[1] as NodePackageManager;
    }
  }
  return 'npm';
}
