import { describe, expect, it } from 'vitest';
import { appSources } from '../../../scripts/lib/source-scan';
import { WEIGHTS } from '../../lib/score';
import { en, t, why, type MessageKey } from '../strings';

/**
 * R145: the catalogue, and the promises inside it.
 *
 * Extraction moves every sentence into one file so a second language becomes
 * possible. The risk it introduces is specific and worth naming: a translator
 * sees a string, not a ruling. Four of this project's rulings live entirely in
 * wording, and a well-meaning translation could undo all four without touching
 * a line of logic.
 *
 * So the catalogue is checked the way the components used to be, and the
 * reasons are checked as data rather than left in a comment somebody may not
 * read.
 */

const keys = Object.keys(en) as MessageKey[];

describe('the catalogue is usable', () => {
  it('has entries at all, so nothing below is vacuous', () => {
    expect(keys.length).toBeGreaterThan(5);
  });

  it('gives back plain text for a plain label', () => {
    expect(t('knockout.locked')).toBe('Picks locked in');
  });

  it('fills placeholders', () => {
    expect(t('deck.othersFinished', { done: 1, total: 3 })).toBe('1 of 3 others finished');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    // A stray `{total}` on screen is a bug report. An empty gap is a mystery,
    // and the person who meets it cannot tell you what was missing.
    expect(t('deck.othersFinished', { done: 1 })).toContain('{total}');
  });

  it('never ships an empty string', () => {
    for (const key of keys) {
      expect(t(key).trim(), `${key} is empty`).not.toBe('');
    }
  });
});

