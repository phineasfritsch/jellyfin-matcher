/** A movie candidate as it appears in a room's deck, regardless of source. */
export interface MovieCandidate {
  /** Stable deck id, e.g. "tmdb-348". */
  id: string;
  tmdbId: number | null;
  imdbId: string | null;
  title: string;
  year: number | null;
  runtime: number | null; // minutes
  posterUrl: string | null;
  genres: string[];
  /** Tagged with both locked genres — front-of-deck tier. */
  isHybrid: boolean;
  /** Present when the title exists in the Jellyfin library. */
  jellyfinItemId: string | null;
  scores: {
    letterboxd: number | null;
    imdb: number | null;
    rt: number | null;
    composite: number | null;
  };
}

/** One entry of MDBList's ratings[] array. `score` is pre-normalized 0–100. */
export interface MdblistRating {
  source: string;
  value: number | null;
  score: number | null;
  votes: number | null;
}

/** Subset of the MDBList media object the app consumes. */
export interface MdblistMedia {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster: string | null;
  genres: Array<{ id?: number; title?: string; name?: string }> | string[] | null;
  ids: {
    imdb: string | null;
    tmdb: number | null;
    trakt: number | null;
    [k: string]: unknown;
  };
  ratings: MdblistRating[];
}
