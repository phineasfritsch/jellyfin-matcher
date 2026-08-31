# Redesigning Matcher

The procedure, filled in for this app. Stage 04 is already done and green —
that is the whole reason this document is worth anything.

```
personas ─▶ bracket ─▶ system ─▶ briefs ─▶ components
                                    │
                                    ▼
                      INVENTORY ─▶ PIN ─▶ port ─▶ adjudicate ─▶ ship
                      └──── stage 04 ────┘        └─ stage 06 ─┘
```

A redesign is not a rewrite of appearance. It is a rewrite of appearance that
must preserve every non-visual property the old interface happened to carry,
and until this week nobody had a list of those. `npm run inventory` makes the
list; `src/ui/__tests__/pins.test.ts` defends it.

---

## Stage 00 — Before convening anyone

**What this interface is judged on.** In order. A direction that wins on a later
one at the cost of an earlier one has lost.

1. **Time to a decision.** The app exists to end an argument. Every screen is
   measured by how fast a room of people gets to a movie.
2. **Simultaneity.** Everyone is on their own phone, in the same room, at the
   same moment. Nothing may make one person wait on another's screen state.
3. **Legibility one-handed, in the dark, on a couch.** Phone-first is not a
   breakpoint here, it is the only real case.
4. **Honesty about cost.** "Any Movie" fires a real download request into
   Radarr. The interface says so before it happens, not after.
5. **Openable by a guest.** A friend with no Jellyfin account can join and
   swipe. Anything that makes an account feel required has broken the product.

**Constraints that are not aesthetic.** A direction violating one is not a
candidate, no matter how well it argued.

- Phone viewport, ~360×640 usable. The card, its title and the four vote
  controls fit above the fold with no scrolling. This is the fold budget.
- Touch targets stay ≥ 44px. Voting happens fast and half-looking.
- **Every gesture has a button.** Swiping is an accelerator, never the only
  path. Pinned as A01/A02 and promised in the README (D06).
- Keyboard and screen reader operable throughout: 22 pinned a11y hooks.
- No new heavyweight dependencies. This ships as one small self-hosted image.
- Works over plain HTTP on a LAN; no external font or asset fetch at runtime.
- Dark by default. It is used with the lights off.

**Current suite:** 107 cases in 10 files, 38 pins, green. Every later count is
measured against this. It lives in `gates.json`.

**Wave size:** one screen per wave. There are only six of them and they are
dense. Four-page waves are for sites with twenty pages.

---

## Stage 01 — Personas, as constraints

Not demographics. Each of these is in tension with at least one other, which is
the only reason to have them.

| # | Persona | Constraint | In tension with |
|---|---|---|---|
| P1 | **The host** | Has the server, made the room, wants everyone ready in under a minute | P3: settings they want are clutter to everyone else |
| P2 | **The guest with no account** | Joined by QR, no Jellyfin login, must never hit a wall they cannot pass | P4: the honest disclosure of cost reads as a login prompt |
| P3 | **The tenth swipe** | Deciding in under two seconds, one thumb, screen at arm's length | P5: detail and rating context need room |
| P4 | **The person paying for storage** | Needs to know before a request lands in Radarr | P2, P3: every warning costs a moment |
| P5 | **The one who cannot swipe** | Screen reader, or a hand that does not do gestures, or a cracked screen | P3: everything must have a named, hittable control |

**Taste is not delegable.** Simulated users can rank whether a layout serves a
task. They cannot tell you something is ugly, off-brand, or embarrassing. Every
visual direction gets one human look at a screenshot before it ships. That look
takes thirty seconds and there is no substitute for it.

**Scope the verdict before the panel runs.** A panel asked about density rules
on density and nothing adjacent — not palette, not tone, not motion. A density
verdict is not licence to repalette.

---

## Stage 01 result

The bracket ran. Winner: **One Poster, One Tap** — the card carries a poster, a title
and at most one chip; every other fact is one deliberate tap away in a sheet you can
vote from without losing your place. The frozen direction, rulings R19-R38, and an
honest account of what the bracket missed are in [DIRECTION.md](DIRECTION.md).

Rulings R01-R18 below still stand; R19-R38 are additive and cited the same way.

## Stage 02 — Rulings

Numbered because a ruling has to be citable from a code comment six weeks later
by someone arguing with it. Prose is context; these are the contract. Cite them
as `R07` in a comment when a line exists only because of one.

**Decision flow**

- **R01** A "maybe" never locks a match. Only unanimous like or super-like ends
  a room. (README D01; `isInstantMatch`)
- **R02** The deck never dead-ends. Running out produces a scored winner, never
  a blank screen. (`fallbackWinner`; pinned C06)
- **R03** Progress is always visible and always personal: how far *you* are, not
  the room. (pinned A03/A04)
- **R04** No screen waits on another person without saying whom it waits for.

**Voting surface**

- **R05** Four vote weights, always in the same order, always the same colours:
  dislike, maybe, like, super like.
- **R06** Every vote is reachable as a button with a name. Gestures are an
  accelerator. (pinned A01/A02; README D06)
- **R07** The card, its title and the vote row fit above the fold on a 360×640
  phone. Anything else is behind a tap.
- **R08** Poster taps and the info button open the same sheet. One way in, two
  affordances.

**Honesty**

