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
/** globals.css is not TypeScript, so the token pins need their own haystack. */
const CSS = readDoc('app/globals.css');
const README = readDoc('README.md');

type Pin = { id: string; why: string; find: string };

/**
 * Accessibility. Every one of these is invisible on screen, so a port done for
 * appearance drops them and looks correct to everyone who can see it.
 */
const A11Y: Pin[] = [
  { id: 'A01', why: 'Vote buttons exist for every gesture; the README promises this', find: 'aria-label="Vote"' },
  { id: 'A02', why: 'Each vote button names the film and the weight, not just the verb. "Dislike" does not answer "what did I just vote on", and three cards go by before you notice (R50)', find: '${v.say} ${title}, ${signed(v.points)}' },
  { id: 'A03', why: 'Deck position is announced, not only drawn as a bar', find: 'role="progressbar"' },
  { id: 'A04', why: 'Deck progress bar carries a name', find: 'aria-label="Deck progress"' },
  { id: 'A05', why: 'Genre picking is a labelled group, not loose checkboxes', find: 'aria-label="Genres"' },
  { id: 'A06', why: 'The surviving-genres round is distinguishable from the first', find: 'aria-label="Surviving genres"' },
  { id: 'A07', why: 'Genre toggles report their state, now via the RowButton pressed prop, since genres became 54px rows rather than 26px chips (R39)', find: 'pressed={picked.has(g)}' },
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
  { id: 'A22', why: 'The icon-only details button says what is behind it, not just that details exist', find: 'Ratings, synopsis and trailer for ${card.title}' },
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
  { id: 'B02', why: 'Confetti is suppressed under reduced motion, not merely shortened (R18)', find: 'if (reducedMotion) return null;' },
  { id: 'B03', why: 'The admin API key is read server-side only and never sent to a client', find: 'apiKey: process.env.JELLYFIN_API_KEY' },
  { id: 'B04', why: 'The guide page is never statically cached with one household’s server address baked in', find: "dynamic = 'force-dynamic'" },
  { id: 'B05', why: 'A failed socket ack rejects, so a lost action surfaces instead of hanging', find: 'reject(new Error(res.error))' },
  { id: 'B06', why: 'Connecting state is always cleared, even on a failed join — otherwise the UI hangs', find: '.finally(() => setConnecting(false))' },
];

/**
 * The second wave of pins, from a mechanical sweep of every screen. These are
 * the properties a port would drop precisely because they look like detail.
 */
const SWEEP: Pin[] = [
  { id: 'S01', why: 'The knockout explains a too-thin round instead of silently re-asking (R13)', find: 'Too few shared picks' },
  { id: 'S02', why: 'The elimination round says how many genres survive, so the end is in sight', find: '2 survive' },
  { id: 'S03', why: 'A player can still see which genre carried their own vote. It moved to the confirmation screen because live tallies are now hidden until the round closes, so nobody is watched deciding (R46)', find: 'carries your vote' },
  { id: 'S04', why: 'Waiting states name the state reached, not just a spinner (R35)', find: 'Vote cast' },
  { id: 'S05', why: 'Locked picks are confirmed as locked, so nobody re-picks', find: 'Picks locked in' },
  { id: 'S06', why: 'A trailer that cannot embed still has a named way out to YouTube', find: 'Watch trailer' },
  { id: 'S07', why: 'The trailer can go fullscreen; a phone-sized iframe is not a trailer', find: 'allowFullScreen' },
  { id: 'S08', why: 'The play action names where it plays, not a bare icon (R12)', find: 'Play in Jellyfin' },
  { id: 'S09', why: 'The request action names the system it will hit, before it is pressed (R09/R33)', find: 'Request via Jellyseerr' },
  { id: 'S10', why: 'The join-name field on the room shell is bound to its label', find: 'htmlFor="join-name"' },
  { id: 'S11', why: 'The login says which room it is for, so a guest knows what it unlocks (R10)', find: 'Sign in to join room ${roomId}' },
  { id: 'S12', why: 'Password managers are told this is a password field, not a text box', find: 'autoComplete="current-password"' },
  { id: 'S13', why: 'The username field is fillable by a password manager', find: 'autoComplete="username"' },
  { id: 'S14', why: 'The password is masked', find: 'type="password"' },
  { id: 'S15', why: 'Rotten Tomatoes ratings are labelled as critics, not conflated with audience (R12)', find: "tomatoes: 'RT Critics'" },
];

