# Frozen Design Direction — Matcher

**One Poster, One Tap**
Status: frozen. Supersedes all sixteen bracket entries. Rulings R19–R38 are additive to R01–R18 in `docs/REDESIGN.md` and are cited the same way.

---

## The direction, in one paragraph

Rooms are slow because the card hands you a comparison problem — a 7.4, a Letterboxd number, a runtime — at the exact instant it wants a gut reaction. So the card carries a poster, a title, and the one fact that changes what a vote costs, and every other fact is one deliberate tap away in a sheet you can vote from without losing your place. Everything else in this document follows from that sentence: the metadata strip comes off the card and pays for a taller, worded vote row; the sheet becomes the most-used surface in the app, so it opens with zero network and casts votes itself; the single surviving chip on the card says *Not on your server*, because that is the only fact that turns a Like into a real download; and nothing that was removed from the face is removed from the app — it is spoken, printed in the sheet, or both.

---

## Screen by screen

### 1. SwipeDeck — the vertical budget

The whole layout is derived from 360×640 usable. Fixed, no-scroll:

| Band | Height |
|---|---|
| top safe / pad | 12 |
| status strip | 24 |
| gap | 8 |
| card | 490 |
| gap | 8 |
| vote row | 82 |
| bottom safe / pad | 16 |
| **total** | **640** |

The card column is `max-w-md` minus `px-4`, which is 328px at a 360 viewport. A 2:3 poster at 328 wide is 492 tall, so the full-bleed card is a poster with about two pixels of crop — the card *is* the artwork, not a frame around it.

Replace `style={{ minHeight: '55dvh' }}` on the stack with `flex-1 min-h-[420px]` so the card absorbs slack on taller phones and the vote row is never pushed off. Card stack and vote row are siblings under `overflow-hidden`. Poster prefetch (`PREFETCH_AHEAD = 8`) stays exactly as it is.

### 2. SwipeDeck — the card face (`SwipeCard.tsx`, the core cut)

Delete the entire meta block below the poster: the composite badge, the `year · runtime · In library` line, the `Letterboxd / IMDb / RT` line. The poster becomes full-bleed `object-cover` across the whole 328×490 card (`rounded-2xl overflow-hidden`, no border strip). The `alt={\`${card.title} poster\`}` stays — pin A18 is not negotiable and the poster is now the entire card.

The title moves onto the poster: a bottom scrim (`bg-gradient-to-t from-black/95 via-black/70 to-transparent`, 96px, `pointer-events-none` on the gradient itself), an `<h2>` at 20px/700 with `line-clamp-2` and a 16px inset, and a 44×44 info button (ⓘ) flush right in the same row. No-poster fallback: the existing centred-title panel on `bg-primary`, unchanged.

One chip, top-left, and only when `room.settings.scope === 'wide' && card.jellyfinItemId == null`: **Not on your server**, `border-super text-super bg-black/60`, 12px semibold, 28px tall. The `Both genres` hybrid badge is cut from the card and reappears in the sheet as the line `Tagged both genres`.

Two routes into the sheet, both real buttons: the ⓘ, and the whole card face wrapped as `<button type="button" aria-label={\`Details for ${card.title} — ratings, synopsis, trailer\`}>`. Keep that literal opening fragment; pin A22 matches on it. Drop the `onPointerDownCapture` stopPropagation from the face so the whole card stays draggable, and separate tap from drag by hand (R23).

### 3. SwipeDeck — status strip, vote row, keyboard

The three-row header collapses to one 24px row: locked genres left at 11px uppercase tracking-widest, `7/30` right, tabular. Beneath it a 3px rail keeping `role="progressbar"` and `aria-label="Deck progress"` (A03/A04) with your own fill in `bg-secondary`. The peer text line is replaced by 6px dots absolutely positioned on that same rail at `left: peerIndex / deckLength * 100%`, `bg-muted-fg` with a 1px `ring-background` so overlaps stay countable, and an `sr-only` list carrying the identical text.

VoteRow keeps its structure and both pinned hooks (`aria-label="Vote"`, `aria-label={label}`) verbatim. Buttons grow 56 → 64px and gain an 11px uppercase word under each icon — NOPE / MAYBE / LIKE / SUPER — in the button's own colour. 4×64 + 3×12 = 292 in a 328 column; row height 64 + 4 + 14 = 82. The row stays outside `AnimatePresence`, so a pressed button keeps DOM identity and focus across the card change.

New: a window `keydown` handler, no-op while the sheet is open or focus is in an input — ArrowLeft → DISLIKE, ArrowUp → MAYBE, ArrowRight → LIKE, ArrowDown or `s` → SUPER, `i` or Enter on the focused card → details, Escape → close. New: one `aria-live="polite"` `sr-only` region that emits, on top-card change, `Card 7 of 30. Blade Runner, 1982, 117 minutes, not on your server.` and, on every vote, `Liked Blade Runner.`

### 4. MovieDetails — becomes load-bearing

Three changes, no cosmetic ones.

