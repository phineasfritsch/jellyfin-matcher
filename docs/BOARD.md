# The board

This project's rule is that durable work lives in the repo and not in a session
([QUEUE.md](../QUEUE.md), [OPERATING.md](../OPERATING.md)). The review board had
been breaking that rule: it existed only inside chat transcripts. This file is
the fix. A fresh session with no memory of any previous round can reconvene the
identical board from what is written here.

The board does not do the work. It decides whether the work is finished, and
what the next work is. [QUEUE.md](../QUEUE.md) remains the place work is owned
and tracked; a board round produces items for it, it does not replace it.

---

## The standing rule

**The product is finished only when all five mandates vote finished in the same
round.** One "not finished" ends the question for that round; the work
continues. There is no chair's override, no majority, and no partial
sign-off. A mandate that votes not-finished must give a single blocking
reason naming a file, a line, or a screenshot.

A round that ends in five "finished" votes is the only thing that ends the
work.

---

## The five mandates

Each is a standing brief. Convene one member per mandate, give them the brief
verbatim, and let them read whatever they need. They vote independently; they
do not see each other's votes before voting.

### 1. Product

> Whether a household reaches for this on a Tuesday night instead of arguing in
> front of the TV, across the whole arc (getting in, first thirty seconds,
> card 30 of 50, the winner screen) and across the second night and the tenth.

### 2. Growth

> Would a stranger with a Jellyfin server and ten minutes star this repo and
> then actually deploy it?

### 3. Engineering

> Correctness, failure modes, the socket protocol, mid-session drop-off,
> upstream timeouts, rate limiters, cache behaviour, and whether the suite tests
> behaviour or decoration.

### 4. Design Director

> Whether this reads as one deliberate object: hierarchy, spacing rhythm, type
> scale, colour discipline, dead space, whether the glass is a material, and
> whether 200% text is dignified.

### 5. Access and Honesty

> Screen reader, 200% OS text, tremor, dark room; focus, live regions, target
> size, contrast, irreversibility; and whether the interface and README tell the
> truth about consequences, especially that a yes can cause a download.

---

## How a round runs

**1. Recapture the evidence first.** `npm run shots` against a live library, so
the nine screenshots in `docs/screenshots/` show what the current build actually
renders. Then check `git status --short docs/screenshots/` and open at least two
of the PNGs before the round starts. This is not ceremony: R82 was a bug where
the built stylesheet dropped `backdrop-filter` entirely, so every prior design
sign-off had been given against a build that was not rendering its own material;
and a later capture run produced nine unstyled, CSS-less PNGs that two members
measured before anyone noticed. **Screenshots are the primary evidence for
anything visual, and stale or broken screenshots have twice invalidated a
round.**

**2. Each mandate judges independently.** Minimum reading: the nine screenshots,
`README.md`, `OPERATING.md`, `CLAUDE.md`, `QUEUE.md`, `CHANGELOG.md`,
`docs/DIRECTION.md`, `docs/REDESIGN.md`, and the code under `app/`, `src/`,
`server/`, `scripts/`. Each returns a verdict, a `productFinished` boolean, up
to five concrete claims with evidence and a scoped proposal, and — if not
finished — one blocking reason.

**3. Every concrete claim goes to an adversarial verifier.** The verifier has
repo access and one job: refute the claim. It returns `refuted: true/false`, its
reasoning, and where the claim survives but is overstated, a `correctedClaim`.
This is not optional and it is not a formality — earlier rounds produced
confident claims that were false on inspection (one member reported a container
registry was private when an anonymous pull returned 200; another asserted a
README install block left the server running unconfigured when it in fact
crashes at start). A claim nobody can point at a file, a line, or a screenshot
for is worth nothing.

**4. The chair merges and ranks.** Only surviving claims. A struck claim does
not come back because it sounded good. Where a `correctedClaim` exists, the
corrected version is what enters the queue — not the original. Duplicates raised
by several mandates merge into one item crediting all of them. Ranking is by
value per unit of effort, never by who asked. Anything that genuinely needs a
real household, real users, or weeks of real use is marked as not reachable by
code alone, so the next session does not waste itself pretending otherwise.

**5. Append the round to this file.** Votes, blocking reasons, the ranked queue,
the date.

### Constraints on what a member may recommend

- The gate is `npm run gate`. Counts in `gates.json` are floors; work that adds
  tests raises them in the same commit.
