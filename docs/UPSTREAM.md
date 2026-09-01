# The upstream bar

The 1.0 board asked "is this finished?" and six rounds later answered yes. That
question is closed and this document does not reopen it.

This is a **harder** question, and it is the only one that ends the work now:

> Would the Jellyfin project accept this as an official, supported part of the
> Jellyfin ecosystem — and would a company acquiring it find nothing in due
> diligence that it would have to fix before shipping to customers?

Not "is it good". Not "does the maintainer like it". **Would strangers who owe
this project nothing, and who carry the cost of every mistake in it, take
responsibility for it.**

That bar is meant to be hard. It should stay unmet for a long time. A round that
returns "no, and here is why" is the round working correctly.

---

## Why this bar and not another

The 1.0 board was five mandates who had read the product. They were adversarial
and they found real defects in every round. But they shared two blind spots, and
both were exposed within hours of their unanimous verdict:

- **R124** — the rulings index had been silently missing 24 rulings while
  stating a total and declaring nothing orphaned. Nobody on the board looked,
  because the file looked maintained and its gate passed.
- **R129** — an eight-agent mutation audit found that **49 of 97** claims the
  test suite makes did not survive the bug they name. The board had been
  reading a green suite as evidence. It was evidence of less than its size.

A board that reads the product will keep finding product defects. A board that
has to *adopt* the product asks a different question, and it is the question
that catches this class: not "is this right?" but "what would I have to own?"

---

## The bar has two halves, and both must be met

### Half one: objective gates

These are facts, not opinions. A mandate may not vote yes while one is unmet,
however good the product looks. Four are met; the status column is kept current
because a table that disagrees with its own summary is the failure this project
keeps finding in other people's documents.

| # | Gate | Status |
|---|------|--------|
| U1 | **Zero hollow claims.** Every claim the suite makes fails when its defect is reintroduced, or its own comment names what actually guards it and where. | ⚠ partly — 43 catalogued mutations run on every gate; the audit's remainder is in QUEUE.md |
| U2 | **The mutation audit is automated and gated.** A human deciding when to re-run it is the same failure as a generator checking itself (R124). | ✅ met — gate G9, `npm run mutate` |
| U3 | **No admin API key in the trust model.** The app authenticates to Jellyfin with a server API key, so it acts with full server authority on behalf of anonymous room members. No upstream project accepts that, and no acquirer ships it. This is architectural, not a setting. | ❌ by design today |
| U4 | **A public hostname is safe by default.** Today the default auth mode gates nothing: anyone with the URL reads the library. The README warns; upstream would require a safe default instead. | ❌ documented, not fixed |
| U5 | **Deployment parity verified.** At least one run proving what is deployed matches this repository. Never once done. | ❌ blocked on an address |
| U6 | **Used by a household that is not the maintainer, for ten evenings.** With what broke written down. | ❌ never |
| U7 | **Accessibility conformance stated and measured.** A named target (WCAG 2.2 AA), an audit against it, and the failures listed. | ⚠ partly — audited in docs/ACCESSIBILITY.md, six criteria fixed, three media failures and two unverified remain |
| U8 | **Internationalisation.** Extraction is done: every sentence the UI says lives in `src/ui/strings.ts`, reached through `t()` or `Sentence`, with the reasoning a translator needs stored beside the load-bearing ones and asserted as data (R145). Three guards keep it that way — no component holds a second copy, no screen writes prose into its markup, and the promises that live in wording go red if a translation undoes them. What is NOT done is selection: there is one catalogue, `en`, and nothing chooses another. Jellyfin ships in dozens of languages. | 🟡 half — extracted, not selectable |
| U9 | **Licence, provenance and dependency review.** Licence declared in both places, every dependency's licence checked, and every destination the app can reach written down with what it can see. | ✅ met — docs/DEPENDENCIES.md |
| U10 | **Performance evidence at real library scale.** Deck build measured against 10,000+ items. | ✅ met — docs/PERFORMANCE.md; found and fixed a quadratic cache and an un-paginated fetch |
| U11 | **A maintenance story.** The release is reproducible, dependencies and rot are checked on a schedule, security has a private path in, and the bus factor is stated rather than hidden. | ✅ met |

