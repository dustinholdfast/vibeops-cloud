import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { probe } from './probe';
import { CF_WORKER_FETCH_ERROR } from './self-host';

const SELF = 'https://vibeops-cloud.dustin-eef.workers.dev/';
const SELF_HOSTS = ['vibeops-cloud.dustin-eef.workers.dev'];

function jsonResponse(status: number, body = 'ok'): Response {
  return new Response(body, { status });
}

describe('probe', () => {
  it('uses the service binding for this Worker’s own host', async () => {
    let seen = '';
    const result = await probe(SELF, 2_000, {
      selfHosts: SELF_HOSTS,
      selfFetch: async (request) => {
        seen = request.url;
        return jsonResponse(200, 'homepage');
      },
      fetch: async () => {
        throw new Error('public fetch must not run for own host');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.via, 'self');
    assert.equal(result.errorKind ?? null, null);
    assert.equal(new URL(seen).pathname, '/');
  });

  it('falls back to in-process health when there is no binding', async () => {
    const result = await probe(`${SELF}api/health`, 2_000, {
      selfHosts: SELF_HOSTS,
      healthFetch: async () => jsonResponse(200, '{"ok":true}'),
      fetch: async () => {
        throw new Error('public fetch must not run for own host');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.via, 'health');
  });

  it('does not pretend the site is down when no internal check exists', async () => {
    const result = await probe(SELF, 2_000, {
      selfHosts: SELF_HOSTS,
      fetch: async () => jsonResponse(404, 'Not Found'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorKind, 'cf_worker_fetch');
    assert.match(result.error ?? '', /cannot fetch its own URL/);
  });

  it('still public-fetches other hosts', async () => {
    const result = await probe('https://example.com/health', 2_000, {
      selfHosts: SELF_HOSTS,
      fetch: async (request) => {
        assert.equal(new URL(request.url).hostname, 'example.com');
        return jsonResponse(200);
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.via, 'public');
  });

  it('labels a Cloudflare 1042 404 so the UI does not look like a down site', async () => {
    const result = await probe('https://other.dustin-eef.workers.dev/', 2_000, {
      selfHosts: SELF_HOSTS,
      fetch: async () => jsonResponse(404, 'error code: 1042'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 404);
    assert.equal(result.errorKind, 'cf_worker_fetch');
    assert.equal(result.error, CF_WORKER_FETCH_ERROR);
  });

  it('keeps a real 404 as HTTP 404', async () => {
    const result = await probe('https://example.com/missing', 2_000, {
      selfHosts: SELF_HOSTS,
      fetch: async () => jsonResponse(404, 'Next.js 404'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'HTTP 404');
    assert.equal(result.errorKind ?? null, null);
  });

  it('rejects private targets before fetching', async () => {
    const result = await probe('http://127.0.0.1/', 2_000, {
      fetch: async () => {
        throw new Error('must not fetch');
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /Private and local/);
  });
});
