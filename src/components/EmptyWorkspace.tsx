'use client';

import { useProjectStore } from '../store/useProjectStore';

export function EmptyWorkspace({
  onAdd,
  onImport,
}: {
  onAdd: () => void;
  onImport: () => void;
}) {
  const creating = useProjectStore((s) => s.creating);
  const operationBusy = useProjectStore((s) => s.operationBusy);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg text-center rounded-3xl border border-border bg-surface p-10 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.45)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt=""
          width={56}
          height={56}
          className="mx-auto mb-5 rounded-2xl ring-8 ring-purple/15"
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">
          Workspace ready
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text">
          Nothing in flight yet
        </h2>
        <p className="mt-3 text-sm text-text-muted leading-relaxed">
          Cloud is synced. Add the build you care about most and give it one concrete
          next action — or import a JSON snapshot from Vibe/Ops Local.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAdd}
            disabled={creating || operationBusy}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium"
          >
            Add first project
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={creating || operationBusy}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-border bg-surface-elevated text-text text-sm font-medium"
          >
            Import from Local
          </button>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-left">
          <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
            <p className="text-xs font-medium text-text">Now</p>
            <p className="text-[11px] text-text-dim mt-0.5">Claim up to 3 focus slots.</p>
          </div>
          <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
            <p className="text-xs font-medium text-text">Rotting</p>
            <p className="text-[11px] text-text-dim mt-0.5">Silence flagged after 7 days.</p>
          </div>
          <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
            <p className="text-xs font-medium text-text">Pro</p>
            <p className="text-[11px] text-text-dim mt-0.5">Unlimited projects at $12/mo.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
