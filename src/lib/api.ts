import type { Project } from '@/src/types';

export async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data as T;
}

export async function apiListProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects', { credentials: 'include' });
  const data = await parseJson<{ projects: Project[] }>(res);
  return data.projects ?? [];
}

export async function apiCreateProject(
  body: Partial<Project> & { name: string }
): Promise<Project> {
  const res = await fetch('/api/projects', {
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
  updates: Partial<Project>
): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await parseJson<{ project: Project }>(res);
  return data.project;
}

export async function apiDeleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson<{ ok: boolean }>(res);
}

export async function apiImportProjects(
  projects: Project[]
): Promise<Project[]> {
  const res = await fetch('/api/projects', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects }),
  });
  const data = await parseJson<{ projects: Project[] }>(res);
  return data.projects ?? [];
}
