import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHIP_CLASS } from '@/components/chat/bubbles'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.4 — the CLARIFICATION state: something in a
// natural-language log is ambiguous or unresolved (an unclear exercise name,
// a genuinely ambiguous "6x8", a missing weight on a loaded movement).
// Nothing writes yet. This is NOT a plan-mutation confirmation gate (that's
// ProposalCard) — it's the parse asking for the one input it's missing.
// Generic: renders whatever's already resolved as context, then a single
// question with tap-to-choose options.
//
// Grouped-bubbles revamp (3 Sep 2026): a bubble in the TrAIner's run, the
// options wearing the same chip the quick-reply rail uses.
// ---------------------------------------------------------------------------

export interface ClarificationOption {
  label: string
  value: string
}

export function ClarificationCard({
  contextLines,
  prompt,
  options,
  onChoose,
  className,
}: {
  /** What's already parsed/resolved, shown as muted context above the question. */
  contextLines?: string[]
  prompt: string
  options: ClarificationOption[]
  onChoose: (value: string) => Promise<void>
  /** The bubble radius for this card's position in its run (see bubbles.tsx). Defaults to a lone bubble. */
  className?: string
}) {
  const [busyValue, setBusyValue] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  const handleChoose = async (value: string) => {
    setBusyValue(value)
    try {
      await onChoose(value)
      setResolved(true)
    } finally {
      setBusyValue(null)
    }
  }

  return (
    <div
      data-chat-clarification
      className={cn('flex w-full flex-col gap-2 bg-card px-3.5 py-3 text-sm shadow-[inset_3px_0_0_var(--primary)]', className ?? 'rounded-[18px]')}
    >
      {contextLines && contextLines.length > 0 && (
        <div className="space-y-0.5">
          {contextLines.map((line, i) => (
            <p key={i} className="text-xs text-muted-foreground">{line}</p>
          ))}
        </div>
      )}
      <p className="flex items-start gap-2 text-xs font-semibold">
        <HelpCircle className="mt-px size-3.5 shrink-0 text-primary" />
        <span>{prompt}</span>
      </p>
      {!resolved && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={cn(CHIP_CLASS, 'min-h-[44px]')}
              disabled={busyValue != null}
              onClick={() => handleChoose(opt.value)}
            >
              {busyValue === opt.value ? '…' : opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
