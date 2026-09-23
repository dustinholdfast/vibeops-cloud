import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL, PRIVACY_SECTIONS, TERMS_SECTIONS } from './legal';

describe('legal copy', () => {
  it('names the live product and a real contact', () => {
    assert.equal(LEGAL.product, 'Noxen Cloud');
    assert.match(LEGAL.contactEmail, /@holdfastcyber\.us$/);
    assert.equal(/vibeops/i.test(JSON.stringify({ LEGAL, PRIVACY_SECTIONS, TERMS_SECTIONS })), false);
  });

  it('says who processes account, billing, and hosting data', () => {
    const privacy = PRIVACY_SECTIONS.map((section) => section.body).join('\n');
    assert.match(privacy, /Clerk/);
    assert.match(privacy, /Stripe/);
    assert.match(privacy, /Cloudflare/);
    assert.match(privacy, /do not sell/i);
  });

  it('states the free cap and that Pro is cancelable', () => {
    const terms = TERMS_SECTIONS.map((section) => section.body).join('\n');
    assert.match(terms, /five projects/i);
    assert.match(terms, /billing portal/i);
  });
});
