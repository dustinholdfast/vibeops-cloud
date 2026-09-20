/**
 * Confirms the workers.dev staging posture: development Clerk keys and a
 * platform hostname. Production keys on this host would orphan workspace ids.
 */

const errors = [];
const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const secret = process.env.CLERK_SECRET_KEY ?? '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

if (!publishable.startsWith('pk_test_')) {
  errors.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a pk_test_ key on staging.');
}
if (!secret.startsWith('sk_test_')) {
  errors.push('CLERK_SECRET_KEY must be an sk_test_ key on staging.');
}

if (!appUrl) {
  errors.push('NEXT_PUBLIC_APP_URL is missing.');
} else {
  try {
    const url = new URL(appUrl);
    if (!url.hostname.endsWith('.workers.dev') && url.hostname !== 'localhost') {
      errors.push(
        'Staging check expects a workers.dev or localhost APP_URL. Use check:production-auth for a custom domain.'
      );
    }
  } catch {
    errors.push('NEXT_PUBLIC_APP_URL must be a valid absolute URL.');
  }
}

if (errors.length) {
  console.error('Clerk staging preflight failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Clerk staging preflight passed (workers.dev + pk_test_).');
