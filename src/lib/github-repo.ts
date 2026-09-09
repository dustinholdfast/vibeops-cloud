export type GitHubRepoRef = {
  owner: string;
  repo: string;
};

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export function parseGitHubRepo(url: string | null | undefined): GitHubRepoRef | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    const parts = parsed.pathname.replace(/^\/+/g, '').replace(/\.git$/i, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export function snapshotPath(projectId: string): string {
  const safe = projectId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'project';
  return `.vibeops/${safe}.md`;
}