- Pins go in **before** the work they protect, never after, and a pin is never
  weakened to something a blank page would pass.
- `pins.test.ts` is a substring scan over comment-stripped source. It cannot
  assert layout, geometry, or contrast. Proposing a pin that measures something
  is proposing a thing that cannot be built — use a real test, or a photograph.
- Pushing `main` deploys. There is no separate deploy step.
- Never run two `npm run e2e` at once: it binds port 3000 and can fire a real
  Jellyseerr request that lands in Radarr as an actual download.
- Board members do not run the gate, do not run e2e, and do not write files.
- A smaller honest result beats a larger claimed one. Reporting a blocker is a
  success.

---

## Round 1 — 2026-08-31

Convened immediately after R82: Lightning CSS had been dropping the standard
`backdrop-filter` property from the built stylesheet and emitting only
`-webkit-backdrop-filter`, so every frosted pane rendered flat in Chrome. All
prior design sign-off had been given against a build that was not rendering its
own material. The nine screenshots were recaptured after the fix.

**Result: 0 of 5 finished.**

| Mandate | Vote | Blocking reason |
| --- | --- | --- |
| Product | not finished | At 200% text the film's name is absent from both the card being voted on and the winner screen — the two screens the whole product exists to deliver. |
| Growth | not finished | The README hero row ships `docs/screenshots/04-knockout.png`, which is the eight-row loading skeleton from `Knockout.tsx:76-83`, not the genre list its alt text at `README.md:20` promises. |
| Engineering | not finished | `server/index.ts` — the 647-line socket layer that no test executes — contains an identity takeover on `room:join` that defeats the documented `MATCHER_AUTH=all` mitigation, and a disconnect handler that only recovers rooms in `SWIPING`, so a phone closing during the knockout produces exactly the permanent stalemate the product's headline promise denies. |
| Design Director | not finished | At 200% text the deck card and the winner screen both drop the film's title off the screen entirely (06 and 09), so the app fails its own stated accessibility promise on the only two captures that test it. |
| Access and Honesty | not finished | The app loses its own primary content at the text size it advertises support for; separately the row divider measures 2.81:1 where it renders against a pinned 3.44:1, and R33's size disclosure is not implemented while three files claim it is. |

### What the board agreed was already good

The arc from join to winner at 100% is genuinely good — one field and two
buttons on home, a four-letter room code, the deck card as the best screen in
the app, and a winner screen that ends the argument with a poster, "Everyone
said yes." and a real Play button beside a real escape hatch. The pure layers
(`settlement.ts`, `transitions.ts`, `knockout.ts`, `validate.ts`, `limits.ts`,
`roomView.ts`) are small, honestly commented, and driven by tests that run real
state rather than re-implement it. `deadline.ts` caps every upstream but one.
The README's one-line hook and its honesty about the public-hostname auth risk
are above average for a self-hosted project. The two-tap confirm on the one
irreversible control, the abstain rows, the per-socket redaction and the sr-only
card announcement are real accessibility work, not decoration.

### The ranked queue from this round

1. Stop the winner card shrinking so the winner is named at 200% text — Product, Design, Access. `WinnerScreen.tsx:63`.
2. Remove the nested scroller in the swipe card and write the R21 test the docs already asked for — Product, Design, Access. `SwipeCard.tsx:159`.
3. Photograph the knockout screen instead of its skeleton, and fix the README row it feeds — Product, Growth, Design, Access. `scripts/screenshots.ts:205`, `README.md:20`.
4. Let a knockout resolve when a phone drops — Engineering. `transitions.ts:69,82`, `index.ts:589`.
5. Bind a reconnect secret to the member so `room:join` cannot be impersonated — Engineering. `index.ts:401`, `store.ts:142`.
6. Recompute `--color-border` against the surface it is actually drawn on — Access. `globals.css`, pin T05.
7. Put the winner's facts on the room so a reload does not misreport the night — Engineering.
8. Give the Jellyfin login fetch a deadline — Engineering. `auth.ts:89`.
9. Settle what the download disclosure says, then make copy, comments, pin and rulings agree — Access. R33 vs R36, and the undefined R39-R79.
10. Give the app some memory of the household between nights — Product. Not reachable by code alone.
11. Give the room a way to say "fine, let's just watch that one" — Product. Not reachable by code alone.
12. Make the socket layer executable by tests — Engineering. Large.

