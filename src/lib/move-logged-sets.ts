import type { ExerciseSetLog } from './types'
import type { SaveSetInput } from './set-log-store'

// ---------------------------------------------------------------------------
// SETS LOGGED UNDER THE WRONG EXERCISE MOVE TO THE ONE HE DID (24 Nov 2026; docs/plans/move-logged-sets.md).
//
// Ashley, 24 Nov 2026, in the gym: he logged Seated Leg Curl (25 x 14, 20 x 15, 20 x 15), then told the coach "I
// incorrectly logged leg curl, I actually did leg extensions". Nothing in the app could move sets, so the coach logged
// ONE new set under Leg Extensions from numbers he never said, and the three leg curl sets stayed, ready to set next
// week's leg curl weight from a lift he did not do.
//
// A move takes the sets from the app's OWN log (never from the model's numbers), writes each under the exercise he
// names, in the same order, after any sets already there, with every field kept (weight, reps, effort, unit,
// build-up, drop, added load), and deletes the originals. One pure planner, so the chat and the screen move the same
// way, and the plan carries what Undo needs: the new rows to delete and the old rows to write back.
// ---------------------------------------------------------------------------

export interface MovedSetKey {
  exerciseId: string
  setNumber: number
  isWarmup: boolean
  dropIndex: number
}

export interface MoveLoggedSetsPlan {
  /** The rows to write under the exercise he did. */
  writes: SaveSetInput[]
  /** The rows to delete from the exercise he logged by mistake, as keys. */
  deletes: MovedSetKey[]
  /** The rows as they stood, written back by Undo. */
  before: SaveSetInput[]
  /** How many working sets and build-up sets moved, for the receipt. */
  working: number
  warmups: number
}

const asInput = (l: ExerciseSetLog, ctx: { userId: string; date: string; weekNumber: number | null; day: string }, exerciseId: string, exerciseName: string, setNumber: number): SaveSetInput => ({
  userId: ctx.userId, date: ctx.date, weekNumber: ctx.weekNumber, day: ctx.day,
  exerciseId, exerciseName, setNumber,
  weightKg: Number(l.weight_kg), repsCompleted: l.reps_completed, rpe: l.rpe ?? null, unit: l.unit,
  isBodyweight: !!l.is_bodyweight, isWarmup: !!l.is_warmup, dropIndex: l.drop_index ?? 0, addedLoadKg: l.added_load_kg ?? null,
})

/**
 * The move, or null when there is nothing to move (no sets under `from`, or `from` and `to` are the same exercise).
 * `fromRows` are the day's rows for the exercise logged by mistake; `toRows` the rows already under the one he did,
 * so moved sets are numbered after them and never write over a set that is there.
 */
export function planMoveLoggedSets(
  fromRows: ExerciseSetLog[],
  toRows: ExerciseSetLog[],
  to: { exerciseId: string; exerciseName: string },
  ctx: { userId: string; date: string; weekNumber: number | null; day: string },
): MoveLoggedSetsPlan | null {
  if (fromRows.length === 0) return null
  const fromId = fromRows[0].exercise_id ?? ''
  if (fromId === to.exerciseId) return null
  const order = (a: ExerciseSetLog, b: ExerciseSetLog) =>
    Number(!a.is_warmup) - Number(!b.is_warmup) || a.set_number - b.set_number || (a.drop_index ?? 0) - (b.drop_index ?? 0)
  const rows = [...fromRows].sort(order)
  // NUMBERED AFTER WHAT IS THERE, kind by kind: a build-up row and a working set share numbers in the store and are
  // told apart by is_warmup, so each kind keeps its own count. A drop keeps the number of the set it hangs off.
  const nextOf = { warm: Math.max(0, ...toRows.filter(r => r.is_warmup).map(r => r.set_number)), work: Math.max(0, ...toRows.filter(r => !r.is_warmup).map(r => r.set_number)) }
  const renumber = new Map<string, number>()
  const writes: SaveSetInput[] = []
  for (const l of rows) {
    const kind = l.is_warmup ? 'warm' : 'work'
    const parentKey = `${kind}:${l.set_number}`
    let n = renumber.get(parentKey)
    if (n == null) { n = ++nextOf[kind]; renumber.set(parentKey, n) }
    writes.push(asInput(l, ctx, to.exerciseId, to.exerciseName, n))
  }
  return {
    writes,
    deletes: rows.map(l => ({ exerciseId: l.exercise_id ?? fromId, setNumber: l.set_number, isWarmup: !!l.is_warmup, dropIndex: l.drop_index ?? 0 })),
    before: rows.map(l => asInput(l, ctx, l.exercise_id ?? fromId, l.exercise_name, l.set_number)),
    working: rows.filter(l => !l.is_warmup && !(l.drop_index ?? 0)).length,
    warmups: rows.filter(l => l.is_warmup).length,
  }
}

/** The receipt's line: "Seated Leg Curl → Leg Extensions · 3 sets" (build-ups named only when there are some). */
export function moveLine(fromName: string, toName: string, plan: Pick<MoveLoggedSetsPlan, 'working' | 'warmups'>): string {
  const sets = `${plan.working} set${plan.working === 1 ? '' : 's'}`
  const warm = plan.warmups > 0 ? ` and ${plan.warmups} warm-up${plan.warmups === 1 ? '' : 's'}` : ''
  return `${fromName} → ${toName} · ${sets}${warm}`
}

/**
 * Write the move: every new row first, then the deletes, so a failure part-way leaves the sets under BOTH names
 * (nothing lost) rather than under neither. `logSet` returns null when the store refused the row; then nothing is
 * deleted and the rows already written are taken back.
 */
export function applyMoveLoggedSets(
  plan: MoveLoggedSetsPlan,
  io: { logSet: (input: SaveSetInput) => unknown; deleteSet: (key: MovedSetKey & { userId: string; date: string }) => void },
  ctx: { userId: string; date: string },
): { moved: boolean; logged: MovedSetKey[] } {
  const logged: MovedSetKey[] = []
  for (const w of plan.writes) {
    const row = io.logSet(w)
    if (row == null) {
      for (const k of logged) io.deleteSet({ ...k, ...ctx })
      return { moved: false, logged: [] }
    }
    logged.push({ exerciseId: w.exerciseId, setNumber: w.setNumber, isWarmup: !!w.isWarmup, dropIndex: w.dropIndex ?? 0 })
  }
  for (const d of plan.deletes) io.deleteSet({ ...d, ...ctx })
  return { moved: true, logged }
}

