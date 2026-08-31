# Accessibility: the target, and the audit against it

**Target: WCAG 2.2, Level AA.** Every Level A and Level AA success criterion,
because AA includes A.

**Audited: 2026-08-31, at the commit this file lands in.** By reading
`src/ui/`, `app/globals.css`, `app/layout.tsx`, `app/manifest.ts`,
`app/page.tsx`, `app/guide/page.tsx` and the three route files. Not by running a
tool: no automated checker is installed here, and the criteria that matter most
to this app — a swipe deck, a focus trap, a screen that cannot scroll — are
mostly ones no checker decides.

This exists because gate **U7** in [UPSTREAM.md](UPSTREAM.md) asks for a named
target, an audit against it, and the failures listed. Before this file the
project had a dozen accessibility rulings and no standard: R06 buttons for every
gesture, R18/R26 never colour or symbol alone, R31 focus trapped and returned,
R39/R118 a 44px floor, R46/R61 peer progress that names nobody, R50 vote buttons
that name the film and its weight, R52 the winner screen takes focus, R85 the
skeleton announces itself, R102 a label gutter that scales with the text, R104
vote buttons that reflow, R113 confirms that take focus with a name. Those are
real and most of them are still standing. What had never been done is the other
half: going through the list and looking for **what is missing**.

Nine things are. Four of them nothing in this repository could have caught.

## How to read a grade

Three kinds of evidence, kept apart on purpose, because a repository that
learned R129 the hard way should not put them in one column:

| Grade | Means |
|---|---|
| **PASS (tested)** | A test fails when the property is removed. The test is named. |
| **PASS (read)** | Verified by reading the source. Nothing would go red if it broke. |
| **PARTIAL** | Holds in most of the app and fails somewhere specific, which is named. |
| **FAIL** | Does not meet the criterion. |
| **UNVERIFIED** | Not established either way. What would settle it is stated. |
| **N/A** | The criterion has no subject in this app. |

"PASS (read)" is not a small claim to make lightly and it is not proof. It is
the honest name for most of what is below.

---

## The failures, first

A clean sheet would not have been believed and would not have been true.

### F1 — 1.3.4 Orientation (AA). The installed app is locked to portrait.

`app/manifest.ts:10` declares `orientation: 'portrait'` beside
`display: 'standalone'`. Installed to a home screen, the app refuses to rotate.

Nothing about choosing a film is essential-portrait, which is the only exception
the criterion allows. A phone clamped to a wheelchair arm in landscape, a tablet
in a stand, a person who holds a device sideways because that is the hand that
works — all of them get an app that will not turn. It is one line, and it has
been there since the manifest was written.

**Fix:** delete the `orientation` key. **Effort:** minutes.

### F2 — 1.4.11 Non-text Contrast (AA). Every ring in the app is invisible.

