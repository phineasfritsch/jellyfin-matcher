/**
 * The socket handlers, as functions a test can call.
 *
 * These lived inside `io.on('connection')` in server/index.ts, closed over the
 * live `io` and `store`. Nothing imported that file, so under `npm run gate`
 * the join gating, the reconnect branch, the disconnect path, settlement on
 * departure and the vote guards never executed. What did touch it was a string
 * scan asserting the event names are still spelled the same.
 *
 * That is the shape of the worst bugs this project has shipped: correct-looking
 * code, checked by something that cannot see what it does. Three defects lived
 * in exactly this gap -- an identity takeover on reconnect, a knockout that
 * could not resolve when a phone dropped, and a winner screen that misreported
 * itself after a reload -- and every one of them was green.
 *
 * So the bodies moved out behind an explicit seam, the same move transitions.ts
 * made under R69. `index.ts` keeps the socket.on registrations, both because
 * that is where wiring belongs and because the contract test in
 * validate.test.ts reads them as text.
 *
 * Handlers throw on refusal. The caller turns that into an ack, so the error
 * path is one decision in one place rather than eleven (R93).
 */
import { isValidVote } from '../src/lib/match';
import type { AuthConfig } from './auth';
import type { RateLimiter } from './limits';
import { MAX_ROOMS, ROOMS_PER_SOCKET } from './limits';
import type { Room, RoomStore } from './store';
import {
  knockoutMemberLeft,
  recordElimination,
  recordGenres,
  recordVote,
  rejectWinner,
  startKnockout,
  undoVote,
} from './transitions';
import {
  asBoolean,
  asCardId,
  asGenre,
  asGenres,
  asName,
  asRoomId,
  asSecret,
  asSettings,
  asUserId,
} from './validate';

/** Per-socket state, and the few things only a real socket can answer. */
export interface Session {
  data: { roomId?: string; userId?: string; made?: number };
  /** The signed-in Jellyfin name, or null for a guest. */
  authedName(): string | null;
  /** Remote address, for rate limiting. */
  address(): string;
  /** Subscribe this socket to a room's channel. */
  joinChannel(roomId: string): void;
}

/**
 * Everything a handler does to the world outside its own room object. A test
 * passes recorders; production passes the socket.io versions.
 */
export interface Effects {
  /** Send every member their own redacted view (R61). */
  broadcast(room: Room): void;
  /** Emit to everyone in a room's channel. */
  toRoom(roomId: string, event: string, payload: unknown): void;
  /** Settle if the room can settle; returns whether it did. */
  settleIfPossible(room: Room, justVoted: string | null): boolean;
  /** Begin the deck build. Fire and forget: the room is told by broadcast. */
  startSwiping(room: Room): void;
}

export interface Ctx {
  store: RoomStore;
  session: Session;
  fx: Effects;
  authConfig(): AuthConfig;
  joinLimiter: RateLimiter;
}

function room(ctx: Ctx): Room {
  const { roomId } = ctx.session.data;
  const found = roomId ? ctx.store.getRoom(roomId) : undefined;
  if (!found) throw new Error('You are not in a room');
  return found;
}

function me(ctx: Ctx): string {
  const { userId } = ctx.session.data;
  if (!userId) throw new Error('You are not in a room');
  return userId;
}

export function createRoom(ctx: Ctx, payload: unknown) {
  if (ctx.authConfig().createRequires && !ctx.session.authedName()) {
    throw new Error('Sign in with your Jellyfin account to create a room');
  }
  const { name } = (payload ?? {}) as { name?: unknown };
  // Ceilings, not budgets: a household needs one room (R77).
  if (ctx.store.roomCount() >= MAX_ROOMS) {
    throw new Error('This server is full. Ask the host to restart it.');
  }
  const made = ctx.session.data.made ?? 0;
  if (made >= ROOMS_PER_SOCKET) throw new Error('Too many rooms from this device');

  const seat = ctx.store.createRoom(asName(name, 'Host'), Boolean(ctx.session.authedName()));
  ctx.session.data = { roomId: seat.room.roomId, userId: seat.userId, made: made + 1 };
  ctx.session.joinChannel(seat.room.roomId);
  ctx.fx.broadcast(seat.room);
  // The secret goes to the member who owns the seat and nowhere else: it rides
  // the ack, never a broadcast (R86).
  return { roomId: seat.room.roomId, userId: seat.userId, secret: seat.secret };
}

export function joinRoom(ctx: Ctx, payload: unknown) {
  const raw = (payload ?? {}) as {
    roomId?: unknown;
    name?: unknown;
    userId?: unknown;
    secret?: unknown;
  };
  const roomId = asRoomId(raw.roomId);
  const userId = raw.userId == null ? undefined : asUserId(raw.userId);

  /*
    R86. Room codes are four characters and user ids are a global counter, so
    an unlimited join endpoint is an enumeration oracle for both. Attempts are
    counted whether or not they succeed, because the useful signal to an
    attacker is which guesses were wrong.
  */
  const who = ctx.session.address();
  if (ctx.joinLimiter.isLimited(who)) {
    const wait = ctx.joinLimiter.retryAfterSec(who);
    throw new Error(`Too many attempts. Try again in ${Math.max(1, wait)} second(s).`);
  }
  ctx.joinLimiter.record(who);

  // Only a fresh join is gated; reconnecting an existing member is not, so a
  // guest who already joined keeps their seat.
  if (!userId && ctx.authConfig().joinRequires && !ctx.session.authedName()) {
    throw new Error('Sign in with your Jellyfin account to join this room');
  }

  const seat = userId
    ? {
        // Returning member. A user id used to be enough to become that member;
        // it now needs the secret issued with it (R86).
        room: ctx.store.reconnect(roomId, userId, asSecret(raw.secret)),
        userId,
        secret: asSecret(raw.secret),
      }
    : ctx.store.joinRoom(roomId, asName(raw.name, 'Guest'), Boolean(ctx.session.authedName()));

  ctx.joinLimiter.clear(who);
  ctx.session.data = { ...ctx.session.data, roomId: seat.room.roomId, userId: seat.userId };
  ctx.session.joinChannel(seat.room.roomId);
  ctx.fx.broadcast(seat.room);
  return { roomId: seat.room.roomId, userId: seat.userId, secret: seat.secret };
}

