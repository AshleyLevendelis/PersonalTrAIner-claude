import { useState } from 'react'
import { ShieldAlert, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatPendingActionView } from '@/lib/types'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.4 — "rendering the effect, not prose." ONE
// generic component renders `diff.rows` + `implications` for ANY domain
// (exercise swap, meal swap) — no per-domain card. This is the structural
// half of D1: the card is what actually renders on a plan_mutation turn;
// the model's own text for that turn is discarded entirely by
// ChatAssistant.tsx's processResponse, never reaching this component.
//
// Grouped-bubbles revamp (3 Sep 2026): a plan change is a BUBBLE too — the
// last bubble of the TrAIner's run, full width of the run column, the same
// --card shell as its text with a mint inset edge standing in for the old
// left rule. The caller passes the radius for its position in the run.
// ---------------------------------------------------------------------------

/** What the title row calls each kind of change — the user's words, not the tool's. */
const KIND_LABELS: Record<string, string> = {
  propose_exercise_swap: 'Swap exercise',
  propose_meal_swap: 'Swap meal',
  propose_meal_addition: 'Add a meal',
  propose_custom_meal: 'Your meal',
  propose_meal_pool_refresh: 'New meal options',
  propose_injury_adaptation: 'Work around it',
  propose_injury_as_lasting: 'Lasting injury',
  propose_injury_recovered: 'Recovered',
  propose_equipment_adaptation: 'Equipment change',
  propose_volume_change: 'Change the dose',
  propose_schedule_change: 'Change the week',
  propose_rest_day: 'Rest day',
}

const SCOPE_PILL: Record<string, string> = { today: 'Today only', block: 'Rest of block' }
const SCOPE_TITLE: Record<string, string> = { today: 'today', block: 'rest of block' }

