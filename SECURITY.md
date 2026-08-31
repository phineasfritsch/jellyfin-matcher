# Security

## Reporting a vulnerability

Open a **private** security advisory through GitHub: **Security → Advisories →
Report a vulnerability** on this repository. That reaches the maintainer without
the report being public first.

Please do not open a normal issue for anything exploitable. Issues are public
from the moment they are filed, and this is software people run inside their
homes.

Expect a first reply within **7 days**. This is a single-maintainer hobby project
(see [docs/MAINTAINING.md](docs/MAINTAINING.md) — the bus factor is one, and
that is stated rather than hidden). If a fix is going to take longer than the
reply, you will be told so and told roughly how long.

## What this app is trusted with, stated plainly

Read this before deciding whether a finding is a vulnerability or the design.

- **It holds a Jellyfin API key with server authority.** `JELLYFIN_API_KEY` is
  an admin-scoped key. The app acts with that authority on behalf of everyone in
  a room, including people who have never signed in to anything. This is a known
  architectural limitation, tracked as gate **U3** in
  [docs/UPSTREAM.md](docs/UPSTREAM.md), and it is the single biggest reason this
  is not yet something an upstream project would adopt.
- **It may hold a Jellyseerr API key**, used only in "Any Movie" mode. A request
  made through it can cause a real download onto the host's disk.
- **The default auth mode gates nothing.** Creating and joining a Jellyfin-only
  room needs no account, so anyone who reaches the URL can read the titles in
  the library. The README says so; a safe default is gate **U4**. On a LAN this
  is the intended design. On a public hostname it is not safe, and neither this
  file nor the README pretends otherwise.
- **Room codes are four characters.** They are an invitation, not a secret, and
  are treated as such throughout.
- **Seat secrets are not room codes.** Reclaiming a seat requires a secret
  issued to that seat and never broadcast (R86), and only the socket currently
  holding a seat may give it up (R112).

A report that says "an unauthenticated user can list the library on the default
mode" is documented behaviour, not a finding. A report that says "a room member
can read another member's seat secret", or "a guest can cause a download without
passing the confirmation", or "the API key reaches a client", is a finding, and
an important one.

## What is in scope

- Anything that lets a room member act as another member, or take a seat that is
  not theirs.
- Anything that causes a download without the confirmation the UI promises.
- Any path by which `JELLYFIN_API_KEY`, `JELLYSEERR_API_KEY`, `MDBLIST_API_KEY`
  or a seat secret reaches a client. There is a structural test for this
  (`server/__tests__/provenance.test.ts` and the pins), and it should be
  impossible; if you find a way, that is exactly the report to send.
- Anything reachable by someone who has only ever been given a room code.

## What is out of scope

- The two design limitations named above (U3, U4), which are tracked, not
  hidden. Reports that they exist are welcome as *evidence for prioritising*
  them, but they are not new findings.
- Denial of service by somebody already inside the house with a valid room code.
- Third-party services (Jellyfin, Jellyseerr, MDBList, TMDB). Report those to
  them. What they can see from here is documented in
  [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Supported versions

Only the latest release. There is one maintainer and no backport capacity; this
is stated so nobody plans around a support window that does not exist.
