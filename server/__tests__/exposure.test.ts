import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSafeForDeclaredExposure,
  describeExposure,
  exposureBanner,
  UnsafePublicConfig,
} from '../exposure';

/**
 * R131 / gate U4: the server says what it exposes, at boot.
 *
 * The README has warned since d44ea44 that a public hostname is not safe on the
 * default auth mode. That warning lives in a document; what gets deployed is a
 * container, and the person deploying it reads `docker logs`, not a README they
 * skimmed a week ago.
 *
 * These do not claim U4 is closed. The default is still `requests` and it still
 * leaves the library readable by anyone with the URL — a safe DEFAULT is a
 * product decision that costs the four-second guest join, and it is queued
 * rather than taken. What is closed is the smaller, real gap: nothing running
 * ever told the operator what their configuration permits.
 */

const ORIGINAL = process.env.MATCHER_AUTH;
const ORIGINAL_PUBLIC = process.env.MATCHER_PUBLIC;

beforeEach(() => {
  delete process.env.MATCHER_AUTH;
  delete process.env.MATCHER_PUBLIC;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MATCHER_AUTH;
  else process.env.MATCHER_AUTH = ORIGINAL;
  if (ORIGINAL_PUBLIC === undefined) delete process.env.MATCHER_PUBLIC;
  else process.env.MATCHER_PUBLIC = ORIGINAL_PUBLIC;
});

describe('what the default mode actually exposes', () => {
  it('names reading the library as something no account is needed for', () => {
    // This is the sentence the README spends a paragraph on. If it ever stops
    // being true, that is a real change and this test should be the one that
    // notices, not a person re-reading the auth table.
    const e = describeExposure({});
    expect(e.mode).toBe('requests');
    expect(e.ungated.join(' ')).toMatch(/read every film title/i);
    expect(e.safeForPublicHostname).toBe(false);
  });

  it('does not pretend the default is safe to expose', () => {
    const lines = exposureBanner(describeExposure({})).join('\n');
    expect(lines).toMatch(/NOT SAFE on a public hostname/);
    // And says what to do about it, because a warning with no exit is noise.
    expect(lines).toMatch(/Cloudflare Access|VPN|MATCHER_AUTH=all/);
  });

  it('puts spending the host disk in capitals when nothing gates it', () => {
    // `off` is a legitimate choice on a private network, and it is also the one
    // mode where an anonymous visitor can cause a download. A log line is
    // skimmed, so the worst item has to survive skimming.
    process.env.MATCHER_AUTH = 'off';
    const e = describeExposure({});
    expect(e.ungated.join(' ')).toContain('SPEND YOUR DISK');
  });
});

describe('when every action needs an account', () => {
  it('reports nothing ungated and calls itself safe to expose', () => {
    process.env.MATCHER_AUTH = 'all';
    const e = describeExposure({});
    expect(e.ungated).toEqual([]);
    expect(e.safeForPublicHostname).toBe(true);
    expect(exposureBanner(e).join('\n')).toMatch(/every action requires a Jellyfin account/i);
  });
});

describe('refusing a declared-public misconfiguration', () => {
  it('stops the process when the operator says public and the library is open', () => {
    /*
      MATCHER_PUBLIC=1 is the operator telling us where they are. Once they
      have, a mode that leaves the library readable is a misconfiguration
      rather than a choice, and serving anyway would be the app knowing better
      and saying nothing.

      Opt-in on purpose: it breaks nobody who has not told us.
    */
    process.env.MATCHER_AUTH = 'requests';
    const e = describeExposure({ MATCHER_PUBLIC: '1' });
    expect(() => assertSafeForDeclaredExposure(e)).toThrow(UnsafePublicConfig);
    expect(() => assertSafeForDeclaredExposure(e)).toThrow(/MATCHER_AUTH=all/);
  });

  it('allows it when joining requires an account', () => {
    process.env.MATCHER_AUTH = 'all';
    const e = describeExposure({ MATCHER_PUBLIC: '1' });
    expect(() => assertSafeForDeclaredExposure(e)).not.toThrow();
  });

  it('stays out of the way when nobody has declared anything', () => {
    // The home-network case, which is almost everybody. A warning, never a
    // refusal.
    const e = describeExposure({});
    expect(e.declaredPublic).toBe(false);
    expect(() => assertSafeForDeclaredExposure(e)).not.toThrow();
  });
});
