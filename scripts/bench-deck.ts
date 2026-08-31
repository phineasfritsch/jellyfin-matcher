/**
 * How long does a deck take to build against a library that is not the
 * maintainer's? (U10.)
 *
 *   npx tsx scripts/bench-deck.ts
 *   npx tsx scripts/bench-deck.ts --sizes 1000,10000
 *   npx tsx scripts/bench-deck.ts --keep      # leave the scratch dir for inspection
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
 * WHAT THIS DOES NOT MEASURE, AND MUST NOT BE READ AS
 *
 * - **Network.** Not transfer time, not TLS, not a NAS spinning up. The stub
 *   answers in microseconds; a real Jellyfin does not.
 * - **Jellyfin's own response time.** The server-side cost of assembling
 *   `/Items` for 50,000 movies with `Fields=Genres,ProviderIds,ProductionYear,
 *   Overview` is entirely absent here, and on a real box it is likely to be the
 *   larger half of the wall clock.
 * - **MDBList.** Every rating is either already cached or answered instantly.
 *   A real cold cache is rate-limited, retried with backoff, and capped by
 *   `MDBLIST_REQUEST_BUDGET`; see the cold-cache section below, which counts
 *   requests and bytes rather than pretending to time them.
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

function syntheticLibrary(n: number): ItemDto[] {
  const rand = prng(SEED);
  const items: ItemDto[] = new Array(n);
  for (let i = 0; i < n; i++) {
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
    items[i] = {
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
  return items;
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

interface Upstreams {
  /**
   * Pre-serialised, and a Buffer rather than a string, for two reasons: the app
   * is not charged for serialisation it would never do, and Buffer bytes live
   * outside the V8 heap, so a 28 MB fixture does not lengthen every collection
   * that happens during a measurement.
   */
  itemsBody: Uint8Array;
  genresBody: Uint8Array;
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
    if (url.includes('/Items?')) return json(up.itemsBody);

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

interface SizeResult {
  n: number;
  matched: number;
  payloadMb: number;
  cacheMb: number;
  stages: Record<string, Sample>;
  deckSize: number;
  coldRequests: number;
  coldSaveMs: number;
}

async function runSize(n: number, scratch: string): Promise<SizeResult> {
  process.stderr.write(`  building fixtures for ${n} items...\n`);

  let items: ItemDto[] | undefined = syntheticLibrary(n);
  const itemsJson = JSON.stringify({ Items: items });
  const payloadMb = Buffer.byteLength(itemsJson) / 1024 / 1024;
  // Which titles have a TMDb id, kept as a plain Set of numbers rather than by
  // holding `items`. `items` and `itemsJson` are both dropped below.
  const knownTmdbIds = new Set<number>();
  for (const item of items) {
    const raw = item.ProviderIds.Tmdb;
    if (raw) knownTmdbIds.add(Number(raw));
  }

  items = undefined;

  const up: Upstreams = {
    itemsBody: Buffer.from(itemsJson),
    genresBody: Buffer.from(JSON.stringify({ Items: GENRES.map((Name) => ({ Name })) })),
    hasMedia: (id) => knownTmdbIds.has(id),
    mdblistRequests: 0,
  };
  installFetchStub(up);

  // A warm ratings cache holding the whole library. This is the steady state a
  // household reaches after a few weeks: every title their genre picks have
  // ever touched is cached, and `getMoviesByTmdbIds` reads and parses the whole
  // file on every deck build regardless of how many ids it was asked about.
  const cacheDir = path.join(scratch, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, 'mdblist.json');
  // Built as text rather than as an object graph, so the 42 MB of fixture at
  // 50,000 items is a transient string and not 50,000 live objects.
  const fetchedAt = Date.now();
  const parts: string[] = ['{'];
  let sep = '';
  for (const id of knownTmdbIds) {
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

  // 1. What the transport hands us. Not the app's cost, but the size everything
  //    downstream is a multiple of.
  stages['JSON.parse(/Items)'] = await measure(reps, () => JSON.parse(itemsJson) as unknown);

  // 2. getMovies: fetch stub + res.json() + mapItem over every row + filterMovies.
  stages['jellyfin.getMovies (2 genres)'] = await measure(reps, () =>
    jellyfin.getMovies({ genres: [...LOCKED] }),
  );
  stages['jellyfin.getMovies (unfiltered)'] = await measure(reps, () => jellyfin.getMovies({}));

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

  // 6. The cold cache, counted rather than timed. What a first night on this
  //    library costs against a metered key, and what one build rewrites.
  const coldCacheFile = path.join(cacheDir, 'cold.json');
  const coldCfg = mdblist.defaultConfig({
    cacheFile: coldCacheFile,
    apiKey: 'bench',
    sleep: async () => {},
  });
  up.mdblistRequests = 0;
  const t0 = performance.now();
  await mdblist.getMoviesByTmdbIds(tmdbIds, coldCfg);
  const coldSaveMs = performance.now() - t0;
  const coldRequests = up.mdblistRequests;

  return {
    n,
    matched,
    payloadMb,
    cacheMb,
    stages,
    deckSize,
    coldRequests,
    coldSaveMs,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sizes = parseSizes(argv);
  const keep = argv.includes('--keep');

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
      results.push(await runSize(n, scratch));
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
  console.log('');

  console.log('Library');
  console.log(
    table(
      ['items', '/Items payload', 'ratings cache', 'matched by genre', 'deck cards'],
      results.map((r) => [
        String(r.n),
        `${mb(r.payloadMb)} MB`,
        `${mb(r.cacheMb)} MB`,
        `${r.matched} (${((r.matched / r.n) * 100).toFixed(0)}%)`,
        String(r.deckSize),
      ]),
    ),
  );
  console.log('');

  console.log('Wall clock, median of reps (ms)');
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
      '  heap gets slower per item all on its own. The doubling sweep below is the algorithmic',
    );
    console.log('  answer, because operation counts have no cache and no garbage collector.');
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

  await doublingSweep();

  console.log('Cold ratings cache. Counted, not timed -- a real run is rate-limited.');
  console.log(
    table(
      ['items', 'titles to rate', 'MDBList requests', 'nights to warm', 'bytes rewritten to warm'],
      results.map((r) => {
        const budget = 40;
        const perNight = budget * 10;
        const nights = Math.ceil(r.matched / perNight);
        // saveCache serialises the WHOLE cache on every build that fetched
        // anything. Warming from empty therefore writes 400 + 800 + ... + N
        // entries: sum of an arithmetic series, i.e. O(N^2) bytes.
        const entriesWritten = (nights * (nights + 1) * perNight) / 2;
        const bytesPerEntry = (r.cacheMb * 1024 * 1024) / Math.max(1, r.matched);
        const gb = (entriesWritten * bytesPerEntry) / 1024 / 1024 / 1024;
        return [
          String(r.n),
          String(r.matched),
          String(r.coldRequests),
          String(nights),
          `${gb.toFixed(2)} GB`,
        ];
      }),
    ),
  );
  console.log('');
  console.log(
    `  One cold build (fetch ${first.coldRequests} batches + rewrite the cache) took ` +
      `${ms(first.coldSaveMs)} ms at ${first.n} items with an instant upstream.`,
  );
  console.log('');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