### Half two: a unanimous board of five adopting mandates

Every mandate votes as somebody who would **carry** this, not review it.

1. **Upstream maintainer.** Would the Jellyfin project take this into its
   ecosystem? Judges the trust model, the API surface, the support burden, and
   whether it fits how Jellyfin is actually deployed by people who are not the
   author.
2. **Security and privacy.** Judges the authority the app holds, what leaves the
   house, what a hostile room member can do, and what a leaked URL costs.
   Assumes the attacker is a guest who was invited once.
3. **Acquirer's technical due diligence.** Judges what would have to be fixed
   before a company put its name on it: licences, dependencies, secrets, the
   test suite's actual worth, the bus factor.
4. **Accessibility and internationalisation.** Judges it against a standard by
   name, and against a user who does not read English.
5. **Operations.** Judges what happens at 2am when it breaks in someone else's
   house: diagnosis, logs, upgrade, rollback, data loss.

**The rules, which are deliberately stricter than the 1.0 board's:**

- **Unanimous, in one round.** Five yeses, same round, as before.
- **No mandate may vote yes while any objective gate above is unmet.** This is
  the change that makes it hard. Taste cannot outvote a fact.
- **Every yes must name what the mandate would personally own** if it were
  wrong. A yes with nothing at stake is an abstention.
- **A mandate that voted yes in a previous round must re-verify at HEAD.** The
  1.0 board adopted this in round six and it is why round six was trustworthy.
- **Claims are verified adversarially before they count**, as before.
- **The chair may not vote.** The chair's job is to check the round's own
  citations — which is how R124 was found.

---

## What this is not

It is not a promise that this will ever be merged upstream, or that anyone will
buy it. Nobody has been asked. It is a **standard borrowed from people who would
have to live with the result**, because that standard catches things a friendly
reader cannot.

It is also not a reason to stop shipping. 1.0 is real, it works, and a household
can use it tonight. The bar above is what would make it *someone else's* to
rely on.

## An amendment, and why it is not a loosening

U11 originally required **more than one person able to release**. The owner has
ruled that out of the evaluation: this is a one-person project and will remain
one, so a gate that can never close is not a standard, it is a complaint.

That is accepted, and it is not the same as pretending the risk is gone. The bus
factor is one; [MAINTAINING.md](MAINTAINING.md) says so in its first line, where
somebody deciding whether to depend on this reads it before they depend on it.
What U11 now asks is everything a single maintainer *can* deliver — a release a
stranger could reproduce, updates that arrive small and often instead of all at
once under pressure, a private way to report a hole, and no claim anywhere that
more people are involved than are.

Stating a limitation plainly is a maintenance story. Requiring a second person
who does not exist is not.

## Honest position today

Eleven objective gates. **Four met** — U2, U9, U10, U11 — and three partly: U1,
U7 and now U8. The four still open are U3, U4, U5 and U6.

All four are things a session cannot decide alone. U5 needs a deployment
address, U6 needs a household that is not the maintainer, and U4 is a product
decision that costs the four-second guest join. U3 is architectural and needs a
real server with parental controls to confirm its hypothesis before anything is
designed.

U8 moved, and it is worth saying exactly how far. The extraction is finished and
guarded; a translator now has one file, with the reasoning attached to the
sentences that carry a promise. Selection is not built — one catalogue, nothing
choosing another — and that is deliberately not the same work. This row said
"not started" for some time after it had started, which is the same fault R157
was written for, one document further out.

So the most likely honest verdict for a long time is still **0/5**, and the
queue that comes out of each round is the point.