1. A sticky `VoteRow` pinned to the sheet's bottom edge above the safe-area inset. A vote cast there casts *and* closes, in one action.
2. The YouTube iframe stops auto-mounting. A 56px **Play trailer** button swaps it in on tap. `description`, `allRatings`, `scores` and `genres` already ship in the deck payload, so the sheet opens with zero network — which matters on a LAN with no WAN, where the current auto-embed is a dead grey rectangle.
3. Focus is trapped while the sheet is open and returned, on close by any route (Escape, backdrop, close button, or a vote), to the control that opened it.

Header gains one line: `Tagged both genres` when `card.isHybrid`. `No ratings found for this one.` (C05) and the `role="dialog"` / `aria-modal` / `aria-label="Close details"` hooks (A10–A12) are untouched.

### 5. Lobby

One new line, 12px, under the deck-size radio group: **Best-rated first — the deck is already ranked, so the top of the stack is the good stuff.** This is literally true (`src/lib/deck.ts` puts hybrids first, then sorts composite-descending inside each tier), and it is how ranking gets communicated now that no card prints a score.

The two scope cards keep `On the server now` and `Winner gets requested` exactly as written (C03/C02). The runtime slider, deck-size radiogroup, member list and their pinned labels (A08, A09, A15, A17, A21) are unchanged. The only structural change: `I'm ready` becomes sticky to the bottom of the viewport rather than the end of the scroll.

### 6. Knockout

Structural parity only. Genre chips go to 56px min-height in a 2-column grid so the thumb meets the same reach zone and touch scale as the vote row. `aria-label="Genres"`, `aria-label="Surviving genres"` and `aria-pressed={on}` (A05–A07) are untouched. The `Waiting` component gains `role="status"` so "Picks locked in — waiting on Ferb" reaches someone who is not looking at the spinner. No new ideas land here.

### 7. WinnerScreen

The argument is over and nobody is waiting on you, so this is the one screen where the numbers get full display: poster, title, and the `year · runtime · Score` line stay as they are, as does the `Final ranking` list (A16) and `Play in Jellyfin`.

In wide scope, above the Jellyseerr button: **This downloads to your server — about {runtime} min of video.** in `text-super`, wired as the button's `aria-describedby`. The request itself becomes a two-tap confirm: the first tap swaps the button for an inline `Request {title}?  [Yes, download]  [Cancel]` row. `No winner could be determined.` (C06) stays.

### 8. Home and AuthGate

Untouched apart from inheriting the ≥56px primary-control scale. AuthGate keeps `Sign in with your Jellyfin account` and `Sign in to search any movie` (C04/C01) and stays capability-gated, so a guest still lands in JoinGate with a name field and swipes without an account. Every optional gate keeps passing `onCancel`.

---

## What was grafted in from the losers

**B's huge drag verdict — accepted, whole.** Past ~40px of travel: the word NOPE / MAYBE / LIKE at 34px/900 dead centre, plus a 12% full-card wash in that vote's colour. Two channels, never colour alone. The winner did all its work on the tap path and left the tiny rotated corner badges alone; but the one-thumb path *is* the drag, and at arm's length a 24px badge in the corner is not a verdict. Taken with its reduced-motion behaviour: snap at threshold rather than track the finger.

**B's MovieDetails focus handling — accepted, whole.** A real focus trap while the sheet is open, focus returned to the opener on close. This direction makes the sheet the most-repeated interaction in the app; one unspecified focus transition becomes thirty focus losses per deck, which would undo the vote row's otherwise excellent focus discipline.

**B's confirmation step on "Request via Jellyseerr" — accepted in substance, rejected in mechanism.** See below.

**The sticky VoteRow inside the sheet and the deferred trailer iframe** were already this direction's own and are now frozen as R30 and R29 rather than absorbed.

## What was rejected, and why

- **The 800ms press-and-hold on the request button.** The disclosure argument is right and is taken (R36); the timed press is not. A hold communicates its own progress by animation, which is exactly what R18/C8 forbid; it is a gesture with no button, which is what R06 forbids; and it is hostile to a shaky hand and invisible to a screen reader. The confirmation survives as a two-tap inline row that is identical for touch, keyboard and switch users (R37). Nobody loses a confirmation step; everybody gets the same one.
- **Printing the composite score on the card face.** This is the single thing the direction removes, and it is also the direction's named retreat if the bet fails — it cannot be both at once and shipped on day one. Held in reserve, one number in the title row and nothing else.
- **Live peer voting tension (Match Point Live's contribution).** "Ferb is two cards behind you" and "three of four liked this" make you read someone else's screen state, which priority 2 exists to prevent. Peer presence survives as dots that say *the room is alive* and nothing else (R24).
- **A per-card reason line or blurb (Every Card Argues, Programme Notes).** It re-fills the face that R19 just cleared, and it costs a read at the precise moment the card wants a reaction. It belongs in the sheet, where it already is.
- **A TV / second-screen stage (Stage and Controller).** Two surfaces to keep in sync, a second device to set up, and a room where one person's screen is the source of truth. C5, C6, and priority 2.
- **Deck reordering driven by other people's votes (Hot Deck's live re-rank).** Your position in the deck stops being your own, `progress[userId]` stops meaning what it means, and R03 breaks.
- **Swipe-down for super-like.** Down-drag collides with pull-to-refresh in mobile browsers, and the highest-weight vote should cost a deliberate act (R27).

