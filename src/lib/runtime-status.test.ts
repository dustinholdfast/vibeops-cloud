import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeStatus } from './runtime-status';

test('workers.dev with test keys is staging phase 5 when Stripe and cron exist', () => {
  process.env.DATABASE_URL = 'postgres://n';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
  process.env.CLERK_SECRET_KEY = 'sk_test_abc';
  process.env.STRIPE_SECRET_KEY = 'sk_test_stripe';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_stripe';
  process.env.CRON_SECRET = 'cron';
  process.env.NEXT_PUBLIC_APP_URL = 'https://vibeops-cloud.dustin-eef.workers.dev';

  const status = runtimeStatus({ hasHyperdrive: true });
  assert.equal(status.phase, 5);
  assert.equal(status.environment, 'staging');
  assert.equal(status.productionReady, false);
  assert.equal(status.hasStripe, true);
  assert.ok(status.productionBlockers.some((line) => /custom domain/i.test(line)));
});

test('noxencloud.com with test keys is staging pending live Clerk keys', () => {
  process.env.DATABASE_URL = 'postgres://n';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
  process.env.CLERK_SECRET_KEY = 'sk_test_abc';
  process.env.STRIPE_SECRET_KEY = 'sk_test_stripe';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_stripe';
  process.env.CRON_SECRET = 'cron';
  process.env.NEXT_PUBLIC_APP_URL = 'https://noxencloud.com';

  const status = runtimeStatus({ hasHyperdrive: true });
  assert.equal(status.environment, 'staging');
  assert.equal(status.productionReady, false);
  assert.deepEqual(status.productionBlockers, [
    'Clerk production keys (pk_live_ / sk_live_)',
  ]);
});

test('pk_live_ on a custom domain is production-ready', () => {
  process.env.DATABASE_URL = 'postgres://n';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_abc';
  process.env.CLERK_SECRET_KEY = 'sk_live_abc';
  process.env.STRIPE_SECRET_KEY = 'sk_live_stripe';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_stripe';
  process.env.CRON_SECRET = 'cron';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.noxen.example';

  const status = runtimeStatus({ hasHyperdrive: true });
  assert.equal(status.environment, 'production');
  assert.equal(status.productionReady, true);
  assert.deepEqual(status.productionBlockers, []);
});
