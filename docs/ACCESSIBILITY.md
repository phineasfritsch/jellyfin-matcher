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
| **FAIL (stated)** | Does not meet it, will not be fixed, and the reason and the cost are written down. A closed item, not an open one. |
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

> **Fixed (R139).** The home screen remembers the typed name and the join gate
> offers it back; the signed-in name still wins when there is one. Kept in
> storage rather than a URL parameter, because a name in a path lands in
> history and in every log between the phone and the server. Both halves are
> mutation-tested — and removing the producing half used to leave the whole
> suite green, because `HomeActions` had no test file at all.

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

> **Fixed (R136).** All three are live regions now — the lobby's ready count,
> the deck's peer count and the knockout's Bar — and `a11y.test.tsx` asserts
> each, verified by removing the attributes and watching them go red. The live
> region is opt-in (`Row live`, `Bar liveRight`) rather than automatic, because
> a screen full of polite regions talks over itself. The lower-confidence fourth
> item below — the winner screen's region inserted already containing its text —
> is **still open**.

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

A lower-confidence fourth, **also now fixed**: `WinnerScreen.tsx`'s request
result was a `role="status"` element **inserted into the DOM already containing
its text**. A polite live region created with content is announced
inconsistently across screen readers — `role="alert"` survives insertion,
`role="status"` often does not. On the one control in the app that spends the
host's disk, the sentence saying the request went through could simply never be
spoken.

The region is now always mounted and only its text changes, which is the shape
the deck's card announcement already uses. It is `sr-only` while empty rather
than drawn blank: an empty accent box in the dock would say nothing loudly, and
`sr-only` is out of flow, so the dock's `gap-2` does not open around it either.
Guarded in `winner.render.test.tsx` — "the request result announces itself".

A phone that arrives with the request already made renders the text on first
paint and announces nothing. That is correct: it is not news, it was true before
the reader got there. What this makes reliable are the two announcements that
happen while somebody is looking — this phone finishing its own request, and the
room being told another phone asked.

**Fix:** all four are done. `role="status"` on the three counts (R136), and the
fourth hoisted above the branch that fills it.

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

### F7 — 1.2.2 Captions and 1.2.3 / 1.2.5 Audio Description (A, AA). The trailer.

> **Decided: the embed stays, and this does not conform.** Stated, not fixed,
> and not waiting on anybody. 1.2.2 is met for some films and not for others,
> decided per film by whoever uploaded the trailer; 1.2.3 and 1.2.5 are not met
> and will not be. What follows is the position, with the reason. The earlier
> version of this entry ended "nobody has considered this" and offered a fix
> that was half wrong; both are replaced below.

`MovieDetails.tsx` embeds a YouTube trailer in an `<iframe>`. That is
prerecorded synchronised media with audio, on this app's own page, so this app
owns the criteria: captions at Level A, audio description or a media
alternative at Level A, audio description at AA. WCAG conformance is claimed
for a full page and admits no excluded region, so "it is in an iframe" changes
nothing.

**What is actually on the page.** `youtubeEmbedUrl()` builds
`https://www.youtube-nocookie.com/embed/<id>` and nothing else: no query string,
no parameters at all. The `allow` list — accelerometer, encrypted-media,
picture-in-picture — is a permissions policy and has nothing to say about
captions, and `autoplay` is not on it, which is the 1.4.2 row below. Controls
are not disabled, no chrome is stripped, and nothing sets `cc_load_policy=0`.
**The app suppresses nothing.** It also supplies nothing: the video id comes from
`card.trailerUrl`, which is MDBList's `trailer` field
(`src/lib/candidates.ts:45`, `:79`). Nobody in this project picks the video, and
the app has never seen it before it renders it.

#### 1.2.2 Captions — met per film, and the app cannot see which

The nocookie embed **is** YouTube's own player. When the video carries a caption
track, the player's own control bar carries the CC button, and this app removes
none of that. Two qualifications decide the criterion, and both cut against a
clean pass:

- **A CC button proves a track, not a conforming one.** The criterion's captions
  are a synchronised alternative for speech *and* the non-speech audio needed to
  understand the content. YouTube's auto-generated track is speech only — no
  speaker identification, no `[music]`, no `[engine turns over]` — and a trailer
  is usually music and sound design with a few lines over it. An auto-generated
  track is labelled as such in the player's subtitles menu, so a person can tell
  the two apart; the app cannot.
