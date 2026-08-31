# Work queue

In the repo, not in a session. Sessions die mid-task, limits hit, machines
sleep; whatever is not written down here is gone.

**Rules.** One owner per item. An item names the files it may write. Move an
item to Done only when `npm run gate` was green *after* it, run by something
that is not the agent that did the work. Blocked is a legitimate outcome and
should be written down, not worked around.

**Today's numbers:** 597 test cases, 37 files, 190 pinned claims, all green.

This queue is the output of the review board — see [docs/BOARD.md](docs/BOARD.md)
for the mandates, how a round runs, and the rule that the product is finished
only when all five vote finished in the same round.

**Six rounds have run. Round six was 5/5: the product is finished at 1.0.**
Rounds one and two were 0/5, three was 0/5, four 1/5, five 4/5. Every
code-reachable item from all six is closed. What is left below is post-1.0
housekeeping and four things only a real household can answer.

This paragraph used to say two rounds had run and that there was nothing open
that code could close. That was wrong through three further rounds which found
and shipped a dozen code-reachable defects, including a 15px touch target on the
only runtime control. The one line in this file that stayed correct was the
count of tests — because a script writes it and a gate checks it. Prose in a
maintained-looking file is the most expensive kind of stale, so if you are
reading this after another round, edit it.

---

## Now — post-1.0 housekeeping

None of this reopens the verdict. Round six's chair filed it while verifying,
and every mandate agreed none of it names a defect a household would meet.

- [ ] **Re-shoot 10, 11 and 12.** The request branch is three capture runs
      behind its own fix. `WinnerScreen.tsx` has had `gap-2` since `4aaadd7`,
      but `12-request-confirm.png` was last written in `13cbc7d` and still shows
      zero device pixels between the cost panel's ring and the "Yes, ask" fill.
      The harness jumps the whole wide-scope branch when `MATCHER_AUTH` makes
      Any Movie need an account, so two later runs skipped it too. Nothing false
      ships — the README embeds only 04, 05 and 08 — so this waits for an
      environment. Run with `MATCHER_AUTH=off`, per the note already in the
      harness. Files: via `scripts/screenshots.ts`.

This is the only item left here. It is the one that needs a machine, not a
decision.

## Next

- [ ] **Nothing. Every component now renders under the gate** — R115 to R125
      closed the last of them with the details sheet. What R125 found on the way
      out is the thing to remember: restoring the exact pre-R83 effect leaves all
      seventeen of its tests green, because jsdom self-corrects the focus order
      that a real browser does not. A rendering test and a browser test are not
      substitutes. `scripts/screenshots.ts` is still the only thing guarding
      R83, and the only thing that ever found it.

- [ ] **The stacked row layout at 200% text.** R102 made the label gutter scale
      rather than clip, and deliberately left the crowding it exposed as an open
      question with a picture attached
      (`docs/screenshots/03c-lobby-200-percent-settings.png`, which R120 shot
      for exactly these rows): at a 32px root the gutter
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