export function setReady(ctx: Ctx, payload: unknown) {
  const { ready } = (payload ?? {}) as { ready?: unknown };
  const current = ctx.store.setReady(room(ctx).roomId, me(ctx), asBoolean(ready));
  startKnockout(current, ctx.store);
  ctx.fx.broadcast(current);
  return {};
}

export function updateSettings(ctx: Ctx, payload: unknown) {
  const settings = asSettings(payload);
  // "Any Movie" scope unlocks Jellyseerr requests, so switching to it needs an
  // account even when creating and joining did not.
  if (settings.scope === 'wide' && ctx.authConfig().wideRequires && !ctx.session.authedName()) {
    throw new Error('Sign in with your Jellyfin account to search any movie');
  }
  const current = ctx.store.updateSettings(room(ctx).roomId, settings);
  ctx.fx.broadcast(current);
  return {};
}

export function submitGenres(ctx: Ctx, payload: unknown) {
  const { genres } = (payload ?? {}) as { genres?: unknown };
  const current = room(ctx);
  if (current.status !== 'KNOCKOUT') throw new Error('Not in knockout');
  const { done } = recordGenres(current, me(ctx), asGenres(genres), ctx.store);
  if (done) ctx.fx.startSwiping(current);
  else ctx.fx.broadcast(current);
  return {};
}

export function eliminate(ctx: Ctx, payload: unknown) {
  const { genre } = (payload ?? {}) as { genre?: unknown };
  const current = room(ctx);
  if (current.status !== 'KNOCKOUT') throw new Error('Not in knockout');
  const { done } = recordElimination(current, me(ctx), asGenre(genre), ctx.store);
  if (done) ctx.fx.startSwiping(current);
  else ctx.fx.broadcast(current);
  return {};
}

export function vote(ctx: Ctx, payload: unknown) {
  const raw = (payload ?? {}) as { cardId?: unknown; points?: unknown };
  const cardId = asCardId(raw.cardId);
  const points = Number(raw.points);
  const current = room(ctx);

  if (current.status !== 'SWIPING') throw new Error('Not swiping');
  if (!isValidVote(points)) throw new Error(`Invalid vote value: ${points}`);
  if (!current.deck.some((c) => c.id === cardId)) throw new Error(`Unknown card: ${cardId}`);

  recordVote(current, me(ctx), cardId, points, ctx.store);
  if (!ctx.fx.settleIfPossible(current, cardId)) ctx.fx.broadcast(current);
  return {};
}

/**
 * Take back the last card you voted on (R48).
 *
 * The deck is the one place in the app where a slip costs something you cannot
 * get back: a tremor, a neighbour knocking the phone, a thumb put down to
 * steady it. Only your own last vote, only while the room is still swiping, and
 * never once a winner has been declared -- undoing a vote that already locked a
 * match would unlock a room that has moved on.
 *
 * The card id goes back in the ack, so the deck can animate the right card
 * returning rather than guessing which one it was.
 */
export function undo(ctx: Ctx) {
  const current = room(ctx);
  if (current.status !== 'SWIPING') throw new Error('Not swiping');
  const cardId = undoVote(current, me(ctx), ctx.store);
  if (!cardId) throw new Error('Nothing to undo');
  ctx.fx.broadcast(current);
  return { cardId };
}

export function reject(ctx: Ctx) {
  const current = room(ctx);
  if (!rejectWinner(current, ctx.store)) throw new Error('No winner to reject');
  // The deck may already be finished for everyone, in which case the points
  // settle it again immediately on whatever is left standing.
  if (!ctx.fx.settleIfPossible(current, null)) ctx.fx.broadcast(current);
  return {};
}

/**
 * A socket went away.
 *
 * Refuses nothing and answers nothing: there is no ack, and nobody to tell off.
 * The person who just left may have been the only one the room was waiting on,
 * in either of the two phases that can wait (R87).
 */
export function disconnect(ctx: Ctx): void {
  const { roomId, userId } = ctx.session.data;
  if (!roomId || !userId) return;
  const current = ctx.store.leaveRoom(roomId, userId);
  if (!current) return;

  if (current.status === 'KNOCKOUT') {
    const { done } = knockoutMemberLeft(current, ctx.store);
    if (done) ctx.fx.startSwiping(current);
    else ctx.fx.broadcast(current);
    return;
  }
  if (current.status === 'SWIPING' && ctx.fx.settleIfPossible(current, null)) return;
  ctx.fx.broadcast(current);
}
