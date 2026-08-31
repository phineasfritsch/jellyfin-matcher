import { describe, expect, it } from 'vitest';
import { appSources } from '../../../scripts/lib/source-scan';
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
  const sources = appSources();

  for (const key of keys) {
    const text = t(key);
    // Templates never appear literally in a component; the rest must appear
    // exactly once across the whole app, in the catalogue itself.
    it(`${key} appears once, in the catalogue`, () => {
      const holders = sources
        .filter((f) => f.code.includes(text))
        .map((f) => f.path);
      expect(
        holders,
        `"${text.slice(0, 45)}..." is in ${holders.length} files; a component still has its own copy`,
      ).toEqual(['src/ui/strings.ts']);
    });
  }
});
