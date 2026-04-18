import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import type { EnvRow } from './types';

export function EnvEditor({
  rows,
  setRows,
}: {
  rows: EnvRow[];
  setRows: (rows: EnvRow[]) => void;
}) {
  const addRow = () => setRows([...rows, { key: '', value: '' }]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<EnvRow>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-fg-muted text-[10px]">
          Sent to the child process on every start. Values can reference shell env via
          <code className="bg-surface-muted rounded-app-sm ml-1 px-1 text-[9px]">$VAR</code>.
        </p>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus className="h-2.5 w-2.5" />}
          onClick={addRow}
        >
          Add variable
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="border-border bg-surface-muted/50 text-fg-dim rounded-app-sm border border-dashed p-4 text-center text-[10px]">
          No environment variables. Click &quot;Add variable&quot; to start.
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                mono
                placeholder="KEY"
                value={row.key}
                onChange={(e) => update(i, { key: e.target.value })}
                className="w-40"
              />
              <Input
                mono
                placeholder="value"
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                className="flex-1"
              />
              <IconButton
                label="Remove"
                icon={<Trash2 />}
                tone="danger"
                onClick={() => removeRow(i)}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-fg-dim border-border/60 mt-3 border-t pt-2 text-[10px] leading-relaxed">
        <span className="text-fg-muted font-medium">Scope:</span> Runner HQ only injects the
        variables above (plus your{' '}
        <code className="bg-surface-muted rounded-app-sm px-1 text-[9px]">path_override</code>).{' '}
        <code className="bg-surface-muted rounded-app-sm px-1 text-[9px]">.env</code>,{' '}
        <code className="bg-surface-muted rounded-app-sm px-1 text-[9px]">.env.local</code> and
        similar files in your project are loaded by your framework&apos;s own dotenv loader
        (Next.js, Vite, dotenv, …), not by HQ.
      </p>
    </div>
  );
}
