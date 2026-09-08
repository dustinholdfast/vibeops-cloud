import Link from 'next/link';
import { PLANS } from '@/src/lib/plans';
import { getOptionalUserId } from '@/src/lib/auth';
import { PricingActions } from './PricingActions';

export default async function PricingPage() {
  const userId = await getOptionalUserId();

  return (
    <div className="min-h-full px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between gap-3 mb-10">
          <Link href="/" className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
            <span className="font-semibold text-text">
              Vibe <span className="text-text-muted font-normal">/ Ops</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-purple-light bg-purple/15 px-1.5 py-0.5 rounded">
              Cloud
            </span>
          </Link>
          <Link href={userId ? '/dashboard' : '/sign-in'} className="text-sm text-text-muted hover:text-text">
            {userId ? 'Dashboard' : 'Sign in'}
          </Link>
        </header>

        <div className="text-center mb-10 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">Plans</p>
          <h1 className="text-4xl font-semibold tracking-tight text-text">
            Simple <span className="text-purple-light">pricing</span>
          </h1>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Start free. Upgrade when five projects isn’t enough — same focused tracker, just synced.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {(['free', 'pro'] as const).map((id) => {
            const plan = PLANS[id];
            const highlighted = id === 'pro';
            return (
              <div
                key={id}
                className={
                  highlighted
                    ? 'rounded-2xl border border-purple/50 bg-surface p-6 shadow-[0_0_40px_-12px_rgba(139,124,246,0.35)]'
                    : 'rounded-2xl border border-border bg-surface p-6'
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-text-dim">{highlighted ? 'Recommended' : 'Start here'}</p>
                    <h2 className="mt-1 text-lg font-semibold text-text">{plan.name}</h2>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-semibold tracking-tight text-text tabular-nums">
                      {plan.priceMonthlyLabel}
                    </span>
                    {id === 'pro' && <span className="text-xs text-text-dim block">/ month</span>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-text-muted">{plan.description}</p>
                <ul className="mt-5 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm text-text flex gap-2">
                      <span className="text-purple-light" aria-hidden>
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <PricingActions planId={id} signedIn={Boolean(userId)} />
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-text-dim">
          Yearly Pro is available at checkout ({PLANS.pro.priceYearlyLabel}/year). Cancel anytime via the billing portal.
        </p>
      </div>
    </div>
  );
}
