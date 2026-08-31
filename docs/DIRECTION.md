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

### R94 — The room is not proved by one phone.

**Frozen:** every harness in the repo drove exactly one browser page.

**Built:** `npm run e2e:two` — two Chrome pages, two browser contexts, one room.

**Why.** `scripts/screenshots.ts` says it drives "two real sockets" and it does, but
the second member is a headless socket with no UI. So the sentence this product is
built on —

> Everyone swipes the same deck. The first film you all like wins.

had never been observed happening. That one phone renders a winner proves nothing
about the other five in the room, and the interesting failures live exactly there: a
broadcast that reaches one socket and not another, a screen that transitions locally
without waiting for the room, a view that is correct for whoever acted and stale for
everybody else. Every automated check in this repo would have passed a build where
only the acting phone ever updated.

Fourteen assertions across a whole night, including the ones about what a phone must
*not* see: that Ada's genre picks are not sitting in Bex's page state, and that Bex
is never told how Ada voted. R61 is a server promise, and a promise the client merely
declines to render is not one — so it is checked on the other device, which is the
only place the difference is visible.

**Two browser contexts, not two pages.** Two pages in one context share an origin's
`localStorage`, so the second page picked up the first member's stored session and
silently reconnected as her. The app was right and the harness was wrong, in the most
embarrassing possible way: a room of one phone pretending to be two, which is the
exact illusion this script exists to stop relying on.

**No `ok(true)`.** Two of the first fourteen checks were unconditional passes sitting
after a wait that would have thrown. That is the same defect as a test a bug walks
through, and it had just been caught once already in this session (R93); writing it
again an hour later is the argument for the rule rather than against it. Both assert
the state the wait left behind now.

Verified by breaking it: making `broadcast` send to a single socket fails the harness
immediately and by name.

**A second room, for the failure that is only visible on a screen.** R87 fixed a room
that waited forever on a member who had closed their tab during genre picking. That
fix has unit tests on the transitions and on the handler, and neither of them is a
phone: a room can be correct in memory and still leave somebody staring at "1 of 2"
because nothing told them. So the harness runs a second room where one member answers
and the other's phone dies, and asserts the survivor's screen moves on its own.

Restoring the pre-R87 rule — resolving against every member rather than the connected
ones — fails it with the sentence the bug deserves: *timed out waiting for Cy to be
released from the knockout.*

### R95 — Do not dim the thing that is already small.

**Frozen:** the vote points rendered `text-caption opacity-70`, and
`--color-destructive` was `#e0563f`.

**Built:** no opacity on the points, and the destructive ink lifted to `#e86b54`.

**Why.** `opacity-70` composites the ink 70/30 with whatever is behind it, and
behind it is the button's own coloured tint — so the number lost about a third of
its contrast against the exact surface it had to beat. Sampled from
`docs/screenshots/05-deck.png`: `-5` at **2.82:1**, `+2` at 3.35:1, `+3` at 3.55:1.
Only `+1`, on the neutral button, passed. This is the screen a person reads fifty
times a night, often in a dark room, and `VoteRow.tsx` opens by saying a scale
nobody can see is a scale nobody can use.

`text-caption` already makes the points secondary. Dimming them as well was paying
twice for the same emphasis, and the second payment came out of legibility.

Removing the opacity was not enough for the red. Everywhere `--color-destructive` is
used as ink it sits on a tint of itself over a dark card, and on that ground
`#e0563f` measures 4.19:1 — so the *word* "No" was under 4.5:1 too, at full opacity,
and had been all along. `#e86b54` measures 5.01:1 there. The two places the token is
a fill rather than ink carry `#0b0e11` on top, and a lighter red raises that contrast
as well, so nothing was traded for it.

**Measured before and after, from the rendered PNG.** `-5` 2.82 → 5.03, `+2` 3.35 →
5.13, `+3` 3.55 → 5.63, the word "No" 4.19 → 5.04. This is the second contrast bug
settled this way after R89, so the sampler is now a command: `npm run contrast`.

### R96 — A thumb is not type.

**Frozen:** the deck's details button was `size-12` — 3rem.

**Built:** `size-[44px]`, with a `20px` glyph.

**Why.** At the 32px root a reader on 200% text got a 96px disc, on a poster strip
about 53px tall. The button was taller than its own container: its centre sat above
the card's top edge, the article's `overflow-hidden` clipped roughly 70% of it along
with the entire Info glyph, and — because overflow clips hit-testing too — the
tappable region collapsed to about 88×29, under the 44px minimum
`docs/REDESIGN.md` already asks for. The control that explains the film you are
voting on became an unlabelled dark smear.

R60 — every size in rem, so type tracks the reader — is right and is not in question
here. A touch target is not type. A thumb does not get bigger when you raise the font
size, so a control sized for one should not either. Rem for text; a floor in pixels
for the things a finger has to hit.

### R97 — The points may not overrule the room's only unanimous opinion.

**Frozen:** the fallback ranked every standing card by `composite + votePoints`.

**Built:** anything every connected member voted No on is dropped before ranking,
and a deck where that empties the list returns no winner.

**Why.** A rating is 0–100 and a unanimous no is about −5N, so the vote term could
not outweigh the rating term. On a two-person night a film rated 87 that both people
rejected scores 77 and beats anything rated below that which nobody objected to. The
winner screen then announced it as *"Nobody agreed outright, so the points decided."*
That sentence is true and reads as a compromise, which is what makes it bad: what
actually happened is that the only thing the room unanimously agreed on was
overruled by arithmetic.

It is the mirror of `isInstantMatch`, and it exists for the same reason. Unanimity is
the one signal in this app strong enough to decide something by itself: everyone
saying yes ends the night immediately, so everyone saying no must at least be able to
remove a card from contention.

**Unanimity, not majority.** Two of three saying no is a room that disagrees, and
points deciding a disagreement is precisely what points are for. That case is left
alone deliberately — it is not an oversight, and a test pins it.

**When the room disliked everything, say so.** Filtering can empty the list, and the
honest answer is the no-winner path that already exists rather than the least-hated
film. Turning fifty unanimous noes into a recommendation is the failure this whole
app is a reaction to.

The pin went in before the code and was red until the code existed. That is the
opposite of the practice OPERATING.md warns about — a pin written from a diff can
only find what has already gone — because here the property is new and the pin is
the specification.

### R98 — A failure explains the screen. It does not become the screen forever.

**Frozen:** `DiagnosisPanel` took the whole room whenever a diagnosis was not
`recoverable`, and nothing ever cleared a diagnosis.

**Built:** the panel carries a control that puts it away.

**Why.** On the deck-build path the panel was permanent by construction, and the
construction is worth stating because every part of it looks reasonable alone:

- `beginDeckBuild` empties `room.deck` *before* the attempt, so the room shows
  skeletons rather than the last deck.
- The failure handler passes `room.deck.length` to `diagnoseDeckFailure`, which is
  therefore always `0`.
- `recoverable: deckSize > 0` is therefore always `false`.
- `RoomClient` blocks on any non-recoverable diagnosis, and nothing clears one.

So `deckBuildFailed` put the room back to `KNOCKOUT` on the server — its comment says
it exists so the room can retry *"rather than being stranded on a skeleton"* — and
every phone in the house stayed on a panel hiding that. The room was recovered and
the people in it were not. The only way out was reloading each phone by hand, on the
one code path whose entire purpose is to stop a room being stranded.

The panel's own FIX row said to pick genres again. Every row in it is a Listing
`Row`, which is deliberately not interactive, so it printed the instruction and was
simultaneously the thing preventing it. The advice was right, the server had already
done its half, and there was no control on screen to meet it.

Blocking is still correct — a build failure genuinely leaves nothing else to draw,
and the panel carries the upstream and the technical line a self-hosting reader
needs to fix their server. What was missing was only the way out.

### R99 — A client deadline shorter than the server's turns slow into wrong.

**Frozen:** `emitAck` gave up after 10s; `UPSTREAM_TIMEOUT_MS` is 15s; nothing on the
server refused a second `winner:request`.

**Built:** the client waits 20s, the room records the request, and the server refuses
the repeat.

**Why.** Three reasonable-looking pieces composed into a second download.

A Jellyseerr that takes twelve seconds is inside the server's deadline and outside
the client's, so the phone was told **"Request failed"** for a request that then
succeeded. The winner screen puts the button straight back on an error. And nothing
on the server refused the second press — no flag on the room, no limiter — so the
retry the false error invited reached Radarr as a genuine second download of the same
film. This is the one control in the app that spends somebody else's disk, and its
only guard was a disabled button on the phone that had already pressed it.

**Idempotence belongs to the room.** `winnerRequest` is recorded server-side before
the announcement, so the refusal survives a reload, a rejoin, and a different phone.
It is cleared when a winner is declared or rejected, so a new winner never inherits
the last one's state.

**And it was private.** "Asked." lived in component state, so it was known only to
whoever pressed the button and gone the moment they refreshed — while
`winner:requested` was emitted to the whole room and **nothing subscribed to it**.
Five other people had no way to know the film had been asked for. The screen now
names who asked, from room state.

Tested against an injected `requestMovie`: the rules around the control that spends
the host's disk are checkable without a test being able to spend it. Removing the
guard turns the second-press case red.

### R100 — Say what will happen, not what usually happens.

**Frozen:** the reject confirm read *"puts everyone back in the deck"* and its button
said *"Yes, keep swiping"*, on every path.

**Built:** both branch on whether the deck is actually finished, and the room tells
the phone which it is.

**Why.** On a points winner nobody swipes anything. `rejectWinner` puts the room back
to `SWIPING` but leaves `progress` untouched, so `deckExhausted` is still true and
`settleIfPossible` — called in the same handler, on the next line — declares the
next-ranked film immediately. The comment above that line says so in as many words.
The copy promised a return to the deck on the exact path where the deck is over, and
the button named an action nobody was about to take.

**The fact is sent, not derived.** A phone knows its own position in the deck and a
count of how many others finished, but not whether the members who finished are the
members still connected — and that is precisely what decides the answer. A member
rejoining flips it. So `deckExhausted` is computed by the same function settlement
uses and travels in the room view, rather than being approximated on the client from
two numbers that nearly work.

