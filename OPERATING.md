# Operating this repository

Read this before pointing an agent at Jellyfin Matcher. It is short on purpose.

## The premise

Agents report success on broken work. Routinely, confidently, with a detailed
account of what they verified. Everything below exists so that report can be
contradicted by something that is not an agent.

## One command

```
npm run gate            # everything local, including the build. What CI runs.
npm run gate -- --fast  # types, tests, counts, pins. Skips the build, so skips G7.
npm run gate -- --prod  # also checks the deployed app (needs $MATCHER_URL)
```

Numbered, counted, non-zero on failure:

| Gate | Checks | Current |
|---|---|---|
| G1 | `tsc --noEmit` | clean |
| G2 | `vitest run`, and the **counts** | 750 cases in 44 files |
| G3 | pinned claims still pinned | 190 |
| G4 | counts stated in prose match `gates.json` | in sync |
| G5 | `next build` | builds |
| G6 | deployed app is up, configured, and on this commit | opt in |
| G7 | the built stylesheet ships what the source declares | 4 standard |
| G8 | every numbered ruling is indexed to where it is explained | 86 rulings |

`npm run counts` rewrites the prose from `gates.json`. G4 exists because this
repo's whole argument is that a gate stops false claims shipping, and the README
sat three waves out of date on the very number it was bragging about.

The floors live in `gates.json`. They are floors, not equalities: the gate fails
when a number goes *down*, because green with fewer tests than yesterday is
exactly what a silent deletion looks like. Work that legitimately adds tests or
pins raises the floors **in the same commit**.

## Is the state sane

```
MATCHER_URL=http://your-host:3000 npm run prod:read
```

Read-only, one command, machine-readable verdict. Reports the deployed commit,
uptime, live room count, which upstreams are configured, and whether production
matches this repository. Never writes, never restarts, never deploys. Safe to
run from a loop or from a routine that is not allowed to change anything.

Parity works because CI stamps the commit into the image (`GIT_SHA` →
`MATCHER_VERSION` → `/healthz`). A deploy that cannot say what it deployed is a
hope, not a fact.

## What is pinned, and how to change a pin

`src/ui/__tests__/pins.test.ts` holds 190 claims that nothing else asserts:
accessibility hooks, copy that discloses a consequence, empty states that
explain themselves, README promises. They accumulated one decision at a time
and a redesign done for appearance deletes them without a single other test
going red.

Rules, in order of how often they are broken:

- **Pin before the work, never after.** A guard written from a diff can only
  find what has already gone. A pin that is red before you start is a bad pin,
  and fixing it afterwards is indistinguishable from covering up a deletion,
  including to you.
- **Pin the smallest fragment that carries the meaning.** A legitimate rewrite
  must pass. Pin whole sentences and people learn to edit the guard instead of
  the code, which is worse than no guard because it looks like one.
- **The haystack is the whole app, comment-stripped.** Whole-app, so moving copy
  into a shared component is not reported as a loss. Comment-stripped, so a
  deleted sentence quoted in the comment explaining its deletion cannot satisfy
  the test protecting it. Both are handled in `scripts/lib/source-scan.ts`.
- **"The whole app" means `app/`, `src/` and `server/`, minus `__tests__`.**
  Plus `app/globals.css`, which the pins file reads separately because it is not
  TypeScript. Nothing under `scripts/` is scanned at all.

  This matters because a pin written for a file outside that set does not fail
  loudly — it fails *immediately and confusingly*, searching a corpus that
  cannot contain its subject. Two pins were written that way in one session, one
  for `scripts/screenshots.ts` and one for a test file, and both were deleted
  rather than weakened. If the thing worth protecting lives in a script or a
  test, the guard is a test, not a pin.
- **Find new candidates mechanically**: `npm run inventory` (optionally
  `npm run inventory -- Lobby`). It produces a shortlist for a human, not a
  decision.

When a pin fails, it is one of two things and they are identical from a diff:

1. The work broke something. Fix the work.
2. The work changed something deliberately and the pin is stale. Fix the pin —
   but only after confirming the property survives where a user actually meets
   it, and say in the pin's `why` what the new form is. Never weaken a pin to
   something a blank page would pass. Count the changes: a large count means
   the work is drifting, not the pins.

Getting this wrong in the second direction is how a suite becomes decorative,
one reasonable accommodation at a time. It is also the one step where being
wrong leaves no trace.

