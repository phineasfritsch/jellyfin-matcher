'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearSession, emitAck, getSocket, loadSession, saveSession } from './socket';
import type { ClientRoom, Diagnosis, MatchDeclaredPayload } from './types';

export interface RoomHook {
  room: ClientRoom | null;
  userId: string | null;
  match: MatchDeclaredPayload | null;
  /** Named account of a deck failure or a thin deck, when there is one. */
  diagnosis: Diagnosis | null;
  /**
   * Put the diagnosis away. Nothing used to, so a failure panel outlived the
   * failure and hid the recovered room behind it (R98).
   */
  clearDiagnosis: () => void;
  error: string | null;
  /** True while an automatic reconnect attempt is running. */
  connecting: boolean;
  /** Null until a session exists — the join gate collects a name first. */
  join: (name: string) => Promise<void>;
  /*
    R163: these RESOLVE FALSE on a refusal rather than rejecting.

    The server refuses carefully -- R93 turned eleven try/catches into one
    wrapper precisely so a refusal always reaches the ack. Five call sites then
    dropped it: `void eliminate(g)`, `void setReady(...)`, `void undoVote()` and
    both `submitGenres(...).finally(...)`, which does not handle a rejection
    either. The refusal arrived and nothing on the phone changed, which is the
    hanging phone R93 exists to prevent, one layer up.

    Returning a boolean rather than rethrowing is the point. Rethrowing would
    have left every bare call site with an unhandled rejection, so the fix would
    have had to be repeated at each of them -- and repeating a decision at N
    call sites is what R93 got rid of. The banner is set here, once.
  */
  setReady: (ready: boolean) => Promise<boolean>;
  updateSettings: (settings: Partial<ClientRoom['settings']>) => Promise<boolean>;
  listGenres: () => Promise<string[]>;
  submitGenres: (genres: string[]) => Promise<boolean>;
  eliminate: (genre: string) => Promise<boolean>;
  undoVote: () => Promise<boolean>;
  rejectWinner: () => Promise<boolean>;
  vote: (cardId: string, points: number) => Promise<boolean>;
}