Below the line, surviving but not queued: a noise layer for `body::before` (the
blur really is a no-op over a smooth gradient, but `saturate(165%)` in the same
declaration is not, and the proposed tile breaks the stated two-layer budget); a
motion asset for the README (the capture script drives only one browser page, so
this is new tooling, and promoting `08-winner.png` above the fold gets most of
the value for nothing); and the home/join dead-space finding (four staggered
left edges, 55% and 64% ground — real, but `app/page.tsx:7-11` rules out half
the proposed remedy).

Struck in verification: the README `.env` claim. `package.json:9` runs
`tsx --env-file=.env`, which throws on a missing file, so the bare-metal path
crashes loudly at start rather than coming up unconfigured. The README line is
still worth adding; the finding as stated was wrong.

### Standing documentation debt this round surfaced

`R39`-`R55`, `R63`, `R64`, `R71`, `R79` and `R42` are cited in code comments and
in pin `T01`/`T63` but are defined in neither `docs/DIRECTION.md` (which holds
R01-R38, R58, R59, R80-R82) nor `docs/REDESIGN.md`, while `CLAUDE.md:25` tells
readers R19-R55 live in DIRECTION.md. A reviewer chasing a cited ruling is sent
to a document that does not contain it. `R41`'s 3:1 divider requirement and
`R33`'s size disclosure exist only as prose that contradicts `R36`. This is
queue item 9 and it should not be allowed to grow.

## Round 2 — 2026-08-31

Convened after every code-reachable item from round 1 shipped: R82-R93, twelve
commits, `5088332..d9dc9f8`. The gate is now eight checks — 415 test cases in 27
files, 150 pinned claims — and the nine screenshots were recaptured against a
live Jellyfin after all of it. Each mandate confirmed its own round-1 blocking
reason closed before looking for a new one.

**Result: 0 of 5 finished.**

