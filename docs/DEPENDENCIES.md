# Dependencies, provenance and what leaves the house

Gate **U9** of [UPSTREAM.md](UPSTREAM.md). Audited 31 August 2026 at `a3403d9`.

This exists because an acquirer's technical due diligence and a Jellyfin
maintainer ask the same two questions first: *what am I taking on legally*, and
*what does this send where*. Neither had an answer in this repository.

## Licence

`LICENSE` is MIT. `package.json` now declares `"license": "MIT"` — it declared
nothing at all until this audit, so every tool that reads provenance from the
manifest saw an unlicensed package sitting beside a permissive licence file.
`packaging.test.ts` now requires the two to agree.

## Runtime dependencies

Nine, all permissive, no copyleft, nothing requiring attribution beyond the
licence text.

| Package | Version | Licence |
|---|---|---|
| express | 5.2.1 | MIT |
| framer-motion | 12.42.2 | MIT |
| lucide-react | 1.26.0 | ISC |
| next | 15.5.21 | MIT |
| react | 19.2.8 | MIT |
| react-dom | 19.2.8 | MIT |
| react-qr-code | 2.2.0 | MIT |
| socket.io | 4.8.3 | MIT |
| socket.io-client | 4.8.3 | MIT |

Checked by reading each installed package's own manifest, not a lockfile
summary. `puppeteer-core` is a dev dependency and drives the machine's existing
Chrome; no browser is downloaded.

## What leaves the house

The important half, and the half nobody had written down.

| Destination | Who calls it | When | Carries |
|---|---|---|---|
| **Your Jellyfin** | server | every deck build | server API key |
| **Your Jellyseerr** | server | Any Movie mode only | admin API key |
| **api.mdblist.com** | server | deck build, cached 7 days | your MDBList key, TMDb ids |
| **image.tmdb.org** | **every phone in the room** | **every card in Any Movie mode** | the film being looked at |
| **youtube-nocookie.com** | a phone | only after "Play trailer" is pressed | the film being looked at |

### The one worth arguing about

`image.tmdb.org` is the only third party that **client** devices contact, and it
is not disclosed anywhere a user reads. In Any Movie mode a candidate that is
not on your server gets its poster straight from TMDB
(`src/lib/candidates.ts:72`), rendered as a plain `<img src>` in
`SwipeCard.tsx`. `SwipeDeck.tsx` also *preloads* the next card's image, so the
request goes out for films nobody has looked at yet.

The consequence: TMDB — and any network between the phone and TMDB — can see
which films a household is browsing on a Friday night, from every phone
separately, including films the household does not own. The server never has to
be involved for that to happen, and none of it appears in the README.

This is not a leak of credentials and it is not unusual for a media app. It is
listed here because U9's question is not "is this normal", it is "would somebody
adopting this be surprised". They would.

**Options, none taken yet, all a decision rather than a fix:**

1. Proxy posters through the server, which already talks to TMDB's neighbours
   anyway. Costs bandwidth and a cache; removes the client flow entirely.
2. Disclose it in the README beside the existing Docker and auth warnings, and
   leave the behaviour alone.
3. Make it a setting, defaulting to proxied.

Option 1 is the only one that would satisfy a privacy mandate, and option 2 is
the minimum honest thing. Recorded in QUEUE.md.

### What is required for the core loop

- **Jellyfin** — yes. Without it there is no library and no app.
- **MDBList** — no. Ratings are absent and the deck is unscored, but a night
  still runs. `MDBLIST_API_KEY` is optional and the code treats a miss as null
  rather than an error.
- **Jellyseerr** — only for Any Movie mode. Jellyfin Only never contacts it.
- **TMDB images** — cosmetic. A missing poster renders a titled placeholder.
- **YouTube** — never contacted unless a person presses the trailer button
  (R29, which exists because a dead grey rectangle on a LAN with no route out
  was worse than no trailer at all).

So the core loop needs exactly one service, and it is the one the user already
runs. That is the answer an upstream maintainer wants, and it is a good one.

## Guarding this

`server/__tests__/provenance.test.ts` pins the set of external hosts the source
may contact. A new third-party call fails it until somebody adds the host to the
list *and* to the table above — which is the point: the cost of adding a
destination should be writing down what it sees.
