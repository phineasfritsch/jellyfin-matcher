/**
 * How long does a deck take to build against a library that is not the
 * maintainer's? (U10.)
 *
 *   npx tsx scripts/bench-deck.ts
 *   npx tsx scripts/bench-deck.ts --sizes 1000,10000
 *   npx tsx scripts/bench-deck.ts --keep          # leave the scratch dir for inspection
 *   npx tsx scripts/bench-deck.ts --skip-warming  # drop the multi-night cache measurement
 *
 * Gate U10 in docs/UPSTREAM.md says the deck build has never been measured
 * against a library of 10,000+ items. It had not. Every number this project has
 * ever quoted about deck build time came from one Jellyfin with a few hundred
 * films on it, which is the smallest library any of this will ever meet.
 *
 * WHAT THIS MEASURES
 *
 * The real functions, in the real order, driven through `buildDeckForRoom` --
 * not a re-implementation. Jellyfin, Jellyseerr and MDBList are replaced at
 * `globalThis.fetch` with a stub that answers instantly from a pre-serialised
 * body, so what is left on the clock is this app's own CPU: JSON parsing,
 * mapping, filtering, the ratings-cache read, candidate construction and
 * `buildDeck`. The ratings cache and the watch history are written to a real
 * directory on a real disk, because their cost is real and grows with the
 * library.
 *
 * MEASURED VERSUS MODELLED
 *
 * Everything in the tables below is measured on this machine except two
 * columns, both marked `(modelled)` in the output and both in the ratings-cache
 * section. One of them describes code that R143 deleted; it is kept only
 * because it is the number that justified deleting it. Nothing else here is a
 * model, and nothing here describes code that is not on disk.
 *
 * That distinction is the whole reason this file was revised. Two of its stages
 * outlived the code they were written for:
 *
 * - It timed `JSON.parse` over the **whole library in one string**, and after
 *   R144 the app never does that -- it parses a sequence of 500-title pages.
 *   The stage carried on reporting a cost nothing pays, and B5 in
 *   docs/PLAN-1.1.md was raised against that number.
 * - Its fetch stub ignored `StartIndex`/`Limit` entirely, so `getMovies` here
 *   fetched and parsed the entire library **twice** on every call (page one,
 *   then an identical page two that contributed nothing new and stopped the
 *   loop). Every `getMovies` and `buildDeckForRoom` figure was of that, not of
 *   a well-behaved server.
 *
 * The stub now honours paging by default and the page size is *learned from the
 * app* rather than restated here, so this cannot drift out of date again. The
 * paging-blind server is kept -- see `Paging` below -- because R144 records
 * that it caught a real bug, and it is now measured on purpose and labelled.
 *
 * WHAT THIS DOES NOT MEASURE, AND MUST NOT BE READ AS
 *
 * - **Network.** Not transfer time, not TLS, not a NAS spinning up. The stub
 *   answers in microseconds; a real Jellyfin does not. Paging changes what a
 *   timeout costs, not what the bytes cost to move.
 * - **Jellyfin's own response time.** The server-side cost of assembling
 *   `/Items` for 50,000 movies with `Fields=Genres,ProviderIds,ProductionYear,
 *   Overview` is entirely absent here, and on a real box it is likely to be the
 *   larger half of the wall clock. Paging multiplies the number of times
 *   Jellyfin pays its own per-query overhead, which this cannot see at all.
 * - **MDBList.** Every rating is either already cached or answered instantly.
 *   A real cold cache is rate-limited, retried with backoff, and capped by
 *   `MDBLIST_REQUEST_BUDGET`; the warming section counts nights, requests and
 *   bytes on disk rather than pretending to time a month of them.
 * - **Real disk.** This machine's disk, this machine's page cache. A
 *   deployment on an SD card or a network mount will read the ratings cache
 *   far more slowly, and that read happens on every single deck build.
 *
 * So the numbers below are a **floor**: the part nobody can blame on somebody
 * else's server. If the floor is already slow, the ceiling is worse.
 *
 * DETERMINISM
 *
 * No `Math.random` anywhere. The library, the ratings and the history are
 * generated from a seeded PRNG, so two runs on the same machine compare, and a
 * run on your machine compares to the table in docs/PERFORMANCE.md.
 */
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { buildDeckForRoom } from '../server/deckService';
import type { Room } from '../server/store';
import { candidatesFromJellyfin } from '../src/lib/candidates';
import { buildDeck } from '../src/lib/deck';
import * as jellyfin from '../src/lib/jellyfin';
import * as mdblist from '../src/lib/mdblist';
import type { MdblistMedia, MovieCandidate } from '../src/lib/types';

// ---------------------------------------------------------------------------
// A seeded PRNG. Not for cryptography; for a library that is the same library
// on every run and on every machine.
// ---------------------------------------------------------------------------

/** mulberry32: 32 bits of state, uniform enough for fixtures, exactly reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260831;

/**
 * Genre names as Jellyfin actually spells them, ordered by how common they are
 * in a real film library. The generator draws from the front of this list far
 * more often than the back, because a library where every genre is equally
 * likely makes the locked pair look rarer than it is -- and the size of the
 * matched set is the number the deck build actually pays for.
 */
const GENRES = [
  'Drama',
  'Comedy',
  'Thriller',
  'Action',
  'Adventure',
  'Romance',
  'Crime',
  'Horror',
  'Science Fiction',
  'Fantasy',
  'Mystery',
  'Family',
  'Animation',
  'Documentary',
  'War',
  'Western',
  'History',
  'Music',
  'TV Movie',
];

/** The pair a room locks in this benchmark. The two commonest, i.e. the worst case. */
const LOCKED: [string, string] = ['Drama', 'Comedy'];

/** Roughly the length of a TMDb overview, which is what Jellyfin serves back. */
const OVERVIEW =
  'A restless projectionist inherits a shuttered cinema on the edge of town and ' +
  'discovers that the last reel of every film in the vault has been replaced with ' +
  'footage of her own life, shot years before she was born. As the townspeople ' +
  'begin arriving for screenings nobody advertised, she has to decide whether to ' +
  'run the final print or burn the building down.';

/** The Jellyfin `/Items` DTO, as much of it as `mapItem` reads. */
interface ItemDto {
  Id: string;
  Name: string;
  ProductionYear: number;
  RunTimeTicks: number;
  Genres: string[];
  Overview: string;
  ProviderIds: Record<string, string>;
  ImageTags: Record<string, string>;
}

/** One library row. Called in sequence from a single PRNG, so order matters. */
function syntheticItem(i: number, rand: () => number): ItemDto {
  // Zipf-ish genre draw: index = floor(GENRES.length * r^2), so Drama and
  // Comedy dominate the way they do in a real collection.
  const count = 1 + Math.floor(rand() * 3);
  const genres = new Set<string>();
  for (let g = 0; g < count; g++) {
    const r = rand();
    genres.add(GENRES[Math.min(GENRES.length - 1, Math.floor(GENRES.length * r * r))]!);
  }
  // A tenth of any real library has no TMDb id: home video, obscure imports,
  // anything the scraper gave up on. Those titles still enter the deck,
  // unscored, so they must be in the fixture.
  const hasTmdb = rand() > 0.1;
  return {
    Id: `bench-${i.toString(36).padStart(8, '0')}`,
    Name: `Bench Title ${i}`,
    ProductionYear: 1930 + Math.floor(rand() * 96),
    // 70-190 minutes, in Jellyfin's 100ns ticks.
    RunTimeTicks: Math.floor((70 + rand() * 120) * 600_000_000),
    Genres: [...genres],
    Overview: OVERVIEW,
    ProviderIds: hasTmdb
      ? { Tmdb: String(100000 + i), Imdb: `tt${(1000000 + i).toString().padStart(7, '0')}` }
      : {},
    ImageTags: { Primary: 'abcdef0123456789' },
  };
}

