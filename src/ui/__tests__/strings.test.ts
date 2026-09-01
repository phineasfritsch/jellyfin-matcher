import { describe, expect, it } from 'vitest';
import { appSources } from '../../../scripts/lib/source-scan';
import { WEIGHTS } from '../../lib/score';
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

/**
 * Did somebody TYPE this sentence here, as opposed to it merely occurring?
 *
 * A written string sits between quotes or between the tags of a JSX child.
 * Plain substring matching cannot tell that from a longer sentence that happens
 * to contain the words -- "Jellyfin only" lives inside "Switching the room back
 * to Jellyfin only will work now", which is a different message about the same
 * mode, and that collision is why server sources were excluded from the
 * duplication guard in the first place (R178).
 */
const OPENS = ["'", '"', '`', '>'];
const CLOSES = ["'", '"', '`', '<'];
function holdsWritten(code: string, text: string): boolean {
  for (let i = code.indexOf(text); i !== -1; i = code.indexOf(text, i + 1)) {
    let before = i - 1;
    while (before >= 0 && /\s/.test(code[before]!)) before--;
    let after = i + text.length;
    while (after < code.length && /\s/.test(code[after]!)) after++;
    if (OPENS.includes(code[before] ?? '') && CLOSES.includes(code[after] ?? '')) return true;
  }
  return false;
}

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

  it('the deck score still names the sources it is made of (R12)', () => {
    /*
      R12: a statistic never appears without naming what it covers. The three
      percentages in this sentence are WEIGHTS in src/lib/score.ts, read here
      rather than copied, so changing the formula and leaving the copy alone
      goes red -- and so does the reverse.

      Set comparison, not a fixed order: "35% Letterboxd" and "Letterboxd 35%"
      are both honest and a language may need the second. What this cannot see
      is a source paired with the WRONG one of its three numbers; two of the
      three weights are equal, so that pairing is not checkable from the string.
    */
    const line = t('details.deckScore', { score: '85.7' });
    const printed = [...line.matchAll(/(\d+)\s?%/g)].map((m) => Number(m[1]));
    const real = Object.values(WEIGHTS).map((w) => Math.round(w * 100));
    expect(printed.sort((a, b) => a - b)).toEqual(real.sort((a, b) => a - b));
    for (const source of [/Letterboxd/, /IMDb/, /RT|Rotten Tomatoes/]) {
      expect(line, `the deck score no longer names ${source}`).toMatch(source);
    }
  });

  it('the deck score still prints the score (R12)', () => {
    // The weights above survive a sentence with no number in it at all, which
    // would be three sources labelling nothing.
    expect(t('details.deckScore', { score: '85.7' })).toContain('85.7');
  });

  it('the two trailer controls do not collapse into one word (R29)', () => {
    /*
      R29 names the Play button: the sheet opens with zero network and the
      trailer mounts only on tap. "Watch" is the other case -- a link out to
      YouTube for a URL that will not embed. One verb for both stops telling
      anyone which of the two is about to happen, and the difference is whether
      you are leaving the app.
    */
    expect(t('details.playTrailer')).not.toBe(t('details.watchTrailer'));
    expect(t('details.playTrailer')).toMatch(/trailer/i);
    expect(t('details.watchTrailer')).toMatch(/trailer/i);
  });

  it('the hybrid tag stays a fact and does not borrow the cost voice (R42)', () => {
    /*
      R42 gives one voice to the thing that spends the host's disk. "Tagged both
      genres" says why the film is high in the deck; it was cut from the card
      face precisely so the one chip a card wears means money and nothing else.
      A film tagged both genres may well already be on the server.
    */
    expect(t('details.hybrid')).not.toMatch(/download|request|disk|server|cost/i);
  });

  it('the winner screen promises no approval gate either (R107, R111)', () => {
    /*
      The same promise as the deck's, on the screen where the button actually
      is. R107 rewrote the deck sentence, the confirm and the ack, and missed
      the winner screen's cost line -- which renders directly above the request
      button and so contradicted the confirm two taps later (R111).

      The two `askedHeld` entries say "approval" on purpose and are deliberately
      not in this list: they report a hold Jellyseerr actually applied, which is
      the opposite of promising one. That distinction is checked below.
    */
    const disclosures = ['winner.cost', 'winner.requestConfirm', 'winner.requestConfirmRuntime'] as const;
    for (const key of disclosures) {
      expect(t(key), `${key} promises an approval step this app cannot guarantee`).not.toMatch(
        /approv/i,
      );
    }
  });

  it('the winner screen states no size, and keeps saying the size is unknown (R91)', () => {
    /*
      R33 once said this screen "says how big the thing you are about to
      download is" and R36 prescribed "about {runtime} min of video". Neither is
      possible: no size datum reaches this app and the real figure is not
      settled until the host's Radarr picks a release. What replaced them is the
      uncertainty, stated -- so deleting that clause is as much a defect as
      inventing a number, and both halves are checked.

      The runtime in the second confirm identifies the film. The clause after it
      is what stops it being read as the cost.
    */
    for (const key of ['winner.cost', 'winner.requestConfirm', 'winner.requestConfirmRuntime'] as const) {
      expect(t(key)).not.toMatch(/\d+\s?(gb|mb|tb|gigabyte|megabyte)/i);
      expect(t(key)).not.toMatch(/min(ute)?s? of video/i);
    }
    for (const key of ['winner.requestConfirm', 'winner.requestConfirmRuntime'] as const) {
      expect(t(key), `${key} no longer says the size is unknowable tonight`).toMatch(
        /not known until/i,
      );
    }
  });

  it('the outcome line says the room agreed OR that points decided, never both (R90)', () => {
    /*
      Two ways a night can end, and the screen owes the room the one it got. The
      defect R90 fixed captioned a points winner "Everyone said yes" for anyone
      who reloaded, so each half of the pair has to be wrong for the other case:
      a sentence that covers both tells nobody anything.

      What this cannot see is the component choosing the wrong half.
      winner.render.test.tsx renders both branches and asserts each screen says
      one and not the other; that is the guard that executes this claim.
    */
    expect(t('winner.unanimous')).not.toBe(t('winner.viaPoints'));
    expect(t('winner.unanimous'), 'the agreement caption now fits a points winner too').not.toMatch(
      /point/i,
    );
    expect(t('winner.viaPoints'), 'the points caption no longer says the points decided').toMatch(
      /points? decided/i,
    );
    expect(t('winner.viaPoints'), 'the points caption claims the room agreed').not.toMatch(
      /everyone/i,
    );
    // The bar above says the same thing in two words, and drifts the same way.
    expect(t('winner.locked')).not.toBe(t('winner.pointsWinner'));
  });

  it('the reject confirm does not promise a deck to go back to (R100)', () => {
    /*
      On a points winner, rejecting leaves progress untouched: the deck is still
      exhausted and settlement declares the next film inside the same call. The
      copy said "puts everyone back in the deck" on both paths and its button
      said "keep swiping" on both, so the sentence and the tap disagreed with
      what the server was about to do.

      Three pairs -- the confirm, its yes-button, and the control that opens it
      -- because all three describe one path and the defect was one of them
      describing the other. What this cannot see is which half is shown;
      winner.render.test.tsx presses both.
    */
    expect(t('winner.rejectCostExhausted', { title: 'X' })).not.toMatch(/back in the deck/i);
    expect(t('winner.rejectCost', { title: 'X' })).toMatch(/back in the deck/i);
    expect(t('winner.rejectYesExhausted')).not.toMatch(/swip/i);
    expect(t('winner.rejectYes')).toMatch(/swiping/i);
    expect(t('winner.rejectExhausted')).not.toMatch(/swip/i);
    expect(t('winner.reject')).toMatch(/swiping/i);
  });

  it('both reject confirms say the film does not come back (R63)', () => {
    /*
      Rejecting is irreversible in one direction: the film is never offered
      again. That is the whole reason the confirm exists (R71), and it is said
      before the tap rather than after it -- on both paths, since the two
      branches were written separately and only one of them was ever read.
    */
    for (const key of ['winner.rejectCost', 'winner.rejectCostExhausted'] as const) {
      const line = t(key, { title: 'The Odyssey' });
      expect(line, `${key} lost the film it is about`).toContain('The Odyssey');
      expect(line, `${key} no longer says the film is gone for good`).toMatch(
        /not be offered again/i,
      );
    }
  });

  it('the request result reports which of the two Jellyseerr did (R107)', () => {
    /*
      Jellyseerr returns 1 for pending and 2 for approved. That value reaches
      the room, so the screen reports it instead of guessing: the accepted
      sentence must not talk about waiting for approval, and the held one must
      say plainly that it is waiting. The old copy said "once the host approves
      it" for both, which was wrong in the lenient direction on the one control
      that spends somebody else's disk.
    */
    expect(t('winner.askedApproved')).not.toMatch(/approv/i);
    expect(t('winner.askedApprovedBy', { name: 'Ada' })).not.toMatch(/approv/i);
    expect(t('winner.askedHeld')).toMatch(/holding it for approval/i);
    expect(
      t('winner.asked'),
      'the just-asked sentence claims to know what the server decided',
    ).not.toMatch(/approv|accepted/i);
  });

  it('the named request sentences carry a name and the anonymous ones do not (R42)', () => {
    /*
      Who spent the host's disk is the one fact on this screen a household is
      owed a name for -- the opposite of deck progress, which is a count because
      nobody should be watched being slow (R46, R61). The server does not always
      have a name to send, so there is a second sentence for that case rather
      than a placeholder left visibly unfilled on the payoff screen.
    */
    for (const key of ['winner.askedApprovedBy', 'winner.askedHeldBy'] as const) {
      expect(t(key, { name: 'Ada' }), `${key} dropped the name it exists to carry`).toContain('Ada');
    }
    for (const key of ['winner.asked', 'winner.askedApproved', 'winner.askedHeld'] as const) {
      expect(t(key), `${key} has a placeholder and no caller that fills it`).not.toMatch(/\{\w+\}/);
    }
  });

  it('the sign-in names whose account it is asking for (R10)', () => {
    /*
      Two fields and a bare "Sign in", on a page served from a stranger's LAN,
      is phishing-shaped: it does not say which credentials it wants. This is
      the fallback heading -- every caller that can say why it is asking passes
      a reason instead, and those sentences live in the files that know the
      reason, so they are not in this catalogue yet.
    */
    expect(t('auth.title')).toMatch(/jellyfin/i);
  });

  it('the sign-in makes two checkable claims rather than a reassurance', () => {
    /*
      The household's own Jellyfin verifies the password, and the admin key
      stays on the server -- the same promise README makes and pin D04 holds.
      Both are claims a reader can check. "Your details are safe" would be
      neither, and is what this kind of line usually decays into.
    */
    expect(t('auth.serverChecks')).toMatch(/your jellyfin server checks/i);
    expect(t('auth.serverChecks')).toMatch(/never reaches this page/i);
  });

  it('a sign-in that times out names the machine that went quiet (R88)', () => {
    /*
      `fetch` has no default timeout, so a Jellyfin that accepts the connection
      and never answers left the button disabled with nothing said and no way
      out but a reload. This sentence is what replaced the silence, so it has to
      name the server and leave the reader something to do; collapsing it into
      the generic failure line puts the silence back.
    */
    expect(t('auth.timeout')).toMatch(/jellyfin server/i);
    expect(t('auth.timeout')).not.toBe(t('auth.failed'));
  });

  it('the way out of the login is a sentence, not a "Back" (R55)', () => {
    /*
      It was 14px grey underlined "Back" beneath a full-width green button,
      which a guest who will never make an account reads as a trial wall. The
      words have to say what declining GETS you. Nothing behind this gate is
      unavailable to a guest who skips it.
    */
    expect(t('auth.decline')).toMatch(/without an account/i);
    expect(t('auth.decline').split(' ').length).toBeGreaterThan(2);
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
    // The details sheet. Four of its six entries are promises: what the deck
    // score is made of (R12), which trailer control leaves the app (R29), and
    // that the hybrid tag is a fact rather than a cost (R42). The other two --
    // the sheet's own name and the iframe's -- are labels, and say so by
    // carrying no reason.
    'details.deckScore',
    'details.hybrid',
    'details.playTrailer',
    'details.watchTrailer',
    /*
      The winner screen, which is where the promises are densest: it holds the
      one control that spends the host's disk, and it is the last thing anybody
      reads before pressing it. Four of these were rulings before they were
      strings -- the disclosure and its confirm (R107, R111, R91), which of the
      two ways the night ended (R90), and what rejecting actually costs (R100).
      Its plain labels -- the empty state, the bar, "Final ranking", "Keep this
      one" -- are not here, and say so by carrying no reason.
    */
    'winner.unanimous',
    'winner.viaPoints',
    'winner.costHeadline',
    'winner.cost',
    'winner.rankingRow',
    'winner.rejectCost',
    'winner.rejectCostExhausted',
    'winner.rejectYes',
    'winner.rejectYesExhausted',
    'winner.reject',
    'winner.rejectExhausted',
    'winner.play',
    'winner.request',
    'winner.requestConfirm',
    'winner.requestConfirmRuntime',
    'winner.asked',
    'winner.askedApproved',
    'winner.askedApprovedBy',
    'winner.askedHeld',
    'winner.askedHeldBy',
    // The login. Four of its five entries are promises -- about who checks the
    // password, what happens when nobody answers, and what declining gets you.
    // The fifth is the failure line, and carries no reason.
    'auth.title',
    'auth.serverChecks',
    'auth.timeout',
    'auth.decline',
  ];

  for (const key of LOAD_BEARING) {
    it(`${key} carries its reasoning`, () => {
      const reason = why(key);
      expect(reason, `${key} is load-bearing and says nothing about why`).not.toBe('');
      // Long enough to be a reason rather than a restatement of the string.
      expect(reason.length).toBeGreaterThan(60);
    });
  }

  /*
    R201: the list above is a FLOOR, and the quality checks are derived.

    LOAD_BEARING is hand-maintained, so it only ever covers what somebody
    remembered to add. It held 34 keys while 62 entries carried a `why` -- every
    server message added by R176 and R196 among the missing, which is to say the
    reasoning most recently written was the reasoning least checked.

    Writing a `why` IS the author declaring a message load-bearing. So the
    quality of every reason is checked from the data, and the hand list keeps
    the one job it can do: naming messages that MUST keep theirs, so deleting a
    reason from one of them is caught even though deletion removes it from the
    derived set too.
  */
  const REASONED = (Object.keys(en) as MessageKey[]).filter((k) => why(k) !== '');

  it('has more reasoned messages than the hand-written floor, or the floor is the whole list', () => {
    // Vacuity: if these ever match exactly, the derivation below is testing
    // nothing the loop above did not already cover.
    expect(REASONED.length).toBeGreaterThanOrEqual(LOAD_BEARING.length);
  });

  for (const key of REASONED) {
    it(`${key}'s reason is an argument, not a restatement`, () => {
      const reason = why(key);
      expect(
        reason.length,
        `${key} carries a reason too short to be one: "${reason}"`,
      ).toBeGreaterThan(60);
      expect(
        reason,
        `${key}'s reason repeats the string instead of explaining it`,
      ).not.toBe(t(key));
    });
  }

  it('cites the rulings, so a reason can be followed to its argument', () => {
    // A reason that cannot be traced is an assertion. These point at
    // docs/RULINGS.md, which indexes every one of them.
    const cited = REASONED.map(why).join(' ');
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
  /*
    The UI, which is what this catalogue covers.

    The first version scanned every app source and failed on `lobby.scopeLocal`
    ("Jellyfin only") because `server/diagnose.ts` says "Switching the room back
    to Jellyfin only will work now" — a different sentence that happens to name
    the mode. That is a substring collision, not a duplicated message, and a
    guard that cannot tell them apart would have pushed me to either mangle a
    diagnostic or stop cataloguing short labels.

    Server-side diagnostic copy is its own surface with its own wording. If it
    is ever catalogued too, this scope widens with it.
  */
  const sources = appSources().filter(
    (f) => f.path.startsWith('src/ui/') || f.path.startsWith('app/'),
  );

  /*
    R154: how a holder is recognised, which is not the same question for a
    sentence and for a word.

    `code.includes(text)` is right for a sentence -- it finds the copy wherever
    it sits, including inside a template literal, and a sentence long enough to
    be a message is not a substring of anything by accident.

    It is meaningless for a word. "ERR" is inside the guide that documents the
    label; "No" is inside "Nothing", "Not your fault" and "Nobody". Under a bare
    substring test those read as duplicated messages, so the catalogue could
    hold no short word at all -- and No, Yes, Maybe and Strong are exactly the
    words a translator has to change. The scope narrowing above deferred this by
    excluding `server/`; it is the same collision one directory in.

    So a short string has to be found the way it would actually be WRITTEN: as a
    quoted literal, or as JSX text between tags. `word: 'No'` still matches, and
    `Nothing` does not. Nothing about the long-string case changes.
  */
  const SENTENCE = 12;
  /** What a written string sits between: a quote, or the tags of a JSX child. */
  const OPENS = ["'", '"', '`', '>'];
  const CLOSES = ["'", '"', '`', '<'];

  /*
    Deliberately an index scan rather than a built regex. The pattern needs a
    backtick, a backslash-escaped needle and `\s`, and a `\s` inside a template
    literal is not a whitespace class -- it is the letter s. That is a silent
    wrong answer, in a guard, which is the one place a silent wrong answer is
    worst.
  */
  function holdsCopy(code: string, text: string): boolean {
    if (text.length >= SENTENCE) return code.includes(text);
    for (let i = code.indexOf(text); i !== -1; i = code.indexOf(text, i + 1)) {
      let before = i - 1;
      while (before >= 0 && /\s/.test(code[before]!)) before--;
      let after = i + text.length;
      while (after < code.length && /\s/.test(code[after]!)) after++;
      if (OPENS.includes(code[before] ?? '') && CLOSES.includes(code[after] ?? '')) return true;
    }
    return false;
  }

  for (const key of keys) {
    const text = t(key);
    it(`${key} appears once, in the catalogue`, () => {
      const holders = sources.filter((f) => holdsCopy(f.code, text)).map((f) => f.path);
      /*
        Zero holders and two holders are opposite problems, and this used to
        report both as "a component still has its own copy".

        Zero means the catalogue cannot find its OWN text, which in practice
        means the value is written with an escaped apostrophe: the source says
        `Can\'t` and the search is for `Can't`. Four guide entries hit this at
        once, and the message sent me looking for a duplicate that did not
        exist. Double-quote the value instead.
      */
      expect(
        holders,
        holders.length === 0
          ? `"${text.slice(0, 45)}..." is in NO source file, not even the catalogue -- is the value written with an escaped quote?`
          : `"${text.slice(0, 45)}..." is in ${holders.length} UI files; a component still has its own copy`,
      ).toEqual(['src/ui/strings.ts']);
    });
  }
});

describe('no server file keeps a copy either (R178)', () => {
  /*
    R176 let the server import the catalogue, and the duplication guard did not
    follow. It scans `src/ui/` and `app/`, so `server/handlers.ts` could hardcode
    a sentence the catalogue already holds and nothing would say so -- the exact
    fault the guard exists to prevent, in the files that had just been given
    access to it.

    It found one immediately: `server/index.ts` fell back to 'Login failed' in
    the /api/login route while the catalogue held the same words as
    `auth.failed`.

    Written-copy matching at EVERY length here, not just for short strings. In
    server sources the question is only ever "did somebody type this literal",
    and plain substring matching answers a different one: `lobby.scopeLocal` is
    "Jellyfin only", which sits inside diagnose.ts's "Switching the room back to
    Jellyfin only will work now" -- a different sentence that happens to name the
    mode, and the collision that made this scope get excluded in the first place.
  */
  const SERVER = appSources().filter((f) => f.path.startsWith('server/'));

  it('scans server sources, or this guard is vacuous', () => {
    expect(SERVER.length, 'no server files scanned').toBeGreaterThan(5);
  });

  for (const key of keys) {
    const text = t(key);
    const holders = SERVER.filter((f) => holdsWritten(f.code, text)).map((f) => f.path);
    if (holders.length === 0) continue;
    it(`${key} is not written out again in ${holders.join(', ')}`, () => {
      expect(
        holders,
        `${holders.join(', ')} writes "${text.slice(0, 40)}..." rather than asking the catalogue`,
      ).toEqual([]);
    });
  }
});

describe('no screen keeps a sentence of its own', () => {
  /*
    R159. F3 was called finished and five sentences were still hardcoded: the
    knockout's failure line, the card's "Not on your server" chip, the deck's
    building message and its spoken server line, and the reconnect notice. One
    of them, "Not on your server", turned out to be in TWO components.

    They survived because "every file migrated" was checked by LISTING FILES.
    A string does not live in a file, it lives in a branch -- and these are all
    in branches nobody looks at twice: two loading states, a chip, and an error.
    A file can be ninety per cent migrated and read as done.

    So this asks the source instead. It is deliberately narrow: only a line that
    is ENTIRELY prose, with no markup, no braces and no code punctuation on it.
    That is how JSX writes a sentence on its own line, and it is the shape that
    cannot be confused with a type parameter -- `useState<string>(null)` looks
    like a JSX text node to anything matching `>...<` across a whole file, which
    is how a first attempt at this produced a page of false positives.

    What it therefore does NOT catch is a sentence inline with its tag, and
    `Reconnecting…` was exactly that. That limit is real and is stated rather
    than papered over: this closes the common case, not every case.
  */
  const PROSE = /^[A-Za-z][A-Za-z0-9 ,.'’—…!?:()/-]{11,}$/;
  /*
    The two names that stay in the markup, exempt on purpose and listed rather
    than silently skipped -- a quiet exclusion is how R151 sat in the deck for
    months. These are the products' own names. A translator does not render
    "Jellyfin Matcher" differently, and putting a proper noun in the catalogue
    invites somebody to.
  */
  const PROPER_NOUNS = new Set(['Jellyfin Matcher', 'Jellyseerr']);
  const scanned = appSources().filter(
    (f) => f.path.startsWith('src/ui/') || f.path.startsWith('app/'),
  );

  for (const file of scanned) {
    if (file.path.endsWith('strings.ts')) continue;
    const offenders = file.code
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          PROSE.test(l) &&
          l.includes(' ') &&
          // Code that happens to be words: `return createPortal(`,
          // `function handleDragEnd(`. A sentence does not end in an opener.
          !/[,({[]$/.test(l) &&
          !/^(return|function|export|import|const|let|await|if|else|for|while|type|interface|class|new|throw)\b/.test(
            l,
          ) &&
          // An operator makes a line code however English it reads. A wrapped
          // ternary leaves `err instanceof Error` alone on its line: three
          // words, no punctuation, indistinguishable from a label by shape.
          // Third false-positive class this rule has been taught, and they are
          // all the same lesson -- source is not prose with tags around it.
          !/\b(instanceof|typeof|as)\b/.test(l),
      );

    /*
      The blind spot R159 admitted to, closed. A sentence written inline with
      its tag -- `<p>Reconnecting...</p>` -- never sits on a line of its own, so
      the whole-line rule above cannot see it. Requiring a CLOSING tag right
      after the text is what makes this safe: `useState<string>(x)` has no
      `</` after it, which is the collision that made the first attempt at this
      unusable.
    */
    const inline = [...file.code.matchAll(/>([A-Za-z][^<>{}]{2,})</g)]
      .map((m) => m[1]!.trim())
      .filter((v) => /[A-Za-z]{3}/.test(v) && !PROPER_NOUNS.has(v));

    it(`${file.path} has no bare sentence in its markup`, () => {
      expect(
        [...offenders, ...inline],
        `${file.path} writes prose directly into the page; it belongs in strings.ts`,
      ).toEqual([]);
    });
  }
});

describe('the catalogue can be read by the server (R176)', () => {
  /*
    The server's own refusals live here now, so `server/handlers.ts` imports a
    module under `src/ui/`. That is only safe because this file imports NOTHING
    -- no React, no component, no browser API. It is a data file with two pure
    functions, and R158 already required that when `segments()` was put here and
    the rendering left to `Sentence`.

    Add one import to the catalogue and the server drags a UI dependency into
    its graph: at best a slower boot, at worst a module that touches `window`
    inside a process that has none. The constraint was previously written in a
    comment and believed. This is it enforced.
  */
  const source = appSources().find((f) => f.path === 'src/ui/strings.ts');

  it('is a file the server can import without pulling in the UI', () => {
    expect(source, 'the catalogue moved and this guard lost its subject').toBeTruthy();
    /*
      R197: look for a module REFERENCE, not for a line that starts with the
      word import.

      `/^\s*import\s/m` needs whitespace after `import`, so `import{t}from'x'`
      slips past it — and so does a `require(...)`, a dynamic `import(...)`, and
      any import written across two lines with the first word alone. Every one
      of those brings the dependency this guard exists to keep out, and the
      count stays at zero.

      A data file references nothing. So the assertion is that no module
      specifier appears at all, in any of the shapes a bundler would honour.
    */
    const refs = [
      ...(source!.code.match(/\bfrom\s*['"]/g) ?? []),
      ...(source!.code.match(/\brequire\s*\(/g) ?? []),
      ...(source!.code.match(/\bimport\s*[('"{]/g) ?? []),
    ];
    expect(
      refs,
      'the catalogue references a module; server/handlers.ts and server/auth.ts import the catalogue',
    ).toEqual([]);
  });

  it('says nothing about a browser', () => {
    // The other half of the same constraint: a reference to `window` or
    // `document` compiles fine and throws in Node at the worst moment.
    expect(source!.code).not.toMatch(/\b(window|document|navigator|localStorage)\b/);
  });
});
