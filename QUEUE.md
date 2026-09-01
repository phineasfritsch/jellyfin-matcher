# Work queue

In the repo, not in a session. Sessions die mid-task, limits hit, machines
sleep; whatever is not written down here is gone.

**Rules.** One owner per item. An item names the files it may write. Move an
item to Done only when `npm run gate` was green *after* it, run by something
that is not the agent that did the work. Blocked is a legitimate outcome and
should be written down, not worked around.

**Today's numbers:** 1152 test cases, 55 files, 190 pinned claims, all green.

This queue is the output of the review board — see [docs/BOARD.md](docs/BOARD.md)
for the mandates, how a round runs, and the rule that the product is finished
only when all five vote finished in the same round.

**Six rounds have run. Round six was 5/5: the product is finished at 1.0.**
Rounds one and two were 0/5, three was 0/5, four 1/5, five 4/5.

**That question is closed, and a harder one replaced it.** See
[docs/UPSTREAM.md](docs/UPSTREAM.md): would the Jellyfin project adopt this, and
would an acquirer find nothing in due diligence it would have to fix first?
Eleven objective gates, **none met**, and no mandate may vote yes while one is
open. Within hours of the 1.0 verdict, two things the board had not looked at
turned up — a ruling index missing 24 entries, and 49 of 97 test claims that did
not survive their own bug. The new bar exists because a board that *reads* a
product and a board that would have to *own* it ask different questions.

This paragraph used to say two rounds had run and that there was nothing open
that code could close. That was wrong through three further rounds which found
and shipped a dozen code-reachable defects, including a 15px touch target on the
only runtime control. The one line in this file that stayed correct was the
count of tests — because a script writes it and a gate checks it. Prose in a
maintained-looking file is the most expensive kind of stale, so if you are
reading this after another round, edit it.

---

## Now — release 1.1

The active plan is [docs/PLAN-1.1.md](docs/PLAN-1.1.md), which has an end
written into it: six conditions, a tag, a published image. This section is what
is left of it.

- [x] **Finish the string catalogue (F3).** Done, on the third attempt, and the
      two failures are the part worth keeping. Called finished once with the
      guide's prose left behind — R155 wrote down why (a sentence wrapping an
      element cannot be held without splitting it into fragments a translator
      cannot reorder) and R158 built the message type that fixed it. Called
      finished again with eight sentences still hardcoded, because completion
      had been checked by listing FILES and a string lives in a BRANCH (R159).
      The guard asks the source now, inline sentences included, with its two
      proper-noun exemptions listed rather than silently skipped.

- [x] **Settle the trailer captions (B3).** Decided, not deferred: **`FAIL
      (stated)`**. The app suppresses nothing — no `cc_load_policy=0`, controls
      intact — and supplies nothing, since the video id is MDBList's `trailer`
      field. So 1.2.2 is met per film and the app cannot see which; 1.2.3 and
      1.2.5 are not met and will not be. The finding that was not previously
      written down is the cost of the privacy choice: `youtube-nocookie.com` is
      a different origin, so no stored caption preference reaches the frame and
      captions are off on every trailer, every time.

- [ ] **WRITE the browser proof for F1, then run it.** Not "run the harness" --
      there is no restart in `scripts/e2e-two-phones.ts` and there never was
      (R180). It drives four rooms and attaches to a server somebody else
      started, so it cannot kill one. A new harness has to own the process.
      What it must show beyond the unit test: socket.io reconnecting by itself,
      the seat secret surviving in phone storage across the gap, each deck
      resuming at its own position, and the "hold on" message clearing rather
      than outliving the restart (R150).

- [ ] **~~Prove F1 in a browser.~~** `server/__tests__/restart.test.ts` drives the
      real handlers through a snapshot, a fresh store and a rejoin, which is the
      whole server-side path. The plan's condition says "both phones carry on",
      and only `npm run e2e:two` can show that. Needs a machine with a live
      Jellyfin; it is the one condition a session cannot close on its own.

- [ ] **Re-shoot 10, 11 and 12.** Unchanged and still needs an environment: the
      harness jumps the whole wide-scope branch when `MATCHER_AUTH` makes Any
      Movie need an account. Run with `MATCHER_AUTH=off`. Nothing false ships —
      the README embeds only 04, 05 and 08.

