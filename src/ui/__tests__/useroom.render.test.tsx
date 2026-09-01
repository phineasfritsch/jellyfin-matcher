// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R150: the hook, executed. It never had a test of any kind.
 *
 * That gap was found and written down rather than closed, twice. R129's audit
 * noticed that `roomclient.render.test.tsx` mocks `useRoom` wholesale, so R101 —
 * a refused rejoin that left `userId` set, leaving a phone rendering a room it
 * received no broadcasts for — is invisible there. The comment in that file
 * says so, and points at the two-browser harness as the only thing guarding it.
 *
 * The harness is still better evidence for the socket. But "the only guard
 * needs a live Jellyfin and a running server" means it does not guard anything
 * in CI, and this hook is where R149's recovery is decided: whether a phone
 * comes back after a restart, and whether it stops saying the server is
 * restarting once it has.
 */

const socket = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    fire: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    stub: {
      on: (event: string, fn: (payload: unknown) => void) => void handlers.set(event, fn),
      off: (event: string) => void handlers.delete(event),
    },
  };
});

const store = vi.hoisted(() => ({
  session: null as null | { userId: string; name: string; secret: string },
  cleared: false,
  /** What emitAck should do with the next `room:join`. */
  join: (() => Promise.resolve({})) as (event: string, payload: unknown) => Promise<unknown>,
  calls: [] as Array<{ event: string; payload: unknown }>,
}));

vi.mock('../socket', () => ({
  getSocket: () => socket.stub,
  loadSession: () => store.session,
  saveSession: vi.fn(),
  clearSession: () => {
    store.cleared = true;
  },
  emitAck: (event: string, payload: unknown) => {
    store.calls.push({ event, payload });
    return store.join(event, payload);
  },
}));

const { useRoom } = await import('../useRoom');

/** Renders the hook and exposes its latest value. */
function mount(roomId = 'AB12') {
  const seen: Array<ReturnType<typeof useRoom>> = [];
  function Probe() {
    seen.push(useRoom(roomId));
    return null;
  }
  render(<Probe />);
  return { seen, latest: () => seen[seen.length - 1]! };
}

beforeEach(() => {
  socket.handlers.clear();
  store.session = { userId: 'u_1', name: 'Ravi', secret: 's3cret' };
  store.cleared = false;
  store.calls = [];
  store.join = () => Promise.resolve({});
});
afterEach(cleanup);

describe('coming back after a restart', () => {
  it('rejoins with the stored identity rather than asking again', async () => {
    // R86: the seat secret is what makes a silent rejoin possible at all.
    mount();
    await act(async () => {});
    const join = store.calls.find((c) => c.event === 'room:join');
    expect(join, 'the phone did not try to rejoin').toBeTruthy();
    expect(join!.payload).toMatchObject({ roomId: 'AB12', userId: 'u_1', secret: 's3cret' });
  });

  it('stops saying the server is restarting once the room is back', async () => {
    /*
      R149. The server's parting message is now "hold on — your room will come
      back", and it is true. But `setError` was only ever cleared by somebody
      typing their name at the gate, so a phone recovered completely and then
      sat there showing "The server is restarting" over a working deck.

      A banner that outlives what it describes is worse than none: the next real
      error looks like the stale one.
    */
    const probe = mount();
    await act(async () => {
      socket.fire('room:error', { message: 'The server is restarting. Hold on.' });
    });
    expect(probe.latest().error).toMatch(/restarting/i);

    await act(async () => {
      socket.fire('connect', undefined);
    });
    expect(probe.latest().error, 'the banner outlived the restart it described').toBeNull();
  });
});

describe('a rejoin that is refused', () => {
  beforeEach(() => {
    store.join = (event) =>
      event === 'room:join'
        ? Promise.reject(new Error('Room not found'))
        : Promise.resolve({});
  });

  it('hands the phone back to the door instead of a room it cannot hear', async () => {
    /*
      R101, tested here for the first time. This is the defect the screen
      chooser's tests cannot see, because they mock this hook and hand
      themselves `userId: null` by hand.

      Clearing the session and setting an error while leaving `userId` set left
      the phone rendering the last room state it had: receiving no broadcasts,
      since joinChannel only runs on a successful join, and offering controls
      whose acks would be refused.
    */
    const probe = mount();
    await act(async () => {});
    expect(probe.latest().userId, 'the phone still holds a seat it lost').toBeNull();
    expect(probe.latest().room).toBeNull();
    expect(store.cleared, 'the dead session was kept').toBe(true);
  });

  it('says why, without blaming a restart that no longer loses rooms', async () => {
    /*
      R149 changed what a refusal means. Rooms survive a restart now, so a room
      that is genuinely not found was reaped by the idle TTL, or its snapshot
      never got written — not "the server restarted". The old copy said the
      latter, and after F1 that is simply the wrong cause to hand somebody.
    */
    const probe = mount();
    await act(async () => {});
    const message = probe.latest().error ?? '';
    expect(message, 'the phone is not told anything').not.toBe('');
    expect(message, 'still blames a restart for losing the room').not.toMatch(
      /server restarted/i,
    );
  });
});

describe('the connecting flag is always let go of', () => {
  /*
    B06, executed rather than grepped.

    The pin for this was the literal `.finally(() => setConnecting(false))`,
    which is a shape and not a promise: R150 consolidated the two rejoin paths
    into one handler that still clears the flag, and the pin went red for a
    refactor that kept every guarantee it was protecting.

    What actually matters is that nothing leaves the phone stuck on a spinner.
    So both endings are driven here — the one where the room comes back and the
    one where the seat is gone — and the pin now points at these.
  */
  it('lets go after a rejoin that works', async () => {
    const probe = mount();
    await act(async () => {});
    expect(probe.latest().connecting, 'the phone is still spinning after a good rejoin').toBe(
      false,
    );
  });

  it('lets go after a rejoin that is refused', async () => {
    store.join = (event) =>
      event === 'room:join' ? Promise.reject(new Error('Room not found')) : Promise.resolve({});
    const probe = mount();
    await act(async () => {});
    expect(probe.latest().connecting, 'a refused rejoin leaves the phone spinning').toBe(false);
  });

  it('lets go when there is no stored session to rejoin with', async () => {
    // The first-visit path: nothing to try, so nothing to wait for.
    store.session = null;
    const probe = mount();
    await act(async () => {});
    expect(probe.latest().connecting).toBe(false);
  });
});
