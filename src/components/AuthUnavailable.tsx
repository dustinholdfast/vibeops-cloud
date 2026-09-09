import Link from 'next/link';

export function AuthUnavailable() {
  return (
    <main className="min-h-full flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-xl sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="VibeOps" width={48} height={48} className="mx-auto rounded-xl" />
        <h1 className="mt-5 text-xl font-semibold text-text">Account access is unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          This deployment is not connected to the account service yet. Please try again later.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-border"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