---

## Rulings

**SwipeDeck and the card**

- **R19** The card face carries exactly three things: the poster, the title on its scrim, and at most one chip. A fourth element on the face is a change of direction, not a tweak, and must cite the retreat named in "The bet" below.
- **R20** There is one chip and it means one thing: `Not on your server`, rendered only when scope is `wide` and `jellyfinItemId == null`. In `local` scope no chip renders on any card, because everything is on the server and a chip that is always true is noise.
- **R21** SwipeDeck is physically incapable of scrolling. The card stack and the vote row are siblings under `overflow-hidden`, the stack is `flex-1 min-h-[420px]`, and no descendant of the deck sets `overflow-y-auto`. The 640px budget table above is the authority when something no longer fits.
- **R22** Nothing is deleted from the card, only relocated. Every fact the face stops printing appears in two places: the details sheet, and the deck's polite live region, which announces `Card N of M. Title, year, runtime, [not on your server].` on each new top card and `Liked {title}.` on each vote. That announcement is also the non-animation confirmation C8 requires.
- **R23** Tap and drag are separated by hand, not by the animation library: on `pointerup`, open details only if `Math.hypot(dx, dy) < 8 && Date.now() - t < 500`. Only the active card is interactive; depth 1 and 2 are `aria-hidden` and `pointer-events-none`.
- **R24** Peer progress is a position, never a number you can compare yourself against. Dots on the shared rail plus an `sr-only` text list. No visible per-peer counters return to this screen.
- **R25** A vote control is legible without knowing what its icon means: every vote button prints its word as well as its icon, in the button's own colour. Icon-only is no longer sufficient labelling on the deck.
- **R26** The drag verdict is unmissable and two-channel: past 40px of travel, the word at 34px/900 dead centre plus a 12% full-card wash in that vote's colour. Colour is never the only channel. Under reduced motion the card snaps at threshold instead of tracking the finger.
- **R27** The super-like has no gesture. Three drag directions, four buttons, four keys. The vote that most distorts the outcome is reachable only by a deliberate press.
- **R28** The deck is fully operable from the keyboard — ArrowLeft/Up/Right/Down, `s`, `i`, Enter, Escape — and a vote never moves focus. The vote row lives outside `AnimatePresence` so a pressed button keeps DOM identity across the card change.

**MovieDetails**

- **R29** The sheet opens with zero network. The trailer mounts only on tap of a named `Play trailer` button; no other field in the sheet may be fetched at open time. If a field is not already in the deck payload, it does not belong in the sheet.
- **R30** The sheet is votable. A sticky VoteRow sits at its bottom edge and a vote cast there casts the vote and closes the sheet in one action: one tap in, zero taps out. Curiosity may never cost a place in the deck.
- **R31** The sheet traps focus while open and returns focus to the control that opened it — the ⓘ or the card face — on close by every route, including a vote cast from inside.

**Lobby**

- **R32** Deck ordering is stated once, in the Lobby, in one sentence, and never re-communicated by printing a score on a card. The sentence is true only while `deck.ts` sorts hybrids first and composite-descending within each tier; if that sort changes, this sentence changes in the same commit.
- **R33** The cost of `Any Movie` is disclosed three times, in three different tenses, on three screens: the Lobby says what the scope will do, the card chip says whether *this* film is one of them, the winner says how big the thing you are about to download is. No one of the three may be the only one carrying it.

**Knockout**

- **R34** Knockout receives no new ideas this cycle. Permitted changes are size, spacing, and live regions — 56px chips in a 2-column grid, matching the vote row's touch scale and reach zone. Anything else is a separate decision with its own ruling.
- **R35** A screen that waits on other people names them and announces itself: waiting states carry `role="status"` and the names of who is outstanding, never a bare spinner. (R04, made checkable.)

**WinnerScreen**

- **R36** The irreversible control states the size of what it commits: `This downloads to your server — about {runtime} min of video.`, in `text-super`, immediately above the button and wired as its `aria-describedby`.
- **R37** The request is confirmed by a second tap, never by a timed hold: the first tap swaps the button for an inline `Request {title}?  [Yes, download]  [Cancel]` row, identical for touch, keyboard and switch users.

**Home / AuthGate**

- **R38** A guest never meets a login they cannot decline. Any `LoginScreen` mounted from an optional gate passes `onCancel`; a `LoginScreen` without one must be guarding a genuinely mandatory capability, and that is a reviewable claim.

---

## Pins to add before any of this is written

Per the repo contract, these go in `src/ui/__tests__/pins.test.ts` *before* the port, not after, and `gates.json` floors move with them (38 → 44 claims).

