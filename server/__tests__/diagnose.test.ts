import { describe, expect, it } from 'vitest';
import { diagnoseDeckFailure, diagnoseThinDeck } from '../diagnose';

/**
 * The point of this module is that three causes stop looking identical. Each
 * test is one of the three, and asserts that it names a different upstream and
 * a different person who can act.
 */
describe('diagnoseDeckFailure', () => {
  it('names MDBList and says nobody has to fix a rate limit', () => {
    const d = diagnoseDeckFailure(new Error('MDBList request failed after 3 retries: 429'), 30);
    expect(d.upstream).toBe('MDBList');
    expect(d.headline).toMatch(/rate-limited/i);
    expect(d.fix).toMatch(/nothing to fix/i);
    // 30 cards arrived; the room can still play, just unranked.
    expect(d.recoverable).toBe(true);
  });

  it('names Jellyfin and says only the host can act on a rejected key', () => {
    const d = diagnoseDeckFailure(new Error('Jellyfin request failed: 401 Unauthorized'), 0);
    expect(d.upstream).toBe('Jellyfin');
    expect(d.fix).toMatch(/only the host/i);
    expect(d.recoverable).toBe(false);
  });

  it('does not blame an upstream when the failure is ours', () => {
    const d = diagnoseDeckFailure(new Error('Cannot read properties of undefined'), 0);
    expect(d.upstream).toBe('Matcher');
    expect(d.technical).toContain('Cannot read properties');
  });

  it('never puts a credential in what the room is shown', () => {
    const d = diagnoseDeckFailure(new Error('Jellyfin request failed: 401 Unauthorized'), 0);
    const shown = `${d.headline} ${d.upstream} ${d.technical} ${d.fix}`;
    expect(shown).not.toMatch(/[a-f0-9]{32}/i);
  });
});

describe('diagnoseThinDeck', () => {
  it('stays quiet when the deck is a reasonable size', () => {
    expect(diagnoseThinDeck(50, 50, ['Horror', 'Sci-Fi'], null, 'local')).toBeNull();
    expect(diagnoseThinDeck(14, 50, ['Horror', 'Sci-Fi'], null, 'local')).toBeNull();
  });

  it('explains a thin deck as a library fact, not a fault', () => {
    const d = diagnoseThinDeck(6, 50, ['Horror', 'Sci-Fi'], 120, 'local');
    expect(d).not.toBeNull();
    expect(d!.headline).toContain('6 cards');
    expect(d!.fix).toMatch(/nothing is broken/i);
    expect(d!.technical).toContain('120 minutes');
    expect(d!.recoverable).toBe(true);
  });

  it('does not suggest Any movie to a room already on it', () => {
    const d = diagnoseThinDeck(3, 50, ['Horror', 'Sci-Fi'], null, 'wide');
    expect(d!.fix).not.toMatch(/turn on Any movie/i);
  });
});