`viaFallback` looks like the right signal and is wrong in both directions: a
disconnected member who rejoins before the reject makes the deck un-exhausted, and an
instant match can happen on a deck that is exhausted anyway. Guessing from the
outcome is not the same as asking about the state.

### R101 — A refused rejoin hands the phone back to the door.

**Frozen:** the rejoin failure cleared the stored session, set an error, and stopped.

**Built:** it also clears `userId` and `room`, so the join gate renders — and the gate
says why.

**Why.** `userId` staying set meant `RoomClient`'s `!userId` gate never fired, so the
phone went on rendering the last room state it held: receiving no broadcasts, because
`joinChannel` only runs on a successful join, and offering controls whose acks the
server would refuse. The error read *"Start a new one"* while the server's own message
said to join this one again, and neither was reachable from the screen printing them.

The common way in is a phone dropping out of the **lobby**. A member who leaves before
the room starts is deleted outright, by design, so their seat is genuinely gone while
the room is perfectly fine. That is a rejoin, not a bereavement, and the app now says
so and offers the door.

**Proved by dropping a real phone's network.** `npm run e2e:two` now runs a third room
where a member goes offline in the lobby and comes back, and asserts she gets the join
gate, is told why, and can rejoin — with the room seeing her return.

The first version of that test waited four seconds and failed, because socket.io's
defaults mean a dead connection is not noticed for up to forty-five: the seat was
never deleted, the rejoin succeeded, and the check timed out waiting for a recovery
nothing needed. It waits the real duration now. Shortening the server's timeouts to
suit a test would have changed how long a household's room survives a tunnel.

### R102 — Measure type in type's units.

**Frozen:** the listings label gutter was a hard `58px`, in three places, holding
`text-caption` at `0.75rem`.

**Built:** `3.625rem` — the same 58px at the default root, and the same multiple of
its own text at every other.

**Why.** It was the last fixed dimension in the app that constrained content rather
than flooring it: every other pixel literal is a `min-h-` that grows. At a 32px root
the caption doubles and the track does not, so a four-character label — `DECK`,
`BACK`, `FROM` — needs about 65px in a 58px track and is clipped on the left by the
card's overflow.

This is R74 from the other direction. There, a `ch` track grew with the text and
broke a layout that needed a fixed budget. Here a `px` track stayed put while its own
contents grew. The question is never rem-or-px; it is whether the thing being
measured is type. A gutter sized to hold a word is.

**Photographed, because it had never been.** Every screen built on the listings grid
pays this gutter, and the only 200% captures were the deck and the winner, which use
the grid barely or not at all. `03b-lobby-200-percent.png` is the first look at the
row layout at the size it constrains hardest, and it is what settled the value.

**Left unresolved, deliberately.** At a 32px root the gutter is 116px of a 402px
viewport — 29% of the line, for a three-letter label — and the content column wraps
harder for it. A better answer at that size is probably to stack: label above
content, both full width, the way the vote row reflows under R51. That is a change to
every row in the app and it should be judged on its own evidence rather than folded
into a clipping fix. The clipping is gone; the crowding is a design question with a
picture attached now.

### R103 — Photograph the state the copy is about.

**Frozen:** `04-knockout` was shot before anyone picked anything, and no capture had
ever rendered the download disclosure.

**Built:** the knockout is shot after four genres are chosen, and a second room runs
in Any Movie scope to photograph a film the server does not have.

**Why.** Two different versions of the same mistake.

The knockout shot sat *before* the pick loop, so the lead image of a product about
deciding together showed every row unpicked, a header reading "0 of 2 in", and a
disabled "Lock in 0". The screen worked; the picture was of nobody having decided
anything.

And the honesty copy had never been rendered at all. Every capture ran in local
scope, where a card's `jellyfinItemId` comes from a required string and so is never
null — `notHeld` is false for every card in every screenshot this project has ever
committed. The chip on the poster, the cost line under the deck, and the sentence
R91 rewrote to stop promising a size the app cannot know had all been reviewed as
source and never once seen on a screen.

**Three things this cost to get right, each worth keeping.** Any Movie needs an
account under the default `MATCHER_AUTH=requests`, so the script detects the gate and
says how to refresh the shot rather than handling anybody's password. A room of one
never leaves the lobby — the app refuses to start a movie night for one person — so
the pass runs two members. And both submit the *same* two genres, which resolves the
round straight to DONE and avoids duplicating the elimination loop above, which
carries four separate race fixes.

**The first capture was wrong, in the exact way R85 was about.** The check asked
whether `document.body.innerText` contained "Not on your server", and the cards
behind the top one are still in the DOM — so it matched a chip four cards down and
committed a picture of a film the server *does* have, with no disclosure visible
anywhere. R85's lesson reproduced inside the harness written to prevent it. It reads
the active card only now.

### R104 — The buttons lie down when they get wide.

**Frozen:** each vote button stacked a glyph, a word and a points line, at every size.

**Built:** the stack becomes a row once the button is wide enough to hold one.

**Why.** At 200% text the row reflows to 2×2 (R51, R74) and pays that three-line
stack twice: about 41% of the viewport for the controls, leaving the poster roughly
53px. The film being voted on had become a strip above the buttons for voting on it.

**A container query, not a media query.** What changed is the *button's* width, not
the screen's. Four across, a button is about 90px and the stack is correct; two
across it is about 195px, which is ample room to set the same three things in a line.
So the reflow that costs the height is also the signal for reclaiming it, and the
rule needs no breakpoint guess about screens.

Measured on the recaptured 200% deck: the poster goes from about 53px to about 430.

### R105 — The household is remembered between nights.

**Frozen:** rooms lived in memory on a two-hour TTL, the deck builder took no
exclusion set, and nothing anywhere recorded what a room had chosen.

**Built:** the winner is written to `.cache/history.json`, and films landed on in the
last 30 days step aside when the next deck is built.

**Why.** The deck builder is deterministic. Same two genres, same library, same fifty
cards in the same order — so the film the room agreed on last Tuesday was card one
again this Tuesday. The Product mandate blocked on this in two consecutive board
rounds, and it is the plainest kind of defect: the app had no memory of the people
using it.

**This is the half that needs no household.** What the room *landed on* is a fact the
server already holds at the moment it declares a winner. It needs no account, no
Jellyfin user context, and no ruling on whose viewing counts in a room mixing members
and guests. Reading what people have actually played needs all three, and is
deliberately not attempted here — the board's own note says the exclusion half is
self-contained, and it is the half that is built.

**Recorded on declaration, not on play.** Nothing tells this app whether anybody
pressed play, and a room that agreed on a film and then went to bed still does not
want it dealt first next week. The moment the fact exists is the moment the room
lands on it.

**A preference, not a rule.** If honouring the history would leave no deck at all, it
is dropped. A household with a small library and two narrow genres must still get a
night: a repeat is a worse evening than a fresh film, and no deck is not an evening.

**Fails open, like the cache beside it.** Written through a temp file and a rename
(R78), and every read treats a truncated or missing file as "this household has no
history", which is the correct reading of not being able to tell. The night is over
by the time any of this runs; losing the note must never reach anybody's phone.

**Proved across two real nights.** With the record cleared, a full session against the
live library landed on Toy Story 3 and wrote it down. The next session — same
genres, same library — landed on Up. The harness always votes on card one, so card
one had changed.

### R106 — A feature that can silently do nothing says whether it is doing anything.

**Frozen:** the watch history was written and read, and reported nowhere.

**Built:** `/healthz` carries `history`, and `npm run prod:read` prints it.

**Why.** R105 has one specific way to silently do nothing: a deployment that does not
mount `.cache` writes the history into a container layer and loses it every time the
container is replaced. From the couch that is **indistinguishable from the feature
working** — the deck simply repeats, which is the exact complaint it was built to
answer. The household would conclude the app is broken in the old way, and the host
would have nothing to check.

So the count goes where the host already looks, and `prod:read` says outright that an
empty history on a server that has been up an hour is worth investigating. Naming the
Docker volume in that note, because that is the cause it will almost always be.

Same reasoning as the ratings quota and the last deck build cost (R67): the things a
host is on the hook for should be answerable without reading the code.

### R107 — Do not promise a gate you do not control.

**Frozen:** the deck said *"The host is asked to approve it before anything is
fetched"*, and the winner screen said a film appears *"once the host approves it"*.

**Built:** the app says what Jellyseerr actually did, and stops asserting an approval
step it cannot guarantee.

**Why.** Matcher requests with an admin API key, and Jellyseerr auto-approves an
admin request unless the host has configured otherwise. So the gate the disclosure
promised usually is not there — and the repository said so everywhere else. `README`
says a request *"lands in Radarr"*. `OPERATING.md` warns that a stray end-to-end run
*"can fire a genuine Jellyseerr request that lands in Radarr"* — a real download, with
no mention of a human in between. `app/guide/page.tsx` tells the household *"It shows
up in Jellyfin once it finishes downloading."* Only the disclosure claimed a gate, and
the disclosure is the one place being wrong is expensive.

Wrong in the lenient direction, on the one control that spends somebody else's disk.
That is the direction that matters: a person reads "the host approves it first" and
presses the button believing a second pair of eyes stands between them and 60GB.

**The truth is available and was already being discarded.** Jellyseerr returns
`status`: 1 pending approval, 2 approved. That value reached the ack and went no
further. It is now recorded on the room, so the screen reports which of the two
actually happened — "your server accepted it" or "your Jellyseerr is holding it for
approval" — instead of guessing. Before the press, the copy names the uncertainty
rather than resolving it in the app's favour, the same way R91 refused to print a
size the app does not have.

**The test fake was part of the problem.** It returned `status: 'PENDING'`, a string
the real API never produces, which made every approval check read as false and would
have hidden the bug in the other direction. Fakes that do not match the shape of the
thing they stand in for are how a suite agrees with itself.

### R108 — The lobby waits on people too.

**Frozen:** the disconnect handler branched on `KNOCKOUT` and `SWIPING`.

**Built:** it branches on `LOBBY` as well, and re-checks whether the round can start.

**Why.** A member who drops in the lobby is deleted outright, by design — so the room
can become all-ready *by their leaving*. Nothing re-checked that: `startKnockout` is
reachable only from `setReady`. Three members with two ready and the third's phone in
a pocket sat on **"Everyone is in. Starting."** until the two-hour TTL reaped the
room. The lobby rendered the sentence and the server never acted on it.

