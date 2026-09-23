import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/src/components/SiteFooter';

export function MarketingShell({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col px-6 py-8">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        <header className="flex items-center justify-between gap-3 mb-10">
          <Link href="/" className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
            <span className="font-semibold text-text">Noxen</span>
            <span className="text-[10px] uppercase tracking-wider text-purple-light bg-purple/15 px-1.5 py-0.5 rounded">
              Cloud
            </span>
          </Link>
          {right}
        </header>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </div>
  );
}