/**
 * The library, serialised once, as bytes.
 *
 * Rows are stored comma-joined in a single `Buffer` with an index of where each
 * one starts, so any page -- any `StartIndex`, any `Limit`, and the whole
 * library in one body -- can be cut without holding 50,000 live objects for the
 * run. That matters twice over: Buffer bytes live outside the V8 heap, so a
 * 28 MB fixture does not lengthen every collection that happens during a
 * measurement, and the app is never charged for serialisation it would not do.
 */
interface ItemsFixture {
  /** Every row's JSON, comma-separated. No enclosing brackets. */
  rows: Buffer;
  /** `offsets[i]` is where row `i` begins; `offsets[n]` is one past the final comma. */
  offsets: number[];
  total: number;
  /** TMDb ids present in the library, for the MDBList stub and the cache fixture. */
  tmdbIds: Set<number>;
}

function serialiseLibrary(n: number): ItemsFixture {
  const rand = prng(SEED);
  const parts: string[] = new Array(n);
  const offsets: number[] = new Array(n + 1);
  const tmdbIds = new Set<number>();
  let at = 0;
  for (let i = 0; i < n; i++) {
    const item = syntheticItem(i, rand);
    const raw = item.ProviderIds.Tmdb;
    if (raw) tmdbIds.add(Number(raw));
    const json = JSON.stringify(item);
    parts[i] = json;
    offsets[i] = at;
    // +1 for the comma that joins this row to the next. The last row has no
    // comma after it, so offsets[n] points one past the end of the buffer --
    // which is exactly what a slice ending at `offsets[b] - 1` needs.
    at += Buffer.byteLength(json) + 1;
  }
  offsets[n] = at;
  return { rows: Buffer.from(parts.join(',')), offsets, total: n, tmdbIds };
}

/** The body a well-behaved Jellyfin returns for one `StartIndex`/`Limit`. */
function pageBody(fx: ItemsFixture, start: number, limit: number): Buffer {
  const a = Math.min(Math.max(0, start), fx.total);
  const b = Math.min(a + Math.max(0, limit), fx.total);
  const rows = a < b ? fx.rows.subarray(fx.offsets[a]!, fx.offsets[b]! - 1) : Buffer.alloc(0);
  return Buffer.concat([
    Buffer.from('{"Items":['),
    rows,
    // A real server sends the total on every page, and `getMovies` uses it as
    // one of its four stopping conditions. Leaving it out would measure a
    // server that is less honest than the common case.
    Buffer.from(`],"TotalRecordCount":${fx.total}}`),
  ]);
}

const RATING_SOURCES = ['imdb', 'letterboxd', 'tomatoes', 'metacritic', 'trakt'];

/**
 * The MDBList record for one title, derived from its id alone.
 *
 * A function rather than a pre-built `Map<number, MdblistMedia>`, and that is
 * not a style preference. The map had to stay alive for the whole run so the
 * fetch stub could answer from it, which at 50,000 titles put a few hundred
 * megabytes of *benchmark* on the heap while the *app* was being measured.
 * Every collection during a timed stage then had to scan it, and the
 * end-to-end figures came out several times worse than the sum of their own
 * parts. Deriving each record on demand keeps the harness out of the numbers.
 */
function syntheticMedia(tmdbId: number): MdblistMedia {
  const rand = prng((SEED ^ tmdbId) >>> 0);
  return {
    id: tmdbId,
    title: `Bench Title ${tmdbId - 100000}`,
    year: 1930 + Math.floor(rand() * 96),
    runtime: 70 + Math.floor(rand() * 120),
    poster: `https://image.tmdb.org/t/p/w500/bench${tmdbId}.jpg`,
    description: OVERVIEW,
    trailer: `https://www.youtube.com/watch?v=bench${tmdbId}`,
    genres: null,
    ids: {
      imdb: `tt${(1000000 + tmdbId).toString().padStart(7, '0')}`,
      tmdb: tmdbId,
      trakt: tmdbId,
    },
    ratings: RATING_SOURCES.map((source) => ({
      source,
      value: Math.round(rand() * 100) / 10,
      score: Math.floor(rand() * 101),
      votes: Math.floor(rand() * 500000),
    })),
  };
}

// ---------------------------------------------------------------------------
// The upstreams, replaced at the socket. Nothing here touches a network.
// ---------------------------------------------------------------------------

/**
 * Whether the stubbed Jellyfin honours `StartIndex` and `Limit`.
 *
 * `honoured` is what ships against any ordinary server and is what every
 * headline number below is measured against.
 *
 * `ignored` is a server that answers every page with the whole library. It is
 * not a straw man: this stub behaved that way by accident, because it predated
 * R144's paging, and that accident found a bug in the first paged loop -- which
 * trusted the page it was handed and so collected the library once per page, up
 * to the 1000-page ceiling, until it died on a heap limit. R144 records that the
 * correct-looking instinct, updating the stub, would have hidden it.
 *
 * So the rudeness stays, but as a measured and labelled stage rather than as
 * the silent default. A benchmark whose only mode is the adversary reports the
 * adversary's cost as if it were the product's.
 */
type Paging = 'honoured' | 'ignored';

interface Upstreams {
  fixture: ItemsFixture;
  /** Page bodies, keyed `start:limit`, cut once and reused. */
  pageCache: Map<string, Buffer>;
  paging: Paging;
  genresBody: Uint8Array;
  /** `/Items` requests since the counter was last reset. */
  itemsRequests: number;
  /**
   * The `Limit` the app last asked for, learned rather than restated.
   *
   * `PAGE_SIZE` is private to src/lib/jellyfin.ts, and copying its value here
   * is exactly how this file came to measure a shape the app had stopped
   * using. Reading it off the request means the parse-shape section below is
   * always about the page size that ships, whatever anyone changes it to.
   */
  observedLimit: number | null;
  /** Whether a given TMDb id is one this library knows about. */
  hasMedia: (id: number) => boolean;
  /** Requests the stub was asked for, so cold-cache cost can be counted not guessed. */
  mdblistRequests: number;
}

