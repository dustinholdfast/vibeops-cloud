'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '../store/useProjectStore';
import {
  Search,
  LayoutGrid,
  Compass,
  Hammer,
  TestTube2,
  Rocket,
  PauseCircle,
  Archive,
  Plus,
  Sun,
  Moon,
  Download,
  Activity,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../lib/useTheme';
import { useRouter } from 'next/navigation';
import { downloadProjectsExport } from '../lib/export-projects';
import type { FilterStage } from '../types';

type Option = {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
  icon: ReactNode;
};

const STAGE_FILTERS: { key: FilterStage; label: string; icon: ReactNode }[] = [
  { key: 'All', label: 'Show all projects', icon: <LayoutGrid size={14} /> },
  { key: 'Exploring', label: 'Filter: Exploring', icon: <Compass size={14} /> },
  { key: 'Building', label: 'Filter: Building', icon: <Hammer size={14} /> },
  { key: 'Testing', label: 'Filter: Testing', icon: <TestTube2 size={14} /> },
  { key: 'Live', label: 'Filter: Live', icon: <Rocket size={14} /> },
  { key: 'Paused', label: 'Filter: Paused', icon: <PauseCircle size={14} /> },
  { key: 'Archived', label: 'Filter: Archived', icon: <Archive size={14} /> },
];

export function CommandPalette({
  isOpen,
  onClose,
  onCopilot,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCopilot?: () => void;
}) {
  const { projects, openDrawer, requestAdd, setFilter, getExportPayload } = useProjectStore();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  const options = useMemo<Option[]>(() => {
    const q = search.toLowerCase();
    const matches = (label: string) => !q || label.toLowerCase().includes(q);

    const actions: Option[] = [
      ...(onCopilot
        ? [
            {
              id: 'act-copilot',
              label: 'Open Nox',
              hint: '⌘J',
              action: () => {
                onCopilot();
              },
              icon: <Sparkles size={14} />,
            },
          ]
        : []),
      {
        id: 'act-add',
        label: 'Add new project',
        action: () => {
          requestAdd();
          onClose();
        },
        icon: <Plus size={14} />,
      },
      {
        id: 'act-uptime',
        label: 'Open uptime',
        action: () => {
          router.push('/uptime');
          onClose();
        },
        icon: <Activity size={14} />,
      },
      {
        id: 'act-toggle',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        action: () => {
          toggleTheme();
          onClose();
        },
        icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
      },
      {
        id: 'act-export',
        label: 'Export projects JSON',
        action: () => {
          downloadProjectsExport(getExportPayload());
          onClose();
        },
        icon: <Download size={14} />,
      },
      ...STAGE_FILTERS.map((stage) => ({
        id: `filter-${stage.key}`,
        label: stage.label,
        action: () => {
          setFilter(stage.key);
          onClose();
        },
        icon: stage.icon,
      })),
    ].filter((option) => matches(option.label));

    const projectOptions: Option[] = projects
      .filter((project) => matches(project.name) || matches(project.nextAction))
      .map((project) => ({
        id: `proj-${project.id}`,
        label: project.name,
        hint: project.nextAction,
        action: () => {
          openDrawer(project.id);
          onClose();
        },
        icon: <div className="w-2 h-2 rounded-full bg-purple" />,
      }));

    return [...actions, ...projectOptions];
  }, [
    projects,
    search,
    openDrawer,
    onClose,
    requestAdd,
    toggleTheme,
    theme,
    getExportPayload,
    setFilter,
    router,
    onCopilot,
  ]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 100);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedIndex > options.length - 1) setSelectedIndex(0);
  }, [options.length, selectedIndex]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter' && options[selectedIndex]) {
        event.preventDefault();
        options[selectedIndex].action();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, options, selectedIndex, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />
          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center px-4 py-3 border-b border-border">
              <Search size={18} className="text-text-dim" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(0);
                }}
                className="flex-1 bg-transparent px-3 py-1 focus:outline-none"
                placeholder="Jump, filter, export…"
                aria-label="Command search"
              />
              <kbd className="text-[10px] text-text-dim border border-border rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {options.map((option, i) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={option.action}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left ${
                    i === selectedIndex ? 'bg-purple/15 text-text' : 'text-text-muted hover:bg-surface-elevated'
                  }`}
                >
                  {option.icon}
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                    {option.hint ? (
                      <span className="block truncate text-[11px] text-text-dim">{option.hint}</span>
                    ) : null}
                  </span>
                </button>
              ))}
              {options.length === 0 && <p className="px-4 py-3 text-sm text-text-dim">No results found.</p>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
