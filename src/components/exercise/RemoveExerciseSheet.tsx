// ---------------------------------------------------------------------------
// TAKING ONE EXERCISE OUT — and Ashley's ruling about the gap it leaves.
//
// Asked, 11 Sep 2026, what should happen when an exercise is removed: (A)
// shorten the session and be honest about the time; (B) fill the gap
// automatically with the best alternative; (C) ask each time. She chose (C),
// over my recommendation of (A). So removing is never one tap that silently
// decides: it is one entry point with two outcomes, stated plainly. A useful
// side effect is that swapping — which people did not always realise was
// there — becomes discoverable from the act of wanting something gone.
//
// The scope words are SwapDialog's, to the letter ("Today only" / "Rest of
// block"), because a second vocabulary for the same idea is how two screens
// come to mean different things.
// ---------------------------------------------------------------------------
import { useState } from 'react'
import { EditReasonStep, type ReasonAnswer } from './EditReasonStep'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
import type { SwapScope } from '@/lib/mesocycle-edit'

export interface RemoveTarget {
  dayName: string
  exIndex: number
  exerciseName: string
  /** The week being edited — the browsed week in the program view, else the live one. */
  weekNumber?: number
}

export function RemoveExerciseSheet({
  target,
  onClose,
  onDrop,
  onSwapInstead,
  balanceCost,
  onReason,
}: {
  target: RemoveTarget | null
  onClose: () => void
  /** Drop it. Returns false when the edit was refused, so the sheet can say why. */
  onDrop: (scope: SwapScope) => Promise<string | null>
  /** Hand off to the existing swap dialog for the same slot. */
  onSwapInstead: () => void
  /**
   * What this removal would cost the week, and what the app will do about
   * it on other days. Computed by the caller by running the real edit as a
   * trial, so the sentences describe what will actually happen.
   */
  balanceCost?: (scope: SwapScope) => { cost: string | null; balancing: string | null }
  /**
   * WHY, BEFORE WHAT. Each answer routes to something that already exists;
   * the sheet does not decide what any of them mean. Returns a refusal string
   * or null, the same channel `onDrop` uses.
   */
  onReason?: (answer: ReasonAnswer) => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  // The reason step leads, and is skipped entirely when the caller has not
  // wired one — an unwired sheet keeps exactly its old behaviour rather than
  // showing chips that go nowhere.
  const [asked, setAsked] = useState(false)

  const close = () => { setBusy(false); setError(null); setChoosing(false); setAsked(false); onClose() }

  const drop = async (scope: SwapScope) => {
    setBusy(true); setError(null)
    const refusal = await onDrop(scope)
    setBusy(false)
    if (refusal) { setError(refusal); return }
    close()
  }

  const answer = async (a: ReasonAnswer) => {
    // Drop and swap keep their own steps — the reason only says which.
    if (a.type === 'reason' && a.reason === 'dislike') { setAsked(true); setChoosing(true); return }
    setBusy(true); setError(null)
    const refusal = await onReason?.(a) ?? null
    setBusy(false)
    if (refusal) { setError(refusal); return }
    close()
  }

  // THE SCOPE THAT IS ACTUALLY ON OFFER, not always 'today'.
  //
  // Fixed 15 Sep 2026: this read `balanceCost('today')` whatever the buttons
  // below said, so tapping "Rest of block" showed the cost of a one-week
  // change. Both are computed because both buttons are on screen at once and
  // each needs its own true sentence.
  const todayImpact = choosing && balanceCost ? balanceCost('today') : null
  const blockImpact = choosing && balanceCost ? balanceCost('permanent') : null

  return (
    <Dialog open={!!target} onOpenChange={open => { if (!open) close() }}>
      <DialogContent data-testid="remove-exercise-sheet">
        <DialogHeader>
          {/* pr-8 keeps a long exercise name clear of the shell's own close
              button, which is absolutely positioned at top-4 right-4. Read at
              390px: "Take out Romanian Deadlifts?" ran straight under the ×. */}
          <DialogTitle className="pr-8">Take out {target?.exerciseName}?</DialogTitle>
          <DialogDescription>{target?.dayName}</DialogDescription>
        </DialogHeader>

        {onReason && !asked && !choosing ? (
          <EditReasonStep
            kind="remove"
            exerciseName={target?.exerciseName ?? 'it'}
            busy={busy}
            onAnswer={answer}
            onSkip={() => setAsked(true)}
          />
        ) : !choosing ? (
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setChoosing(true)} data-verb="drop">
              <Trash2 className="size-3.5" />
              Drop it — the session gets shorter
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => { close(); onSwapInstead() }} data-verb="swap-instead">
              <ArrowRightLeft className="size-3.5" />
              Put something else there
            </Button>
          </div>
        ) : (
          <div className="space-y-2" data-testid="remove-scope">
            {/* BOTH SENTENCES, BEFORE THE TAP.

                The first is what the edit costs the week. The comment that
                stood here said the weekly balance passes "cannot be re-run on
                a single edit" — measured 13 Sep 2026, that was true of only
                one of the two. The reachable one now runs on every edit, so a
                cost line means the balancing tried and could not get the week
                back in band, which is rarer and worth more.

                The second is Ashley's ruling of the same day: a change to one
                day may touch another day to keep the week balanced, and the
                app says so before the tap. */}
            {todayImpact?.cost && <p className="text-xs text-[color:var(--role-warn-text)]" data-testid="remove-balance-cost">{todayImpact.cost}</p>}
            {todayImpact?.balancing && <p className="text-xs text-muted-foreground" data-testid="remove-balancing">{todayImpact.balancing}</p>}
            <p className="text-sm">Just this week, or the rest of the block?</p>
            <Button className="w-full" disabled={busy} onClick={() => drop('today')} data-scope="today">Today only</Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => drop('permanent')} data-scope="permanent">Rest of block</Button>
            {blockImpact?.cost && <p className="text-xs text-[color:var(--role-warn-text)]" data-testid="remove-block-cost">For the block: {blockImpact.cost}</p>}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setChoosing(false)}>Back</Button>
          </div>
        )}

        {error && <p className="text-xs text-destructive" data-testid="remove-error">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
