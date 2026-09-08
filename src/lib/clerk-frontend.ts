export function clerkFrontendApi(publishableKey: string): string | null {
  const encoded = publishableKey.split('_').slice(2).join('_');
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$+$/g, '').trim();
    const host = decoded.replace(/[^a-zA-Z0-9.-]/g, '');
    return host || null;
  } catch {
    return null;
  }
}

export function clerkKeyKind(publishableKey: string): 'test' | 'live' | 'unknown' {
  if (publishableKey.startsWith('pk_live_')) return 'live';
  if (publishableKey.startsWith('pk_test_')) return 'test';
  return 'unknown';
}
