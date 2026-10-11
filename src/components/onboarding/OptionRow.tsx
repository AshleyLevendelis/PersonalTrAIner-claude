import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

/**
 * One answer, as a full-width row: label, its description, and a selection
 * indicator on the right. Replaces the emoji-led 2-up tile grid.
 *
 * THE COMMENT THIS FILE USED TO CARRY STILL HOLDS, so it is kept: `compact`
 * (size) and `showDescription` (content) were once a single boolean, and that
 * coupling made the "four options overflow a phone" fix look free — shrinking
 * the four-option questions would have silently deleted "New to this, or
 * coming back after a long break" from the goal, experience and activity
 * questions, which are the lines that let someone place themselves honestly
 * rather than flatteringly.
 *
 * `variant` replaces `compact` WITHOUT re-coupling them: it chooses a shape
 * (row / pill / strip cell), and a row renders its description whenever the
 * option has one, with no count threshold at all. Rows have the vertical room
 * the tiles did not, which is the whole reason the old threshold existed.
 */

export type OptionRowVariant = 'row' | 'pill' | 'cell'

interface OptionRowProps {
  label: string
  description?: string
  selected: boolean
  onClick: () => void
  /** 'radio' for a single-select group, 'pressed' for a multi-select toggle. */
  selectionRole: 'radio' | 'pressed'
  /** Full day name for a strip cell showing only its initial — the accessible name must stay complete. */
  accessibleLabel?: string
  className?: string
}

/**
 * The 24px indicator (design handoff 2e). Round for a single-select, square-ish
 * for a multi-select — the shape says which kind of question this is before
 * anything is picked. Selected, it is the brief's accent check circle.
 */
function Indicator({ selected, multi }: { selected: boolean; multi: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center box-border transition-colors duration-150',
        multi ? 'rounded-[7px]' : 'rounded-full',
        selected ? 'bg-primary' : 'border-[1.5px] border-[color:var(--text-dim)] bg-transparent',
      )}
      style={selected
        ? { boxShadow: '0 0 calc(12px * var(--glow-strength)) rgba(var(--glow-rgb), calc(.8 * var(--glow-strength)))' }
        : undefined}
    >
      {selected && <Check className="size-[14px] text-primary-foreground" strokeWidth={3.2} />}
    </span>
  )
}

/**
 * ONE ANSWER, ONE CARD (design handoff 2e, 10 Oct 2026): 60px tall, radius 16,
 * on the raised surface, 8px apart. Selected, the card takes the accent wash
 * and a 1.5px accent edge with a soft glow, and its label lights up.
 */
export function OptionRow({
  label, description, selected, onClick, selectionRole, accessibleLabel, className,
}: OptionRowProps) {
  const multi = selectionRole === 'pressed'
  const a11y = multi ? { 'aria-pressed': selected } : { role: 'radio' as const, 'aria-checked': selected }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      {...a11y}
      className={cn(
        'flex w-full min-h-[60px] items-center gap-3 rounded-2xl px-4 py-3 text-left transition-[background-color,box-shadow] duration-150',
        className,
      )}
      style={selected
        ? { background: 'rgba(var(--glow-rgb), .10)', boxShadow: 'inset 0 0 0 1.5px var(--primary), 0 0 calc(18px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .22)' }
        : { background: 'var(--surface-raised)' }}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[0.9375rem] font-semibold', selected ? 'text-primary-text glow-mint' : 'text-foreground')}>{label}</span>
        {description && (
          <span className="mt-0.5 block text-[0.78125rem] leading-[1.4] text-[color:var(--text-tertiary)]">
            {description}
          </span>
        )}
      </span>
      <Indicator selected={selected} multi={multi} />
    </button>
  )
}

/** A wrapping pill, for label-only sets too long to stack (dietary, cuisines, injuries). */
export function OptionPill({
  label, selected, onClick, selectionRole,
}: {
  label: string
  selected: boolean
  onClick: () => void
  selectionRole: 'radio' | 'pressed'
}) {
  const multi = selectionRole === 'pressed'
  const a11y = multi ? { 'aria-pressed': selected } : { role: 'radio' as const, 'aria-checked': selected }
  return (
    <button
      type="button"
      onClick={onClick}
      {...a11y}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2.5 text-[0.84375rem] transition-colors duration-150',
        selected
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'bg-[color:var(--surface-raised)] font-medium text-foreground hover:bg-[color:var(--accent)]',
      )}
      style={selected
        ? { boxShadow: '0 0 calc(18px * var(--glow-strength)) rgba(var(--glow-rgb), calc(.45 * var(--glow-strength)))' }
        : undefined}
    >
      {selected && <Check className="size-[13px]" strokeWidth={3} aria-hidden />}
      {label}
    </button>
  )
}

/** One cell of the 7-across day strip. Shows an initial; announces the whole day. */
export function OptionCell({
  initial, accessibleLabel, selected, onClick,
}: {
  initial: string
  accessibleLabel: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      aria-pressed={selected}
      className={cn(
        // py-[9px] on a 12px line gives ~30px; the strip's own min-height is
        // what keeps the cell over 44 (see SlotChipsCard) — a 7-across grid at
        // 390px is ~46px wide per cell, so width is never the problem.
        'flex min-h-[44px] items-center justify-center rounded-[9px] py-[9px] text-xs transition-colors duration-150',
        selected
          ? 'bg-primary font-bold text-primary-foreground'
          : 'font-semibold text-muted-foreground hover:bg-[color:var(--accent)]',
      )}
    >
      {initial}
    </button>
  )
}
