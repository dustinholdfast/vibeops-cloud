'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { AuthFrame } from '@/src/components/AuthFrame';
import { MIN_PASSWORD_LENGTH } from '@/src/lib/password-reset';

type Status = 'checking' | 'ready' | 'saving' | 'done' | 'invalid';

async function readBody(res: Response) {
  return (await res.json().catch(() => ({}))) as { error?: string };
}

export function ResetPasswordClient({ userId, token }: { userId: string; token: string }) {
  const [status, setStatus] = useState<Status>(userId && token ? 'checking' : 'invalid');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (!userId || !token) return;
    let active = true;
    void (async () => {
      const res = await fetch(
        `/api/auth/reset-password?user=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`
      );
      if (!active) return;
      if (!res.ok) {
        setStatus('invalid');
        return;
      }
      setStatus('ready');
    })();
    return () => {
      active = false;
    };
  }, [userId, token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setError(null);
    setStatus('saving');
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token, password }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      setStatus('ready');
      setError(body.error || 'Could not update the password.');
      return;
    }
    setStatus('done');
  };

  if (status === 'checking') {
    return (
      <AuthFrame title="Reset password" subtitle="Checking that link…">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin text-purple-light" aria-hidden />
          One moment.
        </div>
      </AuthFrame>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthFrame title="This link did not work" subtitle="Ask an admin to send a new password reset.">
        <div className="flex items-start gap-2 text-sm text-text-muted">
          <CircleAlert size={16} className="mt-0.5 text-warning" aria-hidden />
          The reset link is invalid or has expired.
        </div>
        <Link href="/sign-in" className="mt-5 inline-flex rounded-lg bg-purple px-4 py-2 text-sm font-medium text-white">
          Back to sign in
        </Link>
      </AuthFrame>
    );
  }

  if (status === 'done') {
    return (
      <AuthFrame title="Password updated" subtitle="Sign in with the password you just chose.">
        <Link href="/sign-in" className="inline-flex rounded-lg bg-purple px-4 py-2 text-sm font-medium text-white">
          Sign in
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Choose a new password" subtitle="This replaces the password on your Noxen account.">
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
        <label className="block text-sm">
          <span className="text-text-muted">New password</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Confirm password</span>
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-lg bg-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {status === 'saving' ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthFrame>
  );
}