/**
 * Late Show. The redesign's own load-bearing properties -- the ones that exist
 * because the focus group said the first drafts failed them, and that a later
 * "tidy up" would remove without any other test noticing.
 */
const LATESHOW: Pin[] = [
  { id: 'T01', why: 'The cost line states a size, not a runtime; a disk cost that only names minutes is not a disclosure (R42)', find: 'export function CostLine' },
  { id: 'T02', why: 'Every listings control is a real button, never a div with onClick (R39)', find: 'export function RowButton' },
  { id: 'T03', why: 'The status bar stays a readout; nothing tappable in the cracked top corner (R40)', find: 'export function Bar' },
  { id: 'T04', why: 'Rows meet the 54px minimum target that replaced the 26px chips (R39)', find: "min-h-[54px]" },
  { id: 'T05', why: 'Structural row borders clear 3:1 contrast; the old #312e81 measured 1.6:1 (R41)', find: '--color-border: #5a6ab0' },
  { id: 'T06', why: 'Yellow means the room, and only the room', find: '--color-super: #ffe600' },
  { id: 'T07', why: 'Cyan means mine alone', find: '--color-maybe: #00d8ff' },
  { id: 'T08', why: 'Red means it stops, costs, or is missing', find: '--color-destructive: #ff3b2f' },
  { id: 'T09', why: 'Focus is visible on a grid whose rows are the controls', find: 'outline: 3px solid var(--color-maybe)' },
  { id: 'T10', why: 'Fonts are self-hosted by next/font, so nothing is fetched off-LAN at runtime (R17)', find: "from 'next/font/google'" },
];

/**
 * Lobby. Written before the Lobby port, so these guard the change rather than
 * grade it. Every one of them is a property the port could drop while still
 * looking correct on screen.
 */
const LOBBY: Pin[] = [
  { id: 'L01', why: 'A guest can always back out of an optional login instead of being trapped (R38)', find: 'onCancel={() => setLoginForWide(false)}' },
  { id: 'L02', why: 'The locked scope says why it is locked before it is pressed, not after (R10)', find: 'Sign in to use' },
  { id: 'L03', why: 'The QR is named. Now via the QRCode title prop, which renders a <title> inside the SVG; the old aria-label sat on a wrapper div with no role and named nothing', find: 'QR code to join room ${room.roomId}' },
  { id: 'L04', why: 'Scope buttons report which scope is chosen, not just colour it (R14). The state now rides RowButton, so every listings control gets it, not just this one', find: 'aria-pressed={pressed}' },
  { id: 'L05', why: 'Deck size options are real radios, not styled buttons', find: 'role="radio"' },
  { id: 'L06', why: 'A solo room explains the wait instead of showing an empty list (R13)', find: 'Waiting for at least one more person to join' },
  { id: 'L07', why: 'The uncapped runtime is named, not shown as a blank or a max number (R12)', find: "'No cap'" },
  { id: 'L08', why: 'You can find yourself -- now both as the first row of the lobby and in the member list, because a guest could not previously tell which of four names was hers', find: '(you)' },
  { id: 'L09', why: 'Deck ordering is stated in the Lobby, since no card prints a score (R32)', find: 'oth-genre picks lead' },
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
describe('pinned sweep claims', () => check(SWEEP, APP));
describe('pinned lobby claims', () => check(LOBBY, APP));
describe('pinned Late Show claims', () => check(LATESHOW, APP + CSS));
describe('pinned documentation promises', () => check(DOCS, README));

describe('pin inventory', () => {
  it('reports how many claims are pinned', () => {
    const total = A11Y.length + COPY.length + BEHAVIOUR.length + SWEEP.length + LOBBY.length + LATESHOW.length + DOCS.length;
    expect(total).toBeGreaterThan(0);
    console.log(`pins: ${total} claims (${A11Y.length} a11y, ${COPY.length} copy, ${BEHAVIOUR.length} behaviour, ${SWEEP.length} sweep, ${LOBBY.length} lobby, ${LATESHOW.length} lateshow, ${DOCS.length} docs)`);
  });
});
