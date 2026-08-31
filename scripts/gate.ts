/**
 * The gate. One command, numbered checks, counts printed, non-zero on failure.
 *
 *   npm run gate            everything except the deployed app
 *   npm run gate -- --fast  skip the production build (typecheck + tests only)
 *   npm run gate -- --prod  also check the deployed app (needs $MATCHER_URL)
 *
 * Counts matter as much as pass/fail. Green with fewer tests than yesterday is
 * how a deletion ships: the floors live in gates.json and a drop fails the
 * gate. Raise them in the same commit that legitimately adds tests or pins.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const floors = JSON.parse(readFileSync(join(ROOT, 'gates.json'), 'utf8')) as {
  testFiles: number;
  testCases: number;
  pinnedClaims: number;
};

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const wantProd = args.includes('--prod');

const ANSI = new RegExp(String.fromCharCode(27) + '\[[0-9;]*m', 'g');

type Result = { id: string; name: string; ok: boolean; detail: string; skipped?: boolean };
const results: Result[] = [];

function run(cmd: string, cmdArgs: string[]) {
  const out = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  // Strip ANSI: vitest colours its summary even with NO_COLOR, and the counts
  // are the whole point of this gate.
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`.replace(ANSI, '');
  return { code: out.status ?? 1, text };
}

function record(id: string, name: string, ok: boolean, detail: string) {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? 'pass' : 'FAIL'}  ${id} ${name} -- ${detail}`);
}

function skip(id: string, name: string, why: string) {
  results.push({ id, name, ok: true, detail: why, skipped: true });
  console.log(`skip  ${id} ${name} -- ${why}`);
}

// G1 -- types.
{
  const { code, text } = run('npx', ['tsc', '--noEmit']);
  const errors = (text.match(/error TS/g) ?? []).length;
  record('G1', 'typecheck', code === 0, code === 0 ? 'clean' : `${errors} errors`);
  if (code !== 0) console.log(text.split('\n').slice(0, 20).join('\n'));
}

// G2 and G3 -- one suite run gives both the counts and the pin inventory.
{
  const { code, text } = run('npx', ['vitest', 'run']);
  const cases = Number(/Tests\s+(\d+) passed/.exec(text)?.[1] ?? 0);
  const files = Number(/Test Files\s+(\d+) passed/.exec(text)?.[1] ?? 0);
  const failed = /(\d+) failed/.exec(text)?.[1];

  const countsOk = code === 0 && cases >= floors.testCases && files >= floors.testFiles;
  const drift =
    cases < floors.testCases || files < floors.testFiles
      ? ` BELOW FLOOR (${floors.testCases} cases / ${floors.testFiles} files)`
      : cases > floors.testCases || files > floors.testFiles
        ? ' above floor -- raise gates.json'
        : '';
  record('G2', 'test suite', countsOk, `${cases} cases in ${files} files${failed ? `, ${failed} failed` : ''}${drift}`);
  if (code !== 0) {
    console.log(
      text
        .split('\n')
        .filter((l) => /FAIL|AssertionError|✕|×|lost:/.test(l))
        .slice(0, 25)
        .join('\n'),
    );
  }

  const pins = Number(/pins: (\d+) claims/.exec(text)?.[1] ?? 0);
  const pinsOk = pins >= floors.pinnedClaims;
  record(
    'G3',
    'pinned claims',
    pinsOk,
    `${pins} pinned${pins < floors.pinnedClaims ? ` BELOW FLOOR (${floors.pinnedClaims}) -- a pin was removed, not just failed` : ''}`,
  );
}

// G4 -- the numbers stated in prose match the ones the gate enforces. This
// project's whole argument is that a gate stops false claims from shipping,
// and the README was stating a test count three waves out of date.
{
  const { code, text } = run('npx', ['tsx', 'scripts/sync-counts.ts', '--check']);
  record('G4', 'documented counts', code === 0, code === 0 ? 'match gates.json' : 'stale prose');
  if (code !== 0) console.log(text.trim());
}

// G5 -- the app actually builds. Slow; --fast skips it.
if (fast) skip('G5', 'production build', '--fast');
else {
  const { code, text } = run('npx', ['next', 'build']);
  record('G5', 'production build', code === 0, code === 0 ? 'built' : 'build failed');
  if (code !== 0) console.log(text.split('\n').slice(-25).join('\n'));
}

// G5 -- the deployed app. Opt in, because a red gate you cannot fix locally
// teaches people to ignore the gate.
if (!wantProd) skip('G6', 'production health', 'not requested (--prod)');
else if (!process.env.MATCHER_URL) skip('G6', 'production health', 'MATCHER_URL unset');
else {
  const { code, text } = run('npx', ['tsx', 'scripts/health.ts']);
  record('G6', 'production health', code === 0, text.trim().split('\n').pop() ?? '');
  if (code !== 0) console.log(text);
}

const failures = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failures.length}/${results.length} gates pass` +
    (failures.length ? `: ${failures.map((f) => f.id).join(', ')} failed` : ''),
);
if (failures.length) {
  console.log(
    'A failing gate is one of two things and they look identical from here:\n' +
      '  1. the work broke something -- fix the work.\n' +
      '  2. the work changed something deliberately and the check is stale -- fix\n' +
      '     the check, but only after confirming the property survives somewhere\n' +
      '     real, and say in the pin why it is intact.',
  );
}
process.exit(failures.length ? 1 : 0);