describe('the promises survive translation', () => {
  /*
    These are the same assertions the rendering tests make about the screen,
    aimed one level earlier. A translator editing this catalogue gets the same
    red as somebody editing the component -- which is the point of putting the
    reasoning in the file rather than in a review comment.
  */

  it('the download disclosure promises no approval gate (R107, R111)', () => {
    // Matcher requests with an admin key and Jellyseerr auto-approves those by
    // default, so an approval gate is not a promise this app can keep.
    expect(t('deck.cost')).not.toMatch(/approv/i);
  });

  it('the download disclosure states no size (R91)', () => {
    // No size datum reaches this app, and the real figure is not settled until
    // the host's server picks a release.
    expect(t('deck.cost')).not.toMatch(/\d+\s?(gb|mb|tb|gigabyte|megabyte)/i);
    expect(t('deck.cost')).not.toMatch(/min(ute)?s? of video/i);
  });

  it('the peer count is a count, with no room for a name (R46, R61)', () => {
    // The template may interpolate numbers and nothing else. A placeholder
    // called `who` would be the whole defect arriving through the back door.
    const placeholders = [...t('deck.othersFinished').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    expect(placeholders.sort()).toEqual(['done', 'total']);
  });

  it('the deck score still names the sources it is made of (R12)', () => {
    /*
      R12: a statistic never appears without naming what it covers. The three
      percentages in this sentence are WEIGHTS in src/lib/score.ts, read here
      rather than copied, so changing the formula and leaving the copy alone
      goes red -- and so does the reverse.

      Set comparison, not a fixed order: "35% Letterboxd" and "Letterboxd 35%"
      are both honest and a language may need the second. What this cannot see
      is a source paired with the WRONG one of its three numbers; two of the
      three weights are equal, so that pairing is not checkable from the string.
    */
    const line = t('details.deckScore', { score: '85.7' });
    const printed = [...line.matchAll(/(\d+)\s?%/g)].map((m) => Number(m[1]));
    const real = Object.values(WEIGHTS).map((w) => Math.round(w * 100));
    expect(printed.sort((a, b) => a - b)).toEqual(real.sort((a, b) => a - b));
    for (const source of [/Letterboxd/, /IMDb/, /RT|Rotten Tomatoes/]) {
      expect(line, `the deck score no longer names ${source}`).toMatch(source);
    }
  });

  it('the deck score still prints the score (R12)', () => {
    // The weights above survive a sentence with no number in it at all, which
    // would be three sources labelling nothing.
    expect(t('details.deckScore', { score: '85.7' })).toContain('85.7');
  });

  it('the two trailer controls do not collapse into one word (R29)', () => {
    /*
      R29 names the Play button: the sheet opens with zero network and the
      trailer mounts only on tap. "Watch" is the other case -- a link out to
      YouTube for a URL that will not embed. One verb for both stops telling
      anyone which of the two is about to happen, and the difference is whether
      you are leaving the app.
    */
    expect(t('details.playTrailer')).not.toBe(t('details.watchTrailer'));
    expect(t('details.playTrailer')).toMatch(/trailer/i);
    expect(t('details.watchTrailer')).toMatch(/trailer/i);
  });

  it('the hybrid tag stays a fact and does not borrow the cost voice (R42)', () => {
    /*
      R42 gives one voice to the thing that spends the host's disk. "Tagged both
      genres" says why the film is high in the deck; it was cut from the card
      face precisely so the one chip a card wears means money and nothing else.
      A film tagged both genres may well already be on the server.
    */
    expect(t('details.hybrid')).not.toMatch(/download|request|disk|server|cost/i);
  });

  it('the abstain label is the one a voice user can say (R134)', () => {
    /*
      WCAG 2.2 A 2.5.3: the accessible name must contain the visible text. The
      knockout uses this single entry for BOTH, which is what keeps them in step
      -- and is why the entry's own `why` tells a translator to keep them
      together rather than leaving it to be rediscovered.
    */
    expect(t('knockout.abstain')).toMatch(/no preference/i);
  });
});

describe('a translator is told why, not just what', () => {
  /** Entries whose wording is a promise rather than a label. */
  const LOAD_BEARING: MessageKey[] = [
    'deck.cost',
    'deck.othersFinished',
    'deck.undo',
    'knockout.abstain',
    'knockout.overlap',
    'knockout.hidden',
    // The details sheet. Four of its six entries are promises: what the deck
    // score is made of (R12), which trailer control leaves the app (R29), and
    // that the hybrid tag is a fact rather than a cost (R42). The other two --
    // the sheet's own name and the iframe's -- are labels, and say so by
    // carrying no reason.
    'details.deckScore',
    'details.hybrid',
    'details.playTrailer',
    'details.watchTrailer',
  ];

  for (const key of LOAD_BEARING) {
    it(`${key} carries its reasoning`, () => {
      const reason = why(key);
      expect(reason, `${key} is load-bearing and says nothing about why`).not.toBe('');
      // Long enough to be a reason rather than a restatement of the string.
      expect(reason.length).toBeGreaterThan(60);
    });
  }

  it('cites the rulings, so the reason can be followed to its argument', () => {
    // A reason that cannot be traced is an assertion. These point at
    // docs/RULINGS.md, which indexes every one of them.
    const cited = LOAD_BEARING.map(why).join(' ');
    expect(cited).toMatch(/R\d{2,3}/);
  });
});

/**
 * R146: a sentence lives in the catalogue or in a component, never both.
 *
 * Migrating the knockout left the deck's strings defined in the catalogue AND
 * still hardcoded in `SwipeDeck.tsx` -- so the download disclosure, the one
 * sentence R107 and R91 are entirely about, existed in two places at once.
 * Two copies is worse than the one it started as: the tests assert the rendered
 * screen, so the component's copy is the one that ships and the catalogue's is
 * the one a translator would edit. They would have drifted silently.
 *
 * A partial migration is fine. A duplicated string is not, and the difference
 * is checkable.
 */
describe('no message is hardcoded as well as catalogued', () => {
  /*
    The UI, which is what this catalogue covers.

    The first version scanned every app source and failed on `lobby.scopeLocal`
    ("Jellyfin only") because `server/diagnose.ts` says "Switching the room back
    to Jellyfin only will work now" — a different sentence that happens to name
    the mode. That is a substring collision, not a duplicated message, and a
    guard that cannot tell them apart would have pushed me to either mangle a
    diagnostic or stop cataloguing short labels.

    Server-side diagnostic copy is its own surface with its own wording. If it
    is ever catalogued too, this scope widens with it.
  */
  const sources = appSources().filter(
    (f) => f.path.startsWith('src/ui/') || f.path.startsWith('app/'),
  );

  for (const key of keys) {
    const text = t(key);
    it(`${key} appears once, in the catalogue`, () => {
      const holders = sources.filter((f) => f.code.includes(text)).map((f) => f.path);
      expect(
        holders,
        `"${text.slice(0, 45)}..." is in ${holders.length} UI files; a component still has its own copy`,
      ).toEqual(['src/ui/strings.ts']);
    });
  }
});
