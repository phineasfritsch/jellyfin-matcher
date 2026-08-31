# Work queue

In the repo, not in a session. Sessions die mid-task, limits hit, machines
sleep; whatever is not written down here is gone.

**Rules.** One owner per item. An item names the files it may write. Move an
item to Done only when `npm run gate` was green *after* it, run by something
that is not the agent that did the work. Blocked is a legitimate outcome and
should be written down, not worked around.

**Today's numbers:** 385 test cases, 26 files, 146 pinned claims, all green.

This queue is the output of the 2026-08-31 board round (see [docs/BOARD.md](docs/BOARD.md)).
Every item below survived an adversarial verifier with repo access; one claim was
struck and three were cut down below the line. Ranked by value per unit of effort.

---

## Now

- [ ] **Let a knockout resolve when a phone drops** — critical/medium (Engineering)
      Files: server/transitions.ts, server/index.ts (disconnect), src/lib/knockout.ts, server/__tests__/session.test.ts, gates.json
      settlement.ts states the rule — only connected members decide when a room ends — but applies it to the deck only. transitions.ts:69 and :82 pass Object.keys(room.users) into submitGenres/submitElimination, and knockout.ts:78/:124 resolve only when every one of those ids has answered; index.ts:589 re-evaluates nothing outside SWIPING. Two of three submitted with the third's tab closed leaves Knockout.tsx:32-43 reading "2 of 3 in" until the leaver returns or the 2h TTL reaps the room, and nothing in the UI reads `connected` (src/ui/types.ts:14 is its only appearance). Fix carefully: gate RESOLUTION on activeUserIds while still tallying every submitter, because knockout.ts:82/:128 iterate the same list to compute the overlap and the elimination tally, and swapping it wholesale would delete a departed member's already-cast picks — the exact thing settlement.ts:17-19 forbids. A knockout re-resolve also needs a new function; today resolution only runs inside a submission. The LOBBY half is milder (a lobby leaver is deleted, so any member toggling ready restarts it) but should be closed at the same time. session.test.ts:154 covers only mid-deck.

- [ ] **Bind a reconnect secret to the member so room:join cannot be impersonated** — critical/medium (Engineering)
      Files: server/store.ts, server/index.ts, server/limits.ts, src/ui/socket.ts, src/ui/useRoom.ts, server/__tests__/store.test.ts, src/ui/__tests__/pins.test.ts
      index.ts:401 gates only on `!userId`, so supplying one skips the joinRequires check, and store.reconnect (store.ts:142-149) checks only that the id exists — no secret, no status check — making it the one way into a room after mid-game joins are refused. Ids are a global counter (`u_1`, `u_2`…; store.ts:84, validate.ts:49) and act as bearer credentials. The impersonator gets that member's redacted-private view (index.ts:280 → roomView.ts:44) and can act as them for ready, genre submit/eliminate, vote, undo and winner:reject, and disconnecting as them deletes them from a LOBBY room. Bounded, but real: scope=wide (index.ts:435) and winner:request (index.ts:533) are gated on authedName, so no Jellyseerr download can be fired this way. There is no rate limiter on room:join, which is what makes the 4-character room code enumerable. This defeats the only mitigation README.md:158 offers for a public hostname. Any fix must also persist the secret in src/ui/socket.ts:82 saveSession and useRoom.ts:104, or the silent refresh-reconnect the README promises breaks.

- [ ] **Recompute --color-border against the surface it is actually drawn on** — high/small (Access and Honesty)
      Files: app/globals.css, src/ui/__tests__/pins.test.ts (T05)
      Pin T05 asserts #5f6a63 on #0b0e11 = 3.44:1, and the arithmetic is right — but body::before (globals.css:71-88) fully occludes the canvas colour, and every row divider (Listing.tsx:131 inside the .gel at :83; Lobby.tsx:123/163/194) is drawn over that gradient plus .gel's 6% white. Sampled from the committed 03-lobby.png at x=400: divider #5F6A63 against #1A2427 below is 2.81:1 (the general case) and against a pressed row's #2E393A above is 2.12:1. Both fail R41's 3:1. Nothing catches it: T05 and T21 are string-find pins and there is no contrast math anywhere in src/ or scripts/. Lightening the token also breaks T05's `find` string, so the pin's find and its why must change in the same commit. R41 itself exists only in code comments (Listing.tsx:19-20, globals.css:25-28) and never says which ground it means — say so when fixing it.

