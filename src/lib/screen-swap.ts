// ---------------------------------------------------------------------------
// THE SCREEN'S SWAP, as one function App and the browser harness both run.
//
// 9 Oct 2026 (H19). This lived inline in App.tsx, which no harness page boots,
// so no driver had ever tapped a swap through to the plan — and the path had a
// hole a driver would have found in one run: swapExerciseInMesocycle returns
// the SAME array when the slot it is pointed at does not exist, and the
// handler saved that unchanged week, cleared the error and let the dialog
// close as if it had worked. On a session moved to another day that was every
// swap. A WRITE THAT CHANGED NOTHING MUST NOT LOOK LIKE ONE THAT DID.
//
// Returns the sentence to show, or null when the swap is saved. `show` is how
// the caller's screen is updated: once optimistically, and once more to put
// the old plan back if the write fails (audit §3.1 — a silent revert is its
// own small betrayal, so the caller is told as well).
// ---------------------------------------------------------------------------
import type { MesocycleWeek, UserProfile } from './types'
import type { ExerciseEntry } from './exercise-db'
import { swapExerciseInMesocycle, type SwapScope } from './mesocycle-edit'
import { saveScopedEdit } from './mesocycle-persistence'
import { sweepStaleForTarget } from './pending-actions-store'
import { publishScreenEdit, recordScreenEdit, screenEditText } from './screen-edit-undo'

export const SWAP_CHANGED_NOTHING = "That swap didn't go through — nothing has changed. Try it again from the exercise's menu."
export const SWAP_DID_NOT_SAVE = "That swap didn't save — check your connection and try again."

export async function swapOnScreen(input: {
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  weekNumber: number
  /** The PLAN ROW the exercise lives in (session-ref's planDayName) — never the weekday being looked at. */
  dayName: string
  exIndex: number
  newExercise: ExerciseEntry
  scope: SwapScope
  show: (mesocycle: MesocycleWeek[]) => void
}): Promise<string | null> {
  const { profile, mesocycle, weekNumber, dayName, exIndex, newExercise, scope, show } = input
  const updated = await swapExerciseInMesocycle({
    mesocycle, profile, currentWeekNumber: weekNumber, dayName, exIndex, newExercise, scope,
  })
  if (updated === mesocycle) return SWAP_CHANGED_NOTHING
  show(updated)

  if (!profile.id) return null
  try {
    // 'today' is one week, 'permanent' is the rest of that week's block — the
    // one saver the coach's swap uses too (test:silent-writes §6).
    // WITH NO SIGNAL THE SWAP IS KEPT ON THE PHONE AND SENT LATER (10 Nov 2026, a gym with no Wi-Fi): "the machine is
    // taken" is the edit a gym floor asks for most, and it used to be drawn, fail, and be put back. A refusal from
    // the database still throws, and the plan still goes back.
    await saveScopedEdit(profile.id, updated, weekNumber, scope, { keepOffline: true })
    // VISION-ARCHITECTURE.md §2.3 — after a tap, sweep pending proposals on
    // the same target so nobody confirms a card their own tap invalidated.
    // Same key the chat's swap card is filed under: the PLAN ROW and index.
    // ITS OWN FAILURE IS NOT THE SWAP'S: the swap is saved (or kept) by now, and a sweep that could not reach the
    // server used to land in the catch below and put the old exercise back ON SCREEN over a plan that had changed.
    // An offer left open is checked against the plan again at its own tap (offerStillHolds).
    await sweepStaleForTarget(profile.id, `${profile.id}:propose_exercise_swap:${dayName}:${exIndex}`)
      .catch(err => console.error('Sweeping stale swap offers failed (the swap itself is saved):', err))
    // THE UNDO LINE (QA walk T7): the plan as it was, filed for the Exercise tab's one line.
    const was = mesocycle.find(w => w.week_number === weekNumber)?.days.find(d => d.day === dayName)?.exercises[exIndex]?.name
    publishScreenEdit(recordScreenEdit(mesocycle, updated, weekNumber, scope,
      screenEditText('swap', was ?? 'that exercise', newExercise.name), Date.now()))
    return null
  } catch (err) {
    console.error('Persisting swap failed:', err)
    show(mesocycle)
    return SWAP_DID_NOT_SAVE
  }
}