- **The household's own caption preference is not in the frame.** The host is
  `youtube-nocookie.com`, chosen for privacy and declared as such in
  `docs/DEPENDENCIES.md`, and it is a different origin from `youtube.com`. Nobody
  is signed in there and no stored "always show captions" setting reaches it.
  Captions are therefore **off until somebody presses CC — on every trailer,
  every time**, because each embed is a fresh player. That is a cost the privacy
  decision imposed on exactly one group of people, and it had never been written
  down.

So: **met** for a film whose trailer carries an authored caption track;
**not met** for one carrying none, or only an auto-generated one. Establishing
which, per card, would need the YouTube Data API — a key, a fifth destination in
`docs/DEPENDENCIES.md` (U9), a call per card — and the cheap field there is a
boolean saying a track exists, not whether it is authored, which is the
distinction the criterion turns on. It would cost a key, a new upstream and a
call per card, and still answer the wrong question.

*Evidence grade for this subsection:* a read of `MovieDetails.tsx` plus
knowledge of YouTube's player. **Nobody has pressed Play trailer in this app and
looked**, and this repository cannot: jsdom renders no third-party player and
the harnesses run on a LAN. **Would settle it:** one press on a film with a
known-captioned trailer — is the CC button in the bar, and is the track labelled
auto-generated. It sharpens the entry either way and changes no decision below.

#### 1.2.3 and 1.2.5 Audio Description — not met, and not "not yet"

No audio description exists for cinema trailers, and YouTube carries no audio
description mechanism to put one in. There is nothing to switch on, nothing to
request, and nothing this project could author.

1.2.3 offers the other route: a **media alternative** — a text document
presenting equivalent information for everything the video shows and says — in
place of description. The sheet is full of text sitting directly above the
trailer: the synopsis, the year, the runtime, the genres, every rating MDBList
returned and the composite. **None of it is a media alternative for the
trailer**, and calling it one would be the exact move R129 exists to stop — a
claim satisfied by content that was already there for another reason. The
synopsis describes the film; the trailer is a two-minute edit *of* the film,
and the two carry different information. The escape route 1.2.3 offers is
closed for a stated reason rather than overlooked.

#### Why the embed stays

The alternative was to delete `youtubeEmbedUrl` and let every trailer fall
through to the plain `<a>` the component already renders for URLs it cannot
embed. That is a deletion, not a build, and it works: media presented on
somebody else's page is not this page's content, so all three criteria would be
graded N/A beside 1.2.1 and 1.2.4, and the app's Level A/AA sheet would come out
clean. It was rejected for four reasons:

1. **It produces no captions and no descriptions.** Not one film gains either.
   The deaf household member gets the same track from the same player; the blind
   one gets the same undescribed trailer.
2. **It costs the room something real.** `Watch trailer` is `target="_blank"`:
   on a phone that is the YouTube app or a new tab, with the room backgrounded
   mid-deck — and the deck is the one place a slip costs a film you cannot get
   back (R48). The person pushed out of the room most often would be the person
   who has to go and press CC, which is the person the change was for.
3. **The only thing gained is the audit line.** Three FAILs become three N/As
   and the project could then claim AA. Buying a conformance claim by deleting
   the feature the criteria are about is grade-shopping, and this document exists
   because a stated failure is worth more here than a clean sheet nobody should
   believe (R125, R129).
4. **It is inconsistent with the rest of the sheet.** The poster is TMDb's, the
   ratings are MDBList's, the synopsis is MDBList's or Jellyfin's. Third-party
   content is what this app is made of. The trailer differs only in that video
   carries criteria the others do not — a fact about media type, not about
   ownership.

Switching the embed to `youtube.com` to pick up the household's stored caption
preference is the other thing that looks like a fix and is not: it would hand
every card anyone opens to a signed-in Google account, which is a worse trade
than the one press it saves.

#### What a household actually loses

