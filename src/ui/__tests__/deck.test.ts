import { describe, expect, it } from 'vitest';
import { appSources } from '../../../scripts/lib/source-scan';

/**
 * R21: the deck is physically incapable of scrolling.
 *
 * The whole deck screen is one viewport. A scrolling region on it means a
 * person can be voting on a card whose title is above the fold of a box they
 * did not know was a box -- and on a phone, with no scrollbar, there is nothing
 * to tell them. R59 reaffirmed this when the fixed height budget was replaced
 * by a floor.
 *
 * docs/DIRECTION.md names R21 as one of two properties that need a real test
 * rather than a pin, and that test did not exist. In the gap, SwipeCard grew
 * `max-h-[45%] overflow-y-auto` around the title, the year and the ratings
 * line. At a 32px root that content needs roughly 236px against a cap of about
 * 133: the title scrolled out of view and the ratings line was sheared
 * mid-glyph. Nothing was red (R84).
 *
 * A pin could not have caught it. A pin asserts a string is present; this is
 * about a string that must be absent, in a specific set of files.
 */

/** Anything that makes a box scroll. `overflow-hidden` is fine -- it clips, it does not scroll. */
const SCROLLERS = /\boverflow(-x|-y)?-(auto|scroll)\b/g;

/**
 * The deck screen, as a person meets it. MovieDetails is deliberately absent:
 * it is a modal sheet portaled to <body> (R81) and is allowed to scroll,
 * because it is not the deck.
 */
const DECK_FILES = [
  'src/ui/components/SwipeCard.tsx',
  'src/ui/components/SwipeDeck.tsx',
  'src/ui/components/VoteRow.tsx',
];

describe('R21: nothing on the deck scrolls', () => {
  const sources = appSources();

  for (const path of DECK_FILES) {
    const file = sources.find((f) => f.path === path);

    it(`${path} exists and is scanned`, () => {
      // Rename a file without updating this list and every case below would
      // pass on nothing at all.
      expect(file, `${path} is not in appSources() -- did it move?`).toBeTruthy();
    });

    it(`${path} declares no scrolling region`, () => {
      const found = file?.code.match(SCROLLERS) ?? [];
      expect(
        found,
        `${path} declares ${found.join(', ')}. The deck is one viewport (R21): a ` +
          'scrolling box here can hide the title of the card being voted on, with no ' +
          'scrollbar on a phone to say so.',
      ).toEqual([]);
    });
  }

  it('the sheet is still allowed to scroll, being portaled out of the deck', () => {
    const sheet = sources.find((f) => f.path === 'src/ui/components/MovieDetails.tsx');
    expect(sheet?.code).toContain('overflow-y-auto');
    expect(sheet?.code).toContain('createPortal(');
  });
});