export function ProposalCard({
  pendingAction,
  onConfirm,
  onReject,
  className,
}: {
  pendingAction: ChatPendingActionView
  onConfirm: (editedScope?: string) => Promise<void>
  onReject: () => Promise<void>
  /** The bubble radius for this card's position in its run (see bubbles.tsx). Defaults to a lone bubble. */
  className?: string
}) {
  const { diff, status } = pendingAction
  const [scope, setScope] = useState<string | undefined>(diff.editable?.find(e => e.field === 'scope')?.options[0])
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null)

  const busyOverall = busy != null || status === 'claimed' || status === 'executing'
  const isStale = status === 'stale'
  const isTerminal = status === 'done' || status === 'partial' || status === 'failed' || status === 'declined' || status === 'expired'

  /**
   * A card that can no longer be acted on has to SAY so. Terminal statuses
   * used to render the rows and then nothing — the buttons simply vanished,
   * with no line explaining why, which reads as the app losing the thread.
   * The case that made this matter: proposals expire after ten minutes, and
   * until this was fixed tapping Confirm on an expired one did nothing at
   * all, silently. Now the tap sets the status and this is what it says.
   *
   * Worded from the user's side — what it means for them, and what to do
   * next — rather than naming the state.
   */
  const terminalNote: string | null =
    status === 'expired' ? "This one's timed out — ask me again and I'll suggest it fresh."
    : status === 'declined' ? 'Left as it was.'
    : status === 'failed' ? "This didn't go through — ask me again if you still want it."
    : status === 'done' || status === 'partial' ? 'Already applied.'
    : null

  const handleConfirm = async () => {
    setBusy('confirm')
    try {
      await onConfirm(scope)
    } finally {
      setBusy(null)
    }
  }

  const handleReject = async () => {
    setBusy('reject')
    try {
      await onReject()
    } finally {
      setBusy(null)
    }
  }

  const scopeField = diff.editable?.find(e => e.field === 'scope')
  const kindLabel = KIND_LABELS[pendingAction.kind] ?? 'Proposed change'
  const title = scopeField && scope ? `${kindLabel} · ${SCOPE_TITLE[scope] ?? scope}` : kindLabel

  return (
    <div
      data-chat-proposal
      className={cn('flex w-full flex-col gap-2.5 bg-card px-3.5 py-3 text-sm shadow-[inset_3px_0_0_var(--primary)]', className ?? 'rounded-[18px]')}
    >
      <p className="flex items-center gap-2 text-xs font-semibold">
        <ShieldAlert className="size-3.5 shrink-0 text-primary" />
        <span>{title}</span>
      </p>

      <div className="flex flex-col gap-1.5 text-xs">
        {diff.rows.map((row, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">{row.field}</span>
            <span className="flex min-w-0 flex-col items-end text-right">
              {row.before && <span className="line-through text-[color:var(--text-tertiary)]">{row.before}</span>}
              <span className={cn('font-medium', /^\d/.test(row.after) && 'tabular-mono')}>{row.after}</span>
              {row.note && <span className="text-[0.625rem] text-muted-foreground/80">{row.note}</span>}
            </span>
          </div>
        ))}
      </div>

      {diff.unchanged && diff.unchanged.length > 0 && (
        <p className="text-[0.625rem] text-muted-foreground/70">Unchanged: {diff.unchanged.join(', ')}</p>
      )}

      {/* Scope pills: how far the change reaches. Selected = mint edge and
          tint; the Confirm below applies whichever is selected. Hidden once
          the card can no longer be acted on — a choice with no consequence
          is chrome. */}
      {scopeField && !isStale && !isTerminal && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How far the change reaches">
          {scopeField.options.map(opt => {
            const selected = scope === opt
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busyOverall}
                onClick={() => setScope(opt)}
                className={cn(
                  'h-7 shrink-0 rounded-full border px-2.5 text-[0.6875rem] font-medium transition-colors disabled:opacity-60',
                  selected
                    ? 'border-primary bg-[rgba(var(--glow-rgb),.14)] text-primary'
                    : 'border-[color:var(--hairline)] bg-transparent text-[color:var(--text-tertiary)]',
                )}
              >
                {SCOPE_PILL[opt] ?? opt}
              </button>
            )
          })}
        </div>
      )}

      {diff.implications?.map((imp, i) => (
        <p key={i} className={`flex items-start gap-1.5 text-[0.6875rem] leading-[15px] ${imp.severity === 'warn' ? 'text-[color:var(--role-warn)]' : 'text-muted-foreground'}`}>
          {imp.severity === 'warn' ? <ShieldAlert className="mt-px size-3 shrink-0" /> : <Info className="mt-px size-3 shrink-0" />}
          <span>{imp.text}</span>
        </p>
      ))}

      {diff.rationale && <p className="text-xs italic text-muted-foreground">"{diff.rationale}"</p>}

      {isStale ? (
        <p className="text-xs text-[color:var(--role-warn)]">This changed since I proposed it — ask me again if you still want it.</p>
      ) : isTerminal ? (
        terminalNote && <p className="text-xs text-muted-foreground">{terminalNote}</p>
      ) : (
        // Fix — confirmation-card stuck loop, Part 3: these stay the primary,
        // unambiguous way to answer, at a full 44px touch target — tapping
        // reads as obviously the intended action rather than typing "yes"
        // (which free text still handles correctly, see
        // confirmation-reply.ts, but shouldn't be the first thing reached
        // for). Confirm takes the row; "Leave it" is the quiet way out.
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            className="h-11 flex-1 rounded-xl bg-primary text-[0.8125rem] font-semibold text-primary-foreground glow-mint-box disabled:opacity-60"
            onClick={() => void handleConfirm()}
            disabled={busyOverall}
          >
            {busy === 'confirm' ? 'Applying…' : 'Confirm'}
          </button>
          <button
            type="button"
            className="h-11 shrink-0 rounded-xl border border-[color:var(--hairline)] bg-transparent px-4 text-[0.8125rem] font-medium text-[color:var(--text-tertiary)] disabled:opacity-60"
            onClick={handleReject}
            disabled={busyOverall}
          >
            {busy === 'reject' ? 'Declining…' : 'Leave it'}
          </button>
        </div>
      )}
    </div>
  )
}