| Pin | Fragment | Why |
|---|---|---|
| C09 | `Not on your server` | The card's only cost disclosure; deletable without any other test going red |
| C10 | `Play trailer` | The deferred-iframe affordance; a "fix" that re-auto-mounts the iframe silently removes it |
| C11 | `downloads to your server` | Third and last cost disclosure, immediately before the irreversible tap |
| C12 | `Yes, download` | The confirm step; a "simplify the button" pass deletes it in one line |
| C13 | `Best-rated first` | The only place deck ordering is communicated once scores leave the cards |
| A23 | `aria-live="polite"` in SwipeDeck | The non-animation vote confirmation required by R22/C8 |

Two properties here are behaviour, not copy, and need real tests rather than pins: focus returns to the opener when the sheet closes (R31), and no descendant of SwipeDeck sets `overflow-y-auto` (R21).

---

## The bet, and its one named retreat

The first three cards will feel like a downgrade. A poster with no number on it reads as *missing information* before it reads as *removed noise*, and the instinct is to tap ⓘ on every card — which would make this direction strictly slower than what it replaces, converting a glance into a modal round-trip. The whole thing rides on that habit decaying by about card five, and it only decays because the sheet opens instantly with no network (R29) and can be voted from (R30), so an exploratory tap costs one tap total instead of three.

If it does not decay, the retreat is exactly one change: print the composite as a single number in the title row and nothing else. Not a redesign, not the meta strip back, not the ratings line. This app has no telemetry and R17 says it never will, so the tell is not a measured rate — it is one person watching one real room and counting sheet opens on cards six through fifteen. That is a human's call, and it is listed below.

---

## What still needs human eyes

Everything here was settled against the constraints and the five priorities. None of the following can be:

1. **The scrim.** 96px at `from-black/95 via-black/70` is a guess. Title legibility over a bright or busy poster, and whether the scrim eats too much of the art, is a look-at-it question on real posters from a real library.
2. **Chip contrast over arbitrary artwork.** `border-super text-super bg-black/60` has to survive being laid over a white poster, a yellow one, and a poster whose top-left corner is already text. No rule settles this; a screenshot does.
3. **The 12% drag wash.** Enough to register at arm's length, not so much it looks like a rendering bug. The number is a starting point, not a finding.
4. **Motion character.** Spring stiffness on card exit, whether the reduced-motion snap reads as decisive or as punitive, whether the confetti still fits a screen that is otherwise this quiet.
5. **The vote words.** NOPE / MAYBE / LIKE / SUPER is the current tone. "SUPER" under a star may read as childish, or as exactly right for a couch at 11pm. That is a voice decision.
6. **`Not on your server` as the phrasing.** Versus "Not in your library", "Needs downloading", "Will be requested". All are honest; only one sounds like this app.
7. **Whether the peer dots read as information or as decoration.** If nobody notices them, they are 6px of nothing and the `sr-only` list is doing all the work.
8. **The bet itself.** Whether a poster-only card reads as confident or as broken, and whether tapping decays by card five. One room, one evening, one person counting.
9. **Palette overall.** Nothing in this document repalettes anything, deliberately — a density and hierarchy verdict is not licence to repalette, and the panel was never asked about colour.
10. **The stale colours on `app/guide/page.tsx`.** Still last in the cut list, still where nobody is looking, still somebody's eventual thirty seconds.
---

## Provenance and its holes

Produced by a 16-direction bracket judged by five personas. Read the following before
treating this document as settled:

- **Only 12 of 16 directions reached the bracket.** Four — *Lights Down*, *The Thumb
  Arc*, *One Question Per Screen*, *Verdict Pad First* — died at the constraint-screening
  stage when the session hit its usage limit, and were dropped without ever being judged
  on merit. That is a coverage gap, not a verdict.
- **Constraint screening eliminated nothing.** All 12 directions that were screened
  passed. The stage cost 12 agents and removed only the four it lost to failure.
- **The final rounds were close.** *One Poster, One Tap* beat *Hot Deck* 3-2 and
  *Couch Mode* 3-2. Two persona votes the other way in either round and this is a
  different document.

So: a plausible winner, not a decisive one. The direction is coherent and worth
building, but nobody should cite "it won the bracket" as though the bracket were
exhaustive. Recovering the four lost directions would cost roughly what the whole
bracket cost; it is not obviously worth it, and that is a judgement call for a person.

Cost of this document: 88 agents, 4.66M tokens, 21 minutes.

---

## Retreats

A frozen document that quietly stops matching the code is worse than no document,
because the next person reads it as the state of the app. These are the places the
build deliberately departs from what was frozen above, with the reason. Anything
not listed here and not matching the code is a bug, not a decision.

### R58 — The card keeps its facts. The poster-only card is withdrawn.

**Frozen:** "Delete the entire meta block below the poster … the poster becomes
full-bleed across the whole 328×490 card." Every fact relocated to a sheet and a
polite live region.

**Built:** the poster, and beneath it the title, year, runtime, and three ratings
named by source.

**Why.** The poster-only card was Nour's direction and it won the bracket on the
strength of it. Two people on the panel cannot use the result. Margo hears a screen
with almost nothing in it and does not trust a promise that lives only in a live
region — she called it "exactly the kind of invisible-layer promise that is generated
and never tested," which was fair, because at the time it was. Ade cannot vote on a
poster at all and cannot ask the room to wait while he opens a sheet.

