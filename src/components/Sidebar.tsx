'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import type { FilterStage } from '../types';
import { cn } from '../lib/utils';
import { BillingBadge } from './BillingBadge';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { EmailPreferences } from './EmailPreferences';
import {
  LayoutGrid,
  Compass,
  Hammer,
  TestTube2,
  Rocket,
  PauseCircle,
  Archive,
  Menu,
  X,
} from 'lucide-react';

const stages: { key: FilterStage; label: string; icon: ReactNode }[] = [
  { key: 'All', label: 'All projects', icon: <LayoutGrid size={16} /> },
  { key: 'Exploring', label: 'Exploring', icon: <Compass size={16} /> },
  { key: 'Building', label: 'Building', icon: <Hammer size={16} /> },
  { key: 'Testing', label: 'Testing', icon: <TestTube2 size={16} /> },
  { key: 'Live', label: 'Live', icon: <Rocket size={16} /> },
  { key: 'Paused', label: 'Paused', icon: <PauseCircle size={16} /> },
  { key: 'Archived', label: 'Archived', icon: <Archive size={16} /> },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
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
    <aside className="w-full md:w-56 flex-shrink-0 bg-surface border-b md:border-b-0 md:border-r border-border-subtle flex flex-col md:h-full md:overflow-y-auto" onKeyDown={(event) => {
      if (event.key === 'Escape' && expanded) {
        setExpanded(false);
        toggleRef.current?.focus();
      }
    }}>
      <div className="px-4 py-5 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="VibeOps"
          width={32}
          height={32}
          className="w-8 h-8 rounded-lg flex-shrink-0"
        />
        <span className="font-semibold text-text tracking-tight">
          Vibe <span className="text-text-muted font-normal">/ Ops</span>
          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-purple-light bg-purple/15 px-1.5 py-0.5 rounded">
            Cloud
          </span>
        </span>
        <button ref={toggleRef} type="button" aria-label={expanded ? 'Close navigation' : 'Open navigation'} aria-expanded={expanded} aria-controls="workspace-navigation" onClick={() => setExpanded(!expanded)} className="ml-auto inline-flex items-center justify-center rounded-lg border border-border p-2 md:hidden">
          {expanded ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div id="workspace-navigation" className={cn('min-h-0 md:flex md:flex-1 md:flex-col md:max-h-none', expanded ? 'flex flex-col max-h-[65dvh] overflow-y-auto' : 'hidden')}>
      <nav aria-label="Project stages" className="flex-1 px-2 space-y-0.5">
        {stages.map((s) => (
          <button
            key={s.key}
            aria-pressed={filter === s.key}
            onClick={() => { setFilter(s.key); setExpanded(false); if (expanded) toggleRef.current?.focus(); }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              filter === s.key
                ? 'bg-purple/15 text-purple-light font-medium'
                : 'text-text-muted hover:bg-surface-elevated hover:text-text'
            )}
          >
            <span className={cn(filter === s.key ? 'text-purple' : 'text-text-dim')}>
              {s.icon}
            </span>
            <span className="flex-1 text-left">{s.label}</span>
            <span
              className={cn(
                'text-xs tabular-nums',
                filter === s.key ? 'text-purple-light' : 'text-text-dim'
              )}
            >
              {counts[s.key]}
            </span>
          </button>
        ))}
      </nav>

      <WorkspaceSwitcher />
      <EmailPreferences />
      <BillingBadge />
      </div>
    </aside>
  );
}
