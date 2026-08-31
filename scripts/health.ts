/**
 * "Is the state sane" -- one command, read-only, machine-readable verdict.
 *
 * Distinct from the test suite. Tests check the code; this checks the world:
 * is the deployed thing up, is it the commit this repository is on, are its
 * upstreams configured. Exits non-zero so a loop can read the verdict without
 * reading a log.
 *
 *   npm run prod:read                       uses $MATCHER_URL
 *   npm run prod:read -- --url=http://box:3000
 *   npm run prod:read -- --no-parity        skip the version comparison
 *
 * Reads. Never writes, never deploys, never restarts anything.
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='))?.slice(6);
const skipParity = args.includes('--no-parity');
const base = (urlArg ?? process.env.MATCHER_URL ?? '').replace(/\/+$/, '');

if (!base) {
  console.error('FAIL  no target. Set MATCHER_URL or pass --url=http://host:3000');
  process.exit(2);
}

type Health = {
  ok?: boolean;
  version?: string;
  uptimeSec?: number;
  rooms?: number;
  upstreams?: Record<string, boolean>;
  reachable?: Record<string, { ok: boolean | null; checkedAt: string | null; detail: string | null }>;
  ratings?: {
    quota: { limit: number | null; remaining: number | null; checkedAt: string | null };
    lastBuild: { cached: number; requests: number; skipped: number };
  };
  auth?: Record<string, boolean | string>;
};

const problems: string[] = [];
const notes: string[] = [];

function localHead(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  let health: Health;
  const started = Date.now();
  try {
    const res = await fetch(`${base}/healthz`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`FAIL  ${base}/healthz returned ${res.status}`);
      process.exit(1);
    }
    health = (await res.json()) as Health;
  } catch (err) {
    console.error(`FAIL  ${base}/healthz unreachable: ${(err as Error).message}`);
    process.exit(1);
  }
  const ms = Date.now() - started;

  if (health.ok !== true) problems.push('healthz did not report ok');

  const up = health.upstreams ?? {};
  if (up.jellyfin === false) problems.push('Jellyfin is not configured; the app cannot build a deck');
  if (up.mdblist === false) notes.push('MDBList unset: every card will be unrated');
  if (up.jellyseerr === false) notes.push('Jellyseerr unset: Any Movie mode and requests are dead');

  // Configured is two strings being non-empty. Reachable is the service
  // actually answering, and only the second one tells you anything at 11pm.
  const reach = health.reachable ?? {};
  if (reach.jellyfin?.ok === false) {
    problems.push(`Jellyfin is configured but not answering: ${reach.jellyfin.detail ?? 'unknown'}`);
  }
  if (reach.jellyseerr?.ok === false) {
    notes.push(`Jellyseerr not answering: ${reach.jellyseerr.detail ?? 'unknown'}`);
  }

  const q = health.ratings?.quota;
  if (q && q.remaining !== null && q.limit !== null) {
    const left = q.remaining / Math.max(1, q.limit);
    if (q.remaining === 0) problems.push('MDBList quota is exhausted: the deck will be unrated');
    else if (left < 0.1) notes.push(`MDBList quota nearly gone: ${q.remaining} of ${q.limit} left`);
  }
  const lb = health.ratings?.lastBuild;
  if (lb && lb.skipped > 0) {
    notes.push(`last deck build left ${lb.skipped} titles unrated at the request budget`);
  }

  const deployed = health.version ?? 'unknown';
  if (!skipParity) {
    const head = localHead();
    if (!head) notes.push('no git HEAD locally, parity not checked');
    else if (deployed === 'dev' || deployed === 'unknown') {
      notes.push(`deployed version is "${deployed}"; parity cannot be checked`);
    } else if (!head.startsWith(deployed) && !deployed.startsWith(head.slice(0, 7))) {
      problems.push(`parity: deployed ${deployed}, repository is on ${head.slice(0, 7)}`);
    }
  }

  console.log(`target    ${base}`);
  console.log(`version   ${deployed}`);
  console.log(`uptime    ${health.uptimeSec ?? '?'}s`);
  console.log(`rooms     ${health.rooms ?? '?'} live`);
  console.log(`upstreams ${Object.entries(up).map(([k, v]) => `${k}=${v ? 'yes' : 'NO'}`).join(' ') || '?'}`);
  console.log(
    `answering ${
      Object.entries(reach)
        .map(([k, v]) => `${k}=${v.ok === null ? 'n/a' : v.ok ? 'yes' : 'NO'}`)
        .join(' ') || '?'
    }`,
  );
  if (q) console.log(`ratings   quota ${q.remaining ?? '?'}/${q.limit ?? '?'} left`);
  if (lb) console.log(`last deck ${lb.requests} requests, ${lb.cached} cached, ${lb.skipped} skipped`);
  console.log(`latency   ${ms}ms`);
  for (const note of notes) console.log(`note      ${note}`);

  if (problems.length) {
    for (const p of problems) console.error(`FAIL      ${p}`);
    process.exit(1);
  }
  console.log('SANE');
}

void main();
