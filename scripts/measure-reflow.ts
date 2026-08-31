/**
 * R137: render the deck at the width WCAG 1.4.10 actually names.
 *
 * Every artefact in this repository is 402px wide. `screenshots.ts` shoots at
 * 402x874, `measure-rows.ts` measures at 402, and every capture in
 * docs/screenshots is that one phone. The criterion's width is **320 CSS px**,
 * which is what a 1280px desktop becomes at 400% zoom, and nothing here had
 * ever been produced at it -- so the accessibility audit could only grade
 * Reflow "unverified", with a reasoned suspicion attached.
 *
 * The suspicion was about height rather than width. `RoomClient` is
 * `h-dvh ... overflow-hidden`, and R21/R59 make the deck deliberately incapable
 * of scrolling, on purpose: a deck you can scroll is a deck where the vote row
 * moves under your thumb. At 400% zoom on an ordinary 1280x1024 screen the
 * viewport is 320x**256**, and the card region's `min-h-[150px]` plus a 62px
 * vote row plus a 60px undo row is 272 before anything else is counted.
 *
 * So this measures it, the same way `measure-rows.ts` does: the compiled
 * stylesheet the app actually ships, the real class names, a real Chrome.
 *
 * WHAT IT DOES NOT DO, so nobody reads more into it than it earns: it renders a
 * faithful SKELETON, not the React tree. It cannot see anything a component
 * decides at runtime, and a class that changes in the source without changing
 * here is a class this does not measure. It is evidence about the layout, which
 * is what the criterion is about, and it is not a substitute for `npm run shots`.
 *
 * Usage: npm run measure:reflow
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

/**
 * The viewports that matter.
 *
 * 320x256 is the criterion's own arithmetic: 1280x1024 at 400% zoom. 320x568 is
 * the smallest phone still in use, where the height is not the constraint --
 * included so a failure at 256 can be attributed to height rather than width.
 */
const VIEWPORTS = [
  { name: '320x256  (1280x1024 at 400% zoom -- the criterion)', width: 320, height: 256 },
  { name: '320x568  (smallest phone, height not squeezed)', width: 320, height: 568 },
  { name: '402x874  (the only size this repo has ever used)', width: 402, height: 874 },
];

function stylesheet(): string {
  const dir = path.join(process.cwd(), '.next/static/css');
  if (!fs.existsSync(dir)) {
    console.log('no compiled css -- running next build (once)');
    execSync('npx next build', { stdio: 'inherit' });
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
  if (files.length === 0) throw new Error(`no stylesheet in ${dir}`);
  /*
    Newest, not largest. `next build` leaves earlier hashed stylesheets in place,
    so "largest" picked a stale one and this script spent a whole cycle
    reporting that a rule I had just added and verified in the built CSS was not
    taking effect. Same family as R127: a second copy of a thing, in the place
    the tool looks, indistinguishable from the real one.
  */
  const newest = files
    .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]!;
  console.log(`stylesheet: ${newest.f} (newest of ${files.length})`);
  return fs.readFileSync(path.join(dir, newest.f), 'utf8');
}

/**
 * The deck, in the classes RoomClient and SwipeDeck actually use. Copied from
 * the components on purpose: if they drift, this reports the old layout, and
 * the mismatch is the reason the caveat above is written the way it is.
 */
