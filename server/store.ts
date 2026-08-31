import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { KnockoutState } from '../src/lib/knockout';
import { createKnockout } from '../src/lib/knockout';
import type { FallbackResult, Votes } from '../src/lib/match';
import type { MovieCandidate } from '../src/lib/types';

export type RoomStatus = 'LOBBY' | 'KNOCKOUT' | 'SWIPING' | 'FINISHED';

export interface RoomUser {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  /**
   * Whether this member signed in with a Jellyfin account. Shown in the lobby
   * so the host knows who is in the room before reading the code aloud, and
   * carried onto a request so an approval can name who asked (R44). Not a
   * permission -- a guest may do everything a member may do.
   */
  authed: boolean;
}

export interface RoomSettings {
  scope: 'local' | 'wide';
  maxRuntime: number | null;
  deckLimit: number;
}

export interface Room {
  roomId: string;
  status: RoomStatus;
  settings: RoomSettings;
  lockedGenres: string[];
  users: Record<string, RoomUser>;
  knockout: KnockoutState;
  deck: MovieCandidate[];
  /** Index of the next card each user swipes. */
  progress: Record<string, number>;
  votes: Votes;
  /**
   * Cards the room looked at, locked in, and then rejected. They stay out of
   * every later settlement so "not this one" cannot hand back the same film
   * (R63).
   */
  rejected: string[];
  winner: string | null;
  /**
   * R90: how the night ended, on the room rather than only in the event that
   * announced it.
   *
   * viaFallback, the ranking and the play URL used to exist only inside the
   * transient `match:declared` emit. Nothing replayed them on rejoin, so any
   * reload on the winner screen recomputed `held` as false and the payoff
   * screen misreported the night: "Not on your server", a cost line saying
   * nothing had been downloaded, a points winner described as "Everyone said
   * yes", no ranking, and a Play link replaced by a Jellyseerr request the
   * server then refused with "Already in the library".
   */
  winnerViaFallback: boolean;
  winnerRanking: FallbackResult[] | null;
  /** Needs the server's Jellyfin base URL, so it cannot be derived on a phone. */
  winnerPlayUrl: string | null;
  /**
   * R99: the Jellyseerr request, once it has been made.
   *
   * On the room rather than in a component, for two reasons. It is the one
   * control in this app that spends the host's disk, so a second press must be
   * refused by the server and not merely by a disabled button -- nothing did,
   * and the client gives up on its ack before the server gives up on
   * Jellyseerr, so "Request failed" was routinely shown for a request that
   * then succeeded, with the button put straight back. And every phone in the
   * room should be able to see it was asked for, including one that reloads.
   */
  winnerRequest: { by: string; title: string } | null;
  createdAt: number;
  lastActivity: number;
}

/** No O/0, I/1/L — codes are read aloud across the couch. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
/** Rooms die after 2h idle. */
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const DEFAULT_SETTINGS: RoomSettings = {
  scope: 'local',
  maxRuntime: null,
  deckLimit: 50,
};

/** A seat in a room: who you are, and the proof that you are them (R86). */
export interface Seat {
  room: Room;
  userId: string;
  /** Never put this on the Room. See RoomStore.secrets. */
  secret: string;
}

