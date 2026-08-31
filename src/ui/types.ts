import type { KnockoutState } from '../lib/knockout';
import type { FallbackResult } from '../lib/match';
import type { MovieCandidate } from '../lib/types';

/** Client view of the server Room object (broadcast on room:state). */
export interface ClientRoom {
  roomId: string;
  status: 'LOBBY' | 'KNOCKOUT' | 'SWIPING' | 'FINISHED';
  settings: {
    scope: 'local' | 'wide';
    maxRuntime: number | null;
    deckLimit: number;
  };
  lockedGenres: string[];
  users: Record<string, { id: string; name: string; ready: boolean; connected: boolean; authed: boolean }>;
  knockout: KnockoutState;
  deck: MovieCandidate[];
  /** Only your own position. Other people's are deliberately not sent (R61). */
  progress: Record<string, number>;
  /** Only your own votes. */
  votes: Record<string, Record<string, number>>;
  winner: string | null;
  /**
   * How the night ended, carried on the room so a reload does not misreport it
   * (R90). These used to live only in the transient match:declared event.
   */
  winnerViaFallback: boolean;
  winnerRanking: FallbackResult[] | null;
  winnerPlayUrl: string | null;
  /** Cards the room locked in and then turned down. */
  rejected: string[];
  /** How many other members have finished the deck. */
  othersFinished: number;
  /** How many members have submitted genre picks, including you. */
  submittedCount: number;
  /** How many members have cast an elimination vote, including you. */
  votedCount: number;
}

/** A named, actionable account of why the deck is short or missing (R54). */
export interface Diagnosis {
  headline: string;
  upstream: string;
  technical: string;
  fix: string;
  recoverable: boolean;
}

export interface MatchDeclaredPayload {
  winner: MovieCandidate | null;
  viaFallback: boolean;
  playUrl: string | null;
  ranking: Array<{
    cardId: string;
    total: number;
    composite: number;
    votePoints: number;
    isHybrid: boolean;
  }> | null;
}