The frozen version served the person who looks at the app. This one serves the people
who use it. The sheet still carries everything else, and the live region still
announces each card — but it is no longer the only place a fact exists.

**Cost, stated plainly:** the card is busier than the direction intended, and Nour's
argument that a poster-only card is the more confident design is not wrong. If a
future wave finds a way to give Margo and Ade what they need without printing four
lines under the poster, this retreat should be revisited rather than treated as
settled.

### R59 — The 640px budget is a floor, not a fixed table.

**Frozen:** a fixed row-by-row budget summing to exactly 640.

**Built:** the card stack is `flex-1 min-h-[420px]` inside an `overflow-hidden`
column, with the bar, progress rail, cost line and vote row taking their natural
height around it.

**Why.** The budget table assumed one viewport. Three of the screens it governs now
carry a cost line that only appears for films the household does not own, and Priya
runs her OS at 200% text, where every fixed height in the table is wrong at once.
A floor plus `flex-1` produces the same result on a 360×640 phone and degrades
honestly everywhere else. R21 — that the deck is physically incapable of scrolling —
is unchanged and is the part that actually mattered.

### R80 — Suppress a focus ring by marking the element, not by describing the markup.

**Frozen:** `h1[tabindex='-1']:focus, [role='dialog'][tabindex='-1']:focus { outline: none }`.

**Built:** `[data-app-focus]:focus, [data-app-focus]:focus-visible { outline: none }`,
with `data-app-focus` on the winner heading and the details sheet.

**Why.** The frozen selector matched nothing for the sheet. `role="dialog"` is on the
fixed positioning wrapper and `tabIndex={-1}` is on the panel inside it, so the two
conditions were never true of one element. The rule was present, readable and
plausible, and it addressed no element in the app — a ring kept appearing around a
sheet nobody had tabbed to.

A selector that restates the markup breaks the next time the markup moves, and it
breaks invisibly. A pin on the rule would also have stayed green, because the rule
was there. So the guard is the join: `src/ui/__tests__/focus.test.ts` asserts that
every element with `tabIndex={-1}` in `src/ui` carries the mark, and that the
stylesheet acts on the mark. Both halves, or neither is worth anything.

### R81 — The details sheet renders into `document.body`.

**Frozen:** the sheet rendered where it is written, inside `SwipeDeck`.

**Built:** `createPortal(..., document.body)`.

**Why.** A frosted pane blurs what its nearest *backdrop root* painted, and an
ancestor with a filter, an opacity below 1, or a `will-change` becomes one. The
sheet is written inside a stack of animated, overflowing, translucent panes, so it
was translucent over the poster without blurring it. Chasing which ancestor was to
blame fixes it until somebody adds another; a portal has no ancestors.

The focus effect had to move with it. The portal only exists from the second render,
so an ungated effect finds a null ref and silently no-ops — no focus move, and a
focus trap closed over nothing. R31 would have been dead with every test green.

### R82 — Vendor prefix first, standard property last. The order is load-bearing.

**Frozen:** `backdrop-filter` then `-webkit-backdrop-filter`, the order most people
write and the order that reads better.

**Built:** the prefix first, the standard property last.

**Why.** This is the worst bug this project has shipped, measured by how long it was
visible to nobody. Lightning CSS — which builds this stylesheet through
`@tailwindcss/postcss` — treats a prefixed alias written *after* the standard
property as superseding it, and emits only `-webkit-backdrop-filter`. Chrome
supports `backdrop-filter` and does **not** support the prefixed form.

So every frosted pane in the app — the whole material the redesign is built on —
rendered as a flat translucent rectangle on every Chrome. The details sheet showed
the card's title and the vote row's No/Maybe/Yes reading straight through the
synopsis. It was correct in dev, correct in Safari, and the `@supports not
(backdrop-filter: ...)` fallback correctly declined to fire, because Chrome does
support the feature; it was the *emitted CSS* that lacked it. Nothing was red.

Two guards, because the cause and the symptom live in different files.
`src/ui/__tests__/css.test.ts` checks the declaration order, so `--fast` catches it.
Gate **G7** greps the built stylesheet in `.next/static/css` for the standard
property, because the only file that proves anything is the one that gets served.

**What this says about the rest.** Every visual claim in this repo rests on a
screenshot or an eye, and both were satisfied by a build that had silently dropped
its central effect. The lesson is not "check backdrop-filter". It is that a
stylesheet is compiled, and the compiler is entitled to change what ships.

### R83 — The sheet remembers who opened it once, on mount.

**Frozen:** `const opener = document.activeElement` inside the effect that also
installs the focus trap.

**Built:** a `useRef` set by a mount-only effect, restored by that effect's cleanup.

**Why.** The trap effect depends on `onClose`, which the deck passes as an inline
arrow (`SwipeDeck.tsx:168`) — a new identity on every parent render. So every
re-render tore the effect down and set it up again, and on setup it re-read
`document.activeElement`. By then the active element was the sheet, focused by the
previous run. The sheet recorded *itself* as its own opener and, on close, handed
focus to the element it was unmounting. Focus fell to `<body>` and a keyboard or
screen reader user lost the rest of the deck at the moment they pressed Escape.

