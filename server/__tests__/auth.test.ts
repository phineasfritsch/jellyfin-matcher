import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authConfig, authMode, AuthStore } from '../auth';

describe('authMode / authConfig', () => {
  const original = process.env.MATCHER_AUTH;
  beforeEach(() => {
    delete process.env.MATCHER_AUTH;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MATCHER_AUTH;
    else process.env.MATCHER_AUTH = original;
  });

  it('defaults to requests: login only for wide scope and requests', () => {
    expect(authMode()).toBe('requests');
    expect(authConfig()).toEqual({
      createRequires: false,
      joinRequires: false,
      wideRequires: true,
      requestRequires: true,
    });
  });

  it('create mode gates room creation but not joining', () => {
    process.env.MATCHER_AUTH = 'create';
    expect(authConfig()).toMatchObject({ createRequires: true, joinRequires: false });
  });

  it('all mode (and the "on" alias) gates everything', () => {
    process.env.MATCHER_AUTH = 'all';
    expect(authConfig()).toMatchObject({ createRequires: true, joinRequires: true });
    process.env.MATCHER_AUTH = 'on';
    expect(authMode()).toBe('all');
  });

  it('off mode requires nothing', () => {
    process.env.MATCHER_AUTH = 'off';
    expect(authConfig()).toEqual({
      createRequires: false,
      joinRequires: false,
      wideRequires: false,
      requestRequires: false,
    });
  });
});

describe('AuthStore', () => {
  it('issues opaque tokens that validate back to the user', () => {
    const store = new AuthStore();
    const token = store.issue({ name: 'Alice', jellyfinUserId: 'jf-1' });
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(store.validate(token)).toEqual({ name: 'Alice', jellyfinUserId: 'jf-1' });
  });

  it('rejects unknown and empty tokens', () => {
    const store = new AuthStore();
    expect(store.validate('nope')).toBeNull();
    expect(store.validate(undefined)).toBeNull();
  });

  it('expires sessions after the TTL', () => {
    let clock = 0;
    const store = new AuthStore(() => clock);
    const token = store.issue({ name: 'Bob', jellyfinUserId: 'jf-2' });
    clock = 11 * 60 * 60 * 1000;
    expect(store.validate(token)).not.toBeNull();
    clock = 13 * 60 * 60 * 1000;
    expect(store.validate(token)).toBeNull();
  });
});
