/**
 * Capture the screenshots the README and docs use.
 *
 * Two board members blocked on this: a stranger decides whether to star a repo
 * from an image before they read a word, and the design director will not sign
 * off on screens nobody has looked at. Doing it by hand is also how the images
 * quietly stop matching the app, so it is a command.
 *
 *   npm start            # in one terminal, with a real Jellyfin configured
 *   npm run shots        # in another
 *
 * Drives two real sockets through create -> ready -> genres -> deck so the
 * captures show real films from the real library rather than a fixture. Uses
 * the Chrome already installed on the machine (puppeteer-core, dev-only, never
 * in the shipped image).
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { io, type Socket } from 'socket.io-client';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const URL = process.env.MATCHER_URL ?? 'http://localhost:3000';

/** iPhone 15-ish. The only viewport this app is really designed for. */
const PHONE = { width: 402, height: 874, deviceScaleFactor: 2 };

/**
 * The same phone with the reader's text at 200%.
 *
 * Two people on the panel made this a condition and nobody had ever looked:
 * the app claimed to reflow at exactly this setting while every size in it was
 * a hardcoded pixel. Captured as its own set so the claim is checkable by
 * looking rather than by reading a comment (R60).
 */
const TEXT_200 = 32; // px root font size, i.e. 200% of the 16px default

const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p)) ??
  '';

function ack<T = Record<string, unknown>>(s: Socket, ev: string, p: unknown): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${ev} timed out`)), 30_000);
    s.emit(ev, p, (r: { ok: boolean; error?: string } & T) => {
      clearTimeout(t);
      r?.ok ? res(r) : rej(new Error(`${ev}: ${r?.error}`));
    });
  });
}

/**
 * Every wait in this script carries a deadline.
 *
 * Silence has to be distinguishable from success: three separate bugs here
 * presented identically, as a script that printed its last step and then sat
 * there until an outer timeout killed it with no message at all.
 */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out waiting for ${what}`)), ms)),
  ]);
}

function on<T = any>(s: Socket, ev: string, pred?: (p: T) => boolean): Promise<T> {
  return new Promise((res) => {
    const h = (p: T) => {
      if (!pred || pred(p)) {
        s.off(ev, h);
        res(p);
      }
    };
    s.on(ev, h);
  });
}

/**
 * One member over a socket. The BROWSER is the other one -- it has to actually
 * join, or every capture is the join gate, which is what the first version of
 * this script produced.
 */
async function hostRoom() {
  const a = io(URL, { transports: ['websocket'] });
  await on(a, 'connect');
  const room = await ack<{ roomId: string }>(a, 'room:create', { name: 'Ada' });
  return { a, roomId: room.roomId };
}

/**
 * Click a control by its accessible name, falling back to visible text.
 *
 * Selecting on aria-label rather than text is not incidental: matching on text
 * kept grabbing the container a label sits inside, and clicking a div does
 * nothing. Driving the app the way a screen reader addresses it also means
 * this script fails if those labels ever go missing.
 */
async function clickButton(page: Page, name: string) {
  /*
    Wait for the control, then dispatch the click in the page.

    Puppeteer's Locator.click waits for the element to be "stable" -- it
    compares bounding boxes across frames -- and on this app it never settled:
    the ambient ground and the blurred panes repaint continuously, so the click
    sat there past every deadline and the script died silently at an outer
    timeout with nothing to show for it. Handles were worse; they detach the
    moment a screen transitions.

    A dispatched click skips the actionability checks, which for a screenshot
    script is the right trade: the labels are what this drives on, and if a
    control is missing the error below says what was on screen instead.

    The label is the primary selector because a genre row is named
    "Vote out Action" and reads only "Action" -- matching visible text finds
    nothing.
  */
  const clicked = await page.evaluate((label: string) => {
    const buttons = [...document.querySelectorAll('button')];
    const target =
      buttons.find((b) => b.getAttribute('aria-label') === label) ??
      buttons.find((b) => (b.innerText || '').trim().startsWith(label));
    if (!target) {
      return buttons.map(
        (b) => b.getAttribute('aria-label') ?? `text:${(b.innerText || '').trim().slice(0, 24)}`,
      );
    }
    target.scrollIntoView({ block: 'center' });
    // Focus first. HTMLElement.click() dispatches the event without moving
    // focus, which a real tap does -- so without this the app is handed a
    // document with nothing focused, and anything that remembers "the control
    // that opened me" has nothing to remember. That is not the app being
    // wrong, it is this harness driving it in a way no person can.
    target.focus();
    target.click();
    return true;
  }, name);

  if (clicked !== true) {
    throw new Error(`No control named "${name}". On screen: ${JSON.stringify(clicked)}`);
  }
}



