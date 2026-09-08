'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useProjectStore, MAX_NOW_SLOTS } from '../store/useProjectStore';
import { format } from 'date-fns';
import { Search, Plus, Download, Upload, Sun, Moon } from 'lucide-react';
import { useTheme } from '../lib/useTheme';
import type { Project } from '../types';

export function Header({ account }: { account?: ReactNode }) {
  const {
    search,
    setSearch,
    addProject,
    projects,
    getExportPayload,
    importProjects,
    creation,
    creating,
    operationBusy,
    cancelCreation,
    reportError,
  } = useProjectStore();
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  useEffect(() => {
    if (creation) {
      setNewName(creation.name);
      setShowAdd(true);
    }
  }, [creation]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nowCount = projects.filter((p) => p.priority === 'Now').length;
  let sub = 'Every active project gets one unambiguous next action.';
  if (nowCount === 0) sub = 'Nothing claimed for today.';
  else if (nowCount === 1) sub = '1 project claimed for today';
  else if (nowCount <= MAX_NOW_SLOTS) sub = `${nowCount} projects claimed for today`;
  else sub = `${nowCount} claimed · over the ${MAX_NOW_SLOTS}-slot soft limit`;

  const handleAdd = async () => {
    if (!newName.trim() || creating || operationBusy) return;
    if (await addProject({ name: newName.trim() })) {
      setNewName('');
      setShowAdd(false);
    }
  };

  const handleExport = () => {
    const payload = getExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibeops-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => reportError('Could not read that file. Try selecting it again.');
    reader.onload = async () => {
      let list: Project[];
      try {
        const raw = JSON.parse(String(reader.result));
        if (Array.isArray(raw)) list = raw;
        else if (raw && Array.isArray(raw.projects)) list = raw.projects;
        else {
          reportError('That file is not a VibeOps export: expected an array of projects or { projects: [...] }.');
          return;
        }
      } catch {
        reportError('Could not parse that file as JSON. Your workspace is unchanged.');
        return;
      }
      if (!confirm(`Import ${list.length} project${list.length === 1 ? '' : 's'}? This will replace your current data.`)) {
        return;
      }
      await importProjects(list);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wider text-text-dim uppercase">
          {format(new Date(), 'EEEE, MMMM d')}
        </p>
        <h1 className="text-xl font-semibold text-text tracking-tight">Command center</h1>
        <p className="text-sm text-text-muted truncate">{sub}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 pl-9 pr-12 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50 focus:ring-1 focus:ring-purple/30"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline text-[10px] text-text-dim border border-border rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-pressed={isDark}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-border text-text-muted hover:text-text"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button type="button" onClick={handleExport} title="Export projects as JSON" className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-border text-text-muted hover:text-text">
          <Download size={15} />
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={operationBusy || creating} title="Import projects from JSON" className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-border text-text-muted hover:text-text disabled:opacity-40">
          <Upload size={15} />
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />

        {showAdd ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              placeholder="New project name…"
              value={newName}
              disabled={creating || Boolean(creation)}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape' && !creating) {
                  cancelCreation();
                  setShowAdd(false);
                }
              }}
              className="w-44 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50"
            />
            <button onClick={handleAdd} disabled={creating || operationBusy} className="px-3 py-2 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium">
              {creating ? 'Saving…' : creation ? 'Retry' : 'Add'}
            </button>
            <button disabled={creating} onClick={() => { cancelCreation(); setShowAdd(false); }} className="px-2 py-2 text-text-dim hover:text-text text-sm">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium">
            <Plus size={16} /> Add
          </button>
        )}
        {account}
      </div>
    </div>
  );
}
