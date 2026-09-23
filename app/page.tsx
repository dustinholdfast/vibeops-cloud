import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOptionalUserId, isClerkConfigured } from '@/src/lib/auth';
import { GitHubAuthButton } from '@/src/components/GitHubAuthButton';
import { LandingPreview } from '@/src/components/LandingPreview';
import { LANDING_COPY, LANDING_META } from '@/src/lib/marketing/landing';

export const metadata: Metadata = {
  title: LANDING_META.title,
  description: LANDING_META.description,
  openGraph: {
    title: LANDING_META.title,
    description: LANDING_META.description,
    siteName: 'Noxen Cloud',
  },
};

export default async function HomePage() {
  const userId = await getOptionalUserId();
  if (userId) redirect('/dashboard');

  /**
   * The GitHub button uses Clerk hooks, and the root layout mounts
   * <ClerkProvider> only when a publishable key exists. Rendering it without
   * one throws and takes the whole landing page down with a 500 — the
   * marketing page, replaced by the runtime's error boundary. Every other auth
   * surface already guards on this helper; this one was missed when GitHub
   * sign-in was added.
   */
  const authReady = isClerkConfigured();

  return (
    <div className="min-h-full flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
          <span className="font-semibold tracking-tight">Noxen</span>
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

      <main className="flex-1 flex flex-col items-center px-6 pt-8 pb-16 sm:pt-12">
        <div className="max-w-2xl w-full text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">
            {LANDING_COPY.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-text">
            {LANDING_COPY.headline}
          </h1>
          <p className="mt-4 text-text-muted text-base leading-relaxed max-w-lg mx-auto">
            {LANDING_COPY.subhead}
          </p>
          <div className="mt-8 mx-auto w-full max-w-xs space-y-3">
            {authReady && <GitHubAuthButton label="Continue with GitHub" />}
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-purple hover:bg-purple-light text-white text-sm font-semibold"
              >
                Start free
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-border bg-surface text-text text-sm font-medium hover:bg-surface-elevated"
              >
                See pricing
              </Link>
            </div>
            <p className="text-xs text-text-dim">{LANDING_COPY.freeNote}</p>
          </div>
        </div>

        <div className="mt-12 w-full max-w-4xl">
          <LandingPreview />
        </div>

        <div className="mt-12 grid w-full max-w-3xl grid-cols-1 sm:grid-cols-3 gap-3">
          {LANDING_COPY.tiles.map((tile) => (
            <article key={tile.title} className="rounded-2xl border border-border bg-surface p-4 text-left">
              <p className="text-sm font-semibold text-text">{tile.title}</p>
              <p className="mt-1 text-xs text-text-muted leading-relaxed">{tile.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 max-w-xl w-full text-center space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
            {LANDING_COPY.explainerTitle}
          </h2>
          <p className="text-sm text-text-muted leading-relaxed">{LANDING_COPY.explainer}</p>
        </div>

        <p className="mt-10 text-xs text-text-dim">
          {LANDING_COPY.localPrompt}{' '}
          <a
            href={LANDING_COPY.localHref}
            className="text-purple-light hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {LANDING_COPY.localLabel}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
