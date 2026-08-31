/**
 * Pinned claims: the properties this app carries that nothing else asserts.
 *
 * Every entry here is something a redesign, a refactor or a "tidy up the copy"
 * pass would delete without a single other test going red -- an accessibility
 * hook, a caveat, an empty state that explains itself, a disclosure that an
 * action costs something. They accumulated one decision at a time and there is
 * no other record of them.
 *
 * Rules for this file:
 *   - Pin the smallest fragment that carries the meaning, never a full
 *     sentence. A legitimate rewrite must pass; a deletion must fail.
 *   - The haystack is the whole app, comment-stripped. Whole-app so that
 *     moving copy into a shared component is not reported as a loss;
 *     comment-stripped so a deleted sentence quoted in the comment explaining
 *     its deletion cannot satisfy the test protecting it.
 *   - Add a pin before the work that might remove it, never after. A pin
 *     written from a diff can only find what has already gone.
 *   - When a pin legitimately fails, read the rendered page, not the diff,
 *     then change the pin and say in `why` what the new form is and why the
 *     property survives. Never weaken one to something a blank page passes.
 */
import { describe, expect, it } from 'vitest';
import { appHaystack, readDoc } from '../../../scripts/lib/source-scan';

const APP = appHaystack();
const README = readDoc('README.md');

type Pin = { id: string; why: string; find: string };

/**
 * Accessibility. Every one of these is invisible on screen, so a port done for
 * appearance drops them and looks correct to everyone who can see it.
 */
const A11Y: Pin[] = [
  { id: 'A01', why: 'Vote buttons exist for every gesture; the README promises this', find: 'aria-label="Vote"' },
  { id: 'A02', why: 'Each vote button is named, not just an icon', find: 'aria-label={label}' },
  { id: 'A03', why: 'Deck position is announced, not only drawn as a bar', find: 'role="progressbar"' },
  { id: 'A04', why: 'Deck progress bar carries a name', find: 'aria-label="Deck progress"' },
  { id: 'A05', why: 'Genre picking is a labelled group, not loose checkboxes', find: 'aria-label="Genres"' },
  { id: 'A06', why: 'The surviving-genres round is distinguishable from the first', find: 'aria-label="Surviving genres"' },
  { id: 'A07', why: 'Genre toggles report their state', find: 'aria-pressed={on}' },
  { id: 'A08', why: 'Deck size is a real radio group', find: 'role="radiogroup"' },
  { id: 'A09', why: 'Deck size options report which is chosen', find: 'aria-checked=' },
  { id: 'A10', why: 'The details sheet is a modal dialog, escapable and announced', find: 'role="dialog"' },
  { id: 'A11', why: 'The details sheet traps context as a modal', find: 'aria-modal="true"' },
  { id: 'A12', why: 'The details sheet has a named close control', find: 'aria-label="Close details"' },
  { id: 'A13', why: 'Room code entry is labelled', find: 'aria-label="Room code"' },
  { id: 'A14', why: 'Join control is named for screen readers', find: 'aria-label="Join room"' },
  { id: 'A15', why: 'The member list is named', find: 'aria-label="Members"' },
  { id: 'A16', why: 'Final ranking is a named region, not a bare list', find: 'aria-label="Final ranking"' },
  { id: 'A17', why: 'Session settings region is named', find: 'aria-label="Session settings"' },
  { id: 'A18', why: 'Posters carry alt text built from the title', find: 'alt={`${card.title}' },
  { id: 'A19', why: 'Login fields are bound to their labels', find: 'htmlFor="jf-user"' },
  { id: 'A20', why: 'Password field is bound to its label', find: 'htmlFor="jf-pass"' },
  { id: 'A21', why: 'Runtime slider is bound to its label', find: 'htmlFor="runtime"' },
  { id: 'A22', why: 'Icon-only details button is named', find: 'aria-label={`Details for ${card.title}' },
];

/**
 * Errors and connection state have to reach someone who is not looking at that
 * corner of the screen. Five surfaces, five live regions.
 */
const LIVE_REGION_SURFACES = 5;

/**
 * Copy that costs something to remove: it discloses a consequence, explains an
 * empty state, or says what an action will do before it does it.
 */
const COPY: Pin[] = [
  { id: 'C01', why: 'Says why a login is being asked for, instead of gating the whole app silently', find: 'Sign in to search any movie' },
  { id: 'C02', why: 'Discloses that Any Movie triggers a real download request', find: 'Winner gets requested' },
  { id: 'C03', why: 'States the Jellyfin-only scope plainly: it plays tonight', find: 'On the server now' },
  { id: 'C04', why: 'Sign-in names whose account it wants, so it is not phishing-shaped', find: 'Sign in with your Jellyfin account' },
  { id: 'C05', why: 'Empty state explains itself rather than showing a blank panel', find: 'No ratings found for this one.' },
  { id: 'C06', why: 'A session that ends without a winner says so instead of hanging', find: 'No winner could be determined.' },
  { id: 'C07', why: 'The deck build is a stated wait, not a frozen screen', find: 'Building your deck' },
  { id: 'C08', why: 'Reconnection is visible; a silent socket drop looks like a hang', find: 'Reconnecting' },
];

/**
 * Behaviour that is load-bearing but has no obvious home in a unit test, or
 * that a refactor could quietly reverse.
 */
const BEHAVIOUR: Pin[] = [
  { id: 'B01', why: 'Room codes exclude O/0/I/1/L; the README promises no confusing characters', find: "CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'" },
];

/**
 * Documented promises. The README is the only place several of these live, and
 * it is the thing people read before trusting the app with their server.
 */
const DOCS: Pin[] = [
  { id: 'D01', why: 'A maybe never locks a match; stated because it is a deliberate choice', find: 'never triggers a match' },
  { id: 'D02', why: 'Missing rating sources redistribute weight rather than burying a film', find: 'weights redistribute' },
  { id: 'D03', why: 'The 35/35/30 split is admitted to be taste, not science', find: 'not science' },
  { id: 'D04', why: 'The admin API key never reaches the browser', find: 'never reaches the browser' },
  { id: 'D05', why: 'Warns that a guest in an open room sees your library titles', find: 'sees the deck of your library titles' },
  { id: 'D06', why: 'Buttons exist for every gesture, so the app is usable without swiping', find: "Buttons exist for every action too" },
  { id: 'D07', why: 'Sessions expire; says how long', find: 'Sessions last 12 hours' },
];

function check(pins: Pin[], haystack: string) {
  for (const pin of pins) {
    it(`${pin.id} ${pin.why}`, () => {
      expect(haystack, `${pin.id} lost: ${pin.find}`).toContain(pin.find);
    });
  }
}

describe('pinned accessibility hooks', () => check(A11Y, APP));

describe('pinned live regions', () => {
  it('error and status surfaces still announce themselves', () => {
    const alerts = APP.split('role="alert"').length - 1;
    expect(alerts, 'a live region was dropped from an error or status surface')
      .toBeGreaterThanOrEqual(LIVE_REGION_SURFACES);
  });
});

describe('pinned copy', () => check(COPY, APP));
describe('pinned behaviour', () => check(BEHAVIOUR, APP));
describe('pinned documentation promises', () => check(DOCS, README));

describe('pin inventory', () => {
  it('reports how many claims are pinned', () => {
    const total = A11Y.length + COPY.length + BEHAVIOUR.length + DOCS.length;
    expect(total).toBeGreaterThan(0);
    console.log(`pins: ${total} claims (${A11Y.length} a11y, ${COPY.length} copy, ${BEHAVIOUR.length} behaviour, ${DOCS.length} docs)`);
  });
});
