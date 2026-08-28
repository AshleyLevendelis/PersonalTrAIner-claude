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
  /** Rows 2..n carry a hairline divider; the first must not. */
  divided?: boolean
  /** Full day name for a strip cell showing only its initial — the accessible name must stay complete. */
  accessibleLabel?: string
  className?: string
}

/** The 18px indicator. Square-ish for a multi-select, round for a single — the shape says which kind of question this is before anything is picked. */
function Indicator({ selected, multi }: { selected: boolean; multi: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[18px] shrink-0 place-items-center border-[1.5px] box-border transition-colors duration-150',
        multi ? 'rounded-[6px]' : 'rounded-full',
        selected
          ? 'border-primary bg-primary'
          : 'border-[color:var(--border)] bg-transparent',
      )}
      style={selected
        // Halo scales with --glow-strength like every other glow in the app, so
        // Settings → glow "Off" reduces it to 0 with no conditional rule here.
        ? { boxShadow: '0 0 calc(12px * var(--glow-strength)) rgba(var(--glow-rgb), calc(.8 * var(--glow-strength)))' }
        : undefined}
    >
      {selected && <Check className="size-[11px] text-primary-foreground" strokeWidth={3.4} />}
    </span>
  )
}

export function OptionRow({
  label, description, selected, onClick, selectionRole, divided, accessibleLabel, className,
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
        // min-h-[44px] is the tap target and is not negotiable. The two-line
        // rows land near 62px; a label-only row would sit at 40 without this.
        'flex w-full min-h-[44px] items-center gap-3 px-3.5 py-[13px] text-left transition-colors duration-150',
        // No scale on select or press. The old scale-[1.02] / active:scale-[0.97]
        // made a chat transcript twitch every time an answer landed.
        divided && 'border-t border-[color:var(--hairline)]',
        selected
          ? 'bg-[color:rgba(var(--glow-rgb),.10)] shadow-[inset_2px_0_0_var(--primary)]'
          : 'hover:bg-[color:var(--surface-raised)]',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {description && (
          <span className={cn(
            'mt-0.5 block text-[11.5px] leading-[1.4]',
            // The selected row's description brightens rather than staying
            // muted — on a tinted background muted-foreground loses contrast.
            selected ? 'text-[color:var(--text-tertiary)]' : 'text-muted-foreground',
          )}>
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
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2.5 text-[13.5px] transition-colors duration-150',
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
