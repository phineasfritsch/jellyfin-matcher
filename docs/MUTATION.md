# The mutation harness

A count of passing tests is not a measurement of anything until the tests have
been made to fail. Coverage says which lines ran. Only mutation says whether
anybody was watching (R129).

`scripts/mutate.ts` puts a defect back, runs the tests that claim to catch it,
and records whether they went red. `mutations.json` is the catalogue.

## Why it exists

R129 asked that question of the whole render suite: eight agents reintroduced
the historical defect behind every claim the tests make, taking the real code
out of git history rather than inventing a plausible mutation. **97 claims. 44
sound, 4 weak, 49 hollow.** The repository whose whole argument is that a gate
stops false claims from shipping had 597 green cases proving materially less
than their number implied.

Twenty-three were fixed, each re-verified by hand against the exact mutation
that had passed it. Gate U2 in [UPSTREAM.md](UPSTREAM.md) says that is not good
enough:

> **The mutation audit is automated and gated.** A human deciding when to re-run
> it is the same failure as a generator checking itself (R124).

So the audit is data rather than a memory. The catalogue is a file, the harness
runs it, and a claim that stops holding is a red gate rather than something
somebody has to think to check.

## Running it

```
npm run mutate                     the whole catalogue      (3m24s measured)
npm run mutate -- --list           what is in it
npm run mutate -- --check          does every entry still apply  (~1 s, no tests)
npm run mutate -- --only R99-socket-deadline
npm run mutate -- --only a,b,c     several, by id
npm run mutate -- --ruling R111    every mutation for one ruling
npm run mutate -- --json           machine-readable, for a gate
```

Non-zero exit if anything survived, errored, or could not be judged. Until the
`mutate` script is wired into `package.json` (see the bottom of this file), the
same commands are `npx tsx scripts/mutate.ts --list` and so on.

**Run it alone.** It writes deliberately broken code into real files in the
working tree, one at a time, and puts it back. Another agent running
`npm run gate`, `npm test` or `npm run counts` during that window sees a defect
that is not theirs and cannot tell — which is the R127 failure exactly, and it
cost more time to attribute than to fix. This belongs in the same row of
OPERATING.md's table as `npm run e2e`: **serial, one at a time**.

It never touches the network, never starts a server, and never runs `e2e`.

## What the verdicts mean

| Verdict | What happened | What to do |
|---|---|---|
| `KILLED` | The named tests went red with the defect back. | Nothing. The claim holds. |
| `SURVIVED` | The tests still pass with the defect back. | **The claim is hollow.** Fix the test, not the catalogue. |
| `ERROR` | The mutation could not be applied, or broke the file rather than the claim. | Fix the catalogue entry. |
| `BASELINE-RED` | The tests were already failing before the mutation. | Not a result. Re-run when the tree is quiet. |

`BASELINE-RED` is why the harness runs each test file untouched first. A file
that is already red reports every mutation against it as `KILLED` — a clean bill
of health issued by a broken instrument, which is the exact class of mistake
this whole apparatus exists to catch.

## The exactly-once rule

`find` is literal text and it must match its file **exactly once**. Zero matches
and more than one match are both fatal, and the run stops rather than skipping.

This is not fussiness. **A mutation that did not apply looks exactly like a test
that caught nothing**: both are a green run and a confident report. That mistake
has already been made in this repository — a `sed` pattern with a doubled
backslash matched nothing, the untouched code passed, and the run was written up
as proof the claim held.

So when a `find` goes stale because the code moved, the harness says so loudly
and fails. Fix the entry; do not delete it because it is inconvenient.

## Adding a mutation

1. **Find the real defect.** The best source is the test's own comment: many
   here say verbatim which mutation they were checked against (`grep -rn R129
   src/ui/__tests__`). Second best is git history — the commit that fixed the
   ruling. Invent a mutation only when neither exists, and say so in `note`.