function installFetchStub(up: Upstreams): void {
  const json = (body: Uint8Array | string): Response =>
    new Response(body as BodyInit, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const stub: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : String((input as Request).url ?? input);

    if (url.includes('/Genres?')) return json(up.genresBody);

    if (url.includes('/Items?')) {
      up.itemsRequests++;
      const q = new URL(url).searchParams;
      const limit = q.has('Limit') ? Number(q.get('Limit')) : up.fixture.total;
      up.observedLimit = limit;
      // A rude server ignores both parameters and sends everything, every time.
      const start = up.paging === 'ignored' ? 0 : Number(q.get('StartIndex') ?? '0');
      const span = up.paging === 'ignored' ? up.fixture.total : limit;
      const key = `${start}:${span}`;
      let body = up.pageCache.get(key);
      if (!body) {
        // Cut on first sight, kept thereafter. `measure` always runs one
        // untimed rep first, so a timed rep never pays for this.
        body = pageBody(up.fixture, start, span);
        up.pageCache.set(key, body);
      }
      return json(body);
    }

    if (url.includes('api.mdblist.com/tmdb/movie/')) {
      up.mdblistRequests++;
      const body = JSON.parse(String(init?.body ?? '{}')) as { ids?: number[] };
      const out = (body.ids ?? []).filter(up.hasMedia).map(syntheticMedia);
      return json(JSON.stringify(out));
    }

    if (url.includes('/api/v1/genres/movie')) {
      return json(JSON.stringify(GENRES.map((name, i) => ({ id: i + 1, name }))));
    }

    if (url.includes('/api/v1/discover/movies')) {
      // Jellyseerr's discover is paginated at 20 and this app asks for 3 pages
      // per locked genre. That is a constant, whatever the library size --
      // which is itself worth showing.
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      const results = Array.from({ length: 20 }, (_, i) => {
        const n = (page - 1) * 20 + i;
        return {
          id: 900000 + n,
          title: `Discover Title ${n}`,
          releaseDate: '2019-04-26',
          posterPath: `/disc${n}.jpg`,
          genreIds: [1, 2],
          mediaInfo: { status: 5 },
        };
      });
      return json(JSON.stringify({ results }));
    }

    throw new Error(`bench-deck: unstubbed upstream call to ${url}`);
  };

  (globalThis as unknown as { fetch: typeof fetch }).fetch = stub;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Ask V8 for a collection so a heap reading means "retained", not "not yet
 * swept". Node exposes no `gc` without a flag, so the flag is set from inside
 * the process. If that ever stops working the numbers stay honest -- they just
 * become an upper bound, and `gcAvailable` says so in the output.
 */
let gcAvailable = false;
let forceGc: () => void = () => {};
try {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  forceGc = () => {
    gc();
    gc();
  };
  forceGc();
  gcAvailable = true;
} catch {
  gcAvailable = false;
}

function heapMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/** Peak resident set for the whole process so far, in MB. Monotonic: a delta is a new high-water mark, not a stage total. */
function peakRssMb(): number {
  return process.resourceUsage().maxRSS / 1024;
}

interface Sample {
  /** Median wall clock across reps, ms. */
  ms: number;
  /** Fastest rep, ms. The floor of the floor -- least contaminated by GC. */
  best: number;
  /** Heap retained by the result, MB. Meaningless unless gcAvailable. */
  retainedMb: number;
  /** How much this stage pushed the process's all-time peak RSS, MB. */
  peakDeltaMb: number;
}

/**
 * Somewhere for a stage's result to live while the heap is read.
 *
 * A local variable is not enough: V8 is entitled to treat a value nothing will
 * read again as dead before the next collection, which made every `retained`
 * figure come out as 0.0 MB. A module-level binding that is written and later
 * cleared cannot be reasoned away.
 */
let sink: unknown = null;

/**
 * Run once and drop the result -- in a frame of its own, which is the whole point.
 *
 * `await fn()` leaves the resolved value in a register of the *calling* async
 * function's suspended frame, and V8 does not clear it just because the
 * expression statement ended. Doing the warm-up call inline made every
 * `retained` figure come out as exactly 0.0 MB: the warm-up array was still
 * pinned when `before` was read, and the measured call then reused the same
 * register, so the two readings were of the same one object. A frame that has
 * returned holds nothing.
 */
async function discard<T>(fn: () => Promise<T> | T): Promise<void> {
  await fn();
}

/** Heap growth, in MB, from holding one result of `fn`. Own frame, same reason. */
async function retainedMbOf<T>(fn: () => Promise<T> | T): Promise<number> {
  sink = null;
  forceGc();
  const before = heapMb();
  sink = await fn();
  forceGc();
  const after = heapMb();
  sink = null;
  forceGc();
  return after - before;
}

async function measure<T>(reps: number, fn: () => Promise<T> | T): Promise<Sample> {
  // One untimed rep so lazy compilation and first-touch page faults are not
  // charged to the measurement. Deck builds happen many times per evening; the
  // cold-start cost is real but it is not what this table is about.
  await discard(fn);
  forceGc();

  const retained = await retainedMbOf(fn);

  const times: number[] = [];
  const peakBefore = peakRssMb();
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    await discard(fn);
    times.push(performance.now() - t0);
  }
  const peakDeltaMb = peakRssMb() - peakBefore;

  times.sort((a, b) => a - b);
  return {
    ms: times[Math.floor(times.length / 2)]!,
    best: times[0]!,
    retainedMb: Math.max(0, retained),
    peakDeltaMb: Math.max(0, peakDeltaMb),
  };
}

// ---------------------------------------------------------------------------
// Table printing
// ---------------------------------------------------------------------------

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const line = (cells: string[]) =>
    '  ' +
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join('  ');
  return [
    line(headers),
    '  ' + widths.map((w) => '-'.repeat(w)).join('  '),
    ...rows.map(line),
  ].join('\n');
}

const ms = (n: number) => (n < 10 ? n.toFixed(2) : n.toFixed(1));
const mb = (n: number) => n.toFixed(1);

/**
 * Bytes at whatever scale keeps the digits. Warming a small library writes a
 * few megabytes and a large one writes hundreds; one fixed unit rounds one of
 * them to "0.00 GB", which is how a real number becomes no number at all.
 */
