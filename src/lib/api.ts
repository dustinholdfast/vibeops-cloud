import type { Project } from '@/src/types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** A lost response is ambiguous; stable mutation IDs make an explicit retry safe. */
async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
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
