// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOTE_POINTS } from '../../lib/match';
import type { MovieCandidate } from '../../lib/types';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/*
  The winner screen's request control reaches the socket, and the state this
  file cares about is the one it is in WHILE that call is outstanding. A promise
  that never settles parks it there.
*/
vi.mock('../socket', () => ({
  emitAck: () => new Promise(() => {}),
  saveSession: vi.fn(),
  getAuthToken: () => null,
  getAuthName: () => null,
  setAuth: vi.fn(),
}));

const { Confetti } = await import('../components/Confetti');
const { Knockout } = await import('../components/Knockout');
const { Lobby } = await import('../components/Lobby');
const { MovieDetails } = await import('../components/MovieDetails');
const { SwipeDeck } = await import('../components/SwipeDeck');
const { WinnerScreen } = await import('../components/WinnerScreen');

/**
 * U7: the audit, where it can be executed.
 *
 * docs/ACCESSIBILITY.md states the target — WCAG 2.2 Level AA — and grades
 * every applicable criterion. Most of that grading is prose, because most of
 * these criteria are about pixels and this file has none.
 *
 * WHAT JSDOM CANNOT DO, SAID ONCE HERE SO NO COMMENT BELOW IMPLIES OTHERWISE:
 *
 * - It does not lay out. Every element is 0x0 and getBoundingClientRect
 *   returns zeroes, so 2.5.8 Target Size, 1.4.10 Reflow, 2.4.11 Focus Not
 *   Obscured and 1.4.12 Text Spacing are not merely hard here, they are
 *   unreachable. A test that asserted a Tailwind class as a proxy for a size
 *   would be asserting the cause and claiming the effect, which is what R125
 *   and R129 are about.
 * - It does not load app/globals.css and does not cascade. getComputedStyle
 *   returns the inline style and the UA default, so no contrast ratio (1.4.3,
 *   1.4.11) and no focus indicator (2.4.7) can be measured. `npm run contrast`
 *   measures those against committed pixels; that is the tool for them.
 * - It has no viewport, no zoom and no orientation.
 *
 * So this file covers the criteria that live in the DOM: names, roles, what is
 * exposed to the accessibility tree, what a keyboard can reach, and whether a
 * gesture has a button behind it. Where a criterion FAILS today it is written
 * up in docs/ACCESSIBILITY.md rather than tested, because a test cannot be both
 * green and a record of a defect.
 */

afterEach(cleanup);

/* ------------------------------------------------------------------ helpers */

/**
 * A deliberately reduced accessible-name computation: aria-label, then
 * aria-labelledby, then an associated <label>, then the element's own text,
 * then title.
 *
 * It is NOT the accname algorithm. It does not walk aria-labelledby into
 * further labelling, does not honour presentational roles, and does not know
 * that CSS `display: none` removes text from the name. Every case below only
 * asks "is this empty", which is the one question the shortcut answers the same
 * way the real algorithm would.
 */
function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label?.trim()) return label.trim();

  const ids = el.getAttribute('aria-labelledby');
  if (ids) {
    const doc = el.ownerDocument;
    const text = ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const fromLabels = [...el.labels ?? []].map((l) => l.textContent ?? '').join(' ').trim();
    if (fromLabels) return fromLabels;
  }

  const text = (el.textContent ?? '').trim();
  if (text) return text;

  return (el.getAttribute('title') ?? '').trim();
}

/** Everything a Tab can land on, in a tree this app actually produces. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, iframe, [tabindex]:not([tabindex="-1"])';

/** Controls that must carry a name. Deliberately not `[role]`-driven: these are the real ones. */
const NAMED = 'button, a[href], input:not([type="hidden"]), iframe';

/* ----------------------------------------------------------------- fixtures */

function movie(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tmdbId: Number(id.replace(/\D/g, '')) || 1,
    imdbId: null,
    title: `Film ${id}`,
    year: 2001,
    runtime: 100,
    posterUrl: null,
    genres: ['Action'],
    isHybrid: false,
    jellyfinItemId: 'jf-1',
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: 80, rt: null, composite: 80 },
    ...overrides,
  } as unknown as ClientRoom['deck'][number];
}

