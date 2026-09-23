import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/src/components/MarketingShell';
import { LEGAL, PRIVACY_SECTIONS } from '@/src/lib/marketing/legal';

export const metadata: Metadata = {
  title: `Privacy — ${LEGAL.product}`,
  description: `How ${LEGAL.product} handles account, billing, and project data.`,
};

export default function PrivacyPage() {
  return (
    <MarketingShell
      right={
        <Link href="/terms" className="text-sm text-text-muted hover:text-text">
          Terms
        </Link>
      }
    >
      <article className="max-w-2xl space-y-8">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">Legal</p>
          <h1 className="text-3xl font-semibold tracking-tight text-text">Privacy</h1>
          <p className="text-sm text-text-muted">Last updated {LEGAL.updated}</p>
        </div>
        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-text">{section.title}</h2>
            <p className="text-sm text-text-muted leading-relaxed">{section.body}</p>
          </section>
        ))}
      </article>
    </MarketingShell>
  );
}
