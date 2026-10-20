import { useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { ChatPendingActionView } from '@/lib/types'
import { pendingWindowPassed } from '@/lib/pending-actions-store'
import { offerChanges, offerChangeText } from '@/lib/offer-text'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.4 — "rendering the effect, not prose." ONE
// generic component renders `diff.rows` + `implications` for ANY domain
// (exercise swap, meal swap) — no per-domain card. This is the structural
// half of D1: the offer is what actually renders on a plan_mutation turn;
// the model's own text for that turn is discarded entirely by
// ChatAssistant.tsx's processResponse, never reaching this component.
//
// TEXT + SMALL BUTTONS, ALWAYS — Ashley's ruling, 20 Oct 2026, from three
// options: "A real trainer wouldn't immediately send a card. It should be
// just a text question and then a smaller button to approve the swap." So
// there is no card any more: the offer is the coach's own bubble — the
// question (the lead) and, under it in the same bubble, what changes, what
// stays and what it costs, as lines of text (`offer-text.ts`) — then small
// buttons beneath it: each confirm under its own scope label, and "Not now".
// Every fact the card showed is still said before the tap. The buttons LOOK
// small and keep the 44px tap target (her gym-floor rule): the 44px is the
// button, the pill drawn inside it is the size of a word.
// It reverses her 24 Sep line that kept the Apply cards for asked changes.
// ---------------------------------------------------------------------------

export function ProposalCard({
  pendingAction,
  onConfirm,
  onReject,
  onAlternative,
  bubble,
  maxWidth,
}: {
  pendingAction: ChatPendingActionView
  onConfirm: (editedScope?: string) => Promise<void>
  onReject: () => Promise<void>
  /**
   * Ask for one of the nearest things instead. Sends the alternative's own
   * wording as a message, so it comes back as an ordinary proposal with its
   * own offer and its own Confirm — a swap is a different change, not a
   * variant of this one, and must not ride in on this offer's tap.
   */
  onAlternative?: (prompt: string) => void
  /**
   * The coach's bubble for this turn, drawn by the chat (its colours, corners
   * and the lead it is already showing), with the offer's facts put inside it.
   * The offer is part of the coach's message, not a thing under it.
   */
  bubble: (facts: ReactNode) => ReactNode
  /** The coach's bubble width in this column, so the buttons line up under it. */
  maxWidth?: string
}) {
  const { diff } = pendingAction
  // AN OFFER THAT HAS TIMED OUT LOOKS TIMED OUT, WITHOUT BEING TAPPED (L33,
  // 9 Oct 2026). An offer stops working after its window, and the only way
  // anyone found out was tapping Apply on a card that looked exactly as live
  // as the day it was made. The offer now knows when it stops working: it is
  // checked the moment it is drawn (one restored from an earlier visit) and
  // once more when the time comes. On the REAL clock — a window about elapsed
  // time is measured on the clock that elapses.
  //
  // Decided unprompted, reversible: nothing is said about the limit while the
  // offer is live. No countdown, no "good for ten minutes".
  const [timedOut, setTimedOut] = useState(() => pendingAction.status === 'pending' && pendingWindowPassed(pendingAction.expiresAt))
  useEffect(() => {
    if (pendingAction.status !== 'pending' || !pendingAction.expiresAt) return
    const left = Date.parse(pendingAction.expiresAt) - Date.now()
    if (!(left > 0)) { setTimedOut(true); return }
    const timer = setTimeout(() => setTimedOut(true), Math.min(left, 2_147_000_000))
    return () => clearTimeout(timer)
  }, [pendingAction.status, pendingAction.expiresAt])
  const status: ChatPendingActionView['status'] = timedOut && pendingAction.status === 'pending' ? 'expired' : pendingAction.status
  const [scope, setScope] = useState<string | undefined>(diff.editable?.find(e => e.field === 'scope')?.options[0])
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null)

  const busyOverall = busy != null || status === 'claimed' || status === 'executing'
  const isStale = status === 'stale'
  const isTerminal = status === 'done' || status === 'partial' || status === 'failed' || status === 'declined' || status === 'expired'

  /**
   * An offer that can no longer be acted on has to SAY so. Terminal statuses
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
  // A builder's own item can end in a full stop; the line ends in exactly one ("resized.." was on every top-up offer).
  const unchangedText = (items: string[]) => `${items.map(u => u.trim().replace(/[.\s]+$/, '')).join(', ')}.`
  const changes = offerChanges(diff.rows)
  const showAlternatives = !!(diff.alternatives && diff.alternatives.length > 0 && onAlternative && !isTerminal && !isStale)

  // THE FACTS, AS LINES OF THE COACH'S MESSAGE. The same ink as the lead
  // above them; what is said in passing (what stays, what happens next) is a
  // step smaller. data-offer-line names what each line is, and data-severity
  // is the builder's own classification of a cost, readable from outside: a
  // driver that has to tell "what this costs you" from "what happens next" by
  // matching the WORDS passes on any sentence with a number in it — which is
  // how the swap card's first cost check came to be satisfied by
  // "Sets × reps: 2×8" sitting in the Unchanged line.
  const facts = (
    <div data-testid="offer-facts" className="mt-2 space-y-1.5">
      {changes.map((c, i) => (
        <p key={`c${i}`} data-offer-line="change">{offerChangeText(c)}</p>
      ))}
      {diff.unchanged && diff.unchanged.length > 0 && (
        <p data-offer-line="unchanged" className="text-[0.84375rem] opacity-80">Unchanged: {unchangedText(diff.unchanged)}</p>
      )}
      {diff.implications?.map((imp, i) => (
        <p
          key={`i${i}`}
          data-offer-line="implication"
          data-severity={imp.severity}
          className={imp.severity === 'warn' ? 'text-[0.90625rem] font-medium' : 'text-[0.84375rem] opacity-80'}
        >
          {imp.severity === 'warn' && <ShieldAlert aria-label="Worth knowing" className="mr-1 inline size-3.5 -translate-y-px text-[color:var(--role-warn)]" />}
          {imp.text}
        </p>
      ))}
      {diff.rationale && <p data-offer-line="rationale">{diff.rationale}</p>}
    </div>
  )

  // One look for every small button: the 44px is the button, the pill inside
  // is the size of a word — light, outlined, no glow.
  const pill = (primary: boolean) =>
    `inline-flex items-center rounded-full border px-3 py-1 text-[0.8125rem] leading-5 ${
      primary
        ? 'border-[color:color-mix(in_oklab,var(--primary)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--primary)_14%,transparent)] font-semibold text-foreground'
        : 'border-[color:var(--hairline)] text-muted-foreground'
    }`
  const small = 'inline-flex min-h-[44px] items-center disabled:opacity-60'

  return (
    <div
      className={`flex w-full flex-col items-start ${status === 'expired' ? 'opacity-60' : ''}`}
      style={{ maxWidth }}
      data-testid="proposal-card"
      data-offer="text"
      data-card-status={status}
    >
      {bubble(facts)}

      {/* THE NEAREST THINGS THAT KEEP THE BAR. Ashley's ruling, 12 Sep 2026:
          taking a food out of a meal names two or three specific swaps rather
          than inviting her to type one, because on a phone typing a food name
          into a box is the thing that does not happen. Every entry has already
          been verified against her allergies and dislikes by the builder that
          produced it. Small buttons like the rest, above the confirm — an offer
          that goes with the cost, never the primary action: declining is a
          perfectly good answer. */}
      {showAlternatives && (
        <div data-testid="offer-alternatives" className="flex flex-wrap gap-x-2">
          {(diff.alternatives ?? []).map(alt => (
            <button
              key={alt.label}
              type="button"
              className={small}
              onClick={() => onAlternative && onAlternative(alt.prompt)}
              disabled={busyOverall}
            >
              <span className={pill(false)}>
                <span className="font-medium text-foreground">{alt.label}</span>
                {alt.note && <span className="ml-1.5 text-[0.6875rem]">{alt.note}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {isStale ? (
        <p className="mt-1.5 text-xs text-[color:var(--role-warn)]">This changed since I proposed it — ask me again if you still want it.</p>
      ) : isTerminal ? (
        terminalNote && <p className="mt-1.5 text-xs text-muted-foreground" data-testid="proposal-terminal-note">{terminalNote}</p>
      ) : (
        // These stay the primary, unambiguous way to answer — a typed "yes"
        // or "no" works too (confirmation-reply.ts), but shouldn't be the
        // first thing reached for. Each scope option is its own "apply with
        // this scope" button; the first is the one the offer leads with.
        <div data-testid="offer-buttons" className="flex flex-wrap items-center gap-x-2">
          {scopeField ? (
            scopeField.options.map((opt, i) => (
              <button
                key={opt}
                type="button"
                className={small}
                onClick={() => void handleConfirm(opt)}
                disabled={busyOverall}
              >
                <span className={pill(i === 0)}>
                  {busy === 'confirm' && scope === opt
                    ? 'Applying…'
                    : scopeField.labels?.[opt] ?? (opt === 'today' ? 'Apply today' : opt === 'block' ? 'Whole block' : opt === 'permanent' ? 'Rest of block' : opt)}
                </span>
              </button>
            ))
          ) : (
            <button
              type="button"
              className={small}
              onClick={() => void handleConfirm()}
              disabled={busyOverall}
            >
              <span className={pill(true)}>{busy === 'confirm' ? 'Applying…' : 'Apply'}</span>
            </button>
          )}
          <button
            type="button"
            className={small}
            onClick={handleReject}
            disabled={busyOverall}
          >
            <span className={pill(false)}>{busy === 'reject' ? 'Declining…' : 'Not now'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