A live room re-renders the deck constantly — every other member's progress arrives
over the socket — so this fires in the case that matters and not in a quiet one.

**How it surfaced, and what that says about the harness.** `scripts/screenshots.ts`
now asserts focus behaviour while it is in each state, because it is the only thing
in this repo that reaches these screens in a real browser. It reported focus falling
to `<body>` — but for its own reason: it drove the app with `HTMLElement.click()`,
which dispatches a click without moving focus, so the app was handed a document with
nothing focused and nothing to return to. That was the harness driving the app in a
way no person can, and it is fixed to focus before it clicks.

So the failing check was an artifact, and the bug it sent us looking at was real but
separate. Both are worth recording: a harness that drives an app unlike a user
produces failures that are true of nothing, and they cost exactly as much to chase
as real ones.

### R84 — The picture yields. The words do not.

**Frozen:** the deck card capped its caption at `max-h-[45%]` with `overflow-y-auto`;
the winner card capped its poster at `max-h-[46dvh]`.

**Built:** on both screens the poster is `min-h-0 flex-1` and the text block is
`shrink-0`.

**Why.** At 200% OS text — the size the README promises to serve, and the reason two
of the nine captures exist at all — both screens lost the one fact they are about.

The deck card put a scrolling box around the title, year and ratings line. At a 32px
root that content needs roughly 236px against a cap of about 133: the title scrolled
out of its own box and "RT critics 98" was sheared mid-glyph against the card's
`overflow-hidden`. A person at 200% text was voting on a film whose name was not on
the screen. It was also a scrolling region on the deck, which R21 says the deck is
physically incapable of — reaffirmed by R59, cited in comments, and tested by
nothing until `src/ui/__tests__/deck.test.ts`.

The winner screen failed the same way for a different reason, and the first cause hid
the second. The card was a flex item at `flex-shrink: 1` inside a `.scroll-body`
column, so rather than overflowing and scrolling it shrank to fit and clipped its own
caption: poster, two buttons, nothing else. Adding `shrink-0` was not enough — the
poster's 46dvh cap then pushed the caption past the dock, so the winner's name was
merely one scroll away instead of absent. On the payoff screen, one scroll away is
still wrong.

The rule both now follow: whatever room is left over goes to the picture, and the
words are never the thing that gives way. R79 — the poster gets the whole card
rather than a 96px thumbnail — is intact at ordinary text sizes, which is what it
was about.

### R85 — Photograph the screen, not the wait in front of it.

**Frozen:** the capture waited for `Check everything`, then shot `04-knockout`.

**Built:** it waits for `button[aria-label^="Pick "]` — an actual genre row.

**Why.** `Check everything` is a static explainer row, present in the loading
skeleton too. So every `04-knockout.png` this repository has ever committed is eight
empty grey stripes, and the README shipped one above the fold with alt text
promising "a list of genres to pick from". The first screen that asks a person for an
opinion had never been photographed, through a redesign, a rendering bug, and a board
round convened specifically to look at the pictures.

The deck step in the same script already knew to refuse a skeleton. This one did not,
and nothing compares a capture against what it claims to be — the alt text is the
only place the claim is written down, and prose does not fail.

The skeleton also announced nothing. `aria-hidden` on eight decorative bars is right,
but with nothing beside it a screen reader met silence between "I'm ready" and a list
of genres appearing; it now carries a `role="status"` label.

**And the README hero row.** `08-winner.png` — poster, confetti, "Everyone said yes.",
a real Play button — was captured, committed, and referenced in no markdown anywhere,
while the lobby held a hero slot. The row is now the story: pick what you are open to,
swipe the deck it builds, land on one film.

### R86 — A seat is proved, not asserted.

**Frozen:** `room:join` with a `userId` reconnected you as that member.

**Built:** a 32-byte seat secret, issued with the id and required to reclaim it,
plus a per-address rate limit on taking a seat.

**Why.** User ids are a global counter — `u_1`, `u_2` — and room codes are four
characters. Reconnect checked only that the id existed. So anyone who could reach
the socket could take a seat in a stranger's room: receive that member's redacted
private view, and act as them for ready, genre submission, elimination, voting,
undo and rejecting the winner. Supplying an id also skipped the `joinRequires`
check, so it defeated the one mitigation the README names for putting Matcher on a
public hostname.

It is bounded — `scope: wide` and `winner:request` are gated on a signed-in name,
so no Jellyseerr download can be fired this way — but "an outsider can vote in your
room and read your ballot" is the product's whole promise inverted.

**The secret is not a field on `RoomUser`.** `viewFor` builds a member's view by
spreading the room, and R61 is the ruling that a promise the client merely declines
to render is not a promise. A secret on the room object is a secret on every phone
in the room, one careless spread away from the console. It lives in a map the room
graph does not reference, so leaking it would take new code rather than forgetting
old code — and a test asserts it appears in no view and in no serialization of the
room.

