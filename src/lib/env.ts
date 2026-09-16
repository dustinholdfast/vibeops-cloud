/**
 * Secrets pasted from a Windows console often arrive with a trailing CR, and
 * `.env` files can carry a BOM. Clerk keys and DATABASE_URL must match the
 * value the issuer produced, not the line-ending that rode along.
 */
export function env(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
