/**
 * What a monitor is allowed to ping.
 *
 * The URL is supplied by a user and the server is the thing that fetches it, so
 * an unchecked value turns the checker into a proxy for whatever private
 * network it runs in. Everything here is a pure string test, so the rules can
 * be read — and tested — without touching the network.
 *
 * This blocks addresses that are *written down* as private. It cannot stop a
 * public hostname that resolves to a private address; redirects are not
 * followed for the same reason (see `probe.ts`).
 */

export type TargetCheck = { ok: true; url: string } | { ok: false; reason: string };

const MAX_URL_LENGTH = 2048;

/** Names that never leave the machine. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

/** Suffixes reserved for local networks and container service discovery. */
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.intranet', '.home.arpa'];

const PRIVATE_ADDRESS = 'Private and local addresses cannot be monitored.';

/** Returns the four octets of a dotted-quad, or null if it is not one. */
function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function isBlockedIpv4([a, b, c]: number[]): boolean {
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

/**
 * The v4 address inside a v4-mapped v6 literal, or null.
 *
 * Both spellings matter: a user may type `::ffff:127.0.0.1`, but the URL parser
 * rewrites that to `::ffff:7f00:1` before this ever sees it.
 */
function mappedIpv4(address: string): number[] | null {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return parseIpv4(dotted[1]);

  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff];
  }

  return null;
}

function isBlockedIpv6(host: string): boolean {
  const address = host.toLowerCase();

  if (address.startsWith('::ffff:')) {
    const octets = mappedIpv4(address);
    // An unrecognised mapped form is blocked rather than guessed at.
    return !octets || isBlockedIpv4(octets);
  }

  if (address === '::' || address === '::1') return true;
  if (/^f[cd]/.test(address)) return true; // unique local, fc00::/7
  if (/^fe[89ab]/.test(address)) return true; // link-local, fe80::/10
  return false;
}

/**
 * Validates and normalises a monitor target. The returned URL is what gets
 * stored and fetched, so callers never keep the raw input.
 */
export function validateTarget(raw: unknown): TargetCheck {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'Enter a URL to monitor.' };
  }

  const trimmed = raw.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'That URL is too long to monitor.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http:// and https:// URLs can be monitored.' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Remove the username and password from the URL.' };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return { ok: false, reason: 'That URL has no host.' };

  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: PRIVATE_ADDRESS };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: PRIVATE_ADDRESS };
  }

  const ipv4 = parseIpv4(host);
  if (ipv4 && isBlockedIpv4(ipv4)) return { ok: false, reason: PRIVATE_ADDRESS };
  if (host.includes(':') && isBlockedIpv6(host)) return { ok: false, reason: PRIVATE_ADDRESS };

  return { ok: true, url: url.toString() };
}
