/**
 * Fails a production release before it can accidentally ship with Clerk's
 * development instance or an unsupported hosting domain.
 */

const errors = [];

function requirePrefix(name, prefix) {
  const value = process.env[name];
  if (!value) {
    errors.push(`${name} is missing.`);
  } else if (!value.startsWith(prefix)) {
    errors.push(`${name} must use a ${prefix}… production key.`);
  }
}

requirePrefix('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_live_');
requirePrefix('CLERK_SECRET_KEY', 'sk_live_');

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!appUrl) {
  errors.push('NEXT_PUBLIC_APP_URL is missing.');
} else {
  try {
    const url = new URL(appUrl);
    if (url.protocol !== 'https:') errors.push('NEXT_PUBLIC_APP_URL must use HTTPS.');
    if (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.vercel.app') ||
      // Clerk production refuses a platform-owned domain, and moving hosts
      // does not change that: workers.dev is no more usable than vercel.app.
      url.hostname.endsWith('.workers.dev')
    ) {
      errors.push(
        'NEXT_PUBLIC_APP_URL must use the custom production domain configured in Clerk.'
      );
    }
  } catch {
    errors.push('NEXT_PUBLIC_APP_URL must be a valid absolute URL.');
  }
}

if (errors.length) {
  console.error('Clerk production preflight failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Clerk production preflight passed.');