This is the third and last phase that can wait for somebody. `settlement.ts` stated
the rule for the deck, R87 extended it to the knockout, and the lobby was left out of
both — which is what a rule applied by hand to each case looks like from the outside.

### R109 — The documented install must not produce a broken deployment.

**Frozen:** the quickstart mounted a host directory at `/app/.cache`.

**Built:** a named volume, a fixed uid to chown to if you want a bind mount anyway,
and a health check that refuses to call it fine.

**Why.** The image runs as a non-root user and chowns `/app/.cache` to it, which is
correct. A bind mount over that path does **not** inherit the image directory's
ownership the way a named volume does, and Docker creates an absent bind-mount source
root-owned — so on a Linux host the documented quickstart produced a container that
could not write its own cache.

Nothing appeared to break, because both writers fail open on purpose. The ratings
cache silently re-fetched the whole library on every deck build, against a metered
key, while the README promised *"after that it's cached for a week"*. And R105 — the
memory between nights that two consecutive board rounds blocked on — silently recorded
nothing, which is indistinguishable from the repeating deck it was built to fix. The
compose file's own comment promised that this mount was what preserved the history.
The mount was what broke it.

**Three changes, because one would not have been enough.** The default is a named
volume, so the documented path works. The user has a fixed uid (10001) so anybody who
wants a bind mount has a concrete number to chown to, rather than whatever
`adduser -S` happened to pick that build. And `/healthz` now probes writability
directly, with `prod:read` treating a false as a **failure** rather than a note —
because the whole character of this bug is that it produces no symptom a host would
recognise.

Failing open is still right. A cache that cannot be written must never cost anybody
their evening. But failing open and saying nothing is a different decision, and it
was never made deliberately.

### R110 — Every setting the app reads is a setting somebody can find.

**Frozen:** the README documented nine environment variables; the code read fourteen.

**Built:** a settings table covering all of them, and a test that fails when a new one
appears in neither the table nor an explicit exemption.

**Why.** Two of the undocumented five were real deployment knobs.
`MDBLIST_REQUEST_BUDGET` caps what a single deck build may spend against a metered
key — a host with a large library needs to raise it, and a host protecting a free
quota needs to lower it. `MATCHER_ALLOWED_ORIGINS` decides who may open a socket into
a household's rooms, which is a security control. The only way to discover either was
to read the source.

**The allowlist is the interesting half.** A variable is exempt only by being named in
`NOT_SETTINGS` with the reason it is not configuration — `NODE_ENV` comes from the
runtime, `MATCHER_VERSION` is stamped by CI, `CHROME_PATH` belongs to the dev-only
harnesses. So the next variable somebody adds is documented, or deliberately not,
rather than undocumented by default. A guard that only checks what exists today
catches nothing tomorrow.

The defaults in the table are checked against the code as well, because a table of
defaults that has drifted is worse than no table: it looks like an answer.

**This came out of getting it wrong.** A commit claimed the README explained the
Docker bind-mount trap when the edit had silently replaced nothing — the string
anchor did not match, the replace returned the text unchanged, and the script printed
success. The README shipped still recommending the flag that causes the bug. Prose is
the part of this repository with the fewest guards on it, and that is exactly why it
drifts.

**Not pinned, deliberately.** The obvious pin would name the exemption list, and the
pin haystack skips `__tests__` -- so it would search a corpus that cannot contain its
own subject and fail immediately. That is the second time this session a pin was
written for a file the scanner does not walk (the first was removed as T69). The
guard here is the test, which runs in the suite; a pin asserting that the test exists
would be a check on a check, and the thing it protects is one file away from the
thing it reads.

**A third time, immediately after writing that down.** The paragraph above was
committed, and then a pin was added for the new failure message — in the DOCS group,
whose haystack is `README.md` alone, for a sentence that lives in `OPERATING.md`. It
failed for the same reason as the other two: the corpus could not contain the subject.

Three occurrences in one session, the last one minutes after documenting the first
two, is not a memory problem. It is a shape problem: the pins file has four haystacks
(`APP`, `APP + CSS`, `README`) and nothing at the point of writing a pin says which
one a given group searches. The failure message now names the scope, which is the
part a reader sees when it goes wrong — but the honest note is that documentation did
not stop the person who had just written it.

**Fixed at the shape, not just written down.** Each pin group now carries a
description of its own corpus, and the failure prints it: a lost DOCS pin says
*"Searched: README.md only. Not OPERATING.md, not CLAUDE.md, not docs/."* That is the
sentence all three mistakes needed, at the moment each of them happened, and it costs
one string per group.


### R111 — Signing in must not destroy the seat that asked for it.

**Frozen:** `setAuth` ended with `socket.disconnect().connect()`, so the handshake
would carry the new token.

**Built:** the token is handed to the socket that is already connected, over an
`auth:token` event.

**Why.** On the default `MATCHER_AUTH=requests`, "Any Movie" — the mode the README
leads with — is reachable only through a sign-in raised from the lobby. Signing in
tore the socket down. The server sees that as the member leaving, and a lobby leaver
is deleted outright along with their seat secret. So the person who tapped the
feature lost the room they had just read the code out for; if they were alone, the
room went with them, and the client was told *"This room is gone — the server
restarted."* The `updateSettings({ scope: 'wide' })` that started it was then refused
as "You are not in a room" and swallowed.

**And R108 made it worse.** With other members already ready, the fix that stopped a
lobby drop stranding a room now started the knockout on the signer's "departure" —
locking them out for good, with the second rejoin refused as "Room already started".
A correct fix to one bug amplifying another is the ordinary way a system gets worse
while every commit gets better.

**Reproduced before fixing, and after.** A probe against the running server tore a
socket down and back up, then tried to reclaim the seat: *"Room PSBK not found"* —
the room was gone, not just the seat. After the change, the same socket adopts a
token and keeps both its seat and its settings.

**Two details worth keeping.** The handshake is still read, because a genuine
reconnect must carry the token. And the live token is held in a map keyed by socket
id rather than in `socket.data`, which several handlers replace wholesale — storing
it there would have made signing in work and then silently un-authenticate the member
on their next action.

Sign-out clears the server side too. Now that a live socket can adopt a token, it can
also be left holding one the browser has forgotten: signed out here and signed in
there.

### R112 — A seat is held by a socket, not by a member.

**Frozen:** the disconnect handler acted on whatever seat the dying socket
remembered.

**Built:** it acts only if that seat still belongs to that socket.

**Why.** socket.io declares a dropped connection dead on its own clock — a 25s ping
interval and a 20s timeout, so up to about forty-five seconds. A phone that moves from
wifi to cellular, or loses signal for a moment, notices immediately and rejoins long
before the server reaps the old socket. That stale disconnect then evicted somebody
sitting right there: deleting their lobby seat, or marking a present swiper
disconnected — and `connected` is the sole test of who can stall a room, so it could
resolve a knockout or declare a points winner without them.

Nothing bound a seat to a socket. `grep` for it and there was nothing to find.

**Unknown seats answer true.** A room reaped by the TTL, or a socket predating the
map, must still be able to clean itself up; the check exists to reject a *contested*
seat, not to require registration.

Kept off the `Room` for the same reason as the seat secrets (R86): `viewFor` builds a
member's view by spreading the room, and which socket holds a seat is not the room's
business.

**Proved on real phones.** `npm run e2e:two` now runs a fourth room where a member
goes offline for five seconds, comes straight back, and the harness then waits out the
full server timeout before checking she is still there. The wait is the whole point —
the eviction happens on the server's clock, not the phone's, so a test that checked
immediately would have passed against the bug.

### R113 — A confirm that replaces its own trigger has to take the focus.

**Frozen:** both confirmations on the winner screen swapped themselves in where the
button that opened them had been.

**Built:** each is a labelled group that takes focus when it appears, and the busy
button says what it is doing.

**Why.** React unmounts the pressed control, so focus falls to `<body>` and a screen
reader is told nothing: the screen changed and the next tap either throws away what
the room agreed on or spends somebody's disk. This is the failure R52 fixed on the
winner heading and R31 on the details sheet, in the two places where getting it wrong
is most expensive — and it survived both because neither of those rulings was about a
control that deletes itself.

`data-app-focus` so no ring is drawn (R80): nobody navigated here.

The sending state had no accessible name at all. Its only child was an `aria-hidden`
spinner, so a screen reader user pressed "Yes, ask" and the button went silent — the
one moment in the app where silence and success look identical and the difference is
a download.

### R114 — Photograph the branch, not the happy path.

**Frozen:** every winner capture ran in local scope, where the film is always on the
server.

**Built:** the Any Movie pass drives a not-held film all the way to the winner screen
and opens the request confirmation.

**Why.** `held` is true in every local-scope room, so the entire download-disclosure
branch — the cost line, the request control, the confirmation that states what asking
costs — had only ever been read as source, never seen. Two separate false claims
survived in that copy because of it: R107's promise of an approval gate, and R111,
where the fix for R107 missed one of the four sites and shipped for hours in the one
place a person reads immediately before pressing the button.

The screenshot is now the check. `12-request-confirm.png` shows the bar, the cost
line, and the confirmation in a single frame, so the next contradiction between them
is visible rather than deducible.

**The send is never pressed.** "Request via Jellyseerr" opens the confirmation; the
send is "Yes, ask" inside it, and the capture stops there. A screenshot script that
can spend the host's disk is not a screenshot script.

### R115 — The gate can execute the client.

**Frozen:** no test in twenty-nine files rendered a component or ran a hook. The
client was reachable only as text.

**Built:** `jsdom` and `@testing-library/react` as dev dependencies, a vitest config
that opts individual files into a DOM, and the first rendering test — on the winner
screen.

**Why.** Every client defect this project has found was caught by a browser harness,
by a board member reading source, or by looking at a screenshot: a focus ring on a
heading nobody navigated to (R80), a sheet that blurred nothing (R81), a focus trap
closed over null (R83), a failure panel hiding the room it explained (R98), a phone
stranded on a room it could not hear (R101), a confirm that deleted the control that
opened it (R113). **Not one could have been caught by `npm run gate`.**

