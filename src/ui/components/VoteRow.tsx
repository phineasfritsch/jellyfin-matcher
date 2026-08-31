'use client';

import { CircleHelp, Heart, Star, X } from 'lucide-react';
import { VOTE_POINTS } from '../../lib/match';

/**
 * The four vote controls. Shared so a fix reaches every caller at once.
 *
 * R05: four weights, always this order, always these colours.
 * R06: every vote is a named button. Swiping is an accelerator, never the
 *      only path -- the README promises this and pins A01/A02 defend it.
 * R07: this row is part of the above-the-fold budget on a 360x640 phone.
 */
export function VoteRow({ onVote }: { onVote: (points: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 pb-1" role="group" aria-label="Vote">
      <VoteButton
        label="Dislike"
        className="border-destructive text-destructive"
        onClick={() => onVote(VOTE_POINTS.DISLIKE)}
      >
        <X aria-hidden className="size-7" />
      </VoteButton>
      <VoteButton
        label="Maybe"
        className="border-maybe text-maybe"
        onClick={() => onVote(VOTE_POINTS.MAYBE)}
      >
        <CircleHelp aria-hidden className="size-6" />
      </VoteButton>
      <VoteButton
        label="Like"
        className="border-accent text-accent"
        onClick={() => onVote(VOTE_POINTS.LIKE)}
      >
        <Heart aria-hidden className="size-7" />
      </VoteButton>
      <VoteButton
        label="Super Like"
        className="border-super text-super"
        onClick={() => onVote(VOTE_POINTS.SUPER)}
      >
        <Star aria-hidden className="size-6" />
      </VoteButton>
    </div>
  );
}

/** Icon-only by design, so the label is the only name it has. */
function VoteButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex size-14 cursor-pointer items-center justify-center rounded-full border-2 bg-muted transition active:scale-90 ${className}`}
    >
      {children}
    </button>
  );
}

/** The vote row's silhouette while a deck is still building. */
export function VoteRowSkeleton() {
  return (
    <div className="flex items-center justify-center gap-3 pb-1" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="size-14 animate-pulse rounded-full bg-muted" />
      ))}
    </div>
  );
}
