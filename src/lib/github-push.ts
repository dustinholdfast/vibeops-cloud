import { clerkClient } from '@clerk/nextjs/server';
import { ProjectError } from './project-validation';
import { parseGitHubRepo, snapshotPath, type GitHubRepoRef } from './github-repo';

export async function githubAccessToken(userId: string): Promise<string> {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(userId, 'github');
  const token = response.data[0]?.token;
  if (!token) {
    throw new ProjectError(
      400,
      'GITHUB_DISCONNECTED',
      'Connect GitHub on this account (User button → Manage account → Connected accounts) and grant repo access. Clerk must request the repo scope.'
    );
  }
  return token;
}

async function githubJson(
  token: string,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

export async function putGitHubFile({
  token,
  ref,
  path,
  content,
  message,
  branch,
}: {
  token: string;
  ref: GitHubRepoRef;
  path: string;
  content: string;
  message: string;
  branch?: string;
}) {
  const encodedPath = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}`;
  const existing = await githubJson(token, `${api}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`);
  const sha = typeof existing.body.sha === 'string' ? existing.body.sha : undefined;

  const put = await githubJson(token, api, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      branch,
    }),
  });

  if (!put.ok) {
    const hint = typeof put.body.message === 'string' ? put.body.message : 'GitHub rejected the commit.';
    if (put.status === 404) {
      throw new ProjectError(404, 'GITHUB_REPO', 'That repository was not found with this GitHub account.');
    }
    if (put.status === 403) {
      throw new ProjectError(
        403,
        'GITHUB_SCOPE',
        'GitHub refused write access. Reconnect GitHub in Clerk with the repo scope enabled.'
      );
    }
    throw new ProjectError(put.status >= 400 ? put.status : 502, 'GITHUB_PUSH', hint);
  }

  const commit =
    put.body.commit && typeof put.body.commit === 'object'
      ? (put.body.commit as { html_url?: string; sha?: string })
      : {};
  const file =
    put.body.content && typeof put.body.content === 'object'
      ? (put.body.content as { html_url?: string; path?: string })
      : {};

  return {
    path: file.path ?? path,
    url: file.html_url ?? commit.html_url ?? `https://github.com/${ref.owner}/${ref.repo}`,
    sha: commit.sha ?? null,
  };
}

export function requireGitHubRepo(url: string | null | undefined): GitHubRepoRef {
  const ref = parseGitHubRepo(url);
  if (!ref) {
    throw new ProjectError(
      400,
      'VALIDATION',
      'Add a github.com repository URL to this project before pushing.'
    );
  }
  return ref;
}

export { snapshotPath };
