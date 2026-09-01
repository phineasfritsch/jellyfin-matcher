import { createServer } from 'node:http';
import express from 'express';
import next from 'next';
import { Server, type Socket } from 'socket.io';
import { getGenres, playbackUrl, posterOrigin } from '../src/lib/jellyfin';
import { getMovieGenres as jellyseerrGenres, requestMovie } from '../src/lib/jellyseerr';
import { getLimits, lastRatingsCost } from '../src/lib/mdblist';
import { isValidVote, rankFallback } from '../src/lib/match';
import { authConfig, authenticateWithJellyfin, AuthStore } from './auth';
import { diagnoseDeckFailure, diagnoseThinDeck } from './diagnose';
import {
  JOIN_ATTEMPTS,
  JOIN_WINDOW_MS,
  LOGIN_ATTEMPTS,
  LOGIN_WINDOW_MS,
  MAX_ROOMS,
  RateLimiter,
  ROOMS_PER_SOCKET,
} from './limits';
import { viewFor } from './roomView';
import {
  asBoolean,
  asCardId,
  asGenre,
  asGenres,
  asName,
  asRoomId,
  asSettings,
  asSecret,
  asUserId,
} from './validate';
import { canSettle } from './settlement';
import {
  beginDeckBuild,
  deckBuilt,
  deckBuildFailed,
  declare,
  knockoutMemberLeft,
  recordElimination,
  recordGenres,
  recordVote,
  rejectWinner,
  startKnockout,
  undoVote,
} from './transitions';
import { buildDeckForRoom, genresForScope } from './deckService';
import { cacheWritable, historyHealth, recordWatched } from './history';
import { assertSafeForDeclaredExposure, describeExposure, exposureBanner } from './exposure';
import { loadSnapshot, saveSnapshot } from './persistence';
import { RoomStore, type Room, type RoomSettings } from './store';
import * as handlers from './handlers';
import type { Ctx } from './handlers';

const PORT = Number(process.env.PORT ?? 3000);

export const store = new RoomStore();
const auth = new AuthStore();

// Production is the default so `npm run build && npm start` just works on a
// bare server; `npm run dev` opts into the Next dev server explicitly.
const dev = process.env.NODE_ENV === 'development';
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();

const app = express();
app.use(express.json());
const STARTED_AT = Date.now();

/**
 * Last known answer from each upstream, refreshed in the background.
 * `null` means not configured, so "off" and "broken" stay distinguishable.
 */
type Reach = { ok: boolean | null; checkedAt: string | null; detail: string | null };
const reach: Record<'jellyfin' | 'jellyseerr' | 'mdblist', Reach> = {
  jellyfin: { ok: null, checkedAt: null, detail: null },
  jellyseerr: { ok: null, checkedAt: null, detail: null },
  mdblist: { ok: null, checkedAt: null, detail: null },
};

/**
 * MDBList's own view of the key's remaining quota (R68).
 *
 * `getLimits` existed in the repo and was called from nowhere, so the one
 * number that says whether tonight's deck will come back rated was never read.
 * It is somebody's personal key on a metered free tier and the failure mode is
 * silent: the deck still builds, every card is just unrated.
 */
let quota: { limit: number | null; remaining: number | null; checkedAt: string | null } = {
  limit: null,
  remaining: null,
  checkedAt: null,
};

function reachability() {
  return reach;
}

