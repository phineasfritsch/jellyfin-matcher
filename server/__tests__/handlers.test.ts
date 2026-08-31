import { beforeEach, describe, expect, it } from 'vitest';
import * as handlers from '../handlers';
import type { Ctx, Effects, Session } from '../handlers';
import { RateLimiter } from '../limits';
import { RoomStore } from '../store';
import type { Room } from '../store';

/**
 * The socket layer, executed.
 *
 * Before this file, no test in the repository imported the handlers at all.
 * The join gating, the reconnect branch, the disconnect path, settlement on
 * departure and the vote guards never ran under `npm run gate`; what touched
 * them was a string scan asserting the event names were still spelled right.
 *
 * Three of this project's worst defects lived in exactly that gap and every
 * one of them was green: an identity takeover on reconnect, a knockout that
 * could not resolve when a phone dropped, and a winner screen that misreported
 * itself after a reload (R86, R87, R90).
 */

/** A socket that is a plain object, and effects that only remember. */
function harness() {
  const store = new RoomStore();
  const requests: number[] = [];
  let jellyseerrStatus = 2; // approved outright, the common case with an admin key
  const broadcasts: Room[] = [];
  const emits: Array<{ roomId: string; event: string; payload: unknown }> = [];
  const swipeStarts: Room[] = [];
  let settleNext = false;
  const settled: Array<string | null> = [];

  const session: Session = {
    data: {},
    authedName: () => null,
    address: () => '10.0.0.1',
    joinChannel: () => {},
  };

  const fx: Effects = {
    broadcast: (room) => void broadcasts.push(room),
    toRoom: (roomId, event, payload) => void emits.push({ roomId, event, payload }),
    settleIfPossible: (_room, justVoted) => {
      settled.push(justVoted);
      return settleNext;
    },
    startSwiping: (room) => void swipeStarts.push(room),
  };

  const ctx: Ctx = {
    store,
    session,
    fx,
    // MATCHER_AUTH's default posture: anyone may create and join, and only
    // the two actions that can spend the host's disk need an account.
    authConfig: () => ({
      createRequires: false,
      joinRequires: false,
      wideRequires: true,
      requestRequires: true,
    }),
    joinLimiter: new RateLimiter(30, 60_000),
    // Never the real thing. A test of the rules around the one control that
    // spends the host's disk must not be able to spend it (R99).
    // Jellyseerr's MediaRequestStatus is numeric: 1 pending approval, 2
    // approved. The first version of this fake returned the string 'PENDING',
    // which is not a shape the real API produces and quietly made every
    // approval check read as false.
    requestMovie: async (tmdbId: number) => {
      requests.push(tmdbId);
      return { id: 4242, status: jellyseerrStatus };
    },
  };

  return {
    ctx,
    store,
    session,
    broadcasts,
    requests,
    emits,
    swipeStarts,
    settled,
    settle: (v: boolean) => {
      settleNext = v;
    },
    jellyseerrReturns: (status: number) => {
      jellyseerrStatus = status;
    },
  };
}

