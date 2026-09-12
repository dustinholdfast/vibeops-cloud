'use client';

import { useState } from 'react';
import { Github, Loader2 } from 'lucide-react';
import { parseGitHubRepo } from '../lib/github-repo';
import { getActiveWorkspace, parseJson, WORKSPACE_HEADER } from '../lib/api';
import { useProjectStore } from '../store/useProjectStore';

export function GitHubPushButton({ projectId, repoUrl }: { projectId: string; repoUrl: string | null }) {
  const addActivity = useProjectStore((s) => s.addActivity);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const repo = parseGitHubRepo(repoUrl);

  if (!repo) {
    return (
      <p className="text-xs text-text-dim">
        Add a github.com repo URL to push a Noxen snapshot from here.
      </p>
    );
  }

  const push = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const workspace = getActiveWorkspace();
      const res = await fetch(`/api/projects/${projectId}/github`, {
        method: 'POST',
        credentials: 'include',
        headers: workspace ? { [WORKSPACE_HEADER]: workspace } : undefined,
      });
      const body = await parseJson<{ url?: string; path?: string; error?: string }>(res);
      if (body.url) {
        setMessage(`Pushed ${body.path ?? 'snapshot'}`);
        addActivity(projectId, {
          type: 'comment',
          message: `Pushed snapshot to ${repo.owner}/${repo.repo}`,
          author: 'You',
        });
        window.open(body.url, '_blank', 'noopener,noreferrer');
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not push to GitHub.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void push()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-purple/40 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
        {busy ? 'Pushing…' : `Push snapshot to ${repo.owner}/${repo.repo}`}
      </button>
      {message && <p className="text-xs text-text-muted">{message}</p>}
    </div>
  );
}