The browser harnesses are better evidence and they stay — `e2e:two` drives two real
Chrome instances through four rooms. They also need a live Jellyfin and a running
server, so CI never runs them. Between a push and a person noticing, the client had
no automated check at all.

**The winner screen first**, because that is where being wrong has cost the most:
it holds the only control that spends somebody else's disk, and three rulings exist
(R90, R107, R111) because a sentence on it was wrong. Two of the three were copy
chosen by a branch — precisely what reading source makes easy to miss and rendering
makes obvious. R111 shipped for hours because R107 fixed three of four sites and
nothing rendered the fourth.

**Verified by reintroducing the bug.** Putting R111's sentence back turns two of the
nine cases red in under a second. Four board rounds and a human reader were needed to
find it the first time.

**Node stays the default environment.** Most of this suite is server and library code
with no use for a DOM and no reason to pay for one; files opt in by name. And the
cleanup is explicit, because auto-cleanup only registers when vitest runs with
globals enabled — without it every assertion reads the text of every render before
it, and a test that greps for a sentence passes on one an earlier test drew.

**Extended to the controls a person touches.** The failure panel and the vote row,
for the same reason as the winner screen: both have already cost something. R98 took
the whole room and offered no way out of it; R95 printed a scale nobody could read on
the screen a person uses fifty times a night.

Both were verified the same way — reintroduce the bug, watch the test go red.
Restoring R98's missing control and R95's `opacity-70` fails two of the nine cases.
A rendering test cannot measure contrast, but it can insist the class that caused it
is gone, which is the cause rather than the symptom.

`RoomClient` is deliberately not covered yet: it calls `useRoom` internally and opens
a socket, so testing it means mocking the hook. That is a different piece of work and
worth doing on its own rather than smuggled in behind two prop-driven components.


### R116 — The screen chooser is testable too.

**Frozen:** `RoomClient` was uncovered, because it calls `useRoom` and that opens a
socket.

**Built:** the hook is mocked and the chooser is rendered.

**Why.** `RoomClient` decides which of six screens a phone is looking at, and two of
this project's worst client failures were decisions *it* made rather than anything a
component drew.

R98 — a deck-build failure is unrecoverable by construction, and nothing cleared a
diagnosis, so the panel stayed up for the session, hiding the KNOCKOUT the server had
already restored. R101 — a refused rejoin cleared the session and set an error but
left `userId` set, so the join gate never rendered and the phone kept showing a room
it received no broadcasts for.

Neither is visible in any single component. Both are visible here, and both are now
caught independently: reintroducing R101 fails the join-gate case, reintroducing R98
fails the way-out case, and neither failure touches the other.

**Mocking the hook is the whole trick, and it is not a compromise.** What was wanted
was never the socket — it was the branch. Replacing `useRoom` wholesale gives every
combination of room state, diagnosis and seat directly, including ones that are
awkward to reach against a live server: a thin-deck notice that must stay a strip
while the room renders underneath it, and a refused rejoin carrying its reason.

The last piece of the client the gate could not execute is executable now.

### R117 — The socket module is executed, not read.

**Frozen:** `src/ui/socket.ts` was reachable only as text — `validate.test.ts` greps
it for event names, which proves the strings are spelled the same and nothing about
what they do.

**Built:** eight cases that run it, with `socket.io-client` mocked.

**Why.** Two of this project's most expensive bugs live in this file. R111 — `setAuth`
ended with `disconnect().connect()`, and the server reads a teardown as the member
leaving, so signing in to unlock the mode the README leads with destroyed the seat
that raised the login. R86 — the seat secret is what makes any silent reconnect
possible, and if it is not stored beside the user id every rejoin after a phone lock
is refused.

The first assertion is the one that would have caught R111 outright: `disconnect` is
never called, and `auth:token` is emitted instead. Reintroducing the old line fails
it in milliseconds.

**Two environment facts worth writing down**, because both cost time and neither is
guessable.

`jsdom` here exposes **no** `localStorage`, with or without a real origin. The obvious
diagnosis — opaque origin, therefore no storage — is wrong: setting a URL changes
`window.location` and brings no storage with it. A file that needs it provides its
own, which is honest for what is being checked. The app wraps every access in
`try`/`catch` precisely because a private-mode browser can refuse, so what matters is
which keys it writes and what it does with what comes back, not the storage engine.

And `vi.mock` is hoisted above imports, so a module under test has to be pulled in
with a dynamic `import` after the mock is declared, or it binds the real socket
client before the fake exists.

### R118 — The runtime slider is a 44px target.

**Frozen:** a bare `<input type="range">` whose only styling was `accent-maybe` — a
colour, not a size.

**Built:** a 44px-tall control with a 28px thumb on a real track.

**Why.** With no size given it took the user agent's default: about 15 CSS px tall,
measured off the shipped capture. Every other control in the app is 44, 52, 60 or 62,
and this one was shorter than the 26px chip R39 threw out as *"a target a tremor
cannot hit"* — on the control a household reaches for when somebody has school in the
morning. `README.md` promised, unqualified, that nothing you tap is under 44px. It
was the only control in the app that made that sentence false, and I had written that
sentence an hour earlier while fixing a different false claim in the same line.

A native range takes a touch anywhere on its box, so the width was never the problem
and the height was all of it. Still a native input, deliberately: it answers arrow
keys and announces its value and range to a screen reader, which nothing rebuilt out
of divs does as well (R06).

### R119 — The release notes are held to the same standard as the prose.

**Frozen:** `CHANGELOG.md` sat outside `sync-counts`, and drifted twelve commits
behind with three wrong numbers at once.

**Built:** its gate line is generated from `gates.json` like every other count.

**Why.** This is the third time a file has drifted because it was outside that list —
the README badges were the first, `QUEUE.md` the second — and each time the fix was
the same one line. The changelog is the file a self-hoster reads to decide whether to
pull and redeploy, and it was the last place these numbers were written by hand.

G4's whole argument is that a gate stops false claims shipping. A claim it does not
read is a claim nobody checks, and "nobody checks it" is not a property of the file,
it is a property of the list.

### R120 — The evidence has to reach the rows it is about.

**Frozen:** one 200%-text capture of the lobby, taken at the top of the list.

**Built:** a second frame, scrolled to the settings rows.

**Why.** At a 32px root the lobby runs well past the dock, so the existing capture
showed the member card and the top of one setting — and everything the 200% claims
are actually about sits below it. R102 widened the label gutter so a four-character
label (`DECK`) would stop clipping; R118 resized the runtime slider. **Neither row
appeared in any capture at that size.** The board found the slider absent from the
frame while checking whether it was too small, which is the sharpest possible way to
learn that a picture stops short of its subject.

Both are now visible: `DECK` renders complete, and the slider is plainly a target
rather than a hairline. Two rulings that rested on argument now rest on pixels.

**Scrolled to the row, not to an offset.** The first attempt scrolled by a guessed
number, landed past the settings on the member list, and produced a photograph of the
wrong thing — R85 again, in the harness written after R85. It finds the row by its
text now.

### R121 — Five mistakes in one session were one missing haystack.

**Frozen:** pins searched the app, `globals.css`, or `README.md`, and nothing else.

**Built:** a fourth haystack for the two browser harnesses, with its own group.

**Why.** Five pins this session were written for files no haystack walks, and four
were about `screenshots.ts` or `e2e-two-phones.ts`. Each was deleted as "a pin that
cannot see its subject", which was correct each time and stopped being an
explanation somewhere around the third.

It is one missing haystack, not five lapses. Those files encode decisions that cost
real money to get wrong: **never press the control that spends the host's disk**,
focus before clicking, wait for a genuine row rather than for the screen, one browser
context per phone. Every one of those is a lesson bought by a failure, and none of
them had anywhere to be protected.

`scripts/` stays out of `appSources` — the gate and the generators are not the
product, and putting them in would let script text satisfy pins about the app. The
harness gets its own corpus and its own group instead, so a claim about a harness has
an honest home and cannot be smuggled into a claim about the product.

**The failure message is what made this visible.** R110 made a lost pin name the
corpus it searched; without that, the fifth occurrence would have looked like a
sixth deleted string rather than a pattern with a shape.

### R122 — The knockout, rendered.

**Frozen:** four states, two ever photographed, and one of those two by mistake.

**Built:** eight cases covering the skeleton, the checkbox round, the wait and the
elimination round.

**Why.** This screen has the most states in the app and the least evidence. Every
`04-knockout.png` committed for months was the **skeleton** — shipped above the fold
in the README with alt text promising a list of genres (R85). The loading state is
also the one a screen reader used to meet in silence, which is why it carries a
`role="status"` label; removing that label now fails a test in milliseconds, where
before it took a board member reading the source.

The elimination cases hold R46 and R61 in place from the rendering side: the screen
shows a bare count and must not be able to name anybody, because the promise that
nobody sees who is slow is a server promise and not a rendering convention.

**One test was wrong and the app was right.** The first version asserted a vote count
on the elimination ballot; the screen shows "3 left · 2 survive" there, and the count
appears only once *you* have answered — before that the screen is a ballot, not a
progress report. The correct move was to fix the test's setup rather than to make the
app match a guess, and it is worth writing down because the opposite is always
available and always looks like progress.

### R123 — The deck, rendered.

**Frozen:** the screen a person spends the whole evening on had no rendering
coverage, and its most important sentence had never been rendered by anything.

**Built:** twelve cases across the card, the disclosure, the undo and the peer count.

**Why.** Everything on this screen has already cost something. The cost line is what
tells a room that a yes can spend the host's disk, and it was wrong **twice** — R91
promised a size the app cannot know, R107 promised an approval gate it does not
control. The undo row exists because R48 found the deck is the one place a slip takes
something you cannot get back. The peer count is deliberately a number and never a
name (R46, R61).

And until now the only evidence for any of it was a screenshot — of the *local-scope*
deck, where the cost line does not render at all. The sentence that matters most was
checked by nothing that ran (R114).

**Verified by putting two of those bugs back.** Restoring R107's approval claim and
removing R48's undo turns three of the twelve red. Both took a board round to find the
first time; both now fail in a quarter of a second.

Every screen a person meets during a night — home, join, lobby, knockout, deck,
details, winner — is now either rendered under the gate or driven by two real browsers.

### R124 — A guard cannot see a blind spot it is looking through