describe('creating and joining', () => {
  it('seats the creator and tells them their secret', () => {
    const h = harness();
    const res = handlers.createRoom(h.ctx, { name: 'Ada' });

    expect(res.roomId).toMatch(/^[A-Z0-9]{4}$/);
    expect(res.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(h.session.data.roomId).toBe(res.roomId);
    expect(h.session.data.userId).toBe(res.userId);
    // Everyone in the room, including the creator, gets a view immediately.
    expect(h.broadcasts).toHaveLength(1);
  });

  it('counts rooms per socket, so one device cannot fill the server', () => {
    const h = harness();
    for (let i = 0; i < 20; i++) handlers.createRoom(h.ctx, { name: 'Ada' });
    expect(() => handlers.createRoom(h.ctx, { name: 'Ada' })).toThrow(/Too many rooms/);
  });

  it('refuses a reconnect that does not have the seat secret', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    const guest = handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });

    // The attack R86 closes, at the layer a phone actually reaches.
    expect(() =>
      handlers.joinRoom(h.ctx, { roomId: host.roomId, userId: host.userId, secret: guest.secret }),
    ).toThrow(/not yours/);
  });

  it('rejects a malformed secret before it reaches a compare', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    expect(() =>
      handlers.joinRoom(h.ctx, { roomId: host.roomId, userId: host.userId, secret: 'nope' }),
    ).toThrow(/seat secret/);
  });

  it('rate limits attempts to take a seat', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    // Room codes are four characters; without a limit this endpoint enumerates
    // them. A wrong guess still costs an attempt, which is the point.
    for (let i = 0; i < 30; i++) {
      try {
        handlers.joinRoom(h.ctx, { roomId: 'ZZZZ', name: 'Mallory' });
      } catch {
        /* expected: no such room */
      }
    }
    expect(() => handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Mallory' })).toThrow(
      /Too many attempts/,
    );
  });

  it('clears the count for a member who really did get in', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    for (let i = 0; i < 20; i++) {
      try {
        handlers.joinRoom(h.ctx, { roomId: 'ZZZZ', name: 'Bex' });
      } catch {
        /* expected */
      }
    }
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });
    // A household on flaky wifi must never meet the limiter.
    for (let i = 0; i < 20; i++) {
      expect(() => handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Cy' })).not.toThrow();
    }
  });
});

describe('the auth gates', () => {
  it('lets a signed-in member switch to Any Movie', () => {
    const h = harness();
    handlers.createRoom(h.ctx, { name: 'Ada' });
    h.ctx.session.authedName = () => 'ada';
    expect(() => handlers.updateSettings(h.ctx, { scope: 'wide' })).not.toThrow();
  });

  it('refuses a guest, because Any Movie unlocks downloads', () => {
    const h = harness();
    handlers.createRoom(h.ctx, { name: 'Ada' });
    expect(() => handlers.updateSettings(h.ctx, { scope: 'wide' })).toThrow(/Sign in/);
  });

  it('lets a guest change settings that spend nothing', () => {
    const h = harness();
    handlers.createRoom(h.ctx, { name: 'Ada' });
    expect(() => handlers.updateSettings(h.ctx, { scope: 'local', deckLimit: 25 })).not.toThrow();
  });
});

describe('voting', () => {
  function swiping() {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    const room = h.store.getRoom(host.roomId)!;
    room.status = 'SWIPING';
    room.deck = [{ id: 'c1' }, { id: 'c2' }] as Room['deck'];
    return { h, room, host };
  }

  it('records a vote and broadcasts when the room has not settled', () => {
    const { h } = swiping();
    h.settle(false);
    handlers.vote(h.ctx, { cardId: 'c1', points: 2 });
    expect(h.settled).toEqual(['c1']);
    expect(h.broadcasts.length).toBeGreaterThan(1);
  });

  it('does not broadcast over a settlement it just triggered', () => {
    const { h } = swiping();
    const before = h.broadcasts.length;
    h.settle(true);
    handlers.vote(h.ctx, { cardId: 'c1', points: 2 });
    // settleIfPossible declares and broadcasts on its own; a second broadcast
    // here would race the winner screen with a deck update.
    expect(h.broadcasts.length).toBe(before);
  });

  it('refuses a vote value the deck does not offer', () => {
    const { h } = swiping();
    expect(() => handlers.vote(h.ctx, { cardId: 'c1', points: 99 })).toThrow(/Invalid vote/);
  });

  it('refuses a card that is not in this deck', () => {
    const { h } = swiping();
    expect(() => handlers.vote(h.ctx, { cardId: 'c9', points: 2 })).toThrow(/Unknown card/);
  });

  it('refuses a vote once the room is finished', () => {
    const { h, room } = swiping();
    room.status = 'FINISHED';
    expect(() => handlers.vote(h.ctx, { cardId: 'c1', points: 2 })).toThrow(/Not swiping/);
  });

  it('gives undo back the card id, so the deck knows what returned', () => {
    const { h } = swiping();
    handlers.vote(h.ctx, { cardId: 'c1', points: 2 });
    expect(handlers.undo(h.ctx)).toEqual({ cardId: 'c1' });
  });

  it('refuses an undo with nothing behind it', () => {
    const { h } = swiping();
    expect(() => handlers.undo(h.ctx)).toThrow(/Nothing to undo/);
  });
});