function step(msg: string) {
  console.log(`  · ${msg}`);
}

/**
 * Never `networkidle` on a room page.
 *
 * Every room holds a socket.io websocket open for its whole life, so the
 * network is never idle by definition and `goto` times out after thirty
 * seconds having rendered the page perfectly well. Wait for something real
 * instead.
 */
async function open(page: Page, url: string, waitFor: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(waitFor, { visible: true, timeout: 60_000 });
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) as `${string}.png` });
  console.log(`  ${name}.png`);
}

async function main() {
  // Behavioural checks made while the browser is already in each state.
  let failures = 0;
  if (!CHROME) {
    console.error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  let browser: Browser | undefined;
  let sockets: Socket[] = [];
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage();
    await page.setViewport(PHONE);

    console.log('capturing:');
    await open(page, `${URL}/`, '#name');
    await shoot(page, '01-home');

    const host = await hostRoom();
    sockets = [host.a];

    // Join as a real second member, so every screen after this is a
    // participant's view rather than a visitor's. The first version of this
    // script drove both members over sockets and captured the join gate three
    // times without noticing.
    step('waiting for the join gate');
    await open(page, `${URL}/room/${host.roomId}`, '#join-name');
    // Real key events: a controlled React input ignores a set .value.
    await page.type('#join-name', 'Bex', { delay: 10 });
    await shoot(page, '02-join');
    await clickButton(page, 'Join Room');
    await page.locator('::-p-text(Tonight)').setTimeout(20_000).waitHandle();
    await shoot(page, '03-lobby');

    /*
      The lobby at 200% text.

      Every screen built on the listings grid pays a 58px label gutter, and the
      only 200% captures this project had were the deck and the winner -- both
      of which use the grid barely or not at all. So the one dimension in the
      app that constrains content rather than flooring it had never been
      photographed at the size it constrains hardest (R102).
    */
    step('re-shooting the lobby at 200% text');
    await page.evaluate((px: number) => {
      document.documentElement.style.fontSize = `${px}px`;
    }, TEXT_200);
    await new Promise((r) => setTimeout(r, 900));
    await shoot(page, '03b-lobby-200-percent');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await new Promise((r) => setTimeout(r, 500));

    await ack(host.a, 'room:ready', { ready: true });
    await clickButton(page, "I'm ready");
    /*
      Wait for a real genre row, not for the screen.

      This waited on "Check everything", which is a static row present in the
      loading skeleton too -- so every 04-knockout.png this project has ever
      committed, including the ones the README ships above the fold with alt
      text promising "a list of genres to pick from", is eight empty grey
      stripes. The first screen that asks a person for an opinion had never
      been photographed. The deck step below already knew to refuse a skeleton;
      this one did not (R85).
    */
    await page
      .locator('button[aria-label^="Pick "]')
      .setTimeout(25_000)
      .waitHandle()
      .catch(() => {
        // The error path sets genres to [], so without its own message this
        // would just hang to the outer timeout with nothing to say.
        throw new Error('the knockout never rendered a genre row (still the skeleton, or genres came back empty)');
      });
    await new Promise((r) => setTimeout(r, 400));

    /*
      Photograph a choice being made, not the form before anyone touched it.

      This shot sat before the pick loop below, so every 04-knockout.png the
      README has ever shipped above the fold shows every row unpicked, the
      header reading "0 of 2 in", and a disabled 50%-opacity "Lock in 0". The
      lead image of a product about deciding together was nobody having decided
      anything. Moved after the picks (R103).
    */
    const genres = await ack<{ genres: string[] }>(host.a, 'genres:list', {});
    const picked = genres.genres.slice(0, 4);
    for (const g of picked) await clickButton(page, `Pick ${g}`);
    await new Promise((r) => setTimeout(r, 500));
    await shoot(page, '04-knockout');

    // Assert the picks actually landed. A dispatched click on a disabled
    // button is a silent no-op, and "Lock in" is disabled until something is
    // picked -- so a missed pick used to present as the whole script hanging
    // on a broadcast that was never going to come.
    const pressed = await page.evaluate(
      () =>
        [...document.querySelectorAll('button[aria-pressed="true"]')].filter((b) =>
          (b.getAttribute('aria-label') ?? '').startsWith('Pick ') ||
          (b.getAttribute('aria-label') ?? '').endsWith(', picked'),
        ).length,
    );
    step(`${pressed} genres picked in the browser`);
    if (pressed === 0) throw new Error('no genre picks registered in the browser');

    await ack(host.a, 'knockout:submit_genres', { genres: picked });

    // Listen before clicking. Both members are now in, so the phase resolves
    // inside the click itself -- attaching afterwards misses the broadcast and
    // waits for something that has already happened. This is the second time
    // this exact race bit in this script.
    const left = withTimeout(
      on(host.a, 'room:state', (r: any) => r.knockout.phase !== 'CHECKBOX'),
      30_000,
      'the knockout to leave the checkbox phase',
    );
    step('locking in genres');
    await clickButton(page, 'Lock in');

    step('waiting for the knockout to resolve');
    let st: any = await left;
    let guard = 0;
    while (st.status === 'KNOCKOUT' && st.knockout.phase === 'ELIMINATION' && guard++ < 10) {
      const before = st.knockout.pool.length;
      const target = st.knockout.pool[0];
      step(`elimination round: ${before} left, voting out ${target}`);
      // Listen BEFORE acting. The round can resolve inside the ack, so
      // attaching the listener afterwards misses the broadcast entirely and
      // waits for an event that has already happened.
      const resolved = withTimeout(
        on(
          host.a,
          'room:state',
          (r: any) => r.status !== 'KNOCKOUT' || r.knockout.pool.length < before,
        ),
        30_000,
        `elimination round to resolve after voting out ${target}`,
      );
      // Browser first, host second: driving the host first let the round move
      // under the browser before it had rendered the round it was voting in.
      // The room can also reach two genres and leave the knockout entirely
      // while this is mid-round, in which case there is nothing left to click
      // and that is success, not failure.
      try {
        // Wait for the browser to render the round the host can already see.
        // The two are different clocks: the host's socket gets the broadcast
        // before React has re-rendered, and driving the click off the host's
        // view meant asking for a control the page had not drawn yet.
        await page.waitForSelector(`button[aria-label="Vote out ${target}"]`, {
          visible: true,
          timeout: 20_000,
        });
        await clickButton(page, `Vote out ${target}`);
      } catch (err) {
        const now: any = await withTimeout(
          on(host.a, 'room:state', () => true),
          5_000,
          'a room state to confirm the knockout had ended',
        ).catch(() => null);
        if (now && now.status !== 'KNOCKOUT') {
          st = now;
          break;
        }
        throw err;
      }
      await ack(host.a, 'knockout:eliminate', { genre: '__abstain__' });
      st = await resolved;
    }

    step('waiting for the deck to build');
    // The deck build asks MDBList for ratings ten titles at a time, so a cold
    // cache is genuinely slow. Wait for it rather than capturing a skeleton.
    st = await withTimeout(
      on(host.a, 'room:state', (r: any) => r.status === 'SWIPING' && r.deck.length > 0),
      180_000,
      'the deck to build',
    );
    await page.locator('::-p-text(Undo)').setTimeout(60_000).waitHandle().catch(() => {});
    await new Promise((r) => setTimeout(r, 4000)); // let posters land
    await shoot(page, '05-deck');

    // The deck at 200% text, captured before anything else moves: this is the
    // screen where the vote row used to reflow off the bottom.
    step('re-shooting the deck at 200% text');
    await page.evaluate((px: number) => {
      document.documentElement.style.fontSize = `${px}px`;
    }, TEXT_200);
    await new Promise((r) => setTimeout(r, 1200));
    await shoot(page, '06-deck-200-percent');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await new Promise((r) => setTimeout(r, 600));

    // The details sheet: the screen that carries every fact the card does not.
    step('opening the details sheet');
    await clickButton(page, `Ratings, synopsis and trailer for ${st.deck[0].title}`);
    await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 900));
    await shoot(page, '07-details');

    /*
      This harness is the only thing in the repo that reaches this state with a
      real browser, so it checks two invariants while it is here. Both are
      invisible in the picture it just took.

      R31: focus moves into the sheet, and Escape hands it back to the control
      that opened it. The sheet now renders through a portal (R81), which exists
      only from the second render -- an effect that does not wait for it finds a
      null ref and silently does nothing, leaving the focus trap closed over
      nothing while every test stays green.
    */
    const focusedInSheet = await page.evaluate(() => {
      const sheet = document.querySelector('[data-app-focus]');
      const active = document.activeElement;
      return Boolean(sheet && active && (sheet === active || sheet.contains(active)));
    });
    if (!focusedInSheet) {
      console.log('  WARNING: opening the details sheet did not move focus into it (R31)');
      failures += 1;
    }

    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 600));

    const focusReturned = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active !== document.body && active.tagName === 'BUTTON');
    });
    if (!focusReturned) {
      console.log('  WARNING: closing the details sheet dropped focus to <body> (R31)');
      failures += 1;
    }

    // The winner. The room spent the whole night arriving at this screen and
    // nobody had ever photographed it.
    step('driving both members to a unanimous yes');
    const card = st.deck[0];
    const declared = withTimeout(
      on(host.a, 'match:declared', () => true),
      30_000,
      'the room to land on a film',
    );
    await ack(host.a, 'swipe:vote', { cardId: card.id, points: 2 });
    await clickButton(page, `Vote yes on ${card.title}, +2`);
    await declared;
    await page.waitForSelector('h1[tabindex="-1"]', { visible: true, timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 1800)); // poster + confetti
    await shoot(page, '08-winner');

    /*
      Reload on the winner screen and check the room still tells the same story.

      viaFallback, the ranking and the play URL used to live only in the
      transient match:declared event, so one refresh recomputed `held` as false
      and the payoff screen reported a film sitting in the library as "Not on
      your server", offering to download it (R90). Only a real reload shows it:
      the state is correct right up until the event is the thing that is gone.
    */
    step('reloading the winner screen');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1[data-app-focus]', { visible: true, timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 1200));
    const afterReload = await page.evaluate(() => document.body.innerText);
    if (!afterReload.includes('On your server')) {
      console.log('  WARNING: after a reload the winner screen no longer says the film is on the server (R90)');
      failures += 1;
    }
    if (afterReload.includes('Not on your server')) {
      console.log('  WARNING: after a reload the winner screen offers to download a film the server already has (R90)');
      failures += 1;
    }

    // The same deck, at 200% text. This is the screen the reflow comment is
    // about, so it is the one worth photographing.
    step('re-shooting at 200% text');
    await page.evaluate((px: number) => {
      document.documentElement.style.fontSize = `${px}px`;
    }, TEXT_200);
    await new Promise((r) => setTimeout(r, 1200));
    await shoot(page, '09-winner-200-percent');

    /*
      A second room, in Any Movie scope, to photograph the download disclosure.

      Every capture before this ran in local scope, where a card's
      jellyfinItemId comes from a required string and so is never null. `notHeld`
      was therefore false for every card in every screenshot ever committed --
      which means the chip on the poster, the cost line under the deck, and the
      request confirmation on the winner screen had never been seen rendered.
      That is the honesty copy: the sentences that tell a person voting yes can
      spend the host's disk, including the one R91 rewrote to stop promising a
      size the app cannot know (R103).

      NOTHING HERE PRESSES SEND. "Request via Jellyseerr" only opens the
      confirmation; the send is the "Yes, ask" button inside it, and this script
      must never touch that control -- it fires a real request that lands in the
      host's Radarr as a real download. The confirmation state is the picture
      worth having anyway: it is where the cost is stated.
    */
    step('a second room in Any Movie scope, for the disclosure copy');

    /*
      Any Movie needs an account under the default auth mode.

      MATCHER_AUTH defaults to "requests", not "off", so wideRequires is true
      and tapping the scope row raises a sign-in gate. This script will not
      handle anybody's Jellyfin password, so when the gate is up it says what is
      missing and skips -- rather than driving a login, and rather than
      committing a picture of the wrong screen.

      To refresh 10-deck-not-on-server.png:
        MATCHER_AUTH=off npm start     # in one terminal
        npm run shots                  # in another

      The capture is unaffected by the mode: the chip and the cost line are
      about a card having no jellyfinItemId, which is a fact about the library,
      not about who is signed in.
    */
    const wideGated = await fetch(`${URL}/healthz`)
      .then((r) => r.json() as Promise<{ auth?: { wideRequires?: boolean } }>)
      .then((h) => h.auth?.wideRequires === true)
      .catch(() => true);

    if (wideGated) {
      console.log(
        '  skipped 10-deck-not-on-server: Any Movie needs an account under MATCHER_AUTH=requests.\n' +
          '            Re-run against a server started with MATCHER_AUTH=off to refresh it.',
      );
    } else {
      /*
        Two members, because a room of one never leaves the lobby -- the app
        refuses to start a movie night for one person, which is correct and is
        what the first attempt at this capture ran into.

        Both members submit the SAME two genres, so the overlap is exactly two
        and the checkbox round resolves straight to DONE. That sidesteps the
        elimination loop in the main flow above, which carries four separate
        race fixes and is not worth duplicating here.
      */
      const wide = await hostRoom();
      sockets.push(wide.a);
      await ack(wide.a, 'room:settings', { scope: 'wide' });

      await open(page, `${URL}/room/${wide.roomId}`, '#join-name');
      await page.type('#join-name', 'Bex', { delay: 10 });
      await clickButton(page, 'Join Room');
      await page.locator('::-p-text(Tonight)').setTimeout(20_000).waitHandle();

      await ack(wide.a, 'room:ready', { ready: true });
      await clickButton(page, "I'm ready");
      await page
        .locator('button[aria-label^="Pick "]')
        .setTimeout(30_000)
        .waitHandle()
        .catch(async () => {
          const seen = await page.evaluate(() => document.body.innerText).catch(() => '');
          throw new Error(`the Any Movie knockout never rendered a genre row. On screen:
${seen.slice(0, 400)}`);
        });

      const two = (await ack<{ genres: string[] }>(wide.a, 'genres:list', {})).genres.slice(0, 2);
      for (const g of two) await clickButton(page, `Pick ${g}`);
      await ack(wide.a, 'knockout:submit_genres', { genres: two });
      await clickButton(page, 'Lock in 2');

      step('waiting for an Any Movie deck');
      await page
        .locator('button[aria-label^="Vote yes on"]')
        .setTimeout(90_000)
        .waitHandle()
        .catch(async () => {
          const seen = await page.evaluate(() => document.body.innerText).catch(() => '');
          throw new Error(`the Any Movie deck never built. On screen:
${seen.slice(0, 400)}`);
        });

      /*
        Walk to a film the server does not have. Any Movie mixes owned and
        unowned titles and only an unowned one carries the disclosure, so this
        looks rather than assuming the first card is the interesting one. It
        votes "maybe", which cannot settle the room on a film nobody has agreed
        to and costs nothing.

        NOTHING HERE PRESSES SEND. The request button on the winner screen only
        opens a confirmation; the send is "Yes, ask" inside it, and this script
        must never touch that control -- it fires a real Jellyseerr request that
        lands in the host's Radarr as a real download.
      */
      let found = false;
      for (let i = 0; i < 12 && !found; i += 1) {
        /*
          Look at the TOP card only.

          The cards behind it are still in the DOM -- that is why SwipeCard uses
          an opaque surface rather than a translucent one -- so
          document.body.innerText matched a chip four cards down and this
          committed a picture of a film the server does have, with no disclosure
          on it anywhere. Exactly the failure R85 was about, reproduced inside
          the harness written to prevent it, one screen along.

          The active card is the one that is not aria-hidden.
        */
        found = await page.evaluate(() => {
          const top = document.querySelector('[aria-hidden="false"]');
          return (top instanceof HTMLElement ? top.innerText : '').includes('Not on your server');
        });
        if (found) break;
        const top = await page.evaluate(() => {
          for (const b of document.querySelectorAll('button')) {
            const m = /^Vote maybe on (.+), \+1$/.exec(b.getAttribute('aria-label') ?? '');
            if (m) return m[1];
          }
          return null;
        });
        if (!top) break;
        await clickButton(page, `Vote maybe on ${top}, +1`);
        await new Promise((r) => setTimeout(r, 700));
      }

      if (found) {
        await new Promise((r) => setTimeout(r, 500));
        await shoot(page, '10-deck-not-on-server');
      } else {
        // Say so rather than committing a picture of the wrong thing. Every
        // capture here that quietly showed the wrong state got there by a step
        // that failed silently.
        console.log('  WARNING: no unowned film in the first cards of the Any Movie deck; 10 not captured');
        failures += 1;
      }
    }

    console.log(`
Wrote to docs/screenshots. Room ${host.roomId}, ${st.deck.length} cards.`);
    if (failures > 0) {
      // Non-zero, because the pictures being correct is not the same as the app
      // being correct, and this is the only place the difference is visible.
      throw new Error(`${failures} behavioural check(s) failed -- see WARNING lines above`);
    }
  } finally {
    for (const s of sockets) s.close();
    // Windows holds the crashpad file in the temp profile open, so close()
    // throws EBUSY *after* the captures are already on disk. Swallowing it
    // stops a cleanup failure being reported as a capture failure.
    try {
      await browser?.close();
    } catch {
      /* profile cleanup only */
    }
  }
}

// A rejection out of main was invisible: `void main()` swallows it, so three
// separate failures all looked like a script that simply stopped talking.
main().catch((err) => {
  console.error();
  console.error('FAILED:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.cause) console.error('cause:', err.cause);
  process.exit(1);
});
