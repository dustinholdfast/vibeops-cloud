'use client';

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import type { OAuthStrategy } from '@clerk/types';

function clerkError(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'errors' in cause) {
    const first = (cause as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return 'Could not start GitHub sign-in.';
}

type SocialInfo = {
  frontendApi?: string;
  keyKind?: string;
  strategies?: string[];
  githubStrategy?: string | null;
  error?: string;
};

export function GitHubAuthButton({ label = 'Continue with GitHub' }: { label?: string }) {
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const signIn = clerk.client?.signIn;
      if (!signIn) throw new Error('Clerk is still loading. Try again in a moment.');

      const info = (await fetch('/api/auth/social').then((response) => response.json())) as SocialInfo;
      if (info.error) throw new Error(info.error);

      const strategy = info.githubStrategy;
      if (!strategy) {
        const allowed = info.strategies?.length ? info.strategies.join(', ') : 'none';
        throw new Error(
          `GitHub is not enabled for sign-in on the Clerk instance this site is using (${info.keyKind} · ${info.frontendApi}). Allowed social strategies: ${allowed}. Open that exact instance in the Clerk dashboard — Development if the key is pk_test, Production if it is pk_live — then SSO connections → Add connection → For all users → GitHub → Enable for sign-up and sign-in.`
        );
      }

      await signIn.authenticateWithRedirect({
        strategy: strategy as OAuthStrategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/dashboard',
      });
    } catch (cause) {
      setError(clerkError(cause));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={!clerk.loaded || busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-text hover:border-purple/40 disabled:opacity-50"
      >
        <GitHubMark />
        {busy ? 'Redirecting…' : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger whitespace-pre-wrap">
          {error}
        </p>
      )}
    </div>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.68 7.68 0 0 1 8 4.07c.64.003 1.28.087 1.88.25 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
