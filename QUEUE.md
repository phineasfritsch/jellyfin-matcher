# Work queue

In the repo, not in a session. Sessions die mid-task, limits hit, machines
sleep; whatever is not written down here is gone.

**Rules.** One owner per item. An item names the files it may write. Move an
item to Done only when `npm run gate` was green *after* it, run by something
that is not the agent that did the work. Blocked is a legitimate outcome and
should be written down, not worked around.

**Today's numbers:** 498 test cases, 29 files, 177 pinned claims, all green.

This queue is the output of the review board — see [docs/BOARD.md](docs/BOARD.md)
for the mandates, how a round runs, and the rule that the product is finished
only when all five vote finished in the same round. Two rounds have run, both
0/5. Every code-reachable item from both is now closed.

---

## Now

_(nothing open that code can close — see Blocked, then call a third round)_

## Next

- [ ] **Reconvene the board for round three.** Round two's queue is empty of
      code-reachable work, and four of its five blocking reasons were fixed
      after the votes were cast. The fifth — no memory between nights — was
      closed by R105. A third round is the only thing that can move the verdict
      off 0/5. Owner: whoever runs it. See docs/BOARD.md for the shape.

- [ ] **The stacked row layout at 200% text.** R102 made the label gutter scale
      rather than clip, and deliberately left the crowding it exposed as an open
      question with a picture attached
      (`docs/screenshots/03b-lobby-200-percent.png`): at a 32px root the gutter
      is 116px of a 402px line, for a three-letter label. Stacking — label above
      content, both full width, the way the vote row reflows under R51 and R104
      — is probably right, and it changes every row in the app, so it wants its
      own evidence rather than being folded into a clipping fix.
      Files: `src/ui/components/Listing.tsx`, `Lobby.tsx`, plus a recapture.

- [ ] **Point `prod:read` at the real box once.** Nothing has ever verified that
      what is deployed matches this repository.
      Blocked on: the deployment address, which is not in this repo and which
      the obvious hostnames do not answer on.

## Blocked — needs a real household, not an agent

Real, and no amount of code closes them alone. They need the app used by people
who are not the maintainer, for more than one night.

- [ ] **Whether a household reaches for this on a Tuesday.** Every screen is
      driven end to end against a real Jellyfin library, two real phones play a
      whole night together (`npm run e2e:two`), and the deck no longer repeats
      itself week to week. Nobody outside the maintainer has used it for an
      evening, let alone ten.

- [ ] **Whether the room wants a "fine, let's just watch that one" control.**
      The fast swiper has no in-app way to end the wait; the room settles when
      everyone finishes or somebody leaves. Whether that is a missing feature or
      a healthy pause is a question only real use answers. If it is built: R63
      rejects a host role, so the gate must be member-symmetric, and R46 keeps
      peer progress a bare count, so the UI must show "2 of 3" and never who.

- [ ] **Whether the deck stays interesting at card 30 of 50.** A judgement that
      needs an evening, not a test.

- [ ] **The other half of the memory.** R105 records what the room landed on,
      which needs no account. Reading what people have actually *played* needs a
      Jellyfin user context — the app authenticates with a server API key — and
      a decision about whose viewing counts in a room mixing members and guests.
      That decision belongs to a household that has one.

## Done

Newest first. Every entry shipped with `npm run gate` green and is deployed;
ruling numbers are indexed in [docs/RULINGS.md](docs/RULINGS.md).

### Board round two — all twelve code-reachable items

- [x] **Memory between nights (R105).** The winner is recorded to
      `.cache/history.json`, and films landed on in the last 30 days step aside
      from the next deck — a preference, not a rule, so a small library still
      gets a night. Proved across two real sessions: night one landed on Toy
      Story 3, night two on Up.
- [x] **The deck card's picture at 200% text (R104).** `b025c49`. Vote buttons
      lay glyph, word and points out in a line once the button is wide, which is
      exactly when the row has reflowed to 2×2. Poster: ~53px → ~430px.
- [x] **Photograph the states the copy is about (R103), and the label gutter
      (R102).** `2f71cdf`. The knockout is shot after choices are made; a second
      room in Any Movie scope finally renders the download disclosure, which no
      capture had ever shown.
- [x] **A refused rejoin hands the phone back to the door (R101).** `97730f2`.
      Verified by dropping a real phone's network in the lobby.
- [x] **The reject confirm tells the truth (R100).** `180fd88`. `deckExhausted`
      travels in the room view, because a phone cannot work it out from what it
      knows.
- [x] **A slow request is no longer a second download (R99).** `29e0491`. The
      client waited 10s while the server's deadline was 15s, and nothing refused
      the retry that false error invited.
- [x] **A failed deck build has a way out (R98).** `6967d8a`.
- [x] **No film the whole room said no to (R97).** `d1d3a1a`.
- [x] **The vote row is legible, and a thumb target stopped scaling like type
      (R95, R96).** `c980928`. Settled by sampling shipped pixels;
      `npm run contrast` is now a command.
- [x] **The socket layer is executable by tests (R93).** `4b38dee`. Nothing
      imported `server/index.ts`, so the join gating, reconnect, disconnect and
      vote guards never ran under the gate — where three of this session's worst
      defects had been living, green.

### Board round one — all ten code-reachable items

- [x] **Ship the glass (R82).** `5088332`. The build emitted only
      `-webkit-backdrop-filter`, which Chrome does not support, so every frosted
      pane shipped flat on every Chrome while dev and Safari looked right. Gate
      G7 reads the built stylesheet now, and CI runs the full gate.
- [x] **The film is named at 200% text (R84), and the knockout photographed
      rather than its skeleton (R85).** `99ebb88`.
- [x] **A seat is proved, not asserted (R86).** `fc9491c`. Any room was
      enterable by anyone who could guess a four-character code and a counter.
- [x] **A knockout resolves when a phone drops (R87).** `4e30e17`.
- [x] **Contrast measured against the ground that is on screen (R89), and the
      sign-in capped (R88).** `e5debda`.
- [x] **A reload stopped misreporting the night (R90).** `94ea2f1`.
- [x] **No number the app has never had (R91), and every ruling indexed
      (R92).** `dbabcaa`. Gate G8.
- [x] **Focus, portals, and a capture harness that checks behaviour (R80, R81,
      R83).** `a4dfbc9`.
- [x] **Two real phones, one room (R94).** `3ea966c`, `3f2eabe`.
      `npm run e2e:two` — 20 checks across three rooms, including a stalemate
      that no longer happens and a lobby drop that recovers.

### Before the board

- [x] **2026-08-30 — Gate, health check, pins, inventory, version stamping.**
      `npm run gate`, `npm run prod:read`, `npm run inventory`, `GIT_SHA` →
      `/healthz` so parity is a fact, CI gating the image build. See
      OPERATING.md and docs/REDESIGN.md.
