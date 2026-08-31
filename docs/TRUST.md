# The trust model, and why it blocks adoption

Gate **U3** of [UPSTREAM.md](UPSTREAM.md). Written 31 August 2026 at `8631693`.
This is analysis, not a change: the fix is a design decision with real
trade-offs, and it belongs to a person, not to whoever reads this next.

## What the app does today

One credential does everything. `JELLYFIN_API_KEY` is an admin-scoped Jellyfin
key, and every library read uses it:

```
GET /Items?IncludeItemTypes=Movie&Recursive=true&Fields=…
    X-Emby-Token: <admin key>
```

`src/lib/jellyfin.ts:66,104`. Note what is *absent*: any user scope. This is the
server-wide item list, and it is the list every deck is built from, for every
room, for everyone in it.

Meanwhile the app **does** know who people are when they sign in.
`authenticateWithJellyfin` (`server/auth.ts`) posts to
`/Users/AuthenticateByName` against the real Jellyfin server, so only somebody
with a real account gets through, and it comes back with a `jellyfinUserId`.

And then it throws the useful half away. Jellyfin's `AuthenticateByName`
response carries an **`AccessToken`** — that user's own credential, with that
user's own permissions. The code reads `body.User.Id` and `body.User.Name` and
ignores it (`server/auth.ts`, the `body` destructure). The app issues its own
opaque session token instead and keeps using the admin key for everything.

So the machinery to act as the signed-in user already exists in this codebase,
is already exercised on every login, and is discarded one line before it would
be useful.

## Why that is a blocker rather than a wart

Three consequences, in increasing order of how much they would matter to a
household.

**1. Anonymous members act with server authority.** On the default auth mode,
joining a Jellyfin-only room needs no account at all. Those members cause reads
performed with an admin key. Nothing they can do is *destructive* — the app only
reads `/Items` — but the authority in play is unbounded by anything the user
model would bound.

**2. Per-user library access is not applied.** Jellyfin lets an administrator
give accounts access to some libraries and not others. That filtering happens on
user-scoped requests. A server-wide `/Items` read with an admin key is not
user-scoped, so the deck is built from the whole server regardless of which
libraries any member can actually open.

**3. Parental controls are the sharp end of the same thing.** Jellyfin has
per-user maximum parental ratings and block lists. They are enforced the same
way — on the user's own view — and this app never asks for a user's view.

> **Stated as a hypothesis, not a measured fact.** I have not run this against a
> Jellyfin server with parental controls configured, so I have not *watched* a
> restricted title appear on a card. The mechanism is clear from the request the
> app makes, and the code is unambiguous that no user scope is sent. Confirming
> it takes one server, one restricted account and one deck build, and it should
> be confirmed before anyone repeats it as fact. **This is the single most
> important open question in the repository** — a household with children is
> exactly the household this app is for.

If it holds, then a child who joins the room on their own phone is shown titles
their own Jellyfin account is configured to hide from them, on a screen designed
to make them look appealing. That is not a subtle privacy nit. It is the app
quietly overriding a decision a parent already made in Jellyfin.

## What would fix it

The direction is not in doubt — **read the library as the user, not as the
server** — but rooms mix signed-in members with guests who typed a four-letter
code, and that is where the design decision is.

**Option A — intersect the members' views.** Build the deck from the
intersection of what every signed-in member may see. Safest: nobody is shown
anything their own account hides. Costs one library read per distinct user and a
policy for guests (below). This is the only option a privacy or safeguarding
mandate would accept without argument.

**Option B — the room creator's view.** One read, simple, and wrong in the case
that matters: an adult creates the room, so a child in it sees the adult's
library.

**Option C — require an account to join (`MATCHER_AUTH=all`) and intersect.**
Closes gate U4 at the same time and makes the model coherent. Costs the thing
that makes the app pleasant — a guest can currently join in four seconds with no
account, which is most of why it works on a Friday night.

**The guest question, which none of the options escapes.** If unauthenticated
people can be in a room, the honest choices are: treat a guest as having the
*most restrictive* view present, refuse to start a mixed room in Any Movie mode,
or state plainly in the UI that a room containing guests is not filtered. Doing
none of these is the current behaviour and it is the part that is hardest to
defend.

## What this costs to build

Not enormous, which is worth saying since "architectural" can sound like
"forever":

- Capture `AccessToken` at login and store it on the session (`server/auth.ts`).
- Add a user-scoped library read alongside the admin one
  (`src/lib/jellyfin.ts`), i.e. `/Users/{userId}/Items`.
- Decide the room policy above, and make the deck builder take a viewer set
  rather than a server.
- Keep the admin key only for what genuinely needs it.
- Say in the UI, on the lobby, whose view the deck is built from — because a
  household cannot reason about a filter it cannot see.

The last one is the one that will get skipped, and it is the one that makes the
rest trustworthy.

## Why it is not being done in this commit

It changes the deck's meaning, it needs a decision about guests that is a
household's to make rather than an implementer's, and the parental-control
consequence above should be *confirmed on a real server* before it is designed
around. Filed in [QUEUE.md](../QUEUE.md) with the confirmation step first.
