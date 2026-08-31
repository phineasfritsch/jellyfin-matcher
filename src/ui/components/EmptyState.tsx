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
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-xl font-bold">{title}</p>
      <p className="text-sm text-muted-fg">{children}</p>
    </div>
  );
}