Both failures return one message. Saying "that id exists but the secret is wrong"
confirms which ids are real, which is the enumeration the rate limit is there to
stop.

**The client half is not optional.** The silent reconnect across a phone lock or a
refresh — promised in the README, and the reason `room:join` accepts an id at all —
breaks completely if the secret is not persisted beside the id. `StoredSession.secret`
is optional purely so a session written by an older build does not throw on read;
without it the reconnect is refused and the member rejoins by name.

### R87 — The knockout obeys the rule the deck already obeyed.

**Frozen:** genre and elimination rounds resolved only when every member in
`Object.keys(room.users)` had answered, and the disconnect handler re-checked
nothing outside `SWIPING`.

**Built:** rounds resolve when every *connected* member has answered, every answer
on record still counts, and a departure re-runs the round.

**Why.** `settlement.ts` states the rule outright and states it well:

> Only CONNECTED members decide whether a room can settle.
> Everyone's votes still count once it does.

It was applied to the deck and not to the knockout. So two of three members
submitting, with the third's tab closed, left the room reading "2 of 3 in" until
that person came back or the two-hour TTL reaped the room. That is the permanent
stalemate this product's headline promise denies, sitting one phase before the
phase that was guarded — and reachable by locking a phone.

**The half that is easy to get wrong.** Swapping the member list wholesale breaks
the other half of the rule. The elimination tally iterated the same list and read
`elimVotes[id]!` for each: pass only connected members and a departed member's cast
vote stops counting; pass all members and an unvoted `undefined` gets tallied as a
genre. The two lists are genuinely different questions — *who must answer* and
*what has been answered* — so the resolution now gates on `deciderIds` and tallies
`Object.values(elimVotes)`.

**Resolution had to stop being a side effect of answering.** It lived inside
`submitGenres` and `submitElimination`, so the only event that could end a round was
a member responding — and a member leaving is precisely the case where nobody will.
`reresolve` runs the same resolution against the current answers and the current
deciders, returns the state untouched when the round still has somebody to wait for,
and refuses to resolve at all when nobody is left to decide (an empty decider list
makes `every` vacuously true, which would lock genres for an empty room).

### R88 — The sign-in has a deadline at both ends.

**Frozen:** `authenticateWithJellyfin` defaulted to bare `fetch`; the browser's login
POST passed no signal.

**Built:** the server default is `withDeadline(fetch)`; the browser aborts at 20s.

**Why.** This was the last server-side upstream without one — `jellyfin.ts`,
`jellyseerr.ts` and `mdblist.ts` all wrap theirs, and `deadline.ts` states the
invariant in its first paragraph. A Jellyfin that accepts the connection and never
answers held the request open forever. It is also never counted by the rate limiter,
because a failed attempt is only recorded in the `catch`.

The visible symptom is worse than a slow page. `setBusy(false)` runs only in the
`catch`, which is correct exactly as long as the request always settles — so a hung
sign-in left the button disabled, with nothing said, and no way out but a reload.
The browser's deadline is longer than the server's so that when the server can
produce a real message, its message wins; when it cannot, the page says the server
did not answer instead of saying nothing.

### R89 — Contrast is measured against the ground that is actually on screen.

**Frozen:** `--color-border: #5f6a63`, pinned as 3.44:1 against `--color-background`.

**Built:** `#737e77`, measured off the committed captures at 3.57–3.80:1.

**Why.** The arithmetic in the pin was correct and described a surface nobody has
ever seen. `#0b0e11` is the canvas colour, and `body::before` covers the canvas edge
to edge with two radial gradients over a linear; every divider is then drawn inside a
`.gel` on top of that. Sampling `04-knockout.png` directly, the genre rows render the
divider against roughly `rgb(24,34,37)`, where `#5f6a63` came to **2.67–2.85:1**. The
token failed the rule stated in the comment directly above it, and the proof that it
passed was the thing hiding it.

R41 said "clears 3:1 against the ground" without ever saying which ground, and lived
only in code comments — cited by `Listing.tsx` and by pin T05, defined in neither
design document. It says which ground now, and it is written down here.

**Measured, not computed.** The new value was checked by reading pixels out of the
rendered PNG and finding the divider rows empirically, then re-reading them after the
change. The failure mode being corrected is precisely a number that was right about
the wrong thing, so a second calculation would not have caught it.

One correction to the finding that prompted this: the reported 2.12:1 against a
pressed row was a different element — the teal callout card. Dividers in the resting
list measure symmetrically against both neighbours, which is why one token clears it.

### R90 — The event is how the room is told. The room is where it is kept.

**Frozen:** `viaFallback`, the ranking and the play URL existed only inside the
`match:declared` emit.

**Built:** they are recorded on the room by `declare`, cleared by `rejectWinner`, and
carried to every phone by `room:state`.

**Why.** A rejoin receives `room:state` and nothing else. Nothing replayed the
declaration, so one reload on the winner screen told the room a different story than
the one it had just lived: `held` recomputed as false, so a film sitting in the
library was reported as "Not on your server", a cost line insisted nothing had been
downloaded, a points winner was captioned "Everyone said yes", the ranking vanished,
and Play was replaced by a Jellyseerr request the server then refuses with "Already
in the library" — an error on the payoff screen, about a film the household owns.

