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
}: {
  target: RemoveTarget | null
  onClose: () => void
  /** Drop it. Returns false when the edit was refused, so the sheet can say why. */
  onDrop: (scope: SwapScope) => Promise<string | null>
  /** Hand off to the existing swap dialog for the same slot. */
  onSwapInstead: () => void
  /** What this removal would cost the week's balance, if anything — computed by the caller, read-only. */
  balanceCost?: (scope: SwapScope) => string | null
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  const close = () => { setBusy(false); setError(null); setChoosing(false); onClose() }

  const drop = async (scope: SwapScope) => {
    setBusy(true); setError(null)
    const refusal = await onDrop(scope)
    setBusy(false)
    if (refusal) { setError(refusal); return }
    close()
  }

  const cost = choosing && balanceCost ? balanceCost('today') : null

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

        {!choosing ? (
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
            {/* THE COST, BEFORE THE TAP. The weekly balance passes cannot be
                re-run on a single edit (they need the whole generation
                context), so the app says what the edit costs rather than
                breaking it quietly or refusing outright. */}
            {cost && <p className="text-xs text-[color:var(--role-warn-text)]" data-testid="remove-balance-cost">{cost}</p>}
            <p className="text-sm">Just this week, or the rest of the block?</p>
            <Button className="w-full" disabled={busy} onClick={() => drop('today')} data-scope="today">Today only</Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => drop('permanent')} data-scope="permanent">Rest of block</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setChoosing(false)}>Back</Button>
          </div>
        )}

        {error && <p className="text-xs text-destructive" data-testid="remove-error">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