- **A deaf or hard-of-hearing member.** On a film whose trailer has an authored
  track: one press of CC, repeated for every trailer, because nothing persists
  in that frame. On a film whose trailer has none, or only auto-captions: music
  and lip movement. Nothing else in the evening is affected — every screen this
  app is operated from is text and buttons, and no vote depends on the trailer.
- **A blind or low-vision member.** The trailer's audio, and no account of what
  is on screen. Everything a vote actually needs — title, year, runtime, genres,
  synopsis, every rating and the deck score — is text in the same sheet, above
  the trailer, and is read out. What is lost is the trailer's own content, and
  it is not available anywhere: YouTube does not have a described version either.
- **Everyone else.** Nothing. The trailer is optional, mounts on a press, and no
  path through the app requires it.

The one cost above that is cheap to remove is the repeated CC press.
`cc_load_policy=1` on the embed URL turns captions on by default, and in a frame
carrying none of the household's YouTube state it overrides no preference anyone
set — there is none in there to override. It creates no captions and moves no
grade in this document; it is worth having for the household, not for the audit.
The trade is that captions become the default for a household that may not want
them, reversible with one press — the same press, moved to the other side of the
decision, onto the people for whom it is a preference rather than a requirement.
It is one line in `src/ui/components/MovieDetails.tsx`, which this session does
not own, so it is **reported, not made**. It costs no test: applied in an
isolated copy of the tree it leaves `details.render.test.tsx` and
`server/__tests__/provenance.test.ts` green, because a query string adds no
destination. Whoever makes it should still watch a real trailer on a real
device rather than trust the parameter name (R89) — the parameter is documented
to show captions by default, and a documented parameter is not a photographed
surface.

#### The conformance consequence

While the embed is there, this app **cannot claim WCAG 2.2 Level AA**, whatever
else is fixed. The honest form is the one the standard provides for third-party
content, a statement of partial conformance:

> This page does not conform to WCAG 2.2 Level AA, but would conform if the
> embedded YouTube trailer in the details sheet were removed.

The standard attaches two conditions to naming content that way: it is not under
the author's control, and it is described so a user can identify it. The second
is trivially true — one embed, one sheet, behind one named button. The first is
arguable and is worth arguing rather than assuming: the app controls *that* a
trailer is offered and could stop; it does not control which video (MDBList
chooses), what is in it, or whether it is captioned, and cannot know any of that
before it renders. An auditor may reasonably answer that anything you can delete
is under your control. The sentence above is written so that it is true either
way — it claims no conformance, it names what fails, and it says what removing
it would buy, which by *Why the embed stays* is a grade and nothing else.

#### What holds this decision in place

**Not this document.** Nothing in the suite reads it: gutting this entry to a
one-line TODO, and separately flipping all three grades in the table below to
PASS, each left `docs.test.ts`, `a11y.test.tsx` and `routes.test.ts` green. Both
mutations were applied and reverted rather than assumed, because a claim about
what a test covers is worth nothing without having watched it (R129).

**The embed is held, by exactly two cases.** `details.render.test.tsx`'s
"reaches no network until somebody asks for it" and "embeds only once it is
pressed, and on the no-cookie host" both go red when the embed is disabled so
every trailer falls through to the plain link — the option refused above. Run in
an isolated copy of the tree, since this session does not own
`MovieDetails.tsx`.

**Pin T17 is not one of the two.** It matches `playTrailer ?` in
comment-stripped source, and that ternary is still written when its branch is
unreachable, so it stayed green through the same mutation. T17 holds the shape
of the deferral R29 asked for, not the existence of the thing deferred. That is
the ordinary "Scoped (R129)" caveat the pins file writes for other entries and
does not write for this one.

**What would reopen this:** a household that leaves the room for YouTube's page
to get captions. The cost of the link is the only thing holding the embed in
place, and a report of that cost being paid anyway is the evidence that would
flip it. Not a preference, and not another reading of the criteria.

### F8 — 1.3.1 Info and Relationships (A). ~~Three screens have no `h1`.~~ FIXED (R156).

`Lobby`, `Knockout` and `SwipeDeck` rendered `<h2>` — `Group`'s section titles,
and `SwipeCard`'s film title — with **no `<h1>` anywhere on the page**. Heading
navigation on the deck landed on a film title claiming to be a second-level
heading under nothing.