## Next

- [ ] **Put the winner's facts on the room so a reload does not misreport the night** — high/medium (Engineering)
      Files: src/ui/components/WinnerScreen.tsx, server/store.ts, server/transitions.ts, server/roomView.ts, src/ui/types.ts, server/__tests__/
      viaFallback, the ranking and the play URL exist only in the transient match:declared event (index.ts:303/319; useRoom.ts:31/42/47) and are never replayed on rejoin — room:join ends in a room:state broadcast that carries no equivalent. So after any reload on the FINISHED screen, WinnerScreen.tsx:39 computes `held` as false: the bar flips to "Not on your server", the "nothing has been downloaded" cost line appears, a points winner is described as "Everyone said yes.", the ranking vanishes, and the Play link becomes a Jellyseerr request the server then refuses with "Already in the library" (index.ts:543) — an error on the payoff screen. One correction that shrinks the work: library membership is NOT missing from state; viewFor spreads the whole deck and MovieCandidate carries jellyfinItemId, so `held` can be derived today. Only the play URL (needs the server's Jellyfin base URL), winnerViaFallback and winnerRanking must be added to Room and viewFor.

- [ ] **Give the Jellyfin login fetch a deadline** — medium/small (Engineering)
      Files: server/auth.ts, server/__tests__/auth.test.ts, src/ui/__tests__/pins.test.ts, gates.json
      server/auth.ts:89 defaults fetchFn to bare `fetch` and :95 passes no signal; index.ts:228 calls it with no override, so POST /api/login can wait indefinitely on a sleeping or half-open Jellyfin. It is the only server-side upstream without one — jellyfin.ts:15, jellyseerr.ts:12 and mdblist.ts:37 all use withDeadline(fetch), and deadline.ts:2 states the invariant outright. A hung login is never counted by the limiter either, since loginLimiter.record runs only in the catch (index.ts:233). The user-visible symptom is worse than a slow page: AuthGate.tsx:72 also passes no signal and reaches setBusy(false) only on error, so the sign-in button stays disabled forever with no message. Pin the wrapped default with a needle distinct from T41's `fetchFn: withDeadline(fetch)`.

- [ ] **Settle what the download disclosure says, then make copy, comments, pin and rulings agree** — high/medium (Access and Honesty)
      Files: docs/DIRECTION.md, CLAUDE.md, src/ui/components/WinnerScreen.tsx, src/ui/components/Listing.tsx, src/ui/components/SwipeDeck.tsx, src/ui/__tests__/pins.test.ts (T01)
      No size figure exists anywhere in the app, and there is no size datum to print — src/lib/types.ts, jellyfin.ts and jellyseerr.ts contain no size field at all, so reading one off Jellyseerr's discover payload is not available. Three code sites assert otherwise (Listing.tsx:190/195, SwipeDeck.tsx:98, pin T01), and the docs contradict themselves: R33 (DIRECTION.md:131) says the winner names "how big", while R36 (:140) prescribes the runtime string the code actually ships. The tie-breaker the comments cite, R42, is written down nowhere. T01 also breaches the pins file's first rule — its `find` is `export function CostLine` while its `why` claims a size is stated. Decide the contradiction in the docs first; given no size data exists, the honest landing is "size unknown until the host approves it". While in there, close the wider gap: R39-R55, R63, R64, R71 and R79 are cited in code and defined nowhere, while CLAUDE.md:25 sends readers to DIRECTION.md for R19-R55 — including R79, cited by both WinnerScreen.tsx:58 and pin T63.

- [ ] **Make the socket layer executable by tests** — high/large (Engineering)
      Files: server/index.ts, new server/handlers.ts, server/__tests__/handlers.test.ts, server/__tests__/validate.test.ts, gates.json
      No test in server/__tests__, src/ui/__tests__ or src/lib/__tests__ imports server/index.ts, so under npm run gate the handlers, the auth gating (index.ts:369-371, 399-403), the reconnect branch, the disconnect handler, settleIfPossible and the shutdown hook never run — the same shape as R82 one layer up. What does touch that file is string presence: validate.test.ts:121-190 reads it as text and asserts 15 event names and 2 shutdown strings. Two corrections to the original framing: scripts/e2e-walkout.cjs and scripts/e2e-session.ts do drive the disconnect and join/vote/settle paths, though they are manual and gate-excluded; and most rules already live in tested modules, so the untested surface is wiring and gating, not 647 lines of logic. Extract the handler bodies behind an emit/broadcast interface, the move transitions.ts already made under R69, and drive join/reconnect/disconnect/vote/reject against a fake emitter — starting with items 4, 5 and 7. Keep the literal `socket.on('<event>'` registrations in index.ts or update validate.test.ts:149-155 in the same commit, or 11 contract cases go red.

## Blocked — needs a real household, not an agent

These are real and ranked, and no amount of code closes them alone. They need
the app used by people who are not the maintainer, for more than one night.

- [ ] **Give the app some memory of the household between nights** — critical/medium (Product)
      Files: src/lib/deck.ts, src/lib/jellyfin.ts, server/deckService.ts, server/store.ts, src/lib/__tests__/
      Room state including the rejected list lives only in an in-memory Map (store.ts:64, :45) on a 2h TTL, buildDeck (deck.ts:40-74) takes no exclusion set and no randomness, and the Jellyfin Items query asks for Fields=Genres,ProviderIds,ProductionYear,Overview with UserData/IsPlayed appearing nowhere in src/, server/ or app/. So in local scope with an unchanged library the same two genres deal the same deck in the same order, and the app never knows what anyone has watched. Two caveats on the strong version: the MDBList cache TTL is exactly 7 days (mdblist.ts:9), so week-to-week order is not guaranteed identical, and the deck opens with the top-composite hybrid, not necessarily last week's winner. Nothing in DIRECTION.md or REDESIGN.md rules against persistence, and disk state is already normal (docker-compose.yml:19 mounts ./cache). The played-flag half is bigger than one lib file: the client authenticates with a server API key (jellyfin.ts:64-67), so UserData needs a user context, and rooms mix authed members with guests — whose played state counts is an open design question. The history.json exclusion half is self-contained and worth doing alone.

- [ ] **Give the room a way to say "fine, let's just watch that one"** — high/medium (Product)
      Files: server/index.ts, server/settlement.ts, src/ui/useRoom.ts, src/ui/components/SwipeDeck.tsx, server/__tests__/
      canSettle (settlement.ts:59-77) returns only on an instant match among connected members or once every connected member has swiped the whole deck (25/50/75 by setting, and the built deck may be shorter). None of the 12 socket handlers is a settle event, and the finished swiper is parked on a static EmptyState (SwipeDeck.tsx:120-123) with no control on it or anywhere in RoomClient.tsx. The wait does end if the slow member closes their phone (disconnect re-runs settlement) — the fast swiper simply has no in-app way to cause it. Add one event running the existing fallbackWinner path, gated on a majority of connected members. Two constraints from the record: R63 (index.ts:557-564) rejects a host role, so the gate must be member-symmetric; and R46 (SwipeDeck.tsx:85-91) keeps peer progress a bare count, so the UI must show "2 of 3" and never who pressed. Whether a household actually wants this button is the part only real use can answer.

## Done

- [x] **2026-08-31 — Ship the glass.** The build was emitting only
      `-webkit-backdrop-filter`, which Chrome does not support, so every frosted
      pane rendered flat on every Chrome while dev and Safari looked right (R82).
      Guarded by `css.test.ts` and gate G7; CI moved off `--fast` so G7 runs.

- [x] **2026-08-31 — Board items 1, 2 and 3.** The winner screen and the deck
      card both lost the film's name at 200% text; the picture now yields and
      the words do not (R84). `04-knockout.png` was the loading skeleton in every
      version this repo has ever committed, including the one the README shipped
      above the fold (R85). The R21 no-scrolling test the docs asked for now
      exists.

- [x] **2026-08-31 — Focus, portals and the capture harness.** R80, R81, R83.
      The harness now asserts focus behaviour in the browser and exits non-zero.

- [x] **2026-08-30 — Gate, health check, pins, inventory, version stamping.**
      See OPERATING.md and docs/REDESIGN.md.
