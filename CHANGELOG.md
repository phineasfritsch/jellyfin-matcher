# Changelog

Notable changes, newest first. Versions follow [semantic versioning](https://semver.org).

## Unreleased

Thirty-nine commits from five rounds of board review, each finding adversarially
verified before any of it was built. Every item any round raised that code could
reach is closed. The version is deliberately not bumped here: cutting a release is a
decision for whoever runs this server, and the notes are ready when they want it.

**Upgrading changes one thing on the wire.** Reconnecting to a room now requires a
seat secret that older clients never stored, so a session saved by 0.9.0 will be
refused once and the member rejoins by name. Nothing else about a room is affected.

### Added — the app remembers the household

- **What the room lands on stays out of the deck for 30 days.** The deck builder is
  deterministic — same two genres, same library, same fifty cards in the same order —
  so the film you agreed on last Tuesday was card one again this Tuesday. Winners are
  now written to `.cache/history.json`. `MATCHER_HISTORY_DAYS` changes the window and
  `0` turns it off without discarding the record.

  It remembers what the room *agreed on*, not what anyone played: nothing tells this
  app whether you pressed play, and a room that picked a film and then went to bed
  still does not want it dealt first next week. A preference rather than a rule — if
  honouring it would leave no deck at all, it is dropped, because a repeat is a worse
  evening than a fresh film and no deck is not an evening.

  **If you run in Docker, keep the cache volume** — a *named* one, not
  `-v ./cache:/app/.cache` — or the household forgets every time the container is
  replaced. The bind-mount form is the trap README.md describes: the image runs
  as non-root, Docker creates an absent bind-mount source owned by root, both
  writers fail open, and nothing looks broken while nothing is remembered.

### Fixed — signing in destroyed the room you signed in for

- **Tapping "Any Movie" could delete your seat, and the room with it.** That mode
  needs a Jellyfin account on the default settings, and signing in used to reconnect
  the socket so the new token would reach the server. A reconnect is a disconnect, and
  a member who leaves the lobby is removed along with their seat — so the person who
  tapped the feature lost the room they had just read the code out for, and was told
  "This room is gone — the server restarted." The token is handed to the live
  connection now.
- **A phone that changed network could be thrown out of a room it was sitting in.**
  A dropped connection is not noticed for up to forty-five seconds, so a phone that
  switches from wifi to cellular is back long before the old connection is declared
  dead — and that late notice used to evict them. Seats now belong to a connection, so
  a stale one cannot give away a seat somebody else is holding.

### Fixed — the room could be told the wrong thing

- **A film every single person voted No on could be declared the winner**, and
  captioned "Nobody agreed outright, so the points decided." A rating is 0–100 and a
  unanimous no is about −5 per person, so the vote term could never outweigh the
  rating term. Unanimous-no films are now out of the running; if that leaves nothing,
  the room is told there is no winner rather than handed the least-hated film.
- **A slow Jellyseerr request could become two downloads.** The browser gave up
  waiting after 10s while the server waits 15, so a request that was still in flight
  was reported as failed — and the button came straight back with nothing refusing
  the retry. Asking is now recorded on the room, refused a second time, and shown to
  everyone rather than only to whoever pressed it.
- **"Not this one — keep swiping" promised something that did not happen.** On a
  points winner the deck is already finished, so rejecting settles again immediately
  and nobody swipes anything. Both the button and the confirmation now say which of
  the two will happen.
- **A failed deck build stranded every phone in the house.** The server put the room
  back to genre picking; the panel explaining the failure hid that, had no control on
  it, and was never cleared — so the only way out was reloading each phone by hand.
- **A phone that dropped out of the lobby was left holding a room it could not
  hear.** It is handed back to the join screen now, and told why.

### Fixed — you could not read it

- **Three of the four vote weights were below readable contrast** — "−5" at 2.82:1 —
  on the screen a person reads fifty times an evening, often in a dark room. Now
  above 5:1, measured from the rendered screenshots rather than calculated.
- **At 200% text the deck card gave the film about 53px of poster** and spent 41% of
  the screen on the vote buttons. The buttons lay out in a line when they are wide,
  and the poster is back to about 430px.
- **The details button grew to 96px at 200% text** on a card that could not hold it,
  clipping the icon away entirely and shrinking the tap target below the 44px
  minimum. A thumb does not get bigger when you raise the font size, so it no longer
  does either.
- Four-character row labels (`DECK`, `BACK`, `FROM`) were clipped at large text
  sizes.

### Fixed — security

- **Anyone could take your seat.** `room:join` reconnected you as whatever member id
  you named. Ids are a global counter (`u_1`, `u_2`) behind a four-character room
  code, and the reconnect path only checked that the id existed — so anyone who could
  reach the socket could join a stranger's room as an existing member, receive that
  member's private view, and act as them for ready, genre picks, eliminations, votes,
  undo and rejecting the winner. Supplying an id also skipped the sign-in gate, which
  defeated the only mitigation the README offers for a public hostname.

  Seats now carry a 32-byte secret, issued on the ack and required to reclaim the
  seat. It is deliberately not stored on the room object: views are built by
  spreading the room, so a secret there would be a secret on every phone. Taking a
  seat is also rate limited per address, because four-character codes and counter ids
  are enumerable.
- The Jellyfin sign-in had no timeout at either end. A server that accepted the
  connection and never answered held the request open forever, was never counted by
  the rate limiter, and left the sign-in button disabled with nothing said.

### Fixed — the app did not look like what was written

- **The frosted glass was never rendering on Chrome.** The build emitted only
  `-webkit-backdrop-filter`, which Chrome does not support, because Lightning CSS
  treats a prefix written after the standard property as superseding it. Every pane
  in the app shipped as a flat translucent rectangle — correct in dev, correct in
  Safari, and the `@supports` fallback correctly declined to fire. Gate G7 now reads
  the built stylesheet, and CI runs the full gate rather than skipping it.
- **At 200% OS text the app lost the film's name** on the two screens it exists to
  deliver. The deck card scrolled its own title out of a nested box and sheared the
  ratings line mid-glyph; the winner screen showed a poster and two buttons. Both now
  give leftover room to the picture and never to the words.
- `docs/screenshots/04-knockout.png` was the loading skeleton in every version this
  repository has ever committed, and the README shipped it above the fold promising
  "a list of genres to pick from". The capture was waiting on a row that is present
  in the skeleton too.
- Row dividers were chosen against a background colour that is never on screen, and
  measured 2.67–2.85:1 against the surface they are actually drawn on. Now 3.57–3.80.

### Fixed — the app said things that were not so

- **A phone closing during the knockout stranded the room permanently**, reading
  "2 of 3 in" until the two-hour timeout reaped it. The rule that only connected
  members decide when a room ends had been applied to the deck and not the knockout.
- **A reload on the winner screen misreported the night.** How the night ended lived
  only in the announcement event, so one refresh reported a film sitting in your
  library as "Not on your server" and offered to download it.
- **The download disclosure promised an approval step that usually is not there.**
  It said the host is asked to approve a request before anything is fetched; Matcher
  requests with an admin key, and Jellyseerr approves those itself unless the host has
  configured otherwise. It now reports what actually happened — accepted, or waiting
  for your host — rather than assuming the kinder answer.
- Three code sites and two design rulings promised the download disclosure would
  state a size. No size datum reaches this app from anywhere, and the real figure is
  not settled until the host's server picks a release. The copy names the uncertainty
  instead of inventing a number.

### Changed — so this is checkable next time

- The socket layer is now functions a test can call. Nothing imported `server/index.ts`,
  so the join gating, reconnect, disconnect and vote guards never ran under the gate —
  and three of the bugs above lived in exactly that gap while staying green.
- The screenshot harness asserts behaviour while it is in each state, and exits
  non-zero: focus moves into the details sheet, focus returns on close, and a reload
  on the winner screen still tells the truth.
- `docs/RULINGS.md` indexes all 95 numbered rulings to where each is actually
  explained. Thirty-nine were cited in code and defined in neither design document,
  while `CLAUDE.md` pointed at a range that document does not contain.
- `docs/BOARD.md` records the review board — its mandates, how a round runs, and the
  rule that the product is finished only when all five vote finished. It had existed
  only inside chat sessions.
- The gate is 9 checks: 739 test cases in 44 files, 190 pinned claims.
- `npm run e2e:two` drives **two real browsers through four rooms** — a whole night,
  a knockout where one phone dies, a lobby drop that recovers, and a network blip that
  must not evict anybody. Until it existed, every harness here drove a single page, so
  the product's central claim — that the room lands on one film on *everybody's* phone
  — was checked by nothing.
- **The gate can execute the client.** Nothing in the suite rendered a component or
  ran a hook, so every client defect this project has found was caught by a browser
  harness, by a reader, or by looking at a screenshot. The winner screen, the failure
  panel, the vote row, the screen chooser and the socket module all run under the gate
  now.
- `npm run contrast` measures a colour pair out of a committed screenshot, because
  two contrast bugs in a row were arithmetic that was correct about the wrong
  surface.

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
