# Every command, and what it costs to run

Twenty-three npm scripts and no index, which is fine while one person holds all
of it in their head and is exactly the thing U11 is about. This is the index.

The column that matters is the last one. Several of these are safe to run
without thinking; a few bind a port, rewrite real source files, or send a real
request to somebody's real server. That distinction lived in prose in
[OPERATING.md](../OPERATING.md) and nowhere you would look before typing.

## Safe to run any time

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit`. Nothing else. |
| `npm test` | The suite, once. |
| `npm run test:watch` | The suite, watching. |
| `npm run gate -- --fast` | Types, suite, pins, counts, rulings. **The one a worker runs on their own work.** Skips the build and the mutation audit. |
| `npm run inventory` | Finds pin candidates mechanically. Reads only. |
| `npm run counts` | Rewrites the counts stated in prose to match `gates.json`. |
| `npm run rulings` | Regenerates `docs/RULINGS.md`. Never edit that file by hand. |
| `npm run contrast:tokens` | Contrast of the declared palette. Arithmetic on `globals.css`, no browser. |

## Safe, but slow or needing a browser

| Command | What it does |
| --- | --- |
| `npm run build` | Next production build. |
| `npm run gate` | All nine checks including the build **and the mutation audit**. Tens of minutes. See below before running it beside anything else. |
| `npm run contrast` | Reads ink and paper out of a committed PNG (R89, R95). |
| `npm run measure:rows` | Row heights at 100% and 200% text, in real Chrome. |
| `npm run measure:reflow` | Reflow and focus-obscured at three viewports, in real Chrome. |
| `npm run measure:spacing` | WCAG 1.4.12 with the four spacing values forced, in real Chrome. |
| `npm run shots` | Regenerates `docs/screenshots/`. Needs a running app. |

**These need Chrome and there is not necessarily one installed.** They look for
it in the usual places and otherwise want `CHROME_PATH`. Edge works:
`CHROME_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"`.

## Run one at a time, and read this first

| Command | Why it is not casual |
| --- | --- |
| `npm run gate` (full) | Its ninth check **writes deliberately broken code into real source files**, one at a time, running the suite against each. Anything else reading the tree while it runs sees a mutated file. Never run two, and never edit during one. |
| `npm run mutate` | The same audit on its own. Same rule. |
| `npm run dev` / `npm start` | Binds **port 3000**. |
| `npm run e2e` | Binds port 3000 **and can fire real Jellyseerr requests that land in a real Radarr**. Never run two at once. |
| `npm run e2e:two` | Two browser contexts against a running server. Needs a live Jellyfin. |
| `npm run e2e:walkout` | Same shape, one member leaving. |
| `npm run e2e:restart` | Starts its own server on **3210**, SIGKILLs it, starts another. Writes its snapshot to a temp file, not yours. Needs no Jellyfin. |

## Ask for something outside this machine

| Command | What it touches |
| --- | --- |
| `npm run prod:read` | GETs `/healthz` on **your deployment** and compares the version to this checkout. Needs `MATCHER_URL`. Read-only, and the thing U5 has always wanted. |
| `npm run probe:userscope` | Authenticates to **a real Jellyfin with real credentials** and counts movies twice. Read-only: it creates nothing and changes no setting. Needs `JELLYFIN_URL`, `JELLYFIN_API_KEY`, `PROBE_USER`, `PROBE_PASS`. |

## The two rules worth repeating

**The gate is read by exit code**, never by looking at the last lines of its
output. A failure can scroll past, and has.

**A worker does not run the full gate on their own work.** A verifier runs it
afterwards, serially, on a quiet tree.
