import { useState } from 'react'
import { ShieldAlert, Info } from 'lucide-react'
import type { ChatPendingActionView } from '@/lib/types'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.4 — "rendering the effect, not prose." ONE
// generic component renders `diff.rows` + `implications` for ANY domain
// (exercise swap, meal swap) — no per-domain card. This is the structural
// half of D1: the card is what actually renders on a plan_mutation turn;
// the model's own text for that turn is discarded entirely by
// ChatAssistant.tsx's processResponse, never reaching this component.
// ---------------------------------------------------------------------------

export function ProposalCard({
  pendingAction,
  onConfirm,
  onReject,
  onAlternative,
}: {
  pendingAction: ChatPendingActionView
  onConfirm: (editedScope?: string) => Promise<void>
  onReject: () => Promise<void>
  /**
   * Ask for one of the nearest things instead. Sends the alternative's own
   * wording as a message, so it comes back as an ordinary proposal with its
   * own card and its own Confirm — a swap is a different change, not a
   * variant of this one, and must not ride in on this card's tap.
   */
  onAlternative?: (prompt: string) => void
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

  const handleConfirm = async (explicitScope?: string) => {
    const useScope = explicitScope ?? scope
    setScope(useScope)
    setBusy('confirm')
    try {
      await onConfirm(useScope)
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

  // Turn 6: no card shell — this renders inline in the assistant's plain-text
  // flow (ChatAssistant.tsx already applies the pl-9 avatar-offset to its
  // parent), a left rule standing in for the removed border/background.
  return (
    <div className="mt-2 pl-3.5 border-l-2 border-[color:var(--role-ai-border)] text-sm space-y-2.5">
      <div className="space-y-2">
        <span className="block text-[0.59375rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--role-ai)]">
          Proposed change
        </span>
        {diff.rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] text-muted-foreground">{row.field}</span>
            <span className="text-[0.84375rem] line-through text-muted-foreground/70">{row.before}</span>
            <span className="text-[0.90625rem] font-semibold">{row.after}</span>
            {row.note && <span className="text-[0.625rem] text-muted-foreground/80">{row.note}</span>}
          </div>
        ))}
      </div>

      {diff.unchanged && diff.unchanged.length > 0 && (
        <p className="text-[0.625rem] text-muted-foreground/70">Unchanged: {diff.unchanged.join(', ')}</p>
      )}

      {/* data-severity: the card's own classification of each line, readable
          from outside. A driver that has to tell "what this costs you" from
          "what happens next" by matching the WORDS is a driver that passes on
          any sentence with a number in it — which is how the swap card's first
          cost check came to be satisfied by "Sets × reps: 2×8" sitting in the
          Unchanged row above. The severity is the app's own answer; read that. */}
      {diff.implications?.map((imp, i) => (
        <p key={i} data-severity={imp.severity} className={`flex items-start gap-1.5 text-xs ${imp.severity === 'warn' ? 'text-[color:var(--role-warn)]' : 'text-muted-foreground'}`}>
          {imp.severity === 'warn' ? <ShieldAlert className="size-3.5 mt-0.5 shrink-0" /> : <Info className="size-3.5 mt-0.5 shrink-0" />}
          <span>{imp.text}</span>
        </p>
      ))}

      {diff.alternatives && diff.alternatives.length > 0 && onAlternative && !isTerminal && !isStale && (
        /* THE NEAREST THINGS THAT KEEP THE BAR. Ashley's ruling, 12 Sep 2026:
           taking a food out of a meal names two or three specific swaps
           rather than inviting her to type one, because on a phone typing a
           food name into a box is the thing that does not happen. Every entry
           here has already been verified against her allergies and dislikes
           by the builder that produced it.
           Below the implications and above the buttons: it is an offer that
           goes with the cost, and it must not look like the primary action —
           declining is a perfectly good answer. */
        <div className="flex flex-col gap-1.5 pt-0.5">
          <span className="text-[0.59375rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Or put in instead</span>
          {diff.alternatives.map(alt => (
            <button
              key={alt.label}
              type="button"
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-[color:var(--surface-raised)] px-3 text-left disabled:opacity-60"
              onClick={() => onAlternative(alt.prompt)}
              disabled={busyOverall}
            >
              <span className="text-[0.84375rem] font-medium">{alt.label}</span>
              <span className="shrink-0 text-[0.625rem] text-muted-foreground">{alt.note}</span>
            </button>
          ))}
        </div>
      )}

      {diff.rationale && <p className="text-xs italic text-muted-foreground">"{diff.rationale}"</p>}

      {isStale ? (
        <p className="text-xs text-[color:var(--role-warn)]">This changed since I proposed it — ask me again if you still want it.</p>
      ) : isTerminal ? (
        terminalNote && <p className="text-xs text-muted-foreground">{terminalNote}</p>
      ) : (
        // Fix — confirmation-card stuck loop, Part 3: these stay the primary,
        // unambiguous way to answer, sized to the same min-h-[44px] touch
        // target as the model's own [QUICK_REPLIES] chips — tapping reads as
        // obviously the intended action rather than typing "yes" (which free
        // text still handles correctly, see confirmation-reply.ts, but
        // shouldn't be the first thing reached for). Turn 6 collapses the old
        // separate scope-toggle + confirm/reject groups into one pill row:
        // each scope option becomes its own "apply with this scope" pill.
        <div className="flex items-center gap-2 pt-0.5">
          {scopeField ? (
            scopeField.options.map((opt, i) => (
              <button
                key={opt}
                className={
                  i === 0
                    ? 'min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground glow-mint-box disabled:opacity-60'
                    : 'min-h-[44px] rounded-xl bg-[color:var(--surface-raised)] px-4 text-sm text-foreground disabled:opacity-60'
                }
                onClick={() => void handleConfirm(opt)}
                disabled={busyOverall}
              >
                {busy === 'confirm' && scope === opt
                  ? 'Applying…'
                  : opt === 'today' ? 'Apply today' : opt === 'block' ? 'Whole block' : opt}
              </button>
            ))
          ) : (
            <button
              className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground glow-mint-box disabled:opacity-60"
              onClick={() => void handleConfirm()}
              disabled={busyOverall}
            >
              {busy === 'confirm' ? 'Applying…' : 'Apply'}
            </button>
          )}
          <button
            className="min-h-[44px] px-3 text-sm text-muted-foreground disabled:opacity-60"
            onClick={handleReject}
            disabled={busyOverall}
          >
            {busy === 'reject' ? 'Declining…' : 'Keep'}
          </button>
        </div>
      )}
    </div>
  )
}
