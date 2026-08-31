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
import { appHaystack, readDoc, stripCssComments } from '../../../scripts/lib/source-scan';

const APP = appHaystack();
/**
 * globals.css is not TypeScript, so the token pins need their own haystack --
 * comment-stripped like the other one, or a comment naming a property keeps a
 * pin green after the declaration it protects is gone.
 */
const CSS = stripCssComments(readDoc('app/globals.css'));
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
  { id: 'A05', why: 'Genre picking is a labelled group. The label now rides the Group component, which renders the section and its aria-label together, so a card cannot be added without one', find: 'ariaLabel="Genres"' },
  { id: 'A06', why: 'The surviving-genres round is distinguishable from the first', find: 'ariaLabel="Surviving genres"' },
  { id: 'A07', why: 'Genre toggles report their state, now via the RowButton pressed prop, since genres became 54px rows rather than 26px chips (R39)', find: 'pressed={picked.has(g)}' },
  { id: 'A08', why: 'Deck size is a real radio group', find: 'role="radiogroup"' },
  { id: 'A09', why: 'Deck size options report which is chosen', find: 'aria-checked=' },
  { id: 'A10', why: 'The details sheet is a modal dialog, escapable and announced', find: 'role="dialog"' },
  { id: 'A11', why: 'The details sheet traps context as a modal', find: 'aria-modal="true"' },
  { id: 'A12', why: 'The details sheet has a named close control', find: 'aria-label="Close details"' },
  { id: 'A13', why: 'Room code entry is labelled', find: 'aria-label="Room code"' },
  { id: 'A14', why: 'Join control is named for screen readers', find: 'aria-label="Join room"' },
  { id: 'A15', why: 'The member list is named', find: 'ariaLabel="Members"' },
  { id: 'A16', why: 'Final ranking is a named region, not a bare list', find: 'ariaLabel="Final ranking"' },
  { id: 'A17', why: 'Session settings region is named', find: 'ariaLabel="Session settings"' },
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
  { id: 'T04', why: 'Rows meet the minimum target that replaced the 26px chips, now 60px (R39)', find: "min-h-[60px]" },
  { id: 'T05', why: 'The divider between two controls is information, so it clears 3:1. #5f6a63 on #0b0e11 measures 3.44:1. The glass hairline is a separate, decorative token and is deliberately not held to this (R41)', find: '--color-border: #5f6a63' },
  { id: 'T06', why: 'The yellow film dye means the room and only the room (R64)', find: '--color-super: #e8c14a' },
  { id: 'T07', why: 'The cyan dye means mine alone. A green-leaning teal on purpose, so it cannot be read as the system blue it replaced (R64)', find: '--color-maybe: #2fbdbd' },
  { id: 'T08', why: 'Print red means it stops, costs, or is missing (R64)', find: '--color-destructive: #e0563f' },
  { id: 'T09', why: 'Focus is visible on a grid whose rows are the controls', find: 'outline: 3px solid var(--color-maybe)' },
  { id: 'T10', why: 'Fonts are self-hosted by next/font, so nothing is fetched off-LAN at runtime (R17)', find: "from 'next/font/google'" },
  { id: 'T11', why: 'A deck failure names which upstream failed; three causes used to produce one symptom and all three reached the host as "it is broken" (R54)', find: 'export function diagnoseDeckFailure' },
  { id: 'T12', why: 'A thin deck is explained as a library fact rather than a fault, so nobody goes looking for a broken key', find: 'export function diagnoseThinDeck' },
  { id: 'T13', why: 'The request is confirmed by a second tap, never a timed hold: a hold behaves differently for a tremor, a switch and a thumb (R37)', find: "'idle' | 'confirm' | 'busy'" },
  { id: 'T14', why: 'The winner screen takes focus, since it replaces the deck outright and nothing announced that (R52)', find: 'heading.current?.focus()' },
  { id: 'T15', why: 'The way out of a login is the same size and shape as the way in; a decline styled as the lesser option reads as a trial wall to a guest who will never make an account (R55)', find: 'Carry on without an account' },
  { id: 'T16', why: 'The details sheet traps focus and hands it back to whatever opened it, by every route out (R31)', find: 'opener?.focus?.()' },
  { id: 'T17', why: 'The trailer mounts only on tap, so the sheet opens with zero network on a LAN with no route out (R29)', find: 'playTrailer ?' },
  { id: 'T18', why: 'A vote needs real travel, not just speed; velocity alone let a tremor or a nudge answer for you (R49)', find: 'VELOCITY_FLOOR' },
  { id: 'T19', why: 'Members carry ACC or GST so the host knows who is in the room before reading the code aloud (R44)', find: "u.authed ? 'ACC' : 'GST'" },
  { id: 'T21', why: 'Row dividers are never faded below their contrast floor; the decorative pane edge is a different token', find: '[&:not(:last-child)]:border-border' },
  { id: 'T27', why: 'Posters are served by Matcher, never by an absolute Jellyfin URL: an interpolated http:// origin is blocked as mixed content behind the HTTPS tunnel the README recommends, and it hands the media server address to every guest (R57)', find: "return `/api/poster/${encodeURIComponent(itemId)}`" },
  { id: 'T28', why: 'The poster proxy accepts item ids only, so a path cannot be walked through it', find: "/^[A-Za-z0-9-]{1,64}$/.test(itemId)" },
  { id: 'T29', why: 'Every upstream fetch carries a deadline; a hung Jellyfin must not hold a request open forever', find: 'AbortSignal.timeout(10_000)' },
  { id: 'T34', why: 'Rejecting a winner costs one tap and never returns the same film; the vote that ends the night was the only vote with no take-back (R63)', find: "socket.on('winner:reject'" },
  { id: 'T35', why: 'Settlement skips cards the room already turned down, so "not this one" is not the app arguing back', find: 'const standing = room.deck.filter((c) => !rejected.has(c.id))' },
  { id: 'T36', why: 'An empty genre submission is an abstention and does not drag the overlap to nothing for everyone else (R62)', find: '.filter((l) => l.length > 0)' },
  { id: 'T37', why: 'The screen that first demands an opinion offers a way to decline it, rather than only the screen after', find: 'No preference — go with the room' },
  { id: 'T32', why: 'Each member is sent their own view of the room. Broadcasting the whole Room put everyone’s votes, deck position and ballots on every phone, while three screens promised otherwise (R61)', find: 'export function viewFor' },
  { id: 'T33', why: 'The broadcast is per-socket rather than one payload to the channel, which is what makes the redaction possible at all', find: "sock.emit('room:state', viewFor(room, data.userId))" },
  { id: 'T63', why: 'The winner screen gives the poster the whole card. It was a 96px thumbnail beside a paragraph -- the screen the room spent the night arriving at, laid out like a search result (R79)', find: 'max-h-[46dvh] w-full object-cover' },
  { id: 'T64', why: 'Focus the app moved on the reader’s behalf draws no ring. Adjudicated: the property is intact, the form changed. It was matched by markup shape ([role=dialog][tabindex=-1]) which addressed no element at all for the details sheet -- role on the wrapper, tabindex on the panel -- so it is now an explicit data-app-focus mark, and src/ui/__tests__/focus.test.ts asserts every programmatically focused element carries one (R80)', find: '[data-app-focus]:focus-visible' },
  { id: 'T65', why: 'Someone who actually navigated still gets a ring. The suppression above is narrow by construction: weaken it to a blanket outline:none and this goes red', find: 'outline: 3px solid var(--color-maybe)' },
  { id: 'T66', why: 'The details sheet renders into document.body. Written in place it sits inside the deck -- animated, overflowing, translucent panes -- and a frosted pane only blurs what its nearest backdrop root painted, so the sheet was translucent over the poster without blurring it (R81)', find: 'createPortal(' },
  { id: 'T67', why: 'The sheet is frosted glass, not a flat translucent rectangle. This shipped broken for a while: the build emitted only -webkit-backdrop-filter, which Chrome does not support, so every pane in the app rendered flat in Chrome while dev and Safari looked right (R82). Order is guarded in css.test.ts, presence here', find: 'backdrop-filter: blur(22px) saturate(165%)' },
  { id: 'T58', why: 'Failed logins are rate limited per address. This endpoint forwards credentials to Jellyfin, so with nothing in front of it Matcher is a rate-limit-free amplifier for guessing passwords against the media server (R77)', find: 'const loginLimiter = new RateLimiter' },
  { id: 'T59', why: 'A successful sign-in clears the address, so a fumbled password does not cost anyone ten minutes', find: 'loginLimiter.clear(who)' },
  { id: 'T60', why: 'Sockets are same-origin unless explicitly configured. cors origin true reflects whatever Origin arrives, so any page on the internet could open a socket into a household room (R77)', find: 'MATCHER_ALLOWED_ORIGINS' },
  { id: 'T61', why: 'The ratings cache is written atomically. A plain writeFile left truncated JSON after a crash, and the punishment for one bad moment was re-fetching the whole library on every night after (R78)', find: 'await rename(temp, file)' },
  { id: 'T62', why: 'A cache that cannot be written never fails a deck that already built', find: 'The deck is fine; the next build will re-fetch.' },
  { id: 'T54', why: 'Settings from a phone are checked against what the interface offers. This spread a Partial<RoomSettings> straight into the room, so deckLimit 999999 was accepted and the next build would try to assemble it against a metered key (R75)', find: 'export function asSettings' },
  { id: 'T55', why: 'Room codes are validated against the unambiguous alphabet, so a path cannot arrive where a code is expected', find: 'export function asRoomId' },
  { id: 'T56', why: 'A user id must be one the server issued; the rejoin path took whatever a phone sent', find: 'export function asUserId' },
  { id: 'T57', why: 'The process handles SIGTERM and tells the rooms before it goes. Pushing main deploys, and there was no process.on anywhere in the repository (R76)', find: "process.on(signal, () => shutdown(signal))" },
  { id: 'T51', why: 'The vote track is a rem floor, not ch. ch is the width of a zero in the current font, so it grew exactly as fast as the text and the row reflowed to an unreachable 1x4 at 200% rather than the 2x2 its own comment claimed (R74)', find: 'minmax(4.5rem,1fr)' },
  { id: 'T52', why: 'The votes never shrink; the card yields to them. They are the point of the screen and a floor that scales with the text is not a floor', find: 'grid shrink-0 grid-cols-' },
  { id: 'T53', why: 'The join gate is the first screen a guest ever sees and now wears the same material as everything else; it was the last pre-redesign screen in the app (R73)', find: 'No account needed.' },
  { id: 'T49', why: 'Rejecting a winner asks first: it throws away what the whole room just agreed on, and fixing a no-undo problem by adding a second one-tap irreversible control is the same mistake in a different hat (R71)', find: 'id="reject-cost"' },
  { id: 'T50', why: 'Settings stay changeable until the deck exists, so the thin-deck diagnosis names a control the room can actually reach (R70)', find: "room.status !== 'LOBBY' && room.status !== 'KNOCKOUT'" },
  { id: 'T47', why: 'The rules of a night are named transitions on a Room, testable without socket.io. They were seventeen field assignments spread across eight socket handlers, so the product was only readable and only testable through its transport (R69)', find: 'export function startKnockout' },
  { id: 'T48', why: 'Undo arithmetic lives in one place. The old test re-implemented it inside the test body, which asserted the test could do the maths rather than that the server did', find: 'export function undoVote' },
  { id: 'T44', why: 'A deck build cannot spend an unbounded number of requests against somebody personal metered API key (R68)', find: 'requestBudget: number;' },
  { id: 'T45', why: 'The cost of the last build is readable, so a host can see what a night actually spent', find: 'export function lastRatingsCost' },
  { id: 'T46', why: 'getLimits is actually called: the one number saying whether tonight deck comes back rated existed in the client and was read by nothing', find: 'const limits = await getLimits();' },
  { id: 'T40', why: 'Every upstream call carries a deadline. fetch has no default timeout, so a Jellyfin that accepts the connection and goes quiet held the deck build open forever (R65)', find: 'export function withDeadline' },
  { id: 'T41', why: 'The deadline is applied at config level, so an endpoint added later cannot forget it', find: 'fetchFn: withDeadline(fetch)' },
  { id: 'T42', why: 'A failed rejoin ends the session out loud. Pushing main restarts the server and rooms live in memory, so a deploy mid-night left every phone rendering a deck the server had forgotten (R66)', find: 'This room is gone — the server restarted' },
  { id: 'T43', why: 'healthz reports whether upstreams ANSWER, not whether two env strings are non-empty; a wrong key looked identically healthy (R67)', find: 'reachable: reachability()' },
  { id: 'T38', why: 'The material is named from the subject, not from a platform: a gel is the translucent sheet a film crew clips in front of a lamp, which is what these do to the ambient (R64)', find: '.gel {' },
  { id: 'T39', why: 'One type scale, in rem, and actually USED. It was declared and pinned and referenced zero times while fifteen ad-hoc sizes shipped -- a pin that asserted a token existed rather than that anything used it (R72)', find: 'text-row' },
  { id: 'T30', why: 'Type is set in rem so it grows with the OS text setting. Every size was a hardcoded pixel, under a comment claiming the vote row reflowed at 200% text -- the claim was true and the type it protected was not (R60)', find: 'font-size: 100%;' },
  { id: 'T31', why: 'The vote labels are on the shared scale, not a one-off size. They were the ones the reflow comment names, and they were a bespoke rem literal like fourteen other sizes (R72)', find: 'text-label font-semibold' },
  { id: 'T23', why: 'Only connected members decide WHEN a room ends; a member who left mid-deck could otherwise block both a match and the deck exhausting, which is the exact stalemate the product exists to prevent (R56)', find: 'export function activeUserIds' },
  { id: 'T24', why: 'Everyone who can end a room goes through one settlement check, so the last event before a hang cannot be one nothing re-examines', find: 'function settleIfPossible' },
  { id: 'T25', why: 'Leaving re-checks settlement, because the leaver may have been the only member the room was waiting on', find: "room.status === 'SWIPING' && settleIfPossible(room, null)" },
  { id: 'T26', why: 'A deck that built empty settles instead of parking every phone on a skeleton that will never advance', find: 'if (room.deck.length === 0) {' },
  { id: 'T22', why: 'Glass degrades to an opaque fill where backdrop-filter is unsupported, rather than to near-invisible 7%-white panes', find: '@supports not (backdrop-filter' },
  { id: 'T20', why: 'Abstaining counts as voted but weighs nothing, so nobody has to invent an opinion or hold up the room (R47)', find: 'export const ABSTAIN' },
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
