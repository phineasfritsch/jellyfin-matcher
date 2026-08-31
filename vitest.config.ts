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
    environmentMatchGlobs: [['src/ui/__tests__/*.render.test.tsx', 'jsdom']],
  },
});