Each of the three now carries an `sr-only` `<h1>` naming what the screen is for:
"Room lobby", "Choosing genres" / "Narrowing the genres", "Swiping for a film".
`sr-only` because what was missing is the heading STRUCTURE, not a visible
title — the room's layout deliberately cannot scroll and has nowhere to put one.

**Guarded by a test, not a pin**, in `a11y.test.tsx`: each screen is mounted and
asserted to have exactly one `<h1>` with a real accessible name. Exactly one,
because two is the same structural lie in the other direction. A pin would find
`<h1` in the source and be satisfied by one in a branch that never renders.
The knockout is checked twice — it is two screens wearing one component, and the
elimination round renders from its own return statement, so it can lose the
heading by itself. `R156-deck-loses-its-h1` deletes the deck's and the audit
goes red; nothing on screen changes when it does, which is the point.

### F9 — 2.4.2 Page Titled (A). ~~Every page has the same title.~~ FIXED.

`app/layout.tsx` set `title: 'Jellyfin Matcher'` and neither the room route nor
the guide exported metadata of its own, so all three tabs read the same and a
room's tab did not say which room.

All three now describe topic or purpose. The layout supplies a `template` of
`'%s · Jellyfin Matcher'`; the guide exports `title: HEADING`, the same constant
its `<h1>` renders, so the two cannot drift; and the room route's
`generateMetadata` leads with the code — `Room ABCD` — because the code is what
distinguishes one of these tabs from another and is what the room is about.

A path that is not a four-character code gets the bare word "Room" instead. That
is deliberate: a title claiming `Room <whatever was typed>` would assert a room
by that name exists, which is exactly what the screen underneath is about to
deny.

**This entry stated a failure that had already been fixed.** It is recorded
because an audit that overstates a failure is wrong in the same way as one that
overstates a pass, and the only reason it was caught was reading the route
before writing about it.

---

## At risk, and not yet established

These are the ones this repository has no way to settle from where it stands.
Each says what would settle it.

### R1 — 1.4.10 Reflow (AA). Nothing has ever been rendered at 320px.

> **Measured, and it was a FAIL, now fixed (R137).** `npm run measure:reflow`
> renders the deck at 320×256 in real Chrome against the compiled stylesheet.
> The vote row's bottom edge was at **372px** on a surface that could not
> scroll — the controls the deck exists for were 116px out of reach — and the
> buttons wrap to two rows at 320px wide, which the reading below did not
> predict. Below 520px of height the shell and the screen inside it now release,
> so the page scrolls; 320×568 and 402×874 are unchanged, which is how R21 is
> known to be intact. The suspicion recorded below was correct in every part
> except that it was gentler than the truth.

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

> **Probed, and not reproduced (R138).** `npm run measure:reflow` now focuses a
> control in the middle of a long listing at 320×256 and at 402×874 and measures
> its overlap with both sticky bars. It is **0px at both**. The reasoning below
> is sound but the conclusion was wrong: `Bar` and `Dock` are *siblings* of
> `.scroll-body`, not children, so the scrollport is the gap between them and a
> sticky element has nothing to cover. R137's page-scroll was the case that
> could have broken it, which is why 320×256 is in the probe.
>
> Still not a pass. One synthetic listing, two viewports, `focus()` rather than
> a real Tab sequence, and nothing here opens the details sheet over a focused
> row. No `scroll-padding` was added: adding it would be a remedy for a defect
> nobody has observed, and would then be unfalsifiable.

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

### R3 — 1.4.12 Text Spacing (AA). ~~Never considered.~~ Measured (R186).

> **Measured, and no new loss.** `npm run measure:spacing` renders the deck in
> real Chrome against the compiled stylesheet, with the criterion's four values
> forced, at 402x874, 320x568 and 320x256 — the last being 1280x1024 at 400%
> zoom, the tightest viewport this app claims to support and the one where R137
> had to teach the shell to release.
>
> Clipped regions: **0 to 0** at every viewport. Truncated lines: **1 to 1**.
>
> The one truncation is there with the overrides OFF as well: it is the long
> film title R84 chose to `truncate`, and the full title is on the details
> sheet. That is a deliberate design decision and not this criterion, which asks
> only about loss the reader's own stylesheet CAUSES. Only the delta is 1.4.12,
> and the delta is nothing.
>
> Two limits, so nobody reads more into it. It measures a faithful skeleton and
> the real stylesheet, not the React tree — the same caveat R137's reflow
> measurement carries. And "clipped" means content taller than a box whose
> computed `overflow-y` hides it; content that overflows a box which can scroll
> is the R137 fix working, and counting that as loss would have turned a pass
> into a failure and eventually a failure into a pass.

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

