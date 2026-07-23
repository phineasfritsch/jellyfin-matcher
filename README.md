# Jellyfin Matcher

A little self-hosted web app that ends the "I don't know, what do you want to watch?" spiral. Everyone opens it on their phone, you knock out genres until two survive, then you all swipe through the same deck of movies at the same time. The moment everybody likes the same film it locks in, confetti and all. If you get through the whole deck without agreeing, the points decide and you still get a winner. No stalemates, that's the whole point.

It talks to a Jellyfin server for your local library, Jellyseerr for the "any movie" mode (winners you don't own get requested automatically), and MDBList for ratings.

This project was a collaboration between me and Claude (Anthropic's coding agent). I steered, made the calls on how the app should behave, and tested it on real hardware; Claude wrote most of the code and did the API spelunking. Blame for weird decisions is shared.

## How a session works

1. **Lobby.** Someone creates a room and gets a 4 letter code (no confusing characters like O/0). Others join by typing the code or scanning the QR. You pick the scope here:
   - **Jellyfin Only** builds the deck from what's on the server right now, so the winner plays tonight.
   - **Any Movie** pulls from TMDb (via Jellyseerr's discover endpoint). If the winner isn't in your library there's a button to request it, which lands in Radarr.
   
   There's also a max runtime slider and a deck size setting. Everybody hits ready and it starts.

2. **Genre knockout.** Everyone checks off the genres they'd be okay with tonight. If exactly two genres overlap, done. More than two, you vote genres out one round at a time until two are left. Less than two, the picks get pooled and eliminated the same way. If people pick almost nothing it just makes you vote again.

3. **The deck.** Movies tagged with *both* surviving genres go first (these are usually the good picks), sorted by rating. Behind those, single genre movies alternate one from each side. Ratings come from MDBList, which conveniently pre-normalizes everything to 0-100. The composite score is:

   ```
   score = 0.35 * letterboxd + 0.35 * imdb + 0.30 * rotten_tomatoes
   ```

   If a source is missing the weights redistribute across the ones that exist, so an unrated-on-letterboxd movie doesn't get buried. The 35/35/30 split is not science, it just felt right. Argue with us about it in an issue.

4. **Swiping.** Left is no (-5 points), up is maybe (+1), right is like (+2), and there's a super like button (+3). Buttons exist for every action too, you don't have to use gestures. The instant *every* person in the room has swiped right or super liked the same movie, the room locks and you're done. A "maybe" never triggers a match, that felt wrong.

5. **Fallback.** Deck runs out with no unanimous like? Every card gets `composite score + sum of everyone's points` and the highest total wins. Ties go to the both-genres tier.

Rooms support more than two people. Match just requires everyone, and the fallback sums all votes.

## Running it

You need Node 22+ (or just Docker), a Jellyfin server, and API keys. Jellyseerr is optional if you only ever use Jellyfin Only mode, but the genre list for Any Movie mode comes from it.

Copy `.env.example` to `.env` and fill it in:

```
PORT=3000
JELLYFIN_URL=http://192.168.1.100:8096
JELLYFIN_API_KEY=...        # Jellyfin dashboard -> API keys
JELLYSEERR_URL=http://192.168.1.100:5055
JELLYSEERR_API_KEY=...      # Jellyseerr settings -> general
MDBLIST_API_KEY=...         # free at mdblist.com, the free tier is plenty
```

### Straight on the server (no Docker)

```bash
git clone <this repo> && cd jellyfin-matcher
npm install
npm run build
npm start
```

That's it, one Node process on port 3000 (set `PORT` in `.env` to change it). Production mode is the default so `npm start` just works. If you want it to survive reboots, a systemd unit like this does the job:

```ini
[Unit]
Description=Jellyfin Matcher
After=network.target

[Service]
WorkingDirectory=/opt/jellyfin-matcher
ExecStart=/usr/bin/npm start
Restart=on-failure
User=youruser

[Install]
WantedBy=multi-user.target
```

Ratings cache lands in `.cache/` next to the app and survives restarts on its own.

### Docker (if you prefer)

```bash
docker compose up -d --build
```

Same thing in a container. The compose file mounts `./cache` so the MDBList cache persists.

Either way, first deck build for a genre pair is a bit slow (the free tier only allows 10 titles per ratings request, so a big library means a bunch of round trips), after that it's cached for a week.

### Cloudflare Tunnel

Works out of the box, websockets included, no config beyond pointing the tunnel at the app. If you manage tunnels from the Cloudflare dashboard just add a public hostname with service `http://localhost:3000`. Config file style:

```yaml
ingress:
  - hostname: match.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

QR codes and room links use whatever hostname the page was opened on, so they'll point at your tunnel domain automatically. One warning: there's no auth built in, it's a party app. If the hostname is public, consider slapping a Cloudflare Access policy on it, or at least don't post the URL anywhere.

### Development

```bash
npm install
npm run dev        # everything on :3000, UI + websockets in one process
npm test           # unit tests (vitest)
npm run e2e        # scripted 2-user session against a running dev server
```

`scripts/e2e-partner.ts <ROOMCODE>` is handy on your own: it joins your room as a fake second phone that likes everything, so you can test matching solo.

## How it's put together

One container. An Express server hosts both the Next.js UI and a Socket.io server, all room state lives in memory. Rooms are throwaway by design (they expire after 2 hours idle), so losing them on restart is fine and there's no database.

```
phones (PWA) <-- websockets --> node server <--> Jellyfin / Jellyseerr / MDBList
```

The server broadcasts the full room state after every change and clients just render whatever state says. That made reconnects almost free: your identity is in localStorage, so a page refresh or a phone locking mid-game rejoins silently and lands on the right screen.

Layout:

```
server/         express + socket.io, room store, deck assembly
src/lib/        the actual logic: scoring, knockout engine, deck builder,
                match rules, API clients. all pure functions, all unit tested
src/ui/         react components, the useRoom hook, swipe cards
app/            next.js pages and PWA manifest
scripts/        e2e helpers
```

Main websocket events, roughly in the order they happen: `room:create`, `room:join`, `room:ready`, `knockout:submit_genres`, `knockout:eliminate`, `swipe:vote`, then the server pushes `room:state` constantly and `match:declared` once at the end. `winner:request` fires the Jellyseerr request.

### MDBList notes (took some figuring out)

Auth is `?apikey=` in the query string. `POST /tmdb/movie/` with `{"ids": [...]}` batch-resolves full movie objects including a `ratings` array where `score` is already 0-100 for every source, even Letterboxd's 5 star scale. Free tier caps batches at 10 ids. `GET /user` shows your remaining quota. The client retries 429s with backoff and caches to disk for 7 days.

## Testing

Sixty unit tests over the scoring math, knockout state machine, deck ordering, match rules, and the API clients (mocked fetch, injectable clocks). The realtime path got verified with an actual browser plus the scripted partner: full lobby to confetti flow against a real Jellyfin library.

## License

Do whatever you want with it. If you build something on top I'd genuinely like to hear about it.
