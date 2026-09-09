import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubRepo, snapshotPath } from './github-repo';

describe('parseGitHubRepo', () => {
  it('reads owner/repo from a normal GitHub URL', () => {
    assert.deepEqual(parseGitHubRepo('https://github.com/dustinholdfast/vibeops-cloud'), {
      owner: 'dustinholdfast',
      repo: 'vibeops-cloud',
    });
  });

  it('strips .git and rejects non-GitHub hosts', () => {
    assert.deepEqual(parseGitHubRepo('https://github.com/acme/app.git'), { owner: 'acme', repo: 'app' });
    assert.equal(parseGitHubRepo('https://gitlab.com/acme/app'), null);
  });
});

describe('snapshotPath', () => {
  it('namespaces the file under .vibeops', () => {
    assert.equal(snapshotPath('proj_123'), '.vibeops/proj_123.md');
  });
});
