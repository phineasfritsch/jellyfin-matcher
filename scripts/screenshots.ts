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
  const byLabel = await page.$(`button[aria-label="${name}"]`);
  if (byLabel) {
    await byLabel.click();
    return;
  }
  const handle = await page
    .locator(`button::-p-text(${name})`)
    .setTimeout(20_000)
    .waitHandle();
  await handle.click();
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) as `${string}.png` });
  console.log(`  ${name}.png`);
}

async function main() {
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
    await page.goto(`${URL}/`, { waitUntil: 'networkidle2' });
    await shoot(page, '01-home');

    const host = await hostRoom();
    sockets = [host.a];

    // Join as a real second member, so every screen after this is a
    // participant's view rather than a visitor's. The first version of this
    // script drove both members over sockets and captured the join gate three
    // times without noticing.
    await page.goto(`${URL}/room/${host.roomId}`, { waitUntil: 'networkidle2' });
    await page.locator('#join-name').fill('Bex');
    await shoot(page, '02-join');
    await clickButton(page, 'Join Room');
    await page.locator('::-p-text(Tonight)').setTimeout(20_000).waitHandle();
    await shoot(page, '03-lobby');

    await ack(host.a, 'room:ready', { ready: true });
    await clickButton(page, "I'm ready");
    await page.locator('::-p-text(Check everything)').setTimeout(20_000).waitHandle();
    await shoot(page, '04-knockout');

    const genres = await ack<{ genres: string[] }>(host.a, 'genres:list', {});
    const picked = genres.genres.slice(0, 4);
    for (const g of picked) await clickButton(page, `Pick ${g}`);
    await ack(host.a, 'knockout:submit_genres', { genres: picked });
    await clickButton(page, 'Lock in');

    let st: any = await on(host.a, 'room:state', () => true);
    let guard = 0;
    while (st.status === 'KNOCKOUT' && st.knockout.phase === 'ELIMINATION' && guard++ < 8) {
      await ack(host.a, 'knockout:eliminate', { genre: '__abstain__' });
      await clickButton(page, `Vote out ${st.knockout.pool[0]}`);
      st = await on(host.a, 'room:state', () => true);
    }

    // The deck build asks MDBList for ratings ten titles at a time, so a cold
    // cache is genuinely slow. Wait for it rather than capturing a skeleton.
    st = await Promise.race([
      on(host.a, 'room:state', (r: any) => r.status === 'SWIPING' && r.deck.length > 0),
      new Promise((_, rej) => setTimeout(() => rej(new Error('deck never built')), 180_000)),
    ]);
    await page.locator('::-p-text(Undo)').setTimeout(60_000).waitHandle().catch(() => {});
    await new Promise((r) => setTimeout(r, 4000)); // let posters land
    await shoot(page, '05-deck');

    console.log(`
Wrote to docs/screenshots. Room ${host.roomId}, ${st.deck.length} cards.`);
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

void main();