Two things, and the second is why this ruling is worth reading.

**The lobby, rendered.** R115 through R123 put the client under the gate one
screen at a time. The lobby was last and had the most at stake: it is the screen
with the most settings on it, and two of this project's defects lived there.
R118 — the runtime slider that took the user agent's default, about 15 CSS px,
against the app's own 44px floor — and R111, where tapping the control that
needs an account destroyed the seat that raised the login. Nine tests. The R118
one asserts the class that sizes the thumb is applied and the colour-only class
that replaced it is not; a rendering test cannot measure a thumb, but it can
insist on the cause. The R111 one taps "Any Movie" and asserts `updateSettings`
was **not** called: the tap must raise the gate, not quietly change the setting.

**The rulings index had been lying for twenty-four rulings.** `scripts/rulings.ts`
generates `docs/RULINGS.md`, and gate G8 regenerates it and compares. Its
citation pattern was `\bR(\d{2})\b`. "R120" matches "R12" and then fails the word
boundary on the trailing zero — so every ruling from R100 on was absent from a
document that stated a total and closed with the sentence "No ruling is
orphaned." The index said 95. There were 119.

G8 passed every single time, because generate and `--check` share that regex.
The check compared a blind generator against its own blind output and found them
identical, which they were. This is the same failure as R110's unscannable pins
and the same as the README that agreed with itself: a guard whose corpus is
defined by the thing it is guarding cannot report on what falls outside it.

So the fix is not only the wider pattern. `docs.test.ts` now counts the `### Rnnn`
headings with a pattern written separately — deliberately `\d+`, not `\d{2,3}`,
so a ruling numbered past 999 is found rather than silently dropped again — and
insists the index contains every one, and reaches the highest that exists. Put
the two-digit regex back and G8 still passes while those tests name all
twenty-four missing rulings. That difference is the whole ruling.

The rule this generalises to: **when a generator and its checker share a
pattern, the pattern is unguarded.** Cross-check it from outside, with code
written at a different moment, or do not claim the thing is complete.

### R125 — The details sheet, and where a rendering test stops

The last component with no test. Seventeen cases: the portal, the focus
handling, the trailer that reaches no network until asked, the ratings named in
words rather than by their API keys, the unknown year admitted rather than left
blank.

The portal one is the shape worth keeping. R81 moved this sheet to
`document.body` because it is written inside the deck — a stack of animated,
overflowing, translucent panes — and a frosted pane only blurs what its nearest
backdrop root painted. Any ancestor with a filter, an opacity below 1, or a
will-change becomes one, so the sheet was translucent over the poster without
blurring it, and the vote row's No/Maybe/Yes read straight through the synopsis.
Chasing which ancestor is at fault fixes it until somebody adds another. So the
test does not assert a class or a computed style; it asserts the dialog is *not*
inside the container it was rendered into and *is* in the body. That property
cannot be broken by adding a pane.

**The part worth writing down is what these tests do not catch.**

R83 was the sheet handing focus, on close, to the element it was unmounting —
itself — so Escape dropped a keyboard user onto `<body>` and the rest of the
deck was gone. It was found by the behavioural check in `scripts/screenshots.ts`
and by nothing else, because every unit test was green.

The obvious thing to write here was a test that reproduces it, and the obvious
thing to write in the comment was "R83, exactly". Both were checked instead.
Restore `a4dfbc9^` — the exact buggy effect — and all seventeen of these tests
still pass. jsdom's effect cleanup focuses the opener before the setup re-reads
`document.activeElement`, so the state self-corrects and the browser-only
failure is invisible. Deleting the focus restore altogether does turn two of
them red, which is the real, weaker claim they guard: focus is handed back to
the opener, and is still handed back after a re-render.

So the file says that, and does not say R83. The harness keeps R83.

The rule: **a rendering test and a browser test are not substitutes, and the way
to find out which one you have written is to reintroduce the bug.** R124 was a
checker that shared its subject's blind spot; this is the same error one step
earlier — a test whose comment claimed more than the test could see. The
difference between them is one mutation run, and it is the cheapest honesty
available in this repository.

### R126 — One row was a step smaller than every other row

The lobby's runtime title was `text-body`, 0.875rem. Every other row title in
the app — `Listing.tsx`'s, and the deck-size rows immediately below it in the
same list — is `text-row` at 1rem with `tracking-[-0.01em]`, inside a grid with
the identical `grid-cols-[3.625rem_1fr]` gutter. So the one row that carries the
only continuous control in the app announced itself in a smaller voice than its
neighbours, and nothing about the layout explained why.

Filed by the design director in round six as explicitly not blocking, and it is
not. It is here because a scale with one exception is not a scale, and because
the exception is cheaper to remove than to remember.

The test asserts the class rather than a computed size, and says in its own
comment that it covers one row and does not prove the others right. That
scoping note is R125's rule applied at the moment of writing rather than after.

### R127 — A git worktree inside the repo is a test file the gate will count

Found by accident while mutation-testing R126: a run of one test file reported
**9 files and 82 cases**. Eight agents were working in isolated worktrees, and
the harness puts them at `.claude/worktrees/`, inside the repository. Those are
full checkouts. Vitest's default exclude covers `node_modules` and `dist` and
has no reason to know about this one, so every test file existed nine times.

`.claude/` is gitignored, so nothing reaches a commit — which is exactly why
this is worth writing down rather than shrugging at. Gate G4 reads these counts
and enforces them as floors, and `sync-counts` writes them into four tracked
documents. Run either while a workflow is live and the number that lands in the
README is a multiple of the truth, in a repository whose entire argument is that
a gate stops false counts from shipping.

And the copies are not inert. An agent mid-mutation is holding a deliberately
broken checkout, so its copy of a test fails and vitest reports the failure
against a path that reads like the real one. The first mutation run for R126
showed two failures; exactly one was mine. Attributing the other cost more time
than the fix.

`exclude` now names `.claude/**` explicitly. The general form: **anything that
materialises a second copy of the tree inside the tree is indistinguishable from
the tree, to every tool that globs.** Worktrees, backup directories, a `cp -r`
left behind by a script. If the counts are load-bearing, the glob has to be.

### R129 — Half the suite's claims did not survive their own bug

R125 found one test file whose comment claimed more than it could see. This is
what happened when that question was asked of everything: eight agents, each in
an isolated worktree, reintroduced the historical defect behind every claim the
render tests make — taking the real code out of git history wherever it existed
rather than inventing a plausible mutation — and recorded whether the test that
names that claim went red.

**97 claims. 44 sound, 4 weak, 49 hollow.**

Not all 49 are defects, and the audit said so itself. R97 is guarded by
`unanimousNo.test.ts`, R99's mechanism by `handlers.test.ts`, R86 by the
typecheck, R85's capture half by the screenshot script. A rendering test that
does not reach the server is not lying unless its comment says it does — and
where a comment did say it, the comment was the thing that was wrong.

The rest were real, and they fall into a small number of shapes worth naming,
because each is a way of writing a test that feels thorough and is not:

- **An assertion satisfied by its own neighbour.** R54's "which system failed"
  was `toContain('Jellyfin')`, a substring of the headline asserted one line
  above it. Deleting the row that names the system changed nothing.
- **Reading the DOM where the claim is about the screen.** R18/R26 used
  `textContent`, which includes `sr-only`, so a glyph-only vote row passed.
- **A negative pinned to one wording.** R107's guard forbade one exact phrase,
  so the same false promise in other words shipped green. R91's `/\d+\s?GB/i`
  matches neither "gigabytes" nor "MB" nor the sentence it was written to kill.
- **One route checked where two exist.** R95 forbade a dimming *class*; an
  inline style dimmed the identical pixels invisibly.
- **The control asserted and never pressed.** Twelve cases named R48's undo row
  and its copy; disconnecting the handler left all twelve green.
- **A fixture that renders one branch.** Every case in the screen chooser used
  one room status, so three of six branches could be rewired silently. Every
  case in the knockout skipped the checkbox wait. No case in the winner screen
  ever set a ranking.
- **A mock that discards the thing under test.** The socket's `io()` returned a
  fresh literal per call and ignored its options, so five claims — the single
  socket, `socket.auth`, the handshake token, the R99 deadline — could not be
  observed at all. A mock that throws away what it is standing in for is not a
  double, it is a hole.

Twenty-three are fixed, each re-run against the exact mutation that had passed
it. The rest are recorded in QUEUE.md with their mutations, so they are
verifiable rather than a matter of opinion.

**What this does and does not mean.** The product defects these rulings describe
were real and remain fixed; the audit undercuts the evidence, not the fixes. But
the evidence was the argument. A repository whose whole claim is that a gate
stops false claims from shipping had 597 green cases proving materially less
than their number implied — and the number is printed in four tracked documents
and enforced as a floor.

The rule: **a count of passing tests is not a measurement of anything until the
tests have been made to fail.** Coverage says which lines ran. Only mutation
says whether anybody was watching.

### R130 — What leaves the house, and an exclusion list with a hole in it

Gate U9 asks what an acquirer's due diligence and a Jellyfin maintainer both ask
first: what am I taking on legally, and what does this send where. Neither had an
answer in this repository, so `docs/DEPENDENCIES.md` is the answer and
`server/__tests__/provenance.test.ts` keeps it true.

The legal half was quick and clean. Nine runtime dependencies, all permissive,
no copyleft — read out of each installed package's own manifest rather than a
lockfile summary. The one problem was ours: `LICENSE` has been MIT since the
first commit and `package.json` declared no `license` field at all, so npm, an
SBOM generator and a dependency scanner all saw an unlicensed package sitting
beside a permissive licence file.

The interesting half is the destinations. There are five, and the core loop
needs exactly one of them — Jellyfin, which the user already runs. MDBList is
optional and a night runs unscored without it; Jellyseerr is only touched in Any
Movie mode; YouTube is never contacted until somebody presses the trailer button
(R29). That is a good answer and it had never been written down.

**The one worth arguing about is `image.tmdb.org`.** In Any Movie mode a
candidate that is not on the server takes its poster straight from TMDB and it
is rendered as a plain `<img src>` — so the request is made by *every phone in
the room*, not by the server. `SwipeDeck` also preloads the next cards, so it
goes out for films nobody has looked at yet. TMDB, and every network between the
phone and TMDB, can see what a household is browsing on a Friday night.