describe('asking Jellyseerr for the winner', () => {
  function finished(held: boolean) {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    h.ctx.session.authedName = () => 'ada';
    const room = h.store.getRoom(host.roomId)!;
    room.status = 'FINISHED';
    room.winner = 'c1';
    room.deck = [
      { id: 'c1', title: 'Parasite', tmdbId: 496243, jellyfinItemId: held ? 'j1' : null },
    ] as unknown as Room['deck'];
    return { h, room };
  }

  it('asks once and records who asked', async () => {
    const { h, room } = finished(false);
    const res = await handlers.requestWinner(h.ctx);

    expect(res.requestId).toBe(4242);
    expect(h.requests).toEqual([496243]);
    // R107: and what Jellyseerr actually did with it. The fake returns status
    // 2, which is approved outright.
    expect(room.winnerRequest).toEqual({ by: 'ada', title: 'Parasite', approved: true });
  });

  it('says so when Jellyseerr is holding it for a human', async () => {
    // R107: the app used to assert an approval gate it does not control. With
    // an admin key a request is normally auto-approved, so claiming "the host
    // approves it before anything is fetched" was the lenient direction to be
    // wrong in on the one control that spends someone else's disk.
    const { h, room } = finished(false);
    h.jellyseerrReturns(1);
    await handlers.requestWinner(h.ctx);
    expect(room.winnerRequest?.approved).toBe(false);
  });

  it('refuses the second press without calling Jellyseerr again', async () => {
    // The whole point. A second request is a second download, and the only
    // thing stopping it used to be a disabled button on one phone.
    const { h } = finished(false);
    await handlers.requestWinner(h.ctx);
    await expect(handlers.requestWinner(h.ctx)).rejects.toThrow(/already asked/i);
    expect(h.requests).toHaveLength(1);
  });

  it('tells the room, so it is not private to whoever pressed it', async () => {
    const { h } = finished(false);
    await handlers.requestWinner(h.ctx);
    expect(h.emits.some((e) => e.event === 'winner:requested')).toBe(true);
    // And broadcasts, so a phone that never receives the event still learns it
    // from the room state on its next reload.
    expect(h.broadcasts.length).toBeGreaterThan(1);
  });

  it('refuses a film the server already has', async () => {
    const { h } = finished(true);
    await expect(handlers.requestWinner(h.ctx)).rejects.toThrow(/Already in the library/);
    expect(h.requests).toHaveLength(0);
  });

  it('refuses a guest, because this one spends the host disk', async () => {
    const { h } = finished(false);
    h.ctx.session.authedName = () => null;
    await expect(handlers.requestWinner(h.ctx)).rejects.toThrow(/Sign in/);
    expect(h.requests).toHaveLength(0);
  });

  it('refuses before the room has a winner', async () => {
    const { h, room } = finished(false);
    room.status = 'SWIPING';
    await expect(handlers.requestWinner(h.ctx)).rejects.toThrow(/No winner to request/);
    expect(h.requests).toHaveLength(0);
  });

  it('lets the room ask again after it rejects the winner', async () => {
    // A new winner has not been asked for, whatever the last one's state was.
    const { h, room } = finished(false);
    await handlers.requestWinner(h.ctx);
    expect(room.winnerRequest).not.toBeNull();

    handlers.reject(h.ctx);
    expect(room.winnerRequest).toBeNull();
  });
});

