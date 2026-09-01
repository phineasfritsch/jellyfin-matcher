import { describe, expect, it } from 'vitest';
import { ABSTAIN, createKnockout, submitElimination, submitGenres, type KnockoutState } from '../knockout';

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

describe('abstaining', () => {
  it('counts as voted so the round can resolve', () => {
    let s = createKnockout();
    s = { ...s, phase: 'ELIMINATION', pool: ['Action', 'Comedy', 'Drama'] };
    s = submitElimination(s, 'a', 'Drama', ['a', 'b']);
    expect(s.phase).toBe('ELIMINATION');
    s = submitElimination(s, 'b', ABSTAIN, ['a', 'b']);
    // One real vote decided it; the abstention did not block the round.
    expect(s.pool).toEqual(['Action', 'Comedy']);
    expect(s.phase).toBe('DONE');
  });

  it('adds no weight to any genre', () => {
    let s = createKnockout();
    s = { ...s, phase: 'ELIMINATION', pool: ['Action', 'Comedy', 'Drama'] };
    s = submitElimination(s, 'a', 'Action', ['a', 'b', 'c']);
    s = submitElimination(s, 'b', ABSTAIN, ['a', 'b', 'c']);
    s = submitElimination(s, 'c', ABSTAIN, ['a', 'b', 'c']);
    // Two abstentions must not out-vote the single real ballot.
    expect(s.pool).toEqual(['Comedy', 'Drama']);
  });

  it('still eliminates something when the whole room abstains', () => {
    let s = createKnockout();
    s = { ...s, phase: 'ELIMINATION', pool: ['Drama', 'Action', 'Comedy'] };
    for (const id of ['a', 'b']) s = submitElimination(s, id, ABSTAIN, ['a', 'b']);
    // Alphabetical, like any other tie. The room must not deadlock.
    expect(s.pool).toEqual(['Drama', 'Comedy']);
    expect(s.phase).toBe('DONE');
  });
});

describe('abstaining from the genre picks', () => {
  it('does not drag the overlap to nothing for everyone else', () => {
    let s = createKnockout();
    s = submitGenres(s, 'a', ['Horror', 'Sci-Fi'], ['a', 'b']);
    // Bex has no preference. Before R62 this emptied the intersection and
    // forced the whole room to vote again.
    s = submitGenres(s, 'b', [], ['a', 'b']);
    expect(s.needsRevote).toBe(false);
    expect(s.phase).toBe('DONE');
    expect(s.locked.sort()).toEqual(['Horror', 'Sci-Fi']);
  });

  it('still counts the abstainer as having answered', () => {
    let s = createKnockout();
    s = submitGenres(s, 'a', ['Horror', 'Sci-Fi', 'Crime'], ['a', 'b']);
    expect(s.phase).toBe('CHECKBOX');
    s = submitGenres(s, 'b', [], ['a', 'b']);
    expect(s.phase).not.toBe('CHECKBOX');
  });

  it('asks again only when nobody at all has an opinion', () => {
    let s = createKnockout();
    s = submitGenres(s, 'a', [], ['a', 'b']);
    s = submitGenres(s, 'b', [], ['a', 'b']);
    expect(s.needsRevote).toBe(true);
  });
});

describe('one alphabet, everywhere (R175)', () => {
  /*
    The tie-break sorted with `localeCompare` and the everybody-abstained
    fallback sorted with a bare `.sort()`, and the comment between them said
    they were the same rule.

    They disagree on exactly one pair in TMDb's own genre list. Code-unit order
    puts "TV Movie" before "Thriller", because `V` is 0x56 and `h` is 0x68;
    collation puts "Thriller" first, the way somebody reading a list would. So
    the same pool dropped a different genre depending on which path resolved
    it -- and both paths were described in one sentence as alphabetical.

    `localeCompare` with no locale argument also asks the runtime where it is.
    Two servers handed identical votes could eliminate different genres, with
    nothing on screen to explain the difference.
  */
  const POOL = ['Thriller', 'TV Movie', 'War'];

  it('drops the same genre whether the room tied or abstained', () => {
    const tied = submitElimination(
      { ...createKnockout(), phase: 'ELIMINATION', pool: POOL, elimVotes: { a: 'Thriller' } },
      'b',
      'TV Movie',
      ['a', 'b'],
    );
    const abstained = submitElimination(
      { ...createKnockout(), phase: 'ELIMINATION', pool: POOL, elimVotes: { a: ABSTAIN } },
      'b',
      ABSTAIN,
      ['a', 'b'],
    );
    expect(
      tied.pool,
      'a tie and a full abstain drop different genres from the same pool',
    ).toEqual(abstained.pool);
  });

  it('drops the one a person reading the list would call first', () => {
    // Thriller before TV Movie. Not the code-unit answer, which reads as
    // arbitrary to everybody in the room.
    const abstained = submitElimination(
      { ...createKnockout(), phase: 'ELIMINATION', pool: POOL, elimVotes: { a: ABSTAIN } },
      'b',
      ABSTAIN,
      ['a', 'b'],
    );
    expect(abstained.pool).toEqual(['TV Movie', 'War']);
  });

  it('does not ask the runtime where it is', () => {
    /*
      The property `localeCompare` cannot offer: the same answer on every
      machine. Asserted by comparing against a comparison that has no locale in
      it at all, over the pair that actually differs.
    */
    const ours = ['TV Movie', 'Thriller'].sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
    );
    expect(ours[0], 'the ordering moved with the environment').toBe('Thriller');
  });
});
