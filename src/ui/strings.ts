/**
 * R145: every sentence the app says, in one place.
 *
 * Gate U8 of docs/UPSTREAM.md. Jellyfin ships in dozens of languages; this app
 * had every string hardcoded in English, and the only locale API anywhere in
 * the source was a single `localeCompare` in a tally sort. That is not a
 * shortcoming a household notices and it is the first thing an upstream
 * maintainer asks about.
 *
 * WHAT THIS IS AND IS NOT. This is extraction: the English text moves here and
 * components ask for it by key. It is NOT locale selection -- there is one
 * catalogue, `en`, and nothing yet chooses another. That is deliberate. The
 * hard half of translating this app is not the plumbing, it is that a lot of
 * the copy is load-bearing in ways a translator cannot see from the string:
 *
 *   - the download disclosure must not promise an approval gate the app cannot
 *     enforce (R107, R111),
 *   - it must not state a size the app cannot know (R91),
 *   - peer progress must be a count and never a name (R46, R61),
 *   - a control's accessible name must contain the words on it (R134).
 *
 * So every entry carries a `why` where the wording is a promise rather than a
 * label, and a translator is given the reason instead of a sentence to guess
 * at. A catalogue that ships only strings would let a well-meaning translation
 * quietly undo four rulings.
 *
 * WHY THE PINS STILL WORK. `pins.test.ts` greps the comment-stripped source of
 * `app/`, `src/` and `server/`, and this file is in `src/`. A sentence pinned
 * because the UI must keep saying it is still found -- it simply lives here now
 * rather than in the component. Moving text into this file costs no pin churn,
 * which is what makes the rest of the migration mechanical.
 */

/** A message, with the reasoning a translator needs when the wording is a promise. */
type Message = string | { text: string; why: string };

/**
 * The English catalogue. Keys are dotted and flat on purpose: greppable, and
 * `MessageKey` below makes a typo a typecheck failure rather than a blank
 * space on somebody's screen.
 */
export const en = {
  'knockout.loading': 'Loading genres',
  'knockout.prompt': 'What are you open to?',
  'knockout.overlap': {
    text: 'Overlap decides the deck. Picking more makes a deck more likely, not worse.',
    why: 'People hedge on a form like this, and hedging makes a deck less likely. The sentence exists to say that plainly -- a translation that reads as neutral instruction loses the whole point of it (R47).',
  },
  'knockout.abstain': {
    text: 'No preference — go with the room',
    why: 'This is BOTH the visible label and the start of the accessible name, and WCAG 2.2 2.5.3 requires the name to contain the visible words. Translate them together or a voice user cannot reach the one control added for the person with no opinion (R47, R134).',
  },
  'knockout.locked': 'Picks locked in',
  'knockout.hidden': {
    text: 'Nobody can see what you picked until everyone is in.',
    why: 'A promise the server keeps, not a reassurance. It is why people answer honestly instead of hedging toward whoever they think is watching.',
  },
  'knockout.voteOut': 'Vote one out',

  'deck.notOnServer': {
    text: 'Not on your server',
    why: 'The one chip that means money. It marks a card whose yes can spend the host’s disk.',
  },
  'deck.cost': {
    text: 'Nothing is fetched from this screen. If it wins, someone still has to ask — and whether that starts a download straight away depends on your Jellyseerr settings.',
    why: 'Every clause is a ruling. It must NOT promise the host approves first: Matcher requests with an admin key and Jellyseerr auto-approves those by default, so an approval gate is not a promise this app can keep (R107, R111). It must NOT state a size: no size datum reaches this app, and the real figure is not settled until the host’s server picks a release (R91). A translation that adds either is worse than no translation.',
  },
  'deck.undo': {
    text: 'Puts the card back and clears your vote.',
    why: 'The deck is the one place a slip costs a film you cannot get back -- a tremor, a nudge, a thumb put down to steady the phone (R48).',
  },
  'deck.othersFinished': {
    text: '{done} of {total} others finished',
    why: 'A COUNT, never a name. Ade could see the room watching him be the slow one; the server never sends who, and this sentence must never invite it (R46, R61).',
  },
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;

/**
 * Look up a message and fill its `{placeholders}`.
 *
 * No locale argument yet, because there is no second catalogue to choose. When
 * there is, this is the one function that changes and every call site already
 * goes through it -- which is the whole reason to do the extraction first and
 * the selection second.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const entry: Message = en[key];
  const text = typeof entry === 'string' ? entry : entry.text;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    // An unknown placeholder is left visible rather than blanked: a stray
    // `{name}` on screen is a bug report, an empty gap is a mystery.
    name in vars ? String(vars[name]) : whole,
  );
}

/** The reasoning behind a message, for a translator. Empty when it is a plain label. */
export function why(key: MessageKey): string {
  const entry: Message = en[key];
  return typeof entry === 'string' ? '' : entry.why;
}