function card(overrides: Partial<MovieCandidate> = {}): MovieCandidate {
  return {
    id: 'm1',
    tmdbId: 1,
    imdbId: 'tt1',
    title: 'The Thing',
    year: 1982,
    runtime: 109,
    posterUrl: null,
    genres: ['Horror', 'Sci-Fi'],
    isHybrid: false,
    jellyfinItemId: 'jf-1',
    description: 'A crew in Antarctica meets something that imitates them.',
    trailerUrl: 'https://www.youtube.com/watch?v=abc123',
    allRatings: [{ source: 'imdb', score: 84 }],
    scores: { letterboxd: 88, imdb: 84, rt: 85, composite: 85.7 },
    ...overrides,
  } as unknown as MovieCandidate;
}

function room(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'SWIPING',
    settings: { scope: 'local', maxRuntime: null, deckLimit: 50 },
    lockedGenres: ['Action', 'Comedy'],
    users: {
      u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: false },
      u_2: { id: 'u_2', name: 'Bex', ready: true, connected: true, authed: false },
    },
    knockout: { phase: 'DONE', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
    deck: [movie('1'), movie('2'), movie('3')],
    progress: { u_1: 0 },
    votes: {},
    winner: null,
    winnerViaFallback: false,
    winnerRanking: null,
    winnerPlayUrl: null,
    winnerRequest: null,
    rejected: [],
    othersFinished: 0,
    submittedCount: 2,
    votedCount: 2,
    deckExhausted: false,
    ...overrides,
  } as ClientRoom;
}

