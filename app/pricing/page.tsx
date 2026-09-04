import Link from 'next/link';
import { PLANS } from '@/src/lib/plans';
import { getOptionalUserId } from '@/src/lib/auth';
import { PricingActions } from './PricingActions';

export default async function PricingPage() {
  const userId = await getOptionalUserId();

  return (
    <div className="min-h-full px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 space-y-3">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-semibold text-text">
              Vibe <span className="text-text-muted font-normal">/ Ops</span>{' '}
              <span className="text-[10px] uppercase tracking-wider text-purple-light bg-purple/15 px-1.5 py-0.5 rounded ml-1">
                Cloud
              </span>
            </span>
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-text">
            Simple pricing
          </h1>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Start free. Upgrade when five projects isn’t enough.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {(['free', 'pro'] as const).map((id) => {
            const plan = PLANS[id];
            const highlighted = id === 'pro';
            return (
              <div
                key={id}
                className={
                  highlighted
                    ? 'rounded-2xl border border-purple/50 bg-purple/5 p-6 shadow-[0_0_40px_-12px_rgba(139,124,246,0.35)]'
                    : 'rounded-2xl border border-border bg-surface p-6'
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-text">{plan.name}</h2>
                  <div className="text-right">
                    <span className="text-2xl font-semibold text-text">
                      {plan.priceMonthlyLabel}
                    </span>
                    {id === 'pro' && (
                      <span className="text-xs text-text-dim block">/ month</span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-text-muted">{plan.description}</p>
                <ul className="mt-5 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm text-text-muted flex gap-2">
                      <span className="text-purple-light">✓</span>
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
          Yearly Pro is available at checkout ({PLANS.pro.priceYearlyLabel}/year).
          Cancel anytime via the billing portal.
        </p>
      </div>
    </div>
  );
}
