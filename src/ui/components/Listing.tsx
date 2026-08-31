'use client';

/**
 * The listings grid. Late Show's one load-bearing idea: every control in the app
 * is a row on the same 54px grid with a 54px label column, the way a broadcast
 * listings page or a TV guide is set.
 *
 * Two rulings live in here and neither is cosmetic:
 *
 * R39 — every control is a row, minimum 54px. The first draft had genre votes as
 *       26px chips. A chip is a 26px target for a tremor, and it is a target the
 *       listings grid does not contain, so the grid stopped being the interface
 *       and became decoration around one.
 * R40 — nothing in the top 44px of any screen is tappable. That corner is where
 *       phones crack and where a one-handed thumb cannot reach without
 *       regripping. The Bar is a status readout, never a control.
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
 * A status bar. Deliberately not a button: see R40. If you find yourself wanting
 * to make this tappable, add a row instead.
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
  const skin =
    tone === 'go'
      ? 'bg-accent text-on-primary'
      : tone === 'stop'
        ? 'bg-destructive text-on-primary'
        : tone === 'quiet'
          ? 'bg-muted text-muted-fg'
          : 'bg-super text-on-primary';
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] ${skin}`}
    >
      <span>{left}</span>
      {right && <span className="shrink-0">{right}</span>}
    </div>
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
        className={`flex items-center border-r border-border px-2 py-2 font-mono text-xs font-semibold ${TONE[tone]}`}
      >
        {label}
      </span>
      <span className="flex flex-col justify-center gap-0.5 px-3 py-2 text-left">
        <span className="text-[15px] font-semibold leading-tight">{title}</span>
        {detail && <span className="text-[12.5px] leading-snug text-muted-fg">{detail}</span>}
        {pill && (
          <span
            className={`mt-1 self-start border px-1.5 py-px font-mono text-[11px] tracking-[0.08em] ${TONE[pillTone ?? tone]}`}
          >
            {pill}
          </span>
        )}
      </span>
    </>
  );
}

const GRID = 'grid w-full grid-cols-[54px_1fr] items-stretch border-b border-border';

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
    <div className={`${GRID} min-h-[54px]`}>
      <RowBody {...props} tone={props.tone ?? 'plain'} />
    </div>
  );
}

/**
 * A row that does something. Always a real button: a div with an onClick is
 * unreachable by keyboard and unannounced by a screen reader, and it is the
 * single clearest tell that an interface was generated rather than written.
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
      className={`${GRID} min-h-[54px] cursor-pointer text-left transition disabled:cursor-default disabled:opacity-60 ${
        pressed ? 'bg-primary' : 'active:bg-primary'
      }`}
    >
      <RowBody {...body} tone={body.tone ?? 'plain'} />
    </button>
  );
}

/**
 * The cost line. R42: anything that spends the host's disk says so at 15px in
 * sentence case on its own full-width bar, and it states a SIZE.
 *
 * This was 12px uppercase mono in the same class as every decorative caption,
 * separated from them only by colour — which means it did not exist for anyone
 * who cannot separate red from grey, and read as garnish to everyone else.
 * Runtime is not a cost: 108 minutes is 2GB or 55GB and only one of those
 * matters to the person who owns the disk.
 */
export function CostLine({ headline, detail }: { headline: string; detail?: string }) {
  return (
    <p className="bg-destructive px-3 py-2.5 text-[15px] font-semibold leading-snug text-on-primary">
      {headline}
      {detail && <span className="mt-0.5 block text-[12.5px] font-medium opacity-85">{detail}</span>}
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
        ? 'border border-border bg-transparent text-foreground'
        : 'bg-accent text-on-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      className={`min-h-[52px] w-full cursor-pointer px-4 py-3.5 font-mono text-sm font-bold uppercase tracking-[0.08em] transition active:scale-[0.99] disabled:opacity-50 ${skin}`}
    >
      {children}
    </button>
  );
}
