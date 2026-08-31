// @vitest-environment jsdom
/**
 * The behaviour behind pins that a pin cannot see.
 *
 * A pin is a grep. It proves a symbol is still written down somewhere in the
 * app, which is exactly the right guard for a sentence, a token or an aria
 * label -- and no guard at all for a claim about *where* a line sits, *what* a
 * function returns, or *which* payload a value ends up in.
 *
 * R129 measured that gap: an eight-agent audit reintroduced the historical
 * defect behind every claim the suite makes, and 49 of 97 mutations were
 * invisible. Twelve of those lived in pins.test.ts, and the ones that could not
 * be fixed by tightening the pinned string are here instead, each named for the
 * pin it stands behind and each verified by re-running the exact mutation that
 * used to pass.
 *
 * Rules for this file, which are R125's rules:
 *   - Every case says which mutation it was run against. A guard nobody has
 *     made fail is a guard nobody has checked.
 *   - Every case says what it does NOT cover. Three of these are proxies for a
 *     browser-only failure and one is a static scan; claiming more than that is
 *     how a suite becomes decorative.
 *   - Nothing here duplicates a check that already exists elsewhere. Where the
 *     real guard turned out to be another file, the pin's `why` names that file
 *     and this one stays out of it.
 */
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appSources } from '../../../scripts/lib/source-scan';
import { defaultConfig as jellyfinConfig } from '../../lib/jellyfin';
import { defaultConfig as jellyseerrConfig } from '../../lib/jellyseerr';
import { defaultConfig as mdblistConfig } from '../../lib/mdblist';
import { authenticateWithJellyfin } from '../../../server/auth';
import { MovieDetails } from '../components/MovieDetails';
import { WinnerScreen } from '../components/WinnerScreen';
import type { MovieCandidate } from '../../lib/types';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/*
  Explicit, because auto-cleanup only registers when vitest runs with globals
  enabled and this suite does not. Without it every render is still in the
  document while the next one asserts against it.
*/
afterEach(cleanup);

/* ------------------------------------------------------------------ *
 * T14 -- the winner screen takes focus (R52)
 * ------------------------------------------------------------------ */

function movie(overrides: Partial<ClientRoom['deck'][number]> = {}) {
  return {
    id: 'tmdb-1',
    tmdbId: 1,
    imdbId: null,
    title: 'The Odyssey',
    year: 2026,
    runtime: 173,
    posterUrl: null,
    genres: ['Action'],
    isHybrid: false,
    jellyfinItemId: null,
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: null, rt: null, composite: 80 },
    ...overrides,
  } as ClientRoom['deck'][number];
}

function finishedRoom(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'FINISHED',
    settings: { scope: 'wide', maxRuntime: null, deckLimit: 50 },
    lockedGenres: ['Action', 'Adventure'],
    users: { u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: true } },
    knockout: { phase: 'DONE', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
    deck: [movie()],
    progress: { u_1: 1 },
    votes: {},
    winner: 'tmdb-1',
    winnerViaFallback: false,
    winnerRanking: null,
    winnerPlayUrl: null,
    winnerRequest: null,
    rejected: [],
    othersFinished: 0,
    submittedCount: 1,
    votedCount: 1,
    deckExhausted: true,
    ...overrides,
  } as ClientRoom;
}

function hookWith(room: ClientRoom): RoomHook {
  return {
    room,
    userId: 'u_1',
    match: null,
    diagnosis: null,
    clearDiagnosis: () => {},
    error: null,
    connecting: false,
    join: async () => {},
    setReady: async () => {},
    updateSettings: async () => {},
    listGenres: async () => [],
    submitGenres: async () => {},
    eliminate: async () => {},
    undoVote: async () => {},
    rejectWinner: async () => {},
    vote: async () => {},
  } as unknown as RoomHook;
}