- **R09** A control that spends money, storage or bandwidth says so on the
  control, before it is pressed. (pinned C02)
- **R10** A login prompt states which account it wants and what it unlocks.
  Never "sign in to continue". (pinned C01/C04)
- **R11** Scope is stated in the words that matter to the user: "on the server
  now" versus "gets requested". (pinned C03)
- **R12** A statistic never appears without naming what it covers. A score is
  labelled with its sources; a rating names its site.
- **R13** Every empty state explains itself in a sentence. No blank panels.
  (pinned C05/C06)

**Access**

- **R14** Every interactive group is named: genres, votes, deck size, members,
  final ranking. (pinned A05–A17)
- **R15** Errors and connection changes reach a live region, not just a colour.
  Five surfaces carry `role="alert"` and the count is pinned.
- **R16** Room codes never contain characters people misread aloud. (pinned B01)

**Costs**

- **R17** No runtime fetch to anything outside the user's LAN. Fonts and assets
  ship in the image.
- **R18** Motion is decorative and optional; nothing is only communicated by
  animation.

Expect roughly three rulings per screen. A brief with none is unfinished.

---

## Stage 03 — Components before screens

Turn rulings into shared code before touching a screen. The candidates here, in
the order they pay off:

1. **VoteRow** — R05, R06, R07. Currently `ActionBar` inside `SwipeDeck.tsx`.
2. **Stat / RatingLine** — R12. Currently duplicated between `MovieDetails` and
   `WinnerScreen`.
3. **ScopeChoice** — R09, R11. Currently inline in `Lobby.tsx`.
4. **EmptyState** — R13. Currently three separate hand-written sentences.
5. **LiveNotice** — R15. Five `role="alert"` blocks that should be one thing.

The argument is not tidiness. It is that a fix currently reaches one screen and
not its neighbour, and a redesign is the only moment you get to stop paying for
that repeatedly.

**The component layer must land green against the unported app** — `npm run
gate -- --fast` passes with no screen using it yet. If it cannot, it is not a
component layer, it is a rewrite wearing one.

---

## Stage 04 — Inventory, then pin  ✔ done

This is the stage that does not exist in anyone's plan and the reason redesigns
quietly destroy things. It is already built here:

- `npm run inventory` extracts the candidates mechanically — accessibility
  hooks and sentences containing limiting language — from comment-stripped
  source. 42 a11y hooks found across six components.
- `src/ui/__tests__/pins.test.ts` holds the 38 shortlisted claims, each pinned
  by key phrase rather than full wording, so a legitimate rewrite passes and a
  deletion fails.
- The haystack is the **whole app**, so moving copy into a shared component is
  not reported as a loss. That mover-versus-loser distinction is what stops the
  guard becoming noise within a day.
- Comments are stripped, so a deleted sentence quoted in the comment explaining
  its deletion cannot satisfy the test protecting it.
- **It is green now, before any port starts.** A pin that is already red is a
  bad pin.

Before porting a screen, run `npm run inventory -- <ScreenName>` and add
anything the shortlist missed. Adding pins *after* the port grades the work
instead of protecting it.

---

## Stage 05 — The port

| Do | Because |
|---|---|
| One agent per screen, one screen per agent | two writers on one file is silent last-write-wins |
| Port agents never run the gate or `npm run e2e` | e2e binds port 3000 and can fire real Jellyseerr requests |
| One serial verifier after the wave | a worker cannot grade its own work |
| Give each agent an already-ported screen as a worked example | style converges from an example faster than from prose |
| Require a report naming every dropped sentence and the ruling that justified it | forces the judgement to happen somewhere you can read it |
| Revert per screen, not per wave | one bad screen should not cost the good ones |
| Quarantine a failed attempt on a branch before reverting | the next attempt mines it |

**Nothing ships until a verifier that actually ran says so.** Treat a missing
verification exactly like a failed one — a verifier that died mid-response has
shipped unchecked work before.

---

## Stage 06 — Adjudicate

Every failing check is one of two things and from a diff they are identical:

1. **The port broke behaviour.** Fix the port.
2. **The port changed something deliberately and the check is stale.** Fix the
   check — only after confirming the property survives where a reader meets it.

Rules for this stage:

- **Read the rendered screen, not the diff.** On a phone viewport, in the dark.
- Never weaken an assertion to something a blank screen would pass.
- When you change a pin, update its `why` to say what the new form is and why
  the property is intact.
- **Count the changes.** A large count means the work is drifting, not the
  checks. More than three pin edits in one screen's port is a revert, not an
  adjudication.

---

## Cut list — what to refuse

- **Redesigning what nothing links to.** `app/guide/page.tsx` and the Custom
  Tabs help page are last. They are where stale colours survive longest and
  they are also where nobody is looking.
- **Any direction that violates a Stage 00 constraint.** The panel was not told
  about the fold budget or the 44px targets.
- **A second opinion on something already decided.** The most expensive way to
  feel confident.
- **Finishing the port before a night people actually want to use it.** A
  half-ported app that is visually inconsistent costs less than missing the
  evening the app exists for.
- **Fanning the port out wide.** Measured elsewhere: the same port cost 2.84M
  tokens fanned to eleven agents and was reverted twice; done directly it cost
  ~0.5M and shipped. Fan out the reading and the judging. Do the writing.
