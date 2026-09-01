import { describe, expect, it } from 'vitest';
import { candidatesFromJellyfin, candidatesFromJellyseerr } from '../candidates';
import type { JellyfinMovie } from '../jellyfin';
import type { JellyseerrMovie } from '../jellyseerr';
import type { MdblistMedia } from '../types';

/**
 * R166: the join, which had no tests at all.
 *
 * `candidates.ts` is where a library row, a discover result and a ratings
 * lookup become the thing a room actually swipes. Everything downstream --
 * the deck sort, the cost disclosure, the Play link -- reads what this
 * produces, and nothing checked it.
 *
 * These are the claims that matter rather than field-by-field transcription.
 * The one worth reading twice is the library membership: `jellyfinItemId` is
 * how the app decides whether a film is already yours or something it must ask
 * your server to download (R42, R107).
 */

const media = (over: Partial<MdblistMedia> = {}) =>
  ({
    title: 'Alien',
    description: 'A crew answers a distress call.',
    runtime: 117,
    trailer: 'https://youtu.be/x',
    poster: 'https://img/alien.jpg',
    ids: { imdb: 'tt0078748' },
    ratings: [{ source: 'imdb', score: 84 }],
    ...over,
  }) as unknown as MdblistMedia;

const jfMovie = (over: Partial<JellyfinMovie> = {}): JellyfinMovie => ({
  jellyfinItemId: 'jf-1',
  title: 'Alien',
  year: 1979,
  runtime: 117,
  genres: ['Horror'],
  tmdbId: 348,
  imdbId: 'tt0078748',
  posterUrl: null,
  overview: null,
  ...over,
});

const jsMovie = (over: Partial<JellyseerrMovie> = {}): JellyseerrMovie => ({
  tmdbId: 348,
  title: 'Alien',
  year: 1979,
  posterPath: '/poster.jpg',
  genreIds: [27],
  inLibrary: false,
  ...over,
});

describe('a film from your own library', () => {
  it('is always marked as yours, which is what stops it being offered as a download', () => {
    const [card] = candidatesFromJellyfin([jfMovie()], new Map());
    expect(card!.jellyfinItemId, 'a library film lost the id that proves it is yours').toBe('jf-1');
  });

  it('is identified by TMDb when it can be, so the same film is one card in both modes', () => {
    const [card] = candidatesFromJellyfin([jfMovie()], new Map());
    expect(card!.id).toBe('tmdb-348');
  });

  it('falls back to the Jellyfin id when the scraper gave up', () => {
    /*
      About a tenth of a real library has no TMDb id -- home video, imports,
      anything the scraper could not place. Those titles still enter the deck,
      so the id has to come from somewhere, and two of them sharing `tmdb-null`
      would make them one card.
    */
    const cards = candidatesFromJellyfin(
      [jfMovie({ tmdbId: null, jellyfinItemId: 'jf-a' }), jfMovie({ tmdbId: null, jellyfinItemId: 'jf-b' })],
      new Map(),
    );
    expect(cards.map((c) => c.id)).toEqual(['jf-jf-a', 'jf-jf-b']);
    expect(new Set(cards.map((c) => c.id)).size, 'two films collapsed into one card').toBe(2);
  });

  it('prefers the library’s own description over MDBList’s', () => {
    // Wrong way round would be a defect: the host may have edited it.
    const [card] = candidatesFromJellyfin(
      [jfMovie({ overview: 'The host wrote this.' })],
      new Map([[348, media()]]),
    );
    expect(card!.description).toBe('A crew answers a distress call.');
  });
});

describe('a film that is not in your library yet', () => {
  it('is marked as not yours when the library map does not have it', () => {
    const [card] = candidatesFromJellyseerr([jsMovie()], new Map(), new Map([[27, 'Horror']]));
    expect(card!.jellyfinItemId, 'a film you do not have was presented as already yours').toBeNull();
  });

  it('is marked as yours when the library map does have it', () => {
    const [card] = candidatesFromJellyseerr(
      [jsMovie()],
      new Map(),
      new Map([[27, 'Horror']]),
      new Map([[348, 'jf-42']]),
    );
    expect(card!.jellyfinItemId).toBe('jf-42');
  });

  it('drops a genre id it has no name for, rather than rendering a blank', () => {
    const [card] = candidatesFromJellyseerr(
      [jsMovie({ genreIds: [27, 9999] })],
      new Map(),
      new Map([[27, 'Horror']]),
    );
    expect(card!.genres).toEqual(['Horror']);
  });
});

describe('the two answers to "do you already have this"', () => {
  /*
    R166. `JellyseerrMovie` carries `inLibrary`, derived from Jellyseerr's own
    media status and asserted in jellyseerr.test.ts -- and NOTHING READS IT.
    Library membership is decided entirely by the `libraryByTmdbId` map the
    caller passes in.

    That is defensible: the map is built from the Jellyfin library and yields a
    real item id, which `inLibrary` cannot, and the id is what the Play link
    needs. What is not defensible is leaving two answers to one question with
    nothing recording which wins, next to the disclosure that decides whether
    the app asks the host to spend disk.

    This test does not change the behaviour. It pins it, and names the case
    where the two disagree, so the next person meets a decision rather than a
    surprise.
  */
  it('believes the library map, not Jellyseerr, when they disagree', () => {
    const [card] = candidatesFromJellyseerr(
      [jsMovie({ inLibrary: true })],
      new Map(),
      new Map([[27, 'Horror']]),
      new Map(), // the library scan did not find it
    );
    expect(
      card!.jellyfinItemId,
      'inLibrary started deciding library membership; it cannot, it has no item id',
    ).toBeNull();
  });
});
