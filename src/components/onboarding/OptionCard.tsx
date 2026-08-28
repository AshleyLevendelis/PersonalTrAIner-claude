import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface OptionCardProps {
  /** Omitted when every option on the question shares one icon — see SlotChipsCard. */
  icon?: string
  label: string
  description?: string
  selected: boolean
  onClick: () => void
  /**
   * Tighter padding and a smaller emoji. SIZE ONLY — it does not decide
   * whether a description is shown.
   *
   * It used to do both, by accident of every compact caller also having no
   * descriptions to show. That coupling is why the "four options overflow a
   * phone" fix looked free: shrinking the four-option questions would have
   * silently deleted "New to this, or coming back after a long break" from
   * the goal, experience and activity questions — the lines that let someone
   * place themselves honestly instead of flatteringly, which is the whole
   * job of those three questions. The caller decides descriptions now.
   */
  compact?: boolean
  /** Grid placement from the caller — used to span a stranded last card. */
  className?: string
}

export function OptionCard({ icon, label, description, selected, onClick, compact, className }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border-2 p-5 transition-all duration-200 cursor-pointer text-center',
        compact && 'p-3',
        selected
          ? 'border-primary bg-primary/5 shadow-md scale-[1.02]'
          : 'border-border hover:border-primary/40 hover:bg-accent/50 active:scale-[0.97]',
        className
      )}
    >
      {icon && <span className={cn('text-3xl mb-2', compact && 'text-2xl mb-1')}>{icon}</span>}
      {/* A compact card WITH a description keeps the label at text-sm: at
          text-xs the label and its description are the same size and the card
          stops having a headline. Only a label-only compact card shrinks. */}
      <span className={cn('text-sm font-semibold text-foreground', compact && !description && 'text-xs')}>{label}</span>
      {description && (
        <span className={cn('text-xs text-muted-foreground mt-0.5', compact && 'leading-snug')}>{description}</span>
      )}
      {selected && (
        <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}
    </button>
  )
}
