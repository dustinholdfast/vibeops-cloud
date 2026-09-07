'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { apiAcceptInvite, setActiveWorkspace } from '@/src/lib/api';

type Status =
  | { state: 'working' }
  | { state: 'joined'; name: string }
  | { state: 'failed'; message: string };

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ state: 'working' });
  // React may mount effects twice in development; the token is single-use.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        const workspace = await apiAcceptInvite(token);
        setActiveWorkspace(workspace.workspaceId);
        setStatus({ state: 'joined', name: workspace.name });
        setTimeout(() => router.push('/dashboard'), 1200);
      } catch (error) {
        setStatus({
          state: 'failed',
          message:
            error instanceof Error ? error.message : 'That invitation could not be accepted.',
        });
      }
    })();
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-text">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center">
        {status.state === 'working' && (
          <>
            <Loader2 size={22} className="mx-auto animate-spin text-purple-light" aria-hidden />
            <p className="mt-3 text-sm text-text-muted">Checking your invitation…</p>
          </>
        )}

        {status.state === 'joined' && (
          <>
            <CheckCircle2 size={22} className="mx-auto text-success" aria-hidden />
            <h1 className="mt-3 text-base font-semibold">You have joined {status.name}</h1>
            <p className="mt-1 text-sm text-text-muted">Taking you to the workspace…</p>
          </>
        )}

        {status.state === 'failed' && (
          <>
            <CircleAlert size={22} className="mx-auto text-warning" aria-hidden />
            <h1 className="mt-3 text-base font-semibold">This invitation did not work</h1>
            <p className="mt-1 text-sm text-text-muted">{status.message}</p>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="mt-4 rounded-lg bg-purple px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-light"
            >
              Go to your dashboard
            </button>
          </>
        )}
      </div>
    </main>
  );
}
