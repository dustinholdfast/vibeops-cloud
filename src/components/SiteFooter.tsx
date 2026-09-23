import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="px-6 py-8 text-center text-xs text-text-dim">
      <nav className="flex items-center justify-center gap-3">
        <Link href="/privacy" className="hover:text-text">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-text">
          Terms
        </Link>
      </nav>
    </footer>
  );
}
