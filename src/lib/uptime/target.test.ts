import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateTarget } from './target';

function reasonFor(input: unknown): string {
  const result = validateTarget(input);
  assert.equal(result.ok, false, `expected ${String(input)} to be rejected`);
  return result.ok ? '' : result.reason;
}

describe('validateTarget', () => {
  it('accepts ordinary public URLs and normalises them', () => {
    const result = validateTarget('  https://example.com/health  ');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.url, 'https://example.com/health');
  });

  it('accepts a public IP literal', () => {
    assert.equal(validateTarget('http://93.184.216.34/').ok, true);
  });

  it('rejects empty and malformed input', () => {
    reasonFor('');
    reasonFor('   ');
    reasonFor(null);
    reasonFor(42);
    reasonFor('not a url');
  });

  it('rejects non-HTTP schemes', () => {
    for (const url of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)']) {
      assert.match(reasonFor(url), /http/);
    }
  });

  it('rejects embedded credentials', () => {
    assert.match(reasonFor('https://user:pass@example.com'), /username and password/);
  });

  it('blocks loopback and local hostnames', () => {
    for (const url of [
      'http://localhost:3001/',
      'http://LOCALHOST/',
      'http://db.internal/',
      'http://printer.local/',
      'http://svc.home.arpa/',
    ]) {
      assert.match(reasonFor(url), /Private and local/);
    }
  });

  it('blocks private and reserved IPv4 ranges', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://0.0.0.0/',
      'http://100.64.0.1/',
      'http://198.18.0.1/',
      'http://239.255.255.250/',
    ]) {
      assert.match(reasonFor(url), /Private and local/, url);
    }
  });

  it('blocks the cloud metadata address', () => {
    assert.match(reasonFor('http://169.254.169.254/latest/meta-data/'), /Private and local/);
  });

  it('does not over-block neighbours of private ranges', () => {
    for (const url of [
      'http://172.15.0.1/',
      'http://172.32.0.1/',
      'http://192.167.1.1/',
      'http://11.0.0.1/',
      'http://100.63.0.1/',
    ]) {
      assert.equal(validateTarget(url).ok, true, url);
    }
  });

  it('blocks private IPv6 literals, including v4-mapped ones', () => {
    for (const url of [
      'http://[::1]/',
      'http://[::]/',
      'http://[fc00::1]/',
      'http://[fd12:3456::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:10.0.0.1]/',
    ]) {
      assert.match(reasonFor(url), /Private and local/, url);
    }
  });

  it('allows a public IPv6 literal', () => {
    assert.equal(validateTarget('http://[2606:2800:220:1::1]/').ok, true);
  });

  it('rejects absurdly long URLs', () => {
    assert.match(reasonFor(`https://example.com/${'a'.repeat(3000)}`), /too long/);
  });
});
