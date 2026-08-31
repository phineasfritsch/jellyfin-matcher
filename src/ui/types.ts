import type { KnockoutState } from '../lib/knockout';
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
  progress: Record<string, number>;
  votes: Record<string, Record<string, number>>;
  winner: string | null;
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
