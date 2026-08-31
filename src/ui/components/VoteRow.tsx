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
  { key: 'no', glyph: '✕', word: 'No', points: VOTE_POINTS.DISLIKE, skin: 'text-destructive ring-destructive/40 bg-destructive/[0.12]', say: 'Vote no on' },
  { key: 'maybe', glyph: '?', word: 'Maybe', points: VOTE_POINTS.MAYBE, skin: 'text-foreground ring-white/20 bg-white/[0.07]', say: 'Vote maybe on' },
  { key: 'yes', glyph: '♥', word: 'Yes', points: VOTE_POINTS.LIKE, skin: 'text-accent ring-accent/40 bg-accent/[0.12]', say: 'Vote yes on' },
  { key: 'super', glyph: '★', word: 'Strong', points: VOTE_POINTS.SUPER, skin: 'text-maybe ring-maybe/40 bg-maybe/[0.12]', say: 'Strong yes on' },
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
        to a 2x2 block instead of clipping the labels off (R51). The labels are
        rem, so they actually grow when that happens -- they were hardcoded
        pixels for three waves while this comment claimed otherwise (R60).

        The track is 4.5rem, not 9ch. `ch` is the width of a zero in the
        current font, so it grew at exactly the same rate as the text and the
        row never fit more than one column at 200% -- it reflowed to a 1x4
        stack that ran off the bottom of a screen that deliberately cannot
        scroll, which put the vote controls out of reach entirely. The comment
        above claimed a 2x2 for four waves and the first capture at 200% text
        showed a 1x4 (R74).
      */
      className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2 px-3 pb-1 pt-2"
      role="group"
      aria-label="Vote"
    >
      {VOTES.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-label={`${v.say} ${title}, ${signed(v.points)}`}
          onClick={() => onVote(v.points)}
          className={`flex min-h-[62px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] px-1 py-2 ring-1 transition active:scale-95 ${v.skin}`}
        >
          <span aria-hidden className="text-title leading-none">
            {v.glyph}
          </span>
          <span className="text-label font-semibold">{v.word}</span>
          <span className="tabular text-caption opacity-70">{signed(v.points)}</span>
        </button>
      ))}
    </div>
  );
}

/** The vote row's silhouette while a deck is still building. */
export function VoteRowSkeleton() {
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2 px-3 pb-1 pt-2" aria-hidden>
      {VOTES.map((v) => (
        <div
          key={v.key}
          className="min-h-[62px] animate-pulse rounded-[var(--radius-control)] bg-white/[0.06] ring-1 ring-white/10"
        />
      ))}
    </div>
  );
}
