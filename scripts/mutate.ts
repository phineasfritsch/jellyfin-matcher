/**
 * The mutation harness. Reintroduce a defect, run the tests that claim to catch
 * it, and record whether anybody was watching.
 *
 *   npx tsx scripts/mutate.ts              every mutation in mutations.json
 *   npx tsx scripts/mutate.ts --list       what is in the catalogue
 *   npx tsx scripts/mutate.ts --check      catalogue is applicable; runs no tests
 *   npx tsx scripts/mutate.ts --only <id>  one mutation, or a comma-separated set
 *   npx tsx scripts/mutate.ts --ruling R95 every mutation for one ruling
 *   npx tsx scripts/mutate.ts --json       machine-readable, for a gate
 *
 * WHY THIS EXISTS (U2, docs/UPSTREAM.md).
 *
 * R129: eight agents reintroduced the historical defect behind every claim the
 * render tests make, and 49 of 97 claims did not go red. The fixes were then
 * verified by hand, one mutation at a time, by the same kind of process that
 * had produced the hollow claims -- and U2 says in as many words that "a human
 * deciding when to re-run it is the same failure as a generator checking
 * itself" (R124). So the audit is data, not a memory: the catalogue is
 * `mutations.json` and this runs it.
 *
 * R129's own rule, which is the one this file mechanises: a count of passing
 * tests is not a measurement of anything until the tests have been made to
 * fail. Coverage says which lines ran. Only mutation says whether anybody was
 * watching.
 *
 * THE THREE THINGS THIS FILE IS CAREFUL ABOUT
 *
 * 1. `find` must match EXACTLY ONCE, and a miss is fatal rather than skipped.
 *    A mutation that did not apply is indistinguishable, from the outside, from
 *    a test that caught nothing: both are a green run and a confident report.
 *    That mistake has already been made here -- a `sed` pattern with a doubled
 *    backslash matched nothing, and the untouched run was written up as proof.
 *
 * 2. Every run has a BASELINE. A test file that is already red -- another agent
 *    mid-edit, a half-finished refactor -- reports every mutation against it as
 *    KILLED, which is a clean bill of health issued by a broken instrument. The
 *    baseline is checked first and a red one is reported as BASELINE-RED, never
 *    as a kill.
 *
 * 3. The file is restored from memory, always. Not from git: git does not know
 *    what the working tree held a second ago, and other agents work in this
 *    tree. try/finally, plus SIGINT/SIGTERM, plus a last-resort `exit` hook.
 *    Leaving a mutated file behind is the worst thing this script can do.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CATALOGUE = join(ROOT, 'mutations.json');

/** One reintroduced defect, and the tests that claim to catch it. */
type Mutation = {
  /** Stable, kebab-case, ruling-first: `R95-vote-points-dimmed-inline`. */
  id: string;
  /** The ruling this defect belongs to, so a finding is traceable to an argument. */
  ruling: string;
  /** The claim in English. This is what SURVIVED means is hollow. */
  claim: string;
  /** Repo-relative path of the file to mutate. Never a test file. */
  file: string;
  /** Literal text, matched exactly once. Not a regex: see the header. */
  find: string;
  /** What replaces it. This is the historical defect, not an invented one. */
  replace: string;
  /** The test files that must go red. Only these are run. */
  expect: string[];
  /** Optional: anything a reader needs that the claim does not carry. */
  note?: string;
};

type Verdict = 'KILLED' | 'SURVIVED' | 'ERROR' | 'BASELINE-RED';

type Outcome = {
  id: string;
  ruling: string;
  claim: string;
  file: string;
  expect: string[];
  verdict: Verdict;
  detail: string;
  ms: number;
};

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const KNOWN = new Set(['--list', '--check', '--json', '--only', '--ruling']);