/** The knockout's first phase: genres listed, nothing submitted yet. */
function picking(): ClientRoom {
  return room({
    status: 'KNOCKOUT',
    knockout: { phase: 'CHECKBOX', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
  });
}

function hook(r: ClientRoom, overrides: Partial<RoomHook> = {}): RoomHook {
  return {
    room: r,
    userId: 'u_1',
    match: null,
    diagnosis: null,
    clearDiagnosis: vi.fn(),
    error: null,
    connecting: false,
    join: vi.fn(),
    setReady: vi.fn(),
    updateSettings: vi.fn(),
    listGenres: vi.fn(async () => ['Action', 'Comedy', 'Horror']),
    submitGenres: vi.fn(),
    eliminate: vi.fn(),
    undoVote: vi.fn(),
    rejectWinner: vi.fn(),
    vote: vi.fn(),
    ...overrides,
  } as unknown as RoomHook;
}

/* ---------------------------------------------- 2.5.1 / 2.5.7, gestures */

describe('SC 2.5.1 Pointer Gestures and SC 2.5.7 Dragging Movements', () => {
  /*
    Both criteria say the same thing about this app: the deck is a swipe
    interface, so every vote a drag can cast must also be reachable without one.
    2.5.1 covers it as a path-based gesture, 2.5.7 (new in 2.2) as a dragging
    movement; a single-pointer, non-path alternative satisfies both.

    R06 has claimed this since the first draft and the README promises it. What
    guarded it was `deck.render.test.tsx` asserting two of the four labels
    exist, which is a claim about the DOM and not about the vote — R129's
    "the control asserted and never pressed", the shape that left twelve undo
    cases green while the handler was disconnected.

    So this presses all four and checks the value that came out.
  */
  it('casts every one of the four weights from a button, not only a swipe', () => {
    const vote = vi.fn(async () => {});
    render(<SwipeDeck roomHook={hook(room(), { vote })} />);

    const pressed: number[] = [];
    for (const [name, points] of [
      ['Vote no on Film 1, -5', VOTE_POINTS.DISLIKE],
      ['Vote maybe on Film 1, +1', VOTE_POINTS.MAYBE],
      ['Vote yes on Film 1, +2', VOTE_POINTS.LIKE],
      ['Strong yes on Film 1, +3', VOTE_POINTS.SUPER],
    ] as const) {
      vote.mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(vote, `"${name}" is on screen but casts nothing`).toHaveBeenCalledWith('1', points);
      pressed.push(points);
    }

    /*
      SwipeCard.handleDragEnd can emit LIKE, DISLIKE and MAYBE; SUPER has no
      gesture at all by design (R49). Checking against VOTE_POINTS rather than
      against the three the drag emits means adding a fifth weight with a
      gesture and no button fails here too.
    */
    expect(new Set(pressed)).toEqual(new Set(Object.values(VOTE_POINTS)));
  });
});

/* --------------------------------------------------- 4.1.2 Name, Role, Value */

describe('SC 4.1.2 Name, Role, Value — every control is named', () => {
  /*
    An unnamed control is announced as "button" and nothing else, and is
    unreachable by voice. Several controls here are a bare icon — the details
    disc on the card, the sheet's close — so their whole name is an attribute
    and deleting it leaves a button that still looks right.

    This is a class guard, not a claim about one past defect, and the cases
    differ in how much each one can catch. Checked, not assumed: stripping the
    details disc's aria-label turns the deck case red, and stripping the sheet's
    aria-label="Close" turns the sheet case red. The genre-picker case has no
    icon-only control in it today, so nothing short of emptying a button will
    move it; it is here so that adding one cannot ship unnamed.

    The name computation is the reduced one at the top of this file. It answers
    "is this empty", which is all that is asked.
  */
  function everyControlIsNamed(container: HTMLElement, where: string) {
    const controls = [...container.querySelectorAll(NAMED)];
    expect(controls.length, `${where}: no controls found; this case would be vacuous`).toBeGreaterThan(0);
    for (const el of controls) {
      expect(
        accessibleName(el),
        `${where}: a <${el.tagName.toLowerCase()}> has no accessible name — ${el.outerHTML.slice(0, 120)}`,
      ).not.toBe('');
    }
  }

  it('on the deck', () => {
    const { container } = render(<SwipeDeck roomHook={hook(room({ progress: { u_1: 1 } }))} />);
    everyControlIsNamed(container, 'deck');
  });

  it('on the details sheet, including the trailer frame', () => {
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    everyControlIsNamed(dialog as HTMLElement, 'details sheet');
    fireEvent.click(screen.getByRole('button', { name: /play trailer/i }));
    // An <iframe> is a document in the tab order; unnamed, it is announced as
    // "frame" with no idea what is inside it.
    everyControlIsNamed(screen.getByRole('dialog') as HTMLElement, 'details sheet, trailer playing');
  });

  it('on the winner screen, all the way into the state where the button goes quiet', () => {
    /*
      The sending state is the one that has actually been wrong here (R113,
      pinned as T115): the commit button's only child was an aria-hidden
      spinner, so pressing "Yes, ask" left a screen reader user with a button
      that had no name at all — at the one moment where silence and success
      look identical and the difference is a download on somebody else's disk.

      Reaching it is the whole point of the socket mock at the top of the file.
      Stopping at the confirm panel, as the first draft of this case did, checks
      three buttons that carry their own text and never touches the defect.
    */
    const finished = room({
      status: 'FINISHED',
      winner: '1',
      deck: [movie('1', { jellyfinItemId: null })],
      progress: { u_1: 1 },
      deckExhausted: true,
    });
    const { container } = render(<WinnerScreen roomHook={hook(finished)} match={null} />);
    everyControlIsNamed(container, 'winner');

    fireEvent.click(screen.getByRole('button', { name: /request via jellyseerr/i }));
    everyControlIsNamed(container, 'winner, confirming');

    fireEvent.click(screen.getByRole('button', { name: /yes, ask/i }));
    everyControlIsNamed(container, 'winner, request in flight');
  });

  it('on the genre picker', async () => {
    const { container } = render(<Knockout roomHook={hook(picking())} />);
    await screen.findByRole('button', { name: /pick action/i });
    everyControlIsNamed(container, 'genre picker');
  });
});

/* --------------------------------------- 1.1.1 Non-text Content, icons */

describe('SC 1.1.1 Non-text Content', () => {
  it('gives the poster the film’s name rather than leaving it to be read as a filename', () => {
    const withPoster = room({ deck: [movie('1', { posterUrl: 'http://jf/p1.jpg' }), movie('2')] });
    const { container } = render(<SwipeDeck roomHook={hook(withPoster)} />);
    const img = container.querySelector('img');
    expect(img, 'no poster rendered; this case would be vacuous').toBeTruthy();
    expect(img?.getAttribute('alt')).toContain('Film 1');
  });

  it('exposes no icon as a nameless graphic', () => {
    /*
      Every glyph in this app is decoration beside a word (R25), and an icon
      exposed as a nameless <svg> is announced as a graphic sitting between the
      word and the button it belongs to.

      WHAT THIS DOES NOT CATCH, established by running it rather than by
      reasoning about it: lucide-react emits aria-hidden="true" on every icon by
      itself, unless one is passed. So deleting `aria-hidden` from an <Info /> in
      the source changes the rendered DOM not at all and leaves this green. The
      explicit props in the components are documentation, not the mechanism.

      What it does catch is an icon explicitly exposed (aria-hidden={false},
      which does turn this red) and any hand-written <svg> added later, which
      gets no default from anybody. That is a smaller claim than "the app hides
      its icons" and it is the one written on the tin.
    */
    const decks = render(<SwipeDeck roomHook={hook(room())} />);
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const svgs = [
      ...decks.container.querySelectorAll('svg'),
      ...(screen.getByRole('dialog').querySelectorAll('svg')),
    ];
    expect(svgs.length, 'no icons rendered; this case would be vacuous').toBeGreaterThan(0);
    for (const svg of svgs) {
      const hidden = svg.getAttribute('aria-hidden') === 'true';
      const named = accessibleName(svg) !== '';
      expect(hidden || named, `an icon is neither hidden nor named: ${svg.outerHTML.slice(0, 100)}`).toBe(true);
    }
  });
});

/* ------------------------- 4.1.2 / 2.4.3, hidden-but-focusable */

describe('SC 4.1.2 — nothing focusable is hidden from the accessibility tree', () => {
  /*
    The deck keeps three cards mounted and marks the two behind the top one
    aria-hidden. A focusable element inside an aria-hidden subtree is the worst
    of both: a sighted keyboard user tabs to it, and a screen reader is told
    nothing is there. It is also invisible to every test that queries by role,
    because the role query skips hidden subtrees.

    The card's details control is rendered only when the card is active, which
    is what keeps this true. Render it unconditionally and this goes red.
  */
  it('on the deck, where two cards are mounted behind the top one', () => {
    const { container } = render(<SwipeDeck roomHook={hook(room())} />);

    const hiddenSubtrees = [...container.querySelectorAll('[aria-hidden="true"]')];
    expect(
      hiddenSubtrees.length,
      'no aria-hidden subtree found; the deck no longer stacks and this case is vacuous',
    ).toBeGreaterThan(0);

    for (const subtree of hiddenSubtrees) {
      const reachable = subtree.querySelectorAll(FOCUSABLE);
      expect(
        [...reachable].map((el) => el.outerHTML.slice(0, 100)),
        'a control inside an aria-hidden subtree: tabbable, and announced as nothing',
      ).toEqual([]);
    }
  });
});

/* ------------------------------------------------ 2.1.2 No Keyboard Trap */

describe('SC 2.1.2 No Keyboard Trap — the details sheet', () => {
  /*
    This is the one place in the app that deliberately holds focus (R31), so it
    is the one place this criterion can be failed. 2.1.2 does not forbid a trap;
    it requires a keyboard-only way out, and — for a trap that is not standard
    tab behaviour — that the method be advised. Escape is the way out and it is
    already covered in details.render.test.tsx.

    What is NOT covered anywhere is the other half: that the trap CYCLES rather
    than dead-ending. A trap that preventDefaults Tab without moving focus
    leaves a keyboard user pinned on one control with the rest of the sheet
    unreachable, and it would pass every existing case in this repository.

    Scope, in the R126 sense: this proves the wrap in both directions and that
    Escape still fires from the last element. It says nothing about a real
    browser's tab order, which jsdom does not implement — nothing here presses
    Tab, it dispatches a keydown and reads where the handler put focus.
  */
  function focusablesInSheet(): HTMLElement[] {
    const sheet = screen.getByRole('dialog').querySelector('[data-app-focus]');
    return [...(sheet?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
  }

  it('wraps forward from the last control instead of dead-ending on it', () => {
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const focusable = focusablesInSheet();
    expect(focusable.length, 'the sheet holds fewer than two controls; a wrap cannot be observed').toBeGreaterThan(1);

    const last = focusable[focusable.length - 1]!;
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('wraps backward from the first control', () => {
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const focusable = focusablesInSheet();
    const first = focusable[0]!;
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it('still releases on Escape from inside the trap', () => {
    const onClose = vi.fn();
    render(<MovieDetails card={card()} onClose={onClose} />);
    const focusable = focusablesInSheet();
    focusable[focusable.length - 1]!.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

/* --------------------------------------------------- 4.1.3 Status Messages */

describe('SC 4.1.3 Status Messages — the deck', () => {
  /*
    The card changes without focus moving anywhere, so without a live region a
    screen reader user votes, hears nothing, and votes again on a film they were
    never told about. R22 put one polite region on the deck.

    Two things matter and only one of them was ever guarded: that the region
    exists, and that its text FOLLOWS the card. A region announcing a constant
    string is a region that says nothing, and it passes any test that only looks
    for role="status".
  */
  it('names the card in a polite live region, and follows it when the card changes', () => {
    const { container, rerender } = render(<SwipeDeck roomHook={hook(room())} />);
    /*
      The sr-only one. R136 made the deck's "N of M others finished" a live
      region as well, and it comes first in the DOM, so a bare
      `[role="status"]` now selects the count rather than the card.
    */
    const region = container.querySelector('.sr-only[role="status"]');
    expect(region, 'the deck has no live region at all').toBeTruthy();
    expect(region?.textContent).toContain('Film 1');
    expect(region?.textContent).toContain('1 of 3');

    rerender(<SwipeDeck roomHook={hook(room({ progress: { u_1: 1 } }))} />);
    const after = container.querySelector('.sr-only[role="status"]');
    expect(after?.textContent).toContain('Film 2');
    expect(after?.textContent).not.toContain('Film 1,');
  });

  it('says whether the card costs the host a download, where the cost line is the other half', () => {
    // The chip and the cost line are visual (R42); the live region is the only
    // route this fact takes to somebody who cannot see either.
    const wide = room({ deck: [movie('9', { jellyfinItemId: null }), movie('2')] });
    const { container } = render(<SwipeDeck roomHook={hook(wide)} />);
    // The sr-only region, for the same reason as above: the deck has more than
    // one live region since R136, and the visible one is a count.
    expect(container.querySelector('.sr-only[role="status"]')?.textContent).toMatch(
      /not on your server/i,
    );
  });
});

/* ------------------------------------------------------ 1.4.1 Use of Color */

describe('SC 1.4.1 Use of Color — the genre picker', () => {
  /*
    R18/R26 in the one place they are easiest to lose: a picked genre row and an
    unpicked one differ by a tone class (`text-maybe` against `text-muted-fg`)
    and by a glyph. Delete the glyph and the rows are identical to anybody who
    cannot separate cyan from grey — and the aria-pressed state, which the
    lobby's tests do assert, is no help at all to that person.

    R129's exact shape: the assertion has to be about what the eye sees, so
    sr-only and aria-hidden text is stripped before comparing.
  */
  function visibleText(el: Element): string {
    const clone = el.cloneNode(true) as HTMLElement;
    for (const gone of clone.querySelectorAll('.sr-only, [aria-hidden="true"]')) gone.remove();
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('marks a picked row with something visible that an unpicked row does not have', async () => {
    render(<Knockout roomHook={hook(picking())} />);
    const action = await screen.findByRole('button', { name: 'Pick Action' });
    const comedy = screen.getByRole('button', { name: 'Pick Comedy' });

    const before = visibleText(action);
    expect(before, 'the unpicked row shows nothing at all').not.toBe('');
    expect(before).toBe(visibleText(comedy).replace('Comedy', 'Action'));

    fireEvent.click(action);

    const picked = screen.getByRole('button', { name: 'Action, picked' });
    expect(
      visibleText(picked),
      'picked and unpicked rows look identical: the only difference left is colour',
    ).not.toBe(before);
  });
});

/* --------------------------------------------- 2.2.2 / 2.4.11, the confetti */

describe('the winner screen’s confetti', () => {
  /*
    Fifty animated elements laid over the whole viewport at z-50, on the screen
    that takes focus for a screen reader (R52). Two properties keep that from
    being a problem, and both are observable here: it is hidden from the
    accessibility tree, and it does not take pointer events.

    NOT observable here, and therefore NOT claimed: that it stops. The durations
    are framer-motion transitions on elements jsdom never animates, so the fact
    that the longest piece finishes in about 3.6s — inside 2.2.2's five-second
    allowance — is readable in Confetti.tsx and provable in a browser, nowhere
    else. Nor does this see the reduced-motion branch: framer-motion's
    useReducedMotion reads window.matchMedia once per module load, so a value
    set in one case is cached for the rest of the file.
  */
  it('is hidden from the accessibility tree and takes no pointer events', () => {
    const { container } = render(<Confetti />);
    const layer = container.firstElementChild;
    expect(layer, 'nothing rendered; this case would be vacuous').toBeTruthy();
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.className).toContain('pointer-events-none');
  });
});

/**
 * R133: two failures the audit found, fixed and pinned.
 *
 * Both were invisible to every existing check, and both are the same shape --
 * a claim made in a comment that the code did not keep.
 */
describe('the installed app is allowed to rotate', () => {
  it('locks no orientation', async () => {
    /*
      WCAG 2.2 AA 1.3.4. `orientation: 'portrait'` in the manifest locks the
      installed app -- a phone in a stand, or somebody who holds a device one
      way because of how they sit, could not turn it. The layout is one column
      and reflows either way, so the lock bought nothing.
    */
    const manifest = (await import('../../../app/manifest')).default();
    expect(manifest.orientation).toBeUndefined();
  });
});

/**
 * R134 / WCAG 2.2 A 2.5.3 Label in Name, as a rule rather than two instances.
 *
 * A control's accessible name must contain the text shown on it, so somebody
 * driving the phone by voice can say what they can see. Two controls failed:
 * the knockout's abstain row read "No preference" and was named "Abstain — go
 * with the room", with not one word in common, and it is the control R47 added
 * FOR the person who does not want to invent an opinion. The deck's undo row
 * read "Undo — <film>" and was named "Undo your vote on <film>".
 *
 * Checking the two instances would leave the third to be found by a user. This
 * walks every labelled control the screen renders and checks the relationship,
 * so a new control is covered by existing here rather than by somebody
 * remembering.
 */
/*
  Controls only. The criterion is about things you can operate by voice, and the
  first draft of this walked every `[aria-label]` — which caught the vote row's
  `role="group"` labelled "Vote" (a container whose text is four separate
  buttons) and the details sheet's dialog label (a container whose text is the
  whole sheet). Both are correctly labelled containers, and reporting them as
  failures would have taught the next reader to ignore this check.
*/
const CONTROLS = [
  'button',
  'a[href]',
  'input',
  '[role="button"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
].join(',');

function expectSpeakableNames(container: HTMLElement) {
  for (const el of container.querySelectorAll<HTMLElement>(CONTROLS)) {
    const label = el.getAttribute('aria-label');
    if (!label) continue;
    const name = label.toLowerCase();
    /*
      Joined with spaces, not `textContent`. A row renders its gutter tag and
      its title as separate elements, and concatenating them produced
      "backundo" and "1puts" — a control that reads fine on screen failing on
      words no human would ever say.
    */
    const visible: string[] = [];
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = (n.parentElement as HTMLElement | null) ?? null;
      if (parent?.closest('.sr-only') || parent?.closest('[aria-hidden="true"]')) continue;
      visible.push(n.textContent ?? '');
    }
    const flat = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    /*
      The control's LABEL, not everything written inside it.

      2.5.3 is about the text that identifies a control, so a voice user can say
      what they see. It is not a rule that every descriptive word must be in the
      name — and the first version of this demanded exactly that, which failed
      the abstain row for the sentence underneath it ("Counts as voted, weighs
      nothing") that no one would ever say to operate it. A check that fails
      correct code teaches the next reader to delete it.

      The label is the first substantive visible run: the gutter tags these rows
      carry (ANY, BACK, MAX) are short all-caps category markers, and the glyphs
      are punctuation.
    */
    const runs = visible.map(flat).filter((t) => t.length > 0);
    const label_text = runs.find((t) => !(t.length <= 4 && !/\d/.test(t))) ?? runs[0];
    if (!label_text) continue; // icon-only: the name IS the label
    expect(
      flat(name),
      `"${label_text}" is on screen but the control is named "${label}" — ` +
        'a voice user saying what they see would not reach it',
    ).toContain(label_text);
  }
}

describe('every control can be spoken to (2.5.3)', () => {
  it('on the deck, where the undo row failed', () => {
    const voted = room({ progress: { u_1: 1 } });
    const { container } = render(<SwipeDeck roomHook={hook(voted)} />);
    expectSpeakableNames(container);
  });

  it('on the elimination ballot, where the abstain row failed', () => {
    /*
      The ELIMINATION phase specifically. The first version of this rendered
      `picking()` — the checkbox phase — where the abstain control is plain
      text with no aria-label, so restoring the old "Abstain — go with the
      room" name left it green. The control this test is named for is on the
      other screen.
    */
    const ballot = room({
      status: 'KNOCKOUT',
      knockout: {
        phase: 'ELIMINATION',
        submissions: {},
        pool: ['Action', 'Comedy', 'Drama'],
        locked: [],
        elimVotes: {},
        needsRevote: false,
      },
    });
    const { container } = render(<Knockout roomHook={hook(ballot)} />);
    expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy();
    expectSpeakableNames(container);
  });

  it('on the winner screen, which has the costly control on it', () => {
    const { container } = render(
      <WinnerScreen roomHook={hook(room({ status: 'FINISHED' }))} match={null} />,
    );
    expectSpeakableNames(container);
  });

  it('on the details sheet, which portals out of its own container', () => {
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    // The sheet renders into <body> (R81), so the container is the document.
    expectSpeakableNames(document.body);
  });
});

/**
 * R136 / SC 4.1.3: the counts the room watches announce themselves.
 *
 * R22, R85 and R113 put live regions on the deck's card announcement, the
 * loading skeleton, the waiting screens and the request result. Three counts
 * were missed, and they are the ones that move because somebody ELSE pressed
 * something, with focus nowhere near them — which is exactly the condition
 * 4.1.3 exists for.
 *
 * Opt-in rather than automatic: a screen full of polite regions talks over
 * itself. A row that only changes when you change it does not need announcing,
 * because you already know.
 */
describe('SC 4.1.3 — counts that move because of other people', () => {
  it('announces the lobby ready count, which is the lobby entire job', async () => {
    const { Lobby } = await import('../components/Lobby');
    const lobby = room({ status: 'LOBBY' });
    const { container } = render(<Lobby roomHook={hook(lobby)} />);
    const regions = [...container.querySelectorAll('[role="status"]')];
    const ready = regions.find((r) => /\d+ of \d+ ready/.test(r.textContent ?? ''));
    expect(ready, 'the ready count is not in a live region').toBeTruthy();
    expect(ready?.getAttribute('aria-live')).toBe('polite');
  });

  it('announces how many others have finished, which is all R46 lets it say', () => {
    const { container } = render(<SwipeDeck roomHook={hook(room({ othersFinished: 1 }))} />);
    const regions = [...container.querySelectorAll('[role="status"]')];
    const finished = regions.find((r) => /others finished/.test(r.textContent ?? ''));
    expect(finished, 'the peer count is not in a live region').toBeTruthy();
    expect(finished?.getAttribute('aria-live')).toBe('polite');
  });

  it('announces the knockout count as the room answers', async () => {
    const { container } = render(<Knockout roomHook={hook(picking())} />);
    const regions = [...container.querySelectorAll('[role="status"]')];
    const counted = regions.find((r) => /\d+ of \d+ in/.test(r.textContent ?? ''));
    expect(counted, 'the submitted count is not in a live region').toBeTruthy();
  });
});

describe('SC 1.3.1 Info and Relationships -- every room screen has one h1', () => {
  /*
    F8, executed. `Lobby`, `Knockout` and `SwipeDeck` rendered <h2> and nothing
    above it: Group's section titles and SwipeCard's film title claimed to be
    second-level headings under no first-level heading at all, so heading
    navigation on the deck landed on a film title with nothing over it.

    This is a rule rather than three instances, the way R153 did it for names:
    every screen a room spends its evening on, checked for exactly one h1 with
    a real accessible name. "Exactly one" matters as much as "at least one" --
    two h1s is the same structural lie in the other direction.

    Deliberately not a pin. A pin would find `<h1` in the source and be
    satisfied by one sitting in a branch that never renders; these mount the
    screen and read the heading off it.
  */
  const SCREENS: Array<[string, () => React.ReactElement]> = [
    ['the lobby', () => <Lobby roomHook={hook(room({ status: 'LOBBY' }))} />],
    ['the genre picker', () => <Knockout roomHook={hook(picking())} />],
    ['the deck', () => <SwipeDeck roomHook={hook(room())} />],
  ];

  for (const [name, mount] of SCREENS) {
    it(`${name} has exactly one first-level heading`, () => {
      const { container } = render(mount());
      const h1s = [...container.querySelectorAll('h1')];
      expect(h1s.length, `${name} has ${h1s.length} h1 elements, not one`).toBe(1);
      expect(
        accessibleName(h1s[0]!).trim(),
        `${name}'s h1 has no accessible name`,
      ).not.toBe('');
    });
  }

  it('the elimination round keeps its heading too', () => {
    // The knockout is two screens wearing one component, and the second one
    // renders from a different return statement -- so it can lose the heading
    // on its own.
    const ballot = picking();
    ballot.knockout = {
      ...ballot.knockout,
      phase: 'ELIMINATION',
      pool: ['Action', 'Comedy', 'Drama'],
    };
    const { container } = render(<Knockout roomHook={hook(ballot)} />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});
