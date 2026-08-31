/**
 * Two real phones, one room.
 *
 *   npm start              # in one terminal, with a real Jellyfin configured
 *   npm run e2e:two        # in another
 *
 * Every harness in this repo before this one drove exactly one browser page.
 * `scripts/screenshots.ts` says it drives "two real sockets", and it does --
 * but the second member is a headless socket with no UI at all. So the single
 * sentence this product is built on:
 *
 *     Everyone swipes the same deck. The first film you all like wins.
 *
 * had never been observed happening. That one phone renders a winner proves
 * nothing about the other five in the room, and the interesting failures live
 * exactly there: a broadcast that reaches one socket and not another, a screen
 * that transitions locally without waiting for the room, a member view that is
 * correct for the person who acted and stale for everyone else.
 *
 * This drives two Chrome pages through a whole night and asserts what each one
 * can see, including the things it must NOT see (R61: your ballot is yours).
 *
 * Not in `npm run gate`: it needs a live Jellyfin and a running server. It is
 * the same class of thing as `npm run e2e` and shares its warning -- one at a
 * time, because the room it drives is real.
 */
import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const URL = process.env.MATCHER_URL ?? 'http://localhost:3000';
const PHONE = { width: 402, height: 874, deviceScaleFactor: 2 };

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

let failures = 0;
let checks = 0;

function ok(condition: boolean, what: string) {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${what}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${what}`);
  }
}

function step(what: string) {
  console.log(`\n· ${what}`);
}

/** Never wait forever. Every wait in here says what it was waiting for. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out waiting for ${what}`)), ms)),
  ]);
}

/**
 * Click by accessible name, focusing first.
 *
 * Focus matters: HTMLElement.click() dispatches without moving focus, which a
 * real tap does, and anything that remembers "the control that opened me" then
 * has nothing to remember (R83).
 */
async function tap(page: Page, name: string, who: string) {
  const clicked = await page.evaluate((label: string) => {
    const buttons = [...document.querySelectorAll('button, a[href]')] as HTMLElement[];
    const target =
      buttons.find((b) => b.getAttribute('aria-label') === label) ??
      buttons.find((b) => (b.innerText || '').trim().startsWith(label));
    if (!target) {
      return buttons.map((b) => b.getAttribute('aria-label') ?? `text:${(b.innerText || '').trim().slice(0, 30)}`);
    }
    target.scrollIntoView({ block: 'center' });
    target.focus();
    target.click();
    return true;
  }, name);
  if (clicked !== true) {
    throw new Error(`${who}: no control named "${name}". On screen: ${JSON.stringify(clicked)}`);
  }
}

