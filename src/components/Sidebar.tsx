'use client';

import type { ReactNode } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import type { FilterStage } from '../types';
import { cn } from '../lib/utils';
import { WorkspaceMenu } from './WorkspaceMenu';
import {
  LayoutGrid,
  Compass,
  Hammer,
  TestTube2,
  Rocket,
  PauseCircle,
  Archive,
} from 'lucide-react';

const stages: { key: FilterStage; label: string; icon: ReactNode }[] = [
  { key: 'All', label: 'Command', icon: <LayoutGrid size={15} /> },
  { key: 'Exploring', label: 'Exploring', icon: <Compass size={15} /> },
  { key: 'Building', label: 'Building', icon: <Hammer size={15} /> },
  { key: 'Testing', label: 'Testing', icon: <TestTube2 size={15} /> },
  { key: 'Live', label: 'Live', icon: <Rocket size={15} /> },
  { key: 'Paused', label: 'Paused', icon: <PauseCircle size={15} /> },
  { key: 'Archived', label: 'Archived', icon: <Archive size={15} /> },
];

export function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const { projects, filter, setFilter } = useProjectStore();

  const counts = projects.reduce(
    (acc, p) => {
      acc.All++;
      acc[p.stage]++;
      return acc;
    },
    { All: 0, Exploring: 0, Building: 0, Testing: 0, Live: 0, Paused: 0, Archived: 0 } as Record<
      FilterStage,
      number
    >
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 lg:hidden',
          mobileOpen ? 'block' : 'hidden'
        )}
      />
      <aside
        className={cn(
          'w-56 flex-shrink-0 bg-surface/95 border-r border-border-subtle flex flex-col h-full backdrop-blur-sm',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        )}
      >
        <div className="px-3.5 py-4 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Noxen"
            width={28}
            height={28}
            className="w-7 h-7 rounded-full flex-shrink-0"
          />
          <span className="font-semibold text-text tracking-tight text-[15px]">
            Noxen
          </span>

        </div>

        <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-dim">
          Operate
        </p>
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {stages.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setFilter(s.key);
                onClose?.();
              }}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors',
                filter === s.key
                  ? 'bg-purple/15 text-text font-medium'
                  : 'text-text-muted hover:bg-surface-elevated hover:text-text'
              )}
            >
              <span className={cn(filter === s.key ? 'text-purple-light' : 'text-text-dim')}>
                {s.icon}
              </span>
              <span className="flex-1 text-left">{s.label}</span>
              <span
                className={cn(
                  'text-[10px] tabular-nums rounded-full px-1.5 py-0.5',
                  filter === s.key ? 'bg-purple/20 text-purple-light' : 'text-text-dim'
                )}
              >
                {counts[s.key]}
              </span>
            </button>
          ))}
        </nav>

        <div className="border-t border-border-subtle pt-2">
          <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-dim">
            Workspace
          </p>
          <WorkspaceMenu />
        </div>
      </aside>
    </>
  );
}
