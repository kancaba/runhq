import {
  FolderOpen,
  Globe,
  LayoutDashboard,
  Play,
  RotateCcw,
  Search,
  Settings,
  Square,
  Sun,
  TerminalSquare,
  TextSearch,
} from 'lucide-react';
import { emit } from '@tauri-apps/api/event';
import { ipc } from '@/lib/ipc';
import { broadcastTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';
import { localUrl } from '@/lib/url';
import { categoryForTags } from '@/lib/categories';
import { isRunning, type FilterMode, type ListItem, type ServiceCmd } from './types';
import type { ServiceDef, ServiceId, StackDef } from '@/types';

export interface BuildItemsDeps {
  query: string;
  filter: FilterMode;
  services: ServiceDef[];
  stacks: StackDef[];
  expandedService: ServiceDef | null;
  expandedStack: StackDef | null;
  getCmds: (svc: ServiceDef) => ServiceCmd[];
  hide: () => void;
  refreshStatus: (id: ServiceId) => Promise<void>;
  focusMainWindow: () => Promise<void>;
}

export function buildItems(deps: BuildItemsDeps): ListItem[] {
  const {
    query,
    filter,
    services,
    stacks,
    expandedService,
    expandedStack,
    getCmds,
    hide,
    refreshStatus,
    focusMainWindow,
  } = deps;

  const q = query.trim().toLowerCase();
  const result: ListItem[] = [];

  if (expandedService) {
    const svc = expandedService;
    const cmds = getCmds(svc);
    const anyRunning = cmds.some((c) => isRunning(c.status));

    result.push({ type: 'expanded-header', service: svc, cmds });

    const subActions: ListItem[] = [];
    subActions.push({
      type: 'sub-action',
      serviceId: svc.id,
      label: anyRunning ? 'Stop All' : 'Start All',
      icon: anyRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />,
      danger: anyRunning,
      run: async () => {
        if (anyRunning) await ipc.stopService(svc.id);
        else await ipc.startService(svc.id);
        await refreshStatus(svc.id);
      },
    });
    subActions.push({
      type: 'sub-action',
      serviceId: svc.id,
      label: 'Restart All',
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      run: async () => {
        await ipc.restartService(svc.id);
        await refreshStatus(svc.id);
      },
    });
    subActions.push({
      type: 'sub-action',
      serviceId: svc.id,
      label: 'Show in RunHQ',
      icon: <TextSearch className="h-3.5 w-3.5" />,
      run: async () => {
        await focusMainWindow();
        await emit('quick-action://navigate', { serviceId: svc.id });
        hide();
      },
    });
    if (svc.port != null) {
      subActions.push({
        type: 'sub-action',
        serviceId: svc.id,
        label: `Open localhost:${svc.port}`,
        subtitle: localUrl(svc.port!),
        icon: <Globe className="h-3.5 w-3.5" />,
        run: async () => {
          await ipc.openUrl(localUrl(svc.port!));
          hide();
        },
      });
    }
    subActions.push({
      type: 'sub-action',
      serviceId: svc.id,
      label: 'Open in Finder',
      subtitle: svc.cwd,
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      run: async () => {
        await ipc.openPath(svc.cwd);
        hide();
      },
    });
    subActions.push({
      type: 'sub-action',
      serviceId: svc.id,
      label: 'Open Terminal',
      subtitle: svc.cwd,
      icon: <TerminalSquare className="h-3.5 w-3.5" />,
      run: async () => {
        await focusMainWindow();
        await emit('quick-action://navigate', { serviceId: svc.id, openTerminal: true });
        hide();
      },
    });

    const filteredActions = q
      ? subActions.filter((a) => a.type === 'sub-action' && a.label.toLowerCase().includes(q))
      : subActions;
    result.push(...filteredActions);

    const filteredCmds = q
      ? cmds.filter((c) => c.name.toLowerCase().includes(q) || c.cmd.toLowerCase().includes(q))
      : cmds;
    if (filteredCmds.length > 0) {
      result.push({ type: 'cmd-header' });
      for (const cmd of filteredCmds) {
        result.push({ type: 'expanded-cmd', serviceId: svc.id, cmd });
      }
    }
    return result;
  }

  if (expandedStack) {
    const stack = expandedStack;
    const stackServices = stack.service_ids
      .map((sid) => services.find((s) => s.id === sid))
      .filter(Boolean) as ServiceDef[];
    const cmdsPerService: Record<ServiceId, ServiceCmd[]> = {};
    let stackRunning = 0;
    for (const svc of stackServices) {
      const cmds = getCmds(svc);
      cmdsPerService[svc.id] = cmds;
      if (cmds.some((c) => isRunning(c.status))) stackRunning++;
    }
    const anyRunning = stackRunning > 0;

    result.push({
      type: 'expanded-stack',
      stack,
      services: stackServices,
      cmdsPerService,
    });

    const stackActions: ListItem[] = [
      {
        type: 'stack-action',
        stackId: stack.id,
        label: anyRunning ? 'Stop All' : 'Start All',
        icon: anyRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />,
        danger: anyRunning,
        run: async () => {
          if (anyRunning) await ipc.stopStack(stack.id);
          else await ipc.startStack(stack.id);
        },
      },
      {
        type: 'stack-action',
        stackId: stack.id,
        label: 'Restart All',
        icon: <RotateCcw className="h-3.5 w-3.5" />,
        run: async () => {
          await ipc.restartStack(stack.id);
        },
      },
    ];

    const svcRows: ListItem[] = stackServices.map((svc) => {
      const cmds = cmdsPerService[svc.id] ?? [];
      const svcRunning = cmds.some((c) => isRunning(c.status));
      return {
        type: 'sub-action',
        serviceId: svc.id,
        label: svc.name,
        icon: svcRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />,
        danger: svcRunning,
        run: async () => {
          if (svcRunning) await ipc.stopService(svc.id);
          else await ipc.startService(svc.id);
        },
      };
    });

    const all = [...stackActions, ...svcRows];
    const filtered = q
      ? all.filter((a) => {
          if (a.type === 'stack-action') return a.label.toLowerCase().includes(q);
          if (a.type === 'sub-action') return a.label.toLowerCase().includes(q);
          return true;
        })
      : all;
    result.push(...filtered);
    return result;
  }

  const appActions = [
    {
      type: 'app-action' as const,
      id: 'open-app',
      label: 'Open RunHQ',
      subtitle: 'Show the main application window',
      shortcut: '⌘1',
      icon: <LayoutDashboard className="h-4 w-4" />,
      run: async () => {
        await focusMainWindow();
        hide();
      },
    },
    {
      type: 'app-action' as const,
      id: 'scan',
      label: 'Scan for Projects',
      subtitle: 'Find and add services from a directory',
      shortcut: '⌘2',
      icon: <Search className="h-4 w-4" />,
      run: async () => {
        await focusMainWindow();
        await emit('quick-action://scan');
        hide();
      },
    },
    {
      type: 'app-action' as const,
      id: 'toggle-theme',
      label: 'Toggle Theme',
      subtitle: 'Switch between light and dark mode',
      shortcut: '⌘3',
      icon: <Sun className="h-4 w-4" />,
      run: async () => {
        const saved = (() => {
          try {
            return localStorage.getItem(THEME_STORAGE_KEY);
          } catch {
            return null;
          }
        })();
        const next: Theme =
          saved === 'dark'
            ? 'light'
            : saved === 'light'
              ? 'dark'
              : document.documentElement.classList.contains('dark')
                ? 'light'
                : 'dark';
        await broadcastTheme(next);
      },
    },
    {
      type: 'app-action' as const,
      id: 'shortcuts',
      label: 'Keyboard Shortcuts',
      subtitle: 'Configure global shortcuts',
      shortcut: '⌘4',
      icon: <Settings className="h-4 w-4" />,
      run: async () => {
        await focusMainWindow();
        await emit('quick-action://shortcuts');
        hide();
      },
    },
  ].filter((a) => !q || a.label.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q));

  if (appActions.length > 0 && (filter === 'all' || q)) {
    result.push({ type: 'header', label: 'Actions' });
    result.push(...appActions);
  }

  if (filter === 'all' || filter === 'running' || filter === 'stopped') {
    const stackItems: ListItem[] = [];
    for (const stack of stacks) {
      let stackRunning = 0;
      const stackServices = stack.service_ids
        .map((sid) => services.find((s) => s.id === sid))
        .filter(Boolean) as ServiceDef[];
      for (const svc of stackServices) {
        const cmds = getCmds(svc);
        if (cmds.some((c) => isRunning(c.status))) stackRunning++;
      }
      if (filter === 'running' && stackRunning === 0) continue;
      if (filter === 'stopped' && stackRunning > 0) continue;

      const nameMatches = !q || stack.name.toLowerCase().includes(q);
      if (!nameMatches) continue;

      stackItems.push({ type: 'stack', stack, runningCount: stackRunning });
    }
    if (stackItems.length > 0) {
      result.push({ type: 'header', label: 'Stacks' });
      result.push(...stackItems);
    }
  }

  const svcItems: ListItem[] = [];
  for (const svc of services) {
    const cmds = getCmds(svc);
    const anyRunning = cmds.some((c) => isRunning(c.status));

    if (filter === 'running' && !anyRunning) continue;
    if (filter === 'stopped' && anyRunning) continue;
    if (filter !== 'all' && filter !== 'running' && filter !== 'stopped') {
      const cat = categoryForTags(svc.tags);
      if (cat.key !== filter) continue;
    }

    const svcMatches =
      !q || svc.name.toLowerCase().includes(q) || svc.tags.some((t) => t.toLowerCase().includes(q));

    if (!svcMatches && q) {
      for (const cmd of cmds) {
        if (cmd.name.toLowerCase().includes(q) || cmd.cmd.toLowerCase().includes(q)) {
          svcItems.push({
            type: 'cmd',
            serviceId: svc.id,
            serviceName: svc.name,
            cmdName: cmd.name,
            cmd: cmd.cmd,
            status: cmd.status,
          });
        }
      }
      continue;
    }

    svcItems.push({ type: 'service', service: svc, cmds });
  }

  if (svcItems.length > 0) {
    result.push({ type: 'header', label: 'Services' });
    result.push(...svcItems);
  }

  return result;
}