## What parallelises here, and what does not

The dividing line is shared mutable state, not task size.

| Work | Shares | Run |
|---|---|---|
| Reading this codebase, reviewing, judging a design | nothing | fan out wide |
| One agent per component file, ownership declared | nothing | parallel |
| `npm run gate`, `npm test` | nothing in-process, but CPU and the Next build cache | serial |
| `npm run e2e` | port 3000, a live Jellyfin, real Jellyseerr requests | **serial, one at a time** |
| `npm run e2e:two` | a running server, a live Jellyfin, a real room | **serial, one at a time** |
| `npm run mutate` | writes deliberately broken code into real source files | **serial, one at a time** |
| Two agents editing one file | the file | never; last write wins silently |
| Anything committing | the git index | one at a time, explicit paths |
| Anything pushing to `main` | production, since push *is* deploy | one, last |

`npm run e2e` is the sharpest edge in this repo: it binds `localhost:3000`,
drives a real session, and in Any Movie mode can fire a genuine Jellyseerr
request that lands in Radarr. Two of them at once is not a flaky test, it is two
downloads.

`npm run e2e:two` drives two Chrome pages through one room and asserts what each
phone can see — including what it must not see. Every other harness here drives a
single page, so until it existed the product's central claim, that the room lands on
one film on *everybody's* phone, was checked by nothing.

**Never let a worker grade its own work.** Port and feature agents do not run
the gate. One verifier runs it afterwards, serially, with the workers' reports
as input and authority to reject.

## Prohibitions

- **Never `git add -A`.** Something else is always mid-flight. Stage explicit
  paths. A sweeping commit ends up with a message describing work it does not
  contain.
- **Never push and deploy out of order.** Here they are the same act — pushing
  `main` publishes the image — so the ordering is safe by construction. Do not
  add a manual deploy path that can run ahead of the push.
- **Never run two `npm run e2e` at once.** See above.
- **Never run `npm run mutate` beside anything that reads the tree.** It puts a
  real defect into a real file, runs a test, and restores it. Anything else
  running the gate inside that window sees a failure that is not theirs and is
  not real -- which is R127 exactly, in a form that looks like a genuine
  regression instead of an inflated count. The harness refuses to bank a kill
  from a suite that was already red, so it will tell you rather than lie, but it
  cannot stop the other run being wrong.
- **Never edit a pin to make a port pass** without reading the rendered page.
- **Never `git checkout`/`reset` in a worktree another agent is using.**

## Running unattended

Two kinds of routine, and they must not be confused.

**Tester.** Runs `npm run gate -- --prod` and `npm run prod:read` on a schedule.
Its brief says, in these words: *do not fix what you find.* It reports and
stops. That constraint is what makes it safe to run against production forever.

**Fixer.** Changes code. Gets the whole gate list and **opens a pull request
rather than pushing to `main`** — since push is deploy, a fixer with push rights
is a fixer with deploy rights. Auto-merge on green is a privilege it earns after
you have watched it be right several times, not a starting condition.

Durable work belongs in `QUEUE.md`, in the repo. Sessions die mid-task, limits
hit, machines sleep; whatever is not written down is gone.

## Writing a brief for an agent here

Every run is a fresh clone with no memory. Include:

1. **Get current**: `git fetch origin && git checkout main && git pull --ff-only`
   then `npm ci`. Include the steps that look redundant.
2. **The gate, numbered, with today's numbers**: 750 cases, 44 files, 190 pins.
   Drift is only visible against a number.
3. **The traps, as prohibitions**: the list above, not a link to it.
4. **Ownership**: exactly which files this agent may write. Not "the lobby area".
5. **What to do when it cannot finish**: revert its own page, quarantine the
   attempt in a branch, ship the part that works, and say so plainly.
6. **The line that saves the most money**: *a smaller honest result beats a
   larger claimed one, and reporting a blocker is a success.*

## Cost discipline

- Fan out reading and judging. Do the writing.
- Put the facts in the brief. An agent told what it needs and told not to
  explore uses a handful of tool calls; the same agent left to find its own
  context uses hundreds.
- Never convene a panel about something already decided or already in context.
- Pipe verbose output: `npm test 2>&1 | tail -20`. One failing suite can dump
  hundreds of kilobytes into a context window.
- Prefer several short sessions to one long one.
