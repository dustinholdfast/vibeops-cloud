/**
 * Sequential deep-health probe. After a Worker deploy this is the proof that
 * `?deep=1` stays responsive: every hit must be HTTP 200 JSON, never
 * Cloudflare 1101.
 *
 *   node scripts/probe-deep-health.mjs
 *   node scripts/probe-deep-health.mjs https://vibeops-cloud.dustin-eef.workers.dev 12
 */
const origin = (process.argv[2] ?? 'https://vibeops-cloud.dustin-eef.workers.dev').replace(/\/+$/, '');
const rounds = Number(process.argv[3] ?? 12);
const fetchBudgetMs = 8_000;

if (!Number.isFinite(rounds) || rounds < 1) {
  console.error('rounds must be a positive number');
  process.exit(2);
}

async function probe(path) {
  const started = Date.now();
  try {
    const response = await fetch(`${origin}${path}`, {
      signal: AbortSignal.timeout(fetchBudgetMs),
    });
    const text = await response.text();
    return {
      ok: response.ok && !text.includes('error code: 1101'),
      status: response.status,
      ms: Date.now() - started,
      body: text.slice(0, 240),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

const shallow = await probe('/api/health');
console.log(`GET /api/health  ${shallow.status}  ${shallow.ms}ms  ${shallow.body}`);
if (!shallow.ok) {
  console.error('plain health failed; refusing to interpret deep probes');
  process.exit(1);
}

let failed = 0;
for (let i = 1; i <= rounds; i += 1) {
  const result = await probe('/api/health?deep=1');
  const mark = result.ok ? 'ok' : 'FAIL';
  if (!result.ok) failed += 1;
  console.log(
    `GET /api/health?deep=1  [${String(i).padStart(2)}/${rounds}]  ${mark}  ${result.status}  ${result.ms}ms  ${result.body}`
  );
}

if (failed > 0) {
  console.error(`\n${failed}/${rounds} deep probes failed (want 0).`);
  process.exit(1);
}

console.log(`\n${rounds}/${rounds} deep probes returned HTTP 200.`);
