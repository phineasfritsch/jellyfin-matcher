/**
 * Simulated second phone: joins a room, readies up, mirrors genre picks,
 * likes every card. Usage: npx tsx scripts/e2e-partner.ts <ROOM_CODE> [name]
 */
import { io, type Socket } from 'socket.io-client';

const roomId = (process.argv[2] ?? '').toUpperCase();
const name = process.argv[3] ?? 'Bob';
if (!roomId) {
  console.error('Usage: npx tsx scripts/e2e-partner.ts <ROOM_CODE> [name]');
  process.exit(1);
}

const socket: Socket = io('http://localhost:3000');
let userId = '';
let submittedGenres = false;
const voted = new Set<string>();

function emit<T = Record<string, unknown>>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: { ok: boolean; error?: string } & T) => {
      if (res.ok) resolve(res);
      else reject(new Error(`${event}: ${res.error}`));
    });
  });
}

interface RoomState {
  status: string;
  users: Record<string, { name: string }>;
  knockout: { phase: string; submissions: Record<string, unknown>; pool: string[]; elimVotes: Record<string, string> };
  deck: Array<{ id: string; title: string }>;
  progress: Record<string, number>;
}

socket.on('room:state', (state: RoomState) => {
  void (async () => {
    try {
      if (state.status === 'KNOCKOUT' && state.knockout.phase === 'CHECKBOX' && !submittedGenres) {
        submittedGenres = true;
        await emit('knockout:submit_genres', { genres: ['Horror', 'Science Fiction'] });
        console.log(`[${name}] genres submitted`);
      }
      if (state.status === 'KNOCKOUT' && state.knockout.phase === 'ELIMINATION' && state.knockout.elimVotes[userId] === undefined) {
        const target = state.knockout.pool.find((g) => g !== 'Horror' && g !== 'Science Fiction') ?? state.knockout.pool[0]!;
        await emit('knockout:eliminate', { genre: target });
        console.log(`[${name}] voted out ${target}`);
      }
      if (state.status === 'SWIPING' && state.deck.length > 0) {
        const idx = state.progress[userId] ?? 0;
        const card = state.deck[idx];
        if (card && !voted.has(card.id)) {
          voted.add(card.id);
          await new Promise((r) => setTimeout(r, 400)); // human-ish pacing
          await emit('swipe:vote', { cardId: card.id, points: 2 });
          console.log(`[${name}] liked ${card.title} (${idx + 1}/${state.deck.length})`);
        }
      }
    } catch (err) {
      console.error(`[${name}]`, err instanceof Error ? err.message : err);
    }
  })();
});

socket.on('match:declared', (payload: { winner: { title: string } | null; viaFallback: boolean }) => {
  console.log(`[${name}] MATCH DECLARED: ${payload.winner?.title} (fallback=${payload.viaFallback})`);
  setTimeout(() => process.exit(0), 500);
});

const res = await emit<{ userId: string }>('room:join', { roomId, name });
userId = res.userId;
console.log(`[${name}] joined ${roomId} as ${userId}`);
await emit('room:ready', { ready: true });
console.log(`[${name}] ready`);

setTimeout(() => {
  console.error(`[${name}] timeout after 5 min`);
  process.exit(1);
}, 300_000);