That is not a credential leak and it is not unusual for a media app. It is
written down because U9's question is not "is this normal" but "would somebody
adopting this be surprised", and they would. Three options are recorded in
`DEPENDENCIES.md`; proxying is the only one a privacy mandate would accept and
disclosure is the minimum honest thing. The decision is in QUEUE.md, not taken
here.

**The lesson is in the guard, not the finding.** The provenance test filters out
placeholder hosts — `.local`, `.example`, localhost, bare IPs — before comparing
against its allow list. That filter was written unanchored, so `.example`
matched anywhere in a name. A mutation adding
`https://telemetry.example-vendor.net/collect` to a real source file was
silently classified as a placeholder and the test passed.

Caught only because the guard was mutation-tested the moment it was written,
which after R129 is now the habit rather than the exception. **An allow-list
guard is only as strong as its exclusion list, and an exclusion list is the part
nobody reads.** Anchor it, then try to sneak something past it.

### R131 — Say what you expose, at boot

The README has warned since `d44ea44` that a public hostname is not safe on the
default auth mode: creating and joining a Jellyfin-only room need no account, so
anyone who reaches the URL reads every title in the library. That warning is in
a document. What gets deployed is a container, and whoever deployed it reads
`docker logs`, not a README they skimmed a week ago.

So the server now states its own exposure at boot: the auth mode, an ordered
list of what somebody with only the URL can do — worst first, because a log line
is skimmed, and "SPEND YOUR DISK" is in capitals because on `MATCHER_AUTH=off`
an anonymous visitor can cause a download — and either "safe to expose" or the
two real mitigations by name.

It also refuses one thing. `MATCHER_PUBLIC=1` is the operator telling us the
host is reachable from outside the house. Once they have, a mode that leaves the
library open is a misconfiguration rather than a choice, and serving anyway
would be the app knowing better and saying nothing. Opt-in, so it breaks nobody
who has not told us where they are.

**This does not close gate U4 and the tests say so in their own comments.** U4
asks for a safe *default*, and the default is still `requests`. Making it safe
costs the four-second guest join, which is most of why the app works on a Friday
night — a product decision, queued rather than taken. What this closes is the
smaller gap that was nobody's decision at all: the operator was never told, by
the running process, what their configuration permitted.

### R132 — The deadline covered the headers and not the body

`withDeadline` wraps every outbound call so a Jellyfin that accepts a connection
and never answers cannot hang a deck build forever (R65), and it renames the
bare abort into `No answer from <host> within <ms>ms`, because "The operation
was aborted" tells a host nothing about which service went quiet.

It wrapped the `fetch` call, which settles as soon as the response *head*
arrives. Reading the body happens afterwards, at the call site —
`jellyfin.ts` ends `jellyfinGet` with `return res.json()` — and that is outside
the try/catch. The signal still fires and still aborts the body stream, so a
slow body rejected with a bare `DOMException`: no host, no duration, no cause,
none of the diagnosis this module exists to provide.

Which is the wrong half to be missing. Headers come back fast from a
healthy-but-loaded server; it is the **body** that is slow, and it is slow in
exactly the case that matters. Found while benchmarking a 50,000-item library
for gate U10: headers at 37ms, `res.json()` aborted at 422ms against a 400ms
deadline, escaping unnamed. The bigger the library, the more likely the failure
and the less useful the message.

Fixed at the wrapper rather than the call site, for the same reason the deadline
is applied at config level in the first place: an endpoint added later cannot
forget it. The returned Response has `json`, `text`, `arrayBuffer` and `blob`
wrapped to name an abort the same way.

One detail worth keeping: the match is on `err.name` alone now, not
`instanceof Error`. An aborted body rejects with a `DOMException`, and whether
that is an `instanceof Error` varies by runtime and version — so the stricter
check would have let the very case this exists for slip through unnamed on some
hosts and not others.

### R133 — Two claims the interface did not keep

From the WCAG 2.2 AA audit (gate U7), which found nine failures, six at Level A.
These two are fixed here; the rest are listed in `docs/ACCESSIBILITY.md` with
what would verify each.

**The slider announced its index.** `4`. The input is bound to
`RUNTIME_STOPS.findIndex(...)`, so what a screen reader read out was an ordinal
into an array the listener cannot see — while the comment three lines above it
claimed "the current and available values are announced". `aria-valuetext` makes
that comment true, and the test also asserts the spoken text matches the visible
label, so a second vocabulary cannot grow that only screen-reader users meet.
`findIndex` also returns `-1` for a runtime that is not one of the stops, which
put the thumb below `min`; it is clamped.

**The installed app refused to rotate.** `orientation: 'portrait'` in the
manifest, which locks a phone in a stand or somebody who holds a device one way
because of how they sit (1.3.4). The layout is a single column and reflows
either way, so the lock bought nothing and cost a criterion.

Both are the same shape, and it is the shape R125 and R129 are about: a claim
made in a comment that the code did not keep, with nothing able to tell the
difference.

### R134 — A control you can see and cannot say

WCAG 2.2 A 2.5.3 requires a control's accessible name to contain the text shown
on it, so somebody driving a phone by voice can say what they can see. Two
controls failed, and both failures are the kind that only a person using the app
that way would ever notice.

The knockout's abstain row **reads** "No preference" and was **named** "Abstain
— go with the room". Not one word in common, so "click No preference" did
nothing at all. That is the control R47 added *for* the person who does not want
to invent an opinion, and it was the one control a voice user could not reach.
The deck's undo row read "Undo — <film>" and was named "Undo your vote on
<film>".

Both are one-line fixes. The interesting part is the check.

Pinning the two instances would have left the third to be found by a user, so
the test walks every labelled control on four screens and asserts the
relationship. Getting that right took three attempts, and each wrong version is
worth recording because each was wrong in a way that looks right:

1. **Too broad by element.** It walked every `[aria-label]`, which flagged the
   vote row's `role="group"` labelled "Vote" and the details sheet's dialog
   label. Both are correctly labelled *containers* whose text is other controls.
2. **Too broad by text.** Reading `textContent` concatenated a row's gutter tag
   with its title, so a control that reads perfectly on screen failed on
   "backundo" — a word no human would ever say.
3. **Too strict by rule.** It demanded every visible word appear in the name,
   which failed the *fixed* abstain row for the sentence beneath it, "Counts as
   voted, weighs nothing". Nobody says that to operate a control.

Version three is the dangerous one, and not because it was inconvenient: **a
check that fails correct code teaches the next reader to delete it.** The rule
now compares the name against the control's *label* — the first substantive
visible run, skipping the short all-caps gutter tags and the glyphs — which is
what the criterion is actually about.

Both defects are in `mutations.json`, so G9 puts them back on every gate run.
The first mutation attempt did not catch the abstain case, because the test
rendered the checkbox phase and that control lives on the elimination ballot:
the test was named for a screen it never drew. Found by running the mutation
rather than by reading the test, which is the whole of R129 restated.

### R135 — Every ring in the app was invisible

WCAG 2.2 AA 1.4.11 asks that the boundary of a control reach 3:1 against what is
behind it, where that boundary is what identifies the control. Every text input
in this app was `ring-1 ring-white/15` over `bg-white/[0.07]` — a fill differing
from its container by seven hundredths of white, ringed by a line whose **best
possible** contrast, composited over pure black, is 1.39:1. The real ground is
lighter, so it is worse than that. Nothing else marked the field. That ring was
the entire visual claim that there was a box there to type in.

This is arithmetic, not taste, and it needed no screenshot to find — which is
why it is a little embarrassing that it survived a redesign, a contrast ruling
(R89), a measuring command (`npm run contrast`) and six board rounds. The
measuring was pointed at text, and a ring is not text.

The fix was already in the repository: `--color-border`, which R89 raised to
`#737e77` and measured at 3.57–3.80:1 off the committed captures precisely
because it marks a boundary that has to be seen. The inputs now use it.

**The guard computes the ratio rather than trusting the token's name.** It
parses `--color-border` and `--color-background` out of the stylesheet, does the
WCAG luminance arithmetic, and fails with the number: darkening the token to
`#2b312e` reports "1.46:1 on the ground; 1.4.11 wants 3:1". A test that asserted
`ring-border` was present would have passed that mutation happily, which is the
R129 shape — guarding a name instead of a value, exactly as T118 guarded the
existence of a `.slider` rule while its height went back to 15px.

Two things I got wrong writing it, both worth keeping because both look right:

- The token pattern was built in a template literal, so `\s` became a bare `s`
  and the check reported a token that is plainly there as missing. **Third time
  in this one file.** Constructed regexes are now banned in it by comment.
- The element pattern was `<input\b[^>]*>`, and these inputs carry
  `onChange={(e) => ...}` — an arrow function contains a `>`, so the match
  stopped mid-element and reported a correctly-ringed input as unringed. A
  false failure, which is the more expensive kind: it teaches the reader to
  distrust the check.

The ghost buttons and the ratings tiles are still under 3:1 and are deliberately
left. Their label identifies them, so the criterion is arguable there; for a
text input it is not arguable at all. That distinction is in
`docs/ACCESSIBILITY.md` rather than silently in a diff.

### R136 — The numbers the room watches were silent

WCAG 2.2 AA 4.1.3 asks that a status message be announced without taking focus.
R22, R85 and R113 already put live regions on the deck's card announcement, the
loading skeleton, the waiting screens and the request result. Three counts were
missed, and they are the three that matter most, because they are the ones that
move when **somebody else** presses something:

- The lobby's "N of M ready". This is the lobby's entire job. People press "I'm
  ready" on their own phones and the number changes on everybody else's, with
  focus nowhere near it. A screen reader user was told nothing until they went
  looking, on the one screen whose purpose is to say whether the room can start.
- The deck's "N of M others finished". R46 made this a bare count on purpose —
  Ade could see the room watching him be the slow one — but the count is exactly
  what the room *is* allowed to know, and it changes only when somebody else
  finishes, never when you do.
- The knockout's "N of M in" and "N left · 2 survive".

The tell they share is worth naming, because it is what to look for next time:
**a value that changes for a reason the reader did not cause is a status
message.** A number you moved yourself needs no announcement — you already know.

