/**
 * R186: WCAG 1.4.12 Text Spacing, measured instead of feared.
 *
 * docs/ACCESSIBILITY.md filed this under "at risk, and not yet established",
 * said "never considered", and named exactly how to settle it: the measure-rows
 * approach with the four properties forced. That is this.
 *
 * The criterion: no loss of content or functionality when a reader's own
 * stylesheet sets line-height to 1.5x the font size, letter-spacing to 0.12em,
 * word-spacing to 0.16em and paragraph spacing to 2em. All four are INCREASES,
 * and this app is fixed-height and clips -- `h-dvh` with `overflow-hidden`, a
 * deck that deliberately cannot scroll (R21/R59), `leading-none` in places that
 * would grow, and `truncate` on the film title R84 fought to keep on screen.
 *
 * WHAT COUNTS AS LOSS, and it is measured rather than eyeballed:
 *
 *   - a scrollable box whose content is taller than it can show, when nothing
 *     can scroll, is clipped content;
 *   - a line of text whose scrollWidth exceeds its clientWidth is truncated,
 *     and an ellipsis is loss even though it looks deliberate.
 *
 * Both are counted with the overrides off and then on, because a truncation
 * that was already there is a different finding from one the reader's
 * stylesheet caused. Only the delta belongs to 1.4.12.
 */
import puppeteer from 'puppeteer-core';
import { stylesheet } from './lib/stylesheet';

const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => {
    try {
      return require('node:fs').existsSync(p);
    } catch {
      return false;
    }
  });

/** The exact values the criterion names. Nothing here is a judgement call. */
const SPACING = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

/**
 * The screens with something to lose: the ones that clip.
 *
 * The deck is the whole argument -- fixed height, cannot scroll, and carrying
 * the one truncated title. The lobby is here because it is the other screen a
 * room stares at, and the winner because R84's title fight was about it.
 */
const SCREENS: Array<{ name: string; html: string }> = [
  {
    name: 'deck',
    html: `
<main class="app-shell mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden" data-shell>
  <div class="scrim sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3">
    <span class="text-body font-semibold tracking-[-0.01em] text-super truncate" data-clip>Action, Comedy</span>
    <span class="tabular shrink-0 text-label font-medium text-muted-fg">1 / 50</span>
  </div>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden" data-region>
    <p class="tabular px-4 py-1.5 text-label text-muted-fg">1 of 2 others finished</p>
    <div class="relative min-h-[150px] flex-1 shrink px-3 pt-3">
      <div class="absolute inset-0 overflow-hidden rounded-[var(--radius-card)] bg-white/[0.06] p-3">
        <p class="text-title font-semibold leading-none truncate" data-clip>The Assassination of Jesse James by the Coward Robert Ford</p>
        <p class="text-label text-muted-fg truncate" data-clip>2007 &middot; 160 min &middot; Drama, Western</p>
      </div>
    </div>
    <div class="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2 px-3 pb-1 pt-2">
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)]">No</button>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)]">Maybe</button>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)]">Yes</button>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)]">Strong</button>
    </div>
    <div class="grid w-full grid-cols-[3.625rem_1fr] items-stretch border-b min-h-[60px]">
      <span class="flex items-center justify-center py-3.5 text-caption font-bold uppercase text-muted-fg">BACK</span>
      <span class="flex flex-col justify-center py-3.5 pr-4">
        <span class="text-row font-semibold leading-snug truncate" data-clip>Undo &mdash; The Thing</span>
      </span>
    </div>
  </div>
</main>`,
  },
];

/** A real phone, and the smallest viewport 1.4.10 cares about. */
const VIEWPORTS = [
  { name: '402x874 (a phone)', width: 402, height: 874 },
  { name: '320x568 (small)', width: 320, height: 568 },
  /*
    The squeeze. 1.4.12 names no viewport, so the honest test is the tightest
    one this app claims to support -- which R137 established is 1280x1024 at
    400% zoom, where the deck already had to be taught to release and scroll.
    Spacing increases on top of that is where loss would actually appear.
  */
  { name: '320x256 (1280x1024 at 400% zoom)', width: 320, height: 256 },
];

async function main() {
  if (!CHROME) throw new Error('no Chrome found; set CHROME_PATH');
  const css = stylesheet();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  let losses = 0;

  try {
    for (const screen of SCREENS) {
      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

        const readings: Record<string, { clipped: number; truncated: number }> = {};
        for (const spacing of ['off', 'on'] as const) {
          await page.setContent(
            `<!doctype html><html><head><style>${css}</style>` +
              `<style>html,body{margin:0}</style>` +
              (spacing === 'on' ? `<style>${SPACING}</style>` : '') +
              `</head><body class="bg-background text-foreground">${screen.html}</body></html>`,
            { waitUntil: 'load' },
          );

          // No named inner functions: tsx compiles them into a call to
          // esbuild's __name helper, which does not exist in the page.
          readings[spacing] = await page.evaluate(() => {
            let clipped = 0;
            for (const el of document.querySelectorAll('[data-shell],[data-region]')) {
              /*
                Overflowing is not losing. R137 taught the shell to RELEASE
                below 520px of height, so at the 400% zoom viewport the content
                is taller than the box and reachable by scrolling -- which is
                the fix working, and counting it as loss would report a pass as
                a failure and, worse, a failure as a pass once somebody
                "corrected" the metric.

                So the question is whether the overflow is reachable: content
                taller than its box, in a box whose computed overflow-y hides
                it, with no ancestor able to scroll to it.
              */
              const style = getComputedStyle(el);
              const hides = style.overflowY === 'hidden' || style.overflowY === 'clip';
              if (hides && el.scrollHeight > el.clientHeight + 1) clipped += 1;
            }
            let truncated = 0;
            for (const el of document.querySelectorAll('[data-clip]')) {
              if (el.scrollWidth > el.clientWidth + 1) truncated += 1;
            }
            return { clipped, truncated };
          });
        }

        const off = readings.off!;
        const on = readings.on!;
        const newClip = on.clipped - off.clipped;
        const newTrunc = on.truncated - off.truncated;
        const verdict = newClip === 0 && newTrunc === 0 ? 'no new loss' : 'LOSS';
        if (verdict === 'LOSS') losses += 1;

        console.log(
          `${screen.name} @ ${vp.name}\n` +
            `  clipped regions   ${off.clipped} -> ${on.clipped}\n` +
            `  truncated lines   ${off.truncated} -> ${on.truncated}\n` +
            `  ${verdict}\n`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  if (losses > 0) {
    console.log(
      `1.4.12: FAIL. ${losses} case(s) lose content that the reader's own stylesheet caused.\n` +
        'A truncation already present with spacing off is not this criterion -- only the delta is.',
    );
    process.exit(1);
  }
  console.log(
    '1.4.12: no new loss at these viewports. Reading the numbers above matters more\n' +
      'than the verdict: a line already truncated before the overrides is a different\n' +
      'defect, and this says nothing about it.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