2. **Add an entry to `mutations.json`:**

   ```json
   {
     "id": "R118-slider-height",
     "ruling": "R118",
     "claim": "the runtime slider is a 44px target, not the user agent's ~15px default",
     "file": "app/globals.css",
     "find": "  height: 44px;",
     "replace": "  height: 15px;",
     "expect": ["src/ui/__tests__/css.test.ts"],
     "note": "optional: anything a reader needs that the claim does not carry"
   }
   ```

   - `id` — ruling first, kebab-case, stable. It is what `--only` takes and what
     a finding is reported as.
   - `claim` — in English, and specific. `SURVIVED` means *this sentence* is not
     true of the suite, so a vague claim produces a vague finding.
   - `file` — never a test file. Mutating a test proves nothing: it would fail
     because it was edited, not because a defect went unseen.
   - `find` — include enough surrounding lines to be unique. Multi-line is fine
     (`\n` in JSON). Not a regex.
   - `replace` — may be `""`. Deleting the line is the commonest historical
     defect: a row dropped, a guard removed, a handler disconnected.
   - `expect` — only these files are run, so the mutation is judged by the tests
     that *claim* the ground, not by the suite happening to be sensitive
     somewhere else.
3. **Run it**: `npm run mutate -- --only <id>`. It must report `KILLED`.
4. **If it SURVIVES, that is the finding.** Leave it in the catalogue, fix the
   test that should have caught it, and re-run. Never delete a surviving entry
   to get the gate green; that is the covering-up move OPERATING.md warns about
   in the pins section, one level up.
5. Raise the `mutations` floor in `gates.json` in the same commit, exactly as
   for test cases and pins.

## What is in the catalogue today

**28 mutations, 28 KILLED, 0 survived**, across nine source files and eight test
files. Every one is a defect this project actually had.

| Ruling | Mutations | What is proved to be watched |
|---|---|---|
| R18, R95 | 2 | the vote row prints its words on the screen and dims nothing |
| R39, R118, R126 | 5 | the slider is a real target, the deck size is a real radio group, the row titles are on one scale |
| R46, R61 | 2 | peer progress is a count and never an identity, on the deck and on the ballot |
| R48 | 1 | undo is wired, not just drawn |
| R54, R98 | 4 | a failure names the system, takes the screen, and offers a way off it |
| R82 | 1 | the prefixed `backdrop-filter` is declared first, or the build ships only the prefix |
| R85 | 1 | the genre wait announces itself |
| R90, R100, R107 | 4 | the winner screen after a reload, and the two promises it must not make |
| R91 | 1 | no download size is stated, because the app has none |
| R99 | 1 | the client waits longer than the server does |
| R101, R111, R116 | 6 | the seat, the socket, the login gate, and which screen a phone is on |

## What this does not prove

Read this before quoting the number.

- **The catalogue is a sample, not the suite.** 28 mutations against 622 test
  cases. A green run means these 28 claims hold, not that no hollow claim
  remains. R129 audited 97 claims; the ones it recorded as still open live in
  QUEUE.md with their mutations, and belong here as they are fixed.
- **A KILLED mutation proves the claim, not the product.** R125 is the standing
  warning: a rendering test and a browser test are not substitutes. The R83
  focus bug is invisible to jsdom, so no mutation of it would ever be recorded
  here — the harness in `scripts/screenshots.ts` keeps R83, and the test file
  says so instead of claiming otherwise.
- **`--check` is not a mutation run.** It proves every entry still applies. That
  is worth doing on every commit and it is not evidence about any test.
- **One mutation at a time.** Nothing here finds a claim that only two
  simultaneous defects would break, and nothing here generates mutations; the
  catalogue is written by hand, which means it inherits whatever the author
  failed to think of. That is a real limit and it is the reason the catalogue
  cites its sources rather than asserting completeness.

---

## Wiring this in (for the main session)

Three files, none of which this harness's author may write. Nothing below has
been applied.

