import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration, renderAlert, type AlertInput } from './render-alert';

const base: AlertInput = {
  kind: 'down',
  projectName: 'Riftdweller',
  url: 'https://riftdweller.example/',
  error: 'HTTP 503',
  appUrl: 'https://app.example',
  unsubscribeUrl: 'https://app.example/api/email/unsubscribe?token=abc&kind=uptime',
};

describe('formatDuration', () => {
  it('picks one useful unit', () => {
    assert.equal(formatDuration(20_000), 'less than a minute');
    assert.equal(formatDuration(60_000), '1 minute');
    assert.equal(formatDuration(4 * 60_000), '4 minutes');
    assert.equal(formatDuration(60 * 60_000), '1 hour');
    assert.equal(formatDuration(5 * 60 * 60_000), '5 hours');
    assert.equal(formatDuration(3 * 24 * 60 * 60_000), '3 days');
  });
});

describe('renderAlert', () => {
  it('says what happened in the subject', () => {
    assert.equal(renderAlert(base).subject, 'Riftdweller is down');
    assert.equal(renderAlert({ ...base, kind: 'up' }).subject, 'Riftdweller is back up');
  });

  it('includes the URL and the error in both bodies', () => {
    const email = renderAlert(base);
    assert.match(email.text, /riftdweller\.example/);
    assert.match(email.text, /HTTP 503/);
    assert.match(email.html, /riftdweller\.example/);
    assert.match(email.html, /HTTP 503/);
  });

  it('reports how long a recovered monitor was down', () => {
    const email = renderAlert({
      ...base,
      kind: 'up',
      error: null,
      downForMs: 25 * 60_000,
    });
    assert.match(email.text, /down for 25 minutes/i);
    assert.match(email.html, /25 minutes/);
  });

  it('omits the duration when it is not known', () => {
    const email = renderAlert({ ...base, kind: 'up', error: null });
    assert.doesNotMatch(email.text, /down for/i);
  });

  it('always offers a way out', () => {
    const email = renderAlert(base);
    assert.match(email.text, /unsubscribe\?token=abc/);
    assert.match(email.html, /unsubscribe\?token=abc/);
  });

  it('escapes a project name that contains markup', () => {
    const email = renderAlert({ ...base, projectName: '<script>alert(1)</script>' });
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
  });
});
