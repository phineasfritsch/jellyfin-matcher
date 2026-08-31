'use client';

import { VOTE_POINTS } from '../../lib/match';

/**
 * The four vote controls.
 *
 * R25: a vote control is legible without knowing what its icon means. Every
 *      button prints its word as well as its glyph, and the glyph is
 *      aria-hidden so a screen reader says "No" rather than spelling
 *      "multiplication x".
 * R06: every vote is a named button. Swiping is an accelerator, never the only
 *      path -- the README promises this.
 * R50: each button names the film it votes on. "Dislike" is not an answer to
 *      "what did I just vote on"; three cards can go by before you notice.
 * The weights are printed because a scale nobody can see is a scale nobody can
 * use: a no costs five times what a maybe earns.
 */

const VOTES = [
  { key: 'no', glyph: '✕', word: 'NO', points: VOTE_POINTS.DISLIKE, skin: 'border-destructive text-destructive', say: 'Vote no on' },
  { key: 'maybe', glyph: '?', word: 'MAYBE', points: VOTE_POINTS.MAYBE, skin: 'border-border text-foreground', say: 'Vote maybe on' },
  { key: 'yes', glyph: '♥', word: 'YES', points: VOTE_POINTS.LIKE, skin: 'border-accent text-accent', say: 'Vote yes on' },
  { key: 'super', glyph: '★', word: 'STRONG', points: VOTE_POINTS.SUPER, skin: 'border-maybe text-maybe', say: 'Strong yes on' },
] as const;

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function VoteRow({
  onVote,
  title,
}: {
  onVote: (points: number) => void;
  /** The film being voted on, so each control can name it. */
  title: string;
}) {
  return (
    <div
      /*
        auto-fit rather than four locked columns: at 200% OS text this reflows
        to a 2x2 block instead of clipping the labels off (R51).
      */
      className="grid grid-cols-[repeat(auto-fit,minmax(9ch,1fr))] gap-2 p-2.5"
      role="group"
      aria-label="Vote"
    >
      {VOTES.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-label={`${v.say} ${title}, ${signed(v.points)}`}
          onClick={() => onVote(v.points)}
          className={`flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 border bg-muted px-1 py-2 font-mono transition active:scale-95 ${v.skin}`}
        >
          <span aria-hidden className="font-display text-lg leading-none">
            {v.glyph}
          </span>
          <span className="text-[13px] font-semibold tracking-[0.06em]">{v.word}</span>
          <span className="tabular text-[11px] opacity-75">{signed(v.points)}</span>
        </button>
      ))}
    </div>
  );
}

/** The vote row's silhouette while a deck is still building. */
export function VoteRowSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9ch,1fr))] gap-2 p-2.5" aria-hidden>
      {VOTES.map((v) => (
        <div key={v.key} className="min-h-[52px] animate-pulse border border-border bg-muted" />
      ))}
    </div>
  );
}