/*
  An unknown flag is fatal rather than ignored. `--onyl R95` that quietly runs
  everything, or worse runs nothing and exits 0, is a false report of exactly
  the shape this harness exists to catch.
*/
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]!;
  if (!a.startsWith('--')) continue;
  const name = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
  if (!KNOWN.has(name)) {
    console.error(`unknown option ${a}\nknown: ${[...KNOWN].join(', ')}`);
    process.exit(2);
  }
}

function option(name: string): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === name) return argv[i + 1] ?? null;
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return null;
}

const wantList = argv.includes('--list');
const wantCheck = argv.includes('--check');
const wantJson = argv.includes('--json');
const onlyArg = option('--only');
const rulingArg = option('--ruling');

/** Human output. With --json, stdout carries the JSON and nothing else. */
function say(line = ''): void {
  if (wantJson) console.error(line);
  else console.log(line);
}

const rel = (p: string) => relative(ROOT, p).split('\\').join('/');

// ---------------------------------------------------------------- catalogue

function loadCatalogue(): Mutation[] {
  if (!existsSync(CATALOGUE)) {
    console.error(`no catalogue at ${rel(CATALOGUE)}`);
    process.exit(2);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  } catch (err) {
    console.error(`${rel(CATALOGUE)} is not valid JSON: ${(err as Error).message}`);
    process.exit(2);
  }
  const list = (parsed as { mutations?: unknown }).mutations;
  if (!Array.isArray(list)) {
    console.error(`${rel(CATALOGUE)} must be { "mutations": [ ... ] }`);
    process.exit(2);
  }

  const seen = new Set<string>();
  const problems: string[] = [];
  for (const [i, raw] of list.entries()) {
    const m = raw as Partial<Mutation>;
    const where = m.id ? `${m.id}` : `entry ${i}`;
    for (const key of ['id', 'ruling', 'claim', 'file', 'find'] as const) {
      if (typeof m[key] !== 'string' || m[key] === '') problems.push(`${where}: ${key} is missing`);
    }
    // `replace` may be empty: deleting the line IS the historical defect for a
    // row that was dropped or a guard that was removed (R129's commonest shape).
    if (typeof m.replace !== 'string') problems.push(`${where}: replace is missing`);
    if (!Array.isArray(m.expect) || m.expect.length === 0) {
      problems.push(`${where}: expect must list at least one test file`);
    }
    if (m.find === m.replace) problems.push(`${where}: find and replace are identical`);
    if (m.id && seen.has(m.id)) problems.push(`${where}: duplicate id`);
    if (m.id) seen.add(m.id);
    /*
      Mutating a test proves nothing about the product: the test would fail
      because it was edited, not because a defect went unseen.
    */
    if (m.file?.includes('__tests__')) problems.push(`${where}: file is a test file`);
  }
  if (problems.length) {
    console.error(`${rel(CATALOGUE)} is not usable:\n  ${problems.join('\n  ')}`);
    process.exit(2);
  }
  return list as Mutation[];
}

const catalogue = loadCatalogue();

function select(): Mutation[] {
  let chosen = catalogue;
  if (rulingArg) {
    chosen = chosen.filter((m) => m.ruling.toLowerCase() === rulingArg.toLowerCase());
    if (chosen.length === 0) {
      console.error(`no mutations for ruling ${rulingArg}`);
      process.exit(2);
    }
  }
  if (onlyArg) {
    const ids = onlyArg.split(',').map((s) => s.trim()).filter(Boolean);
    const missing = ids.filter((id) => !catalogue.some((m) => m.id === id));
    // A typo in --only that selects nothing must not exit 0 with "all killed".
    if (missing.length) {
      console.error(`no such mutation: ${missing.join(', ')}\nrun --list to see the ids`);
      process.exit(2);
    }
    chosen = chosen.filter((m) => ids.includes(m.id));
  }
  if (chosen.length === 0) {
    console.error('nothing selected');
    process.exit(2);
  }
  return chosen;
}

// ------------------------------------------------------------- --list