describe('T14: the winner screen takes focus', () => {
  it('puts focus on the title that reads the whole result', () => {
    /*
      R52. This screen replaces the deck outright, and nothing announced that:
      a screen reader user's next Tab landed somewhere unrelated and the session
      had silently ended.

      Pin T14 finds `heading.current?.focus()`, which proves the call site is
      written and nothing about whether the ref reaches an element. Mutation
      run: delete `ref={heading}` from the <h1>. The pin stays green -- the call
      is still there, focusing null -- and this goes red.
    */
    render(createElement(WinnerScreen, { roomHook: hookWith(finishedRoom()), match: null }));

    const active = document.activeElement;
    expect(active, 'focus stayed on <body>: nothing announced the result').not.toBe(document.body);
    expect(active?.tagName).toBe('H1');
    expect(active?.textContent).toBe('The Odyssey');
  });

  it('moves focus again when the room lands on a different film', () => {
    /*
      The effect is keyed on room.winner, because rejecting a winner declares
      the next one into the same screen (R63/R100) -- a second silent
      replacement if focus does not follow it.
    */
    const first = render(
      createElement(WinnerScreen, { roomHook: hookWith(finishedRoom()), match: null }),
    );
    document.body.focus();

    const next = finishedRoom({
      deck: [movie({ id: 'tmdb-2', title: 'Solaris' })],
      winner: 'tmdb-2',
    });
    first.rerender(createElement(WinnerScreen, { roomHook: hookWith(next), match: null }));

    expect(document.activeElement?.textContent).toBe('Solaris');
  });
});

/* ------------------------------------------------------------------ *
 * T68 / T16 -- the details sheet remembers its opener once (R83)
 * ------------------------------------------------------------------ */

function card(overrides: Partial<MovieCandidate> = {}): MovieCandidate {
  return {
    id: 'm1',
    tmdbId: 1,
    imdbId: 'tt1',
    title: 'The Thing',
    year: 1982,
    runtime: 109,
    posterUrl: null,
    genres: ['Horror'],
    isHybrid: false,
    jellyfinItemId: 'jf-1',
    description: 'A crew in Antarctica meets something that imitates them.',
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: null, rt: null, composite: null },
    ...overrides,
  } as unknown as MovieCandidate;
}

/** The control that opens the sheet, as the deck has it. */
function opener(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'Details';
  document.body.appendChild(button);
  button.focus();
  return button;
}

describe('T68/T16: the details sheet captures its opener once, on mount', () => {
  it('does not hand focus back while it is still open', () => {
    /*
      R83, and the one half of it a DOM test can reach.

      The capture used to live in the focus-trap effect, which depends on
      `onClose` -- an inline arrow from the deck, so a new identity on every
      parent render. That effect therefore tore down and set up again on every
      render of the deck, and its teardown is what hands focus back. So the
      opener was re-focused, and document.activeElement re-read, in the middle
      of a sheet that had not closed; in a real browser the sheet ended up
      recorded as its own opener and focus fell to <body> on Escape.

      Mutation run: move `openerRef.current = document.activeElement` and the
      `return () => openerRef.current?.focus?.()` out of the empty-dependency
      effect and into the `[onClose, mounted]` one -- the shape of a4dfbc9^,
      written with today's names. Pins T68 and T16 both stay green: each finds
      its line, and neither can see which dependency array the line sits in.
      details.render.test.tsx also stays green, and says so in its own comment:
      jsdom's teardown focuses the opener just before the setup re-reads it, so
      the end state self-corrects there.

      What this case watches instead is the handback itself, which is not a
      state but an event: the opener must be focused exactly once, when the
      sheet goes away. Under the mutation it is focused on every parent render
      while the sheet is still on screen.

      What it does not cover: the browser-only consequence -- focus landing on
      <body> after Escape. That is still guarded only by the behavioural check
      in scripts/screenshots.ts, and this does not replace it.
    */
    const button = opener();
    const focused = vi.spyOn(button, 'focus');

    const view = render(createElement(MovieDetails, { card: card(), onClose: () => {} }));
    expect(focused, 'the opener was re-focused during the sheet’s own mount').not.toHaveBeenCalled();

    // A deck that re-renders: a vote elsewhere, a room broadcast, a new
    // inline onClose. The sheet is still open throughout.
    view.rerender(createElement(MovieDetails, { card: card(), onClose: () => {} }));
    view.rerender(createElement(MovieDetails, { card: card(), onClose: () => {} }));
    expect(
      focused,
      'the sheet handed focus back to its opener while it was still open, which means the ' +
        'capture is re-running: it is inside the onClose-dependent effect, not the mount one (R83)',
    ).not.toHaveBeenCalled();

    view.unmount();
    expect(focused, 'closing did not hand focus back at all').toHaveBeenCalledTimes(1);
  });

  /*
    Deliberately only one case here. The obvious second one -- move focus into
    the sheet, re-render, and check the opener is still remembered -- was
    written, run against the mutation, and stayed green: jsdom's teardown
    focuses the opener a moment before the setup re-reads it, so the state
    self-corrects. It is already covered as an end state by
    details.render.test.tsx, and a case that cannot fail for the reason it names
    is the thing this file exists to stop.
  */
});

