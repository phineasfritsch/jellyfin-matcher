'use client';

/**
 * Grouped inset lists, in glass.
 *
 * The structure is the one the focus group picked and is unchanged: a label
 * column, one row per control, one meaning per colour. What changed is the
 * material — rows now live inside a translucent card floating on the ambient
 * ground, the way a grouped table view does, rather than as full-bleed rules.
 *
 * The rulings that live in here are not cosmetic and survived the restyle:
 *
 * R39 — every control is a row, minimum 60px. The first draft had genre votes
 *       as 26px chips: a target a tremor cannot reliably hit, and one the grid
 *       did not contain.
 * R40 — nothing in the top 44px of any screen is tappable. That corner is
 *       where phones crack and where a one-handed thumb cannot reach without
 *       regripping. The Bar is a status readout, never a control.
 * R41 — a divider between two controls is information, so it clears 3:1. The
 *       hairline around a pane is decoration and does not have to.
 */

type Tone = 'plain' | 'room' | 'mine' | 'go' | 'stop';

const TONE: Record<Tone, string> = {
  plain: 'text-muted-fg',
  room: 'text-super',
  mine: 'text-maybe',
  go: 'text-accent',
  stop: 'text-destructive',
};

/**
 * A status readout. Deliberately not a button: see R40. If you find yourself
 * wanting to make this tappable, add a row instead.
 */
export function Bar({
  left,
  right,
  tone = 'room',
}: {
  left: string;
  right?: string;
  tone?: 'room' | 'go' | 'stop' | 'quiet';
}) {
  const ink =
    tone === 'go'
      ? 'text-accent'
      : tone === 'stop'
        ? 'text-destructive'
        : tone === 'quiet'
          ? 'text-muted-fg'
          : 'text-super';
  return (
    <div className="gel-thin sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] px-4 py-3">
      <span className={`text-[0.9375rem] font-semibold tracking-[-0.01em] ${ink}`}>{left}</span>
      {right && (
        <span className="tabular shrink-0 text-[0.8125rem] font-medium text-muted-fg">{right}</span>
      )}
    </div>
  );
}

/** A grouped card. Rows inside it share its rounding and its hairline. */
export function Group({
  children,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <section aria-label={ariaLabel} className="px-3 pt-3">
      {title && (
        <h2 className="px-1.5 pb-2 text-[0.8125rem] font-medium uppercase tracking-[0.04em] text-muted-fg">
          {title}
        </h2>
      )}
      <div className="gel overflow-hidden rounded-[var(--radius-card)]">{children}</div>
    </section>
  );
}

/** Shared innards, so a static row and a button row cannot drift apart. */
function RowBody({
  label,
  tone,
  title,
  detail,
  pill,
  pillTone,
}: {
  label: string;
  tone: Tone;
  title: string;
  detail?: string;
  pill?: string;
  pillTone?: Tone;
}) {
  return (
    <>
      <span
        className={`flex items-center justify-center py-3.5 text-[0.6875rem] font-bold uppercase tracking-[0.05em] ${TONE[tone]}`}
      >
        {label}
      </span>
      <span className="flex flex-col justify-center gap-1 py-3.5 pr-4 text-left">
        <span className="text-[1rem] font-semibold leading-snug tracking-[-0.01em]">{title}</span>
        {detail && <span className="text-[0.8438rem] leading-relaxed text-muted-fg">{detail}</span>}
        {pill && (
          <span
            className={`mt-1.5 self-start rounded-full bg-current/12 px-2.5 py-1 text-[0.7188rem] font-semibold ${TONE[pillTone ?? tone]}`}
          >
            {pill}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * The divider is inset from the label column, the way a grouped table view
 * insets its separators, and it is dropped on the last row of a card by the
 * card's own overflow. It stays at full strength: it is the only thing saying
 * where one control ends and the next begins (R41).
 */
const GRID =
  'grid w-full grid-cols-[58px_1fr] items-stretch [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border';

/** A row that only reports. Not focusable, because there is nothing to do to it. */
export function Row(props: {
  label: string;
  tone?: Tone;
  title: string;
  detail?: string;
  pill?: string;
  pillTone?: Tone;
}) {
  return (
    <div className={`${GRID} min-h-[60px]`}>
      <RowBody {...props} tone={props.tone ?? 'plain'} />
    </div>
  );
}

/**
 * A row that does something. Always a real button: a div with an onClick is
 * unreachable by keyboard, unannounced by a screen reader, and the single
 * clearest tell that an interface was generated rather than written.
 */
export function RowButton({
  onClick,
  pressed,
  ariaLabel,
  disabled,
  ...body
}: {
  label: string;
  tone?: Tone;
  title: string;
  detail?: string;
  pill?: string;
  pillTone?: Tone;
  onClick: () => void;
  pressed?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={`${GRID} min-h-[60px] cursor-pointer text-left transition disabled:cursor-default disabled:opacity-60 ${
        pressed ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05] active:bg-white/[0.08]'
      }`}
    >
      <RowBody {...body} tone={body.tone ?? 'plain'} />
    </button>
  );
}

/**
 * The cost line. R42: anything that spends the host's disk says so at 15px in
 * sentence case, on its own surface, and it states a SIZE.
 *
 * This was 12px uppercase mono in the same class as every decorative caption,
 * separated from them only by colour — so it did not exist for anyone who
 * cannot separate red from grey, and read as garnish to everyone else. Runtime
 * is not a cost: 108 minutes is 2GB or 55GB and only one of those matters to
 * the person who owns the disk.
 */
export function CostLine({ headline, detail }: { headline: string; detail?: string }) {
  return (
    <p className="mx-3 mt-3 rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/[0.14] px-4 py-3.5 text-[0.9375rem] font-semibold leading-snug text-destructive">
      {headline}
      {detail && (
        <span className="mt-1.5 block text-[0.8438rem] font-normal leading-relaxed text-foreground/85">
          {detail}
        </span>
      )}
    </p>
  );
}

/** The one big affirmative control at the bottom of a screen. */
export function BigButton({
  children,
  onClick,
  tone = 'go',
  disabled,
  ariaDescribedBy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'go' | 'commit' | 'ghost';
  disabled?: boolean;
  ariaDescribedBy?: string;
}) {
  const skin =
    tone === 'commit'
      ? 'bg-destructive text-on-primary'
      : tone === 'ghost'
        ? 'gel text-foreground'
        : 'bg-accent text-on-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      className={`min-h-[52px] w-full cursor-pointer rounded-[var(--radius-control)] px-4 py-3.5 text-[1rem] font-semibold tracking-[-0.01em] transition active:scale-[0.985] disabled:opacity-50 ${skin}`}
    >
      {children}
    </button>
  );
}

/** The floating action shelf a screen's primary control sits in. */
export function Dock({ children }: { children: React.ReactNode }) {
  return (
    <div className="gel-thick sticky bottom-0 z-20 flex flex-col gap-2 border-t border-[var(--color-hairline)] px-3 py-3">
      {children}
    </div>
  );
}
