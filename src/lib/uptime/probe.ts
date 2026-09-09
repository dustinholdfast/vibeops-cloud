import { isHealthyStatus, type ProbeOutcome } from './status';
import { validateTarget } from './target';

/**
 * Performs one HTTP check. The only impure part of the uptime code: everything
 * that decides what a result *means* lives in `status.ts`.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

/** Identifies the checker so site owners can see who is hitting them. */
const USER_AGENT = 'VibeOpsUptime/1.0 (+https://github.com/dustinholdfast/vibeops-cloud)';

export async function probe(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ProbeOutcome> {
  // Re-checked at request time, not just when it was saved: a stored URL could
  // predate a rule change, and this is the last gate before a server-side fetch.
  const target = validateTarget(url);
  if (!target.ok) {
    return { ok: false, statusCode: null, latencyMs: null, error: target.reason };
  }

  const budget = Math.min(Math.max(1_000, timeoutMs), MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const startedAt = Date.now();

  try {
    const response = await fetch(target.url, {
      method: 'GET',
      redirect: 'manual', // A redirect could point at a private address.
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      cache: 'no-store',
    });

    const latencyMs = Date.now() - startedAt;

    // The body is never read: only the status line matters, and downloading a
    // large page on every check would be wasteful for us and for them.
    return {
      ok: isHealthyStatus(response.status),
      statusCode: response.status,
      latencyMs,
      error: isHealthyStatus(response.status) ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const timedOut = error instanceof Error && error.name === 'AbortError';

    return {
      ok: false,
      statusCode: null,
      latencyMs,
      error: timedOut
        ? `No response within ${Math.round(budget / 1000)}s`
        : describe(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A short, human-readable failure. Node nests the useful part of a network
 * error in `cause`, and the outer message ("fetch failed") says nothing.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return 'Request failed';

  const cause = (error as { cause?: unknown }).cause;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : null;

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Host not found';
    case 'ECONNREFUSED':
      return 'Connection refused';
    case 'ECONNRESET':
      return 'Connection reset';
    case 'CERT_HAS_EXPIRED':
      return 'TLS certificate has expired';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return 'TLS certificate could not be verified';
    default:
      return code ?? (error.message || 'Request failed');
  }
}
