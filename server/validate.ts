/**
 * Everything arriving from a phone is untrusted.
 *
 * The socket handlers took their payloads at their TypeScript word --
 * `{ genres }: { genres: string[] }` is a compile-time claim about a value
 * that arrived over a websocket, and `isValidVote` was the only runtime guard
 * in the whole surface. The sharpest example was `room:settings`, which
 * spread a `Partial<RoomSettings>` straight into the room: a phone could send
 * `{ deckLimit: 999999 }` and the next deck build would try to assemble it,
 * against somebody's metered ratings key (R75).
 *
 * These are deliberately boring. Each takes `unknown`, returns a value the
 * rest of the server can rely on, and throws a message safe to show a room.
 */
import type { RoomSettings } from './store';

/** Runtime caps offered by the UI. Anything else is not a runtime cap. */
export const RUNTIME_STOPS: Array<number | null> = [90, 100, 110, 120, 135, 150, 180, null];
/** Deck sizes offered by the UI. */
export const DECK_SIZES = [25, 50, 75];

const NAME_MAX = 30;
const GENRE_MAX = 60;
/** Nobody picks more genres than a library has; this is an upper bound, not a rule. */
const GENRES_MAX = 60;
const CARD_ID_MAX = 128;

function fail(what: string): never {
  throw new Error(`Invalid ${what}`);
}

/** A display name. Empty becomes the fallback rather than an error. */
export function asName(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value !== 'string') fail('name');
  const trimmed = value.trim().slice(0, NAME_MAX);
  return trimmed.length > 0 ? trimmed : fallback;
}

/** A room code. Four characters from the unambiguous alphabet, case-insensitive. */
export function asRoomId(value: unknown): string {
  if (typeof value !== 'string') fail('room code');
  const code = value.trim().toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code)) fail('room code');
  return code;
}

/** A user id the server issued. */
export function asUserId(value: unknown): string {
  if (typeof value !== 'string' || !/^u_\d{1,10}$/.test(value)) fail('user id');
  return value;
}

/** One genre name. */
export function asGenre(value: unknown): string {
  if (typeof value !== 'string') fail('genre');
  const genre = value.trim();
  if (genre.length === 0 || genre.length > GENRE_MAX) fail('genre');
  return genre;
}

/**
 * A set of genre picks. An empty array is legal and meaningful: it is an
 * abstention (R62), not a malformed payload.
 */
export function asGenres(value: unknown): string[] {
  if (!Array.isArray(value)) fail('genre list');
  if (value.length > GENRES_MAX) fail('genre list');
  return [...new Set(value.map(asGenre))];
}

/** A deck card id. */
export function asCardId(value: unknown): string {
  if (typeof value !== 'string') fail('card');
  const id = value.trim();
  if (id.length === 0 || id.length > CARD_ID_MAX) fail('card');
  return id;
}

/**
 * A settings patch, reduced to the choices the UI actually offers.
 *
 * Unknown keys are dropped rather than rejected, so an older phone talking to
 * a newer server does not fail outright; the values themselves must be ones a
 * person could have picked.
 */
export function asSettings(value: unknown): Partial<RoomSettings> {
  if (typeof value !== 'object' || value === null) fail('settings');
  const input = value as Record<string, unknown>;
  const out: Partial<RoomSettings> = {};

  if ('scope' in input) {
    if (input.scope !== 'local' && input.scope !== 'wide') fail('scope');
    out.scope = input.scope;
  }
  if ('maxRuntime' in input) {
    const runtime = input.maxRuntime === null ? null : Number(input.maxRuntime);
    if (!RUNTIME_STOPS.includes(runtime)) fail('runtime cap');
    out.maxRuntime = runtime;
  }
  if ('deckLimit' in input) {
    const limit = Number(input.deckLimit);
    if (!DECK_SIZES.includes(limit)) fail('deck size');
    out.deckLimit = limit;
  }
  return out;
}

/** A ready flag. Anything truthy is a yes; this one really is just a boolean. */
export function asBoolean(value: unknown): boolean {
  return Boolean(value);
}