describe('a socket going away', () => {
  it('does nothing for a socket that was never in a room', () => {
    const h = harness();
    expect(() => handlers.disconnect(h.ctx)).not.toThrow();
    expect(h.broadcasts).toHaveLength(0);
  });

  it('starts the round when the last unready member leaves the lobby', () => {
    /*
      R108: the same rule as R87, one phase earlier. A member who drops in the
      LOBBY is deleted outright, so the room can become all-ready by their
      leaving -- and nothing re-checked that, because startKnockout is reachable
      only from setReady. Three members with two ready and the third's phone in
      a pocket sat on "Everyone is in. Starting." until the TTL reaped the room.
    */
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    const bex = handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });
    const room = h.store.getRoom(host.roomId)!;

    // Ada and Bex are ready. Cy, whose socket this is, never was.
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Cy' });
    room.users[host.userId]!.ready = true;
    room.users[bex.userId]!.ready = true;

    expect(room.status).toBe('LOBBY');
    handlers.disconnect(h.ctx);
    expect(room.status).toBe('KNOCKOUT');
  });

  it('keeps waiting when the room is still not all ready', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });
    const room = h.store.getRoom(host.roomId)!;
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Cy' });
    // Only Ada is ready, so Cy leaving does not make the room all-ready.
    room.users[host.userId]!.ready = true;

    handlers.disconnect(h.ctx);
    expect(room.status).toBe('LOBBY');
  });

  it('does not start a round for one person left alone', () => {
    // A room of one never starts, however ready that one person is.
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    const room = h.store.getRoom(host.roomId)!;
    room.users[host.userId]!.ready = true;
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });
    room.users[Object.keys(room.users)[1]!]!.ready = true;

    handlers.disconnect(h.ctx);
    expect(room.status).toBe('LOBBY');
  });

  it('re-checks settlement when a swiper leaves', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });
    const room = h.store.getRoom(host.roomId)!;
    room.status = 'SWIPING';

    h.settle(false);
    handlers.disconnect(h.ctx);
    // The leaver may have been the only member the room was waiting on.
    expect(h.settled).toContain(null);
  });

  it('re-runs the knockout when the last holdout leaves mid-round', () => {
    /*
      The first version of this asserted only that *something* happened --
      a broadcast or a deck build. Deleting the whole knockout branch still
      passed it, because the fallthrough broadcasts too. A test that a bug
      walks straight through is worse than no test, so this asserts the
      outcome: the round resolves and the deck starts building (R87).
    */
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    handlers.joinRoom(h.ctx, { roomId: host.roomId, name: 'Bex' });
    const room = h.store.getRoom(host.roomId)!;

    // Ada answers with two genres. Bex, whose socket this is, never does.
    room.status = 'KNOCKOUT';
    room.knockout.phase = 'CHECKBOX';
    room.knockout.submissions = { [host.userId]: ['Action', 'Comedy'] };

    handlers.disconnect(h.ctx);

    expect(room.knockout.phase).toBe('DONE');
    expect(room.lockedGenres.sort()).toEqual(['Action', 'Comedy']);
    expect(h.swipeStarts).toHaveLength(1);
  });
});

describe('rejecting a winner', () => {
  it('refuses when there is no winner', () => {
    const h = harness();
    handlers.createRoom(h.ctx, { name: 'Ada' });
    expect(() => handlers.reject(h.ctx)).toThrow(/No winner to reject/);
  });

  it('puts the room back to swiping and re-checks settlement', () => {
    const h = harness();
    const host = handlers.createRoom(h.ctx, { name: 'Ada' });
    const room = h.store.getRoom(host.roomId)!;
    room.status = 'FINISHED';
    room.winner = 'c1';

    h.settle(false);
    handlers.reject(h.ctx);
    expect(room.status).toBe('SWIPING');
    expect(room.rejected).toContain('c1');
    expect(h.settled).toContain(null);
  });
});

describe('acting without a seat', () => {
  // Every one of these used to read `socket.data as { userId: string }` and
  // trust it. A socket that never joined has neither.
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('refuses ready', () => {
    expect(() => handlers.setReady(h.ctx, { ready: true })).toThrow(/not in a room/i);
  });
  it('refuses a vote', () => {
    expect(() => handlers.vote(h.ctx, { cardId: 'c1', points: 2 })).toThrow(/not in a room/i);
  });
  it('refuses an undo', () => {
    expect(() => handlers.undo(h.ctx)).toThrow(/not in a room/i);
  });
  it('refuses a reject', () => {
    expect(() => handlers.reject(h.ctx)).toThrow(/not in a room/i);
  });
  it('refuses genre picks', () => {
    expect(() => handlers.submitGenres(h.ctx, { genres: ['Action'] })).toThrow(/not in a room/i);
  });
});
