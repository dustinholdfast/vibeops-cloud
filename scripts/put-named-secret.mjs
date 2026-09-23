/**
 * Put one .env.local value onto the vibeops-cloud Worker as a secret.
 * Prints only the name, prefix kind, and length — never the value.
 *
 *   node scripts/put-named-secret.mjs NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const name = process.argv[2];
if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
  console.error('usage: node scripts/put-named-secret.mjs NAME');
  process.exit(1);
}

const text = readFileSync('.env.local', 'utf8');
const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
if (!match) {
  console.error(`${name} is not in .env.local`);
  process.exit(1);
}

const value = match[1].replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '');
if (!value) {
  console.error(`${name} is empty`);
  process.exit(1);
}

const kind = value.startsWith('pk_live_')
  ? 'pk_live'
  : value.startsWith('pk_test_')
    ? 'pk_test'
    : value.startsWith('sk_live_')
      ? 'sk_live'
      : value.startsWith('sk_test_')
        ? 'sk_test'
        : 'set';
console.log(`Putting ${name} (${kind}, len=${value.length})`);

const child = spawn('npx', ['wrangler', 'secret', 'put', name], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});
child.stdin.write(value);
child.stdin.end();
child.on('exit', (code) => process.exit(code ?? 1));
