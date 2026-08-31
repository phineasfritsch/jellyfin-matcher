import { describe, expect, it } from 'vitest';
import { LOGIN_ATTEMPTS, LOGIN_WINDOW_MS, RateLimiter } from '../limits';

/**
 * /api/login forwards credentials to Jellyfin's own authenticate endpoint, so
 * with nothing in front of it this app is a rate-limit-free amplifier for
 * guessing passwords against the media server.
 */
describe('failed logins per address', () => {
  function limiter(clock = { t: 0 }) {
    return { r: new RateLimiter(3, 1000, () => clock.t), clock };
  }

  it('allows attempts up to the limit', () => {
    const { r } = limiter();
    expect(r.isLimited('1.2.3.4')).toBe(false);
    r.record('1.2.3.4');
    r.record('1.2.3.4');
    expect(r.isLimited('1.2.3.4')).toBe(false);
  });

  it('blocks once the budget is spent', () => {
    const { r } = limiter();
    for (let i = 0; i < 3; i++) r.record('1.2.3.4');
    expect(r.isLimited('1.2.3.4')).toBe(true);
  });

  it('does not punish one address for another s guessing', () => {
    const { r } = limiter();
    for (let i = 0; i < 5; i++) r.record('1.2.3.4');
    expect(r.isLimited('5.6.7.8')).toBe(false);
  });

  it('forgives a fumbled password once the login succeeds', () => {
    const { r } = limiter();
    for (let i = 0; i < 3; i++) r.record('1.2.3.4');
    expect(r.isLimited('1.2.3.4')).toBe(true);
    r.clear('1.2.3.4');
    expect(r.isLimited('1.2.3.4')).toBe(false);
  });

  it('frees the address when the window passes', () => {
    const { r, clock } = limiter();
    for (let i = 0; i < 3; i++) r.record('1.2.3.4');
    expect(r.isLimited('1.2.3.4')).toBe(true);
    clock.t = 1001;
    expect(r.isLimited('1.2.3.4')).toBe(false);
  });

  it('says honestly how long the wait is', () => {
    const { r, clock } = limiter();
    r.record('1.2.3.4');
    clock.t = 400;
    expect(r.retryAfterSec('1.2.3.4')).toBe(1);
  });

  it('does not grow without bound itself', () => {
    const { r, clock } = limiter();
    for (let i = 0; i < 50; i++) r.record(`10.0.0.${i}`);
    expect(r.size()).toBe(50);
    clock.t = 5000;
    r.sweep();
    expect(r.size()).toBe(0);
  });

  it('ships a budget that is generous to a person and mean to a script', () => {
    expect(LOGIN_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(LOGIN_ATTEMPTS).toBeLessThanOrEqual(15);
    expect(LOGIN_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
  });
});