async function probe(name: 'jellyfin' | 'jellyseerr' | 'mdblist', run: () => Promise<unknown>) {
  const configured =
    name === 'jellyfin'
      ? Boolean(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY)
      : name === 'mdblist'
        ? Boolean(process.env.MDBLIST_API_KEY)
        : Boolean(process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY);
  if (!configured) {
    reach[name] = { ok: null, checkedAt: new Date().toISOString(), detail: 'not configured' };
    return;
  }
  try {
    await run();
    reach[name] = { ok: true, checkedAt: new Date().toISOString(), detail: null };
  } catch (err) {
    reach[name] = {
      ok: false,
      checkedAt: new Date().toISOString(),
      // Safe to show: the clients never put a key in a message.
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Cheapest call each service has that still proves the key works. */
async function probeAll(): Promise<void> {
  await Promise.all([
    probe('jellyfin', () => getGenres()),
    probe('jellyseerr', () => jellyseerrGenres()),
    probe('mdblist', async () => {
      const limits = await getLimits();
      quota = {
        limit: limits.rateLimit,
        remaining: limits.rateLimitRemaining,
        checkedAt: new Date().toISOString(),
      };
    }),
  ]);
}

/**
 * Read-only state report. `version` is the commit the running image was built
 * from, so parity between the repository and production is a fact you can
 * check rather than a hope (`npm run prod:read`). Reports whether each upstream
 * is configured, never what the credentials are.
 *
 * `configured` is two strings being non-empty. `reachable` is the service
 * actually answering, which is a different question and the only one worth
 * asking at 11pm: a wrong key, a sleeping NAS and a half-open tunnel all look
 * identically healthy to a config check (R67). Reachability is probed in the
 * background on an interval rather than per request, so the container's
 * HEALTHCHECK cannot itself hammer Jellyfin every thirty seconds.
 */
app.get('/healthz', async (_req, res) =>
  res.json({
    ok: true,
    version: process.env.MATCHER_VERSION ?? 'dev',
    startedAt: new Date(STARTED_AT).toISOString(),
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    rooms: store.roomCount(),
    /*
      R161: what autodeploy actually needs to know.

      `rooms` stays exactly as it was, and that is deliberate rather than
      tidy-mindedness. scripts/deploy/autodeploy.sh REFUSES to deploy when it
      cannot read a room count -- so renaming this field would make an old
      container unreadable to a new script, the script would refuse, and the
      container could never be replaced. The deploy that fixes it is the one
      the bug prevents. Adding a field is the only change that is safe in both
      directions.
    */
    activeRooms: store.activeRoomCount(),
    upstreams: {
      jellyfin: Boolean(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY),
      jellyseerr: Boolean(process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY),
      mdblist: Boolean(process.env.MDBLIST_API_KEY),
    },
    reachable: reachability(),
    // What the last deck build cost, and what the key has left. Both are the
    // host's problem and neither was visible from anywhere.
    ratings: { quota, lastBuild: lastRatingsCost() },
    // R106: whether the household is actually being remembered. A deployment
    // that does not mount .cache writes this into a container layer and loses
    // it on every replacement, which from the couch looks exactly like the
    // repeating deck this was built to fix.
    history: { ...(await historyHealth()), writable: await cacheWritable() },
    // The numbers on the things that used to have none.
    limits: {
      rooms: `${store.roomCount()}/${MAX_ROOMS}`,
      loginBlocked: loginLimiter.size(),
      corsOrigins: allowedOrigins.length > 0 ? allowedOrigins : 'same-origin only',
    },
    auth: authConfig(),
  }),
);

/**
 * Poster proxy.
 *
 * The browser asks Matcher for the image and Matcher fetches it from Jellyfin.
 * That keeps the media server's address off the client -- a guest who joined by
 * QR never learns it -- and it means posters load over whatever scheme the app
 * itself is served on. Without this, the tunnel setup the README recommends
 * renders the whole deck as blocked mixed content.
 *
 * Item ids only, cached hard: they are immutable, and a deck of fifty asks for
 * fifty of these at once.
 */
app.get('/api/poster/:itemId', async (req, res) => {
  const { itemId } = req.params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(itemId)) return res.status(400).end();
  try {
    const upstream = await fetch(posterOrigin(itemId), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status).end();
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch {
    // A missing poster is a blank card, never a broken room.
    res.status(502).end();
  }
});

// Tells the browser which actions need a Jellyfin login.
app.get('/api/auth-config', (_req, res) => res.json(authConfig()));

// Exchange Jellyfin credentials for a matcher session token. The server's
// admin API key never reaches the browser; only real server accounts pass.
/**
 * Failed logins per address (R77). This endpoint forwards credentials to
 * Jellyfin's own authenticate endpoint, so with nothing in front of it Matcher
 * is a rate-limit-free amplifier for guessing passwords against the media
 * server. Successful logins clear the counter: a fumbled password should not
 * cost anyone ten minutes.
 */
const loginLimiter = new RateLimiter(LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
setInterval(() => loginLimiter.sweep(), 5 * 60 * 1000).unref();

/** Seat-taking attempts per address (R86). See the room:join handler. */
const joinLimiter = new RateLimiter(JOIN_ATTEMPTS, JOIN_WINDOW_MS);
setInterval(() => joinLimiter.sweep(), 5 * 60 * 1000).unref();

app.post('/api/login', async (req, res) => {
  const who = req.ip ?? 'unknown';
  if (loginLimiter.isLimited(who)) {
    const wait = loginLimiter.retryAfterSec(who);
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({
      error: `Too many failed sign-ins. Try again in ${Math.ceil(wait / 60)} minute(s).`,
    });
  }

  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const user = await authenticateWithJellyfin(username, password);
    const token = auth.issue(user);
    loginLimiter.clear(who);
    res.json({ token, name: user.name });
  } catch (err) {
    loginLimiter.record(who);
    res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
});

app.use((req, res) => void nextHandler(req, res));

const httpServer = createServer(app);
/*
  Same-origin by default (R77). `cors: { origin: true }` reflects whatever
  Origin arrives, so any page on the internet could open a socket into a
  household's rooms. The UI is served by this same process, so it needs no
  cross-origin allowance at all; MATCHER_ALLOWED_ORIGINS exists for the person
  who really is serving the front end from somewhere else.
*/
const allowedOrigins = (process.env.MATCHER_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const io = new Server(
  httpServer,
  allowedOrigins.length > 0 ? { cors: { origin: allowedOrigins } } : {},
);

/*
  Anyone may connect; auth is enforced per action (create vs join) so that
  account-less guests can still join a room.

  R111: a token can also arrive on a live socket, and that is not a nicety.

  The token used to ride only in the handshake, so signing in mid-session meant
  tearing the socket down and reconnecting to carry it -- and the server sees
  that teardown as a member leaving. In the LOBBY a leaver is deleted outright,
  along with their seat secret, so a person who tapped "Any Movie" (which needs
  an account on the default auth mode) lost the room they had just read the code
  for. If they were alone, the room went with them.

  The handshake is still read, because a genuine reconnect must carry the token
  too. This map is only for the mid-session case, and it is keyed by socket id
  rather than kept in socket.data, which several handlers replace wholesale.
*/
const liveTokens = new Map<string, string>();

function authedName(socket: Socket): string | null {
  const token = liveTokens.get(socket.id) ?? (socket.handshake.auth as { token?: string })?.token;
  return auth.validate(token)?.name ?? null;
}

type Ack = (response: { ok: true; [k: string]: unknown } | { ok: false; error: string }) => void;

/**
 * Send every member their own view of the room.
 *
 * Not one payload to the whole channel: each socket gets a room with its own
 * votes, its own deck position and its own ballots, and counts in place of
 * everyone else's (R61). The screens already claimed this; only the rendering
 * enforced it, and a promise the client merely declines to draw is not one.
 */
function broadcast(room: Room): void {
  for (const [socketId, sock] of io.sockets.sockets) {
    const data = sock.data as { roomId?: string; userId?: string };
    if (data?.roomId !== room.roomId || !data.userId) continue;
    void socketId;
    sock.emit('room:state', viewFor(room, data.userId));
  }
}

function fail(ack: Ack | undefined, err: unknown): void {
  ack?.({ ok: false, error: err instanceof Error ? err.message : String(err) });
}

/**
 * Settle the room if it can be settled, and report whether it was.
 *
 * Every event that could end a room goes through here -- a vote, someone
 * leaving, a deck finishing its build. Settlement used to be checked only
 * inside `swipe:vote`, which meant the last person to act could be the one who
 * disconnected, and then nothing ever looked again.
 */
function settleIfPossible(room: Room, justVoted: string | null): boolean {
  const verdict = canSettle(room, justVoted);
  if (!verdict) return false;
  if (verdict.cardId === null) {
    // Nothing to win: an empty deck, or nobody voted for anything. Say so
    // rather than leaving the room on a spinner.
    declare(room, null, store, { viaFallback: true, ranking: null, playUrl: null });
    io.to(room.roomId).emit('match:declared', {
      winner: null,
      viaFallback: true,
      playUrl: null,
      ranking: null,
    });
    broadcast(room);
    return true;
  }
  declareWinner(room, verdict.cardId, verdict.viaFallback);
  return true;
}

function declareWinner(room: Room, cardId: string, viaFallback: boolean): void {
  const card = room.deck.find((c) => c.id === cardId) ?? null;
  const playUrl = card?.jellyfinItemId ? playbackUrl(card.jellyfinItemId) : null;
  const ranking = viaFallback ? rankFallback(room.deck, room.votes).slice(0, 3) : null;
  // Recorded on the room first, then announced. The event is how the room
  // hears about it now; the room is where it lives (R90).
  declare(room, cardId, store, { viaFallback, ranking, playUrl });
  /*
    R105: remember what the household landed on.

    Recorded here rather than on play, because this is the moment the fact
    exists and the only moment the server is certain of it -- nothing tells this
    app whether anybody pressed play, and a room that agreed on a film and then
    went to bed still does not want it dealt first again next Tuesday. Fire and
    forget: the write fails open, and the night is already over.
  */
  if (card) void recordWatched(card);
  io.to(room.roomId).emit('match:declared', { winner: card, viaFallback, playUrl, ranking });
  broadcast(room);
}

async function startSwiping(room: Room): Promise<void> {
  beginDeckBuild(room, store); // clients show skeletons until the deck lands
  broadcast(room);
  try {
    deckBuilt(room, await buildDeckForRoom(room), store);

    // Built, but thin. Nobody's key is wrong; it just looks that way from the
    // couch, so the room is told which it is (R54).
    const thin = diagnoseThinDeck(
      room.deck.length,
      room.settings.deckLimit,
      room.lockedGenres,
      room.settings.maxRuntime,
      room.settings.scope,
    );
    if (thin) io.to(room.roomId).emit('room:diagnosis', thin);
    // Zero cards is not a deck. Settle now rather than leaving five phones on
    // a skeleton that will never advance.
    if (room.deck.length === 0) {
      broadcast(room);
      settleIfPossible(room, null);
      return;
    }
  } catch (err) {
    console.error(`Deck build failed for ${room.roomId}:`, err);
    const diagnosis = diagnoseDeckFailure(err, room.deck.length);
    deckBuildFailed(room, store); // let the room retry rather than strand it
    io.to(room.roomId).emit('room:diagnosis', diagnosis);
    io.to(room.roomId).emit('room:error', { message: diagnosis.headline });
  }
  broadcast(room);
}

function socketRoom(socket: Socket): Room | undefined {
  const { roomId } = socket.data as { roomId?: string };
  return roomId ? store.getRoom(roomId) : undefined;
}

/**
 * Wiring only. Every decision below lives in server/handlers.ts, where a test
 * can call it without a socket (R93).
 */
io.on('connection', (socket) => {
  const ctx: Ctx = {
    store,
    session: {
      id: socket.id,
      get data() {
        return socket.data as { roomId?: string; userId?: string; made?: number };
      },
      set data(next) {
        socket.data = next;
      },
      authedName: () => authedName(socket),
      address: () => socket.handshake.address || 'unknown',
      joinChannel: (roomId) => void socket.join(roomId),
    },
    fx: {
      broadcast,
      toRoom: (roomId, event, payload) => io.to(roomId).emit(event, payload),
      settleIfPossible,
      startSwiping: (room) => void startSwiping(room),
    },
    authConfig,
    joinLimiter,
    requestMovie,
  };

  /**
   * One error path for every handler.
   *
   * Each of these used to carry its own try/catch calling fail(). Eleven copies
   * of one decision is eleven chances for the next handler to forget it, and a
   * refusal that never reaches the ack is a phone that hangs (R93).
   */
  async function wrapAsync(ack: Ack | undefined, run: () => Promise<Record<string, unknown> | void>) {
    try {
      ack?.({ ok: true, ...((await run()) ?? {}) });
    } catch (err) {
      fail(ack, err);
    }
  }

  function wrap(ack: Ack | undefined, run: () => Record<string, unknown> | void) {
    try {
      ack?.({ ok: true, ...(run() ?? {}) });
    } catch (err) {
      fail(ack, err);
    }
  }

  // Spelled out one per line rather than looped over a table: validate.test.ts
  // reads this file as text and asserts each event by name, and a contract you
  // cannot grep for is not much of a contract.
  socket.on('room:create', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.createRoom(ctx, payload)));
  socket.on('room:join', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.joinRoom(ctx, payload)));
  socket.on('room:ready', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.setReady(ctx, payload)));
  socket.on('room:settings', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.updateSettings(ctx, payload)));
  socket.on('knockout:submit_genres', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.submitGenres(ctx, payload)));
  socket.on('knockout:eliminate', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.eliminate(ctx, payload)));
  socket.on('swipe:vote', (payload: unknown, ack?: Ack) => wrap(ack, () => handlers.vote(ctx, payload)));
  socket.on('swipe:undo', (_payload: unknown, ack?: Ack) => wrap(ack, () => handlers.undo(ctx)));
  socket.on('winner:reject', (_payload: unknown, ack?: Ack) => wrap(ack, () => handlers.reject(ctx)));
  /*
    R111: adopt a token on the socket that is already here, rather than making
    the client reconnect to deliver it. Spelled out like the others because
    validate.test.ts reads this file as text.
  */
  socket.on('auth:token', (payload: unknown, ack?: Ack) =>
    wrap(ack, () => {
      const { token } = (payload ?? {}) as { token?: unknown };
      if (typeof token === 'string' && token.length > 0) liveTokens.set(socket.id, token);
      else liveTokens.delete(socket.id);
      return { name: authedName(socket) };
    }),
  );

  socket.on('disconnect', () => {
    liveTokens.delete(socket.id);
    handlers.disconnect(ctx);
  });

  socket.on('genres:list', async (_payload: unknown, ack?: Ack) => {
    try {
      const room = socketRoom(socket);
      const scope = room?.settings.scope ?? 'local';
      ack?.({ ok: true, genres: await genresForScope(scope) });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('winner:request', (_payload: unknown, ack?: Ack) =>
    wrapAsync(ack, () => handlers.requestWinner(ctx)),
  );

});

setInterval(() => {
  for (const id of store.cleanupStale()) {
    io.in(id).disconnectSockets();
  }
}, 10 * 60 * 1000).unref();

// Probe on boot and every two minutes. Background, so /healthz stays cheap
// enough for a container HEALTHCHECK to hit every thirty seconds without any
// of that traffic reaching Jellyfin.
void probeAll();
setInterval(() => void probeAll(), 2 * 60 * 1000).unref();

/*
  R131: say what this server exposes, before it starts serving.

  The README has warned since d44ea44 that a public hostname is not safe on the
  default auth mode. That warning is in a document; what gets deployed is a
  container, and whoever deployed it reads `docker logs`, not a README they
  skimmed a week ago.

  The refusal only fires when the operator has declared MATCHER_PUBLIC=1. With
  that declared, a mode that leaves the library readable by anyone with the URL
  is a misconfiguration rather than a choice, and serving anyway would be the
  app knowing better and saying nothing. Everyone who has not told us where they
  are gets the banner and no interference.

  This does NOT make the default safe (gate U4). A safe default costs the
  four-second guest join, which is a product decision and is queued, not taken.
*/
const exposure = describeExposure();
assertSafeForDeclaredExposure(exposure);

/*
  R149: put last night back before taking connections.

  Restoring after the listener is open would race a phone reconnecting into a
  room that does not exist yet -- it would be told the room is gone, which is
  the message this change exists to stop being true.
*/
async function restoreRooms(): Promise<void> {
  const snap = await loadSnapshot();
  if (!snap) return;
  const { restored, expired } = store.restore(snap);
  if (restored || expired) {
    console.log(`  restored ${restored} room(s); ${expired} had passed the idle TTL`);
  }
}

/*
  A crash does not send SIGTERM. Saving only on shutdown would cover the polite
  case -- a deploy -- and miss the one this is really for, which is the process
  dying at 9pm. Cheap: a room is small, and this writes only when one exists.
*/
const SNAPSHOT_INTERVAL_MS = 30_000;
setInterval(() => {
  if (store.roomCount() > 0) void saveSnapshot(store.snapshot());
}, SNAPSHOT_INTERVAL_MS).unref();

/*
  R160: the snapshot may never stop the server starting.

  restoreRooms reads a file. `store.restore` is defensive about its contents
  now, but the guarantee that matters is at this boundary: whatever goes wrong
  in there -- a shape nothing anticipated, a filesystem error mid-read -- the
  app still comes up, with no rooms rather than not at all. An unhandled
  rejection here exits the process, and a container that exits on boot reads the
  same file when it restarts. Losing the rooms costs one evening; a boot loop
  costs the app until somebody deletes a file by hand over a tunnel.
*/
void restoreRooms()
  .catch((err) => {
    console.warn('Could not restore rooms; starting with none.', err);
  })
  .then(() => nextApp.prepare())
  .then(() => {
  httpServer.listen(PORT, () => {
    console.log(`jellyfin-matcher server listening on :${PORT}`);
    for (const line of exposureBanner(exposure)) console.log(`  ${line}`);
  });
});

/**
 * Shut down on purpose (R76).
 *
 * Pushing main deploys, so a container gets SIGTERM in the middle of whatever
 * the house is doing. There was no `process.on` anywhere in this repository:
 * the process died on the spot, every socket dropped without a word, and Docker
 * waited out its ten second grace period before killing it anyway.
 *
 * Rooms live in memory and cannot survive the restart -- that is a real
 * limitation and it is written down in the README rather than hidden. What can
 * be fixed is the manner of it: tell every room what happened so the phones
 * show "the server restarted" instead of a deck that will never advance again,
 * then stop listening and exit rather than being killed.
 */
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  const rooms = store.roomCount();
  console.log(`${signal} received, saving ${rooms} room(s)`);

  /*
    R149: tell the phones what is actually true.

    This used to say "This room is gone — start a new one", which was correct
    when a restart destroyed everything. Now it depends on whether the snapshot
    was written, so the app never promises a recovery it has not got. If the
    save fails the old sentence is still the honest one.
  */
  void saveSnapshot(store.snapshot()).then((saved) => {
    io.emit('room:error', {
      message: saved
        ? 'The server is restarting. Hold on — your room will come back in a moment.'
        : 'The server is restarting. This room is gone — start a new one.',
    });
  });

  // Give the message a moment to reach the phones, then stop accepting work.
  setTimeout(() => {
    io.close();
    httpServer.close(() => process.exit(0));
    // Never hang the container waiting on a socket that will not close.
    setTimeout(() => process.exit(0), 3_000).unref();
  }, 250);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => shutdown(signal));
}
