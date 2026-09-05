'use client';

import { useEffect } from 'react';
import { UserButton } from '@clerk/nextjs';
import { Sidebar } from '@/src/components/Sidebar';
import { Header } from '@/src/components/Header';
import { StatusCards } from '@/src/components/StatusCards';
import { ProjectList } from '@/src/components/ProjectList';
import { ProjectDrawer } from '@/src/components/ProjectDrawer';
import { useProjectStore } from '@/src/store/useProjectStore';
import { WorkspaceSaveNotice } from '@/src/components/SaveStatus';

export function DashboardClient({ userId }: { userId: string }) {
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadStatus = useProjectStore((s) => s.loadStatus);
  const loadError = useProjectStore((s) => s.loadError);

  useEffect(() => {
    void loadProjects(userId);
  }, [loadProjects, userId]);

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

  return (
    <div className="flex h-full bg-background text-text overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <WorkspaceSaveNotice />
        <div className="flex items-center justify-end gap-3 px-6 pt-4">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
              },
            }}
          />
        </div>

        {loadStatus === 'loading' || loadStatus === 'idle' ? (
          <div className="flex-1 flex items-center justify-center text-sm text-text-dim">
            Loading your workspace…
          </div>
        ) : loadStatus === 'error' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-danger font-medium">Could not load projects</p>
            <p className="text-xs text-text-dim max-w-md">
              {loadError || 'Please try again in a moment.'}
            </p>
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
            <div className="max-w-6xl mx-auto px-6 py-2 pb-6">
              <Header />
              <StatusCards />
              <ProjectList />
            </div>
          </div>
        )}
      </main>

      <ProjectDrawer />
    </div>
  );
}
