import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOptionalUserId } from '@/src/lib/auth';

const tiles = [
  { title: 'Now slots', body: 'Three focus cards. Everything else waits.' },
  { title: 'Rotting', body: 'Silence after seven days shows up on purpose.' },
  { title: 'Workspaces', body: 'Personal by default. Invite a teammate when you need one.' },
];

export default async function HomePage() {
  const userId = await getOptionalUserId();
  if (userId) redirect('/dashboard');

  return (
    <div className="min-h-full flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
          <span className="font-semibold tracking-tight">
            Vibe <span className="text-text-muted font-normal">/ Ops</span>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-purple-light bg-purple/15 px-1.5 py-0.5 rounded">
            Cloud
          </span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/pricing" className="text-text-muted hover:text-text">
            Pricing
          </Link>
          <Link href="/sign-in" className="text-text-muted hover:text-text">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-purple px-3 py-1.5 text-white text-sm font-medium hover:bg-purple-light"
          >
            Create account
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
        <div className="max-w-2xl w-full text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">Command center</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-text">
            Your projects, synced.
          </h1>
          <p className="mt-4 text-text-muted text-base leading-relaxed max-w-lg mx-auto">
            The same focused tracker as Local — with accounts, workspaces, and Pro when five projects is no longer enough.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-purple hover:bg-purple-light text-white text-sm font-semibold shadow-[0_10px_24px_-12px_rgba(139,124,255,0.9)]"
            >
              Start free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl border border-border bg-surface text-text text-sm font-medium hover:bg-surface-elevated"
            >
              See pricing
            </Link>
          </div>
        </div>

        <div className="mt-14 grid w-full max-w-3xl grid-cols-1 sm:grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <article key={tile.title} className="rounded-2xl border border-border bg-surface p-4 text-left">
              <p className="text-sm font-semibold text-text">{tile.title}</p>
              <p className="mt-1 text-xs text-text-muted leading-relaxed">{tile.body}</p>
            </article>
          ))}
        </div>

        <p className="mt-10 text-xs text-text-dim">
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
      </main>
    </div>
  );
}
