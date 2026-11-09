// ---------------------------------------------------------------------------
// CORRECTING A MEAL ALREADY LOGGED AS EATEN — QA round 3, 9 Nov 2026 (the meals tester's finding 8).
//
// Ashley's 2 Nov ruling ("Same dishes") calls an edit to a meal already logged as eaten a CORRECTION, and settles
// what the rest of the day does about it: the other dishes are held and resized together. What was built changed
// only the plan's copy of the meal. The eaten record kept the old numbers, so the day then saw two different
// breakfasts: the held dishes grew to cover the smaller plan breakfast (the card's "lunch goes from 822 to 957"), and
// the screen shrank them again for a breakfast that "came to 134 kcal more than planned" (lunch landed at 894, and
// the line said "smaller" over a lunch that had grown). Measured by the tester; reproduced here.
//
// So a correction now reaches the record: the slot's logged entry comes off and the edited meal goes on as eaten, in
// the same step as the plan edit. All or nothing, because a meal counted twice (old and new both logged) or once
// under the wrong numbers is the defect itself: the old entry comes off FIRST, and if that cannot be done (no
// signal) nothing is written and the screen says it did not save. Undo puts back exactly what was logged.
//
// The Undo record is kept on the phone, keyed by the edit, because the coach's Undo has only the offer it saved to
// work from. Lost (cleared storage), an Undo puts the plan back and leaves the eaten record as corrected, which is
// what was last said to have been eaten.
// ---------------------------------------------------------------------------
import { getTodayLedger, logMealEaten, voidMealEvent, type MealEventRecord, type MealMacros, type MealSlotName } from './meal-store'
import { isAfterEaten } from './meal-new-from'
import type { MealAdditionPayload } from './meal-addition'

export interface EatenCorrectionDeps {
  /** The slot's logged meal entries for the date (not extras: a second helping is not the meal being corrected). */
  slotEvents: (profileId: string, date: string, slot: MealSlotName) => Promise<MealEventRecord[]>
  /** False when the entry is still counting afterwards. */
  voidEvent: (clientId: string) => Promise<boolean>
  log: (profileId: string, date: string, slot: MealSlotName, mealName: string, macros: MealMacros) => MealEventRecord
  store: { get: (key: string) => string | null; set: (key: string, value: string) => void; remove: (key: string) => void }
}

const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 }

const localStore: EatenCorrectionDeps['store'] = {
  get: key => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key, value) => { try { localStorage.setItem(key, value) } catch { /* the Undo then puts back the plan only */ } },
  remove: key => { try { localStorage.removeItem(key) } catch { /* nothing to do */ } },
}

const realEatenCorrectionDeps: EatenCorrectionDeps = {
  slotEvents: async (profileId, date, slot) => (await getTodayLedger(profileId, date, ZERO)).events
    .filter(e => e.slot === slot && e.eventType === 'confirmed'),
  voidEvent: voidMealEvent,
  log: logMealEaten,
  store: localStore,
}

const keyFor = (profileId: string, p: MealAdditionPayload) => `eaten-correction:${profileId}:${p.date}:${p.slot}:${p.option.name}`

/** Is this edit a correction of a meal logged as eaten (marked at the edit, today only)? */
const correctsEaten = (payload: MealAdditionPayload): boolean => isAfterEaten(payload.option)

/**
 * STEP 1, before anything else is written: the slot's eaten entries come off. Returns what came off (empty when the
 * edit is not a correction, or nothing is logged there now), or false when one would not come off, in which case
 * every entry is as it was.
 */
export async function takeOffEaten(profileId: string, payload: MealAdditionPayload, deps: EatenCorrectionDeps = realEatenCorrectionDeps): Promise<MealEventRecord[] | false> {
  if (!correctsEaten(payload)) return []
  const events = await deps.slotEvents(profileId, payload.date, payload.slot).catch(() => null)
  if (events === null) return false
  const off: MealEventRecord[] = []
  for (const e of events) {
    if (await deps.voidEvent(e.clientId)) { off.push(e); continue }
    putBackEaten(profileId, payload, off, deps)
    return false
  }
  return events
}

/** The rollback when the plan half of the edit did not land: exactly what came off goes back on. */
export function putBackEaten(profileId: string, payload: MealAdditionPayload, events: MealEventRecord[], deps: EatenCorrectionDeps = realEatenCorrectionDeps): void {
  for (const e of events) deps.log(profileId, payload.date, payload.slot, e.mealName, e.macros)
}

/** STEP 3, once the plan half has landed: the edited meal goes on as eaten, and the correction is kept for Undo. */
export function logCorrected(profileId: string, payload: MealAdditionPayload, previous: MealEventRecord[], deps: EatenCorrectionDeps = realEatenCorrectionDeps): void {
  if (previous.length === 0) return
  const m = payload.option.macros
  const now = deps.log(profileId, payload.date, payload.slot, payload.option.name, { kcal: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat })
  deps.store.set(keyFor(profileId, payload), JSON.stringify({
    previous: previous.map(e => ({ mealName: e.mealName, macros: e.macros })),
    now: [now.clientId],
  }))
}

/**
 * THE UNDO'S EATEN HALF, run before the plan half: the corrected entry comes off and what was logged before goes back
 * on. True when there is nothing to undo here. False when the corrected entry would not come off, and then nothing
 * is put back (a retry is safe: the record is forgotten only once both halves are done).
 */
export async function undoEatenCorrection(profileId: string, payload: MealAdditionPayload, deps: EatenCorrectionDeps = realEatenCorrectionDeps): Promise<boolean> {
  const key = keyFor(profileId, payload)
  const raw = deps.store.get(key)
  if (!raw) return true
  let record: { previous: { mealName: string; macros: MealMacros }[]; now: string[] }
  try { record = JSON.parse(raw) } catch { deps.store.remove(key); return true }
  for (const id of record.now ?? []) if (!(await deps.voidEvent(id))) return false
  for (const p of record.previous ?? []) deps.log(profileId, payload.date, payload.slot, p.mealName, p.macros)
  deps.store.remove(key)
  return true
}
