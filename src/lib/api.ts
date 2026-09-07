import type {
  Project,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from '@/src/types';

export const WORKSPACE_HEADER = 'x-vibeops-workspace';
const WORKSPACE_COOKIE = 'vibeops-workspace';

/**
 * The workspace every subsequent request acts in. Held in module state and
 * mirrored to a cookie so a full page load resolves the same workspace before
 * any client code has run.
 */
let activeWorkspaceId: string | null = null;

export function setActiveWorkspace(id: string | null) {
  activeWorkspaceId = id;
  if (typeof document === 'undefined') return;
  // Not a credential — it only names a workspace, and the server checks
  // membership regardless — but there is no reason to send it over plain HTTP.
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const base = `path=/; SameSite=Lax${secure}`;
  document.cookie = id
    ? `${WORKSPACE_COOKIE}=${encodeURIComponent(id)}; ${base}; max-age=31536000`
    : `${WORKSPACE_COOKIE}=; ${base}; max-age=0`;
}

export function getActiveWorkspace(): string | null {
  return activeWorkspaceId;
}

/** Merges the workspace header into any headers a caller already set. */
function scoped(headers?: HeadersInit): HeadersInit | undefined {
  if (!activeWorkspaceId) return headers;
  return { ...(headers as Record<string, string> | undefined), [WORKSPACE_HEADER]: activeWorkspaceId };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** A lost response is ambiguous; stable mutation IDs make an explicit retry safe. */
async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...init, headers: scoped(init.headers), signal: controller.signal }); }
  catch {
    throw new ApiError(0, 'NETWORK', 'Could not confirm the save. Check your connection and retry; your draft is still here.');
  } finally { clearTimeout(timeout); }
}

export async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText || 'Request failed';
    const code = typeof data === 'object' && data && 'code' in data ? String(data.code) : 'REQUEST_FAILED';
    throw new ApiError(res.status, code, res.status === 401 ? 'Your session expired. Please sign in again; your draft is still here.' : msg);
  }
  return data as T;
}

export async function apiListProjects(): Promise<Project[]> {
  const res = await request('/api/projects', { credentials: 'include' });
  const data = await parseJson<{ projects: Project[] }>(res);
  return data.projects ?? [];
}

export async function apiCreateProject(
  body: Partial<Project> & { name: string }
): Promise<Project> {
  const res = await request('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ project: Project }>(res);
  return data.project;
}

export async function apiUpdateProject(
  id: string,
  updates: Partial<Project> & { mutationId: string }
): Promise<Project> {
  const res = await request(`/api/projects/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await parseJson<{ project: Project }>(res);
  return data.project;
}

export async function apiGetProject(id: string): Promise<Project> {
  const res = await request(`/api/projects/${id}`, { credentials: 'include' });
  return (await parseJson<{ project: Project }>(res)).project;
}

export async function apiDeleteProject(id: string, version: number): Promise<void> {
  const res = await request(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function apiImportProjects(
  projects: Project[], versions: Record<string, number>
): Promise<Project[]> {
  const res = await request('/api/projects', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects, versions }),
  });
  const data = await parseJson<{ projects: Project[] }>(res);
  return data.projects ?? [];
}

// --- Workspaces -----------------------------------------------------------
//
// These calls name their workspace in the path, so they are unaffected by which
// workspace happens to be active.

export async function apiListWorkspaces(): Promise<Workspace[]> {
  const res = await request('/api/workspaces', { credentials: 'include' });
  return (await parseJson<{ workspaces: Workspace[] }>(res)).workspaces ?? [];
}

export async function apiCreateWorkspace(name: string): Promise<Workspace> {
  const res = await request('/api/workspaces', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await parseJson<{ workspace: Workspace }>(res)).workspace;
}

export async function apiRenameWorkspace(id: string, name: string): Promise<Workspace> {
  const res = await request(`/api/workspaces/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await parseJson<{ workspace: Workspace }>(res)).workspace;
}

export async function apiDeleteWorkspace(id: string): Promise<void> {
  const res = await request(`/api/workspaces/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function apiListMembers(
  id: string
): Promise<{ workspace: Workspace; members: WorkspaceMember[] }> {
  const res = await request(`/api/workspaces/${id}/members`, { credentials: 'include' });
  return parseJson<{ workspace: Workspace; members: WorkspaceMember[] }>(res);
}

export async function apiUpdateMemberRole(
  id: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  const res = await request(`/api/workspaces/${id}/members/${userId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  await parseJson<{ member: WorkspaceMember }>(res);
}

export async function apiRemoveMember(id: string, userId: string): Promise<void> {
  const res = await request(`/api/workspaces/${id}/members/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function apiListInvites(id: string): Promise<WorkspaceInvite[]> {
  const res = await request(`/api/workspaces/${id}/invites`, { credentials: 'include' });
  return (await parseJson<{ invites: WorkspaceInvite[] }>(res)).invites ?? [];
}

/** The returned link is shown once; the server keeps only its hash. */
export async function apiCreateInvite(
  id: string,
  email: string,
  role: WorkspaceRole
): Promise<{ invite: WorkspaceInvite; inviteUrl: string }> {
  const res = await request(`/api/workspaces/${id}/invites`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  return parseJson<{ invite: WorkspaceInvite; inviteUrl: string }>(res);
}

export async function apiRevokeInvite(id: string, inviteId: string): Promise<void> {
  const res = await request(`/api/workspaces/${id}/invites/${inviteId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function apiAcceptInvite(token: string): Promise<Workspace> {
  const res = await request('/api/workspaces/invites/accept', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return (await parseJson<{ workspace: Workspace }>(res)).workspace;
}
