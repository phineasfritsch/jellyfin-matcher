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

  'lobby.scopeLocal': 'Jellyfin only',
  'lobby.scopeLocalCost': {
    text: 'On the server now. Plays tonight, costs nothing.',
    why: 'Half of a pair. This option and the one below are the room deciding whether tonight can spend the host disk, and the two lines are read against each other -- so they must stay parallel in tone as well as accurate. "Costs nothing" is the literal claim: nothing is fetched, nothing is downloaded (R42).',
  },
  'lobby.scopeWide': 'Any movie',
  'lobby.scopeWideCost': {
    text: 'Winner gets requested — a film you do not own is downloaded to the server.',
    why: 'The sentence that tells a room this choice spends somebody disk, stated before the choice rather than after it. It must NOT soften into "may be added" or "can be requested": the download is the point, and burying it is how a household finds out from a full disk (R42, R107).',
  },
  'lobby.scopeWideLocked': {
    text: 'Sign in to use. Adds films you do not own.',
    why: 'Shown instead of the line above when an account is required. Tapping raises the login rather than switching the setting, so this must read as a requirement and not as a description of what will happen (R111).',
  },

  'deck.notOnServer': {
    text: 'Not on your server — voting yes can download it.',
    why: 'The one chip that means money. It marks a card whose yes can spend the host’s disk.',
  },
  'deck.cost': {
    text: 'Nothing is fetched from this screen. If it wins, someone still has to ask — and whether that starts a download straight away depends on your Jellyseerr settings.',
    why: 'Every clause is a ruling. It must NOT promise the host approves first: Matcher requests with an admin key and Jellyseerr auto-approves those by default, so an approval gate is not a promise this app can keep (R107, R111). It must NOT state a size: no size datum reaches this app, and the real figure is not settled until the host’s server picks a release (R91). A translation that adds either is worse than no translation.',
  },
  'deck.waitingDone': {
    text: 'Waiting for the others to finish — then the points decide.',
    why: 'A COUNT-shaped wait, and deliberately not even that: the count is already on screen above this. It must never name anybody (R46, R61). It said "Waiting for Ade, Bex to finish" until R151 -- which named people who had already finished, and named people who had closed their phone, when settlement does not wait for a disconnected member at all.',
  },
  'deck.undo': {
    text: 'Puts the card back and clears your vote.',
    why: 'The deck is the one place a slip costs a film you cannot get back -- a tremor, a nudge, a thumb put down to steady the phone (R48).',
  },
  'deck.othersFinished': {
    text: '{done} of {total} others finished',
    why: 'A COUNT, never a name. Ade could see the room watching him be the slow one; the server never sends who, and this sentence must never invite it (R46, R61).',
  },

  /*
    The details sheet, in part.

    Six of its strings are here. The rest are still hardcoded in
    MovieDetails.tsx, and each one is blocked by something that is not mine to
    move, so the reasons are written down rather than left to be rediscovered
    by whoever tries next:

      - `aria-label="Close details"` is pin A12, which searches the haystack
        for that exact attribute text. Catalogued, the haystack would hold
        `'Close details'` instead and A12 would go red for a property that
        never left the app. The pin has to change first.
      - `Ratings` (the heading) and `Close` (the icon button) are substrings of
        `card.allRatings` and `onClose` in that same file. The duplication
        guard below matches text, not tokens, so it cannot tell a catalogued
        message from an identifier and would report both as duplicated. Same
        class of collision as "Jellyfin only" against server/diagnose.ts,
        described in strings.test.ts.
      - `Year unknown` and `No ratings found for this one.` are also hardcoded
        in SwipeCard.tsx, and `Year unknown` in WinnerScreen.tsx too.
        Cataloguing one copy while two others stay is the R146 defect exactly.
      - SOURCE_LABELS is a table of brand names, which a translator must not
        translate anyway; `tomatoes: 'RT Critics'` is additionally pin S15, and
        IMDb and Letterboxd are printed by SwipeCard.tsx as well.
      - The ` · {n} min` fragment is a unit abbreviation glued into a
        punctuation chain with the year and the genre list. Extracting the
        abbreviation alone gives a translator a piece they cannot correctly
        place; the whole line has to move at once, and half of it is somebody
        else's file.

    A partial migration is fine (R146). Cataloguing a sentence whose other copy
    lives in a file this change does not own is not.
  */
  'details.dialog': '{title} details',
  'details.hybrid': {
    text: 'Tagged both genres',
    why: 'A fact about why this film is in the deck at all -- deck.ts ranks films carrying both surviving genres in the top tier -- and deliberately NOT a cost. It was cut from the card face so that the one chip a card wears means money and nothing else, so a translation must not reach for warning words (download, disk, request, server): that voice belongs to the film nobody owns, which this may not be (R42).',
  },
  'details.trailerFrame': '{title} trailer',
  'details.playTrailer': {
    text: 'Play trailer',
    why: 'R29 names this button by name: the sheet opens with zero network, and the trailer mounts only when this is tapped. The label has to read as an action not yet taken. A bare "Trailer" reads as a heading over something already loaded, and on a LAN with no route out that difference is a dead grey rectangle where the synopsis should be.',
  },
  'details.watchTrailer': {
    text: 'Watch trailer',
    why: 'The other half of that pair, and it must not collapse into the same word. This one is a link that leaves the app for YouTube, shown when the URL will not embed; the one above mounts the trailer in place. One verb for both stops telling anyone which of the two is about to happen (R29).',
  },
  'details.deckScore': {
    text: 'Deck score {score} (35% Letterboxd, 35% IMDb, 30% RT)',
    why: 'R12: a statistic never appears without naming what it covers. The three sources and the three numbers ARE the composite formula in src/lib/score.ts -- if WEIGHTS changes, this sentence changes in the same commit. Reordering and re-punctuating are fine; altering a number, dropping a source, or losing {score} is not, and leaves a bare figure with no stated authority.',
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
