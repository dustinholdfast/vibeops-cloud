'use client';

import { useEffect, useState } from 'react';
import { UserButton } from '@clerk/nextjs';
import { Sidebar } from '@/src/components/Sidebar';
import { Header } from '@/src/components/Header';
import { StatusCards } from '@/src/components/StatusCards';
import { ProjectList } from '@/src/components/ProjectList';
import { ProjectDrawer } from '@/src/components/ProjectDrawer';
import { useProjectStore } from '@/src/store/useProjectStore';
import { WorkspaceSaveNotice } from '@/src/components/SaveStatus';
import { IntelligenceBand } from '@/src/components/IntelligenceBand';
import { EmptyWorkspace } from '@/src/components/EmptyWorkspace';

export function DashboardClient({ userId }: { userId: string }) {
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadWorkspaces = useProjectStore((s) => s.loadWorkspaces);
  const loadStatus = useProjectStore((s) => s.loadStatus);
  const loadError = useProjectStore((s) => s.loadError);
  const projects = useProjectStore((s) => s.projects);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    void loadProjects(userId);
    void loadWorkspaces();
  }, [loadProjects, loadWorkspaces, userId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const state = useProjectStore.getState();
      if (Object.keys(state.drafts).length || state.creation || state.operationBusy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="flex h-full bg-background text-text overflow-hidden">
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <WorkspaceSaveNotice />

        {loadStatus === 'loading' || loadStatus === 'idle' ? (
          <div className="flex-1 flex items-center justify-center text-sm text-text-dim">
            Loading your workspace…
          </div>
        ) : loadStatus === 'error' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-danger font-medium">Could not load projects</p>
            <p className="text-xs text-text-dim max-w-md">{loadError || 'Please try again in a moment.'}</p>
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="px-3 py-1.5 rounded-lg bg-purple text-white text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5 pb-8">
              <Header
                onMenu={() => setNavOpen(true)}
                account={
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{ elements: { avatarBox: 'w-8 h-8' } }}
                  />
                }
              />
              {projects.length === 0 ? (
                <EmptyWorkspace />
              ) : (
                <>
                  <IntelligenceBand />
                  <StatusCards />
                  <ProjectList />
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <ProjectDrawer />
    </div>
  );
}