const DECK = `
<main class="app-shell mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]" data-shell>
  <div class="scrim sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] px-4 py-3" data-bar>
    <span class="text-body font-semibold tracking-[-0.01em] text-super">Action, Comedy</span>
    <span class="tabular shrink-0 text-label font-medium text-muted-fg">1 / 50</span>
  </div>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <p class="tabular px-4 py-1.5 text-label text-muted-fg" data-peers>1 of 2 others finished</p>
    <div class="relative min-h-[150px] flex-1 shrink px-3 pt-3" data-card>
      <div class="absolute inset-0 overflow-hidden rounded-[var(--radius-card)] bg-white/[0.06]"></div>
    </div>
    <div class="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2 px-3 pb-1 pt-2" data-votes>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)] bg-white/[0.08]">No</button>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)] bg-white/[0.08]">Maybe</button>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)] bg-white/[0.08]">Yes</button>
      <button class="vote-btn min-h-[62px] rounded-[var(--radius-control)] bg-white/[0.08]">Strong</button>
    </div>
    <div class="grid w-full grid-cols-[3.625rem_1fr] items-stretch border-b border-border min-h-[60px]" data-undo>
      <span class="flex items-center justify-center py-3.5 text-caption font-bold uppercase text-muted-fg">BACK</span>
      <span class="flex flex-col justify-center py-3.5 pr-4">
        <span class="text-row font-semibold leading-snug">Undo &mdash; The Thing</span>
      </span>
    </div>
  </div>
</main>`;

/**
 * R138: a listing screen, for 2.4.11 Focus Not Obscured.
 *
 * The audit filed this as "almost certainly failing": `Bar` is `sticky top-0`,
 * `Dock` is `sticky bottom-0`, and there is no `scroll-padding` anywhere in the
 * repository. The reasoning is sound and the conclusion turned out to be wrong,
 * which is worth having in the tree rather than settled by an argument.
 *
 * Both bars are SIBLINGS of `.scroll-body`, not children of it, so the
 * scrollport is the gap between them and there is nothing for a sticky element
 * to cover. R137 made the page itself scroll below 520px, which is the case
 * where a sticky bar could start overlaying content — so it is measured there
 * too, and at the ordinary size for contrast.
 */
const LISTING = `
<main class="app-shell mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden" data-shell>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="scrim sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] px-4 py-3" data-bar>
      <span class="text-body font-semibold">Room AB12</span>
    </div>
    <div class="scroll-body flex min-h-0 flex-1 flex-col" data-scroll>
      <div style="height:900px"></div>
      <button data-target class="min-h-[60px] w-full">a row in the middle</button>
      <div style="height:900px"></div>
    </div>
    <div class="scrim-strong sticky bottom-0 z-20 flex flex-col gap-2 border-t border-[var(--color-hairline)] px-3 py-3" data-dock>
      <button class="min-h-[52px] w-full rounded-[var(--radius-control)] bg-accent">Start the night</button>
    </div>
  </div>
</main>`;