if (wantList) {
  const rows = catalogue.map((m) => ({
    id: m.id,
    ruling: m.ruling,
    file: m.file,
    expect: m.expect.join(', '),
    claim: m.claim,
  }));
  if (wantJson) {
    console.log(JSON.stringify({ count: rows.length, mutations: rows }, null, 2));
  } else {
    const w = Math.max(...rows.map((r) => r.id.length));
    for (const r of rows) {
      say(`${r.id.padEnd(w)}  ${r.file}`);
      say(`${' '.repeat(w)}  ${r.claim}`);
      say(`${' '.repeat(w)}  -> ${r.expect}`);
    }
    say(`\n${rows.length} mutations`);
  }
  process.exit(0);
}

// ------------------------------------------------- applying and restoring

/**
 * Files currently holding a mutation. Everything that can end this process
 * reads this map and puts the originals back.
 */
const outstanding = new Map<string, { original: string; mutated: string }>();

function restoreAll(why: string): void {
  for (const [path, { original, mutated }] of outstanding) {
    let onDisk: string | null = null;
    try {
      onDisk = readFileSync(path, 'utf8');
    } catch {
      onDisk = null;
    }
    try {
      writeFileSync(path, original);
      /*
        Another agent editing this file while it was mutated is the one case
        where restoring is itself destructive: their save is overwritten by our
        `original`. Restoring is still right -- a mutated file left in a shared
        tree is worse than a lost edit somebody can redo -- but it must be said
        out loud, because it is invisible from a diff.
      */
      if (onDisk !== null && onDisk !== mutated) {
        say(`!! ${rel(path)} changed on disk while it was mutated.`);
        say('!! Something else wrote it; that write has just been overwritten by the restore.');
      }
    } catch (err) {
      console.error(`!!!! COULD NOT RESTORE ${rel(path)}: ${(err as Error).message}`);
      console.error('!!!! The file is left MUTATED. Restore it by hand before doing anything else.');
    }
  }
  if (outstanding.size) say(`restored ${outstanding.size} file(s) (${why})`);
  outstanding.clear();
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    restoreAll(signal);
    process.exit(130);
  });
}
process.on('uncaughtException', (err) => {
  restoreAll('uncaught exception');
  console.error(err);
  process.exit(1);
});
// Last resort. Synchronous work only, which writeFileSync is.
process.on('exit', () => restoreAll('exit'));

const crlf = (s: string) => s.split('\n').join('\r\n');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/**
 * Apply `find` -> `replace`, insisting on exactly one match.
 *
 * The CRLF retry is not leniency about the pattern: it is the same literal
 * text, in the line ending the file actually uses. A catalogue written on a
 * machine that checks out LF must still apply on one that checks out CRLF, and
 * the alternative is a "matched 0 times" that reads like a stale catalogue.
 */
function applyMutation(source: string, m: Mutation): { mutated: string; how: string } {
  const attempts: Array<[string, string, string]> = [
    ['literal', m.find, m.replace],
    ['crlf', crlf(m.find), crlf(m.replace)],
  ];
  for (const [how, find, replace] of attempts) {
    const hits = occurrences(source, find);
    if (hits === 1) return { mutated: source.split(find).join(replace), how };
    if (hits > 1) {
      throw new Error(
        `find matches ${hits} times in ${m.file}, and a mutation that lands in the wrong ` +
          'place proves nothing. Extend `find` with surrounding lines until it is unique.',
      );
    }
    if (how === 'literal' && !source.includes('\r\n')) break;
  }
  throw new Error(
    `find matches 0 times in ${m.file}. The file has moved on and the catalogue has not. ` +
      'This is fatal on purpose: an unapplied mutation looks exactly like a test that caught nothing.',
  );
}

// -------------------------------------------------------------- --check