/** Constant-time compare that does not leak length through an early return. */
function sameSecret(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class RoomStore {
  private rooms = new Map<string, Room>();
  private userSeq = 0;

  /**
   * R86: the secret that proves you are the member you say you are.
   *
   * Reconnecting used to need only a room code and a user id. Ids are a global
   * counter -- u_1, u_2 -- and codes are four characters, so anyone who could
   * reach the socket could take a seat in somebody else's room: receive that
   * member's private view, and act as them for ready, genre picks,
   * eliminations, votes, undo and rejecting the winner. It defeated the one
   * mitigation the README offers for putting Matcher on a public hostname.
   *
   * Deliberately NOT a field on RoomUser. `viewFor` builds a member's view by
   * spreading the room, and R61 is the ruling that a promise the client merely
   * declines to render is not a promise: a secret on the room object is a
   * secret on every phone in the room. Keeping it in a map the room graph does
   * not reference makes leaking it require new code rather than forgetting
   * old code.
   */
  private secrets = new Map<string, string>();

  constructor(private now: () => number = Date.now) {}

  /** Live room count, for /healthz. Read-only; safe to poll from anywhere. */
  roomCount(): number {
    return this.rooms.size;
  }

  private generateCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private newUserId(): string {
    return `u_${++this.userSeq}`;
  }

  private seatKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  /** Issues and records a seat secret. 32 bytes: not guessable, not enumerable. */
  private issueSecret(roomId: string, userId: string): string {
    const secret = randomBytes(32).toString('hex');
    this.secrets.set(this.seatKey(roomId, userId), secret);
    return secret;
  }

  private forgetSecrets(roomId: string): void {
    for (const key of this.secrets.keys()) {
      if (key.startsWith(`${roomId}:`)) this.secrets.delete(key);
    }
  }

  createRoom(hostName: string, authed = false): Seat {
    const userId = this.newUserId();
    const room: Room = {
      roomId: this.generateCode(),
      status: 'LOBBY',
      settings: { ...DEFAULT_SETTINGS },
      lockedGenres: [],
      users: { [userId]: { id: userId, name: hostName, ready: false, connected: true, authed } },
      knockout: createKnockout(),
      deck: [],
      progress: {},
      votes: {},
      rejected: [],
      winner: null,
      winnerViaFallback: false,
      winnerRanking: null,
      winnerPlayUrl: null,
      winnerRequest: null,
      createdAt: this.now(),
      lastActivity: this.now(),
    };
    this.rooms.set(room.roomId, room);
    return { room, userId, secret: this.issueSecret(room.roomId, userId) };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  /** Members may only join in the lobby — mid-game joins would corrupt votes. */
  joinRoom(roomId: string, name: string, authed = false): Seat {
    const room = this.requireRoom(roomId);
    if (room.status !== 'LOBBY') {
      throw new Error(`Room ${room.roomId} already started`);
    }
    const userId = this.newUserId();
    room.users[userId] = { id: userId, name, ready: false, connected: true, authed };
    this.touch(room);
    return { room, userId, secret: this.issueSecret(room.roomId, userId) };
  }

  leaveRoom(roomId: string, userId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;
    if (room.status === 'LOBBY') {
      delete room.users[userId];
      this.secrets.delete(this.seatKey(room.roomId, userId));
    } else {
      const user = room.users[userId];
      if (user) user.connected = false; // mid-game: keep votes, allow reconnect
    }
    if (Object.keys(room.users).length === 0) {
      this.forgetSecrets(room.roomId);
      this.rooms.delete(room.roomId);
      return undefined;
    }
    this.touch(room);
    return room;
  }

  /**
   * Returning to a seat you already hold. Requires the secret issued when the
   * seat was taken (R86); without it this was the way into anyone's room.
   *
   * The failure is deliberately one message for both causes. Telling a caller
   * that the id exists but the secret is wrong confirms which member ids are
   * real, which is the enumeration this is meant to close.
   */
  reconnect(roomId: string, userId: string, secret: string): Room {
    const room = this.requireRoom(roomId);
    const user = room.users[userId];
    const expected = this.secrets.get(this.seatKey(room.roomId, userId));
    if (!user || !expected || !sameSecret(expected, secret)) {
      throw new Error('That seat is not yours to take. Join the room again.');
    }
    user.connected = true;
    this.touch(room);
    return room;
  }

  setReady(roomId: string, userId: string, ready: boolean): Room {
    const room = this.requireRoom(roomId);
    const user = room.users[userId];
    if (!user) throw new Error(`Unknown user ${userId} in room ${room.roomId}`);
    user.ready = ready;
    this.touch(room);
    return room;
  }

  updateSettings(roomId: string, settings: Partial<RoomSettings>): Room {
    const room = this.requireRoom(roomId);
    /*
      Locked once the deck exists, not once the lobby closes (R70).
  
      A thin deck tells the room "the host can raise the runtime cap" -- and
      `updateSettings` then threw `Settings are locked after the lobby`, so the
      diagnosis named a control the app forbade. Genre picking happens before
      anything is built, so the cap and the deck size can still move; once
      there are cards, changing the rules under people mid-swipe would be worse
      than the thin deck.
    */
    if (room.status !== 'LOBBY' && room.status !== 'KNOCKOUT') {
      throw new Error('Settings are locked once the deck is built');
    }
    room.settings = { ...room.settings, ...settings };
    this.touch(room);
    return room;
  }

  allReady(room: Room): boolean {
    const users = Object.values(room.users);
    return users.length >= 2 && users.every((u) => u.ready);
  }

  touch(room: Room): void {
    room.lastActivity = this.now();
  }

  /** Drop rooms idle past the TTL. Returns removed room ids. */
  cleanupStale(ttlMs: number = ROOM_TTL_MS): string[] {
    const removed: string[] = [];
    for (const [id, room] of this.rooms) {
      if (this.now() - room.lastActivity > ttlMs) {
        this.forgetSecrets(id);
        this.rooms.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  private requireRoom(roomId: string): Room {
    const room = this.getRoom(roomId);
    if (!room) throw new Error(`Room ${roomId.toUpperCase()} not found`);
    return room;
  }
}