async function main() {
  if (!CHROME) throw new Error('no Chrome found; set CHROME_PATH');
  const css = stylesheet();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  let problems = 0;

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>${css}</style>
       <style>html,body{margin:0}</style></head>
       <body class="bg-background text-foreground">${DECK}</body></html>`,
      { waitUntil: 'load' },
    );

    /*
      No named inner functions in here. `tsx` compiles a `const fn = () => {}`
      into something that calls esbuild's `__name` helper, which does not exist
      in the page, and the whole evaluate fails with a ReferenceError that says
      nothing about the real cause.
    */
    const m = await page.evaluate((vh: number) => {
      const votes = document.querySelector('[data-votes]')!.getBoundingClientRect();
      const undo = document.querySelector('[data-undo]')!.getBoundingClientRect();
      const card = document.querySelector('[data-card]')!.getBoundingClientRect();
      return {
        cardHeight: Math.round(card.height),
        votesTop: Math.round(votes.top),
        votesBottom: Math.round(votes.bottom),
        undoBottom: Math.round(undo.bottom),
        voteColumns: new Set(
          [...document.querySelectorAll('[data-votes] button')].map((b) =>
            Math.round(b.getBoundingClientRect().top),
          ),
        ).size,
        /*
          The question is reachability, not position. 1.4.10 permits scrolling
          in ONE direction; what it forbids is loss of content. So a control
          below the fold is only a failure when the surface it is on cannot be
          scrolled to it -- which is the state this app was deliberately in
          (R21), and the reason the failure existed at all.
        */
        reachable: (() => {
          // Either the shell scrolls, or the page does. Both are one-direction
          // vertical scrolling, which the criterion permits; the first version
          // of this only looked at the shell and would have called a page that
          // scrolls perfectly well a failure.
          const shell = document.querySelector('[data-shell]') as HTMLElement;
          const shellScrolls =
            /auto|scroll/.test(getComputedStyle(shell).overflowY) &&
            shell.scrollHeight > shell.clientHeight;
          const doc = document.documentElement;
          const pageScrolls = doc.scrollHeight > doc.clientHeight;
          return {
            canReach: shellScrolls || pageScrolls,
            how: shellScrolls ? 'the shell scrolls' : pageScrolls ? 'the page scrolls' : 'nothing scrolls',
            scrollHeight: doc.scrollHeight,
            clientHeight: doc.clientHeight,
          };
        })(),
        votesOffscreen: votes.bottom > vh + 0.5,
        undoOffscreen: undo.bottom > vh + 0.5,
        pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }, vp.height);

    console.log(`\n=== ${vp.name} ===`);
    console.log(`  card region ${m.cardHeight}px, vote row ends at ${m.votesBottom}px, undo ends at ${m.undoBottom}px`);
    console.log(`  vote buttons on ${m.voteColumns} row(s)`);
    if (m.pageScrollsSideways) {
      console.log('  PROBLEM: the page scrolls sideways -- 1.4.10 forbids that outright');
      problems += 1;
    }
    if (m.votesOffscreen && !m.reachable.canReach) {
      console.log(`  PROBLEM: the vote row ends past a ${vp.height}px viewport and the shell cannot scroll`);
      console.log('           -- the controls the screen exists for are unreachable');
      problems += 1;
    } else if (m.votesOffscreen) {
      console.log(`  below the fold, but reachable: ${m.reachable.how} (${m.reachable.scrollHeight} > ${m.reachable.clientHeight})`);
      console.log('  -- 1.4.10 permits one-direction scrolling; it forbids losing content');
    } else if (m.undoOffscreen && !m.reachable.canReach) {
      console.log(`  NOTE: the undo row is off the bottom (${m.undoBottom} > ${vp.height}).`);
      console.log('        R48 calls undo the one protection against a slip that costs a film.');
      problems += 1;
    } else {
      console.log('  everything the screen needs is inside the viewport');
    }
  }

  // --- 2.4.11 Focus Not Obscured, on the shape that actually scrolls -------
  for (const vp of [VIEWPORTS[0]!, VIEWPORTS[2]!]) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>${css}</style>
       <style>html,body{margin:0}</style></head>
       <body class="bg-background text-foreground">${LISTING}</body></html>`,
      { waitUntil: 'load' },
    );
    const f = await page.evaluate(() => {
      const target = document.querySelector('[data-target]') as HTMLElement;
      target.focus();
      const t = target.getBoundingClientRect();
      const bar = document.querySelector('[data-bar]')!.getBoundingClientRect();
      const dock = document.querySelector('[data-dock]')!.getBoundingClientRect();
      return {
        underBar: Math.round(Math.max(0, bar.bottom - t.top)),
        underDock: Math.round(Math.max(0, t.bottom - dock.top)),
        height: Math.round(t.height),
      };
    });
    console.log(`\n=== focus, listing screen at ${vp.width}x${vp.height} ===`);
    const worst = Math.max(f.underBar, f.underDock);
    if (worst > 0) {
      console.log(`  PROBLEM: a focused ${f.height}px control is ${worst}px under a sticky bar (2.4.11)`);
      problems += 1;
    } else {
      console.log(`  a focused ${f.height}px control is clear of both sticky bars`);
    }
  }

  await browser.close();
  console.log(`\n${problems} problem(s). Measures the compiled CSS and a faithful skeleton, not the React tree.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