export function useRoom(roomId: string): RoomHook {
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchDeclaredPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [connecting, setConnecting] = useState(true);
  const attempted = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    const onState = (state: ClientRoom) => {
      if (state.roomId === roomId.toUpperCase()) setRoom(state);
    };
    const onMatch = (payload: MatchDeclaredPayload) => setMatch(payload);
    const onRoomError = (payload: { message: string }) => setError(payload.message);
    const onDiagnosis = (payload: Diagnosis) => setDiagnosis(payload);
    socket.on('room:diagnosis', onDiagnosis);
    socket.on('room:state', onState);
    socket.on('match:declared', onMatch);
    socket.on('room:error', onRoomError);

    /*
      R150: what a refused rejoin means, in one place.

      R101 gave the reconnect path below a proper ending -- clear the seat, hand
      the phone back to the door, say why. The MOUNT path never got it: its
      catch cleared the stored session and stopped, so a fresh page load with a
      session the server refuses dropped somebody at the join gate with no
      explanation at all. That is R101's own symptom ("reappearing mid-evening
      with no explanation is indistinguishable from the app losing the room") in
      the path that was not looked at, and it survived because nothing had ever
      executed this hook.

      R149 also changed what a refusal MEANS. Rooms survive a restart now, so a
      room that is genuinely not found was reaped by the idle TTL or never had
      its snapshot written -- not "the server restarted", which is what this
      used to say and is now the wrong cause to hand somebody.
    */
    const rejoinRefused = (err: unknown) => {
      clearSession(roomId);
      const gone = err instanceof Error && /not found/i.test(err.message);
      setUserId(null);
      setRoom(null);
      setError(
        gone
          ? 'That room has ended. Start a new one.'
          : 'Your seat went while you were away. Join the room again.',
      );
      setConnecting(false);
    };

    // Auto-reconnect with a stored identity (survives refresh / phone lock).
    if (!attempted.current) {
      attempted.current = true;
      const session = loadSession(roomId);
      if (session) {
        emitAck('room:join', { roomId, userId: session.userId, secret: session.secret })
          .then(() => {
            setUserId(session.userId);
            setConnecting(false);
          })
          .catch(rejoinRefused);
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
      if (!session) return;
      emitAck('room:join', { roomId, userId: session.userId, secret: session.secret })
        .then(() => {
          /*
            R149: the room came back, so stop saying it did not.

            The server's parting message is now "hold on -- your room will come
            back", and it is true: rooms survive a restart and this rejoin
            succeeds. But `setError` was only ever cleared by somebody typing
            their name at the gate, so the phone recovered completely and then
            sat there showing "The server is restarting" over a working deck.

            A banner that outlives the thing it describes is worse than no
            banner: the next real error looks like the stale one.
          */
          setError(null);
        })
        .catch((err) => {
        /*
          R66: a rejoin that fails is the end of the session, and it used to be
          swallowed.

          R149 changed how often this happens, not whether it matters. Rooms now
          survive a restart, so the common case -- a deploy mid-night -- recovers
          instead of landing here. What still lands here is a room past its idle
          TTL, a snapshot that failed to write, or a seat somebody else took.
          Each one is still the end of the session, and each one used to leave a
          phone sitting on a deck the server had forgotten: still rendering
          cards, still accepting votes, never receiving another broadcast.
          Silence looked exactly like a room where nobody had voted yet.
        */
        /*
          R150: the same ending the mount path now uses. This logic existed
          only here, which is exactly why the other path silently lacked it.
        */
        rejoinRefused(err);
      });
    };
    socket.on('connect', onConnect);

    return () => {
      socket.off('room:state', onState);
      socket.off('match:declared', onMatch);
      socket.off('room:error', onRoomError);
      socket.off('room:diagnosis', onDiagnosis);
      socket.off('connect', onConnect);
    };
  }, [roomId]);

  const join = useCallback(
    async (name: string) => {
      const res = await emitAck<{ userId: string; secret: string }>('room:join', { roomId, name });
      // The secret rides the ack and nothing else. Losing it here means every
      // later reconnect is refused (R86).
      saveSession(roomId, { userId: res.userId, name, secret: res.secret });
      setUserId(res.userId);
      setError(null);
    },
    [roomId],
  );

  /**
   * R163: run an action and say whether it worked, putting any refusal on
   * screen. The one place that decision is made, rather than at each caller.
   */
  const act = useCallback(async (run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      return false;
    }
  }, []);

  const setReady = useCallback(
    (ready: boolean) => act(() => emitAck('room:ready', { ready })),
    [act],
  );

  const updateSettings = useCallback(
    (settings: Partial<ClientRoom['settings']>) => act(() => emitAck('room:settings', settings)),
    [act],
  );

  const listGenres = useCallback(async () => {
    const res = await emitAck<{ genres: string[] }>('genres:list', {});
    return res.genres;
  }, []);

  const submitGenres = useCallback(
    (genres: string[]) => act(() => emitAck('knockout:submit_genres', { genres })),
    [act],
  );

  const rejectWinner = useCallback(() => act(() => emitAck('winner:reject', {})), [act]);

  const undoVote = useCallback(() => act(() => emitAck('swipe:undo', {})), [act]);

  const eliminate = useCallback(
    (genre: string) => act(() => emitAck('knockout:eliminate', { genre })),
    [act],
  );

  const vote = useCallback(
    (cardId: string, points: number) => act(() => emitAck('swipe:vote', { cardId, points })),
    [act],
  );

  /**
   * R98: the panel's way out. The server has already put the room back to
   * genre picking by the time this is reachable -- deckBuildFailed runs before
   * the diagnosis is emitted -- so there is nothing to ask it for. Putting the
   * panel away reveals the room the phone is already in.
   */
  const clearDiagnosis = useCallback(() => setDiagnosis(null), []);

  return {
    room,
    userId,
    match,
    diagnosis,
    clearDiagnosis,
    error,
    connecting,
    join,
    setReady,
    updateSettings,
    listGenres,
    submitGenres,
    eliminate,
    undoVote,
    rejectWinner,
    vote,
  };
}
