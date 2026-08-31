# Working in this repository

**Read [OPERATING.md](OPERATING.md) first.** It is short and it is the contract.

The condensed version, for anyone who will not:

- **The gate is `npm run gate -- --fast`.** Types, tests, counts, pins.
  Today: 377 cases in 25 files, 143 pinned claims. Floors in `gates.json`.
- **`npm run gate` is not something a worker runs on its own work.** A verifier
  runs it afterwards, serially.
- **143 claims are pinned** in `src/ui/__tests__/pins.test.ts` — accessibility
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
- **Work goes in [QUEUE.md](QUEUE.md)**, not in a session.
- Design rulings, cited as `R07` in comments, live in
  [docs/REDESIGN.md](docs/REDESIGN.md) (R01-R18) and
  [docs/DIRECTION.md](docs/DIRECTION.md) (R19-R55, the Late Show redesign).

A smaller honest result beats a larger claimed one. Reporting a blocker is a
success.