### R4 — 2.2.1 Timing Adjustable (A). ~~Two limits, neither warned nor extendable.~~ Argued (R188).

Rooms are reaped after **2 hours idle** (`server/store.ts`); the timer is reset
by `touch()` on activity, which is the safer of the two shapes — a room in use
never hits it. Jellyfin auth sessions expire after **12 hours**
(`server/auth.ts`), which is an absolute limit under the criterion's 20-hour
exception, with no warning and no way to extend.

Signing in again is not data loss, so this may be defensible. It has not been
argued, and "nobody thought about it" is not the same as "it is fine".

> **Argued now (R188), and it holds — with one gap named.**
>
> **The room's two hours is not a limit on completing anything.** `touch()`
> resets it on activity, so a room being used never reaches it. What it reaps is
> a room nobody is in. 2.2.1 governs a limit on a user's ability to complete an
> activity; a timer that only fires once the activity has stopped is not one.
>
> **The session's twelve hours is a real limit, and the Essential exception is
> the honest ground to stand on** — not the 20-hour one. Twelve is *below*
> twenty, so that exception does not apply and the sentence above should not be
> read as claiming it does. What applies is that a session lifetime is a
> security control: extending it on request is precisely what it exists to
> refuse, and a limit that can be extended indefinitely by asking is not a
> session limit.
>
> **What expiry actually costs is the part that decides it.** Auth is not
> required to be in a room. It gates switching to Any Movie and firing a
> request (`wideRequires`, `requestRequires`). So a session expiring does not
> end anybody's night, does not close a room, and does not discard a vote — the
> next gated action asks for a password. Nothing in progress is lost, which is
> the loss 2.2.1 is about.
>
> **The gap, stated rather than argued away:** there is no warning before
> expiry. A host who signed in twelve hours ago meets a login screen at the
> moment they press Request, with no notice that it was coming. That is not a
> 2.2.1 failure on the reasoning above, and it is a real annoyance; warning
> before re-authentication is 2.2.5 Re-authenticating, which is Level AAA and
> outside the target this document sets.
>
> Graded **PASS (argued)** rather than PASS (tested), because this is reasoning
> about what the limits govern, not a measurement. If somebody disagrees with
> the Essential reading, the thing to attack is the paragraph above, which is
> why it is written out.

### R5 — 2.1.2 No Keyboard Trap (A), one route not covered.

The sheet's trap is sound and is tested (see below): Escape releases it, and Tab
cycles in both directions rather than dead-ending. One gap: the `keydown`
listener is on the parent `window`, and once the trailer is playing focus can
enter a **cross-origin iframe**. While it is in there, Escape never reaches the
handler and the Tab wrap never runs. Browsers do let a user tab out of an iframe
through its own controls, so this is not a hard trap — but the app's own way out
is gone while focus is inside it, and nothing in the app says so.

**F7 keeps the embed, so this stays**, and it is now a consequence somebody
chose rather than one nobody noticed. The trailer is the only cross-origin frame
in the app and it exists only after a press, so the exposure is one control deep
and reachable only on purpose. Still unverified: nobody has tabbed into a playing
trailer and tried to get back out.

