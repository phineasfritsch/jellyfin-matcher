'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

const AUTH_TOKEN_KEY = 'matcher:auth-token';
const AUTH_NAME_KEY = 'matcher:auth-name';

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

export function setAuth(token: string, name: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_NAME_KEY, name);
  } catch {
    /* private mode: token just won't persist across reloads */
  }
  // Reconnect so the handshake carries the new token.
  if (socket) {
    socket.auth = { token };
    socket.disconnect().connect();
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_NAME_KEY);
  } catch {
    /* ignore */
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
      .timeout(10_000)
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