> **Partly fixed (R135).** Every text input now uses `--color-border` (#737e77),
> measured at 3.57–3.80:1 on the real ground, and `css.test.ts` computes that
> ratio rather than trusting the token's name. The ghost buttons and the ratings
> tiles are deliberately still under 3:1: their visible label identifies them, so
> the criterion is arguable there. For a text input, whose ring was the only
> thing marking it, it was not arguable at all. The slider track is still
> `rgba(255,255,255,0.16)` and remains open.

This one is arithmetic, not opinion, and it does not need a screenshot.

A white overlay at alpha *a* composited over the darkest possible ground —
pure black — reaches its highest possible contrast against that ground. Even
then:

| Overlay | Used for | Best possible contrast, against **black** |
|---|---|---|
| `rgba(255,255,255,0.10)` | ratings tiles, deck-size rows | 1.20:1 |
| `rgba(255,255,255,0.15)` | **every text input**, the ghost buttons, the sheet's close | 1.39:1 |
| `rgba(255,255,255,0.16)` | the runtime slider's track | 1.44:1 |
| `rgba(255,255,255,0.20)` | the Maybe vote button | 1.66:1 |
| `rgba(255,255,255,0.25)` | the details disc on the card | 2.02:1 |

A white overlay needs about **35% alpha** to reach 3:1 against pure black, and
more than that against any ground that is not black. The app's real ground is
never black — `body::before` paints a lit gradient under everything — so every
figure above is an upper bound the shipped app does not reach.

The criterion asks for 3:1 on the visual information required to *identify* a
user interface component. For a button one can argue the button's own word does
the identifying and the ring is decoration. **That argument does not save the
text inputs.** An empty field has no text of its own; `ring-white/15` over
`bg-white/[0.07]` inside a `.gel` of `rgba(255,255,255,0.06)` is the only thing
saying where the field is, and the fill differs from its own container by one
percentage point of white. On the home screen, the join screen and the login,
the box you are asked to type in is not perceivably a box.

The slider track is the other unarguable one: a track is a component part, not
a label, and 1.44:1 is what it can reach at best.

`--color-border` (`#737e77`) is the one border that was measured rather than
chosen (R89), and it clears 3:1 on the dark part of the ground — computed at
about 3.8:1 over the gel surface R89 sampled. Under the cyan radial in the
top-left of `body::before` the same computation gives about 2.1:1. That figure
is a calculation about a surface nobody has photographed, which is precisely
the mistake R89 exists to name, so it is written here as a thing to **measure**,
not a finding. `--color-hairline` is exempt: R41 already says nothing depends on
seeing it.

**Fix:** raise the ring alphas that carry meaning, starting with the inputs and
the slider track. **Verify with:** `npm run contrast` against a capture that
includes a text field — no committed capture does today.

### F3 — 2.5.3 Label in Name (A). Two controls cannot be spoken to.

The criterion says a control's accessible name must contain the text shown on
it, so that somebody driving the phone by voice can say what they can see.

- `Knockout.tsx` abstain row — shows **"No preference"**, is named **"Abstain —
  go with the room"**. Not one word in common. "Click No preference" does
  nothing. This is the control R47 added *for* the person who does not want to
  invent an opinion, and it is the one a voice user cannot reach.
- `SwipeDeck.tsx` undo row — shows **"BACK"** and **"Undo — <film>"**, is named
  **"Undo your vote on <film>"**. "Undo" and the film name are both in there, so
  a lenient voice engine may match; the shown string is not contained, so a
  strict one will not.

Both accessible names are better prose than the visible ones, which is how this
happens. The fix is to make the visible label a substring of the name, not to
make the name worse: *"No preference"* → *"No preference — go with the room"*
would satisfy the criterion and read the same.

**Fix:** two strings. **Not tested here** — a green test cannot record a defect.

### F4 — 3.3.7 Redundant Entry (A). The name is asked for twice.

`HomeActions.tsx` collects "Your name" into an input at the top of the home
screen. `joinRoom()` then routes to `/room/<CODE>` and carries nothing.
`RoomClient.tsx`'s `JoinGate` seeds its own name field from `getAuthName()` —
the *Jellyfin account* name, which is `null` for the guest this app is built
around. So a guest types their name, presses join, and is asked for their name
again on the very next screen.

The criterion allows re-asking only where it is essential, or where the earlier
answer is no longer valid. Neither applies: the answer is sitting in a React
state one route away.

**Fix:** carry the name through the route (a query param, or the same session
storage `saveSession` already uses) and seed `JoinGate` from it.

### F5 — 4.1.3 Status Messages (AA). Three counts change in silence.

R22, R85 and R113 put live regions on the deck, on the loading skeleton, on the
waiting screens and on the request result. Three status messages were missed,
and they are the ones the whole room is watching:

- `Lobby.tsx` — "**N of M ready**" / "Waiting on N". This is the lobby's entire
  job. People press "I'm ready" on their own phones and the number moves on
  everyone else's, with focus nowhere near it. A screen reader user is told
  nothing until they go looking.
- `SwipeDeck.tsx` — "**N of M others finished**". R46's whole point is that this
  number is what the room is allowed to know; it is not announced.
- `Knockout.tsx` — the `Bar`'s "**N of M in**" and "N left · 2 survive".

A lower-confidence fourth: `WinnerScreen.tsx`'s request result is a
`role="status"` element that is **inserted into the DOM already containing its
text**. A polite live region created with content is announced inconsistently
across screen readers — `role="alert"` survives insertion, `role="status"`
often does not. The safe shape is a region that is always mounted and empty
until it has something to say, which is what the deck's live region already
does.

**Fix:** `role="status"` on the three counts. The fourth needs the region
hoisted above the branch that fills it.

### F6 — 4.1.2 Name, Role, Value (A). The runtime slider announces an ordinal.

`Lobby.tsx` binds a native `<input type="range">` to
`RUNTIME_STOPS.findIndex(...)` — so its value is **0 to 7**, an index into
`[90, 100, 110, 120, 135, 150, 180, null]`. There is no `aria-valuetext`. Arrow
through it with a screen reader and it says *"4"*, then *"5"*. The setting being
changed — "120 min or under" — lives in the `<label>`, which is not re-read on a
value change.

The comment above that input says, in as many words, *"the current and available
values are announced"*. They are not. An ordinal is. This is the same shape as
R60 and R74: a comment describing an intention as though it were a behaviour.

Two smaller things in the same control: `findIndex` returns **-1** for any
stored `maxRuntime` not in `RUNTIME_STOPS`, which puts the slider below its own
`min`; and no `aria-valuemin` is needed (0 is the default) but the range is
meaningless without the text anyway.

**Fix:** `aria-valuetext={runtimeLabel}`. One attribute.

### F7 — 1.2.2 Captions (A) and 1.2.5 Audio Description (AA). The trailer.

`MovieDetails.tsx` embeds a YouTube trailer in an `<iframe>`. That is
prerecorded synchronised media with audio, presented by this app, so this app
owns the criteria: captions at Level A, audio description at AA. It provides
neither and cannot, because it does not own the video.

Nobody has considered this. It is not a hard fix — the component already has a
plain-link fallback for URLs it cannot embed, and dropping the embed hands the
media, and the responsibility for it, to YouTube's own player where the user
already has their caption settings. As shipped, the app presents the media.

### F8 — 1.3.1 Info and Relationships (A), partial. Three screens have no `h1`.

`Lobby`, `Knockout` and `SwipeDeck` render `<h2>` — `Group`'s section titles,
and `SwipeCard`'s film title — with **no `<h1>` anywhere on the page**. The
winner screen has one, the home screen has one, the join gate and login have
one. The three screens a room spends its evening on do not.

Heading navigation on the deck therefore lands on a film title that claims to be
a second-level heading under nothing.

### F9 — 2.4.2 Page Titled (A), partial. Every page has the same title.

`app/layout.tsx` sets `title: 'Jellyfin Matcher'` and neither
`app/room/[roomId]/page.tsx` nor `app/guide/page.tsx` exports metadata of its
own. So the guide, whose own `<h1>` reads "How to use the server", is titled
"Jellyfin Matcher"; and a room's tab does not say which room. The criterion asks
for a title that describes topic or purpose, which two of the three do not.

---

## At risk, and not yet established

These are the ones this repository has no way to settle from where it stands.
Each says what would settle it.

### R1 — 1.4.10 Reflow (AA). Nothing has ever been rendered at 320px.

`scripts/screenshots.ts` shoots at **402×874**. `scripts/measure-rows.ts`
measures at **402** wide. Every capture in `docs/screenshots/` is that phone.
The criterion's width is **320 CSS px**, which is 1280px at 400% zoom, and no
artefact in this repository has ever been produced at it.

Reading says the width side is probably fine: `max-w-md` collapses, the vote
row's `minmax(4.5rem, 1fr)` auto-fit drops to three columns in a 296px content
box rather than clipping, and the one fixed-width thing (the 132px QR) fits.

The **height** is the worry, and it is structural rather than incidental.
`RoomClient.tsx` renders `<main className="... h-dvh ... overflow-hidden">`, and
R21/R59 make the deck deliberately incapable of scrolling. At 400% zoom on an
ordinary 1280×1024 desktop the viewport is 320×**256** CSS px, and the deck's
`min-h-[150px]` card region, its 62px vote row and its 60px undo row come to 272
before the status bar, the progress strip and the peer count are counted at all
— with nothing to scroll, the overflow is simply clipped. A strict
reading of 1.4.10 constrains the width for vertically-scrolling content and puts
the height outside its letter; it is loss of content either way, and it is the
first thing an auditor would file.

**Would settle it:** a `npm run shots` variant at 320×256, or `measure-rows.ts`
pointed at that viewport.

### R2 — 2.4.11 Focus Not Obscured, Minimum (AA). No scroll padding anywhere.

`Listing.tsx` gives every screen a `Bar` that is `sticky top-0 z-20` and a `Dock`
that is `sticky bottom-0 z-20`, with a `.scroll-body` scrolling between them.
There is **no `scroll-padding` or `scroll-margin` in the repository** — grepped
across `app/`, `src/`, `server/` and `scripts/`.

A browser bringing a focused element into view inside a scroll container does
not know about sticky siblings. Tab down the lobby's settings list and the row
that receives focus at the bottom edge lands underneath the dock; going back up,
under the bar. This is the default behaviour of exactly this layout, and this
layout is on every in-room screen.

**Would settle it:** tab through the lobby in a real browser and watch the row
that takes focus. **Fix, if confirmed:** `scroll-padding-block` on `.scroll-body`
sized to the two chrome surfaces.

### R3 — 1.4.12 Text Spacing (AA). Never considered.

The criterion requires no loss of content when a user stylesheet forces line
height to 1.5× the font size, letter spacing to 0.12em, word spacing to 0.16em
and paragraph spacing to 2×. All four are *increases*.

This app is fixed-height and clips: `h-dvh` with `overflow-hidden`, a deck that
cannot scroll, `leading-snug` (1.375) and `leading-none` (1) in places that
would grow, and `truncate` on the film title on the card being voted on. R84
fought hard to keep that title on screen at 200% text; nothing has asked what
happens when the reader's stylesheet adds a third to every line box.

**Would settle it:** the WCAG text-spacing bookmarklet against a running app, or
the `measure-rows.ts` approach with the four properties forced.

### R4 — 2.2.1 Timing Adjustable (A). Two limits, neither warned nor extendable.

Rooms are reaped after **2 hours idle** (`server/store.ts`); the timer is reset
by `touch()` on activity, which is the safer of the two shapes — a room in use
never hits it. Jellyfin auth sessions expire after **12 hours**
(`server/auth.ts`), which is an absolute limit under the criterion's 20-hour
exception, with no warning and no way to extend.

Signing in again is not data loss, so this may be defensible. It has not been
argued, and "nobody thought about it" is not the same as "it is fine".

### R5 — 2.1.2 No Keyboard Trap (A), one route not covered.

The sheet's trap is sound and is tested (see below): Escape releases it, and Tab
cycles in both directions rather than dead-ending. One gap: the `keydown`
listener is on the parent `window`, and once the trailer is playing focus can
enter a **cross-origin iframe**. While it is in there, Escape never reaches the
handler and the Tab wrap never runs. Browsers do let a user tab out of an iframe
through its own controls, so this is not a hard trap — but the app's own way out
is gone while focus is inside it, and nothing in the app says so.

### R6 — 1.4.3 Contrast, Minimum (AA). Measured, but not standing.

This is the one contrast claim the project has real evidence for.
`scripts/contrast.ts` reads the ink and the paper out of a committed PNG and
reports the ratio, and it has twice overturned an argument that was arithmetic
about the wrong surface (R89, R95). That is better evidence than most projects
have.

It is **not gated** — the script says so itself, and the reason is good: a gate
that guessed at regions would be noise. So contrast is measured where somebody
measured it and unverified everywhere else, and no committed capture covers a
text input, the guide page, or the login.

---

## The full table

Level A and AA, WCAG 2.2. `a11y` below is
`src/ui/__tests__/a11y.test.tsx`.

### Perceivable

| SC | Lvl | Grade | Evidence, or the gap |
|---|---|---|---|
| 1.1.1 Non-text Content | A | **PASS (tested)** | Posters carry the film's name; icons are not exposed as nameless graphics — `a11y`, "SC 1.1.1". Note in that file: `lucide-react` supplies `aria-hidden` itself, so the test catches an icon *explicitly* exposed, not a dropped prop. |
| 1.2.1 Audio-only / Video-only | A | N/A | No audio-only or video-only content. |
| 1.2.2 Captions (Prerecorded) | A | **FAIL** | **F7** — the embedded trailer. |
| 1.2.3 Audio Desc. or Media Alt. | A | **FAIL** | **F7**, same media. |
| 1.2.4 Captions (Live) | AA | N/A | No live media. |
| 1.2.5 Audio Description | AA | **FAIL** | **F7**, same media. |
| 1.3.1 Info and Relationships | A | **PARTIAL** | Roles, groups and labels are right throughout (`role="group"` on the vote row, `radiogroup` on deck size, `Group` renders a real `<section>` with its heading). **F8**: three screens have no `h1`. |
| 1.3.2 Meaningful Sequence | A | PASS (read) | DOM order is reading order. The one reversal — the deck renders its three cards back-to-front for z-order — is invisible to the tree because the two behind are `aria-hidden`, which `a11y` checks holds no focusable element. |
| 1.3.3 Sensory Characteristics | A | PASS (read) | No copy refers to shape, position, size or sound. Every instruction names its control. |
| 1.3.4 Orientation | AA | **FAIL** | **F1** — `orientation: 'portrait'` in the manifest. |
| 1.3.5 Identify Input Purpose | AA | PASS (read) | `autoComplete="given-name"` on both name fields; `username` and `current-password` on the login. The room code is not one of the listed purposes. |
| 1.4.1 Use of Color | A | **PASS (tested)** | Picked and unpicked genre rows differ by a visible glyph, not only a tone — `a11y`, "SC 1.4.1", asserted on text with `sr-only` and `aria-hidden` stripped. Vote words are covered by `controls.render.test.tsx`. R18/R26. |
| 1.4.2 Audio Control | A | PASS (read) | The trailer does not autoplay: `playTrailer` gates the iframe and the embed URL carries no autoplay parameter (R29). |
| 1.4.3 Contrast (Minimum) | AA | PARTIAL / measured | **R6** — real measurement via `npm run contrast`, not standing, and no capture covers an input or the guide. |
| 1.4.4 Resize Text | AA | PASS (read), one gap | The most-worked criterion here: every size is a rem, no `-webkit-text-size-adjust`, 200% captures exist for the lobby, the deck and the winner (R60, R74, R84, R96, R102, R126). Gap: `truncate` on the card's film title ellipsises a long name at any size and more at 200%. |
| 1.4.5 Images of Text | AA | N/A | None. |
| 1.4.10 Reflow | AA | **UNVERIFIED** | **R1** — nothing has ever been rendered at 320 CSS px. |
| 1.4.11 Non-text Contrast | AA | **FAIL** | **F2** — every ring in the app is between 1.20:1 and 2.02:1 at best. |
| 1.4.12 Text Spacing | AA | **UNVERIFIED** | **R3** — never considered, and the layout clips. |
| 1.4.13 Content on Hover or Focus | AA | N/A | No tooltips, popovers or hover-revealed content anywhere. `title` in this codebase is a component prop that renders visible text, not the HTML attribute; the one real `<title>` is inside the QR's SVG, which the criterion exempts as user-agent chrome. |

### Operable

| SC | Lvl | Grade | Evidence, or the gap |
|---|---|---|---|
| 2.1.1 Keyboard | A | PASS (read) | Every control is a native `button`, `a`, `input` or `select`. `Listing.tsx` says why in its own comment; the deck's drag is an accelerator over buttons that already exist (R06), which `a11y` presses. |
| 2.1.2 No Keyboard Trap | A | **PASS (tested)**, one risk | The sheet's trap cycles forward and backward and releases on Escape from inside — `a11y`, "SC 2.1.2". **R5**: the listener is on `window`, so focus inside the trailer iframe is outside its reach. |
| 2.1.4 Character Key Shortcuts | A | N/A | The app binds exactly two keys, Escape and Tab, both inside the sheet. No single-character shortcut exists. |
| 2.2.1 Timing Adjustable | A | **UNVERIFIED** | **R4** — a 2h idle room TTL and a 12h auth session, neither warned nor extendable. |
| 2.2.2 Pause, Stop, Hide | A | PASS (read) | Confetti is one-shot — longest delay 0.6s plus longest duration 3.0s, inside the five-second allowance — and returns `null` outright under reduced motion. Skeleton pulses and spinners are loading indicators that stop when their content arrives. `globals.css` clamps every animation under `prefers-reduced-motion`. `a11y` checks the confetti is hidden and takes no pointer events, and says in its own comment that it cannot see the 3.6s or the reduced-motion branch. |
| 2.3.1 Three Flashes | A | PASS (read) | The confetti translates and rotates; nothing in the app flashes. |
| 2.4.1 Bypass Blocks | A | N/A | No block of content repeated across pages. There is no navigation to skip. |
| 2.4.2 Page Titled | A | **PARTIAL** | **F9** — all three routes inherit one title. |
| 2.4.3 Focus Order | A | PASS (read) | DOM order matches visual order on every screen. In the sheet the backdrop's close button is DOM-first but visually behind; the trap keeps focus off it, so it is a keyboard-unreachable duplicate of the close control rather than a misordered stop. |
| 2.4.4 Link Purpose (In Context) | A | PASS (read) | Two links exist — "Play in Jellyfin" and "Watch trailer". Both describe themselves. |
| 2.4.5 Multiple Ways | AA | N/A | Three routes, and a room is a step in a process, which the criterion exempts. |
| 2.4.6 Headings and Labels | AA | PASS (read) | Every heading and every label describes its subject. See **F8** for the levels. |
| 2.4.7 Focus Visible | AA | PASS (read) | `:focus-visible { outline: 3px solid var(--color-maybe); outline-offset: -3px }`. `#2fbdbd` computes about 7:1 against the app's surfaces. The `[data-app-focus]` suppression (R80) applies only to `tabIndex={-1}` elements the app focused on the reader's behalf, which are not in the tab order at all; `focus.test.ts` holds the join between the mark and the rule so it cannot drift back to matching by markup shape. |
| 2.4.11 Focus Not Obscured (Min) | AA | **UNVERIFIED** | **R2** — sticky bar and dock, and no scroll padding in the repository. |
| 2.5.1 Pointer Gestures | A | **PASS (tested)** | All four vote weights are cast from buttons, pressed and checked against `VOTE_POINTS` — `a11y`, "SC 2.5.1 / 2.5.7". |
| 2.5.2 Pointer Cancellation | A | PASS (read) | Every control fires on click, i.e. the up-event. The drag commits on `onDragEnd` and `dragSnapToOrigin` returns the card when the threshold is not met, so a started gesture can be abandoned (R49). |
| 2.5.3 Label in Name | A | **FAIL** | **F3** — the abstain row and the undo row. |
| 2.5.4 Motion Actuation | A | N/A | Nothing reads a device sensor. |
| 2.5.7 Dragging Movements | AA | **PASS (tested)** | The deck is a swipe interface and every vote it can cast has a button behind it, pressed in `a11y`. The super-like has no gesture at all by design (R49), so the button set is a strict superset of the gesture set. |
| 2.5.8 Target Size (Minimum) | AA | PASS (read) | The criterion's floor is 24×24 CSS px. This app declares 60px rows, 62px vote buttons, 52px primary buttons, a 44px details disc and a 44px slider box — its own floor (R39, R96, R118) is 44px, well clear. Nothing in jsdom measures a box; `scripts/measure-rows.ts` measures real rows in real Chrome against the compiled stylesheet at 100% and 200% root, which is the closest this repository comes to evidence. |

### Understandable

| SC | Lvl | Grade | Evidence, or the gap |
|---|---|---|---|
| 3.1.1 Language of Page | A | PASS (read) | `<html lang="en">` in `app/layout.tsx`. |
| 3.1.2 Language of Parts | AA | N/A today | Every string in the app is English and hardcoded, which is gate **U8**. This criterion becomes live the moment U8 is done, and it is the sort that gets forgotten in a translation pass. |
| 3.2.1 On Focus | A | PASS (read) | Nothing changes context on focus. |
| 3.2.2 On Input | A | PASS (read) | The range slider and the deck-size radios write a setting and re-render in place; no control navigates, submits or replaces the screen on input. |
| 3.2.3 Consistent Navigation | AA | N/A | There is no navigation. |
| 3.2.4 Consistent Identification | AA | PASS (read) | By construction: `Bar`, `Dock`, `Row`, `RowButton`, `BigButton` and `Group` are shared, so a control means and looks the same on every screen. This is what `Listing.tsx` is for. |
| 3.2.6 Consistent Help | A | N/A, and worth saying | `/guide` exists as a full page. **Nothing in the app links to it** — grepped for `/guide` across `app/`, `src/` and `server/`: zero hits. So there is no help mechanism to be inconsistent about, and the criterion is satisfied by an absence. That is a pass, not a good sign. |
| 3.3.1 Error Identification | A | PASS (read) | Every failure path renders `role="alert"` with the error in text: the login, the join gate, the home actions, the room strip, the request control. |
| 3.3.2 Labels or Instructions | A | PASS (read) | Every input has a `<label htmlFor>` or an `aria-label`; the room code field has both an `aria-label` and a placeholder. |
| 3.3.3 Error Suggestion | AA | PASS (read) | Errors say what to do — "Enter your name first", "Enter a room code", "Your Jellyfin server did not answer. Check it is awake and try again." R88 exists for that last one. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | PASS (read) | The two irreversible actions — turning down the winner, and asking Jellyseerr for a film — both take a second, deliberate press, and both state the cost before it is committed (R37, R71, R100, R113). Whether this criterion strictly applies is arguable; the app meets it either way. |
| 3.3.7 Redundant Entry | A | **FAIL** | **F4** — the name is asked for twice. |
| 3.3.8 Accessible Authentication (Min) | AA | PASS (read) | Username and password, with `autoComplete="username"` and `current-password`, nothing blocking paste, and no cognitive function test — no puzzle, no transcription, no "type the third letter". A password manager fills it. |

### Robust

| SC | Lvl | Grade | Evidence, or the gap |
|---|---|---|---|
| 4.1.2 Name, Role, Value | A | **PARTIAL** | Every control on the deck, the sheet, the winner screen and the genre picker has a non-empty accessible name — `a11y`, "SC 4.1.2", which follows the winner screen all the way into the sending state where the button's only child is a spinner (R113/T115). States are exposed: `aria-pressed` on every `RowButton`, `aria-checked` on the deck-size radios, `aria-modal` and `role="dialog"` on the sheet, `role="progressbar"` with a name on the deck bar. **F6**: the runtime slider announces an ordinal, not the runtime. |
| 4.1.3 Status Messages | AA | **PARTIAL** | Live regions are right on the deck's card announcement (tested in `a11y`, including that the text *follows* the card rather than being a constant), the loading skeleton, the waiting screens, and every `role="alert"`. **F5**: three counts change with nothing announcing them, and one region is inserted already full. |

*(4.1.1 Parsing was removed from WCAG in 2.2 and is not graded.)*

---

## What jsdom cannot check, and why there is no test for it

`src/ui/__tests__/a11y.test.tsx` covers what lives in the DOM: names, roles,
what is exposed to the accessibility tree, what a keyboard can reach, and
whether a gesture has a button behind it. Every case in it was checked by
reintroducing the defect it names and confirming it went red — the mutations are
listed in the file's own comments where the answer was surprising.

These are structurally out of reach in jsdom, and no test in this repository
should pretend otherwise:

| Criterion | Why not |
|---|---|
| 1.4.3, 1.4.11 contrast | jsdom does not load `app/globals.css` and does not cascade. `getComputedStyle` returns the inline style and the UA default. There are no pixels. |
| 1.4.10 Reflow, 1.4.12 Text Spacing | No layout. Every `getBoundingClientRect` is zeroes. |
| 2.4.7 Focus Visible | The outline is in a stylesheet jsdom never reads. |
| 2.4.11 Focus Not Obscured | Requires two boxes and their overlap. |
| 2.5.8 Target Size | Requires a measured box. `measure-rows.ts` is the tool. |
| 1.3.4 Orientation | Requires an installed PWA. |
| 2.2.2's five-second bound | framer-motion transitions on elements jsdom never animates. |

Asserting a Tailwind class as a proxy for any of these would be asserting the
cause and claiming the effect, which is what R125 and R129 are about. Where a
class *is* the honest subject — `.slider`'s height, the vote points carrying no
opacity — the guard already lives in `css.test.ts` and `controls.render.test.tsx`
and says so.

---

## Honest position

**Nine failures, six of them Level A.** Four could not have been caught by
anything in this repository: the manifest's orientation lock, the ring contrast,
the trailer's captions, and the name asked for twice. Two more — the slider's
ordinal and the three silent counts — are contradicted by comments in the source
that describe an intention as a behaviour.

Six of the nine are small: an attribute, a key deleted from a manifest, two
strings, `role="status"` three times. Three are not: the ring contrast is a
palette decision, the trailer's captions are a decision about whether to embed
third-party media at all, and Reflow is entangled with R21, which is the whole
layout.

**U7 asked for a named target, an audit against it, and the failures listed.**
That is what this is. It does not claim conformance, and this project should not
claim conformance until at least F1 through F6 are closed and R1 and R2 are
settled in a real browser. The next honest step is not more prose: it is one
`npm run shots` at 320 CSS px and one keyboard pass down the lobby.