So the live region is opt-in, not automatic. `Row` takes `live`, `Bar` takes
`liveRight`, and both default to off. A screen full of polite regions is a
screen that talks over itself, and the criterion is not "announce everything".

Two things this broke, both correctly. `getByRole('status')` in the knockout
tests started matching several elements, and `container.querySelector('[role=
"status"]')` in the accessibility tests started selecting the new visible count
instead of the card announcement it was written for. Both now select the
`sr-only` region explicitly. Neither was a bad test; both were queries that
assumed there would only ever be one of something, which is a fair assumption
right up until it is not.

### R137 — The vote buttons were 116px below a screen that could not scroll

WCAG 2.2 AA 1.4.10 asks that content work at 320 CSS px wide — a 1280×1024
desktop at 400% zoom, which is a **320×256** viewport. Nothing in this
repository had ever been rendered at it. `screenshots.ts` shoots 402×874,
`measure-rows.ts` measures at 402, every capture in `docs/screenshots` is that
one phone. So the audit could only grade Reflow *unverified*, with a reasoned
suspicion about height.

`scripts/measure-reflow.ts` settles it, the way `measure-rows.ts` settled the
row question: compiled stylesheet, real class names, real Chrome, three
viewports. The suspicion was right and worse than predicted.

At 320×256 the vote row's bottom edge sits at **372px** — 116px below a surface
that `h-dvh overflow-hidden` made incapable of scrolling. The controls the deck
exists for were simply unreachable. The buttons also wrap to two rows at 320px
wide, which the audit's reading had not predicted.

**R21 is not wrong.** The no-scroll rule exists because a deck that scrolls is a
deck where the vote row slides under your thumb mid-swipe, and that holds at
every height a phone has — confirmed by the same run: 320×568 and 402×874 are
unchanged, everything inside the viewport, nothing scrolling. It stops holding
at 256px, where there is no layout that fits and the choice is between a control
that moves and a control you cannot reach. **A control you cannot reach is
worse.** So below 520px of height the shell releases.

Releasing the shell was not enough, and the measurement is what said so: each
screen is a `flex min-h-0 flex-1 overflow-hidden` child that clipped its own
contents to the shell's height, so the vote row did not move at all on the first
attempt. Direct children only — the card's own `overflow-hidden` is what rounds
the poster.

Three mistakes worth keeping:

- The harness picked the **largest** stylesheet in `.next/static/css`, and
  `next build` leaves old hashed files behind. It spent a cycle reporting that a
  rule I had just verified in the built CSS was not taking effect. Newest, not
  largest — R127's family again: a second copy where the tool looks.
- `tsx` compiles a named inner arrow into a call to esbuild's `__name` helper,
  which does not exist inside `page.evaluate`, and the whole thing fails with a
  ReferenceError that says nothing about the cause.
- **The guard was hollow and I wrote it minutes after R135.** It asserted
  `readDoc('RoomClient.tsx')` contained `app-shell`, and removing the class from
  the element left it green — because the comment above the element explains
  what `app-shell` is for. A guard satisfied by the prose describing the thing
  it guards. Found by running the mutation, which is the only reason this
  paragraph exists rather than a green tick.

### R138 — The suspicion was sound and the conclusion was wrong

The accessibility audit filed 2.4.11 Focus Not Obscured as "almost certainly
failing", and the reasoning was good: `Bar` is `sticky top-0`, `Dock` is
`sticky bottom-0`, and there is no `scroll-padding` anywhere in the repository.
Those are the three ingredients of that failure. R137 had just made the page
scroll at short viewports, which is exactly the condition that turns a sticky
bar into something that covers content — so it looked worse, not better.

It does not fail. `npm run measure:reflow` now focuses a control in the middle
of a long listing and measures its overlap with both bars: **0px at 320×256 and
0px at 402×874.** `Bar` and `Dock` are *siblings* of `.scroll-body` rather than
children of it, so the scrollport is the gap between them and a sticky element
has nothing to cover.

Two things follow, and the second is the ruling.

**No `scroll-padding` was added.** It is the standard remedy, it is one line,
and adding it would have been wrong: a remedy for a defect nobody has observed
is unfalsifiable, and it would sit in the stylesheet forever with a comment
citing a criterion it was never shown to affect. The repository already carries
enough guards whose value is assumed.

**The probe is committed even though it found nothing.** A measurement that
comes back clean is worth as much as one that comes back red, and costs the
same to write — it is the difference between "we think this is fine" and "this
was 0px on the day somebody checked". The audit's grade moved from *unverified,
suspected failing* to *probed, not reproduced*, with the probe's limits written
next to it: one synthetic listing, two viewports, `focus()` rather than a real
Tab sequence, and nothing that opens the details sheet over a focused row.

The general form, which is the opposite of R129's and worth holding beside it:
**a well-reasoned suspicion is not a finding.** R129 was about tests that claim
more than they check. This is about a claim of a *defect* resting on the same
kind of unexamined reasoning, and it deserves the same treatment — go and look.

### R139 — Asked for your name twice, by the screen after the one you gave it to

WCAG 2.2 A 3.3.7 Redundant Entry: do not ask again for something the person has
already told you in the same session. The home screen collects a name, then
routes to `/room/<CODE>` carrying nothing, and the join gate there seeds itself
from `getAuthName()` — which is null for a guest. So the one person this hurts
is precisely the one the app is friendliest to otherwise: somebody with no
Jellyfin account, four seconds into their evening, typing their name into a
second box for no reason they can see.

Carried in storage, not in the URL. A name in a path lands in browser history,
in any proxy log, and in whatever the host's reverse proxy writes to disk — and
it is the one piece of personal data this app handles for a guest. Under its own
key rather than the auth name's, because that one is who you signed in *as* and
`AuthGate` decides things from it; conflating them would make a typed name look
like a session to every reader of that module.

**The interesting part is what the mutation found.** Removing the line that
remembers the name left the entire suite green — because the *consuming* half is
covered by the screen chooser's tests and the *producing* half was covered
nowhere. `HomeActions` was the only component in the app with no test of any
kind, and had been through 139 rulings and six board rounds without anyone
noticing, this session included: R115–R125 went screen by screen and skipped it,
because it is not one of the six screens `RoomClient` chooses between.

A component that no other component renders is a component that a
coverage-by-screen sweep will miss by construction. It has a test file now, and
both halves of the fix are in the catalogue, so neither can silently rot back.

One smaller thing found on the way: the screen chooser's socket mock exported
only `getAuthName`. Once `RoomClient` also called `typedName`, that mock would
have thrown the moment a case exercised the guest path — the path the whole
ruling is about. Mocks that export half a module fail exactly where the new
behaviour lives.

### R140 — The dependency check found a real break on its first run

`.github/dependabot.yml` went in a few hours ago as part of gate U11, on the
argument that a project people install and leave alone breaks from the outside.
It opened its first pull request the same afternoon — eight dev dependencies —
and CI failed it. Two separate causes, both real, both of which would have
landed on whoever next upgraded anything:

**`environmentMatchGlobs` is gone.** Vitest deprecated it and then removed it,
and it is what routed nine files to jsdom, so every rendering test in the
project failed to collect at once. The warning had been printing on every local
run all session and I had been reading past it.

The fix is not the documented replacement. Six of the nine files already carried
a `// @vitest-environment jsdom` pragma, so the glob was quietly doing work for
three of them and duplicating the pragma for the other six. All nine carry the
pragma now and the config option is gone — better than `projects` here for a
reason unrelated to the removal: **the environment a test runs in is a fact
about that test**, and it now reads at the top of the file instead of in a glob
somebody has to go and find.

**A stylesheet import needs a declaration.** `app/layout.tsx` does
`import './globals.css'`, which is how Next takes a global stylesheet, and newer
TypeScript raises TS2882 on a side-effect import with no declaration.
`next-env.d.ts` does not cover it and is not the place to put it — generated,
often gitignored, and Next's own guidance is not to edit it. So `src/css.d.ts`,
committed, with a reason attached.

**What this is really about.** The scheduled check and the grouped updates were
justified in R131's commit as insurance against rot, which is the kind of
argument that is easy to make and impossible to evaluate until something
happens. Something happened within hours. The value was not that a bot proposed
an upgrade — it is that the upgrade was proposed *into a full gate*, on a
branch, where it failed loudly and could not merge, instead of arriving as a
mystery six months later when a security patch forced the same bump.

Both fixes are on `main` ahead of the bot, so the pull request should now
rebase onto a tree that already accommodates it. Should, not does — that is a
prediction until the rebased run is green, and it is written here as one.

### R141 — Two deploys did not happen and nothing said so

Chasing why a dependency pull request was red turned up something better. The
gate job had not failed at all: the log ends `##[error]The operation was
canceled.` The workflow declared

```yaml
concurrency:
  group: docker-publish
  cancel-in-progress: true
```

— a single literal group, shared by every branch and every pull request, with
the newest run killing whatever was in the slot. The morning the dependency bot
opened five pull requests at once, they cancelled each other **and two pushes to
`main`**.

A push to `main` *is* the deploy in this project. There is no separate step, by
design (R?, and stated in CLAUDE.md). So two deploys did not happen, and the
only trace was a grey "cancelled" in a list — which reads like somebody meant
it, and is why it sat there unexamined until a completely different
investigation walked past it.

Interpolating the ref gives each branch its own slot. Cancelling only on
`pull_request` keeps the useful half — a new commit supersedes its own older run
— while `main` queues instead, because **a deploy interrupted mid-publish is
worse than a deploy that waits.**

Two things worth taking from this beyond the fix.

**A cancelled run is not a passing run and is not a failing one.** Every summary
this project reads — `gh run list`, the badge, my own glance at CI — treats it as
a third thing that means nothing happened, and that is exactly what makes it
invisible. The two deploys that were skipped looked identical to two deploys
nobody had asked for.

**The bug was found by pulling a thread that led somewhere else.** The
investigation was "why is the dependabot PR red", the answer to that was two
genuine incompatibilities (R140), and this was sitting underneath as the reason
a *different* PR was red. Fixing only the thing you set out to fix would have
left it.

### R142 — One major blocked seven safe updates, and my prediction was half right

