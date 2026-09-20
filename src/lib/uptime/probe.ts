import { isHealthyStatus, type ProbeErrorKind, type ProbeOutcome, type ProbeVia } from './status';
import {
  describeCloudflareFetchFailure,
  hostnameOf,
  isSelfTarget,
} from './self-host';
import { validateTarget } from './target';

/**
 * Performs one HTTP check. The only impure part of the uptime code: everything
 * that decides what a result *means* lives in `status.ts`.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

/** Identifies the checker so site owners can see who is hitting them. */
const USER_AGENT = 'NoxenUptime/1.0 (+https://github.com/dustinholdfast/vibeops-cloud)';

const SELF_UNAVAILABLE =
  'This Worker cannot fetch its own URL over the public Internet, and no internal check is available.';

export type ProbeFetch = (input: Request) => Promise<Response>;

export type ProbeContext = {
  /** Hostnames this Worker is serving (the incoming request + NEXT_PUBLIC_APP_URL). */
  selfHosts?: string[];
  /** Service binding / loopback to this Worker — hits the monitored path. */
  selfFetch?: ProbeFetch;
  /** In-process /api/health when the target is this Worker and selfFetch is absent. */
  healthFetch?: () => Promise<Response>;
  /** Override of global fetch, for tests. */
  fetch?: ProbeFetch;
};

export async function probe(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ctx: ProbeContext = {}
): Promise<ProbeOutcome> {
  // Re-checked at request time, not just when it was saved: a stored URL could
  // predate a rule change, and this is the last gate before a server-side fetch.
  const target = validateTarget(url);
  if (!target.ok) {
    return { ok: false, statusCode: null, latencyMs: null, error: target.reason };
  }

  const selfHosts = ctx.selfHosts ?? [];
  const budget = Math.min(Math.max(1_000, timeoutMs), MAX_TIMEOUT_MS);

  if (isSelfTarget(target.url, selfHosts)) {
    return probeSelf(target.url, budget, ctx);
  }

  return probePublic(target.url, budget, ctx);
}

/**
 * Own-host checks never go out through workers.dev. That hop is the 404.
 * Prefer a service binding (the real path), then in-process /api/health.
 */
async function probeSelf(
  url: string,
  budget: number,
  ctx: ProbeContext
): Promise<ProbeOutcome> {
  if (ctx.selfFetch) {
    return runTimed(budget, 'self', (signal) => ctx.selfFetch!(probeRequest(url, signal)));
  }

  if (ctx.healthFetch) {
    return runTimed(budget, 'health', () => ctx.healthFetch!());
  }

  return {
    ok: false,
    statusCode: null,
    latencyMs: 0,
    error: SELF_UNAVAILABLE,
    via: 'self',
    errorKind: 'cf_worker_fetch',
  };
}

async function probePublic(
  url: string,
  budget: number,
  ctx: ProbeContext
): Promise<ProbeOutcome> {
  const fetchImpl = ctx.fetch ?? ((request: Request) => fetch(request));
  const outcome = await runTimed(budget, 'public', (signal) => fetchImpl(probeRequest(url, signal)));
  if (outcome.ok || outcome.statusCode == null) return outcome;

  const body = outcome._body ?? '';
  const message = describeCloudflareFetchFailure({
    statusCode: outcome.statusCode,
    body,
    targetHost: hostnameOf(url) ?? '',
    selfHosts: ctx.selfHosts ?? [],
  });

  if (!message) {
    const { _body: _, ...rest } = outcome;
    return rest;
  }

  const { _body: _, ...rest } = outcome;
  return { ...rest, error: message, errorKind: 'cf_worker_fetch' };
}

type TimedOutcome = ProbeOutcome & { _body?: string };

async function runTimed(
  budget: number,
  via: ProbeVia,
  send: (signal: AbortSignal) => Promise<Response>
): Promise<TimedOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const startedAt = Date.now();

  try {
    const response = await send(controller.signal);
    const latencyMs = Date.now() - startedAt;
    const ok = isHealthyStatus(response.status);
    const error: string | null = ok ? null : `HTTP ${response.status}`;
    const errorKind: ProbeErrorKind | null = null;
    let body: string | undefined;

    // Only peek at failures: a 200 body can be a whole page, and we do not
    // need it. A 404 from workers.dev may be Cloudflare's short-circuit page.
    if (!ok) {
      body = await peekBody(response);
    }

    return {
      ok,
      statusCode: response.status,
      latencyMs,
      error,
      via,
      errorKind,
      ...(body !== undefined ? { _body: body } : {}),
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
      via,
      errorKind: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function probeRequest(url: string, signal: AbortSignal): Request {
  return new Request(url, {
    method: 'GET',
    redirect: 'manual', // A redirect could point at a private address.
    signal,
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    cache: 'no-store',
  });
}

async function peekBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 800);
  } catch {
    return '';
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
