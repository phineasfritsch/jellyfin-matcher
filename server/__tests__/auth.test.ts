import { describe, expect, it } from 'vitest';
import { AuthStore } from '../auth';

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
