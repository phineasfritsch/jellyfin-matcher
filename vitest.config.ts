import { defineConfig } from 'vitest/config';

/**
 * R115: the client is half the product and the gate could not execute any of it.
 *
 * Every client defect this project has found -- a focus ring on a heading nobody
 * navigated to, a sheet that blurred nothing, a focus trap closed over null, a
 * failure panel that hid the room it was explaining, a phone stranded on a room
 * it could not hear, a confirm that deleted the control that opened it -- was
 * caught by a browser harness, by a board member reading source, or by looking
 * at a screenshot. None of them could have been caught by `npm run gate`,
 * because nothing in the suite rendered a component or ran a hook.
 *
 * The browser harnesses are better evidence and they stay. They also need a
 * live Jellyfin and a running server, so CI never runs them: between a push and
 * a person noticing, the client had no automated check at all.
 *
 * Node by default, because most of this suite is server and library code that
 * has no use for a DOM and should not pay for one. Files opt in with a
 * docblock pragma.
 */
export default defineConfig({
  // tsconfig keeps jsx: 'preserve' because Next compiles the app itself. Vitest
  // compiles these files on its own, so it needs to be told which runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    /*
      R127: git worktrees live inside the repo, and vitest's default exclude
      does not know that.

      An agent workflow that isolates its agents gets one worktree per agent
      under `.claude/worktrees/`. Those are full checkouts, so every test file
      appears N+1 times: a run of a single file reported 9 files and 82 cases
      while eight agents were working. `.claude/` is gitignored, so nothing
      reaches a commit -- but gate G4 reads these counts and enforces them as
      floors, and sync-counts writes them into four tracked documents. Run
      either while a workflow is live and the number that lands in the README
      is a multiple of the truth.

      Worse, the copies are not idle: an agent mid-mutation has a deliberately
      broken checkout, so its copy of a test fails and the failure is reported
      against a path that looks like the real one.
    */
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.claude/**'],
    /*
      A real origin rather than about:blank, so anything that reasons about the
      page's URL sees something plausible.

      It does NOT bring localStorage with it: this jsdom exposes none at all,
      with or without an origin, so a file that needs it provides its own. Said
      here because the obvious guess -- opaque origin, therefore no storage --
      is wrong, and the next person will make it.
    */
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    /*
      R140: each file declares its own environment with a
      `// @vitest-environment jsdom` pragma.

      This was `environmentMatchGlobs`, which vitest deprecated and then removed
      -- the first dependency update this project's new weekly check produced
      failed CI on exactly that, taking every jsdom suite with it. Six of the
      nine files already carried the pragma, so the glob was quietly doing work
      for three of them and duplicating the pragma for the rest.

      The pragma is better than the replacement (`projects`) here for a reason
      that has nothing to do with the removal: the environment a test runs in is
      a fact about that test, and it now reads at the top of the file rather
      than in a glob somebody has to go and find.
    */
  },
});
