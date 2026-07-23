'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Singleton socket to the matcher server (same origin as the page). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true });
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