- [ ] **Run the parental-control probe (U3's first step).**
      `JELLYFIN_URL=... JELLYFIN_API_KEY=... PROBE_USER=... PROBE_PASS=... npm run probe:userscope`

      docs/TRUST.md says this confirmation comes before U3 is designed, and said
      it was filed here. It was not (R182), so for some time the most serious
      item in the trust model was waiting on a step nobody could run.

      It is read-only and takes a minute: count movies with the server key,
      count them again as a user with a parental limit, print both. Set the
      limit by hand in Jellyfin first — a script that configures the thing it is
      testing proves less than one that does not. Fewer for the user confirms
      the hypothesis; equal counts refute it on that server and the trust
      argument then rests on over-privilege alone.

- [ ] **Close U5 by running the parity check once.**
      `MATCHER_URL=https://your-tunnel npm run prod:read`

      The tool has existed all along: it reads `/healthz`, compares the deployed
      `version` against this checkout, and says whether they agree. The gate was
      recorded as "blocked on an address" while a server has been running behind
      a tunnel with auto-deploy pointed at it (R183).

      Worth doing right after a push, when the two SHOULD agree — a parity check
      that has only ever been run when it passes proves less than one run at a
      moment it might not. If it disagrees, that is auto-deploy deferring or
      failing, and the answer is in `docker compose logs` on the host.

- [ ] **Tag `v1.1.0`.** There has been nothing pinnable since `v0.9.0`, which is
      now far behind. A compose file can only name `:latest`, which is not a
      version and cannot be rolled back to.

## Recently closed

Kept short deliberately; the argument for each is in `docs/RULINGS.md`.

- **F1, rooms survive a restart (R149, R150).** Snapshot to `.cache`, seat
  secrets included and written 0600, everybody back disconnected until they say
  otherwise, nothing restored past the idle TTL. Writing the first `useRoom`
  test found R101's fix had been applied to the reconnect path and never to the
  mount path.
- **F2 declined, 5 of 5 (R152).** A focus group answered a question that had
  been open for weeks. Any card everyone liked already ends the room, so a
  mid-deck "leader" is the app's own top pick wearing the room's clothes.
- **The deck named the people it was waiting for (R151), and now no waiting
  state on any screen does (R153).** Found by a persona asked what he stares at
  while the evening stalls, not by the audit that was looking for it.
- **Auto-deploy (R147, R148).** Polls, refuses while a room is live, and does
  not hold the Docker socket. An adversarial review found the first version
  never deployed at all. Publish rights moved off the gate job.
- **Six WCAG criteria (R133–R137, R139).** Orientation, the slider's announced
  value, label-in-name, the invisible input ring, status messages, reflow at
  320px — where the vote buttons were 116px below a screen that could not
  scroll — and a guest being asked their name twice.

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

### Board rounds three to six — every code-reachable item

Round three closed the false approval gate (R107), the unknowable download size
(R91), and the silence about whether the household was being remembered at all.
Round four closed the sign-in that destroyed the seat it was signing in for
(R111) and the stale disconnect that evicted a member sitting right there
(R112), and gave the request confirms focus with a name (R113). Round five
closed the 15px slider (R118) — a 44px box with a 28px thumb, on the one control
that made the README's "nothing you tap is under 44px" false — joined
`CHANGELOG.md` to the synced counts (R119), and unstuck a confirmation panel
that touched its own buttons at zero pixels.

Between and after them the gate learned to execute the client: R115 the winner,
R116 the controls, R117 the screen chooser, R121 the socket, R122 the knockout,
R123 the deck, R124 the lobby — and, in the same ruling, the rulings index
itself, which had been silently missing R100 onward because its citation regex
was two digits wide and the gate that guards it looks through that same regex.

Round six voted 5/5 finished. The three claims that went to verification all
survived and all were filed by their own authors as non-blocking.

### After the verdict

- **R125** — the details sheet rendered, the last component with no test, plus
  the measurement that matters more than the tests: restoring the exact pre-R83
  effect leaves all seventeen green, because jsdom self-corrects the focus order
  a real browser does not. The file says what it actually guards and does not
  claim R83.
- **R126** — the runtime row's title moved onto the shared type scale.
- **R127** — vitest was counting agent worktrees. `.claude/worktrees/` holds a
  full checkout per agent, so a run of one file reported 9 files and 82 cases
  while a workflow was live. `.claude/` is gitignored, so nothing reached a
  commit — but G4 enforces these counts as floors and `sync-counts` writes them
  into four tracked documents, which is the whole argument of this repository
  pointed at its own foot. Now excluded.
- **The two documentation lines** that described something other than what
  ships: the changelog recommending the bind mount the README warns about, and
  the winner screen's alt text saying "beside" where the buttons stack. The
  packaging test now covers every doc that gives cache advice.

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