> **The check, so it is thirty seconds rather than a project (R189).**
>
> It cannot be automated here and that is not a scheduling problem: the
> behaviour under test is a REAL cross-origin frame's, and a same-origin stand-in
> would answer the wrong question — the parent's listener would receive the key
> and the test would pass while the app failed. A recorded manual check beats an
> automated one that measures the wrong thing.
>
> On a machine with the app running and a card that has a trailer:
>
> 1. Open the details sheet with the keyboard alone, and press the trailer's
>    play control. The frame is now live.
> 2. Press **Tab** until focus is inside the video. YouTube's own controls take
>    focus, so you will see its focus ring rather than the app's.
> 3. Press **Escape**. *Expected: nothing happens.* The app's handler is on the
>    parent `window` and the key never reaches it. If the sheet closes, this
>    entry is wrong and the finding is better than expected.
> 4. Keep pressing **Tab**. *The question:* does focus leave the frame and come
>    back to the app, and how many presses does it take?
>
> **Record the number**, because that is the whole finding. Leaving through the
> frame's own controls is a pass under 2.1.2 — the criterion asks whether focus
> CAN leave by keyboard, not whether it is pleasant. Never leaving is a hard
> trap and a Level A failure. Anything above about ten presses is worth writing
> down even though it passes, because it is the difference between a criterion
> met and a thing somebody can actually do.

### R6 — 1.4.3 Contrast, Minimum (AA). ~~Measured, but not standing.~~ Partly standing (R187).

> **The definitional pairs are gated now.** `--color-foreground` on
> `--color-background` is what body text IS, and `--color-muted-fg` on
> `--color-background` is every secondary line — the peer count, the year, the
> runtime, the diagnosis fix row. Neither is a guess about where something is
> drawn, so neither needs a capture, and `css.test.ts` fails if either drops
> under 4.5:1. Today: **17.05:1** and **7.75:1**.
>
> `npm run contrast:tokens` also reports the accents — 6.14:1 to 11.20:1 — and
> those stay OUT of the gate on purpose: an accent owes 4.5:1 as text and 3:1
> as a large control, and which it owes depends on how it is drawn. That is the
> region problem, and it is the reason the paragraph below is still right.
>
> This does not replace `contrast.ts` and could not. A token says what the CSS
> declares; a PNG says what a person sees after opacity and blending. R89 and
> R95 are exactly the case where those two disagree.

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
| 1.2.2 Captions (Prerecorded) | A | **FAIL (stated)** | **F7 decided** — per film: met where the trailer carries an authored caption track, not met where it carries none or only an auto-generated one. The app neither supplies captions nor suppresses them, does not choose the video, and cannot see which it got. |
| 1.2.3 Audio Desc. or Media Alt. | A | **FAIL (stated)** | **F7 decided** — no audio description exists for a cinema trailer, and the sheet's synopsis is not a media alternative for one. |
| 1.2.4 Captions (Live) | AA | N/A | No live media. |
| 1.2.5 Audio Description | AA | **FAIL (stated)** | **F7 decided** — same media, and this one has no media-alternative escape. |
| 1.3.1 Info and Relationships | A | **PASS (tested)** | Roles, groups and labels are right throughout (`role="group"` on the vote row, `radiogroup` on deck size, `Group` renders a real `<section>` with its heading). **F8 fixed (R156)**: all three room screens carry one `sr-only` `<h1>`, mounted and counted in `a11y.test.tsx`. |
| 1.3.2 Meaningful Sequence | A | PASS (read) | DOM order is reading order. The one reversal — the deck renders its three cards back-to-front for z-order — is invisible to the tree because the two behind are `aria-hidden`, which `a11y` checks holds no focusable element. |
| 1.3.3 Sensory Characteristics | A | PASS (read) | No copy refers to shape, position, size or sound. Every instruction names its control. |
| 1.3.4 Orientation | AA | **PASS (tested)** | **F1 fixed (R133)** — the manifest locks no orientation; `a11y` asserts it. |
| 1.3.5 Identify Input Purpose | AA | PASS (read) | `autoComplete="given-name"` on both name fields; `username` and `current-password` on the login. The room code is not one of the listed purposes. |
| 1.4.1 Use of Color | A | **PASS (tested)** | Picked and unpicked genre rows differ by a visible glyph, not only a tone — `a11y`, "SC 1.4.1", asserted on text with `sr-only` and `aria-hidden` stripped. Vote words are covered by `controls.render.test.tsx`. R18/R26. |
| 1.4.2 Audio Control | A | PASS (read) | The trailer does not autoplay: `playTrailer` gates the iframe and the embed URL carries no autoplay parameter (R29). |
| 1.4.3 Contrast (Minimum) | AA | PARTIAL / measured | **R6** — real measurement via `npm run contrast`, not standing, and no capture covers an input or the guide. |
| 1.4.4 Resize Text | AA | PASS (read), one gap | The most-worked criterion here: every size is a rem, no `-webkit-text-size-adjust`, 200% captures exist for the lobby, the deck and the winner (R60, R74, R84, R96, R102, R126). Gap: `truncate` on the card's film title ellipsises a long name at any size and more at 200%. |
| 1.4.5 Images of Text | AA | N/A | None. |
| 1.4.10 Reflow | AA | **PASS (measured)** | **R1 was a FAIL, fixed (R137)** — at 320×256 the vote row sat 116px below a surface that could not scroll. `npm run measure:reflow` in real Chrome. |
| 1.4.11 Non-text Contrast | AA | **PARTIAL** | **F2 partly fixed (R135)** — every text input is now on a 3.57:1 token, computed in `css.test.ts`. Ghost buttons and ratings tiles stay under 3:1 deliberately; the slider track is still open. |
| 1.4.12 Text Spacing | AA | **PASS (measured)** | **R3 settled (R186)** — `measure:spacing` forces the four values in real Chrome at three viewports including 1280x1024 at 400% zoom: no clipping, and the one truncated line is truncated without the overrides too. |
| 1.4.13 Content on Hover or Focus | AA | N/A | No tooltips, popovers or hover-revealed content anywhere. `title` in this codebase is a component prop that renders visible text, not the HTML attribute; the one real `<title>` is inside the QR's SVG, which the criterion exempts as user-agent chrome. |