function bytes(n: number): string {
  const megabytes = n / 1024 / 1024;
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(2)} GB` : `${megabytes.toFixed(1)} MB`;
}

/** How far past the item ratio a stage has to grow before it is called superlinear. */
const SUPERLINEAR_FACTOR = 1.4;
/**
 * Below this, a median is mostly scheduler noise on a desktop machine, and a
 * ratio of two small numbers will invent a complexity class that is not there.
 * `buildDeck` was reported SUPERLINEAR at 0.32ms -> 2.16ms on one run and
 * linear on the next, from the same code and the same fixture.
 */
const NOISE_FLOOR_MS = 2;

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function parseSizes(argv: string[]): number[] {
  const i = argv.indexOf('--sizes');
  if (i === -1) return [1000, 10000, 50000];
  const raw = argv[i + 1] ?? '';
  const sizes = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (sizes.length === 0) throw new Error('--sizes needs a comma-separated list of item counts');
  return sizes;
}

function roomFor(scope: 'local' | 'wide'): Room {
  // Only the fields buildDeckForRoom reads. A whole RoomStore would drag in
  // socket plumbing this benchmark has no use for.
  return {
    roomId: 'BNCH',
    status: 'KNOCKOUT',
    settings: { scope, maxRuntime: null, deckLimit: 50 },
    lockedGenres: [...LOCKED],
    users: {},
    knockout: {
      phase: 'DONE',
      submissions: {},
      pool: [...LOCKED],
      elimVotes: {},
      locked: [...LOCKED],
      needsRevote: false,
    },
    deck: [],
    progress: {},
    votes: {},
    rejected: [],
    winner: null,
    winnerViaFallback: false,
    winnerRanking: null,
    winnerPlayUrl: null,
    winnerRequest: null,
    createdAt: 0,
    lastActivity: 0,
  };
}

// ---------------------------------------------------------------------------
// The doubling sweep: is anything actually superlinear, or is it just the heap?
//
// A wall clock that grows faster than the input does NOT prove a superlinear
// algorithm. Past a few tens of megabytes the live set stops fitting in cache
// and every scavenge has more to scan, so a strictly linear pass gets slower
// *per item* as the heap grows. The two are indistinguishable from one table of
// timings, and this project has no business calling something quadratic on that
// evidence.
//
// So: count the operations as well as timing them. Operation counts have no
// cache, no GC and no scheduler. If ops/candidate is flat across six doublings,
// the algorithm is linear whatever the clock says.
// ---------------------------------------------------------------------------

interface OpCounts {
  /** Times buildDeck read `.genres` off a candidate. */
  genres: number;
  /** Times buildDeck read `.id` off a candidate (the dedupe set, then the exclude set). */
  id: number;
  /** Times buildDeck read `.scores` off a candidate. */
  scores: number;
}

/**
 * Candidates that report what buildDeck asks of them.
 *
 * Accessor properties rather than a Proxy: a Proxy traps far more than the
 * reads being counted (`in`, ownKeys, the spread) and would report a number
 * that is not the one in the question. These are ordinary objects with three
 * getters, so a spread still copies them by value the way it always did.
 */
function countingCandidates(
  n: number,
  counts: OpCounts,
): MovieCandidate[] {
  const rand = prng(SEED ^ 0xc0c0);
  const out: MovieCandidate[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const genres = [
      GENRES[Math.floor(GENRES.length * rand() * rand())]!,
      GENRES[Math.floor(GENRES.length * rand() * rand())]!,
    ];
    const id = `tmdb-${i}`;
    const scores = {
      letterboxd: null,
      imdb: null,
      rt: null,
      composite: Math.floor(rand() * 101),
    };
    const c = {
      tmdbId: i,
      imdbId: null,
      title: `Counted ${i}`,
      year: 2000,
      runtime: 100,
      posterUrl: null,
      isHybrid: false,
      jellyfinItemId: null,
      description: null,
      trailerUrl: null,
      allRatings: [],
    } as unknown as MovieCandidate;
    Object.defineProperty(c, 'genres', {
      enumerable: true,
      get: () => {
        counts.genres++;
        return genres;
      },
    });
    Object.defineProperty(c, 'id', {
      enumerable: true,
      get: () => {
        counts.id++;
        return id;
      },
    });
    Object.defineProperty(c, 'scores', {
      enumerable: true,
      get: () => {
        counts.scores++;
        return scores;
      },
    });
    out[i] = c;
  }
  return out;
}

/** Plain candidates, same shape, for the timed half of the sweep. */
function plainCandidates(n: number): MovieCandidate[] {
  const rand = prng(SEED ^ 0x71a1);
  const out: MovieCandidate[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      id: `tmdb-${i}`,
      tmdbId: i,
      imdbId: null,
      title: `Sweep ${i}`,
      year: 2000,
      runtime: 100,
      posterUrl: null,
      genres: [
        GENRES[Math.floor(GENRES.length * rand() * rand())]!,
        GENRES[Math.floor(GENRES.length * rand() * rand())]!,
      ],
      isHybrid: false,
      jellyfinItemId: null,
      description: OVERVIEW,
      trailerUrl: null,
      allRatings: [],
      scores: { letterboxd: null, imdb: null, rt: null, composite: Math.floor(rand() * 101) },
    };
  }
  return out;
}

async function doublingSweep(): Promise<void> {
  const sizes = [2000, 4000, 8000, 16000, 32000, 64000];

  console.log('Doubling sweep: buildDeck alone. Each row doubles the candidate count.');
  console.log('  ops/candidate is the answer to "is this superlinear"; ms/candidate is not.');

  const rows: string[][] = [];
  let prevMs = 0;
  let prevOps = 0;
  for (const n of sizes) {
    const plain = plainCandidates(n);
    const sample = await measure(n <= 16000 ? 9 : 5, () =>
      buildDeck(plain, LOCKED, { deckLimit: 50 }),
    );

    const counts: OpCounts = { genres: 0, id: 0, scores: 0 };
    const counted = countingCandidates(n, counts);
    buildDeck(counted, LOCKED, { deckLimit: 50 });
    const ops = counts.genres + counts.id + counts.scores;

    rows.push([
      String(n),
      ms(sample.ms),
      prevMs === 0 ? '-' : `x${(sample.ms / prevMs).toFixed(2)}`,
      ((sample.ms * 1000) / n).toFixed(3),
      String(ops),
      prevOps === 0 ? '-' : `x${(ops / prevOps).toFixed(2)}`,
      (ops / n).toFixed(2),
    ]);
    prevMs = sample.ms;
    prevOps = ops;
    forceGc();
  }

  console.log(
    table(
      ['candidates', 'ms', 'ms x prev', 'us/cand', 'field reads', 'reads x prev', 'reads/cand'],
      rows,
    ),
  );
  console.log('');
}

// ---------------------------------------------------------------------------
// Parsing the library: the B5 question
//
// B5 in docs/PLAN-1.1.md recorded `JSON.parse(/Items)` growing x13.9 for x10
// items and asked whether that survived R144. It did not survive it in the
// literal sense: the stage was parsing the whole library as one string, and the
// app stopped doing that. But "the old stage is gone" is not an answer to "is
// parsing superlinear in bytes", and the honest way to answer that is to hold
// the bytes fixed and vary only the shape.
//
// Both shapes go through `new Response(body).json()`, which is the call
// `jellyfinGet` makes, so the UTF-8 decode is charged to both equally. A bare
// `JSON.parse` on an already-decoded string would flatter both and measure
// neither -- and the old stage did exactly that, so it undercounted what the
// app pays by the whole cost of decoding 28 MB of UTF-8.
//
// Two of the columns are counted rather than timed, and they are the ones to
// read first. Bytes have no garbage collector: the size of the LARGEST SINGLE
// body is what a deadline has to survive in one go, and it is the thing R144
// changed -- from the whole library to one page, whatever the library. The
// total is linear in the library under both shapes and always was. On a machine
// with other work on it the timing columns cannot separate the two shapes at
// all; the counted ones do not care.
// ---------------------------------------------------------------------------

interface ParseShape {
  /** Median ms to decode+parse the whole library as one body -- the pre-R144 shape. */
  oneBodyMs: number;
  /** Median ms to decode+parse the same library as the pages that ship. */
  pagedMs: number;
  /**
   * The same two, fastest rep rather than median.
   *
   * Throughput is quoted off these. A median on a machine with other work on it
   * carries whatever else ran, and this section's whole job is to compare two
   * shapes of the same work -- a comparison the noise swamps first. The fastest
   * rep is the one least contaminated by a collection that belonged to
   * something else, and both shapes are quoted the same way, so neither is
   * flattered.
   */
  oneBodyBest: number;
  pagedBest: number;
  /** Page size the app asked for, learned from its own request. */
  pageSize: number;
  pages: number;
  /** Total bytes of library JSON, identical under both shapes bar the envelopes. */
  bytes: number;
  /** Bytes in the largest single body under the paged shape. Counted, not timed. */
  pageBytes: number;
}

/**
 * Decode and parse each body the way `jellyfinGet` does, and count the rows so
 * the work cannot be optimised away as unused.
 *
 * `as BodyInit` for the same reason the fetch stub needs it: a `Buffer` is a
 * `Uint8Array<ArrayBufferLike>`, and the DOM lib's BodyInit wants the narrower
 * `ArrayBuffer` flavour. The bytes are identical; the cast is the type system,
 * not the runtime.
 */
async function parseBodies(bodies: Uint8Array[]): Promise<number> {
  let rows = 0;
  for (const body of bodies) {
    const data = (await new Response(body as BodyInit).json()) as { Items?: unknown[] };
    rows += data.Items?.length ?? 0;
  }
  return rows;
}

async function parseShapeOf(fx: ItemsFixture, pageSize: number, reps: number): Promise<ParseShape> {
  const whole = [pageBody(fx, 0, fx.total)];
  const pages: Buffer[] = [];
  for (let start = 0; start < fx.total; start += pageSize) pages.push(pageBody(fx, start, pageSize));

  /*
    The two shapes must be the same library, or the comparison is a lie.

    `pageBody` cuts rows out of one buffer on byte offsets and drops the comma
    that joins them -- arithmetic that is easy to get off by one, and an
    off-by-one here would either fail to parse or silently drop a title per
    page, which would make the paged shape look cheaper for the worst possible
    reason. Counting rows on both sides is cheap and it is the only thing
    standing between a fixture bug and a conclusion.
  */
  const wholeRows = await parseBodies(whole);
  const pagedRows = await parseBodies(pages);
  if (wholeRows !== fx.total || pagedRows !== fx.total) {
    throw new Error(
      `bench-deck: the two parse shapes are not the same library ` +
        `(one body ${wholeRows}, ${pages.length} pages ${pagedRows}, expected ${fx.total}). ` +
        `pageBody is cutting rows wrongly; the timings below it would be meaningless.`,
    );
  }

  // More reps than the stage table uses. This is the one comparison in the file
  // that a single unlucky collection can invert, and parsing is the cheapest
  // thing here to repeat.
  const parseReps = Math.max(reps, 7);
  const one = await measure(parseReps, () => parseBodies(whole));
  const many = await measure(parseReps, () => parseBodies(pages));
  const bytes = whole[0]!.length;
  const pageBytes = Math.max(...pages.map((p) => p.length));

  /*
    The claim this whole section exists to make, asserted rather than printed.

    docs/PERFORMANCE.md answers B5 with "the largest single body went from
    28.1 MB to 0.28 MB and stays there for any library". That is one number in
    one column, and a column is a thing that can be wired to the wrong variable
    -- at which point the table reports that paging changed nothing and the
    conclusion quietly inverts, with the script still exiting 0. It did exactly
    that when the wiring was tried deliberately.

    More than one body means each of them is smaller than all of them. A single
    page (a library below the page size) is legitimately the whole library, so
    that case is not a failure.
  */
  if (pages.length > 1 && pageBytes >= bytes) {
    throw new Error(
      `bench-deck: ${pages.length} pages but the largest is ${pageBytes} bytes against ` +
        `${bytes} for the whole library. Paging cannot leave the largest body unchanged; ` +
        `the parse-shape table is measuring or reporting the wrong thing.`,
    );
  }
  // The page bodies are dropped before returning: at 50,000 items they are a
  // second copy of the library, and leaving them reachable would charge every
  // later stage's collection for scanning them.
  pages.length = 0;
  return {
    oneBodyMs: one.ms,
    pagedMs: many.ms,
    oneBodyBest: one.best,
    pagedBest: many.best,
    pageSize,
    pages: Math.ceil(fx.total / pageSize),
    bytes,
    pageBytes,
  };
}

// ---------------------------------------------------------------------------
// Warming the ratings cache, measured rather than modelled
//
// R143 replaced a whole-cache rewrite per night with a base file plus an append
// log. The old cost was quoted as 1.36 GB for a 50,000-title library, and the
// new one was a paragraph of arithmetic. A paragraph of arithmetic is how this
// file came to report costs for code that no longer existed, so the new one is
// now run instead: nights are executed against the real `getMoviesByTmdbIds`,
// and bytes are read off the filesystem after each one.
//
// What is observed, and how:
//
// - A night that compacts rewrites the base whole, and its size changes. Those
//   bytes are counted at the new base size (the temp file R78 renames into
//   place is the same bytes).
// - A night that appends leaves the base untouched, and the log grows by
//   exactly what was written.
//
// That is a lower bound on physical writes -- it does not count the directory
// entries, the rename, or whatever the filesystem does underneath. It is an
// exact count of what the app handed to `writeFile` and `appendFile`.
// ---------------------------------------------------------------------------

interface WarmResult {
  nights: number;
  requestsPerNight: number;
  bytesWritten: number;
  finalBaseBytes: number;
  finalLogBytes: number;
  firstNightMs: number;
  totalMs: number;
  /** ms to read the cache the warming actually left behind, base + log. */
  readMs: number;
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

async function measureWarming(
  tmdbIds: number[],
  cacheFile: string,
  up: Upstreams,
): Promise<WarmResult> {
  const cfg = mdblist.defaultConfig({
    cacheFile,
    apiKey: 'bench',
    // The only thing faked here is the wait between retries, and there are no
    // retries: the stub never returns 429. A real warming is rate-limited over
    // weeks, which is why nights are counted rather than timed.
    sleep: async () => {},
  });
  const logFile = `${cacheFile}${'.log'}`;
  /*
    Start from nothing, and mean it.

    Every size shares one scratch `.cache` directory, because the watch history
    is read from a path relative to the working directory and cannot be moved.
    A cold cache named the same thing in that directory therefore survives from
    one size to the next -- and the ids overlap, since title i has TMDb id
    100000+i at every size. The 50,000-item warming began with the 10,000-item
    run's ratings already in hand and reported 47 nights where it should have
    reported 58.

    The file is named per size AND removed here: the name is what keeps the
    sizes apart, and the removal is what makes a re-run of one size honest.
  */
  rmSync(cacheFile, { force: true });
  rmSync(logFile, { force: true });

  let nights = 0;
  let bytesWritten = 0;
  let basePrev = 0;
  let logPrev = 0;
  let firstNightMs = 0;
  let requestsPerNight = 0;

  const t0 = performance.now();
  for (;;) {
    up.mdblistRequests = 0;
    const nightStart = performance.now();
    await mdblist.getMoviesByTmdbIds(tmdbIds, cfg);
    const nightMs = performance.now() - nightStart;
    nights += 1;
    if (nights === 1) {
      firstNightMs = nightMs;
      requestsPerNight = up.mdblistRequests;
    }

    const baseNow = sizeOf(cacheFile);
    const logNow = sizeOf(logFile);
    if (baseNow !== basePrev) bytesWritten += baseNow;
    else bytesWritten += Math.max(0, logNow - logPrev);
    basePrev = baseNow;
    logPrev = logNow;

    if (mdblist.lastRatingsCost().skipped === 0) break;
    // The loop is bounded for the same reason `getMovies` is (R144): a
    // benchmark that hangs looks like a slow machine, and a red line looks like
    // a bug. 20,000 nights is far past any library this runs on.
    if (nights > 20000) throw new Error('bench-deck: cache warming did not converge');
  }
  const totalMs = performance.now() - t0;

  /*
    A cache cannot be warmed by writing fewer bytes than it ends up holding.

    Every entry has to reach the disk at least once, so `bytesWritten` is
    bounded below by the size of the cache the warming produced. The accounting
    above infers writes from file sizes rather than from a hook inside the app,
    and the failure mode of that inference is silent undercounting -- a
    compaction missed, a log delta read after the file was replaced. An
    undercount would make R143's fix look better than it is, in a document whose
    entire job is to say what it actually costs, so it fails here instead.
  */
  const cacheBytes = sizeOf(cacheFile) + sizeOf(logFile);
  if (bytesWritten < cacheBytes) {
    throw new Error(
      `bench-deck: warming wrote ${bytesWritten} bytes but left a ${cacheBytes}-byte cache. ` +
        `Every entry is written at least once, so the write accounting has missed some.`,
    );
  }

  // What a build pays to READ the cache in the state R143 leaves it: a base,
  // plus however much log has accumulated since the last compaction. The
  // hand-built fixture used by the `mdblist warm cache` stage is a base with no
  // log, which is the cheapest warm state; this is the one the writer produces.
  const read = await measure(3, () => mdblist.getMoviesByTmdbIds(tmdbIds, cfg));

  return {
    nights,
    requestsPerNight,
    bytesWritten,
    finalBaseBytes: sizeOf(cacheFile),
    finalLogBytes: sizeOf(logFile),
    firstNightMs,
    totalMs,
    readMs: read.ms,
  };
}

interface SizeResult {
  n: number;
  matched: number;
  /**
   * Distinct TMDb ids among the matched titles -- the set MDBList is actually
   * asked about, which is smaller than `matched` because a tenth of any library
   * has no TMDb id at all. The cache section used to label `matched` as "titles
   * to rate", which overstated the work by exactly that tenth.
   */
  ratable: number;
  payloadMb: number;
  cacheMb: number;
  stages: Record<string, Sample>;
  deckSize: number;
  /** `/Items` requests one `getMovies` made, against a server that pages. */
  pagesPerBuild: number;
  parse: ParseShape;
  warm: WarmResult | null;
}

async function runSize(n: number, scratch: string, skipWarming: boolean): Promise<SizeResult> {
  process.stderr.write(`  building fixtures for ${n} items...\n`);

  const fixture = serialiseLibrary(n);
  const payloadMb = pageBody(fixture, 0, n).length / 1024 / 1024;

  const up: Upstreams = {
    fixture,
    pageCache: new Map(),
    paging: 'honoured',
    genresBody: Buffer.from(JSON.stringify({ Items: GENRES.map((Name) => ({ Name })) })),
    itemsRequests: 0,
    observedLimit: null,
    hasMedia: (id) => fixture.tmdbIds.has(id),
    mdblistRequests: 0,
  };
  installFetchStub(up);

  // One call before anything is timed, purely to learn the page size the app
  // asks for. Everything below that needs to know the shape of a page reads it
  // from here rather than from a constant copied out of src/lib/jellyfin.ts.
  up.itemsRequests = 0;
  await jellyfin.getMovies({});
  const pagesPerBuild = up.itemsRequests;
  const pageSize = up.observedLimit ?? n;

  // A warm ratings cache holding the whole library. This is the steady state a
  // household reaches after a few weeks: every title their genre picks have
  // ever touched is cached, and `getMoviesByTmdbIds` reads and parses the whole
  // file on every deck build regardless of how many ids it was asked about.
  //
  // It is written as a single base file with no log, which is both a state
  // R143's reader accepts and the CHEAPEST warm state -- a cache with a log
  // outstanding costs the base parse plus the log lines. The warming section
  // measures that state instead, since it produces it.
  const cacheDir = path.join(scratch, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, 'mdblist.json');
  // Built as text rather than as an object graph, so the 42 MB of fixture at
  // 50,000 items is a transient string and not 50,000 live objects.
  const fetchedAt = Date.now();
  const parts: string[] = ['{'];
  let sep = '';
  for (const id of fixture.tmdbIds) {
    parts.push(`${sep}"${id}":{"fetchedAt":${fetchedAt},"media":${JSON.stringify(syntheticMedia(id))}}`);
    sep = ',';
  }
  parts.push('}');
  writeFileSync(cacheFile, parts.join(''), 'utf8');
  parts.length = 0;
  const cacheMb = statSync(cacheFile).size / 1024 / 1024;

  // A watch history at its 500-entry cap, because the exclude branch in
  // buildDeck only runs when the household has one (R105).
  const histRand = prng(SEED ^ 0xf00d);
  writeFileSync(
    path.join(cacheDir, 'history.json'),
    JSON.stringify({
      version: 1,
      watched: Array.from({ length: 500 }, (_, i) => {
        const id = 100000 + Math.floor(histRand() * n);
        return {
          id: `tmdb-${id}`,
          tmdbId: id,
          title: `Bench Title ${id - 100000}`,
          at: new Date(Date.now() - i * 3600_000).toISOString(),
        };
      }),
    }),
    'utf8',
  );

  const reps = n <= 1000 ? 9 : n <= 10000 ? 5 : 3;
  const stages: Record<string, Sample> = {};

  // 1. getMovies: the paged fetch, res.json() per page, mapItem over every row,
  //    the id dedupe that R144 added, then filterMovies.
  stages['jellyfin.getMovies (2 genres)'] = await measure(reps, () =>
    jellyfin.getMovies({ genres: [...LOCKED] }),
  );
  stages['jellyfin.getMovies (unfiltered)'] = await measure(reps, () => jellyfin.getMovies({}));

  // 2. The same call against a server that ignores StartIndex and Limit, which
  //    is the only thing this benchmark used to measure. Two requests, each
  //    carrying the whole library: page one fills the set, page two contributes
  //    nothing new and stops the loop. Kept because it is a server behaviour
  //    that exists and because R144 was found through it -- and labelled,
  //    because it is not what an ordinary night costs.
  up.paging = 'ignored';
  stages['getMovies (server ignores paging)'] = await measure(reps, () =>
    jellyfin.getMovies({ genres: [...LOCKED] }),
  );
  up.paging = 'honoured';

  let movies: Awaited<ReturnType<typeof jellyfin.getMovies>> | undefined =
    await jellyfin.getMovies({ genres: [...LOCKED] });
  const matched = movies.length;

  // 3. Ratings, warm. Every byte of that cache file, parsed, on every build.
  const tmdbIds = [...new Set(movies.map((m) => m.tmdbId).filter((x): x is number => x != null))];
  const mdbCfg = mdblist.defaultConfig({ cacheFile, apiKey: 'bench' });
  stages['mdblist warm cache'] = await measure(reps, () =>
    mdblist.getMoviesByTmdbIds(tmdbIds, mdbCfg),
  );

  let ratings: Map<number, MdblistMedia> | undefined = await mdblist.getMoviesByTmdbIds(
    tmdbIds,
    mdbCfg,
  );

  // 4. Candidate construction and the deck itself, in isolation.
  //
  // The closures read the `let` bindings rather than a captured copy, so
  // clearing the bindings below actually makes the fixtures unreachable. A
  // `const ref = movies` would keep every one of them alive in this frame.
  stages['candidatesFromJellyfin'] = await measure(reps, () =>
    candidatesFromJellyfin(movies!, ratings!),
  );
  let candidates: MovieCandidate[] | undefined = candidatesFromJellyfin(movies, ratings);
  stages['buildDeck'] = await measure(reps, () =>
    buildDeck(candidates!, LOCKED, { deckLimit: 50 }),
  );
  const deckSize = buildDeck(candidates, LOCKED, { deckLimit: 50 }).length;

  // 5. End to end, through the function the server actually calls.
  //
  // Every intermediate above is dropped first. Holding them would leave a few
  // hundred megabytes of already-measured fixture live while the end-to-end
  // stage runs, and the collector would charge this stage for scanning it --
  // which is how the wide build first appeared to cost 2.3 s at 50,000 items,
  // four times the sum of its own parts. A real server holds a 50-card deck
  // here, not the library.
  movies = undefined;
  ratings = undefined;
  candidates = undefined;
  forceGc();

  const localRoom = roomFor('local');
  const wideRoom = roomFor('wide');
  stages['buildDeckForRoom local'] = await measure(reps, () => buildDeckForRoom(localRoom));
  stages['buildDeckForRoom wide'] = await measure(reps, () => buildDeckForRoom(wideRoom));

  // 6. Parsing, both shapes, same bytes. The B5 question.
  const parse = await parseShapeOf(fixture, pageSize, reps);
  forceGc();

  // 7. Warming a cold cache from empty, run rather than modelled. Its own cache
  //    file, named for this size, so neither the warm-read fixture above nor
  //    the previous size's warming leaks into it.
  const warm = skipWarming
    ? null
    : await measureWarming(tmdbIds, path.join(cacheDir, `cold-${n}.json`), up);
  forceGc();

  return {
    n,
    matched,
    ratable: tmdbIds.length,
    payloadMb,
    cacheMb,
    stages,
    deckSize,
    pagesPerBuild,
    parse,
    warm,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sizes = parseSizes(argv);
  const keep = argv.includes('--keep');
  const skipWarming = argv.includes('--skip-warming');

  // The ratings cache and the watch history are both hardcoded to `.cache/`
  // relative to the working directory, with no override. Run from a scratch
  // directory so a benchmark cannot scribble on a real household's cache -- or
  // on another agent's working tree. Static imports are resolved before this
  // runs, so the chdir cannot break module resolution.
  const scratch = mkdtempSync(path.join(tmpdir(), 'bench-deck-'));
  const cwd = process.cwd();
  process.chdir(scratch);

  process.env.JELLYFIN_URL = 'http://bench.invalid:8096';
  process.env.JELLYFIN_API_KEY = 'bench';
  process.env.JELLYSEERR_URL = 'http://bench.invalid:5055';
  process.env.JELLYSEERR_API_KEY = 'bench';
  process.env.MDBLIST_API_KEY = 'bench';

  const results: SizeResult[] = [];
  try {
    for (const n of sizes) {
      results.push(await runSize(n, scratch, skipWarming));
      forceGc();
    }
  } finally {
    process.chdir(cwd);
    if (!keep) rmSync(scratch, { recursive: true, force: true });
  }

  const first = results[0]!;
  const stageNames = Object.keys(first.stages);

  console.log('');
  console.log('Deck build at library scale (U10)');
  console.log(`  node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`  seed ${SEED}, locked genres ${LOCKED.join(' + ')}, deck limit 50`);
  console.log(`  forced GC ${gcAvailable ? 'available' : 'UNAVAILABLE (heap figures are upper bounds)'}`);
  console.log(`  no network: every upstream answered from memory. See the header of this file.`);
  console.log(
    `  the stubbed Jellyfin honours StartIndex/Limit (R144); the one stage that measures a`,
  );
  console.log(`  server which does not is named for it.`);
  console.log('');

  console.log('Library');
  console.log(
    table(
      [
        'items',
        '/Items bytes',
        'pages/build',
        'ratings cache',
        'matched by genre',
        'deck cards',
      ],
      results.map((r) => [
        String(r.n),
        `${mb(r.payloadMb)} MB`,
        `${r.pagesPerBuild} x ${r.parse.pageSize}`,
        `${mb(r.cacheMb)} MB`,
        `${r.matched} (${((r.matched / r.n) * 100).toFixed(0)}%)`,
        String(r.deckSize),
      ]),
    ),
  );
  console.log('');

  console.log('Wall clock, median of reps (ms). All measured.');
  console.log(
    table(
      ['stage', ...results.map((r) => `${r.n}`)],
      stageNames.map((name) => [name, ...results.map((r) => ms(r.stages[name]!.ms))]),
    ),
  );
  console.log('');

  if (results.length > 1) {
    console.log('Growth. A linear stage tracks the item ratio.');
    console.log(
      `  ">LINEAR" is flagged when the ratio exceeds ${SUPERLINEAR_FACTOR}x the item ratio AND the`,
    );
    console.log(
      `  larger reading is over ${NOISE_FLOOR_MS} ms. It means the CLOCK grew faster than the input.`,
    );
    console.log(
      '  It does NOT mean the algorithm is superlinear: a linear pass over a much larger live',
    );
    console.log(
      '  heap gets slower per item all on its own. The doubling sweep and the parse-shape',
    );
    console.log('  section below are the algorithmic answers, because they hold the input fixed.');
    const pairs = results.slice(1).map((r, i) => [results[i]!, r] as const);
    console.log(
      table(
        ['stage', ...pairs.map(([a, b]) => `${a.n}->${b.n} (x${(b.n / a.n).toFixed(0)} items)`)],
        stageNames.map((name) => [
          name,
          ...pairs.map(([a, b]) => {
            const big = b.stages[name]!.ms;
            const ratio = big / Math.max(a.stages[name]!.ms, 1e-6);
            const expected = b.n / a.n;
            const flag =
              ratio > expected * SUPERLINEAR_FACTOR && big > NOISE_FLOOR_MS ? '  >LINEAR' : '';
            return `x${ratio.toFixed(1)}${flag}`;
          }),
        ]),
      ),
    );
    console.log('');
  }

  console.log('Per item, median (microseconds per library item). Flat = linear.');
  console.log(
    table(
      ['stage', ...results.map((r) => `${r.n}`)],
      stageNames.map((name) => [
        name,
        ...results.map((r) => ((r.stages[name]!.ms * 1000) / r.n).toFixed(2)),
      ]),
    ),
  );
  console.log('');

  console.log('Memory. `retained` is what the result holds; `peak` is how much this stage');
  console.log('pushed the process high-water mark, so it is a lower bound on transient cost.');
  console.log(
    table(
      ['stage', ...results.flatMap((r) => [`${r.n} retained`, `${r.n} peak+`])],
      stageNames.map((name) => [
        name,
        ...results.flatMap((r) => [
          `${mb(r.stages[name]!.retainedMb)} MB`,
          `${mb(r.stages[name]!.peakDeltaMb)} MB`,
        ]),
      ]),
    ),
  );
  console.log('');

  console.log('Parse shape (B5). The same library, decoded and parsed two ways, through the');
  console.log('`new Response(body).json()` that jellyfinGet calls.');
  console.log('  "largest body" and "total" are COUNTED. ms and MB/s are timed, MB/s off the');
  console.log('  fastest rep -- both shapes quoted alike, so neither is flattered.');
  console.log(
    table(
      ['shape', 'items', 'bodies', 'largest body', 'total', 'ms', 'MB/s', 'us/body'],
      results.flatMap((r) => {
        const total = r.parse.bytes / 1024 / 1024;
        const rate = (best: number) => (total / (best / 1000)).toFixed(0);
        const per = (best: number, bodies: number) => ((best * 1000) / bodies).toFixed(0);
        return [
          [
            'one body (pre-R144)',
            String(r.n),
            '1',
            `${mb(total)} MB`,
            `${mb(total)} MB`,
            ms(r.parse.oneBodyMs),
            rate(r.parse.oneBodyBest),
            per(r.parse.oneBodyBest, 1),
          ],
          [
            `${r.parse.pageSize}-title pages (ships)`,
            String(r.n),
            String(r.parse.pages),
            `${(r.parse.pageBytes / 1024 / 1024).toFixed(2)} MB`,
            `${mb(total)} MB`,
            ms(r.parse.pagedMs),
            rate(r.parse.pagedBest),
            per(r.parse.pagedBest, r.parse.pages),
          ],
        ];
      }),
    ),
  );
  console.log(
    '  Read the paged rows\' us/body column down the table first. That body is the same size',
  );
  console.log(
    '  at every library size, so nothing about parsing it can be superlinear in the library.',
  );
  console.log(
    '  If it rises anyway, the rise belongs to the heap the process is carrying, and any',
  );
  console.log('  ">LINEAR" on a parse above is that same effect wearing a complexity label.');
  const biggest = results[results.length - 1]!;
  console.log(
    `  At ${biggest.n} items the largest single body went from ` +
      `${mb(biggest.parse.bytes / 1024 / 1024)} MB to ` +
      `${(biggest.parse.pageBytes / 1024 / 1024).toFixed(2)} MB, a factor of ` +
      `${(biggest.parse.bytes / biggest.parse.pageBytes).toFixed(0)},`,
  );
  console.log(
    '  and it stays that size for any library. The total is the same bytes either way and',
  );
  console.log(
    '  is linear in the library under both shapes. That is the whole of what R144 changed',
  );
  console.log(
    '  about parsing, and it is a size rather than a speed: it is what one timeout has to',
  );
  console.log('  survive at once.');
  console.log('');

  await doublingSweep();

  if (first.warm) {
    console.log('Warming the ratings cache from empty. Nights RUN, bytes read off the disk.');
    console.log(
      table(
        [
          'items',
          'titles to rate',
          'requests/night',
          'nights',
          'written (measured)',
          'x cache size',
          'pre-R143 (modelled)',
        ],
        results.map((r) => {
          const w = r.warm!;
          const cacheBytes = w.finalBaseBytes + w.finalLogBytes;

          /*
            The only model left in this file, and it describes code that R143
            deleted: `saveCache` serialised the WHOLE cache on every build that
            fetched anything, so warming from empty wrote 400 + 800 + ... + N
            entries -- an arithmetic series, O(N^2).

            It cannot be measured, because the code is gone. It is kept because
            it is the number that justified deleting it, and a fix is easier to
            trust beside the thing it replaced. Every input to it is measured:
            the night count and the requests per night come from the run beside
            it, and bytes-per-entry from the file that run produced.

            It is also SMALLER than the 1.36 GB this project has been quoting,
            and the correction is worth stating rather than quietly shipping.
            The old version of this table divided the whole-library ratings
            fixture by the count of titles matching the locked genres -- 42 MB
            over 25,774 -- and called the result bytes per cache entry. But that
            fixture holds an entry for every title in the library with a TMDb
            id, roughly 45,000 of them, so the true figure is about 950 bytes
            and the one in use was 1,708. It also warmed `matched` titles rather
            than the smaller set that actually has an id to rate, which added
            nights. Both errors pushed the same way. The measured cache this run
            leaves agrees with the corrected figure to within a few per cent,
            which is why it can be trusted over the old one.
          */
          const perNight = w.requestsPerNight * 10;
          const bytesPerEntry = cacheBytes / Math.max(1, r.ratable);
          const wasEntries = (w.nights * (w.nights + 1) * perNight) / 2;

          return [
            String(r.n),
            String(r.ratable),
            String(w.requestsPerNight),
            String(w.nights),
            bytes(w.bytesWritten),
            `x${(w.bytesWritten / Math.max(1, cacheBytes)).toFixed(1)}`,
            bytes(wasEntries * bytesPerEntry),
          ];
        }),
      ),
    );
    console.log('');
    console.log(
      table(
        ['items', 'first night ms', 'cache left: base', 'log', 'bytes/entry', 'read it back ms'],
        results.map((r) => {
          const w = r.warm!;
          return [
            String(r.n),
            ms(w.firstNightMs),
            bytes(w.finalBaseBytes),
            bytes(w.finalLogBytes),
            ((w.finalBaseBytes + w.finalLogBytes) / Math.max(1, r.ratable)).toFixed(0),
            ms(w.readMs),
          ];
        }),
      ),
    );
    console.log(
      '  "x cache size" is R143\'s claim as a number: how many times over the whole cache was',
    );
    console.log(
      '  written to warm it once. Twice is the design; once per night was what it replaced.',
    );
    console.log(
      '  "first night" is one cold build against an instant upstream: the budgeted requests',
    );
    console.log(
      '  plus the first write. A real one is rate-limited, which is why nights are counted.',
    );
    console.log(
      '  "read it back" is the cache in the state the writer leaves it -- a base plus whatever',
    );
    console.log(
      '  log has not been compacted yet, which is the state a household is usually in. It is',
    );
    console.log(
      '  NOT comparable to the `mdblist warm cache` stage above by wall clock: that stage',
    );
    console.log(
      '  reads a compacted base holding every title in the library, and this one holds only',
    );
    console.log(
      '  the titles a room with these two genres asked about. Different caches, different',
    );
    console.log(
      '  sizes. Both sizes are printed: base + log in this table, and the "ratings cache"',
    );
    console.log('  column of the Library table for the other. Compare per megabyte or not at all.');
  } else {
    console.log('Warming the ratings cache: skipped (--skip-warming).');
  }
  console.log('');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
