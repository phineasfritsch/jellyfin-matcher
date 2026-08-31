# Changelog

Notable changes, newest first. Versions follow [semantic versioning](https://semver.org).

## 0.9.0 — 2026-08-31

The first release with a version you can pin. Not 1.0: see [Why not 1.0](#why-not-10).

### Fixed — the app contradicted its own headline

- **A member leaving mid-deck could stop a room ever finishing.** `leaveRoom`
  deliberately keeps a mid-game leaver in the room so their votes survive, and both
  settlement paths counted them — so nobody could reach unanimity and the deck could
  never exhaust. In an app whose whole thesis is "no stalemates". Only connected
  members now decide *when* a room ends; everyone's votes still count once it does.
- A deck that built with zero cards parked every phone on a skeleton forever.
- Settlement was only checked when somebody voted, so a disconnect as the last event
  in a room was never re-examined.

### Fixed — the app told people things that were not true

- The README said a public hostname was fine "since the Jellyfin login gates the whole
  thing". On the default auth mode it gates nothing: anyone who finds the URL can open
  a room and read your library's titles. The page also contradicted itself three
  paragraphs earlier.
- A thin deck advised raising the runtime cap while the server refused to change
  settings after the lobby.
- Test counts stated in prose were three waves out of date. They are now enforced by
  the gate.

### Fixed — security and robustness

- **`/api/login` had no rate limit** and forwards credentials to Jellyfin's own
  authenticate endpoint, making this app an amplifier for guessing passwords against
  the media server. Eight failed attempts per address per ten minutes.
- **Sockets accepted any origin** (`cors: { origin: true }`), so any page on the
  internet could open a socket into a household's rooms. Same-origin by default now.
- Every payload arriving from a phone is validated. `room:settings` previously spread
  straight into the room, so `deckLimit: 999999` was accepted.
- Every upstream call has a deadline. `fetch` has no default timeout, so a Jellyfin
  that accepted a connection and went quiet held a deck build open forever.
- Rooms, logins and the ratings budget all have ceilings, visible on `/healthz`.
- The ratings cache is written atomically; a crash mid-write used to leave truncated
  JSON and silently cost a full re-fetch on every night after.

### Fixed — accessibility

- **Every vote, position and ballot was broadcast to every phone in the room** while
  three screens promised otherwise. Each member now receives only their own.
- Type is in rem and actually scales: every size was a hardcoded pixel, under a
  comment claiming the vote row reflowed at 200% text.
- At 200% text the vote row reflowed to an unreachable column running off a screen
  that cannot scroll. It is a 2×2 now, verified by photograph.
- Vote buttons name the film and the weight, not just the verb.
- The winner screen takes focus; the details sheet traps it and hands it back.

### Added

- **Take it back.** Undo your last vote, and reject a winner without starting a new
  room. Both ask before doing anything irreversible.
- **Abstain**, on the genre screen as well as the elimination round.
- **Failure states that name the upstream** — a rate-limited MDBList, a rejected
  Jellyfin key and a genre pair that matches nothing are three different problems and
  used to produce one symptom.
- A poster proxy, so the deck works behind an HTTPS tunnel and the media server's
  address never reaches a guest's browser.
- `npm run gate` — one command, six numbered checks. `npm run prod:read` — a read-only
  verdict on a deployed instance, including whether upstreams actually answer.
- Graceful shutdown: phones are told the server is restarting.

### Changed

- Redesigned, after an eight-person focus group knocked out four directions. Grouped
  inset lists on a palette taken from the subtractive dyes of colour film.
- Multi-stage Docker image: no test runner, no compiler, non-root, with a healthcheck.
- Tagged releases publish `:1.2.3` and `:1.2` alongside `:latest`.

### Why not 1.0

A five-person review board and an eight-person user panel both reviewed this release.
**Nobody voted it finished.** Their remaining conditions are almost entirely the same
one in different words: no household that did not build this has used it for a
sustained run. Until that has happened, calling it 1.0 would be exactly the kind of
claim the rest of this changelog is about removing.
