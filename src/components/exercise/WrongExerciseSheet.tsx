import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useActiveSession } from '@/hooks/useActiveSession'
import { searchExercisesToLog } from '@/lib/exercise-db'
import { planMoveLoggedSets, applyMoveLoggedSets, moveLine, type MoveLoggedSetsPlan, type MovedSetKey } from '@/lib/move-logged-sets'

// ---------------------------------------------------------------------------
// "LOGGED THE WRONG EXERCISE?" ON THE ⋮ MENU (24 Nov 2026; the screen half of the chat's move_logged_sets, the same
// planner and writer in move-logged-sets.ts). Ashley logged Seated Leg Curl and had done Leg Extensions; the only fix
// was to delete each set and type it again. Now he picks the exercise he did and every set moves, with an Undo.
// ---------------------------------------------------------------------------

export interface MoveUndo { line: string; undo: () => void }

export function WrongExerciseSheet({ open, onOpenChange, exerciseId, exerciseName, onMoved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exerciseId: string
  exerciseName: string
  /** The line the card shows after a move, with its Undo. */
  onMoved: (u: MoveUndo) => void
}) {
  const session = useActiveSession()
  const [query, setQuery] = useState('')
  const [failed, setFailed] = useState(false)
  const results = useMemo(() => searchExercisesToLog(query, 8).filter(e => e.name !== exerciseName), [query, exerciseName])

  const pick = (toId: string, toName: string) => {
    const userId = session.profileId ?? ''
    const ctx = { userId, date: session.date, weekNumber: session.liveWeek, day: session.dayName }
    const plan: MoveLoggedSetsPlan | null = planMoveLoggedSets(session.setsFor(exerciseId, exerciseName), session.setsFor(toId, toName), { exerciseId: toId, exerciseName: toName }, ctx)
    if (!plan) { onOpenChange(false); return }
    const io = { logSet: session.logSet, deleteSet: (k: MovedSetKey & { userId: string; date: string }) => session.deleteSet(k) }
    const { moved, logged } = applyMoveLoggedSets(plan, io, { userId, date: session.date })
    if (!moved) { setFailed(true); return }
    session.refresh()
    setQuery(''); setFailed(false); onOpenChange(false)
    onMoved({
      line: `Moved: ${moveLine(exerciseName, toName, plan)}.`,
      // Undo: the new rows go (as their own kind), the old rows come back.
      undo: () => {
        for (const k of logged) session.deleteSet({ ...k, userId, date: session.date })
        for (const b of plan.before) session.logSet(b)
        session.refresh()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setQuery(''); setFailed(false) } onOpenChange(o) }}>
      <DialogContent data-testid="wrong-exercise-sheet">
        <DialogHeader>
          <DialogTitle>Which exercise did you actually do?</DialogTitle>
          <DialogDescription>Your {exerciseName} sets move to it as you logged them, and {exerciseName} goes back to not done.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search, e.g. leg extension" aria-label="Exercise you did" data-testid="wrong-exercise-search" />
        {failed && <p className="text-sm text-destructive">I couldn't move those sets just now, so nothing changed. Try again in a moment.</p>}
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {query.trim() && results.length === 0 && <p className="text-sm text-muted-foreground">Nothing found by that name.</p>}
          {query.trim() && results.map(e => (
            <button key={e.id} type="button" className="min-h-[44px] rounded-lg px-3 text-left text-sm hover:bg-muted" data-testid="wrong-exercise-option" onClick={() => pick(e.id, e.name)}>
              {e.name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