/* ------------------------------------------------------------------ *
 * B03 -- no response payload can carry a secret
 * ------------------------------------------------------------------ */

const SOURCES = appSources();

/**
 * The secret environment variables this app reads, found rather than listed.
 *
 * A hardcoded list goes stale the day somebody adds a fourth upstream, and a
 * stale list is worse than none because the test still passes.
 */
const SECRET_ENVS = (() => {
  const found = new Set<string>();
  for (const file of SOURCES) {
    for (const m of file.code.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (/(?:_KEY|_TOKEN|_SECRET|_PASSWORD)$/.test(m[1]!)) found.add(m[1]!);
    }
  }
  return [...found].sort();
})();

/** The text between a call's parentheses, starting at the index of the `(`. */
function argsAt(code: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < code.length; i++) {
    const c = code[i]!;
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1);
}

/**
 * Everything that puts bytes on a wire out of this process.
 *
 * express responses, socket.io emits, and the ack a socket handler answers
 * with. Headers too: a key in a header leaves the house exactly as thoroughly
 * as a key in a body.
 */
const SINKS: RegExp[] = [
  /\bres\s*\.\s*(?:json|jsonp|send|end|write|setHeader)\s*\(/g,
  /\bres\s*\.\s*status\s*\([^()]*\)\s*\.\s*(?:json|send|end)\s*\(/g,
  /\.\s*emit\s*\(/g,
  /\back\s*\?\.\s*\(/g,
];

type Site = { path: string; payload: string };

function payloadSites(code: string, path = 'inline'): Site[] {
  const sites: Site[] = [];
  for (const sink of SINKS) {
    for (const m of code.matchAll(sink)) {
      const open = m.index! + m[0].length - 1;
      sites.push({ path, payload: argsAt(code, open) });
    }
  }
  return sites;
}

/**
 * The name of the call a position sits inside, or null at the top level.
 *
 * `Boolean(process.env.JELLYFIN_API_KEY)` is the whole distinction this scan
 * turns on: /healthz says WHETHER each upstream is configured, and a payload
 * may always say that. What it may never do is say what the key IS.
 */
function enclosingCall(text: string, at: number): string | null {
  let depth = 0;
  for (let i = at - 1; i >= 0; i -= 1) {
    const c = text[i];
    if (c === ')') depth += 1;
    else if (c === '(') {
      if (depth === 0) return /([A-Za-z_$][\w$]*)\s*$/.exec(text.slice(0, i))?.[1] ?? '';
      depth -= 1;
    }
  }
  return null;
}

function leaksIn(code: string, path = 'inline'): string[] {
  const leaks: string[] = [];
  for (const site of payloadSites(code, path)) {
    for (const env of SECRET_ENVS) {
      let at = site.payload.indexOf(env);
      while (at !== -1) {
        if (enclosingCall(site.payload, at) !== 'Boolean') {
          leaks.push(`${site.path}: ${env} in ${site.payload.slice(0, 60).replace(/\s+/g, ' ')}`);
        }
        at = site.payload.indexOf(env, at + 1);
      }
    }
  }
  return leaks;
}

describe('B03: the admin API key never reaches a client', () => {
  /*
    R129, and the most expensive of the twelve hollow pins.

    B03's find is `apiKey: process.env.JELLYFIN_API_KEY`, which proves the key
    is read in one place. It cannot express "and nowhere that reaches a client",
    which is the entire claim -- and the README repeats it (D04). Mutation run:
    add `jellyfinKey: process.env.JELLYFIN_API_KEY` to the /healthz body in
    server/index.ts, an endpoint any guest on the LAN can curl. Every pin stayed
    green.

    Two checks, because the claim has two halves. Both are static: nothing here
    boots the server, and a leak assembled at runtime out of parts (a key put on
    a room, then broadcast) is not visible to either. viewFor's redaction is
    what guards that half, in roomView.test.ts and seat.test.ts.
  */
  it('reads exactly the secrets this app is known to have', () => {
    // If discovery collapses, every case below is vacuously green.
    expect(SECRET_ENVS).toContain('JELLYFIN_API_KEY');
    expect(SECRET_ENVS).toContain('JELLYSEERR_API_KEY');
    expect(SECRET_ENVS).toContain('MDBLIST_API_KEY');
  });

  it('still finds the payloads it is scanning', () => {
    // Same reason. A scanner whose regexes stop matching reports no leaks.
    const sites = SOURCES.flatMap((f) => payloadSites(f.code, f.path));
    expect(sites.length, 'no response payloads found at all').toBeGreaterThanOrEqual(20);
    expect(
      sites.some((s) => s.path === 'server/index.ts' && s.payload.includes('uptimeSec')),
      'the /healthz body is not among the payloads being scanned',
    ).toBe(true);
    expect(
      SOURCES.flatMap((f) => payloadSites(f.code, f.path)).some((s) =>
        SECRET_ENVS.some((env) => s.payload.includes(env)),
      ),
      'no payload mentions a secret at all, so the Boolean() carve-out is never exercised ' +
        'and this scan proves less than it looks like it does',
    ).toBe(true);
  });

  it('catches a key put into a response body', () => {
    // The exact mutation from the audit, run against the scanner itself so the
    // check cannot quietly stop working while the app happens to be clean.
    const planted =
      "app.get('/healthz', async (_req, res) => res.json({ ok: true, " +
      'jellyfinKey: process.env.JELLYFIN_API_KEY }));';
    expect(leaksIn(planted, 'planted')).toHaveLength(1);

    const header = "res.setHeader('X-Upstream-Key', process.env.MDBLIST_API_KEY ?? '');";
    expect(leaksIn(header, 'planted')).toHaveLength(1);

    const emitted = "io.to(room.roomId).emit('room:debug', { key: process.env.JELLYSEERR_API_KEY });";
    expect(leaksIn(emitted, 'planted')).toHaveLength(1);

    // And does not cry wolf over the one form that is allowed: whether a key is
    // set is the host's own question, answered on /healthz today.
    const allowed = 'res.json({ upstreams: { jellyfin: Boolean(process.env.JELLYFIN_API_KEY) } });';
    expect(leaksIn(allowed, 'planted')).toHaveLength(0);
  });

  it('puts no secret in any response body, header, emit or ack', () => {
    const leaks = SOURCES.flatMap((f) => leaksIn(f.code, f.path));
    expect(
      leaks,
      'a response payload can carry an API key. A payload may say WHETHER a key is set -- ' +
        'Boolean(process.env.X) -- and never what it is.',
    ).toEqual([]);
  });
});

describe('B03: the admin API key is read server-side only', () => {
  /*
    The other half of B03's sentence, which no pin can express either: a secret
    read from a module the browser bundle can reach is a secret in the bundle,
    however carefully the component declines to render it.

    `'use client'` is the bundling boundary, so the rule is stated against it:
    nothing reachable from a client component may read a secret. Mutation run:
    import defaultConfig from src/lib/jellyfin into a 'use client' component and
    read cfg.apiKey. Nothing else in the suite moved; this goes red.

    Relative imports only. A package that read process.env.JELLYFIN_API_KEY
    would not be found by this, and would be a different problem.
  */
  const byPath = new Map(SOURCES.map((f) => [f.path, f]));

  function resolve(from: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;
    const dir = from.split('/').slice(0, -1);
    for (const part of spec.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') dir.pop();
      else dir.push(part);
    }
    const base = dir.join('/');
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (byPath.has(candidate)) return candidate;
    }
    return null;
  }

  /** Every module the browser bundle can reach from a client component. */
  const clientReachable = (() => {
    const seen = new Set<string>();
    const queue = SOURCES.filter((f) => /^\s*['"]use client['"]/m.test(f.code)).map((f) => f.path);
    while (queue.length > 0) {
      const path = queue.pop()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const file = byPath.get(path);
      if (!file) continue;
      for (const m of file.code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const next = resolve(path, m[1]!);
        if (next && !seen.has(next)) queue.push(next);
      }
    }
    return seen;
  })();

  it('finds the client bundle it is reasoning about', () => {
    // Vacuity again: an empty set passes the case below without looking.
    expect(clientReachable.has('src/ui/components/WinnerScreen.tsx')).toBe(true);
    expect(clientReachable.has('src/ui/useRoom.ts')).toBe(true);
    expect(clientReachable.size).toBeGreaterThanOrEqual(10);
  });

  it('lets no module the browser can reach read a secret', () => {
    const offenders = [...clientReachable]
      .map((path) => byPath.get(path))
      .filter((f) => f && SECRET_ENVS.some((env) => f.code.includes(env)))
      .map((f) => f!.path);
    expect(
      offenders,
      'a module in the client bundle reads a secret env var. Next inlines nothing but ' +
        'NEXT_PUBLIC_*, so the value is undefined in the browser -- and the import is still a ' +
        'server credential named in code that ships to guests.',
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * T40 / T41 / T76 -- the deadline is wired, not merely written (R65, R88)
 * ------------------------------------------------------------------ */

describe('T41/T76: every upstream call carries a deadline', () => {
  /*
    R65 and R88. `fetch` has no default timeout, so a Jellyfin that accepts the
    connection and goes quiet held a deck build -- or a sign-in -- open forever.

    T40 pins `export function withDeadline`, T41 pins `fetchFn: withDeadline(fetch)`
    and T76 pins the same default on the login. All three name a symbol and none
    of them executes one: mutation run, `withDeadline` gutted to
    `return inner;`, and all three stayed green.

    src/lib/__tests__/deadline.test.ts does catch that gutting -- it asserts a
    signal reaches the inner fetch and that a hang is renamed after its host --
    so T40's `why` names it rather than repeating it here. What deadline.test.ts
    cannot see is the wiring: it calls withDeadline itself, so dropping the
    wrapper from a config default leaves it green. These two cases exercise the
    default that production actually uses.

    They assert a deadline is created and attached, not that it fires: the real
    budget is 15s and a test that waits for it is a test nobody runs.
  */
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function stubbedFetch() {
    const inner = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ Items: [], User: { Id: 'u1', Name: 'Ada' } }),
    })) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
    vi.stubGlobal('fetch', inner);
    return inner;
  }

  /** The ms budget of every deadline created during a call. */
  function deadlines() {
    return vi.spyOn(AbortSignal, 'timeout');
  }

  /*
    All three clients, not just the one the mutation was run against.

    T41's find is `fetchFn: withDeadline(fetch)` and the pin haystack is the
    whole app, so the string survives in two other files: dropping the wrapper
    from src/lib/jellyfin.ts alone left every pin green. A per-client case is
    the only shape that catches that.
  */
  const CLIENTS: Array<[string, () => { fetchFn: typeof fetch }]> = [
    ['Jellyfin', jellyfinConfig],
    ['Jellyseerr', jellyseerrConfig],
    ['MDBList', mdblistConfig],
  ];

  for (const [name, config] of CLIENTS) {
    it(`gives the ${name} client’s default fetch a deadline`, async () => {
      const inner = stubbedFetch();
      const timeouts = deadlines();

      // Built here, after the stub, because the default captures `fetch` when
      // the config is made -- which is what T41 is about.
      const cfg = config();
      await cfg.fetchFn('http://upstream.local/x');

      const init = inner.mock.calls[0]![1] as RequestInit | undefined;
      expect(init?.signal, `the ${name} client called fetch with no signal at all`).toBeDefined();
      expect(timeouts, 'no deadline was created for the call').toHaveBeenCalled();
      expect(Number(timeouts.mock.calls[0]![0])).toBeGreaterThanOrEqual(5_000);
    });
  }

  it('gives the sign-in the same deadline, not a bare fetch', async () => {
    const inner = stubbedFetch();
    const timeouts = deadlines();
    vi.stubEnv('JELLYFIN_URL', 'http://jellyfin.local:8096');

    await authenticateWithJellyfin('ada', 'hunter2');

    const init = inner.mock.calls[0]![1] as RequestInit | undefined;
    expect(init?.signal, 'the sign-in called fetch with no signal at all').toBeDefined();
    expect(timeouts, 'no deadline was created for the sign-in').toHaveBeenCalled();
  });
});