### Operable

| SC | Lvl | Grade | Evidence, or the gap |
|---|---|---|---|
| 2.1.1 Keyboard | A | PASS (read) | Every control is a native `button`, `a`, `input` or `select`. `Listing.tsx` says why in its own comment; the deck's drag is an accelerator over buttons that already exist (R06), which `a11y` presses. |
| 2.1.2 No Keyboard Trap | A | **PASS (tested)**, one risk | The sheet's trap cycles forward and backward and releases on Escape from inside — `a11y`, "SC 2.1.2". **R5**: the listener is on `window`, so focus inside the trailer iframe is outside its reach. |
| 2.1.4 Character Key Shortcuts | A | N/A | The app binds exactly two keys, Escape and Tab, both inside the sheet. No single-character shortcut exists. |
| 2.2.1 Timing Adjustable | A | **PASS (argued)** | **R4 argued (R188)** — the 2h room TTL resets on activity, so it only reaps rooms nobody is in and limits no one completing anything. The 12h session is a security control under the Essential exception (NOT the 20-hour one — 12 is below 20), and expiry ends no night, closes no room and discards no vote: auth gates only Any Movie and requests. No warning before expiry, which is 2.2.5, AAA. |
| 2.2.2 Pause, Stop, Hide | A | PASS (read) | Confetti is one-shot — longest delay 0.6s plus longest duration 3.0s, inside the five-second allowance — and returns `null` outright under reduced motion. Skeleton pulses and spinners are loading indicators that stop when their content arrives. `globals.css` clamps every animation under `prefers-reduced-motion`. `a11y` checks the confetti is hidden and takes no pointer events, and says in its own comment that it cannot see the 3.6s or the reduced-motion branch. |
| 2.3.1 Three Flashes | A | PASS (read) | The confetti translates and rotates; nothing in the app flashes. |
| 2.4.1 Bypass Blocks | A | N/A | No block of content repeated across pages. There is no navigation to skip. |
| 2.4.2 Page Titled | A | **PASS (read)** | **F9 fixed** — layout template plus per-route metadata; the room tab leads with its code, the guide with its own heading constant. |
| 2.4.3 Focus Order | A | PASS (read) | DOM order matches visual order on every screen. In the sheet the backdrop's close button is DOM-first but visually behind; the trap keeps focus off it, so it is a keyboard-unreachable duplicate of the close control rather than a misordered stop. |
| 2.4.4 Link Purpose (In Context) | A | PASS (read) | Two links exist — "Play in Jellyfin" and "Watch trailer". Both describe themselves. |
| 2.4.5 Multiple Ways | AA | N/A | Three routes, and a room is a step in a process, which the criterion exempts. |
| 2.4.6 Headings and Labels | AA | PASS (read) | Every heading and every label describes its subject. See **F8** for the levels. |
| 2.4.7 Focus Visible | AA | PASS (read) | `:focus-visible { outline: 3px solid var(--color-maybe); outline-offset: -3px }`. `#2fbdbd` computes about 7:1 against the app's surfaces. The `[data-app-focus]` suppression (R80) applies only to `tabIndex={-1}` elements the app focused on the reader's behalf, which are not in the tab order at all; `focus.test.ts` holds the join between the mark and the rule so it cannot drift back to matching by markup shape. |
| 2.4.11 Focus Not Obscured (Min) | AA | **PROBED, not reproduced** | **R2 (R138)** — 0px overlap at 320×256 and 402×874. The bars are siblings of the scrollport, not children. Limits noted in R2. |
| 2.5.1 Pointer Gestures | A | **PASS (tested)** | All four vote weights are cast from buttons, pressed and checked against `VOTE_POINTS` — `a11y`, "SC 2.5.1 / 2.5.7". |
| 2.5.2 Pointer Cancellation | A | PASS (read) | Every control fires on click, i.e. the up-event. The drag commits on `onDragEnd` and `dragSnapToOrigin` returns the card when the threshold is not met, so a started gesture can be abandoned (R49). |
| 2.5.3 Label in Name | A | **PASS (tested)** | **F3 fixed (R134)** — both controls renamed, and `a11y` checks the rule across four screens rather than the two instances. |
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
| 3.3.7 Redundant Entry | A | **PASS (tested)** | **F4 fixed (R139)** — the typed name is carried to the join gate; both halves mutation-tested in `home.render` and `socket.render`. |
| 3.3.8 Accessible Authentication (Min) | AA | PASS (read) | Username and password, with `autoComplete="username"` and `current-password`, nothing blocking paste, and no cognitive function test — no puzzle, no transcription, no "type the third letter". A password manager fills it. |