| Mandate | Vote | Blocking reason |
| --- | --- | --- |
| Product | not finished | `settlement.ts:75` filters standing cards only by `room.rejected` and `match.ts:50-68` ranks with no sign check, so a film every connected member voted No on can be declared the winner and captioned "Nobody agreed outright, so the points decided." (`WinnerScreen.tsx:123-124`). |
| Growth | not finished | The three-image hero row leads with `04-knockout.png`, the genre screen before anyone has touched it — every row `—`, a disabled 50%-opacity "Lock in 0" — then names the same film in the alt text of both of the next two images. |
| Engineering | not finished | Every deck-build failure is classified unrecoverable at the only place it is classified (`index.ts:362` passes `room.deck.length`, which `beginDeckBuild` guarantees is 0, into `diagnose.ts:48`'s `recoverable: deckSize > 0`) and `useRoom.ts` never clears the diagnosis, so `RoomClient.tsx:46` hides the KNOCKOUT the server just restored behind a panel with no control — the exact stranding `deckBuildFailed` exists to prevent. |
| Design Director | not finished | `06-deck-200-percent.png`: at 200% text the deck card gives the film ~53 CSS px of poster, punches a 96 CSS px blank disc through it whose glyph and 70% of whose body are clipped away, and pays ~357 CSS px — 41% of the viewport — to the vote row. |
| Access and Honesty | not finished | Measured off `05-deck.png`, three of four vote point weights render below 4.5:1 (`-5` 2.82:1, `+2` 3.28:1, `+3` 3.54:1) because of `opacity-70` at `VoteRow.tsx:71` — on the screen a person uses fifty times a night in a dark room. |

**Every one of those five blocking reasons has since been closed** — R95 through
R105, in the commits between `c980928` and `d3ec21a`. The votes above were cast
against the state before those fixes existed; they are the record of what the
board found, not of what the product is now.

### What changed since round 1

All twelve round-1 items that were reachable by code are closed, and every
mandate verified its own rather than taking the summary on trust. R84 named the
film at 200% on both screens; R85 replaced the skeleton in the README's lead
image with the real knockout; R86 made a seat something a phone proves rather
than asserts; R87 stopped a dropped phone stranding a knockout; R88 capped the
sign-in; R89 recomputed `--color-border` against the ground it is drawn on; R90
stopped a reload misreporting the night; R91 stopped three code sites promising
a download size the app has no data for; R92 indexed 39 undefined rulings; R93
put the socket layer behind a seam that 26 tests execute. R82's fix is guarded
by G7 grepping the *built* stylesheet, and CI moved off `--fast` so G7 runs.

Two round-1 complaints were withdrawn on evidence. The glass is a real material
now — sampling `03-lobby` at x=12 against x=60 shows the gel lifting `#0b1012`
to `#182124`, a ~3x luminance step — though `blur(18px)` is still identity
because nothing structured is ever painted behind a `.gel`; that is a cost
question, not a look question, and no member asked for it. And the R93
extraction was diffed body by body against the deleted handlers and found
faithful, with three unmentioned improvements; the one inversion, that `wrap`
now fires the ack after the broadcast, could not be shown to do harm today.

One commit landed after the votes were cast and before this ranking: `3ea966c`,
which added R94 and `npm run e2e:two` — two Chrome pages in two browser
contexts through a whole night, fourteen assertions, verified by breaking it.
It shrinks one below-the-line item and adds an eleventh unrecorded entry to
queue item 7.

### The ranked queue from this round

1. Lift the vote weights off the floor of readable contrast — Access. `VoteRow.tsx:71`. critical/small.
2. Stop the details button eating the poster at 200% text — Design. `SwipeCard.tsx:112-122`; the tappable region is ~88x29 CSS px. critical/small.
3. Make the one control that spends the host's disk honest, idempotent and visible — Engineering. `socket.ts:65` vs `deadline.ts:15`, `index.ts:442-463`, and the dead `winner:requested` emit at `:459`. critical/medium.
4. Give a failed deck build a way out that is not "reload every phone" — Engineering. `index.ts:362`, `diagnose.ts:48`, `useRoom.ts:44`, `RoomClient.tsx:46`. critical/medium.
5. Photograph the download disclosure — Access. `screenshots.ts:94`, `store.ts:74`. The copy R91 rewrote has never been seen rendered, and no test renders it either. critical/medium.
6. Refuse to declare a film the whole room said no to — Product. `settlement.ts:71-77`. critical in effect, high as ranked; ~4 lines. high/small.
7. Move the ten shipped items in QUEUE.md to Done — Engineering. `QUEUE.md`. high/small.
8. Reshoot the hero row so it shows a choice being made, and two different films — Growth. `screenshots.ts:234,:386`, `README.md:18-20`. high/small.
9. Tell the truth on the reject confirm — Product. `WinnerScreen.tsx:172,:197`; branch on deck exhaustion, not `viaFallback`. high/small.
10. Stop a lobby drop stranding the phone on a room it will never hear from again — Engineering. `useRoom.ts:71-88`, `RoomClient.tsx:27`. high/small.
11. Make the label gutter scale, and photograph a row screen at 200% — Design. `Listing.tsx:131`, `Lobby.tsx:123,:163`. high/small.
12. Give the deck card back its picture and its whole title at 200% — Design, Access. `VoteRow.tsx:55-74`, `SwipeCard.tsx:175`. Land the vote-row height first; the title fix is unsafe without the space. high/medium.

Six of the twelve end in `npm run shots` against a live library. Batch the
harness edits and re-capture once, then check `git status --short
docs/screenshots/` before the next round measures anything.

### Below the line, surviving but not queued

The nameless busy state and dropped focus on the winner-request confirm
(`WinnerScreen.tsx:262`, `:236-245`); three documentation promises the code does
not keep, mergeable into one commit (`README.md:40` "Every control is a 60px
row", the unstated movies-only library scope, and `docker-compose.yml:3-4`
instructing the opposite of the line beneath it); the lobby's named roster below
the fold — cut down in verification, since the live counts are above it and the
screen leads with a person, not configuration; the deck card's blue-black
`--gel-solid` in a green-black palette; captures from the new two-phone drive;
a `room:again` handler — also cut down, since `winner:reject` already yields a
second film the same evening, and the carry-forward it wants is the blocked
household item; and seeding the name field from the last name used, which needs
its own clear because `clearAuth` has no call sites.

### Struck in verification

Product's "the app has no memory of the household between nights". The gap is
real but the claim restated `QUEUE.md:56` almost verbatim while dropping that
entry's own two corrections, and its headline — that last night's winner is card
1 tonight — does not follow, since winners come from an instant match on any
voted card or the points fallback, never from `deck[0]`. Its proposed write
point is also wrong: writing at `declare()` would record films the room then
rejected under R63. The item stays in Blocked, where it belongs.

### Not reachable by code alone

Nothing in the twelve items above needs a real household. The two that do are
already in `QUEUE.md`'s Blocked section and stay there: memory of the household
between nights, and a way for the room to say "fine, let's just watch that one".
