import { describe, expect, it } from 'vitest';
import { createKnockout, submitElimination, submitGenres, type KnockoutState } from '../knockout';

const USERS = ['u_1', 'u_2'];
const TRIO = ['u_1', 'u_2', 'u_3'];

function allSubmit(users: string[], picks: Record<string, string[]>): KnockoutState {
  let state = createKnockout();
  for (const u of users) state = submitGenres(state, u, picks[u]!, users);
  return state;
}

describe('submitGenres', () => {
  it('waits until every member has submitted', () => {
    const state = submitGenres(createKnockout(), 'u_1', ['Horror', 'Comedy'], USERS);
    expect(state.phase).toBe('CHECKBOX');
  });

  it('locks immediately when the overlap is exactly 2', () => {
    const state = allSubmit(USERS, {
      u_1: ['Horror', 'Sci-Fi', 'Drama'],
      u_2: ['Horror', 'Sci-Fi', 'Comedy'],
    });
    expect(state.phase).toBe('DONE');
    expect(state.locked.sort()).toEqual(['Horror', 'Sci-Fi']);
  });

  it('moves to elimination when the overlap exceeds 2', () => {
    const state = allSubmit(USERS, {
      u_1: ['Horror', 'Sci-Fi', 'Drama', 'Action'],
      u_2: ['Horror', 'Sci-Fi', 'Drama', 'Comedy'],
    });
    expect(state.phase).toBe('ELIMINATION');
    expect(state.pool.sort()).toEqual(['Drama', 'Horror', 'Sci-Fi']);
  });

  it('pools distinct picks when the overlap is below 2', () => {
    const state = allSubmit(USERS, { u_1: ['Horror'], u_2: ['Comedy'] });
    expect(state.phase).toBe('DONE');
    expect(state.locked.sort()).toEqual(['Comedy', 'Horror']);
  });

  it('runs elimination on a pooled union larger than 2', () => {
    const state = allSubmit(USERS, { u_1: ['Horror', 'Drama'], u_2: ['Comedy'] });
    expect(state.phase).toBe('ELIMINATION');
    expect(state.pool.sort()).toEqual(['Comedy', 'Drama', 'Horror']);
  });

  it('flags a re-vote when members picked almost nothing', () => {
    const state = allSubmit(USERS, { u_1: ['Horror'], u_2: ['Horror'] });
    expect(state.phase).toBe('CHECKBOX');
    expect(state.needsRevote).toBe(true);
    expect(state.submissions).toEqual({});
  });

  it('intersects across all members of a 3-user room', () => {
    const state = allSubmit(TRIO, {
      u_1: ['Horror', 'Sci-Fi', 'Drama'],
      u_2: ['Horror', 'Sci-Fi', 'Comedy'],
      u_3: ['Horror', 'Sci-Fi', 'Action'],
    });
    expect(state.phase).toBe('DONE');
    expect(state.locked.sort()).toEqual(['Horror', 'Sci-Fi']);
  });
});

describe('submitElimination', () => {
  const elimination = (): KnockoutState =>
    allSubmit(USERS, {
      u_1: ['Horror', 'Sci-Fi', 'Drama', 'Action'],
      u_2: ['Horror', 'Sci-Fi', 'Drama', 'Action'],
    });

  it('drops the most-voted genre and locks when 2 remain', () => {
    let state = elimination(); // pool of 4
    state = submitElimination(state, 'u_1', 'Drama', USERS);
    expect(state.phase).toBe('ELIMINATION'); // waiting on u_2
    state = submitElimination(state, 'u_2', 'Drama', USERS);
    expect(state.pool.sort()).toEqual(['Action', 'Horror', 'Sci-Fi']);

    state = submitElimination(state, 'u_1', 'Action', USERS);
    state = submitElimination(state, 'u_2', 'Action', USERS);
    expect(state.phase).toBe('DONE');
    expect(state.locked.sort()).toEqual(['Horror', 'Sci-Fi']);
  });

  it('breaks vote ties alphabetically, one elimination per round', () => {
    let state = elimination();
    state = submitElimination(state, 'u_1', 'Drama', USERS);
    state = submitElimination(state, 'u_2', 'Action', USERS);
    // 1–1 tie → 'Action' goes (alphabetically first)
    expect(state.pool).toContain('Drama');
    expect(state.pool).not.toContain('Action');
    expect(state.pool).toHaveLength(3);
  });

  it('ignores votes for genres outside the pool', () => {
    const state = elimination();
    expect(submitElimination(state, 'u_1', 'Romance', USERS)).toBe(state);
  });

  it('clears round votes between rounds', () => {
    let state = elimination();
    state = submitElimination(state, 'u_1', 'Drama', USERS);
    state = submitElimination(state, 'u_2', 'Drama', USERS);
    expect(state.elimVotes).toEqual({});
  });
});
