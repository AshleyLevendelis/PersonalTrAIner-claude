import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { HelpCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.4 — the CLARIFICATION state: something in a
// natural-language log is ambiguous or unresolved (an unclear exercise name,
// a genuinely ambiguous "6x8", a missing weight on a loaded movement).
// Nothing writes yet. This is NOT a plan-mutation confirmation gate (that's
// ProposalCard) — it's the parse asking for the one input it's missing.
// Generic: renders whatever's already resolved as context, then a single
// question with tap-to-choose options.
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
}: {
  /** What's already parsed/resolved, shown as muted context above the question. */
  contextLines?: string[]
  prompt: string
  options: ClarificationOption[]
  onChoose: (value: string) => Promise<void>
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
    <div className="mt-2 rounded-md border border-border bg-card p-3 text-sm space-y-2">
      {contextLines && contextLines.length > 0 && (
        <div className="space-y-0.5">
          {contextLines.map((line, i) => (
            <p key={i} className="text-xs text-muted-foreground">{line}</p>
          ))}
        </div>
      )}
      <p className="flex items-start gap-1.5 text-xs font-medium">
        <HelpCircle className="size-3.5 mt-0.5 shrink-0 text-primary" />
        {prompt}
      </p>
      {!resolved && (
        <div className="flex flex-wrap gap-1.5">
          {options.map(opt => (
            <Button
              key={opt.value}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busyValue != null}
              onClick={() => handleChoose(opt.value)}
            >
              {busyValue === opt.value ? '…' : opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
