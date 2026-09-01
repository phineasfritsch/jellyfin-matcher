import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as handlers from '../handlers';
import type { Ctx, Effects, Session } from '../handlers';
import { defaultPersistenceConfig, loadSnapshot, saveSnapshot } from '../persistence';
import { RateLimiter } from '../limits';
import { RoomStore } from '../store';

/**
 * R149, at the level the claim is actually made: the night carries on.
 *
 * The unit tests prove the snapshot round-trips — rooms, secrets, TTL, modes.
 * None of them proves the thing the plan promises, which is that two phones
 * mid-deck are still in the same room afterwards and can still vote. That is a
 * different claim and it is the one a household would notice.
 *
 * This drives the real handlers through a real restart: join, snapshot, throw
 * the store away, restore into a new one, and rejoin with nothing but what the
 * phone kept in its own storage. It is not the browser harness — no sockets, no
 * network — but it is the whole server-side path, and unlike `npm run e2e` it
 * can run in the gate.
 */

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'matcher-restart-'));
  file = path.join(dir, '.cache', 'rooms.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cfg = () => defaultPersistenceConfig({ file, now: () => Date.now() });

/** One phone: a session id, and the handlers it drives. */
function phone(store: RoomStore, socketId: string) {
  const broadcasts: unknown[] = [];
  const session: Session = {
    id: socketId,
    data: {},
    authedName: () => null,
    address: () => '10.0.0.1',
    joinChannel: () => {},
  };
  const fx: Effects = {
    broadcast: (room) => void broadcasts.push(room),
    toRoom: () => {},
    settleIfPossible: () => false,
    startSwiping: () => {},
  };
  const ctx: Ctx = {
    store,
    session,
    fx,
    authConfig: () => ({
      createRequires: false,
      joinRequires: false,
      wideRequires: true,
      requestRequires: true,
    }),
    joinLimiter: new RateLimiter(30, 60_000),
    requestMovie: async () => {
      throw new Error('a restart test must never reach Jellyseerr');
    },
  };
  return { ctx, session, broadcasts };
}

describe('a restart mid-night', () => {
  it('leaves both phones in the same room, still able to act', async () => {
    // --- before ---------------------------------------------------------
    const before = new RoomStore();
    const ravi = phone(before, 'socket-ravi');
    const dee = phone(before, 'socket-dee');

    const created = handlers.createRoom(ravi.ctx, { name: 'Ravi' }) as {
      roomId: string;
      userId: string;
      secret: string;
    };
    const joined = handlers.joinRoom(dee.ctx, { roomId: created.roomId, name: 'Dee' }) as {
      userId: string;
      secret: string;
    };
    handlers.setReady(ravi.ctx, { ready: true });

    expect(Object.keys(before.getRoom(created.roomId)!.users)).toHaveLength(2);

    // --- the restart ----------------------------------------------------
    expect(await saveSnapshot(before.snapshot(), cfg())).toBe(true);

    const after = new RoomStore();
    const snap = await loadSnapshot(cfg());
    expect(snap, 'nothing was saved to come back from').not.toBeNull();
    const { restored } = after.restore(snap!);
    expect(restored).toBe(1);

    // --- after ----------------------------------------------------------
    // New sockets, because the old ones died with the process. The phones know
    // only what they kept: the room code, their id, and their seat secret.
    const raviBack = phone(after, 'socket-ravi-2');
    const deeBack = phone(after, 'socket-dee-2');

    expect(() =>
      handlers.joinRoom(raviBack.ctx, {
        roomId: created.roomId,
        userId: created.userId,
        secret: created.secret,
      }),
    ).not.toThrow();

    expect(() =>
      handlers.joinRoom(deeBack.ctx, {
        roomId: created.roomId,
        userId: joined.userId,
        secret: joined.secret,
      }),
    ).not.toThrow();

    const room = after.getRoom(created.roomId)!;
    expect(Object.keys(room.users), 'somebody lost their seat').toHaveLength(2);
    expect(room.users[created.userId]!.connected, 'Ravi came back disconnected').toBe(true);
    expect(room.users[joined.userId]!.connected, 'Dee came back disconnected').toBe(true);

    // And the room still takes instructions, which is the actual claim.
    expect(() => handlers.setReady(deeBack.ctx, { ready: true })).not.toThrow();
    expect(after.getRoom(created.roomId)!.users[joined.userId]!.ready).toBe(true);
  });

  it('does not hold the room open for somebody who never came back', async () => {
    /*
      The ghost case, at the level it bites. The persistence unit test asserts
      that restore clears `connected`; this asserts why that matters.

      Connectedness is the sole test of who can stall a room. If a restore
      brought everyone back marked connected, a phone that was closed before the
      restart -- somebody who went to bed -- would hold the night open for the
      people still sitting there, and no one could see why.

      Written after mutation-testing showed the case above could NOT catch this:
      once both phones rejoin, `connected` is true either way. Only the member
      who stays away can tell the difference.
    */
    const before = new RoomStore();
    const ravi = phone(before, 'socket-ravi');
    const dee = phone(before, 'socket-dee');
    const created = handlers.createRoom(ravi.ctx, { name: 'Ravi' }) as {
      roomId: string;
      userId: string;
      secret: string;
    };
    const joined = handlers.joinRoom(dee.ctx, { roomId: created.roomId, name: 'Dee' }) as {
      userId: string;
    };

    await saveSnapshot(before.snapshot(), cfg());
    const after = new RoomStore();
    after.restore((await loadSnapshot(cfg()))!);

    // Only Ravi comes back. Dee's phone is shut.
    handlers.joinRoom(phone(after, 'socket-ravi-2').ctx, {
      roomId: created.roomId,
      userId: created.userId,
      secret: created.secret,
    });

    const room = after.getRoom(created.roomId)!;
    expect(room.users[created.userId]!.connected).toBe(true);
    expect(
      room.users[joined.userId]!.connected,
      'a phone that never returned is still counted as present, so the room waits for it',
    ).toBe(false);
  });

  it('keeps what the room had already decided', async () => {
    // A restart that returns an empty room is not a recovery. The settings the
    // room chose are the part somebody would have to redo by hand.
    const before = new RoomStore();
    const ravi = phone(before, 'socket-ravi');
    const created = handlers.createRoom(ravi.ctx, { name: 'Ravi' }) as { roomId: string };
    handlers.updateSettings(ravi.ctx, { maxRuntime: 120, deckLimit: 25 });

    await saveSnapshot(before.snapshot(), cfg());
    const after = new RoomStore();
    after.restore((await loadSnapshot(cfg()))!);

    const room = after.getRoom(created.roomId)!;
    expect(room.settings.maxRuntime).toBe(120);
    expect(room.settings.deckLimit).toBe(25);
  });

  it('refuses a stranger holding the right room code and the wrong secret', async () => {
    /*
      The restore must not become a way in. A four-character code is an
      invitation, not a credential (R86) — and a room that came back from disk
      has to check the secret exactly as hard as one that never left.
    */
    const before = new RoomStore();
    const ravi = phone(before, 'socket-ravi');
    const created = handlers.createRoom(ravi.ctx, { name: 'Ravi' }) as {
      roomId: string;
      userId: string;
    };

    await saveSnapshot(before.snapshot(), cfg());
    const after = new RoomStore();
    after.restore((await loadSnapshot(cfg()))!);

    const attacker = phone(after, 'socket-attacker');
    expect(() =>
      handlers.joinRoom(attacker.ctx, {
        roomId: created.roomId,
        userId: created.userId,
        secret: 'not-the-secret',
      }),
    ).toThrow();
  });
});

describe('seat ownership after a restore', () => {
  it('still refuses a stale socket the seat it no longer holds', async () => {
    /*
      R112 across a restart, which is not obviously safe and turned out to be.

      `seatSockets` is deliberately NOT in the snapshot: every id in it names a
      connection that died with the process. That leaves the map empty after a
      restore, and `ownsSeat` answers TRUE for an unknown seat by design — so on
      the face of it a restored room has no owner and any disconnect would be
      honoured.

      It holds because `disconnect` takes its identity from the socket's own
      session data, which only a successful join populates, and both join paths
      call `claimSeat` in the same breath. So a socket cannot be holding session
      data for a restored room without also owning the seat.

      That is a coupling, not a guarantee, and it is the kind that disappears
      quietly. Populate session.data anywhere else and R112's protection is gone
      for every restored room, with the symptom being somebody evicted from a
      night they are sitting in.
    */
    const before = new RoomStore();
    const ravi = phone(before, 'socket-ravi');
    const created = handlers.createRoom(ravi.ctx, { name: 'Ravi' }) as {
      roomId: string;
      userId: string;
      secret: string;
    };
    handlers.joinRoom(phone(before, 'socket-dee').ctx, { roomId: created.roomId, name: 'Dee' });

    await saveSnapshot(before.snapshot(), cfg());
    const after = new RoomStore();
    after.restore((await loadSnapshot(cfg()))!);

    // Ravi comes back on a new socket, which claims the seat.
    const raviBack = phone(after, 'socket-ravi-2');
    handlers.joinRoom(raviBack.ctx, {
      roomId: created.roomId,
      userId: created.userId,
      secret: created.secret,
    });

    // A different socket claiming to be Ravi drops. This is the wifi-to-cellular
    // case: the old connection is reaped after the new one has already rejoined.
    const stale = phone(after, 'socket-ravi-STALE');
    stale.session.data.roomId = created.roomId;
    stale.session.data.userId = created.userId;
    handlers.disconnect(stale.ctx);

    const room = after.getRoom(created.roomId)!;
    expect(
      room.users[created.userId],
      'a stale socket evicted somebody from a restored room',
    ).toBeTruthy();
    expect(room.users[created.userId]!.connected).toBe(true);
  });
});
