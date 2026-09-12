import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
        <span className="font-semibold tracking-tight text-text">
          Noxen
        </span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
        <p className="mt-1 mb-5 text-sm text-text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
