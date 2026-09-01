import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/source-scan';
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
    // R111: a token can arrive on a live socket, so signing in mid-session no
    // longer needs a reconnect that the server reads as the member leaving.
    'auth:token',
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

describe('no socket event can take the process down', () => {
  /*
    R162. Every inbound event goes through `wrap`, which turns a throw into a
    refusal on the ack (R93 consolidated eleven copies of that decision into
    one). `disconnect` was the exception, and not by judgement: it has no ack to
    refuse to, so there was nothing for the wrapper to do and it was left bare.

    A throw in a socket.io callback is an uncaught exception. It ends the
    PROCESS -- every room on the server, over one dropped connection, at the
    moment a phone leaves. Which is a thing phones do constantly.

    Asserted as text because this lives in server/index.ts, which has no unit
    harness; the file above already reads itself this way for the same reason.
    What it checks is that the call is inside a try, not that the try is
    correct -- and that is the whole difference between crashing and not.
  */
  const server = readFileSync(join(ROOT, 'server', 'index.ts'), 'utf8');
  const flat = (src: string) => src.replace(/\s+/g, ' ');

  it('guards the disconnect handler, which has no ack to refuse to', () => {
    const body = flat(server);
    expect(
      body,
      'handlers.disconnect is called without a try; one throw ends every room on this server',
    ).toMatch(/try\s*\{\s*handlers\.disconnect\(ctx\);\s*\}\s*catch/);
  });

  it('guards the timers that walk the store', () => {
    /*
      A setInterval callback is a callback: the same rule that made `disconnect`
      fatal applies to the idle sweep and the snapshot. The sweep walks every
      room in the store and runs whether or not anybody is playing, so it is the
      timer most likely to meet something it did not expect.

      A sweep that fails is a room reaped late. A sweep that throws is every
      room gone at once.
    */
    const body = flat(server);
    expect(
      body,
      'the idle sweep can throw out of its timer, which ends the process',
    ).toMatch(/try \{ for \(const id of store\.cleanupStale\(\)\)/);
    expect(
      body,
      'store.snapshot() runs synchronously in a timer and can throw out of it',
    ).toMatch(/try \{ if \(store\.roomCount\(\) > 0\)/);
  });

  it('still calls it, so the guard did not become a way of skipping the work', () => {
    // The lazy fix for "this might throw" is to stop calling it. R112's seat
    // release lives in there.
    expect(server).toContain('handlers.disconnect(ctx)');
  });
});

describe('the two validators nothing had ever called (R168)', () => {
  /*
    Found by listing every exported function no test file so much as names.
    Two came back, and both live in the module whose job is refusing what a
    phone sends.
  */
  it('takes a seat secret only in the exact shape it issues (R86)', () => {
    const good = 'a'.repeat(64);
    expect(asSecret(good)).toBe(good);
  });

  it('refuses anything else offered as a secret', () => {
    /*
      R86: a four-character room code is an invitation and the secret is the
      credential. Every one of these is a plausible attempt -- an uppercase
      copy-paste, a truncated value, a number, a missing field -- and each must
      be refused rather than coerced into something that then gets compared.
    */
    for (const bad of [
      'A'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
      'g'.repeat(64),
      `${'a'.repeat(63)} `,
      '',
      null,
      undefined,
      12345,
      ['a'.repeat(64)],
      { secret: 'a'.repeat(64) },
    ]) {
      expect(() => asSecret(bad), `${JSON.stringify(bad)} was accepted as a seat secret`).toThrow();
    }
  });

  it('takes a boolean and refuses a word that looks like one', () => {
    /*
      This was `Boolean(value)`. `Boolean('false')` is true, so a client that
      stringified its payload marked itself ready by sending the word "false" --
      and the lobby then waited for nobody while telling everybody it was
      waiting. Every other validator in the file refuses rather than guesses.
    */
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
    for (const bad of ['false', 'true', 0, 1, '', null, undefined, {}, []]) {
      expect(() => asBoolean(bad), `${JSON.stringify(bad)} was coerced into a boolean`).toThrow();
    }
  });
});
