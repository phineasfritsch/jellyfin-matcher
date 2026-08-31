import { randomInt } from 'node:crypto';
import type { KnockoutState } from '../src/lib/knockout';
import { createKnockout } from '../src/lib/knockout';
import type { Votes } from '../src/lib/match';
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

export class RoomStore {
  private rooms = new Map<string, Room>();
  private userSeq = 0;

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

  createRoom(hostName: string, authed = false): { room: Room; userId: string } {
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
      createdAt: this.now(),
      lastActivity: this.now(),
    };
    this.rooms.set(room.roomId, room);
    return { room, userId };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  /** Members may only join in the lobby — mid-game joins would corrupt votes. */
  joinRoom(roomId: string, name: string, authed = false): { room: Room; userId: string } {
    const room = this.requireRoom(roomId);
    if (room.status !== 'LOBBY') {
      throw new Error(`Room ${room.roomId} already started`);
    }
    const userId = this.newUserId();
    room.users[userId] = { id: userId, name, ready: false, connected: true, authed };
    this.touch(room);
    return { room, userId };
  }

  leaveRoom(roomId: string, userId: string): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;
    if (room.status === 'LOBBY') {
      delete room.users[userId];
    } else {
      const user = room.users[userId];
      if (user) user.connected = false; // mid-game: keep votes, allow reconnect
    }
    if (Object.keys(room.users).length === 0) {
      this.rooms.delete(room.roomId);
      return undefined;
    }
    this.touch(room);
    return room;
  }

  reconnect(roomId: string, userId: string): Room {
    const room = this.requireRoom(roomId);
    const user = room.users[userId];
    if (!user) throw new Error(`Unknown user ${userId} in room ${room.roomId}`);
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