if (wantCheck) {
  let bad = 0;
  const checking = select();
  for (const m of checking) {
    const path = join(ROOT, m.file);
    const problems: string[] = [];
    if (!existsSync(path)) problems.push(`${m.file} does not exist`);
    for (const t of m.expect) if (!existsSync(join(ROOT, t))) problems.push(`${t} does not exist`);
    if (problems.length === 0) {
      try {
        applyMutation(readFileSync(path, 'utf8'), m);
      } catch (err) {
        problems.push((err as Error).message);
      }
    }
    if (problems.length) {
      bad += 1;
      say(`FAIL  ${m.id} -- ${problems.join('; ')}`);
    } else {
      say(`ok    ${m.id}`);
    }
  }
  say(`\n${checking.length} catalogued, ${bad} not applicable`);
  if (wantJson) console.log(JSON.stringify({ catalogued: checking.length, notApplicable: bad }));
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------- vitest

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

type Run = { code: number; passed: number; failed: number; files: number; text: string };

function runTests(files: string[]): Run {
  const out = spawnSync('npx', ['vitest', 'run', ...files, '--reporter=dot'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    /*
      A bounded wait, because everything above this line is holding a mutated
      file. A vitest that hangs -- a component that loops, a promise that never
      settles -- would otherwise leave the defect in the working tree for as
      long as somebody takes to notice. Two minutes is ~30x the slowest file
      here; a run that exceeds it is reported as ERROR, never as a kill.
    */
    timeout: 120_000,
    killSignal: 'SIGKILL',
  });
  // vitest colours its summary even with NO_COLOR set, and the counts are what
  // this whole harness reads (the gate strips them for the same reason).
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`.replace(ANSI, '');
  const testsLine = /^\s*Tests\s+(.*)$/m.exec(text)?.[1] ?? '';
  const filesLine = /^\s*Test Files\s+(.*)$/m.exec(text)?.[1] ?? '';
  return {
    code: out.status ?? 1,
    passed: Number(/(\d+) passed/.exec(testsLine)?.[1] ?? 0),
    failed: Number(/(\d+) failed/.exec(testsLine)?.[1] ?? 0),
    files: Number(/\((\d+)\)\s*$/.exec(filesLine)?.[1] ?? 0),
    text,
  };
}

/** The first line that looks like a reason, for a one-line summary. */
function firstFailure(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /AssertionError|Error:|→/.test(l) && !/^Error: Command failed/.test(l));
  return (line ?? '').slice(0, 160);
}

// ----------------------------------------------------------- the baseline

/*
  R127 taught this the expensive way: a run whose failures are not all yours is
  a run you cannot read. There, eight worktrees made every test file exist nine
  times and one of two failures belonged to somebody else; attributing the other
  cost more time than the fix. Here the same hazard is cheaper to remove than to
  remember -- run the tests untouched first, and if they are already red, say so
  instead of banking their redness as a kill.
*/
const baselines = new Map<string, Run>();

function baselineFor(files: string[]): Run {
  const key = files.join(' ');
  const cached = baselines.get(key);
  if (cached) return cached;
  const run = runTests(files);
  baselines.set(key, run);
  return run;
}

function baselineIsGreen(run: Run, files: string[]): string | null {
  if (run.files !== files.length) {
    return `the filter matched ${run.files} test file(s), not ${files.length}`;
  }
  if (run.code !== 0 || run.failed > 0) return `${run.failed} case(s) already failing`;
  if (run.passed === 0) return 'no cases ran at all';
  return null;
}

// ------------------------------------------------------------------- run

const chosen = select();
const results: Outcome[] = [];

say(`${chosen.length} mutation(s) from ${rel(CATALOGUE)}\n`);

for (const m of chosen) {
  const path = join(ROOT, m.file);
  const started = Date.now();
  const record = (verdict: Verdict, detail: string) => {
    results.push({
      id: m.id,
      ruling: m.ruling,
      claim: m.claim,
      file: m.file,
      expect: m.expect,
      verdict,
      detail,
      ms: Date.now() - started,
    });
    say(`${verdict.padEnd(13)}${m.id} -- ${detail}`);
  };

  if (!existsSync(path)) {
    record('ERROR', `${m.file} does not exist`);
    continue;
  }

  const baseline = baselineFor(m.expect);
  const notGreen = baselineIsGreen(baseline, m.expect);
  if (notGreen) {
    record('BASELINE-RED', `${m.expect.join(', ')} is not green before the mutation: ${notGreen}`);
    continue;
  }

  /*
    Read immediately before mutating, never once at startup. Other agents write
    this tree, and a stale `original` restored over their work is the same
    accident as leaving the mutation in.
  */
  let original: string;
  try {
    original = readFileSync(path, 'utf8');
  } catch (err) {
    record('ERROR', `cannot read ${m.file}: ${(err as Error).message}`);
    continue;
  }

  let mutated: string;
  let how: string;
  try {
    ({ mutated, how } = applyMutation(original, m));
  } catch (err) {
    record('ERROR', (err as Error).message);
    continue;
  }

  try {
    writeFileSync(path, mutated);
    outstanding.set(path, { original, mutated });
    // Cheap proof the write landed, so a silently failed write cannot be read
    // as a surviving claim.
    if (readFileSync(path, 'utf8') !== mutated) {
      record('ERROR', `the mutation did not land in ${m.file}`);
      continue;
    }

    const run = runTests(m.expect);
    if (run.files !== m.expect.length) {
      record('ERROR', `the filter matched ${run.files} test file(s), not ${m.expect.length}`);
    } else if (run.failed > 0) {
      record('KILLED', `${run.failed} case(s) went red${how === 'crlf' ? ' (crlf)' : ''}`);
    } else if (run.code === 0 && run.passed > 0) {
      record(
        'SURVIVED',
        `${run.passed} case(s) still pass with the defect back -- the claim is hollow`,
      );
    } else {
      /*
        Non-zero with nothing failed is a collection or transform error: the
        mutation broke the file rather than the claim, so the run says nothing
        about whether anybody was watching. Not a kill.
      */
      record('ERROR', `the suite did not run: ${firstFailure(run.text) || `exit ${run.code}`}`);
    }
  } finally {
    // Restore before the next mutation, whatever happened above.
    restoreAll(m.id);
  }
}

// --------------------------------------------------------------- summary

const killed = results.filter((r) => r.verdict === 'KILLED');
const survived = results.filter((r) => r.verdict === 'SURVIVED');
const errored = results.filter((r) => r.verdict === 'ERROR');
const baselineRed = results.filter((r) => r.verdict === 'BASELINE-RED');

say('');
say(
  `${killed.length}/${results.length} killed` +
    (survived.length ? `, ${survived.length} SURVIVED` : '') +
    (errored.length ? `, ${errored.length} error` : '') +
    (baselineRed.length ? `, ${baselineRed.length} baseline-red` : ''),
);

if (survived.length) {
  say('\nSurviving mutations. Each of these is a claim the suite makes and does not hold:');
  for (const r of survived) say(`  ${r.ruling}  ${r.id}\n      ${r.claim}\n      guarded by: ${r.expect.join(', ')}`);
  say('\nR129: a count of passing tests is not a measurement of anything until the');
  say('tests have been made to fail. Fix the test, not the catalogue.');
}
if (baselineRed.length) {
  say('\nNot judged, because the tests were already red before the mutation:');
  for (const r of baselineRed) say(`  ${r.id} -- ${r.detail}`);
  say('Another agent may be mid-edit. Re-run when the tree is quiet; do not read these as kills.');
}
if (errored.length) {
  say('\nCould not be judged:');
  for (const r of errored) say(`  ${r.id} -- ${r.detail}`);
}

if (wantJson) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        catalogued: catalogue.length,
        ran: results.length,
        killed: killed.length,
        survived: survived.length,
        errors: errored.length,
        baselineRed: baselineRed.length,
        ok: survived.length + errored.length + baselineRed.length === 0,
        results,
      },
      null,
      2,
    ),
  );
}

process.exit(survived.length + errored.length + baselineRed.length ? 1 : 0);
