'use client';

/**
 * A screen with nothing on it still owes the room a sentence.
 *
 * R13: every empty state explains itself. No blank panels, no spinner that
 * means "ended". `title` says what happened; `children` says what it means for
 * the person reading it, in their words.
 *
 * The two callers had drifted 4px apart (gap-3 and gap-2) with no reason;
 * unified here at gap-2. That kind of drift is the whole argument for a
 * component layer.
 */
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      {/*
        A terminal state on a bare div was the design director's phrase for it,
        and he was right: this is where a night ends when there is nothing to
        end it with, and it looked like nothing had rendered yet. It gets the
        same material as every other panel, and role="status" so a screen
        reader is told the session reached an end rather than going quiet.
      */}
      <div className="gel w-full max-w-sm rounded-[var(--radius-card)] p-5 text-center" role="status">
        <p className="text-title font-semibold tracking-[-0.01em]">{title}</p>
        <p className="mt-2 text-body leading-relaxed text-muted-fg">{children}</p>
      </div>
    </div>
  );
}
