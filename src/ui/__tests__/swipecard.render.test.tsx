// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwipeCard } from '../components/SwipeCard';
import type { MovieCandidate } from '../../lib/types';
import { t } from '../strings';

/**
 * R171: the card itself, rendered.
 *
 * SwipeCard is reached through the deck's tests, which is not the same as
 * being tested: those mount a deck and assert deck things. Three claims live
 * on the card and were pinned only as SOURCE -- A18's poster alt, A22's
 * icon-only details button, and R42's server chip. A pin proves the text is
 * written somewhere in the file. It cannot see which element carries it, or
 * whether the element renders at all.
 */

afterEach(cleanup);

const card = (over: Partial<MovieCandidate> = {}): MovieCandidate =>
  ({
    id: 'tmdb-348',
    tmdbId: 348,
    imdbId: null,
    title: 'Alien',
    year: 1979,
    runtime: 117,
    posterUrl: 'https://img/alien.jpg',
    genres: ['Horror'],
    isHybrid: false,
    jellyfinItemId: 'jf-1',
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: 80, rt: null, composite: 80 },
    ...over,
  }) as MovieCandidate;

const mount = (over: Partial<MovieCandidate> = {}) =>
  render(
    <SwipeCard card={card(over)} onVote={vi.fn()} active onOpenDetails={vi.fn()} />,
  );

describe('the poster is described by the film it shows (A18)', () => {
  it('names the title in the alt text, rather than saying "poster"', () => {
    /*
      A deck is a stack of posters. "Poster" on every one of them tells a
      screen-reader user which card they are on exactly as well as silence
      would.
    */
    mount();
    expect(screen.getByRole('img', { name: /Alien/ })).toBeTruthy();
  });
});

describe('the icon-only control says what is behind it (A22)', () => {
  it('names the film and what opening it offers', () => {
    // R134: the accessible name is the whole of what this control offers,
    // because it has no words on it at all. "More info" would say nothing
    // about whether the press is worth making.
    mount();
    const details = screen.getByRole('button', {
      name: t('card.detailsLabel', { title: 'Alien' }),
    });
    expect(details).toBeTruthy();
  });
});

describe('whether the film is already yours (R42)', () => {
  it('says so when it is not on your server', () => {
    mount({ jellyfinItemId: null });
    expect(screen.getByText(t('card.notOnServer'))).toBeTruthy();
  });

  it('says nothing when it is, because that is the ordinary case', () => {
    /*
      R42 gives one voice to the thing that spends the host's disk. A chip on
      every card would make the chip mean "film" rather than "this one costs
      something", which is the whole point of it.
    */
    mount({ jellyfinItemId: 'jf-1' });
    expect(screen.queryByText(t('card.notOnServer'))).toBeNull();
  });
});

describe('a film with missing metadata still reads as a film', () => {
  it('says the year is unknown rather than printing nothing', () => {
    // The year shares a line with the runtime, so this reads the line rather
    // than looking for an element that holds the phrase alone.
    const { container } = mount({ year: null });
    expect(container.textContent, 'a film with no year showed a gap').toContain(
      t('card.yearUnknown'),
    );
  });

  it('still renders a title when there is no poster to show', () => {
    // A tenth of a real library has no artwork. Those cards are still swiped,
    // and the title is the only thing left identifying them.
    const { container } = mount({ posterUrl: null });
    expect(container.textContent).toContain('Alien');
  });
});
