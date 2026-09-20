import { getCloudflareContext } from '@opennextjs/cloudflare';
import { env } from '../env';
import type { ProbeContext, ProbeFetch } from './probe';
import { collectSelfHosts } from './self-host';

/**
 * Bindings and hostnames the probe needs so it can check this Worker without
 * going out through workers.dev (that hop is the silent 404).
 */
export function probeContextFor(req: Request): ProbeContext {
  return {
    selfHosts: collectSelfHosts(req.url, env('NEXT_PUBLIC_APP_URL')),
    selfFetch: cloudflareSelfFetch(),
    healthFetch: inProcessHealth,
  };
}

function cloudflareSelfFetch(): ProbeFetch | undefined {
  try {
    const self = (getCloudflareContext().env as { SELF?: Fetcher }).SELF;
    if (self) return (request) => self.fetch(request);
  } catch {
    // Node, tests, or the build — no Worker bindings.
  }
  return undefined;
}

/** Cheap liveness, same handler `/api/health` serves to the public Internet. */
async function inProcessHealth(): Promise<Response> {
  const { GET } = await import('@/app/api/health/route');
  return GET(new Request('https://vibeops.internal/api/health'));
}
