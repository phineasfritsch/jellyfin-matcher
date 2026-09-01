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
  winnerRequest: {
    by: string;
    title: string;
    /**
     * Whether Jellyseerr accepted it outright (status 2) or is holding it for a
     * human (status 1). R107: the app used to assert a gate it does not control.
     */
     approved: boolean;
  } | null;
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

/** Everything a restart must carry across (R149). */
export interface StoreSnapshot {
  version: 1;
  savedAt: number;
  userSeq: number;
  rooms: Record<string, Room>;
  /** Seat secrets, keyed exactly as in memory. Never merged into a Room. */
  secrets: Record<string, string>;
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

  /**
   * R112: which socket currently holds each seat.
   *
   * A disconnect used to act on whatever seat the dying socket remembered,
   * with no check that the seat still belonged to it. socket.io notices a
   * dropped connection only after its ping timeout -- up to about 45 seconds --
   * so a phone that switches from wifi to cellular reconnects and rejoins long
   * before the old socket is declared dead. That stale disconnect then evicted
   * a member who was sitting right there: deleting their LOBBY seat, or marking
   * a present swiper disconnected, which is the sole test of who can stall a
   * room, so it could settle without them.
   *
   * Kept off the Room for the same reason as the secrets: viewFor builds a
   * member's view by spreading the room, and this is not the room's business.
   */
  private seatSockets = new Map<string, string>();

  constructor(private now: () => number = Date.now) {}

  /**
   * R149: everything a restart must not lose.
   *
   * Room state is a Map, so replacing the process ends every night in progress
   * -- five phones mid-deck, no reconnect that survives it. That is why
   * auto-deploy has to refuse while anybody is playing (R147), and why a crash
   * at 9pm costs the evening rather than thirty seconds.
   *
   * The seat secrets come with it, deliberately and carefully. Without them a
   * restored room is a room nobody can rejoin: a rejoin is checked against the
   * secret (R86), so dropping them would turn every member into a stranger and
   * the restore would be theatre. They stay in their own map here exactly as
   * they do in memory -- `viewFor` spreads the room, so a secret on the room
   * object is a secret on every phone in it (R61).
   *
   * `seatSockets` is NOT included. Every socket id in it names a connection
   * that died with the process; restoring them would let a dead socket appear
   * to own a live seat, which is R112 pointing the wrong way.
   */
  snapshot(): StoreSnapshot {
    return {
      version: 1,
      savedAt: this.now(),
      userSeq: this.userSeq,
      rooms: Object.fromEntries(this.rooms),
      secrets: Object.fromEntries(this.secrets),
    };
  }

  /**
   * Put a snapshot back, dropping anything the TTL would already have reaped.
   *
   * Returns how many rooms were restored, and how many were dropped as stale,
   * because "restored 0 of 4" and "restored 0 of 0" are different mornings and
   * a boot log that cannot tell them apart is not worth printing.
   */
  restore(snap: StoreSnapshot): { restored: number; expired: number } {
    if (!snap || snap.version !== 1) return { restored: 0, expired: 0 };
    const now = this.now();
    let restored = 0;
    let expired = 0;

    for (const [code, room] of Object.entries(snap.rooms ?? {})) {
      /*
        R160: a room that is not a room is dropped, not thrown over.

        Everything below this line trusts the shape -- `room.lastActivity` in
        arithmetic, `room.users` in Object.values -- and a snapshot is a FILE.
        A null entry, or one written by a build with a different shape, made
        this throw. That rejection reached an uncaught `.then` chain in
        server/index.ts, so the process exited, the container restarted, read
        the same file and did it again: a boot loop, which is the exact outcome
        loadSnapshot's own comment says it would rather lose a night than cause.
      */
      if (!room || typeof room.lastActivity !== 'number' || typeof room.users !== 'object' || !room.users) {
        expired += 1;
        continue;
      }
      // The same TTL the sweeper uses. A night that ended three days ago must
      // not come back because the server happened to restart.
      if (now - room.lastActivity > ROOM_TTL_MS) {
        expired += 1;
        continue;
      }
      /*
        Everyone is disconnected until they prove otherwise. Their sockets died
        with the process, and a member marked connected with no socket behind
        them is exactly the stall R112 is about: the room would wait for
        somebody who cannot answer.
      */
      for (const user of Object.values(room.users)) user.connected = false;
      this.rooms.set(code, room);
      restored += 1;
    }

    for (const [key, secret] of Object.entries(snap.secrets ?? {})) {
      // Only for rooms that actually came back; a secret for a reaped room is
      // a credential with nothing to open.
      const code = key.split(':')[0];
      if (code && this.rooms.has(code)) this.secrets.set(key, secret);
    }

    // Ids are a global counter and a collision would hand a returning member
    // somebody else's seat.
    this.userSeq = Math.max(this.userSeq, snap.userSeq ?? 0);
    return { restored, expired };
  }

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

  /** Record that this socket now holds this seat, displacing any older one. */
  claimSeat(roomId: string, userId: string, socketId: string): void {
    this.seatSockets.set(this.seatKey(roomId.toUpperCase(), userId), socketId);
  }

  /**
   * Whether this socket still holds this seat.
   *
   * Unknown seats answer true: a room reaped by the TTL, or a socket from
   * before this map existed, must still be able to clean itself up (R112).
   */
  ownsSeat(roomId: string, userId: string, socketId: string): boolean {
    const held = this.seatSockets.get(this.seatKey(roomId.toUpperCase(), userId));
    return held === undefined || held === socketId;
  }

  private releaseSeat(roomId: string, userId: string): void {
    this.seatSockets.delete(this.seatKey(roomId.toUpperCase(), userId));
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
    for (const key of this.seatSockets.keys()) {
      if (key.startsWith(`${roomId}:`)) this.seatSockets.delete(key);
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
      this.releaseSeat(room.roomId, userId);
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
