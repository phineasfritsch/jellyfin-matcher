/** Simulates a full 2-user session against the running matcher server. */
import { io, type Socket } from 'socket.io-client';

const URL = 'http://localhost:3000';
const deadline = setTimeout(() => {
  console.error('E2E TIMEOUT after 90s');
  process.exit(1);
}, 90_000);

function emit<T = Record<string, unknown>>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: { ok: boolean; error?: string } & T) => {
      if (res.ok) resolve(res);
      else reject(new Error(`${event}: ${res.error}`));
    });
  });
}

function waitFor<T>(socket: Socket, event: string, pred: (data: T) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const handler = (data: T) => {
      if (pred(data)) {
        socket.off(event, handler);
        resolve(data);
      }
    };
    socket.on(event, handler);
  });
}

interface RoomState {
  status: string;
  deck: Array<{ id: string; title: string; year: number; isHybrid: boolean; scores: { composite: number | null } }>;
  lockedGenres: string[];
}

const alice = io(URL);
const bob = io(URL);

const { roomId } = await emit<{ roomId: string }>(alice, 'room:create', { name: 'Alice' });
console.log('room created:', roomId);

await emit(bob, 'room:join', { roomId, name: 'Bob' });
console.log('bob joined');

await emit(alice, 'room:settings', { scope: 'local', deckLimit: 15 });

const knockout = waitFor<RoomState>(alice, 'room:state', (s) => s.status === 'KNOCKOUT');
await emit(alice, 'room:ready', { ready: true });
await emit(bob, 'room:ready', { ready: true });
await knockout;
console.log('knockout started');

const swiping = waitFor<RoomState>(
  alice,
  'room:state',
  (s) => s.status === 'SWIPING' && s.deck.length > 0,
);
await emit(alice, 'knockout:submit_genres', { genres: ['Horror', 'Science Fiction'] });
await emit(bob, 'knockout:submit_genres', { genres: ['Horror', 'Science Fiction'] });
console.log('genres submitted (exact overlap of 2)');

const state = await swiping;
console.log('locked genres:', state.lockedGenres);
console.log(`deck built: ${state.deck.length} cards`);
for (const c of state.deck.slice(0, 5)) {
  console.log(
    `  ${c.isHybrid ? '[HYBRID]' : '        '} ${c.title} (${c.year}) composite=${c.scores.composite}`,
  );
}

const declared = waitFor<{ winner: { title: string } | null; viaFallback: boolean }>(
  bob,
  'match:declared',
  () => true,
);
const first = state.deck[0]!;
await emit(alice, 'swipe:vote', { cardId: first.id, points: 2 });
await emit(bob, 'swipe:vote', { cardId: first.id, points: 3 });

const result = await declared;
console.log(
  `MATCH: ${result.winner?.title} (viaFallback=${result.viaFallback}) — instant match works`,
);

clearTimeout(deadline);
alice.close();
bob.close();
process.exit(0);
