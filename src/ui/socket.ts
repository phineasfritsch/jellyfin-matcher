'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

const AUTH_TOKEN_KEY = 'matcher:auth-token';
const AUTH_NAME_KEY = 'matcher:auth-name';

/**
 * R139: the name a guest typed on the home screen, so the join gate does not
 * ask for it again (WCAG 2.2 A 3.3.7 Redundant Entry).
 *
 * Separate from AUTH_NAME_KEY on purpose. That one is who you signed in AS, and
 * `AuthGate` decides things from it; this is a convenience for somebody with no
 * account at all, and conflating them would make a typed name look like a
 * session to every reader of this module.
 *
 * Not a URL parameter, which is the other obvious way to carry it across the
 * navigation: a name in a path lands in browser history, in any proxy log, and
 * in whatever the host's reverse proxy writes to disk. It is the one piece of
 * personal data this app handles for a guest and it should not leave the phone.
 */
const TYPED_NAME_KEY = 'matcher:typed-name';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getAuthName(): string | null {
  try {
    return localStorage.getItem(AUTH_NAME_KEY);
  } catch {
    return null;
  }
}

/** Remember what a guest typed, so the next screen can offer it back (R139). */
export function rememberTypedName(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(TYPED_NAME_KEY, name.trim());
  } catch {
    /* private mode: the gate simply asks again, which is the old behaviour */
  }
}

export function typedName(): string | null {
  try {
    return localStorage.getItem(TYPED_NAME_KEY);
  } catch {
    return null;
  }
}

export function setAuth(token: string, name: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_NAME_KEY, name);
  } catch {
    /* private mode: token just won't persist across reloads */
  }
  /*
    R111: hand the token to the socket that is already connected.

    This used to be `socket.disconnect().connect()`, so the handshake would
    carry the new token -- and the server sees that teardown as the member
    leaving. In the LOBBY a leaver is deleted outright along with their seat
    secret, so signing in to unlock "Any Movie" destroyed the seat that raised
    the login, and destroyed the whole room if the signer was alone. The rejoin
    was then refused, the phone was told the room was gone, and the settings
    change that started it all was refused as "You are not in a room".

    socket.auth is still updated, because a genuine reconnect later must carry
    the token in its handshake.
  */
  if (socket) {
    socket.auth = { token };
    socket.emit('auth:token', { token });
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_NAME_KEY);
  } catch {
    /* ignore */
  }
  // R111: tell the socket too. Now that a live socket can adopt a token, it can
  // also still be holding one after the browser has forgotten it -- signed out
  // on this side and signed in on the other.
  if (socket) {
    socket.auth = {};
    socket.emit('auth:token', {});
  }
}

/** Singleton socket to the matcher server (same origin as the page). */
export function getSocket(): Socket {
  if (!socket) {
    // Pass the token on every (re)connect so a refreshed session stays valid.
    socket = io({ autoConnect: true, auth: (cb) => cb({ token: getAuthToken() ?? '' }) });
  }
  return socket;
}

/** Promisified emit against the server's `{ ok, error? }` ack contract. */
export function emitAck<T extends Record<string, unknown> = Record<string, unknown>>(
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket()
      /*
        R99: longer than the server's own upstream deadline, not shorter.

        This was 10s while UPSTREAM_TIMEOUT_MS is 15s, so any action that waits
        on Jellyfin or Jellyseerr could be reported to the phone as failed while
        the server was still working and about to succeed. On winner:request
        that mattered: the screen said "Request failed", put the button back,
        and the retry it invited landed in Radarr as a second download.

        A client deadline shorter than the server's turns slow into wrong.
      */
      .timeout(20_000)
      .emit(event, payload, (err: Error | null, res: ({ ok: true } & T) | { ok: false; error: string }) => {
        if (err) return reject(err);
        if (res.ok) resolve(res as T);
        else reject(new Error(res.error));
      });
  });
}

export interface StoredSession {
  userId: string;
  name: string;
  /**
   * The seat secret (R86). A user id alone used to be enough to reclaim a
   * seat, which made any room enterable by anyone who could guess a
   * four-character code and a counter. Stored beside the id because the
   * silent reconnect this app promises across a phone lock or a refresh is
   * exactly the thing that needs it.
   *
   * Optional only so a session written by an older build does not throw on
   * read; without it the reconnect is refused and the member rejoins by name.
   */
  secret?: string;
}

const sessionKey = (roomId: string) => `matcher:room:${roomId.toUpperCase()}`;

/** Reconnect identity survives phone lock / page refresh. */
export function saveSession(roomId: string, session: StoredSession): void {
  try {
    localStorage.setItem(sessionKey(roomId), JSON.stringify(session));
  } catch {
    /* private mode — reconnect just won't survive refresh */
  }
}

export function loadSession(roomId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(roomId));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(roomId: string): void {
  try {
    localStorage.removeItem(sessionKey(roomId));
  } catch {
    /* ignore */
  }
}
