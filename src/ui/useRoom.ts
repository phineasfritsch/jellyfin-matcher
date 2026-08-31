'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearSession, emitAck, getSocket, loadSession, saveSession } from './socket';
import type { ClientRoom, MatchDeclaredPayload } from './types';

export interface RoomHook {
  room: ClientRoom | null;
  userId: string | null;
  match: MatchDeclaredPayload | null;
  error: string | null;
  /** True while an automatic reconnect attempt is running. */
  connecting: boolean;
  /** Null until a session exists — the join gate collects a name first. */
  join: (name: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  updateSettings: (settings: Partial<ClientRoom['settings']>) => Promise<void>;
  listGenres: () => Promise<string[]>;
  submitGenres: (genres: string[]) => Promise<void>;
  eliminate: (genre: string) => Promise<void>;
  undoVote: () => Promise<void>;
  vote: (cardId: string, points: number) => Promise<void>;
}

export function useRoom(roomId: string): RoomHook {
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchDeclaredPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const attempted = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    const onState = (state: ClientRoom) => {
      if (state.roomId === roomId.toUpperCase()) setRoom(state);
    };
    const onMatch = (payload: MatchDeclaredPayload) => setMatch(payload);
    const onRoomError = (payload: { message: string }) => setError(payload.message);
    socket.on('room:state', onState);
    socket.on('match:declared', onMatch);
    socket.on('room:error', onRoomError);

    // Auto-reconnect with a stored identity (survives refresh / phone lock).
    if (!attempted.current) {
      attempted.current = true;
      const session = loadSession(roomId);
      if (session) {
        emitAck('room:join', { roomId, userId: session.userId })
          .then(() => setUserId(session.userId))
          .catch(() => clearSession(roomId))
          .finally(() => setConnecting(false));
      } else {
        setConnecting(false);
      }
    }

    // Deck builds can outlive a phone's socket (screen lock, backgrounded tab).
    // Socket.io reconnects the transport but the server sees a fresh socket
    // that is not in the room anymore, so re-join with the stored identity or
    // we silently stop receiving broadcasts.
    const onConnect = () => {
      const session = loadSession(roomId);
      if (session) {
        emitAck('room:join', { roomId, userId: session.userId }).catch(() => {});
      }
    };
    socket.on('connect', onConnect);

    return () => {
      socket.off('room:state', onState);
      socket.off('match:declared', onMatch);
      socket.off('room:error', onRoomError);
      socket.off('connect', onConnect);
    };
  }, [roomId]);

  const join = useCallback(
    async (name: string) => {
      const res = await emitAck<{ userId: string }>('room:join', { roomId, name });
      saveSession(roomId, { userId: res.userId, name });
      setUserId(res.userId);
      setError(null);
    },
    [roomId],
  );

  const setReady = useCallback(async (ready: boolean) => {
    await emitAck('room:ready', { ready });
  }, []);

  const updateSettings = useCallback(async (settings: Partial<ClientRoom['settings']>) => {
    await emitAck('room:settings', settings);
  }, []);

  const listGenres = useCallback(async () => {
    const res = await emitAck<{ genres: string[] }>('genres:list', {});
    return res.genres;
  }, []);

  const submitGenres = useCallback(async (genres: string[]) => {
    await emitAck('knockout:submit_genres', { genres });
  }, []);

  const undoVote = useCallback(async () => {
    await emitAck('swipe:undo', {});
  }, []);

  const eliminate = useCallback(async (genre: string) => {
    await emitAck('knockout:eliminate', { genre });
  }, []);

  const vote = useCallback(async (cardId: string, points: number) => {
    await emitAck('swipe:vote', { cardId, points });
  }, []);

  return {
    room,
    userId,
    match,
    error,
    connecting,
    join,
    setReady,
    updateSettings,
    listGenres,
    submitGenres,
    eliminate,
    undoVote,
    vote,
  };
}