R140 ended with a prediction, deliberately labelled as one: with the two known
incompatibilities fixed on `main`, the bot's pull request "should now rebase onto
a tree that already accommodates it. Should, not does."

It rebased. It still failed. The prediction was half right and the half it got
wrong is the interesting half.

**Right:** G1 typecheck went green. `src/css.d.ts` fixed TS2882 exactly as
argued, verified by a real run rather than by me asserting it.

**Wrong:** everything else still failed, and not for the reason I had fixed. The
log said `Failed to load next.config.ts — Cannot read properties of undefined
(reading 'fileExists')`. The group contained **`typescript: ^5.7.0 → ^7.0.2`** —
a major, the rewrite — which `tsx` cannot drive yet. That took the production
build, every jsdom suite and the mutation audit down together, and none of it
had anything to do with `environmentMatchGlobs`.

So the fix is not another compatibility patch. It is that **a group carrying
eight dev dependencies let one of them veto the other seven**, and among those
seven are the kind that carry security fixes. That is the opposite of what a
weekly dependency check is for: the whole argument for it was that updates
arrive small and often instead of all at once under pressure.

Groups now take `minor` and `patch` only. Grouping is still right for the
routine stream — one pull request rather than nine, which is the whole reason a
single maintainer can keep up. But **a major is a decision, not a routine.** It
should arrive alone, labelled as itself, and fail alone, where the failure names
the cause instead of hiding inside seven innocent bumps.

Two smaller things this run confirmed, both by behaving correctly under a real
break rather than a staged one:

- **G9 reported `BASELINE-RED`, not a pile of kills.** With every jsdom suite
  already failing, twenty-eight mutations would each have "passed" against a
  broken instrument. The harness refused, named the suites, and said why. That
  was designed for exactly this and had never been seen doing it in anger.
- **The vitest migration in R140 was still correct**, just not sufficient. It
  had to happen for vitest 4 whatever else was in the group; it simply was not
  the thing standing in front.

### R143 — The ratings cache was quadratic in the library

Nothing inside a deck build is superlinear; the benchmark for gate U10 checked
that carefully and found field reads flat at 6.46 per candidate across a 32×
range. The quadratic behaviour is *across* builds, and it is in the cache.

`saveCache` serialised the entire cache on any night that learned anything,
while `MDBLIST_REQUEST_BUDGET` admits a few dozen new titles. So warming a large
library costs one full rewrite per night, for as many nights as it takes:
measured at **65 nights and 1.36 GB written** for a 50,000-title library. And
during all 65 of those nights most titles are unrated, which means the deck is
not ordered by what the household would like — it is ordered by whichever titles
happened to get cached first.

That last part is why this is a product defect and not a housekeeping one. The
ranking looks like a judgement and is partly an artefact of the cache's age.

**A base file plus an append log.** A night appends what it learned and nothing
else; the base is rewritten only when the log has grown to the size of the base.
That fraction is the whole design decision and it is written down where it is
set: a smaller threshold compacts sooner and rewrites each entry more often, a
larger one leaves a long log every night must read. At 1 each entry is rewritten
about twice over the life of the cache instead of once per night.

Three things kept deliberately:

- **R78's atomic rename survives**, for the base. A crash mid-compaction leaves
  the old base and the log, which together are the same cache.
- **A torn final line is expected, not exceptional.** An append interrupted by a
  container stop leaves half a line; it is skipped, and the cost is re-fetching
  one title. Throwing there would cost the night.
- **The old single-file format still loads**, becomes the base untouched, and is
  folded in at the first compaction. Changing a format must not make a household
  buy every rating again against a metered key — there is a test named for that
  case, because it is the one that would be most expensive to get wrong and the
  least likely to be noticed in review.

### R144 — One request carried the whole library

`getMovies` asked for every movie on the server in a single un-paginated
`/Items` call. The U10 benchmark measured that at a **28 MB body** for a
50,000-title library, and R132 had just established that a slow *body* is
precisely the half that escapes a deadline unnamed — headers come back quickly
from a healthy-but-loaded server, the body does not.

Put together: the largest libraries were the ones asking a single request to
carry the most, and therefore the ones most likely to lose all of it at once,
with the least useful message. A page that runs long costs a page.

500 titles per request. An ordinary library is one or two calls; a big one is a
sequence of small ones, none of which is the thing that times out.

**The better half of this ruling is the ceiling, and it came from a mutation
behaving badly.** Deleting the short-page guard did not turn the suite red — it
made it *hang*. Every stopping condition the loop had trusted the server to be
honest about something: a short page, an empty page, an accurate
`TotalRecordCount`. A server that reports a large total and keeps answering
would spin for ever, and an endless loop inside a deck build is not an abstract
fault: it is the skeleton that never resolves, on five phones, with the room
waiting.

So the loop is bounded at 1000 pages — 500,000 titles, far past anything this
is for, and a number rather than a promise. Termination is now our decision
instead of the server's, and the same mutation fails cleanly at the ceiling
instead of hanging.

**A hang is a worse failure than a red test**, and it is worth saying why in a
repository that runs mutations on every gate: a red test names its cause in one
line, while a hang looks like a slow machine until something times out and
reports a mystery. The harness would have called this `ERROR` after 120 seconds
and been right to, but only the shape of the fix makes the next one legible.

### R144, continued — the paged fetch trusted the pages it was handed

Paging the library was right, and the first version of it had a defect worse
than the one it fixed.

A server is not obliged to honour `StartIndex` and `Limit`. One that ignores
them answers every page with the whole library — and the loop, trusting the page
it was handed, collected the entire library once per page up to the ceiling. At
50,000 titles and 1000 pages that is fifty million objects. It died on a heap
limit.

**It was found by accident, by a tool built for something else.** The U10
benchmark's fetch stub ignores paging, because it was written before paging
existed and had no reason to model it. That made it an adversary nobody
designed: the exact server behaviour the new code could not survive. The
benchmark had run clean all session; the first thing it did after this change
was fall over.

The fix counts what is *new* rather than what arrived, keyed on the item id, and
stops when a page contributes nothing. Four stopping conditions now, because a
server only has to be honest about one: nothing new, a short page, an empty
page, or the count it claimed.

Two things worth carrying forward.

**Verify a performance claim with the tool that measured it.** The point of
re-running the benchmark was to confirm the cache went from quadratic to linear
— which it did, 1.36 GB to 0.12 GB modelled at 50,000 titles. The bug was not
what I was looking for and was worth more than what I was.

**A stale test double is not always a liability.** The correct-looking instinct
on finding a stub that ignores the parameters the code now sends is to update
the stub. Doing that first would have hidden this; the stub was modelling a real
server, just not a well-behaved one. It stays as it is, and there are now unit
tests that model the same rudeness deliberately.

### R145 — Extraction, and the promises a translator cannot see

Gate U8. Every string in this app was hardcoded English, and the only locale API
anywhere in the source was one `localeCompare` in a tally sort. Jellyfin ships
in dozens of languages, so this is the first thing an upstream maintainer asks
about and the last thing a household would notice.

`src/ui/strings.ts` is the catalogue. This is **extraction only** — the English
moves into one file and components ask by key. It is not locale selection: there
is one catalogue and nothing yet chooses another. `t()` is the single function
that changes when there is a second, which is the whole reason to do the halves
in this order.

**Two findings made this tractable, and both were checks rather than guesses.**

The queue item had warned that roughly 190 pins assert English sentences, so
extraction "has to move the pins in the same commit". It does not. `pins.test.ts`
greps the comment-stripped source of `app/`, `src/` and `server/`, and the
catalogue is in `src/` — so a pinned sentence is still found, it simply lives
somewhere else. Migrating the knockout moved eight strings and broke **zero**
pins. That turns a feared big-bang into something mechanical.

And the first draft of the catalogue **paraphrased a string it was supposed to
copy**: "Overlap decides the deck, so picking more makes a deck more likely"
against the shipped "Overlap decides the deck. Picking more makes a deck more
likely, not worse." The tests caught it, but the lesson is that a catalogue
written from memory is a rewrite wearing the clothes of a refactor. It is copied
from source now, and that is the rule for the rest of the migration.

**The risk extraction introduces is specific.** A translator sees a string, not
a ruling. Four of this project's rulings live entirely in wording — the
disclosure that must not promise an approval gate (R107, R111) or state a size
(R91), the peer count that must never name anybody (R46, R61), the abstain label
that must contain the words a voice user can say (R134). A well-meaning
translation could undo all four without touching a line of logic.

So each load-bearing entry carries a `why` in the data, and `strings.test.ts`
makes the same assertions the rendering tests make, one level earlier. Three
mutations shaped like plausible translations — adding "your host approves it
first", adding a `{who}` placeholder to the peer count, restoring "Abstain" over
"No preference" — all go red, and the last one goes red in the rendered screen
as well as the catalogue.

**What remains.** Two components of nineteen files are migrated. The rest is
mechanical now that the pin question is answered, and locale selection is a
separate piece of work that this deliberately does not pretend to have done.

### R146 — A partial migration is fine; a duplicated sentence is not

Extracting the knockout's strings left the deck's entries defined in the
catalogue **and** still hardcoded in `SwipeDeck.tsx`. So the download
disclosure — the single sentence R107 and R91 are entirely about — existed in
two places at once, within one commit of being moved.

Two copies is worse than the one it started as, and the reason is worth being
precise about. The rendering tests assert the *screen*, so the component's copy
is the one that ships. The catalogue's copy is the one a translator would edit,
and it is the one carrying the `why` explaining what must not change. A
translation would have been made carefully, against the reasoning, to a string
nobody displays.

**A partial migration is fine.** Nineteen files do not move in one commit, and
pretending otherwise is how a refactor turns into a rewrite. What is not fine is
a string existing twice, and that difference is checkable: every catalogued text
must appear in exactly one file across the whole app, and that file must be the
catalogue.

The same commit also caught the catalogue **paraphrasing** the headline it was
supposed to copy — `Not on your server` against the shipped `Not on your server
— voting yes can download it.` That is the second paraphrase in two commits of
writing this catalogue, which is enough to call it a pattern rather than a slip:
a catalogue written from memory is a rewrite wearing the clothes of a refactor.
Copy from source, then check the copy.

The duplication guard makes the rest of the migration safe to do
incrementally — which is the only way it is going to get done.
