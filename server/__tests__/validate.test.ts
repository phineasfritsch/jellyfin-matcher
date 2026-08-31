import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/source-scan';
import {
  asCardId,
  asGenre,
  asGenres,
  asName,
  asRoomId,
  asSettings,
  asUserId,
  DECK_SIZES,
  RUNTIME_STOPS,
} from '../validate';

/**
 * Everything here arrives over a websocket from a phone. The handlers used to
 * take their payloads at their TypeScript word -- a compile-time claim about a
 * runtime value -- and `isValidVote` was the only guard on the whole surface.
 */
describe('settings from a phone', () => {
  it('refuses a deck size nobody could have picked', () => {
    // The one that mattered: this spread straight into the room, and the next
    // deck build would try to assemble it against a metered ratings key.
    expect(() => asSettings({ deckLimit: 999_999 })).toThrow(/deck size/);
    expect(() => asSettings({ deckLimit: -1 })).toThrow(/deck size/);
    expect(() => asSettings({ deckLimit: '50; DROP' })).toThrow(/deck size/);
  });

  it('accepts every size the interface actually offers', () => {
    for (const n of DECK_SIZES) expect(asSettings({ deckLimit: n }).deckLimit).toBe(n);
  });

  it('refuses a runtime cap off the slider', () => {
    expect(() => asSettings({ maxRuntime: 1 })).toThrow(/runtime/);
    expect(() => asSettings({ maxRuntime: 99_999 })).toThrow(/runtime/);
  });

  it('accepts every stop on the slider, including no cap', () => {
    for (const v of RUNTIME_STOPS) expect(asSettings({ maxRuntime: v }).maxRuntime).toBe(v);
  });

  it('refuses a scope that is not one of the two', () => {
    expect(() => asSettings({ scope: 'everything' })).toThrow(/scope/);
  });

  it('drops unknown keys instead of failing, so an old phone still works', () => {
    expect(asSettings({ scope: 'wide', somethingNew: true })).toEqual({ scope: 'wide' });
  });

  it('refuses a payload that is not an object at all', () => {
    for (const bad of [null, 'wide', 42, undefined]) {
      expect(() => asSettings(bad)).toThrow(/settings/);
    }
  });
});

describe('identifiers from a phone', () => {
  it('accepts a real room code in any case', () => {
    expect(asRoomId('t8zw')).toBe('T8ZW');
  });

  it('refuses codes with the characters the alphabet deliberately excludes', () => {
    for (const bad of ['TOZW', 'T1ZW', 'TIZW', 'TLZW']) {
      expect(() => asRoomId(bad), bad).toThrow(/room code/);
    }
  });

  it('refuses anything that is not four characters', () => {
    for (const bad of ['', 'T8Z', 'T8ZWQ', '../../etc', 42, null]) {
      expect(() => asRoomId(bad)).toThrow(/room code/);
    }
  });

  it('refuses a user id the server did not issue', () => {
    expect(asUserId('u_12')).toBe('u_12');
    for (const bad of ['admin', 'u_', 'u_abc', '', null]) {
      expect(() => asUserId(bad)).toThrow(/user id/);
    }
  });

  it('bounds a card id rather than trusting its length', () => {
    expect(asCardId('tmdb-348')).toBe('tmdb-348');
    expect(() => asCardId('x'.repeat(500))).toThrow(/card/);
    expect(() => asCardId('')).toThrow(/card/);
  });
});

describe('names and genres from a phone', () => {
  it('falls back rather than failing on an empty name', () => {
    expect(asName('', 'Guest')).toBe('Guest');
    expect(asName('   ', 'Guest')).toBe('Guest');
    expect(asName(undefined, 'Host')).toBe('Host');
  });

  it('truncates a very long name instead of storing it', () => {
    expect(asName('x'.repeat(500), 'Guest')).toHaveLength(30);
  });

  it('refuses a name that is not text', () => {
    expect(() => asName({ toString: () => 'sneaky' }, 'Guest')).toThrow(/name/);
  });

  it('treats an empty pick list as an abstention, not a malformed payload', () => {
    expect(asGenres([])).toEqual([]);
  });

  it('bounds and de-duplicates a pick list', () => {
    expect(asGenres(['Horror', 'Horror', 'Sci-Fi'])).toEqual(['Horror', 'Sci-Fi']);
    expect(() => asGenres(Array.from({ length: 500 }, (_, i) => `g${i}`))).toThrow(/genre list/);
    expect(() => asGenres('Horror')).toThrow(/genre list/);
  });

  it('refuses a genre that is empty or absurdly long', () => {
    expect(() => asGenre('')).toThrow(/genre/);
    expect(() => asGenre('x'.repeat(200))).toThrow(/genre/);
  });
});

/**
 * The socket events are the API a browser depends on. Renaming one is
 * invisible to every other test in this suite and breaks every client, so the
 * names themselves are the contract.
 */
describe('the socket contract', () => {
  const server = readFileSync(join(ROOT, 'server', 'index.ts'), 'utf8');
  const hook = readFileSync(join(ROOT, 'src', 'ui', 'useRoom.ts'), 'utf8');
  const socket = readFileSync(join(ROOT, 'src', 'ui', 'socket.ts'), 'utf8');

  /** Collapse whitespace so a handler wrapped onto the next line still matches. */
  const flat = (src: string) => src.replace(/\s+/g, ' ').replace(/\(\s+/g, '(');

  const INBOUND = [
    'room:create',
    'room:join',
    'room:ready',
    'room:settings',
    'genres:list',
    'knockout:submit_genres',
    'knockout:eliminate',
    'swipe:vote',
    'swipe:undo',
    'winner:request',
    'winner:reject',
  ];
  const OUTBOUND = ['room:state', 'room:error', 'room:diagnosis', 'match:declared'];

  for (const event of INBOUND) {
    it(`server still handles "${event}"`, () => {
      // Whitespace-tolerant: some handlers wrap their arguments onto the next
      // line, and a contract test that depends on formatting is not a contract.
      expect(flat(server)).toContain(`socket.on('${event}'`);
    });
  }

  for (const event of OUTBOUND) {
    it(`server still emits "${event}"`, () => {
      expect(server).toContain(`'${event}'`);
    });
  }

  it('every event the client sends is one the server handles', () => {
    const client = `${hook}\n${socket}`;
    const sent = [...client.matchAll(/emitAck(?:<[^>]*>)?\('([^']+)'/g)].map((m) => m[1]!);
    expect(sent.length).toBeGreaterThan(5);
    for (const event of sent) expect(INBOUND, `client sends ${event}`).toContain(event);
  });

  it('every event the client listens for is one the server emits', () => {
    const listened = [...hook.matchAll(/socket\.on\('([^']+)'/g)]
      .map((m) => m[1]!)
      .filter((e) => e !== 'connect' && e !== 'disconnect');
    for (const event of listened) expect(OUTBOUND, `client listens for ${event}`).toContain(event);
  });
});

describe('shutting down', () => {
  const server = readFileSync(join(ROOT, 'server', 'index.ts'), 'utf8');

  it('handles SIGTERM at all, which it did not', () => {
    expect(server).toContain("process.on(signal");
    expect(server).toContain('SIGTERM');
  });

  it('tells the rooms before it goes, rather than dropping every socket silently', () => {
    expect(server).toMatch(/The server is restarting/);
  });
});
