# Working in this repository

**Read [OPERATING.md](OPERATING.md) first.** It is short and it is the contract.

The condensed version, for anyone who will not:

- **The gate is `npm run gate -- --fast`.** Types, tests, counts, pins.
  Today: 685 cases in 42 files, 190 pinned claims. Floors in `gates.json`.
- **`npm run gate` is not something a worker runs on its own work.** A verifier
  runs it afterwards, serially.
- **190 claims are pinned** in `src/ui/__tests__/pins.test.ts` — accessibility
  hooks, honesty copy, README promises. If one fails, read the rendered page
  before touching the pin, and never weaken a pin to something a blank page
  would pass.
- **Add pins before the work, never after.** `npm run inventory` finds
  candidates mechanically.
- **Never `git add -A`.** Stage explicit paths.
- **Never run two `npm run e2e` at once.** It binds port 3000 and can fire real
  Jellyseerr requests that land in Radarr.
- **Pushing `main` deploys.** There is no separate deploy step to get out of
  order, and no reason to add one.
- **The bar is [docs/UPSTREAM.md](docs/UPSTREAM.md).** 1.0 is settled — the
  board voted 5/5 in round six and that question is closed. What ends the work
  now is whether the Jellyfin project would adopt this and an acquirer would
  find nothing to fix: eleven objective gates, none met, and five adopting
  mandates who may not vote yes while any gate is open. It is meant to stay
  unmet. A round that returns 0/5 with reasons is the round working.
- **Work goes in [QUEUE.md](QUEUE.md)**, not in a session.
- Design rulings are cited as `R07` in comments. **Start at
  [docs/RULINGS.md](docs/RULINGS.md)**, which indexes every one of them to where
  it is actually explained — generated, gated, never edited by hand. Many are
  argued in [docs/REDESIGN.md](docs/REDESIGN.md) and
  [docs/DIRECTION.md](docs/DIRECTION.md); the rest were decided in the comment
  that cites them. This file used to claim DIRECTION.md held R19-R55. It does
  not, and never did.

A smaller honest result beats a larger claimed one. Reporting a blocker is a
success.
