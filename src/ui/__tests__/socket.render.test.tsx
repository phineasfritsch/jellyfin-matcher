// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R117: the socket module, executed.
 *
 * Two of this project's most expensive bugs live in this file and nothing ran
 * it. It was reachable only as text -- `validate.test.ts` greps it for event
 * names, which proves the strings are spelled the same and nothing about what
 * they do.
 *
 * R111. `setAuth` ended with `socket.disconnect().connect()` so the handshake
 * would carry a new token. The server reads a teardown as the member leaving,
 * and a LOBBY leaver is deleted along with their seat secret -- so signing in to
 * unlock "Any Movie", the mode the README leads with, destroyed the seat that
 * raised the login, and the whole room if the signer was alone.
 *
 * R86. The seat secret is what makes a reconnect possible at all. If it is not
 * stored beside the user id, every silent rejoin after a phone lock is refused.
 *
 * Named `.render.test.tsx` so the vitest config gives it a DOM: these functions
 * are about localStorage and a live socket, neither of which exists in node.
 */

/*
  jsdom here exposes no localStorage, with or without a real origin, so the
  module under test would throw on import. An in-memory stand-in is honest for
  what is being checked: the app wraps every access in try/catch precisely
  because a private-mode browser can refuse, so what matters is which keys it
  writes and what it does with what comes back -- not the storage engine.
*/
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});

const emit = vi.fn();
const disconnect = vi.fn(() => ({ connect: vi.fn() }));

vi.mock('socket.io-client', () => ({
  io: () => ({ emit, disconnect, on: vi.fn(), off: vi.fn(), auth: {}, connected: true }),
}));

const socketModule = await import('../socket');
const { clearAuth, clearSession, getAuthName, getSocket, loadSession, saveSession, setAuth } =
  socketModule;

beforeEach(() => {
  localStorage.clear();
  emit.mockClear();
  disconnect.mockClear();
  // The module keeps one socket for the life of the page; make sure it exists
  // before the auth calls, which is the real order of events.
  getSocket();
});

afterEach(() => {
  localStorage.clear();
});

describe('signing in', () => {
  it('hands the token to the socket instead of reconnecting', () => {
    /*
      R111, stated as the assertion that would have caught it: a reconnect is a
      disconnect, and the server acts on disconnects.
    */
    setAuth('a-token', 'Ada');
    expect(disconnect).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('auth:token', { token: 'a-token' });
  });

  it('remembers who signed in, for the next page load', () => {
    setAuth('a-token', 'Ada');
    expect(getAuthName()).toBe('Ada');
  });

  it('tells the socket when the browser signs out', () => {
    // A live socket can adopt a token, so it can also still be holding one the
    // browser has forgotten: signed out here, signed in there.
    setAuth('a-token', 'Ada');
    emit.mockClear();
    clearAuth();
    expect(emit).toHaveBeenCalledWith('auth:token', {});
    expect(getAuthName()).toBeNull();
  });
});

describe('the stored seat', () => {
  it('keeps the secret beside the id, or no reconnect ever works', () => {
    // R86: reclaiming a seat needs the secret issued with it. Losing it here
    // means every silent rejoin after a phone lock is refused.
    saveSession('ab12', { userId: 'u_1', name: 'Ada', secret: 'f'.repeat(64) });
    const back = loadSession('ab12');
    expect(back?.userId).toBe('u_1');
    expect(back?.secret).toBe('f'.repeat(64));
  });

  it('is found whatever case the room code was typed in', () => {
    // Room codes are read aloud and typed back, so the key cannot be
    // case-sensitive.
    saveSession('AB12', { userId: 'u_1', name: 'Ada', secret: 'f'.repeat(64) });
    expect(loadSession('ab12')?.userId).toBe('u_1');
  });

  it('is per room, so leaving one does not forget another', () => {
    saveSession('AB12', { userId: 'u_1', name: 'Ada', secret: 'a'.repeat(64) });
    saveSession('CD34', { userId: 'u_9', name: 'Ada', secret: 'b'.repeat(64) });
    clearSession('AB12');
    expect(loadSession('AB12')).toBeNull();
    expect(loadSession('CD34')?.userId).toBe('u_9');
  });

  it('reads a session written by an older build without throwing', () => {
    // StoredSession.secret is optional precisely so this cannot throw; the
    // reconnect is then refused and the member rejoins by name.
    localStorage.setItem('matcher:room:AB12', JSON.stringify({ userId: 'u_1', name: 'Ada' }));
    const back = loadSession('AB12');
    expect(back?.userId).toBe('u_1');
    expect(back?.secret).toBeUndefined();
  });

  it('treats unreadable storage as no session rather than an error', () => {
    localStorage.setItem('matcher:room:AB12', 'not json');
    expect(loadSession('AB12')).toBeNull();
  });
});
