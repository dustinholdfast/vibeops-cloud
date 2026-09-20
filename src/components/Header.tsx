'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useProjectStore, MAX_NOW_SLOTS } from '../store/useProjectStore';
import { format } from 'date-fns';
import { Menu, Search, Plus, Download, Upload, Sun, Moon, Sparkles } from 'lucide-react';
import { useTheme } from '../lib/useTheme';
import { downloadProjectsExport } from '../lib/export-projects';
import type { Project } from '../types';

export function Header({
  account,
  onMenu,
  onPalette,
  onCopilot,
}: {
  account?: ReactNode;
  onMenu?: () => void;
  onPalette?: () => void;
  onCopilot?: () => void;
}) {
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
    addRequested,
    clearAddRequest,
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
    if (!addRequested) return;
    setShowAdd(true);
    clearAddRequest();
  }, [addRequested, clearAddRequest]);

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
    downloadProjectsExport(getExportPayload());
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
          reportError('That file is not a Noxen export: expected an array of projects or { projects: [...] }.');
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
      <div className="min-w-0 flex items-start gap-3">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            className="mt-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted hover:text-text lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wider text-text-dim uppercase">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h1 className="text-xl font-semibold text-text tracking-tight">Command center</h1>
          <p className="text-sm text-text-muted truncate">{sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter list"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 sm:w-52 pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50 focus:ring-1 focus:ring-purple/30"
          />
        </div>
        {onPalette && (
          <button
            type="button"
            onClick={onPalette}
            title="Command palette"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-surface border border-border text-[11px] text-text-dim hover:text-text"
          >
            <kbd className="font-sans">⌘K</kbd>
          </button>
        )}
        {onCopilot && (
          <button
            type="button"
            onClick={onCopilot}
            title="Nox (⌘J)"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-border text-text-muted hover:text-text"
            aria-label="Open Nox"
          >
            <Sparkles size={16} />
          </button>
        )}

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
              className="w-36 sm:w-44 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50"
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
