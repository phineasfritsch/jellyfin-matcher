import { createServer } from 'node:http';
import express from 'express';
import next from 'next';
import { Server, type Socket } from 'socket.io';
import { playbackUrl, posterOrigin } from '../src/lib/jellyfin';
import { requestMovie } from '../src/lib/jellyseerr';
import { submitElimination, submitGenres, createKnockout } from '../src/lib/knockout';
import { isValidVote, rankFallback } from '../src/lib/match';
import { authConfig, authenticateWithJellyfin, AuthStore } from './auth';
import { diagnoseDeckFailure, diagnoseThinDeck } from './diagnose';
import { viewFor } from './roomView';
import { canSettle } from './settlement';
import { buildDeckForRoom, genresForScope } from './deckService';
import { RoomStore, type Room, type RoomSettings } from './store';

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
 * Read-only state report. `version` is the commit the running image was built
 * from, so parity between the repository and production is a fact you can
 * check rather than a hope (`npm run prod:read`). Reports whether each upstream
 * is configured, never what the credentials are.
 */
app.get('/healthz', (_req, res) =>
  res.json({
    ok: true,
    version: process.env.MATCHER_VERSION ?? 'dev',
    startedAt: new Date(STARTED_AT).toISOString(),
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    rooms: store.roomCount(),
    upstreams: {
      jellyfin: Boolean(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY),
      jellyseerr: Boolean(process.env.JELLYSEERR_URL && process.env.JELLYSEERR_API_KEY),
      mdblist: Boolean(process.env.MDBLIST_API_KEY),
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
app.post('/api/login', async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const user = await authenticateWithJellyfin(username, password);
    const token = auth.issue(user);
    res.json({ token, name: user.name });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
});

app.use((req, res) => void nextHandler(req, res));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

// Anyone may connect; auth is enforced per action (create vs join) so that
// account-less guests can still join a room. The token rides in the handshake
// and is re-sent on reconnect, so it stays current after a mid-session login.
function authedName(socket: Socket): string | null {
  const token = (socket.handshake.auth as { token?: string })?.token;
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
    room.status = 'FINISHED';
    room.winner = null;
    store.touch(room);
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
  room.status = 'FINISHED';
  room.winner = cardId;
  store.touch(room);
  const card = room.deck.find((c) => c.id === cardId) ?? null;
  io.to(room.roomId).emit('match:declared', {
    winner: card,
    viaFallback,
    playUrl: card?.jellyfinItemId ? playbackUrl(card.jellyfinItemId) : null,
    ranking: viaFallback ? rankFallback(room.deck, room.votes).slice(0, 3) : null,
  });
  broadcast(room);
}

async function startSwiping(room: Room): Promise<void> {
  room.status = 'SWIPING'; // deck empty until build completes — clients show skeletons
  broadcast(room);
  try {
    room.deck = await buildDeckForRoom(room);
    room.progress = Object.fromEntries(Object.keys(room.users).map((id) => [id, 0]));
    store.touch(room);

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
    room.status = 'KNOCKOUT'; // let the room retry rather than strand it
    room.knockout = createKnockout();
    io.to(room.roomId).emit('room:diagnosis', diagnosis);
    io.to(room.roomId).emit('room:error', { message: diagnosis.headline });
  }
  broadcast(room);
}

function socketRoom(socket: Socket): Room | undefined {
  const { roomId } = socket.data as { roomId?: string };
  return roomId ? store.getRoom(roomId) : undefined;
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }: { name: string }, ack?: Ack) => {
    try {
      if (authConfig().createRequires && !authedName(socket)) {
        throw new Error('Sign in with your Jellyfin account to create a room');
      }
      const { room, userId } = store.createRoom(
        String(name || 'Host').slice(0, 30),
        Boolean(authedName(socket)),
      );
      socket.data = { roomId: room.roomId, userId };
      void socket.join(room.roomId);
      ack?.({ ok: true, roomId: room.roomId, userId });
      broadcast(room);
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on(
    'room:join',
    ({ roomId, name, userId }: { roomId: string; name?: string; userId?: string }, ack?: Ack) => {
      try {
        // Only a fresh join is gated; reconnecting an existing member is not,
        // so a guest who already joined keeps their seat.
        if (!userId && authConfig().joinRequires && !authedName(socket)) {
          throw new Error('Sign in with your Jellyfin account to join this room');
        }
        const result = userId
          ? { room: store.reconnect(roomId, userId), userId } // returning member
          : store.joinRoom(roomId, String(name || 'Guest').slice(0, 30), Boolean(authedName(socket)));
        socket.data = { roomId: result.room.roomId, userId: result.userId };
        void socket.join(result.room.roomId);
        ack?.({ ok: true, roomId: result.room.roomId, userId: result.userId });
        broadcast(result.room);
      } catch (err) {
        fail(ack, err);
      }
    },
  );

  socket.on('room:ready', ({ ready }: { ready: boolean }, ack?: Ack) => {
    try {
      const { roomId, userId } = socket.data as { roomId: string; userId: string };
      const room = store.setReady(roomId, userId, Boolean(ready));
      if (room.status === 'LOBBY' && store.allReady(room)) {
        room.status = 'KNOCKOUT';
        room.knockout = createKnockout();
      }
      ack?.({ ok: true });
      broadcast(room);
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('room:settings', (settings: Partial<RoomSettings>, ack?: Ack) => {
    try {
      // "Any Movie" scope unlocks Jellyseerr requests, so switching to it needs
      // an account even when creating and joining did not.
      if (settings.scope === 'wide' && authConfig().wideRequires && !authedName(socket)) {
        throw new Error('Sign in with your Jellyfin account to search any movie');
      }
      const { roomId } = socket.data as { roomId: string };
      const room = store.updateSettings(roomId, settings);
      ack?.({ ok: true });
      broadcast(room);
    } catch (err) {
      fail(ack, err);
    }
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

  socket.on('knockout:submit_genres', ({ genres }: { genres: string[] }, ack?: Ack) => {
    try {
      const room = socketRoom(socket);
      const { userId } = socket.data as { userId: string };
      if (!room || room.status !== 'KNOCKOUT') throw new Error('Not in knockout');
      room.knockout = submitGenres(room.knockout, userId, genres, Object.keys(room.users));
      store.touch(room);
      ack?.({ ok: true });
      if (room.knockout.phase === 'DONE') {
        room.lockedGenres = room.knockout.locked;
        void startSwiping(room);
      } else {
        broadcast(room);
      }
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('knockout:eliminate', ({ genre }: { genre: string }, ack?: Ack) => {
    try {
      const room = socketRoom(socket);
      const { userId } = socket.data as { userId: string };
      if (!room || room.status !== 'KNOCKOUT') throw new Error('Not in knockout');
      room.knockout = submitElimination(room.knockout, userId, genre, Object.keys(room.users));
      store.touch(room);
      ack?.({ ok: true });
      if (room.knockout.phase === 'DONE') {
        room.lockedGenres = room.knockout.locked;
        void startSwiping(room);
      } else {
        broadcast(room);
      }
    } catch (err) {
      fail(ack, err);
    }
  });

  /**
   * Take back the last card you voted on (R48).
   *
   * The deck is the one place in the app where a slip costs something you
   * cannot get back: a tremor, a neighbour knocking the phone, a thumb put
   * down to steady it. Only your own last vote, only while the room is still
   * swiping, and never once a winner has been declared -- undoing a vote that
   * already locked a match would unlock a room that has moved on.
   */
  socket.on('swipe:undo', (_payload: unknown, ack?: Ack) => {
    try {
      const room = socketRoom(socket);
      const { userId } = socket.data as { userId: string };
      if (!room || room.status !== 'SWIPING') throw new Error('Not swiping');
      const index = (room.progress[userId] ?? 0) - 1;
      if (index < 0) throw new Error('Nothing to undo');
      const card = room.deck[index];
      if (!card) throw new Error('Nothing to undo');

      const cardVotes = { ...room.votes[card.id] };
      delete cardVotes[userId];
      if (Object.keys(cardVotes).length === 0) delete room.votes[card.id];
      else room.votes[card.id] = cardVotes;
      room.progress[userId] = index;
      store.touch(room);

      ack?.({ ok: true, cardId: card.id });
      broadcast(room);
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('swipe:vote', ({ cardId, points }: { cardId: string; points: number }, ack?: Ack) => {
    try {
      const room = socketRoom(socket);
      const { userId } = socket.data as { userId: string };
      if (!room || room.status !== 'SWIPING') throw new Error('Not swiping');
      if (!isValidVote(points)) throw new Error(`Invalid vote value: ${points}`);
      if (!room.deck.some((c) => c.id === cardId)) throw new Error(`Unknown card: ${cardId}`);

      room.votes[cardId] = { ...room.votes[cardId], [userId]: points };
      room.progress[userId] = (room.progress[userId] ?? 0) + 1;
      store.touch(room);
      ack?.({ ok: true });

      if (settleIfPossible(room, cardId)) return;
      broadcast(room);
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('winner:request', async (_payload: unknown, ack?: Ack) => {
    try {
      // Firing a real download always needs an account, even if joining didn't.
      if (authConfig().requestRequires && !authedName(socket)) {
        throw new Error('Sign in with your Jellyfin account to request a download');
      }
      const room = socketRoom(socket);
      if (!room || room.status !== 'FINISHED' || !room.winner) {
        throw new Error('No winner to request yet');
      }
      const card = room.deck.find((c) => c.id === room.winner);
      if (!card) throw new Error('Winner card missing from deck');
      if (card.jellyfinItemId) throw new Error('Already in the library');
      if (card.tmdbId == null) throw new Error('No TMDb id on winner');
      const result = await requestMovie(card.tmdbId);
      store.touch(room);
      ack?.({ ok: true, requestId: result.id, status: result.status });
      io.to(room.roomId).emit('winner:requested', { title: card.title });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('disconnect', () => {
    const { roomId, userId } = socket.data as { roomId?: string; userId?: string };
    if (!roomId || !userId) return;
    const room = store.leaveRoom(roomId, userId);
    if (!room) return;
    // The person who just left may have been the only one the room was waiting
    // on. Without this the room waits for them forever, which is the stalemate
    // this whole app exists to prevent.
    if (room.status === 'SWIPING' && settleIfPossible(room, null)) return;
    broadcast(room);
  });
});

setInterval(() => {
  for (const id of store.cleanupStale()) {
    io.in(id).disconnectSockets();
  }
}, 10 * 60 * 1000).unref();

void nextApp.prepare().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`jellyfin-matcher server listening on :${PORT}`);
  });
});