### Robust

| SC | Lvl | Grade | Evidence, or the gap |
|---|---|---|---|
| 4.1.2 Name, Role, Value | A | **PARTIAL** | Every control on the deck, the sheet, the winner screen and the genre picker has a non-empty accessible name — `a11y`, "SC 4.1.2", which follows the winner screen all the way into the sending state where the button's only child is a spinner (R113/T115). States are exposed: `aria-pressed` on every `RowButton`, `aria-checked` on the deck-size radios, `aria-modal` and `role="dialog"` on the sheet, `role="progressbar"` with a name on the deck bar. **F6**: the runtime slider announces an ordinal, not the runtime. |
| 4.1.3 Status Messages | AA | **PASS (tested)** | Live regions are right on the deck's card announcement (tested in `a11y`, including that the text *follows* the card rather than being a constant), the loading skeleton, the waiting screens, and every `role="alert"`. **F5 fixed**: the three counts are live regions (R136), and the winner screen's request result is mounted empty rather than inserted full. |

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
| 1.2.2 Captions | The caption track and the CC button belong to YouTube's player. jsdom renders no third-party player, and the browser harnesses run on a LAN with no route to YouTube. What can be checked here — that the app mounts the standard embed on a press and strips nothing from it — is checked in `details.render.test.tsx`. Whether the video has captions is F7's, and one press on a real device settles it. |
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
palette decision, Reflow is entangled with R21, which is the whole layout, and
the trailer was a decision about whether to embed third-party media at all —
F7 now makes that decision instead of listing it.

**U7 asked for a named target, an audit against it, and the failures listed.**
That is what this is, and it claims no conformance. It cannot claim AA at all
while the trailer is embedded, which F7 decides it will be: three criteria stay
unmet there, one of them per film and two of them permanently, for reasons that
are about video rather than about this app's diligence. What this project can
honestly publish is the statement of partial conformance in F7 — the page does
not conform, it names the single thing that would have to go, and it says what
removing it would and would not buy, which is a grade and nothing else. Closing
what remains open above is worth doing for the households it affects; none of it
turns that sentence into a conformance claim.
