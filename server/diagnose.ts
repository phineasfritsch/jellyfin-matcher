/**
 * Turn a deck failure into something a person can act on.
 *
 * Three different causes used to produce one symptom -- an empty or short deck
 * -- and all three reached the host as "it's broken", by text message, at
 * 11pm. A rate-limited ratings service, a rejected Jellyfin key and a pair of
 * genres that simply do not co-occur in the library need three different
 * answers, and only one of them is anybody's fault (R54).
 *
 * `upstream` names the system, `fix` names who can do something and what.
 * Nothing here is shown to the room as a stack trace.
 */

export type Diagnosis = {
  /** Short headline, sentence case, for the top of the failure screen. */
  headline: string;
  /** Which system misbehaved, named as the household would name it. */
  upstream: string;
  /** The technical detail, for the host. Safe to show: never a credential. */
  technical: string;
  /** What can be done, and by whom. */
  fix: string;
  /** True when the room can still play with what it has. */
  recoverable: boolean;
};

/** Pulls an HTTP status out of the error strings the API clients throw. */
function statusIn(message: string): number | null {
  const m = /\b(4\d\d|5\d\d)\b/.exec(message);
  return m ? Number(m[1]) : null;
}

export function diagnoseDeckFailure(err: unknown, deckSize: number): Diagnosis {
  const message = err instanceof Error ? err.message : String(err);
  const status = statusIn(message);

  if (/MDBList/i.test(message)) {
    const limited = status === 429 || /after \d+ retries/i.test(message);
    return {
      headline: limited
        ? 'Ratings service is rate-limited'
        : 'Ratings service is not answering',
      upstream: 'MDBList',
      technical: message,
      fix: limited
        ? 'Nothing to fix — it clears on its own. Cards are here, scores are missing, so the deck order is roughly alphabetical tonight.'
        : 'The host can check MDBLIST_API_KEY. The deck still works without scores.',
      recoverable: deckSize > 0,
    };
  }

  if (/Jellyfin/i.test(message)) {
    const auth = status === 401 || status === 403;
    return {
      headline: auth ? 'Jellyfin rejected the server key' : 'Jellyfin is not answering',
      upstream: 'Jellyfin',
      technical: message,
      fix: auth
        ? 'Only the host can fix this: JELLYFIN_API_KEY is wrong or was revoked. Nobody else in the room can do anything.'
        : 'Only the host can fix this: check JELLYFIN_URL and that the server is up.',
      recoverable: false,
    };
  }

  if (/Jellyseerr|TMDb genre/i.test(message)) {
    return {
      headline: 'Any Movie search is unavailable',
      upstream: 'Jellyseerr',
      technical: message,
      fix: 'The host can check JELLYSEERR_URL and its key. Switching the room back to Jellyfin only will work now.',
      recoverable: false,
    };
  }

  return {
    headline: 'The deck could not be built',
    upstream: 'Matcher',
    technical: message,
    fix: 'Pick genres again. If it keeps happening the host can check the server log.',
    recoverable: false,
  };
}

/**
 * A deck that built but came back thin. Not a failure -- nobody's key is
 * wrong -- but it looks identical to one from the couch, so it says so.
 */
export function diagnoseThinDeck(
  deckSize: number,
  wanted: number,
  genres: string[],
  maxRuntime: number | null,
  scope: 'local' | 'wide',
): Diagnosis | null {
  if (deckSize >= Math.min(wanted, 12)) return null;
  const runtimeClause = maxRuntime != null ? ` under ${maxRuntime} minutes` : '';
  return {
    headline: `Deck is ${deckSize} ${deckSize === 1 ? 'card' : 'cards'}, not ${wanted}`,
    upstream: 'Your library',
    technical: `${genres.join(' + ')}${runtimeClause} matched ${deckSize} of ${wanted}`,
    fix:
      scope === 'local'
        ? 'Nothing is broken — those two genres just do not overlap much here. The host can raise the runtime cap or turn on Any movie.'
        : 'Nothing is broken — those two genres do not overlap much. The host can raise the runtime cap.',
    recoverable: deckSize > 0,
  };
}
