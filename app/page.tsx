import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="VibeOps" width={48} height={48} className="rounded-xl" />
          <span className="text-2xl font-semibold tracking-tight">
            Vibe <span className="text-text-muted font-normal">/ Ops</span>{' '}
            <span className="text-sm font-medium uppercase tracking-wider text-purple-light bg-purple/15 px-2 py-0.5 rounded ml-1">
              Cloud
            </span>
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-text">
            Your projects, synced.
          </h1>
          <p className="text-text-muted text-base leading-relaxed">
            The same focused tracker as Local — with accounts, multi-device access,
            and (soon) subscriptions. Sign in to open your workspace.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-border bg-surface text-text text-sm font-medium hover:bg-surface-elevated transition-colors"
          >
            Create account
          </Link>
        </div>

        <p className="text-xs text-text-dim">
          Prefer offline? Use{' '}
          <a
            href="https://github.com/dustinholdfast/vibeops"
            className="text-purple-light hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            VibeOps Local
          </a>
          .
        </p>
      </div>
    </div>
  );
}
