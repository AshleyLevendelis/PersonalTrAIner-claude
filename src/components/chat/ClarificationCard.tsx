import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HelpCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.4 — the CLARIFICATION state: something in a
// natural-language log is ambiguous or unresolved (an unclear exercise name,
// a genuinely ambiguous "6x8", a missing weight on a loaded movement).
// Nothing writes yet. This is NOT a plan-mutation confirmation gate (that's
// ProposalCard) — it's the parse asking for the one input it's missing.
// Generic: renders whatever's already resolved as context, then a single
// question with tap-to-choose options — AND, since 8 Sep 2026, a box to type
// the answer into when the question has no fixed set of answers.
//
// Without that box this card asked questions nobody could answer. "What weight
// did you use for Barbell Bench Press?" has no options, so it rendered a
// question and nothing else; the trainee typed into the ordinary composer, the
// answer went back through the model as a brand-new turn with none of the
// half-finished parse attached, and the same question came back. Ashley's
// endless correction loop. An answer now lands where the question was asked.
// ---------------------------------------------------------------------------

export interface ClarificationOption {
  label: string
  value: string
}

export function ClarificationCard({
  contextLines,
  prompt,
  options,
  answerPlaceholder,
  onChoose,
}: {
  /** What's already parsed/resolved, shown as muted context above the question. */
  contextLines?: string[]
  prompt: string
  options: ClarificationOption[]
  /**
   * Present when the answer is a number or a name rather than one of a known
   * few — a weight, a sets×reps. Absent for a pick-one question, which is
   * already fully answerable by its buttons.
   */
  answerPlaceholder?: string
  onChoose: (value: string) => Promise<void>
}) {
  const [busyValue, setBusyValue] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [typed, setTyped] = useState('')

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
    <div className="mt-2 pl-3.5 border-l-2 border-[color:var(--hairline)] text-sm space-y-2">
      {contextLines && contextLines.length > 0 && (
        <div className="space-y-0.5">
          {contextLines.map((line, i) => (
            <p key={i} className="text-xs text-muted-foreground">{line}</p>
          ))}
        </div>
      )}
      {/* THE QUESTION IS NOT REPEATED HERE. The bubble this card hangs under
          is already the same sentence, verbatim — resolveAndMaybeLog returns
          it as both `text` and `clarification.prompt` — so rendering it again
          put the question on screen twice, one line apart. The icon keeps the
          card's identity as a question, and the input below carries the
          prompt as its aria-label so nothing is lost to a screen reader. */}
      <HelpCircle className="size-3.5 shrink-0 text-primary-text" aria-hidden />
      {!resolved && options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map(opt => (
            <Button
              key={opt.value}
              variant="outline"
              className="min-h-[44px] text-xs px-3.5"
              disabled={busyValue != null}
              onClick={() => handleChoose(opt.value)}
            >
              {busyValue === opt.value ? '…' : opt.label}
            </Button>
          ))}
        </div>
      )}
      {!resolved && answerPlaceholder && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={e => { e.preventDefault(); if (typed.trim()) void handleChoose(typed.trim()) }}
        >
          <Input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={answerPlaceholder}
            aria-label={prompt}
            data-testid="clarification-answer"
            className="h-9 flex-1 text-sm"
            disabled={busyValue != null}
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-[44px] shrink-0 px-3.5 text-xs"
            disabled={busyValue != null || !typed.trim()}
          >
            {busyValue != null ? '…' : 'Answer'}
          </Button>
        </form>
      )}
    </div>
  )
}
