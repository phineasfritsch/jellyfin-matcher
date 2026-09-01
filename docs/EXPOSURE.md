# A public hostname, and what "safe by default" would cost

U4 on [the upstream bar](UPSTREAM.md) says a public hostname must be safe by
default. Today it is not, the README says so in three places, and the gate has
read "documented, not fixed" for a long time.

Warning about a thing is not the same as having a plan for it. U3 has
[TRUST.md](TRUST.md) — a hypothesis, a cost, and a decision named as somebody
else's. U4 had three warnings and no equivalent, so the next step was "somebody
decides", with nothing laid out to decide between. This is that, and **it
decides nothing**: every option below has a cost, and which cost is acceptable
is a household's answer, not an implementer's.

## What is actually true today

`MATCHER_AUTH=requests` is the default. Creating a room and joining one need no
account. Signing in is asked for only when a room switches to "Any Movie" or
somebody fires a Jellyseerr request.

So on a public hostname: anyone who finds the URL can open a room and swipe
through the titles in the library. Nothing is playable or downloadable without
an account — **the exposure is the list of what you own**, which is a real
privacy fact and not a takeover.

The property this protects is worth naming precisely, because every option below
is measured against it: **a guest scans a QR and is swiping in about four
seconds, having installed nothing and made no account.** That is most of why the
app is pleasant with visitors, and it is the thing an upstream-safe default is
in tension with.

## The options, and what each costs

### 1. Default to `create` — the host signs in, guests do not

`MATCHER_AUTH=create` already exists and already does this: creating a room
needs a Jellyfin account, joining stays open.

- **Cost to the guest join: none.** A guest scanning a QR still joins in four
  seconds with no account. Only the person starting the night logs in, and they
  are the one household member certain to have an account, on their own server.
- **Cost to the host:** one login per twelve hours, on the device they start
  nights from.
- **What it fixes:** a stranger with the URL can no longer open a room, so they
  cannot make a deck to read. They could still join a room whose four-character
  code they guessed while it was live.
- **Honest weakness:** it narrows the window rather than closing it. See 2.

This is the cheapest option by some distance, and the reason it is not already
the default deserves to be written down rather than assumed.

### 2. Make the room code unguessable on a public host

A four-character code is an invitation, not a credential (R86), and that is
correct on a LAN. On the open internet it is also a small keyspace that a
patient script can walk while any room is live.

The share link is `${origin}/room/${code}` and the QR encodes that same URL, so
a longer code or an appended link secret costs a guest **nothing at all** —
they scan a QR either way. It costs only the person typing a code by hand.

- **Cost:** typing a code aloud across a room gets worse, which is the fallback
  when a camera will not focus.
- **What it fixes:** the guessing attack, completely.
- **Shape:** either a longer alphabet on public deployments, or keep the short
  code for typing and put a secret in the QR that a typed code cannot supply.

### 3. Detect exposure and refuse to start

The server already knows enough to say what it is exposing — R131 prints an
exposure banner at boot. It could refuse to start on a public bind with an open
auth mode, rather than printing a warning nobody reads.

- **Cost:** a deployment that works today stops working after an upgrade. That
  is the worst kind of change to ship to somebody's home server, and it would
  have to be a major version with a loud note.
- **What it fixes:** the case where somebody never read the README.

### 4. Do nothing, and say so louder

Keep the default, and make the README's warning impossible to miss.

- **Cost:** U4 stays open for ever, and this is the option that reads as
  reasonable in the moment and is indefensible in aggregate — it is what
  produced a gate that has said "documented, not fixed" for months.

## What has to be decided, and by whom

**Whether the four-second guest join survives.** Option 1 keeps it entirely and
is nearly free; the fact that it has not been chosen suggests either that the
host login is more annoying than it looks, or that nobody has weighed it. Option
2 keeps it too and costs only spoken codes.

That is the household's call. What an implementer can say is that the two
cheapest options do not cost the property everyone assumed was at stake, and
the gate's own framing — "safe by default costs the four-second guest join" —
is **not accurate for options 1 or 2**. It is accurate only for
`MATCHER_AUTH=all`, which is the one nobody was proposing.

## Why this is not being built here

It changes the default behaviour of an app running in somebody's house. The
decision is a household's, the migration story matters more than the code, and
none of the four options is hard to build once the question is answered.

Filed in [QUEUE.md](../QUEUE.md), with the decision as the first step rather
than the implementation.
