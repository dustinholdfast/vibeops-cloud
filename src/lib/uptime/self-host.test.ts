import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CF_WORKER_FETCH_ERROR,
  collectSelfHosts,
  describeCloudflareFetchFailure,
  hostnameOf,
  isSameAccountWorkersDev,
  isSelfTarget,
  isWorkersDevHost,
  workersDevAccount,
} from './self-host';

const SELF = 'vibeops-cloud.dustin-eef.workers.dev';

describe('self-host', () => {
  it('collects hostnames from request and app origins', () => {
    assert.deepEqual(
      collectSelfHosts(
        'https://vibeops-cloud.dustin-eef.workers.dev/api/projects/1/monitor/check',
        'https://vibeops-cloud.dustin-eef.workers.dev/'
      ),
      [SELF]
    );
    assert.deepEqual(collectSelfHosts(undefined, '', 'not a url'), []);
  });

  it('treats this Worker’s own URL as self, regardless of path or case', () => {
    assert.equal(isSelfTarget(`https://${SELF}/`, [SELF]), true);
    assert.equal(isSelfTarget(`https://${SELF.toUpperCase()}/api/health`, [SELF]), true);
    assert.equal(isSelfTarget('https://example.com/', [SELF]), false);
    assert.equal(isSelfTarget('https://other.dustin-eef.workers.dev/', [SELF]), false);
  });

  it('recognises the workers.dev account suffix', () => {
    assert.equal(workersDevAccount(SELF), 'dustin-eef.workers.dev');
    assert.equal(isWorkersDevHost(SELF), true);
    assert.equal(isSameAccountWorkersDev('other.dustin-eef.workers.dev', [SELF]), true);
    assert.equal(isSameAccountWorkersDev('other.someone-else.workers.dev', [SELF]), false);
    assert.equal(isSameAccountWorkersDev('example.com', [SELF]), false);
  });

  it('maps Cloudflare 1042 / 1019 bodies to the loop error', () => {
    const result = describeCloudflareFetchFailure({
      statusCode: 404,
      body: '<html>error code: 1042 Worker tried to fetch from another Worker</html>',
      targetHost: 'other.dustin-eef.workers.dev',
      selfHosts: [SELF],
    });
    assert.equal(result, CF_WORKER_FETCH_ERROR);
  });

  it('maps a 404 on this Worker’s own host as a loop, not a down site', () => {
    const result = describeCloudflareFetchFailure({
      statusCode: 404,
      body: 'Not Found',
      targetHost: SELF,
      selfHosts: [SELF],
    });
    assert.equal(result, CF_WORKER_FETCH_ERROR);
  });

  it('leaves a real 404 on someone else’s host alone', () => {
    const result = describeCloudflareFetchFailure({
      statusCode: 404,
      body: 'Next.js 404 page',
      targetHost: 'example.com',
      selfHosts: [SELF],
    });
    assert.equal(result, null);
  });

  it('parses hostnames and rejects junk', () => {
    assert.equal(hostnameOf('https://Example.COM/path'), 'example.com');
    assert.equal(hostnameOf('nope'), null);
  });
});
