import { useState, useRef } from 'react';
import { useProjectStore, MAX_NOW_SLOTS } from '../store/useProjectStore';
import { format } from 'date-fns';
import { Search, Plus, Download, Upload } from 'lucide-react';
import type { Project } from '../types';

export function Header() {
  const {
    search,
    setSearch,
    addProject,
    projects,
    getExportPayload,
    importProjects,
  } = useProjectStore();
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nowProjects = projects.filter((p) => p.priority === 'Now');
  const nowCount = nowProjects.length;

  let heading: string;
  if (nowCount === 0) {
    heading = 'Nothing is claimed for today';
  } else if (nowCount === 1) {
    heading = `${nowProjects[0].name} is claimed for today`;
  } else if (nowCount <= MAX_NOW_SLOTS) {
    heading = `${nowCount} projects claimed for today`;
  } else {
    heading = `${nowCount} projects claimed (over the ${MAX_NOW_SLOTS}-slot soft limit)`;
  }

  const handleAdd = () => {
    if (!newName.trim()) return;
    addProject({ name: newName.trim() });
    setNewName('');
    setShowAdd(false);
  };

  const handleExport = () => {
    const payload = getExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibeops-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        let list: Project[] = [];
        if (Array.isArray(raw)) {
          list = raw;
        } else if (raw && Array.isArray(raw.projects)) {
          list = raw.projects;
        } else {
          alert('Invalid export file: expected an array of projects or { projects: [...] }.');
          return;
        }
        if (
          !confirm(
            `Import ${list.length} project${list.length === 1 ? '' : 's'}? This will replace your current data.`
          )
        ) {
          return;
        }
        importProjects(list);
      } catch {
        alert('Could not parse the file as JSON.');
      }
    };
    reader.readAsText(file);
    // reset so the same file can be chosen again
    e.target.value = '';
  };

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium tracking-wider text-text-dim uppercase">
            {format(new Date(), 'EEEE, MMMM d').toUpperCase()}
          </p>
          <h1 className="text-2xl font-semibold text-text mt-1 tracking-tight">{heading}</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              placeholder="Search projects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50 focus:ring-1 focus:ring-purple/30"
            />
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text text-sm transition-colors"
            title="Export projects as JSON"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            type="button"
            onClick={handleImportClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text text-sm transition-colors"
            title="Import projects from JSON"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />

          {showAdd ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                placeholder="New project name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') setShowAdd(false);
                }}
                className="w-48 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50"
              />
              <button
                onClick={handleAdd}
                className="px-3 py-2 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-2 py-2 text-text-dim hover:text-text text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
