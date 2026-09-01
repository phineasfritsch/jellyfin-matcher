/**
 * R181: a real process, killed and started again, with real sockets attached.
 *
 * R180 found that the browser harness has no restart in it and cannot have one
 * — it attaches to a server somebody else started. So the claim PLAN-1.1 makes
 * for F1, that a room survives the server being replaced, had no end-to-end
 * evidence at all. `server/__tests__/restart.test.ts` drives the handlers
 * through a snapshot in one process, which is the logic and not the event.
 *
 * WHAT THIS ADDS OVER THAT UNIT TEST, said plainly:
 *
 *   - a real `node` process is killed, and a different one starts up,
 *   - the snapshot is a real file, written by the shutdown path and read by the
 *     boot path rather than handed between two stores in memory,
 *   - real socket.io clients reconnect on their own, which is the part nobody
 *     writes and everybody assumes,
 *   - the seat secret a phone kept is what gets it back in.
 *
 * WHAT IT STILL DOES NOT COVER, so nobody reads more into a green run: there is
 * no browser here. The React hook's recovery, the deck resuming at each phone's
 * own position, and the "hold on" banner clearing itself (R150) are asserted in
 * jsdom and by hand, not here. That harness still needs writing, and it needs a
 * live Jellyfin because it has to build a deck.
 *
 * WHY IT NEEDS NO JELLYFIN: everything up to the knockout is the room's own
 * state. A lobby-phase room never builds a deck, so the whole upstream
 * apparatus is irrelevant to whether the room comes back — and that keeps this
 * runnable in CI, which the browser harness will never be.
 *
 * Deliberately a script rather than a vitest case. It boots Next, which takes
 * tens of seconds, and G9 runs the suite once per mutation — seventy-odd times.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';

/** Not 3000. OPERATING.md forbids two harnesses sharing a port, and one of the
 *  others fires real Jellyseerr requests that land in somebody's Radarr. */
const PORT = Number(process.env.MATCHER_E2E_PORT ?? 3210);
const URL = `http://127.0.0.1:${PORT}`;

let step = 0;
function say(what: string) {
  step += 1;
  console.log(`\n${step}. ${what}`);
}

function fail(what: string): never {
  console.error(`\nFAILED: ${what}`);
  process.exit(1);
}

function check(ok: boolean, what: string) {
  if (!ok) fail(what);
  console.log(`   ok: ${what}`);
}

async function waitForHealth(ms = 90_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${URL}/healthz`);
      if (res.ok && (await res.json()).ok === true) return;
    } catch {
      // Not listening yet. Next takes a while on a cold start.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('the server never became healthy');
}

function boot(snapshotFile: string): ChildProcess {
  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MATCHER_SNAPSHOT_FILE: snapshotFile,
      // A room in the lobby needs no library, and asking for one would make
      // this harness need a Jellyfin it does not otherwise want.
      MATCHER_AUTH: 'off',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return child;
}

/** Wait for a process to actually be gone, not merely signalled. */
function ended(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
  });
}

function connect(): Socket {
  return io(URL, { transports: ['websocket'], reconnection: true });
}

function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} never answered`)), 15_000);
    socket.emit(event, payload, (res: { ok: boolean; error?: string } & T) => {
      clearTimeout(timer);
      if (!res?.ok) return reject(new Error(res?.error ?? `${event} refused`));
      resolve(res);
    });
  });
}

function reconnected(socket: Socket, ms = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    const timer = setTimeout(() => reject(new Error('socket never reconnected')), ms);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), 'matcher-restart-e2e-'));
  const snapshot = path.join(dir, 'rooms.json');
  let server: ChildProcess | undefined;
  let ada: Socket | undefined;
  let bex: Socket | undefined;

  try {
    say('start a server, with its snapshot somewhere that is not the real one');
    server = boot(snapshot);
    await waitForHealth();

    say('two phones make a room');
    ada = connect();
    bex = connect();
    const room = await emit<{ roomId: string; userId: string; secret: string }>(
      ada,
      'room:create',
      { name: 'Ada' },
    );
    const bexSeat = await emit<{ userId: string; secret: string }>(bex, 'room:join', {
      roomId: room.roomId,
      name: 'Bex',
    });
    check(Boolean(room.roomId), `room ${room.roomId} exists`);
    check(Boolean(bexSeat.secret), 'Bex holds a seat secret');

    say('Ada says she is ready, so the room has state worth losing');
    await emit(ada, 'room:ready', { ready: true });

    say('wait for the periodic snapshot, then kill the process outright');
    // SIGKILL rather than a polite shutdown: the case this is really for is the
    // process dying at 9pm, not a deploy. The 30s timer is what has to have
    // saved the room, not the shutdown handler.
    await new Promise((r) => setTimeout(r, 35_000));
    server.kill('SIGKILL');
    await ended(server);
    check(true, 'the server is gone');

    say('start a different process against the same snapshot');
    server = boot(snapshot);
    await waitForHealth();

    say('the phones reconnect on their own');
    await Promise.all([reconnected(ada), reconnected(bex)]);
    check(ada.connected && bex.connected, 'both sockets came back without being told to');

    say('and get their seats back with the secrets they kept');
    const back = await emit<{ roomId: string }>(ada, 'room:join', {
      roomId: room.roomId,
      userId: room.userId,
      secret: room.secret,
    });
    check(back.roomId === room.roomId, 'Ada is in the same room she left');

    await emit(bex, 'room:join', {
      roomId: room.roomId,
      userId: bexSeat.userId,
      secret: bexSeat.secret,
    });
    check(true, 'Bex is back in it too');

    say('a stranger with the room code and no secret is still refused');
    // R86: the restore must not become a way in. A four-character code is an
    // invitation, and a room that came back from disk has to check the secret
    // exactly as hard as one that never left.
    const stranger = connect();
    let refused = false;
    try {
      await emit(stranger, 'room:join', {
        roomId: room.roomId,
        userId: room.userId,
        secret: 'not-the-secret',
      });
    } catch {
      refused = true;
    }
    stranger.close();
    check(refused, 'the wrong secret was refused by the restored room');

    console.log('\nAll good. A room survived a real process being killed.\n');
  } finally {
    ada?.close();
    bex?.close();
    if (server && server.exitCode === null) {
      server.kill('SIGKILL');
      await ended(server);
    }
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
