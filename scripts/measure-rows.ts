/**
 * R128: measure a settings row at 100% and 200% text, without a Jellyfin.
 *
 * The stacked-row question has been open since R102 with a screenshot attached
 * and no numbers under it. `npm run shots` produces the picture, but it needs a
 * live Jellyfin, a running server and a real room -- which is why the question
 * sat open: the evidence was gated behind an environment nobody had.
 *
 * A row's layout is pure CSS. So this loads the *compiled* stylesheet the app
 * actually ships -- not the source, not a hand-copied rule -- puts the real row
 * markup under it, and measures the two tracks in a real Chrome at both root
 * sizes. It is honest about its own scope: this measures the CSS, not the
 * running app. It cannot see anything React does, and a row whose markup drifts
 * from the strings below is a row this does not measure. `npm run shots`
 * remains the thing that photographs the real screen.
 *
 * Usage: npm run measure:rows
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => fs.existsSync(p)) ??
  '';

/** The phone the rest of this project measures on. */
const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2 };
const ROOTS = [16, 32]; // 100% and 200% text

/** Find the compiled stylesheet, building it first if there is not one. */
function stylesheet(): string {
  const dir = path.join(process.cwd(), '.next/static/css');
  if (!fs.existsSync(dir)) {
    console.log('no compiled css -- running next build (once)');
    execSync('npx next build', { stdio: 'inherit' });
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
  if (files.length === 0) throw new Error(`no stylesheet in ${dir}`);
  // Largest is the app stylesheet; the others are route chunks.
  const biggest = files
    .map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.size - a.size)[0]!;
  console.log(`stylesheet: ${biggest.f} (${(biggest.size / 1024).toFixed(1)} kB)`);
  return fs.readFileSync(path.join(dir, biggest.f), 'utf8');
}

/**
 * The real row markup, copied from the components. Kept as literal strings on
 * purpose: if a component's classes change and these do not, this script keeps
 * reporting the old layout, and the mismatch is the point of the warning it
 * prints.
 */
const GRID =
  'grid w-full grid-cols-[3.625rem_1fr] items-stretch border-b border-border';

const ROWS: Array<{ name: string; html: string }> = [
  {
    name: 'runtime (Lobby, the only continuous control)',
    html: `<div class="${GRID}" data-row>
      <span data-gutter class="flex items-center justify-center py-3.5 text-caption font-bold uppercase tracking-[0.05em] text-muted-fg">MAX</span>
      <div data-content class="flex flex-col justify-center gap-2 py-3.5 pr-4">
        <label class="text-row font-semibold leading-snug tracking-[-0.01em]">Max runtime &mdash; 2 hr 30 min</label>
        <input type="range" class="slider" min="0" max="5" value="3">
      </div>
    </div>`,
  },
  {
    name: 'deck size (Lobby, a chosen option)',
    html: `<div class="${GRID} min-h-[60px]" data-row>
      <span data-gutter class="flex items-center justify-center py-3.5 text-label font-bold text-maybe">&check;</span>
      <span data-content class="flex flex-col justify-center py-3.5 pr-4">
        <span class="text-row font-semibold">50 cards</span>
      </span>
    </div>`,
  },
  {
    name: 'reporting row (Listing, label + title + detail)',
    html: `<div class="${GRID} min-h-[60px]" data-row>
      <span data-gutter class="flex items-center justify-center py-3.5 text-caption font-bold uppercase tracking-[0.05em] text-muted-fg">DECK</span>
      <span data-content class="flex flex-col justify-center gap-1 py-3.5 pr-4 text-left">
        <span class="text-row font-semibold leading-snug tracking-[-0.01em]">50 cards, shuffled</span>
        <span class="text-label leading-relaxed text-muted-fg">Everyone sees the same order</span>
      </span>
    </div>`,
  },
];

async function main() {
  if (!CHROME) throw new Error('no Chrome found; set CHROME_PATH');
  const css = stylesheet();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  let warnings = 0;

  for (const root of ROOTS) {
    const pct = Math.round((root / 16) * 100);
    console.log(`\n=== ${pct}% text (${root}px root) on a ${VIEWPORT.width}px phone ===`);

    await page.setContent(
      `<!doctype html><html><head><style>${css}</style>
       <style>html{font-size:${root}px}body{margin:0;width:${VIEWPORT.width}px}</style>
       </head><body class="bg-background text-foreground">${ROWS.map((r) => r.html).join('')}</body></html>`,
      { waitUntil: 'load' },
    );

    const measured = await page.evaluate(() => {
      return [...document.querySelectorAll('[data-row]')].map((row) => {
        const g = row.querySelector('[data-gutter]') as HTMLElement;
        const c = row.querySelector('[data-content]') as HTMLElement;
        const gb = g.getBoundingClientRect();
        const cb = c.getBoundingClientRect();
        return {
          gutter: Math.round(gb.width),
          content: Math.round(cb.width),
          total: Math.round(row.getBoundingClientRect().width),
          // Stacked means the content starts below the gutter, not beside it.
          stacked: cb.top >= gb.bottom - 1,
          rowHeight: Math.round(row.getBoundingClientRect().height),
        };
      });
    });

    measured.forEach((m, i) => {
      const share = ((m.gutter / m.total) * 100).toFixed(1);
      const layout = m.stacked ? 'STACKED' : 'side by side';
      console.log(
        `  ${ROWS[i]!.name}\n` +
          `    ${layout}: gutter ${m.gutter}px (${share}% of ${m.total}px), ` +
          `content ${m.content}px, row ${m.rowHeight}px tall`,
      );
      /*
        The number the open question rested on: a three-letter label taking
        more than a quarter of the line. Not a failure -- this script reports,
        it does not gate -- but it is the thing to look at.
      */
      if (!m.stacked && m.gutter / m.total > 0.25) {
        console.log(
          `    WARNING: the gutter is over a quarter of the line for a short label`,
        );
        warnings += 1;
      }
      if (m.content < 160) {
        console.log(`    WARNING: content column under 160px -- titles will wrap hard`);
        warnings += 1;
      }
    });
  }

  await browser.close();
  console.log(`\n${warnings} warning(s). This measures the compiled CSS, not the running app.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
