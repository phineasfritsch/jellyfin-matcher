# 1.1 — a night that survives

1.0 is settled. This is the next release, and it has an end: the conditions in
**Done means** below are all true, `v1.1.0` is tagged, and the image is
published. Not "when it feels finished" — the board already answered that
question once and the answer stopped being useful the moment it was given.

Everything here is either a thing a household would notice on a Friday, or a
defect already found and written down. Nothing here is a gate from
[UPSTREAM.md](UPSTREAM.md) for its own sake; where the two overlap, that is
noted, but the reason to do it is the household.

---

## Done means

1. **A restart does not end the night.** — **Server side done; the browser
   proof is the one thing a session cannot close.** Rooms are snapshotted and
   restored (R149/R150), and `server/__tests__/restart.test.ts` drives the real
   handlers through a snapshot, a fresh store and a rejoin — including that a
   phone which never came back is not counted present, and that R112 still
   refuses a stale socket a seat in a restored room. What remains is
   `npm run e2e:two`, which needs a machine with a live Jellyfin.
2. ~~A room can settle early.~~ **Answered: do not build (R152).** The focus
   group returned 5 of 5 against, and the reason is structural — any card
   everyone liked already ends the room, so a mid-deck "leader" is the app's own
   top pick, not the room's choice. Replaced by the bug it was masking: the deck
   no longer names the people it is waiting for (R151).
3. **Every string is in the catalogue.** — **DONE**, on the third attempt, and
   the two failed ones are the useful part. It was called finished once with the
   guide's prose left behind (R155 wrote down why: a sentence wrapping an
   element could not be held without splitting it into fragments a translator
   cannot reorder — R158 built the message type that fixed it), and finished
   again with eight sentences still hardcoded, because completion had been
   checked by listing FILES and a string lives in a BRANCH (R159). The guard
   now asks the source, and its one blind spot — a sentence inline with its
   tag — is stated in the test rather than implied away.
4. **The four open accessibility items are closed or declined in writing.** —
   **DONE.** The missing `<h1>` is fixed and tested (F8, R156); the per-route
   titles and the live region were **already fixed while the audit still called
   them failures** (F9, F5), which is why R157 now checks the audit against the
   repository; and the trailer's captions are decided and stated rather than
   left open (`FAIL (stated)`), including the cost the privacy choice imposes —
   `youtube-nocookie.com` is a different origin, so no stored caption
   preference reaches the frame.
5. **`npm run gate` green by exit code**, mutation audit included, and the
   counts synced. — **DONE and held there**: 9/9, 1036 cases in 50 files, 52 of
   52 mutations killed. One of those mutations went SURVIVED mid-session and
   caught a real defect in a re-pointed claim, which is the audit earning its
   runtime.
6. **Tagged `v1.1.0` and published**, so there is a version to pin and roll back
   to — which there has not been since `v0.9.0`.

---

## Features

### F1 — Rooms survive a restart  *(the big one)*

Room state is a `Map` in `server/store.ts`. A container replacement ends every
room in progress; five phones mid-deck simply lose the night, and there is no
reconnect that survives it.

This is worth doing for three separate reasons, which is unusual:

- **A crash at 9pm costs the evening.** Not hypothetically — the process holds
  everything.
- **It is why auto-deploy has to defer** (R147). If rooms survived, the deploy
  script's careful refusal becomes unnecessary and an update lands whenever it
  arrives.
- **It is the only one of these that gets harder later**, because everything
  else in the app assumes the map.

The `.cache` volume already persists across restarts and already holds the watch
history, so there is a place to put it. The hard parts are what to persist (seat
secrets are in `secrets`, deliberately off the `Room` — R86), what to do with a
socket that reconnects into a restored room, and how to expire rooms that were
mid-night when the server died three days ago.

### F2 — "Let's just watch that one" — DECLINED, 5 of 5

The focus group answered it before anything was built, which is what they were
for. Full reasoning in R152; the short version is that any card every connected
member liked has already ended the room, so the only thing a mid-deck proposal
can offer is a card the room has not agreed on — usually the app's own
top-rated pick, presented as the room's choice.

What the question was really about was the wait, and the wait had a defect in it:
the deck-finished screen named the people it was waiting for, including ones who
had finished and ones who had gone home (R151). That is fixed. If the pressure
returns after a household has actually used it, the shape worth revisiting is
the host's: offer the card in your hand, push it to the front of everyone's
deck, and let the existing unanimous path decide — no leaderboard, no new
settlement, and nobody voting on a film they cannot see.

### F3 — Finish the string catalogue

Two of nineteen files are migrated. The pin question is answered — the catalogue
lives in scanned source, so moving text costs no pin churn — and the duplication
guard makes it safe to do incrementally. This is mechanical, and it is the U8
gate as a side effect rather than as a goal.

---

## Bugs

Each of these is already found, already written down, and already has a place it
belongs.

- **B1 — no `<h1>` on three routes**, and all three inherit one page title.
  (WCAG 1.3.1, 2.4.2; `docs/ACCESSIBILITY.md`.)
- **B2 — the winner screen's live region is inserted already containing its
  text**, which polite regions announce unreliably. (4.1.3.)
- **B3 — the trailer has no captions or audio description.** Three criteria,
  one embed, and the only remaining Level A failures. Likely outcome is an
  honest statement rather than a fix, since the media is YouTube's — but that
  has to be decided and written, not left.
- **B4 — the remaining hollow claims from R129**, wherever the audit's list
  still stands after this session's fixes.
- **B5 — `JSON.parse(/Items)` measured superlinear** in the U10 benchmark
  (×13.9 for ×10 items). Paging changed the shape of this; re-measure before
  assuming it is still true.

---

## Explicitly not in 1.1

- **The trust model (U3).** Reading the library as the user rather than as the
  server is the single biggest thing standing between this and adoption, and it
  needs a real Jellyfin with parental controls to confirm the hypothesis first.
  Not a release item; a decision item.
- **A safe default for a public hostname (U4).** Costs the four-second guest
  join, which is most of why the app works. A product decision, not a bug.
- **Locale selection.** F3 is extraction. Choosing a language is separate work
  and pretending otherwise is how a refactor becomes a rewrite.

---

## How this gets built

A focus group of household personas judges F2 before it is built and reviews F1
and F3 for what they miss. Then implementation runs in parallel on **disjoint
files**, because two agents editing one file in one tree is a merge conflict
nobody asked for. Every change is adversarially verified, and every defect it
fixes goes into `mutations.json` so G9 puts it back on every run.
