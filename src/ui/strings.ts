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

  /*
    The winner screen, in part.

    The highest-stakes copy in the app. It is the screen that holds the one
    control which spends the host's disk, and several of these sentences are
    rulings rather than labels: what the room is told the request will do
    (R107, R111), what it is told about the size (R91), which of the two ways
    the night ended (R90), and what rejecting actually costs (R100). Those
    carry a `why`. The rest are labels and say so by carrying none.

    Nine strings stay hardcoded in WinnerScreen.tsx, for the same reasons the
    details sheet leaves five behind. Written down rather than left to be
    rediscovered by whoever tries next:

      - The two `aria-label` attributes on the confirm panels are pins T113 and
        T114, which search the haystack for that exact attribute text.
        Catalogued, the haystack would hold the bare sentence instead and both
        pins would go red for a property that never left the app. Same as A12
        above: the pin has to change first, and it is not this change's file.
        `Final ranking` is the counterpart that shows what "first" buys: A16
        was rewritten to search for the binding before this migration ran, so
        the region name could move with the rest.
      - `On your server` and `Not on your server` are substrings of the deck's
        card announcement in SwipeDeck.tsx, and the second is inside
        `deck.notOnServer` above as well. The duplication guard below matches
        text, not tokens, so it would report a bar label and a screen-reader
        sentence as one duplicated message.
      - `Cancel` is a substring of the `onCancel` prop in three UI files, and
        `Request failed` is also socket.ts's fallback. Same collision class as
        `Close` against `onClose`.
      - `Year unknown` and the ` · {n} min` fragment are hardcoded in
        SwipeCard.tsx and MovieDetails.tsx too, and the poster's alt text is
        built the same way in both. Cataloguing one copy of three is the R146
        defect exactly -- and the alt text is the worst of the three to move,
        because its `{title}` placeholder means the guard cannot see the
        duplication at all.
  */
  'winner.sessionEnded': 'Session ended',
  'winner.noWinner': 'No winner could be determined.',
  'winner.locked': 'Locked in',
  'winner.pointsWinner': 'Points winner',
  'winner.unanimous': {
    text: 'Everyone said yes.',
    why: 'One of the two ways a night can end, and the room must be told which one it got (R90). This sentence claims agreement, so it must never be reachable for a film the points picked -- it was, for anyone who reloaded, until the outcome moved onto the room. A translation must not hedge it into something that covers both cases: "the room has its film" would be true on every path and would tell nobody anything.',
  },
  'winner.viaPoints': {
    text: 'Nobody agreed outright, so the points decided.',
    why: 'The other way (R90). It says plainly that this is NOT the room agreeing, which is the fact the ranking below it then explains. It must not be softened into agreement -- a film every connected member said no to cannot win on points at all (R97), and this sentence is what tells the room the difference between the two outcomes it can see.',
  },
  'winner.costHeadline': {
    text: 'This one is not on the server yet.',
    why: 'R53: half the time in Any Movie mode the winner is a film nobody owns, and that is a different screen. This is the headline of the cost line, so it wears the one voice reserved for spending the host disk (R42) -- and it is a statement of fact about the library, not a warning about what will happen. The sentence under it is the warning.',
  },
  'winner.cost': {
    text: "Nothing has been downloaded yet. Asking sends it to Jellyseerr, and whether that starts the download straight away depends on your host's settings.",
    why: 'The same promise as `deck.cost`, on the screen where the button actually is. It must NOT promise the host approves first: Matcher requests with an admin key and Jellyseerr auto-approves those by default (R107). R107 rewrote the deck sentence, the confirm and the ack and missed this copy, which renders directly above the request button -- so it contradicted the confirm two taps later (R111). It must NOT state a size either: no size datum reaches this app (R91).',
  },
  'winner.ranking': 'Final ranking',
  'winner.rankingRow': {
    text: '{total} points — {composite} from ratings, {votePoints} from the room',
    why: 'R12: a statistic never appears without naming what it covers. The total is shown broken into the two things that made it, so a room that lost on points can see whether it lost to the ratings or to itself. Reordering and re-punctuating are fine; dropping either half leaves a bare number with no stated authority.',
  },
  'winner.rejectCostExhausted': {
    text: 'This throws away what the room just agreed on. Everyone has finished the deck, so the points pick the next film straight away — there is nothing left to swipe. {title} will not be offered again.',
    why: 'R100: say what will happen, not what usually happens. On this path rejecting leaves progress untouched, the deck is still exhausted, and settlement declares the next-ranked film inside the same call -- nobody swipes anything. It must not borrow the other branch’s promise of a return to the deck. The last clause is R63: the vote that ends the night is irreversible in one direction, and the room is told so before it commits.',
  },
  'winner.rejectCost': {
    text: 'This throws away what the room just agreed on and puts everyone back in the deck. {title} will not be offered again.',
    why: 'The other branch of R100, and the only one where "back in the deck" is true. Collapsing the pair into one sentence is the defect R100 fixed. The last clause is R63, as above: the film does not come back, and the confirm says so before the tap that spends it.',
  },
  'winner.rejectYesExhausted': {
    text: 'Yes, pick the next one',
    why: 'The button half of the R100 pair. It always said "keep swiping", including on the path where the deck is over and the points pick the next film on the spot. It must name what this tap does here, and must not promise swiping.',
  },
  'winner.rejectYes': {
    text: 'Yes, keep swiping',
    why: 'The other button half (R100). This one is the honest reading only when the deck is unfinished; it is the sentence that used to be shown on both paths, which is why the pair exists.',
  },
  'winner.rejectKeep': 'Keep this one',
  'winner.rejectExhausted': {
    text: 'Not this one — pick the next',
    why: 'R100 again, on the control that opens the confirm. Whatever this says, the confirm and its yes-button have to agree with it: three sentences describe one path, and the defect was one of them describing a different one.',
  },
  'winner.reject': {
    text: 'Not this one — keep swiping',
    why: 'The unfinished-deck half of that pair (R100). R63 is why the control exists at all: the vote that ends the night was the only one with no take-back, and the person who mis-tapped is often not the person holding the host’s phone.',
  },
  'winner.play': {
    text: 'Play in Jellyfin',
    why: 'R12: the action names where it plays rather than being a bare triangle. This is the free half of the winner screen -- the film is already on the server -- and it is read against the request button, which is the half that spends the disk. The two must never read alike.',
  },
  'winner.request': {
    text: 'Request via Jellyseerr',
    why: 'R09/R33: the control names the system it will hit before it is pressed, not after. A bare "Request" or "Get it" hides which machine this reaches and whose disk it fills; the host reading this screen has to recognise their own software in it.',
  },
  'winner.requestConfirm': {
    text: 'Sends {title} to Jellyseerr. Depending on your host’s settings that may start the download straight away. How much disk it uses is not known until their server picks a release, and you will not see it tonight.',
    why: 'The confirm on the one control that spends somebody else’s disk, and every clause is a ruling. It must NOT promise an approval gate: an admin-key request is auto-approved by default, so a gate is not a promise this app can keep (R107, R111). It must NOT state a size, and must keep saying that the size is not known yet: no size datum reaches this app and the real figure is not settled until the host’s Radarr picks a release (R91). A translation that adds either is worse than no translation.',
  },
  'winner.requestConfirmRuntime': {
    text: 'Sends {title} ({runtime} min) to Jellyseerr. Depending on your host’s settings that may start the download straight away. How much disk it uses is not known until their server picks a release, and you will not see it tonight.',
    why: 'The same sentence for a film whose runtime is known. It is a second entry rather than a glued `{runtime}` fragment because a runtime in parentheses is a unit abbreviation a translator cannot correctly place from the fragment alone -- the same reason the details sheet leaves its " · {n} min" behind. The runtime is there to identify the film, NOT as a cost: R91 rejected "about {runtime} min of video" as a size claim, and the clause about the size not being known is what replaced it.',
  },
  'winner.requestSend': 'Yes, ask',
  'winner.requestSending': 'Sending the request…',
  'winner.asked': {
    text: 'Asked. It appears in Jellyfin once your server has it.',
    why: 'What this phone is told the moment its own request is accepted, before the room has said anything back. It says what is known -- the ask went out -- and nothing about approval, because this app cannot see whether there was a gate (R107).',
  },
  'winner.askedApproved': {
    text: 'Asked, and your server accepted it. It appears in Jellyfin once it finishes downloading.',
    why: 'R107: say which of the two actually happened rather than asserting a gate. Jellyseerr returns 1 for pending and 2 for approved, and this is the approved one -- so it must NOT talk about waiting for approval, which is the sentence below. The old copy said "once the host approves it" on both.',
  },
  'winner.askedApprovedBy': {
    text: '{name} asked, and your server accepted it. It appears in Jellyfin once it finishes downloading.',
    why: 'The same fact with a name on it (R107). A name is right here and nowhere else on this screen: R46 and R61 keep deck progress anonymous because nobody should be watched being slow, but who spent the host’s disk is exactly the thing a household is owed (R42). {name} is the display name the server sent; it is never a count.',
  },
  'winner.askedHeld': {
    text: 'Asked. Your Jellyseerr is holding it for approval.',
    why: 'The pending half (R107). This one names approval on purpose -- it is a report of what Jellyseerr did, not a promise about what it will do, and it is the only place on this screen where the word is honest.',
  },
  'winner.askedHeldBy': {
    text: '{name} asked. Your Jellyseerr is holding it for approval.',
    why: 'The pending half with a name on it, for the same reason as the approved one (R42, R107): the room is told who spent the disk. It reports the hold Jellyseerr applied; it does not promise the host was consulted.',
  },

  /*
    The login, in part.

    Four strings stay hardcoded in AuthGate.tsx, all of them the same substring
    collision the details sheet and the winner screen hit:

      - `Username` and `Password` are inside `setUsername` and `setPassword`
        in that same file. The duplication guard matches text, not tokens.
      - `Sign in` is inside `Sign in to use` above, `Sign in to search any
        movie` in Lobby.tsx, `Sign in to create a room` in HomeActions.tsx and
        `Sign in to join room` in RoomClient.tsx. Four of the five are somebody
        else's file, and the label cannot move until they do.
      - `Jellyfin Matcher` is in five files under app/, none of them this
        change's.
  */
  'auth.title': {
    text: 'Sign in with your Jellyfin account',
    why: 'R10: the login says what it is for before it is answered. It names WHOSE account it wants, which is what stops a password box on a stranger’s LAN from being phishing-shaped -- a bare "Sign in" over two fields asks a household to guess which credentials it is being asked for. It is also the fallback: every caller that can name a reason passes one instead.',
  },
  'auth.serverChecks': {
    text: 'Your Jellyfin server checks this. The server key never reaches this page.',
    why: 'Two separate promises, and both are kept elsewhere in the code. The password is verified by the household’s own Jellyfin, not by this app; and the admin API key stays on the server, which is the claim the README makes as well. Neither may be softened into reassurance ("your details are safe") -- the point is that the reader can check both.',
  },
  'auth.timeout': {
    text: 'Your Jellyfin server did not answer. Check it is awake and try again.',
    why: 'R88: a sign-in that never settles used to leave the button disabled with nothing said and no way out but a reload. This is the message that replaced the silence, so it must name which machine went quiet and leave the reader something to do. A generic failure line puts the silence back.',
  },
  'auth.failed': 'Login failed',
  'auth.decline': {
    text: 'Carry on without an account',
    why: 'R55: the way out is the same size and shape as the way in. It was 14px grey underlined "Back" under a full-width green button, which a guest who will never make an account reads as a trial wall. The words have to say what declining GETS you, not merely that you can retreat -- nothing here is gated that a guest cannot simply skip.',
  },

  /*
    The failure panel (R54, R98).

    Three causes used to produce one symptom -- a short or missing deck -- and
    all three reached the host as "it's broken", by text, at 11pm. The three row
    labels are the questions being answered in order: what happened, which
    system, and who can do something about it. They are short because they are a
    column of fixed-width labels, not because they are abbreviations to expand:
    a translator should keep them to roughly this width or the rows stop lining
    up, and should not lengthen them into sentences.

    `ERR` sits with them: it was held back because `JELLYSEERR_URL` in
    app/guide/page.tsx contains the letters, which R154 now tells apart from a
    written copy.
  */
  'diagnosis.canPlay': 'Can still play',
  'diagnosis.notYourFault': {
    text: 'Not your fault',
    why: 'R54: the panel appears when something upstream failed, and the person reading it did nothing wrong. This is the line that says so. It must not be softened into an apology from the app or hardened into blame on a named service -- the FROM row already names the system.',
  },
  'diagnosis.labelFrom': 'FROM',
  'diagnosis.labelFix': 'FIX',
  'diagnosis.fromDetail': {
    text: 'The system that did not answer.',
    why: 'R54: the FROM row exists so the host knows WHICH system to go and look at, rather than reading the whole panel as "the app is broken". Dropping this detail leaves a bare service name with nothing saying what it means.',
  },
  'diagnosis.whatNow': 'What now',
  'diagnosis.pickAgain': {
    text: 'Pick genres again',
    why: 'R98: the way out. Every row in this panel is a Listing Row, which is deliberately not interactive, so the panel explained a dead end and then was one -- while its own FIX row said to pick genres again, which the server had already made possible and no control on screen could reach. This is the control that fixed that, so the words have to name the action it performs.',
  },

  /*
    The four vote controls (R06, R25, R50).

    Two halves that must stay in step. `word` is printed on the button; `say` is
    the start of its accessible name, which R134 requires to CONTAIN the printed
    word. Translate one without the other and a screen-reader user is told to
    press a control whose label they cannot find on screen.

    `say` is a fragment on purpose -- the component appends the film's title and
    the signed weight, so it reads "Vote no on Alien, -5". R50: naming the film
    is the point, because three cards can go by before you notice what you voted
    on. A translator may reorder within the fragment but has to leave it able to
    take a title after it.
  */
  'vote.group': 'Vote',
  'vote.no': 'No',
  'vote.maybe': 'Maybe',
  'vote.yes': 'Yes',
  'vote.super': 'Strong',
  'vote.sayNo': {
    text: 'Vote no on',
    why: 'R25/R50: the accessible name has to contain the word on the button and then name the film. "Dislike" is not an answer to "what did I just vote on".',
  },
  'vote.sayMaybe': 'Vote maybe on',
  'vote.sayYes': 'Vote yes on',
  'vote.saySuper': {
    text: 'Strong yes on',
    why: 'R25: the button prints "Strong", so the accessible name starts with it. This is the one of the four where the printed word and the spoken phrase could drift apart without looking wrong.',
  },

  /*
    The card itself.

    Both of these name the film, and both are read rather than seen: the poster
    alt is what a screen reader says INSTEAD of the image, and the details label
    is on an icon-only button. R134: a control's accessible name must contain
    the words on it, and this control has no words on it at all -- so the name
    is the whole of what it offers, which is why it lists the three things
    behind the button rather than saying "Details".
  */
  /*
    A string with a placeholder in it is INVISIBLE to the duplication guard, and
    this one proves it. The guard looks for the catalogued text; a component
    building the same sentence writes `${card.title} poster`, which does not
    contain `{title} poster` anywhere. SwipeCard and WinnerScreen both had their
    own copy of this and the guard was green on it the whole time.

    Both now come through here, so the sentence has one home. But nothing STOPS
    a third file writing it by hand again -- that is the limit of a text-matching
    guard, and it is worth knowing rather than assuming the green is a proof.
  */
  'card.posterAlt': '{title} poster',
  'card.detailsLabel': {
    text: 'Ratings, synopsis and trailer for {title}',
    why: 'R134/A22: the button is an icon. "More info" would be a name that tells somebody nothing about whether it is worth the press, and naming the film is what lets a screen-reader user tell one card\'s button from the next.',
  },
  'card.noRatings': {
    text: 'No ratings found for this one.',
    why: 'R12: an empty state explains itself rather than showing a blank panel. A film with no ratings is a normal thing in a real library -- the line has to read as a fact about this film, not as a failure of the app.',
  },
  'card.yearUnknown': 'Year unknown',

  /*
    The front door.

    Two of these are the only text on their control. The room code input and the
    join button are an unlabelled box and an arrow icon, so `home.codeLabel` and
    `home.joinLabel` are the whole of what a screen reader has to go on (A13,
    A14) -- they are names, not descriptions, and must not grow into sentences.

    `home.namePlaceholder` is an example, not a label. It has to read as a first
    name a person might type; a translator should substitute a name common in
    their language rather than transliterate this one.
  */
  'home.yourName': 'Your name',
  'home.namePlaceholder': 'Phineas',
  'home.createRoom': 'Create room',
  'home.orJoin': 'or join one',
  'home.codePlaceholder': 'ROOM CODE',
  'home.codeLabel': 'Room code',
  'home.joinLabel': 'Join room',
  'home.signInToCreate': 'Sign in to create a room',
  'home.needName': {
    text: 'Enter your name first',
    why: 'R55: the room is named by the people in it, so a seat with no name is not a seat. This fires before any network call, so it must say what to do rather than report a failure.',
  },
  'home.needCode': 'Enter a room code',
  'home.createFailed': {
    text: 'Could not create room',
    why: 'The fallback when the server gave no message of its own. It must stay vaguer than a real diagnosis -- claiming a cause here would put a guess in front of somebody who could otherwise read the real one.',
  },

  /*
    The join screen -- the first thing a guest ever sees.

    They scanned a QR and landed here, and R55 is the whole design of it: the
    screen says out loud that no account is needed, because a name field above a
    button is a shape people have been trained to read as a sign-up. The
    reassurance is load-bearing copy, not a nicety, and a translation that drops
    it puts the trial wall back.

    `join.namePlaceholder` is an example name, like `home.namePlaceholder`, and
    is deliberately a different one -- the two screens sit either side of the
    same QR and showing the same example twice reads like a stuck field.
  */
  'join.heading': 'Joining room',
  'join.reassurance': {
    text: 'Pick any name — it is what the room calls you tonight. No account needed.',
    why: 'R55: this is the sentence that stops a guest bouncing off what looks like a sign-up. It has to say both halves -- that the name is disposable AND that no account is needed -- because either alone still reads as a form to fill in.',
  },
  'join.namePlaceholder': 'Ferb',
  'join.submit': 'Join Room',
  'join.signInToJoin': 'Sign in to join room {roomId}',
  'join.failed': 'Could not join',

  /*
    The four strings R145 recorded as unmovable, moved.

    Every one of them was blocked by the same thing and it was never a
    duplicated message: `Username` and `Password` are substrings of
    `setUsername` and `setPassword`; `Sign in` is a substring of the four
    `Sign in to ...` reasons; `ERR` is a substring of `JELLYSEERR_URL` in
    app/guide/page.tsx. A guard matching bare text cannot tell any of those from
    a component keeping its own copy, so all four stayed put with the reason
    written down.

    R154 answered it -- a short string is now looked for as it would actually be
    WRITTEN -- and these are what that was worth. The reason recorded for `ERR`
    was additionally just wrong: it said the guide prints the label. The guide
    has never contained the word.
  */
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.submit': 'Sign in',
  'diagnosis.labelErr': 'ERR',
  'winner.cancel': 'Cancel',
  'winner.requestFailed': {
    text: 'Request failed',
    why: 'The fallback when Jellyseerr gave no message of its own. It stays vaguer than a real diagnosis on purpose: naming a cause here would put a guess in front of somebody who can otherwise read the real one. R145 recorded this as unmovable because socket.ts contains the words -- but only inside the comment explaining this very screen, and appSources() strips comments, so it never actually was.',
  },

  /*
    The household guide (app/guide/page.tsx), in part.

    This page is prose, which makes it the one file where the shape of the
    catalogue matters more than the count. Everything below is a WHOLE string: a
    section heading, a client name, an app description, a numbered step.

    Its paragraphs are not here, and that is a decision rather than a backlog.
    They are sentences interleaved with markup -- the address sits in a <Code>,
    two product names sit in <strong>, and the request step wraps a <Code> mid
    sentence. `t()` returns a string and cannot carry an element, so the only way
    to catalogue those today is one entry per fragment: 'Each one asks for the
    server address (' and ') and your login, then...'. That is the single shape a
    translator genuinely cannot work with, because word order across the
    fragments is fixed by English and no entry can move a clause past the link.

    Splitting a sentence into pieces to raise a coverage number would make the
    catalogue worse at the only job it has. What those paragraphs need is a
    message that can take an element as a placeholder, which is real work and is
    not this change.
  */
  'guide.heading': 'How to use the server',
  'guide.tvTitle': 'Watch on your TV',
  'guide.phoneTitle': 'Watch on your phone or tablet',
  'guide.laptopTitle': 'Watch on your laptop or desktop',
  'guide.requestTitle': "Want something we don't have?",
  'guide.matcherTitle': "Can't agree on a movie? Use Matcher",
  'guide.serverAddressFallback': {
    text: 'your server address',
    why: 'Shown in place of the real address when JELLYFIN_URL is unset. It has to read as a placeholder a person is meant to substitute, not as an address to type.',
  },
  'guide.jellyfinFallback': 'your Jellyfin server',
  'guide.openMatcher': 'Open Matcher',
  'guide.androidTv': 'Android TV / Google TV / Chromecast',
  'guide.androidTvDetail': 'Official Jellyfin app from the Play Store. Easiest option, best supported.',
  'guide.fireTv': 'Amazon Fire TV / Fire Stick',
  'guide.fireTvDetail': "Official Jellyfin app from the Amazon Appstore. Search 'Jellyfin' on the device.",
  'guide.appleTv': 'Apple TV',
  'guide.appleTvDetail': 'Swiftfin (free, official) from the App Store. Infuse works well too if you use it.',
  'guide.roku': 'Roku',
  'guide.rokuDetail': 'Official Jellyfin channel from the Roku store. Solid, a little plainer than the rest.',
  'guide.smartTv': 'Samsung (Tizen) / LG (webOS)',
  'guide.smartTvDetail': 'Jellyfin is in both smart-TV stores. If yours is missing, a cheap Fire Stick fixes it.',
  'guide.kodi': 'Kodi',
  'guide.kodiDetail': 'Add the Jellyfin for Kodi plugin if you already run Kodi and want one unified library.',
  'guide.iphone': 'iPhone / iPad',
  'guide.iphoneDetail': 'Swiftfin (free, official) is the one to get. Infuse is a slicker paid alternative with better format support.',
  'guide.android': 'Android',
  'guide.androidDetail': 'Official Jellyfin app works fine. Findroid is a great community-built alternative; Streamyfin is another good one.',
  'guide.browser': 'Any web browser',
  'guide.browserDetail': 'Just go to {host} and sign in. Nothing to install. Chrome, Edge, Firefox, and Safari all work.',
  'guide.mediaPlayer': 'Jellyfin Media Player',
  'guide.mediaPlayerDetail': 'Free desktop app for Windows, macOS, and Linux. Smoother playback and more file types than the browser.',
  'guide.requestStep2': 'Search for the movie or show you want.',
  'guide.requestStep3': 'Open it and hit Request. For a show you can pick specific seasons.',
  'guide.requestStep4': "That's it. It shows up in Jellyfin once it finishes downloading.",
  'guide.matcherStep1': 'One person opens Matcher and taps Create Room. A short code and QR appear.',
  'guide.matcherStep2': 'Everyone else scans the QR or types the code, then picks server-only or any movie.',
  'guide.matcherStep3': "You each check the genres you're up for; a quick knockout narrows it to two.",
  'guide.matcherStep4': 'Then swipe: right to like, left to pass, up for maybe, star for a super like. Tap a poster for the trailer and ratings.',
  'guide.matcherStep5': 'When everyone likes the same movie it locks in. If the deck runs out first, points decide a winner anyway.',

  /*
    R156: the three in-room screens' level-one headings (F8).

    These are read and never seen, so they say what the screen is FOR rather
    than repeating what is on it. A person navigating by heading arrives here
    first and needs to know which part of the evening they are in.
  */
  'lobby.heading': 'Room lobby',
  'knockout.headingPicking': 'Choosing genres',
  'knockout.headingElimination': 'Narrowing the genres',
  'deck.heading': 'Swiping for a film',

  /*
    R158: the guide's prose, whole at last.

    R155 recorded these as the sentences a catalogue could not hold, because
    each wraps an element -- the server address in a <Code>, two product names
    in <strong> -- and t() returns a string. They are one entry each now, with
    the element as a NAMED slot, so a translator can move {address} or {name}
    wherever their grammar puts it and the markup travels with it.
  */
  'guide.tvIntro': {
    text: 'Almost every TV platform has a Jellyfin app. Install it, point it at {address}, and sign in with the account you were given.',
    why: 'The slot is the server address as the household must type it. It has to stay a single unit inside the sentence -- an address broken across a clause is one somebody will copy wrongly.',
  },
  'guide.phoneOutro': 'Each one asks for the server address ({address}) and your login, then your library and resume points sync everywhere.',
  'guide.requestIntro': "We use {name} for requests. If a movie or show isn't in the library, ask for it there and it gets downloaded and added automatically.",
  'guide.matcherIntro': '{name} is a swipe game for picking something together. Everyone joins on their phone and it guarantees a pick.',

  /*
    The five a scan found after F3 was called finished.

    They were missed because they are not where sentences usually are: two are
    in loading states nobody looks at twice, one is a chip on the card, one is
    the knockout's failure line, and one is the deck's spoken announcement. The
    lesson is in R159 -- "every file migrated" was checked by listing files, and
    a string does not live in a file, it lives in a branch.
  */
  'knockout.tooFewPicks': {
    text: 'Too few shared picks — vote again with more options.',
    why: 'R54: it names what went wrong AND what to do about it. A room that reads only "too few picks" is a room staring at a screen with no next move.',
  },
  'card.notOnServer': {
    text: 'Not on your server',
    why: 'R42: a fact, not a warning. The film can still be voted for and requested; this says where it is, and must not borrow the voice of the cost disclosure.',
  },
  'card.onServer': 'On your server',
  'deck.onServerSpoken': 'On your server.',
  'deck.notOnServerSpoken': 'Not on your server.',
  'deck.building': 'Building your deck…',
  'room.reconnecting': {
    text: 'Reconnecting…',
    why: 'R149: the phone lost the socket and is trying again. It says the app is working on it, not that anything is lost -- rooms survive a restart now, and this screen is usually gone within a second.',
  },

  'guide.intro': "Everything you need to start watching on {host}: which apps to install on your TV, phone, and laptop, how to request something we don't have yet, and how to settle movie night when nobody can decide.",
  'guide.requestStep1': 'Go to {address} and sign in with your Jellyfin account (same login).',
  'home.tagline': {
    text: 'Everyone swipes the same deck. First film you all like wins.',
    why: 'R55: the first thing a guest reads after scanning a QR, and it has to explain the whole game in one line without asking them to sign up for anything. Both halves earn their place -- what everyone does, and how it ends.',
  },
  /*
    Recorded as unmovable because `Ratings` is inside `card.allRatings` and the
    details button's own label. R154 tells an identifier from a written word, so
    it moves like the rest.
  */
  'details.ratings': 'Ratings',

  /*
    R176: the room's own refusals, which the server writes and a phone reads.

    These are thrown in server/handlers.ts and `fail()` sends the message
    verbatim to the ack, so every one of them lands in a household's error
    banner. They were excluded from the catalogue on the grounds that
    server-side copy is "its own surface" -- true when those sentences mostly
    reached logs, and no longer true since R163 made every refusal arrive on
    screen.

    Upstream failures are deliberately NOT here. "Jellyfin request failed: 502"
    is a technical line for the person who can act on it, and R54 argues it
    should stay technical rather than be softened into copy.
  */
  'server.signInCreate': 'Sign in with your Jellyfin account to create a room',
  'server.signInJoin': 'Sign in with your Jellyfin account to join this room',
  'server.signInRequest': 'Sign in with your Jellyfin account to request a download',
  'server.signInWide': 'Sign in with your Jellyfin account to search any movie',
  'server.serverFull': {
    text: 'This server is full. Ask the host to restart it.',
    why: 'MAX_ROOMS is a real ceiling, and the person reading this cannot raise it. So the sentence names who can -- a refusal that does not say what would fix it is a dead end (R54).',
  },
  'server.tooManyRooms': 'Too many rooms from this device',
  'server.alreadyInLibrary': 'Already in the library',
  'server.notInRoom': 'You are not in a room',
  'server.nothingToUndo': 'Nothing to undo',
  'server.notSwiping': 'Not swiping',
  'server.notInKnockout': 'Not in knockout',
  'server.noWinnerReject': 'No winner to reject',
  'server.noWinnerRequest': 'No winner to request yet',
  'server.noTmdbId': 'No TMDb id on winner',
  'server.winnerMissing': 'Winner card missing from deck',
  'server.tooManyAttempts': {
    text: 'Too many attempts. Try again in {wait} second(s).',
    why: 'R86: the rate limit on seat-taking. It must say HOW LONG, because a refusal with no horizon is indistinguishable from being broken and the person will keep trying.',
  },
  'server.invalidVote': 'Invalid vote value: {points}',
  'server.unknownCard': 'Unknown card: {cardId}',
  'server.alreadyAsked': {
    text: '{name} already asked for this. The host has it.',
    why: 'R42: the request that spends the host\'s disk is attributed. Somebody pressing the button after somebody else needs to know it is already done and by whom, not merely that they failed.',
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

/** One piece of a message: literal text, or a named hole for something else. */
export type Segment = { text: string } | { slot: string };

/**
 * R158: a message split at its placeholders, so a sentence can contain an
 * element without being chopped into entries.
 *
 * R155 recorded why the guide's prose could not be catalogued. Its paragraphs
 * wrap the server address in a `<Code>` and two product names in `<strong>`,
 * and `t()` returns a string, so the only shape available was one entry per
 * fragment: 'Each one asks for the server address (' and ') and your login...'.
 * Word order across those fragments is frozen by English grammar -- no entry can
 * move a clause past the link -- so a language that puts the verb last simply
 * could not be expressed. Splitting them would have raised the coverage number
 * and made the catalogue worse at its only job.
 *
 * With the sentence whole and the element a NAMED hole, a translator can move
 * `{address}` anywhere in their sentence and the markup follows it.
 *
 * Deliberately framework-free and returning data rather than nodes: this file
 * is the catalogue and has no business importing React. `Sentence` in
 * components/Sentence.tsx does the rendering.
 */
export function segments(key: MessageKey, vars?: Record<string, string | number>): Segment[] {
  const text = t(key, vars);
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const start = m.index;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ slot: m[1]! });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
