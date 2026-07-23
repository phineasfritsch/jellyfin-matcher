import { createServer } from 'node:http';
import express from 'express';
import next from 'next';
import { Server, type Socket } from 'socket.io';
import { playbackUrl } from '../src/lib/jellyfin';
import { requestMovie } from '../src/lib/jellyseerr';
import { submitElimination, submitGenres, createKnockout } from '../src/lib/knockout';
import { fallbackWinner, isInstantMatch, isValidVote, rankFallback } from '../src/lib/match';
import { buildDeckForRoom, genresForScope } from './deckService';
import { RoomStore, type Room, type RoomSettings } from './store';

const PORT = Number(process.env.PORT ?? 3000);

export const store = new RoomStore();

// Production is the default so `npm run build && npm start` just works on a
// bare server; `npm run dev` opts into the Next dev server explicitly.
const dev = process.env.NODE_ENV === 'development';
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();

const app = express();
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use((req, res) => void nextHandler(req, res));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

type Ack = (response: { ok: true; [k: string]: unknown } | { ok: false; error: string }) => void;

function broadcast(room: Room): void {
  io.to(room.roomId).emit('room:state', room);
}

function fail(ack: Ack | undefined, err: unknown): void {
  ack?.({ ok: false, error: err instanceof Error ? err.message : String(err) });
}

/** All members finished the deck with no instant match → fallback settlement. */
function deckExhausted(room: Room): boolean {
  const userIds = Object.keys(room.users);
  return room.deck.length > 0 && userIds.every((id) => (room.progress[id] ?? 0) >= room.deck.length);
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
  } catch (err) {
    console.error(`Deck build failed for ${room.roomId}:`, err);
    room.status = 'KNOCKOUT'; // let the room retry rather than strand it
    room.knockout = createKnockout();
    io.to(room.roomId).emit('room:error', {
      message: 'Deck build failed — pick genres again.',
    });
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
      const { room, userId } = store.createRoom(String(name || 'Host').slice(0, 30));
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
        const result = userId
          ? { room: store.reconnect(roomId, userId), userId } // returning member
          : store.joinRoom(roomId, String(name || 'Guest').slice(0, 30));
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

      if (isInstantMatch(room.votes, cardId, Object.keys(room.users))) {
        declareWinner(room, cardId, false);
        return;
      }
      if (deckExhausted(room)) {
        const winner = fallbackWinner(room.deck, room.votes);
        if (winner) declareWinner(room, winner, true);
        return;
      }
      broadcast(room);
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('winner:request', async (_payload: unknown, ack?: Ack) => {
    try {
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
    if (room) broadcast(room);
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
