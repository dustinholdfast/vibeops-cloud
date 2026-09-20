import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardClient, type DashboardSnapshot } from './DashboardClient';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';
import { listProjects, type Scope } from '@/src/db/project-service';
import { listWorkspaces, requireMembership } from '@/src/db/workspace-service';
import { listWorkspaceUptime, monitorStorageReady } from '@/src/db/monitor-service';
import { WORKSPACE_COOKIE } from '@/src/lib/request-scope';
import type { WorkspaceUptime } from '@/src/types';

async function loadUptime(scope: Scope): Promise<WorkspaceUptime> {
  try {
    if (!(await monitorStorageReady())) {
      return { available: false, monitored: [], unmonitored: [] };
    }
    const data = await listWorkspaceUptime(scope);
    return { available: true, ...data };
  } catch (error) {
    console.error('[dashboard] uptime preload failed', error);
    return { available: false, monitored: [], unmonitored: [] };
  }
}

export default async function DashboardPage() {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  let initial: DashboardSnapshot | null = null;
  try {
    const hint = (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
    let membership;
    try {
      membership = await requireMembership(userId, hint);
    } catch {
      membership = await requireMembership(userId, null);
    }
    const scope: Scope = { userId, workspace: membership };
    const [projectList, workspaces, uptime] = await Promise.all([
      listProjects(scope),
      listWorkspaces(userId),
      loadUptime(scope),
    ]);
    initial = {
      userId,
      workspaceId: membership.personal ? null : membership.workspaceId,
      workspaces: workspaces.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        personal: workspace.personal,
        ownerUserId: workspace.ownerUserId,
        role: workspace.role,
      })),
      projects: projectList.projects,
      uptime,
    };
  } catch (error) {
    console.error('[dashboard] initial load failed', error);
  }

  return <DashboardClient userId={userId} initial={initial} />;
}
