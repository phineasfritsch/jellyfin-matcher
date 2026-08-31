import { describe, expect, it } from 'vitest';
import { appSources, readDoc } from '../../../scripts/lib/source-scan';

/**
 * Focus the app moves on the reader's behalf must be marked, not inferred.
 *
 * The app takes focus in two places -- the winner screen's title and the
 * details sheet -- so a screen reader announces the new context instead of
 * going silent (R52, R31). Neither should draw a focus ring: nobody pressed
 * Tab to get there, and a ring tells a sighted person they did something they
 * did not.
 *
 * The first version of that suppression was a CSS selector describing the
 * markup: [role='dialog'][tabindex='-1']. It matched nothing for the sheet,
 * because the role is on the fixed positioning wrapper and the tabindex is on
 * the panel inside it. Nothing went red. A pin on the CSS rule would have
 * stayed green too -- the rule was present and correct-looking, it just
 * addressed no element in the app.
 *
 * So the guard is the join, not either half: every element the app can focus
 * carries data-app-focus, and the stylesheet acts on that attribute (R80).
 */

/** `tabIndex={-1}` is the app saying "I will focus this myself". */
function programmaticFocusCount(code: string): number {
  return (code.match(/tabIndex=\{-1\}/g) ?? []).length;
}

function markCount(code: string): number {
  return (code.match(/data-app-focus/g) ?? []).length;
}

const ui = appSources().filter((f) => f.path.startsWith(`src${'/'}ui`) || f.path.includes('ui'));
const focusing = ui.filter((f) => programmaticFocusCount(f.code) > 0);

describe('focus the app takes on the reader’s behalf', () => {
  it('finds the components that focus themselves', () => {
    // If this drops to zero, every per-file case below is vacuously green.
    expect(focusing.map((f) => f.path).sort()).toEqual([
      'src/ui/components/MovieDetails.tsx',
      'src/ui/components/WinnerScreen.tsx',
    ]);
  });

  for (const file of focusing) {
    const targets = programmaticFocusCount(file.code);
    it(`${file.path} marks all ${targets} of them`, () => {
      expect(
        markCount(file.code),
        `${file.path} focuses ${targets} element(s) programmatically but marks ${markCount(file.code)}. ` +
          'An unmarked one draws a cyan focus ring at a moment the reader did not navigate.',
      ).toBe(targets);
    });
  }
});

describe('the stylesheet acts on the mark', () => {
  const css = readDoc('app/globals.css');

  it('suppresses the ring by attribute, not by markup shape', () => {
    expect(css).toContain('[data-app-focus]:focus-visible');
    expect(css).toContain('[data-app-focus]:focus,');
  });

  it('still draws a ring for someone who actually navigated', () => {
    expect(css).toMatch(/:focus-visible \{\s*\n\s*outline: 3px solid var\(--color-maybe\)/);
  });

  it('names no element by shape, which is how the last one failed silently', () => {
    expect(css).not.toContain("[role='dialog'][tabindex='-1']:focus");
  });
});
