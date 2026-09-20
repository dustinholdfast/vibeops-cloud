/**
 * Signed-out users on protected pages must reach /sign-in, not Clerk's
 * protect() rewrite to the Next 404 page.
 */
export function signInUrl(origin: string, pathnameAndSearch: string): string {
  const signIn = new URL('/sign-in', origin);
  const next = pathnameAndSearch || '/';
  if (next !== '/dashboard' && isSafeAuthRedirect(next)) {
    signIn.searchParams.set('redirect_url', next);
  }
  return signIn.toString();
}

export function isSafeAuthRedirect(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return false;
  return true;
}

export function safeAuthRedirect(value: string | string[] | undefined | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !isSafeAuthRedirect(raw)) return '/dashboard';
  return raw;
}
