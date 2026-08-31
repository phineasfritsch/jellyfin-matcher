# Work queue

In the repo, not in a session. Sessions die mid-task, limits hit, machines
sleep; whatever is not written down here is gone.

**Rules.** One owner per item. An item names the files it may write. Move an
item to Done only when `npm run gate -- --fast` was green *after* it, run by
something that is not the agent that did the work. Blocked is a legitimate
outcome and should be written down, not worked around.

**Today's numbers:** 348 test cases, 22 files, 135 pinned claims, all green.

---

## Now

- [ ] **Watch the first gate run in CI.** The `gate` job is new and now blocks
      publishing. First push to `main` proves it runs before the image builds.
      Owner: whoever pushes first.

- [ ] **Point `prod:read` at the real box once.** `MATCHER_URL=http://<host>:3000
      npm run prod:read` — expect a parity failure until the next image is
      built with `GIT_SHA`, which is the check working, not breaking.

## Next

- [ ] **Stage 03 component layer, in order of payoff.** One component per
      commit, each landing green against the unported app.
      Files: `src/ui/components/` only. See docs/REDESIGN.md Stage 03.
      1. ~~VoteRow (R05–R07)~~ — done, pending verification
      2. RatingLine (R12) — deduplicate `MovieDetails` / `WinnerScreen`
      3. ScopeChoice (R09, R11) — lift out of `Lobby.tsx`
      4. ~~EmptyState (R13)~~ — done, pending verification. Only the two
         full-panel states; the inline "No ratings found for this one." in
         `MovieDetails` is a sentence, not a panel, and was left alone
      5. LiveNotice (R15) — five `role="alert"` blocks become one

- [ ] **Verify the two extractions above.** Not by whoever wrote them. The gate
      is green (107 cases, 38 pins, builds) but green over a refactor is a
      statement about coverage, not correctness. Needed: a human look at the
      swipe screen and the no-winner screen on a phone. One deliberate visual
      change to check — the two empty states had drifted 4px apart (gap-3 vs
      gap-2) and are now both gap-2.

- [ ] **Pin the server's socket contract.** Event names and payload shapes are
      the API a browser depends on and nothing asserts them by name. Same
      pattern as the UI pins, in `server/__tests__/`.
      Blocked on: nothing. Cheap. Do it before any server refactor.

- [ ] **A test for the ports of the fallback path.** `rankFallback` is covered;
      the socket path that reaches it when a deck empties is not.

## Later

- [ ] **Look at the redesign on a real phone.** THE outstanding item. Every
      screen is rebuilt and a full session was driven end to end against a
      real Jellyfin library, but no human has seen any of it rendered — the
      browser extension is not connected here. Specifically worth a look:
      the teletext palette in a genuinely dark room, whether the 54px rows
      feel right under a thumb, and whether Fjalla One at 30px on the card
      reads as a title card or as shouting.

- [ ] **`app/guide/page.tsx` still wears the old indigo palette.** Last in
      the cut list on purpose — nothing links to it from the app. It will
      look wrong beside everything else until it is done.

- [ ] **A tester routine, unattended.** `npm run gate -- --prod` on a schedule.
      Brief says, in these words: *do not fix what you find.* Reports and stops.

- [ ] **A fixer routine, later, opening PRs only.** Push is deploy in this repo,
      so a fixer with push rights is a fixer with deploy rights. Auto-merge on
      green is earned after watching it be right several times.

## Blocked

_(nothing yet — when something lands here, write what would unblock it)_

## Done

- [x] **2026-08-30 — Gate, health check, pins, inventory, version stamping.**
      `npm run gate` (5 numbered checks, counts, non-zero on fail),
      `npm run prod:read` (read-only sanity verdict + parity),
      `npm run inventory` (Stage 04 extractor),
      38 pinned claims green before any redesign work,
      `GIT_SHA` → `/healthz` so parity is a fact,
      CI gates the image build. See OPERATING.md and docs/REDESIGN.md.