This is the same shape as R61 and R82: state that is correct at the moment it is
produced, and absent for anyone who was not listening then. A transient event is not
a place to keep a fact that outlives the moment.

**Verified by reproducing it, not by reasoning about it.** `scripts/screenshots.ts`
now reloads the winner screen and asserts the page still says the film is on the
server. Reverting the fix turns both assertions red in a real browser, which is the
only place this bug was ever visible — every unit test was green throughout, because
the state was correct right up until the event was the thing that was gone.

### R91 — Do not print a number the app does not have.

**Frozen:** R33 said the winner screen "says how big the thing you are about to
download is". R36 prescribed `about {runtime} min of video`. The `CostLine` comment
insisted the line "states a SIZE" and argued, correctly, that runtime is not a cost.

**Built:** the disclosure names the consequence and the uncertainty, and no size.

**Why.** The three statements above contradict each other, and the one that sounds
strongest is the one that cannot be built. No size datum reaches this app.
`MovieCandidate` has no size field; Jellyfin's item payload and Jellyseerr's discover
response do not carry one; and the real figure is not settled until the host's Radarr
picks a release — which happens *after* the request and *after* approval. There was
never a number to print.

The reasoning behind the frozen rule is still right: 108 minutes is 2GB or 55GB, and
only one of those matters to whoever owns the disk. The conclusion does not follow
from it, because the fix requires a fact nobody has. So the request confirmation now
says how much disk it uses is not known until the host's server picks a release,
which is the true statement in the neighbourhood of the false one.

R33 and R36 are superseded on this point. R42 stands, minus the size clause.

**The pin was the tell.** T01's `why` claimed the cost line states a size; its `find`
was `export function CostLine`, which proves the component exists and nothing about
what it says. It could not have failed for the reason it named — it would have stayed
green against a cost line reading "hello". It pins the sentence now.

### R92 — A citation nobody can follow is not a reference.

**Frozen:** rulings cited from code as two-digit numbers, with `CLAUDE.md` pointing
readers to `docs/DIRECTION.md` "for R19-R55".

**Built:** [docs/RULINGS.md](RULINGS.md), generated by `npm run rulings` and checked
by gate **G8**.

**Why.** Thirty-nine rulings were cited in code and defined in neither design
document, and the pointer that was supposed to help named a range `DIRECTION.md` does
not contain and never did. Someone meeting `// R63` in a diff had nowhere to go.

The fix is deliberately *not* to write the missing prose. Every one of those rulings
is explained — in the comment that cites it, written when the decision was actually
made. Inventing forty ruling texts after the fact would produce a document that looks
authoritative and reflects nothing. What was missing was a way to find them, so the
index is generated, says which rulings are argued in a document and which are defined
at their citation, and is gated so a new citation cannot go unindexed.

### R93 — The socket layer is functions, not closures over a live server.

**Frozen:** eleven handlers inside `io.on('connection')` in `server/index.ts`, each
closed over the live `io` and `store`, each with its own `try`/`catch`.

**Built:** `server/handlers.ts` — the same decisions as plain functions taking a
`Ctx`, with `index.ts` reduced to wiring.

**Why.** No test in this repository imported `server/index.ts`. Under `npm run gate`
the join gating, the reconnect branch, the disconnect path, settlement on departure
and every vote guard never executed. What did touch that file was a string scan
asserting the event names are still spelled correctly.

That is the same shape as R82 one layer up: correct-looking code, checked by
something that cannot see what it does. Three of the worst defects this project has
shipped lived in exactly that gap and every one of them was green — an identity
takeover on reconnect (R86), a knockout that could not resolve when a phone dropped
(R87), and a winner screen that misreported itself after a reload (R90).

**What the seam is.** `Session` is the per-socket state and the three questions only
a real socket can answer; `Effects` is everything a handler does to the world outside
its own room. A test passes recorders and calls the handler directly. Production
passes the socket.io versions and behaves exactly as before.

**One error path.** Each handler used to carry its own `try`/`catch` calling `fail`.
Eleven copies of one decision is eleven chances for the twelfth to forget it, and a
refusal that never reaches the ack is a phone that hangs. Handlers now throw and the
wiring answers.

**The registrations stay spelled out, one per line.** They could be a table and a
loop. `validate.test.ts` reads this file as text and asserts each event by name, and
a contract you cannot grep for is not much of a contract.

**Faithfulness was the risk, and the extraction was not faithful at first.** The move
silently dropped three behaviours — the `KNOCKOUT` status guards, `asBoolean` on the
ready payload, and `undo` returning the card id the deck animates back. All three
were restored before anything was wired. Then the new tests were mutation-checked,
and the first version of the knockout-departure case turned out to be one a bug walks
straight through: it asserted that *something* happened, which the fallthrough
broadcast satisfies. A test a bug passes is worse than no test, because it reads
like cover.