### 1. `package.json`

Add to `scripts`, after `"inventory"`:

```json
    "mutate": "tsx scripts/mutate.ts",
```

### 2. `gates.json`

Add a floor. It is a floor like the others: the gate fails when it goes *down*,
because a shrinking catalogue is what a silent deletion looks like.

```json
  "mutations": 28
```

### 3. `scripts/gate.ts`

Extend the floors type at the top:

```ts
const floors = JSON.parse(readFileSync(join(ROOT, 'gates.json'), 'utf8')) as {
  testFiles: number;
  testCases: number;
  pinnedClaims: number;
  mutations: number;
};
```

Then add G9, after the G8 block and before the `failures` summary:

```ts
// G9 -- every claim still fails when its defect is put back.
//
// R129: eight agents reintroduced the historical defect behind every claim the
// render suite makes and 49 of 97 did not go red. The fixes were then verified
// by hand, one mutation at a time -- and U2 says a human deciding when to
// re-run that audit is the same failure as a generator checking itself (R124).
// So the audit is a catalogue (mutations.json) and this runs it.
//
// The harness writes deliberately broken code into real files and restores it,
// which is why --fast runs only the applicability check: it is a second, and a
// `find` that has gone stale is a mutation that silently stops testing
// anything -- indistinguishable, from here, from a test that caught nothing.
{
  const mutateArgs = ['tsx', 'scripts/mutate.ts'];
  if (fast) mutateArgs.push('--check');
  const { code, text } = run('npx', mutateArgs);
  if (fast) {
    const catalogued = Number(/(\d+) catalogued/.exec(text)?.[1] ?? 0);
    const ok = code === 0 && catalogued >= floors.mutations;
    record(
      'G9',
      'mutation catalogue',
      ok,
      `${catalogued} still apply, not run (--fast)` +
        (catalogued < floors.mutations ? ` BELOW FLOOR (${floors.mutations})` : ''),
    );
  } else {
    const killed = Number(/(\d+)\/\d+ killed/.exec(text)?.[1] ?? 0);
    const total = Number(/\d+\/(\d+) killed/.exec(text)?.[1] ?? 0);
    const ok = code === 0 && killed >= floors.mutations;
    record(
      'G9',
      'mutation audit',
      ok,
      `${killed}/${total} killed` +
        (killed < floors.mutations ? ` BELOW FLOOR (${floors.mutations}) -- a claim went hollow` : ''),
    );
  }
  if (code !== 0) {
    console.log(
      text
        .split('\n')
        .filter((l) => /SURVIVED|ERROR|BASELINE-RED|FAIL /.test(l))
        .slice(0, 20)
        .join('\n'),
    );
  }
}
```

### 4. The prose that states the number of gates

G4 exists because this repository shipped a test count three waves out of date.
Adding a ninth gate makes four claims false, and one of them is enforced by a
regex:

- `OPERATING.md` — the gate table (add a G9 row) and the `--fast` line, which
  says `--fast` "skips the build, so skips G7". It now also downgrades G9.
- `OPERATING.md` — the parallelisation table. `npm run mutate` shares the whole
  working tree with every other process: **serial, one at a time**, beside
  `npm run e2e`.
- `CLAUDE.md` — the condensed gate description.
- `CHANGELOG.md` — "The gate is 8 checks: …". This one is **generated**:
  `scripts/sync-counts.ts` holds the literal `The gate is 8 checks:` in both
  halves of its `EDITS` entry, so the file must change there too or
  `npm run counts` will put the 8 straight back and G4 will pass while the
  sentence is wrong.

### 5. `docs/RULINGS.md`

`npm run rulings` regenerates the index. Every ruling cited in `mutate.ts` and
`mutations.json` already exists, and `npx tsx scripts/rulings.ts --check`
reported the index current with both files present — but re-run it after wiring,
because G8 is the gate that caught R124.
