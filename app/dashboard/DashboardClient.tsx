'use client';

import { UserButton } from '@clerk/nextjs';
import { Sidebar } from '@/src/components/Sidebar';
import { Header } from '@/src/components/Header';
import { StatusCards } from '@/src/components/StatusCards';
import { ProjectList } from '@/src/components/ProjectList';
import { ProjectDrawer } from '@/src/components/ProjectDrawer';

/**
 * Phase 3 interim: UI still uses client Zustand + localStorage.
 * Next slice wires the store to /api/projects (server-backed, per-user).
 */
export function DashboardClient() {
  return (
    <div className="flex h-full bg-background text-text overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-2 pb-6">
            <Header />
            <StatusCards />
            <ProjectList />
          </div>
        </div>
      </main>

      <ProjectDrawer />
    </div>
  );
}
