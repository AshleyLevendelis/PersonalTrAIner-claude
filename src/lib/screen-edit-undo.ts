// ---------------------------------------------------------------------------
// AN EXERCISE CHANGED ON THE SCREEN CAN BE PUT BACK (QA walk T7, 8 Nov 2026).
//
// Swapping, removing, moving or adding an exercise from the Exercise screen changed the plan and said nothing, with no
// way back but doing the opposite by hand, while the coach's card for the very same change has had an Undo since
// September. His standing list "every change previews and can be undone" (2 Nov) and his two "Undo line" rulings of
// 8 Nov (a meal taken off "eaten", the shopping list's Clear and Rebuild) say what it looks like: one line saying what
// happened, with an Undo beside it.
//
// The put-back is the coach's, rule for rule:
//   - the weeks the change wrote are written back from the plan as it was before it (one week for "Just today",
//     the rest of the block for "Whole block"), through the same week saver;
//   - only while those weeks still read as the change left them (his 29 Oct rule: an Undo puts back only what is
//     still as it was left, else says so and touches nothing). The words are the coach card's own (RECEIPTS_UNDONE);
//   - for ten minutes, the coach's window, measured on the real clock (a dev override of "today" must not move it).
//
// A small store rather than component state, because the swap is written by App (and by the harness page, through
// the same screen-swap.ts) while the line is drawn on the Exercise tab: whoever writes the change files it here,
// and the one line component reads it.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'
import type { MesocycleWeek } from './types'
import { fingerprintWeeks, undoStillFits } from './offer-still-holds'
import { saveWeekKeepingOffline, weeksTouchedByScope } from './mesocycle-persistence'
import { RECEIPTS, RECEIPTS_UNDONE } from './coach-voice'

/** The coach's Undo window (isWithinUndoWindow), so the two surfaces keep one promise. */
export const SCREEN_UNDO_WINDOW_MS = 10 * 60 * 1000

export type ScreenEditKind = 'swap' | 'remove' | 'reorder' | 'add'

export interface ScreenEditRecord {
  /** One line, past tense: "Swapped Lat Pulldown for Seated Cable Row." */
  text: string
  /** The plan as it was before the change. */
  before: MesocycleWeek[]
  /** The week numbers the change wrote. */
  weeks: number[]
  /** Those weeks' fingerprints as the change left them. */
  after: Record<string, string>
  /** Real-clock milliseconds when it landed. */
  at: number
  /** Distinguishes two records with the same words. */
  id: number
}

const KIND_KEY: Record<ScreenEditKind, string> = {
  swap: 'propose_exercise_swap',
  remove: 'propose_exercise_remove',
  reorder: 'propose_exercise_reorder',
  add: 'propose_exercise_add',
}

/** The line, in the coach's receipt words ("Swapped", "Removed", "Reordered", "Added") plus what it was done to. */
export function screenEditText(kind: ScreenEditKind, name: string, other?: string): string {
  const done = RECEIPTS[KIND_KEY[kind]].done
  if (kind === 'swap' && other) return `${done} ${name} for ${other}.`
  if (kind === 'reorder') return `Moved ${name} ${other ?? ''}`.trim() + '.'
  return `${done} ${name}.`
}

/** What an Undo needs, worked out from the plan before and after a change written with this scope. */
export function recordScreenEdit(
  before: MesocycleWeek[],
  after: MesocycleWeek[],
  weekNumber: number,
  scope: 'today' | 'permanent',
  text: string,
  now: number,
): ScreenEditRecord {
  const written = weeksTouchedByScope(after, weekNumber, scope)
  const weeks = written.map(w => w.week_number)
  const prints = fingerprintWeeks(written)
  return { text, before, weeks, after: prints, at: now, id: ++seq }
}

export type ScreenUndoOutcome =
  | { ok: true; mesocycle: MesocycleWeek[] }
  | { ok: false; refusal: string; keep: boolean }

/**
 * Put the plan back. `live` is the plan on screen now; `save` writes one week (the app's saver, a fake in a gate).
 * Writes nothing unless every week it would write still reads as the change left it.
 */
export async function undoScreenEdit(
  record: ScreenEditRecord,
  live: MesocycleWeek[],
  now: number,
  save: (week: MesocycleWeek) => Promise<void>,
  /** True when a set has been logged on the screen since the change (QA round 2): the day is no longer as it was left. */
  loggedSince = false,
): Promise<ScreenUndoOutcome> {
  if (now - record.at > SCREEN_UNDO_WINDOW_MS) return { ok: false, refusal: RECEIPTS_UNDONE.tooLate, keep: false }
  if (loggedSince) return { ok: false, refusal: RECEIPTS_UNDONE.loggedSince, keep: false }
  if (!undoStillFits(record.after, live, record.weeks)) return { ok: false, refusal: RECEIPTS_UNDONE.changedSince, keep: true }
  const back = record.before.filter(w => record.weeks.includes(w.week_number))
  if (back.length !== record.weeks.length) return { ok: false, refusal: RECEIPTS_UNDONE.cannot, keep: false }
  // BOTH OR NEITHER (QA round 2, 8 Nov 2026): a "Whole block" put-back writes several weeks, and one failing midway left
  // the earlier weeks put back in the database while the screen said nothing was changed. The weeks already written
  // are written again as the change left them (`live`, which undoStillFits has just shown is that), so "nothing was
  // changed" stays true; if even that fails, the sentence says so.
  const written: MesocycleWeek[] = []
  try {
    for (const w of back) { await save(w); written.push(w) }
  } catch (err) {
    console.error('[screen-edit-undo] put-back failed', err)
    try {
      for (const w of written) {
        const asLeft = live.find(l => l.week_number === w.week_number)
        if (asLeft) await save(asLeft)
      }
    } catch (rollbackErr) {
      console.error('[screen-edit-undo] could not restore the weeks already put back', rollbackErr)
      return { ok: false, refusal: RECEIPTS_UNDONE.halfDone, keep: true }
    }
    return { ok: false, refusal: RECEIPTS_UNDONE.failed, keep: true }
  }
  const restored = new Map(back.map(w => [w.week_number, w]))
  return { ok: true, mesocycle: live.map(w => restored.get(w.week_number) ?? w) }
}

/** The app's week saver, bound to a person. */
/* An Undo is a screen edit too: with no signal it is kept on the phone and sent later, as the change it undoes was. */
export const saveWeekFor = (profileId: string) => (week: MesocycleWeek) => saveWeekKeepingOffline(profileId, week).then(() => undefined)

// --- The store: the newest change only. A second change replaces the first's line, as the coach's newest card does.
let seq = 0
let current: ScreenEditRecord | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

export function publishScreenEdit(record: ScreenEditRecord | null): void {
  current = record
  emit()
}

/** The newest change's id, read outside React (the line's timer), so it clears only its own record. */
export function currentScreenEditId(): number | null { return current?.id ?? null }

export function useScreenEdit(): ScreenEditRecord | null {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => current,
    () => null,
  )
}