/** Wait until the page's text satisfies a predicate, or say what was on it. */
async function waitForText(page: Page, pred: (t: string) => boolean, what: string, ms = 25_000) {
  const started = Date.now();
  for (;;) {
    const text = await page.evaluate(() => document.body.innerText);
    if (pred(text)) return text;
    if (Date.now() - started > ms) {
      throw new Error(`timed out waiting for ${what}. On screen:\n${text.slice(0, 600)}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** The film currently on top of this phone's deck, per its vote control. */
async function topCard(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const m = /^Vote yes on (.+), \+2$/.exec(b.getAttribute('aria-label') ?? '');
      if (m) return m[1] ?? null;
    }
    return null;
  });
}

async function textOf(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function join(page: Page, roomId: string, name: string) {
  await page.goto(`${URL}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#join-name', { timeout: 20_000 });
  await page.type('#join-name', name, { delay: 10 });
  await tap(page, 'Join Room', name);
  await waitForText(page, (t) => /tonight/i.test(t), `${name} to reach the lobby`);
}

async function main() {
  if (!CHROME) throw new Error('No Chrome found. Set CHROME_PATH.');

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

    /*
      One browser context each, which is what two phones actually are.

      Two pages in the default context share an origin's localStorage, so the
      second page picked up the first member's stored session and silently
      auto-reconnected as her -- the join screen never appeared, because as far
      as the app was concerned this was the same person coming back. Correct
      behaviour, wrong harness: a room of one phone pretending to be two is the
      exact illusion this script exists to stop relying on.
    */
    const adaCtx = await browser.createBrowserContext();
    const bexCtx = await browser.createBrowserContext();
    const ada = await adaCtx.newPage();
    const bex = await bexCtx.newPage();
    for (const p of [ada, bex]) await p.setViewport(PHONE);

    step('Ada creates a room on her phone');
    await ada.goto(URL, { waitUntil: 'domcontentloaded' });
    await ada.waitForSelector('input', { timeout: 20_000 });
    await ada.type('input', 'Ada', { delay: 10 });
    await tap(ada, 'Create', 'Ada');
    await waitForText(ada, (t) => /Room [A-Z0-9]{4}/.test(t), 'Ada to land in her room');
    const roomId = (/Room ([A-Z0-9]{4})/.exec(await textOf(ada)) ?? [])[1];
    if (!roomId) throw new Error('could not read the room code off Ada\u2019s screen');
    console.log(`  room ${roomId}`);

    step('Bex joins from a second phone');
    await join(bex, roomId, 'Bex');

    // The lobby is the first place the room is a room rather than a page.
    await waitForText(ada, (t) => t.includes('Bex'), 'Ada to see Bex arrive');
    ok((await textOf(ada)).includes('Bex'), 'Ada sees Bex arrive without reloading');
    ok((await textOf(bex)).includes('Ada'), 'Bex sees Ada');

    step('both say they are ready');
    await tap(ada, "I'm ready", 'Ada');
    await waitForText(
      bex,
      (t) => /1 of 2 ready/i.test(t) || /what are you open to/i.test(t),
      'Bex to see Ada ready',
    );
    // Not ok(true): a check that cannot fail is decoration. The wait above
    // throws on its own, so assert the state it left behind.
    const bexSeesReady = await textOf(bex);
    ok(
      /1 of 2 ready/i.test(bexSeesReady) || /what are you open to/i.test(bexSeesReady),
      'Ada readying up shows on Bex\u2019s phone without a reload',
    );
    await tap(bex, "I'm ready", 'Bex');

    step('the knockout opens on both phones');
    await waitForText(ada, (t) => /what are you open to/i.test(t), 'Ada to reach the knockout');
    await waitForText(bex, (t) => /what are you open to/i.test(t), 'Bex to reach the knockout');
    ok(
      /what are you open to/i.test(await textOf(ada)) &&
        /what are you open to/i.test(await textOf(bex)),
      'both phones enter the knockout together',
    );

    // Wait for real genre rows, not for the screen. The rows arrive after the
    // screen does, and the eight-stripe skeleton in front of them is what made
    // every committed 04-knockout.png a picture of a loading state (R85).
    for (const [page, who] of [[ada, 'Ada'], [bex, 'Bex']] as const) {
      await page
        .waitForSelector('button[aria-label^="Pick "]', { timeout: 30_000 })
        .catch(() => {
          throw new Error(`${who}: the knockout never rendered a genre row`);
        });
    }

    step('Ada picks first, and Bex must not be able to see what she picked');
    for (const genre of ['Action', 'Comedy', 'Drama']) await tap(ada, `Pick ${genre}`, 'Ada');
    await tap(ada, 'Lock in 3', 'Ada');
    await waitForText(ada, (t) => /waiting/i.test(t) || /1 of 2/i.test(t), 'Ada to be waiting on Bex');

    // R61 is a server promise, not a rendering convention: the picks must not
    // be on Bex's device at all, not merely undrawn.
    const bexState = await bex.evaluate(() => JSON.stringify((window as unknown as { __room?: unknown }).__room ?? null));
    ok(!/"Action"[\s\S]*"Comedy"[\s\S]*"Drama"/.test(bexState ?? ''), 'Ada\u2019s picks are not sitting in Bex\u2019s page state');
    ok(!(await textOf(bex)).includes('Ada picked'), 'Bex is not shown what Ada picked');

    step('Bex picks the same three, so the room agrees');
    for (const genre of ['Action', 'Comedy', 'Drama']) await tap(bex, `Pick ${genre}`, 'Bex');
    await tap(bex, 'Lock in 3', 'Bex');

    step('the elimination round, on both phones');
    await waitForText(ada, (t) => /still in/i.test(t) || /vote out/i.test(t) || /\d+ \/ \d+/.test(t), 'Ada past the checkbox round');
    const adaAfter = await textOf(ada);
    if (/still in/i.test(adaAfter)) {
      await tap(ada, 'Vote out Action', 'Ada');
      await tap(bex, 'Vote out Action', 'Bex');
    }

    step('the deck builds and both phones get the same first card');
    await waitForText(ada, (t) => / 1 \/ \d+/.test(t) || /\d+ \/ \d+/.test(t), 'Ada to reach the deck', 60_000);
    await waitForText(bex, (t) => /\d+ \/ \d+/.test(t), 'Bex to reach the deck', 60_000);
    // Read the title off the vote control's accessible name rather than
    // parsing rendered text: the label is the contract this harness drives on,
    // and it names the film exactly once, unambiguously.
    const adaCard = await topCard(ada);
    const bexCard = await topCard(bex);
    ok(Boolean(adaCard) && adaCard === bexCard, `both phones show the same first card (${adaCard ?? '?'} / ${bexCard ?? '?'})`);

    step('Ada votes yes; Bex must not learn how she voted');
    await tap(ada, `Vote yes on ${adaCard}, +2`, 'Ada');
    await new Promise((r) => setTimeout(r, 1200));
    const bexDuring = await textOf(bex);
    ok(!bexDuring.includes('Ada voted') && !bexDuring.includes('Ada said'), 'Bex is not told how Ada voted');
    ok(bexDuring.includes(adaCard ?? '\u0000'), 'Bex is still on her own first card, not dragged forward');

    step('Bex votes yes on the same film — the room should land, on both phones');
    await tap(bex, `Vote yes on ${bexCard}, +2`, 'Bex');

    // The whole product, in one assertion, on the device that did not act last.
    await withTimeout(
      waitForText(ada, (t) => /locked in/i.test(t) || /points winner/i.test(t), 'Ada to see the winner'),
      30_000,
      'the winner to reach Ada\u2019s phone',
    );
    await withTimeout(
      waitForText(bex, (t) => /locked in/i.test(t) || /points winner/i.test(t), 'Bex to see the winner'),
      30_000,
      'the winner to reach Bex\u2019s phone',
    );
    const adaWin = await textOf(ada);
    const bexWin = await textOf(bex);
    ok(adaWin.includes(adaCard ?? '\u0000'), 'Ada\u2019s winner screen names the film');
    ok(bexWin.includes(adaCard ?? '\u0000'), 'Bex\u2019s winner screen names the same film');
    ok(
      adaWin.includes('Everyone said yes.') && bexWin.includes('Everyone said yes.'),
      'both phones say the room agreed outright, not that points decided',
    );

    step('Bex reloads on the winner screen');
    await bex.reload({ waitUntil: 'domcontentloaded' });
    await waitForText(bex, (t) => /locked in/i.test(t) || /points winner/i.test(t), 'Bex to come back to the winner');
    const bexReloaded = await textOf(bex);
    // R90, from the other phone: the one that did not receive the declaration
    // event is the one a reload is most likely to lie to.
    ok(bexReloaded.includes(adaCard ?? '\u0000'), 'a reload still names the winner');
    ok(!bexReloaded.includes('Not on your server'), 'a reload does not offer to download a film the server has');

    console.log(`\n${checks - failures}/${checks} checks passed in room ${roomId}.`);
    if (failures > 0) throw new Error(`${failures} check(s) failed`);
  } finally {
    try {
      await browser?.close();
    } catch {
      /* Windows holds the crashpad file in the temp profile; cleanup only. */
    }
  }
}

main().catch((err) => {
  console.error();
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
