/**
 * Detecting when an uptime probe would fetch this Worker (or another
 * same-account workers.dev host) through the public Internet.
 *
 * Cloudflare short-circuits Worker `fetch()` to the same workers.dev hostname
 * — and sometimes to other `*.<account>.workers.dev` hosts — and returns a
 * silent HTTP 404 (or error 1042 / 1019). External curl of the same URL is
 * 200. The probe must not treat that 404 as "the site is down".
 */

export const CF_WORKER_FETCH_ERROR =
  'Cloudflare blocked this Worker from fetching that workers.dev URL (same-zone loop). The site may still be up — an external request can return 200.';

const CF_WORKER_FETCH_BODY =
  /error code:\s*10(19|42)\b|tried to fetch from another Worker|Worker hit loop limit/i;

/** Hostnames this process is serving. Empty strings and unparseable URLs are dropped. */
export function hostnameOf(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const host = new URL(raw).hostname.replace(/\.$/, '').toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function collectSelfHosts(...origins: Array<string | undefined | null>): string[] {
  const hosts = new Set<string>();
  for (const origin of origins) {
    const host = hostnameOf(origin);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

export function isWorkersDevHost(host: string): boolean {
  return host.toLowerCase().endsWith('.workers.dev');
}

/**
 * `name.account.workers.dev` → `account.workers.dev`. Anything else is null.
 * workers.dev staging hostnames are always two labels under workers.dev.
 */
export function workersDevAccount(host: string): string | null {
  const normalised = host.replace(/\.$/, '').toLowerCase();
  if (!normalised.endsWith('.workers.dev')) return null;
  const labels = normalised.split('.');
  if (labels.length < 3) return null;
  return labels.slice(-3).join('.');
}

export function isSelfHost(host: string, selfHosts: Iterable<string>): boolean {
  const needle = host.replace(/\.$/, '').toLowerCase();
  for (const candidate of selfHosts) {
    if (candidate.replace(/\.$/, '').toLowerCase() === needle) return true;
  }
  return false;
}

export function isSelfTarget(targetUrl: string, selfHosts: Iterable<string>): boolean {
  const host = hostnameOf(targetUrl);
  return host ? isSelfHost(host, selfHosts) : false;
}

/** Same Cloudflare workers.dev subdomain, including this Worker itself. */
export function isSameAccountWorkersDev(host: string, selfHosts: Iterable<string>): boolean {
  const account = workersDevAccount(host);
  if (!account) return false;
  for (const candidate of selfHosts) {
    if (workersDevAccount(candidate) === account) return true;
  }
  return false;
}

/**
 * Whether a failed public fetch looks like Cloudflare's Worker-to-Worker
 * short-circuit rather than the origin actually answering 404.
 */
export function describeCloudflareFetchFailure(input: {
  statusCode: number;
  body: string;
  targetHost: string;
  selfHosts: Iterable<string>;
}): string | null {
  if (CF_WORKER_FETCH_BODY.test(input.body)) return CF_WORKER_FETCH_ERROR;

  // Self-fetch 404s are the known short-circuit. A real missing path on this
  // Worker is checked internally and never goes through this public hop.
  if (input.statusCode === 404 && isSelfHost(input.targetHost, input.selfHosts)) {
    return CF_WORKER_FETCH_ERROR;
  }

  return null;
}
