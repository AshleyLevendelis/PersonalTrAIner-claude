// ---------------------------------------------------------------------------
// "STOP GIVING ME THIS ONE" — asked first, said afterwards, and taken back.
//
// 9 Oct 2026 (M10, and the door M27's "I don't like it" now leads to). The
// ⋮ menu's ban wrote a permanent preference and rewrote every week of the
// plan on one tap, in silence. LAYOUT-DESIGN §4.3 has described the fix since
// it was written: a confirm stating the blast radius, then a receipt carrying
// an Undo that reverses BOTH writes — or no Undo at all, never a dead one.
//
// Three states, one sheet: the question, the receipt, and (after Undo) the
// line saying it is back. The sentences describing what a ban does are the
// coach's card's own (screen-ban.ts, banConfirmLines).
//
// Loaded on the tap, like the other sheets nobody has opened yet.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { banBlastRadius, banConfirmLines, type BanOutcome } from '@/lib/screen-ban'
import type { MesocycleWeek } from '@/lib/types'
import type { DayGuard } from '@/lib/plan-guard'

export function BanExerciseSheet({
  exerciseName,
  mesocycle,
  loadGuard,
  onConfirm,
  onClose,
}: {
  /** Null = closed. */
  exerciseName: string | null
  mesocycle: MesocycleWeek[]
  /** Which sessions are already trained (they keep it). The ban itself loads the same guard. */
  loadGuard: () => Promise<DayGuard>
  onConfirm: (exerciseName: string) => Promise<BanOutcome | void> | void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<BanOutcome | null>(null)
  const [undone, setUndone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The blast radius is read ONCE, when the sheet opens: after the ban the
  // exercise is in no session, and a receipt that recounted would say "0".
  const [lines, setLines] = useState<{ warn: string | null; info: string } | null>(null)

  useEffect(() => {
    if (!exerciseName) return
    setBusy(false); setOutcome(null); setUndone(false); setError(null)
    setLines(null)
    let live = true
    // Counted with the trained-day guard, so "N sessions get rebuilt" is the
    // number the ban will change (M35). While it loads, Ban waits.
    loadGuard()
      .then(guard => { if (live) setLines(banConfirmLines(banBlastRadius(mesocycle, exerciseName, guard))) })
      .catch(() => { if (live) setLines(banConfirmLines(banBlastRadius(mesocycle, exerciseName, null))) })
    return () => { live = false }
    // Keyed on the exercise alone: the plan changing underneath an open sheet
    // (the ban itself) must not rewrite the sentence that was agreed to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseName])

  const confirm = async () => {
    if (!exerciseName) return
    setBusy(true); setError(null)
    const result = (await onConfirm(exerciseName)) ?? { error: null, banned: true, undo: null }
    setBusy(false)
    // Recorded-but-the-plan-did-not-save is still a ban: the receipt shows,
    // with the sentence saying which half is missing.
    if (!result.banned) { setError(result.error ?? "That didn't save — try again in a moment."); return }
    setOutcome(result)
    setError(result.error)
  }

  const undo = async () => {
    if (!outcome?.undo) return
    setBusy(true); setError(null)
    const failed = await outcome.undo()
    setBusy(false)
    if (failed) { setError(failed); return }
    setUndone(true)
  }

  return (
    <Dialog open={!!exerciseName} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent data-testid="ban-exercise-sheet">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {undone ? `${exerciseName} is back` : outcome ? `${exerciseName} is out for good` : `Stop giving you ${exerciseName}?`}
          </DialogTitle>
          <DialogDescription>
            {undone ? 'Your plan is as it was.' : outcome ? "It won't be picked for you again." : 'For good — in this plan and every one after it.'}
          </DialogDescription>
        </DialogHeader>

        {!outcome && lines && (
          <div className="space-y-2" data-testid="ban-confirm">
            {lines.warn && <p className="text-sm text-[color:var(--role-warn-text)]" data-testid="ban-blast-radius">{lines.warn}</p>}
            <p className="text-sm text-muted-foreground">{lines.info}</p>
            <Button variant="destructive" className="w-full min-h-[44px]" disabled={busy} onClick={confirm} data-testid="ban-confirm-yes">
              {busy ? 'Taking it out…' : 'Take it out for good'}
            </Button>
            <Button variant="outline" className="w-full min-h-[44px]" disabled={busy} onClick={onClose} data-testid="ban-confirm-no">
              Keep it
            </Button>
          </div>
        )}

        {outcome && !undone && (
          <div className="space-y-2" data-testid="ban-receipt">
            <p className="text-sm">✓ {exerciseName} is off your plan and won&rsquo;t be suggested again.</p>
            {outcome.undo && (
              <Button variant="outline" className="w-full min-h-[44px]" disabled={busy} onClick={undo} data-testid="ban-undo">
                {busy ? 'Putting it back…' : 'Undo'}
              </Button>
            )}
            <Button className="w-full min-h-[44px]" disabled={busy} onClick={onClose} data-testid="ban-done">Done</Button>
          </div>
        )}

        {undone && (
          <div className="space-y-2" data-testid="ban-undone">
            <Button className="w-full min-h-[44px]" onClick={onClose}>Done</Button>
          </div>
        )}

        {error && <p className="text-xs text-destructive" data-testid="ban-error">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
