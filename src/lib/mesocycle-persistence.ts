import { supabase } from './supabase'
import type { MesocycleWeek } from './types'
import { toRow, fromRow, type MesocycleWeekRow } from './mesocycle-shape'

// ---------------------------------------------------------------------------
// Full-fidelity mesocycle round-trip (see the mesocycle_weeks migration for
// the schema rationale). `exercise_plans` deliberately stays untouched here —
// it still backs the chat assistant's schedule-patch feature and remains the
// legacy restore path for profiles created before this table existed.
// ---------------------------------------------------------------------------

export type { MesocycleWeekRow }
export { toRow, fromRow }

/**
 * Persists every week of a mesocycle. Replaces any existing rows for this
 * profile (used on regeneration, not just first creation).
 *
 * `preserveCreatedAt` matters because created_at anchors live-week detection
 * (C0 Part 6): a full resave of an EDITED plan (ban) must carry the original
 * creation time forward, or the delete+insert would stamp "now" and silently
 * rewind the trainee to week 1. Omit it only for a genuinely NEW plan.
 */
export async function saveMesocycle(profileId: string, weeks: MesocycleWeek[], preserveCreatedAt?: string): Promise<void> {
  if (weeks.length === 0) return

  // UPSERT FIRST, TRIM SECOND. This was `delete every row, then insert`, and
  // between those two calls the trainee had NO PLAN IN THE DATABASE. A dropped
  // connection, an RLS refusal or one bad row in there and their entire
  // periodized mesocycle was gone — and the callers' own recovery line,
  // "reopen the app to retry", is exactly when the loss became permanent:
  // restoreMesocycle returns null and App falls back to the flat, non-
  // periodized reconstruction, losing every swap, ban and adaptation.
  //
  // Five call sites reach this, including undoExerciseSwap — so tapping Undo
  // could destroy the plan it was meant to restore.
  //
  // (profile_id, week_number) is unique — saveMesocycleWeek below already
  // relies on it — so an upsert of every week is a complete replacement of
  // the overlap, and the plan is never absent at any instant.
  //
  // created_at is now written EXPLICITLY in both directions. The old code got
  // the new-plan case for free from the delete; an upsert would have left the
  // previous plan's birth date in place and silently rewound the trainee to
  // week 1 of a plan generated months ago.
  const createdAt = preserveCreatedAt ?? new Date().toISOString()
  const rows = weeks.map(week => ({ ...toRow(profileId, week), created_at: createdAt }))
  const { error } = await supabase
    .from('mesocycle_weeks')
    .upsert(rows, { onConflict: 'profile_id,week_number' })
  if (error) throw error

  // Only now, with the new plan safely stored, remove any weeks the old plan
  // had and this one does not. A failure here leaves a few stale trailing
  // weeks — visible, harmless and fixed by the next save — which is a far
  // better worst case than no plan at all.
  const highestWeek = weeks.reduce((max, w) => Math.max(max, w.week_number), 0)
  const { error: trimError } = await supabase
    .from('mesocycle_weeks')
    .delete()
    .eq('profile_id', profileId)
    .gt('week_number', highestWeek)
  if (trimError) console.error('Trimming stale mesocycle weeks failed (plan itself saved):', trimError)
  // A WHOLE PLAN SAVED replaces every week: nothing kept on the phone from before it may be laid back over it.
  dropKeptWeeks(profileId)
}

export interface RestoredMesocycle {
  weeks: MesocycleWeek[]
  /**
   * When THIS mesocycle was generated — the anchor for live-week detection
   * (C0 Part 6). The earliest row's created_at: saveMesocycle delete+inserts
   * on regeneration, so this is genuinely the current plan's birth date, and
   * a regenerated plan restarts at week 1 automatically. Null only if the
   * rows predate the created_at column.
   */
  createdAt: string | null
}

/** Returns the full, exact mesocycle for a profile, or null if none is stored (pre-migration profile — caller should fall back to the legacy exercise_plans reconstruction). */
export async function restoreMesocycle(profileId: string): Promise<RestoredMesocycle | null> {
  const { data, error } = await supabase
    .from('mesocycle_weeks')
    .select('*')
    .eq('profile_id', profileId)
    .order('week_number', { ascending: true })

  if (error || !data || data.length === 0) return null
  const rows = data as (MesocycleWeekRow & { created_at?: string })[]
  const createdAt = rows
    .map(r => r.created_at)
    .filter((c): c is string => !!c)
    .sort()[0] ?? null
  // WITH THE PHONE'S OWN UNSENT CHANGES ON TOP (keptPlanWeeks, below): a swap made with no signal is part of the plan
  // the moment it is made, and a read that lands before it has been sent must not draw the plan without it.
  const kept = keptPlanWeeks(profileId)
  return { weeks: rows.map(fromRow).map(w => kept.get(w.week_number) ?? w), createdAt }
}

/** Upserts a single week — used by targeted mesocycle edits (swap/ban) so a full resave isn't needed for a one-week patch. */
/**
 * Save exactly the weeks a scoped plan edit touched — 'today' is one week,
 * 'permanent' is the rest of that week's block.
 *
 * ONE SAVER, TWO SURFACES. The swap path grew two copies of this branch, one
 * in App.tsx's handleSwapExercise and one in executeExerciseSwap, and the
 * executor's comment says it "mirrors handleSwapExercise exactly" — which is
 * a promise nothing checks. session-edit's remove and reorder call this
 * instead, so the screen and the coach cannot drift apart about which weeks
 * reached the database.
 */
export async function saveScopedEdit(
  profileId: string,
  mesocycle: MesocycleWeek[],
  weekNumber: number,
  scope: 'today' | 'permanent',
  /**
   * THE SCREEN'S OWN EDITS pass `keepOffline` (10 Nov 2026): with no signal the touched weeks are kept on the phone
   * and sent later, and the answer is 'kept'. Without it a failed save throws, as it always has (the coach's cards).
   */
  options: { keepOffline?: boolean } = {},
): Promise<'saved' | 'kept'> {
  const touched = weeksTouchedByScope(mesocycle, weekNumber, scope)
  if (!options.keepOffline) {
    await Promise.all(touched.map(w => saveMesocycleWeek(profileId, w)))
    return 'saved'
  }
  // Each week on its own terms: one that reached the server is saved, one that could not is kept. A refusal throws.
  const results = await Promise.all(touched.map(w => saveWeekKeepingOffline(profileId, w)))
  return results.includes('kept') ? 'kept' : 'saved'
}

/**
 * WHICH WEEKS A SCOPED EDIT REACHES — 'today' is one week, 'permanent' is the
 * rest of that week's block.
 *
 * SPLIT OUT OF saveScopedEdit ON 15 Sep 2026, and the reason is that the gate
 * caught it: a caller that CHANGES a run of weeks has to know the same answer
 * the saver uses, and executeCardioSession worked it out for itself. Two
 * computations of one question is how the swap path ended up with three copies
 * of this branch (test:silent-writes §6, the same day).
 *
 * So a caller that needs the weeks asks for them, rather than re-deriving them
 * and hoping the saver agrees.
 */
export function weeksTouchedByScope(
  mesocycle: MesocycleWeek[],
  weekNumber: number,
  scope: 'today' | 'permanent',
): MesocycleWeek[] {
  if (scope === 'today') {
    const week = mesocycle.find(w => w.week_number === weekNumber)
    return week ? [week] : []
  }
  const block = mesocycle.find(w => w.week_number === weekNumber)?.block_number
  return mesocycle.filter(w => w.block_number === block && w.week_number >= weekNumber)
}

export async function saveMesocycleWeek(profileId: string, week: MesocycleWeek): Promise<void> {
  const { error } = await supabase
    .from('mesocycle_weeks')
    .upsert(toRow(profileId, week), { onConflict: 'profile_id,week_number' })
  if (error) throw error
  // The newest saved version of a week is the week: an older copy still waiting on the phone is dropped, never sent
  // over it later.
  dropKeptWeeks(profileId, week.week_number)
}

// ---------------------------------------------------------------------------
// A PLAN CHANGE MADE WITH NO SIGNAL IS KEPT ON THE PHONE AND SENT LATER.
//
// Ashley, 10 Nov 2026: "gyms often don't have WiFi ... We should be able to do as much as possible in the app without
// network." Sets, water, meals, cardio and the shopping list were local-first already. A change to the PLAN was not:
// with no signal, "the machine is taken, swap it" drew the swap, failed to save, put the old exercise back and said
// to check the connection. The one edit a gym floor asks for most was the one a gym with no signal refused.
//
// The weeks an edit touched are whole rows, so keeping them is keeping the edit. For the screen's own edits only
// (swap, remove, move, add, and their Undo): the coach cannot be reached offline at all, and the app's automatic
// re-pricing has no business queuing behind a connection it cannot see.
//
//   - Kept ONLY when the failure is the network's. A refusal from the database is a real error and still throws.
//   - A read of the plan lays kept weeks over what the server holds (restoreMesocycle).
//   - Any later save of the same week that SUCCEEDS drops the kept copy (saveMesocycleWeek), so an older edit is
//     never sent over a newer one. A whole new plan drops them all (saveMesocycle).
//   - Keyed by person and week; a New Plan makes a new person, so an old plan's weeks can never reach a new one.
// ---------------------------------------------------------------------------
const KEPT_PLAN_KEY = 'fitplan_plan_pending_v1'
interface KeptWeek { profileId: string; week: MesocycleWeek; keptAt: string }
const keptKey = (profileId: string, weekNumber: number) => `${profileId}|${weekNumber}`

function loadKept(): Record<string, KeptWeek> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEPT_PLAN_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as Record<string, KeptWeek> : {}
  } catch { return {} }
}
const keptListeners = new Set<() => void>()
function storeKept(map: Record<string, KeptWeek>): void {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(KEPT_PLAN_KEY)
    else localStorage.setItem(KEPT_PLAN_KEY, JSON.stringify(map))
  } catch { /* storage full or blocked: the caller's save has already thrown or succeeded on its own terms */ }
  for (const l of keptListeners) l()
}
/** Told when the kept weeks change (one kept, one sent), for the line that says something is waiting. */
export function subscribeKeptPlanWeeks(listener: () => void): () => void {
  keptListeners.add(listener)
  return () => { keptListeners.delete(listener) }
}
function dropKeptWeeks(profileId: string, weekNumber?: number): void {
  const map = loadKept()
  let changed = false
  for (const key of Object.keys(map)) {
    if (map[key].profileId !== profileId) continue
    if (weekNumber != null && map[key].week.week_number !== weekNumber) continue
    delete map[key]; changed = true
  }
  if (changed) storeKept(map)
}
/** Whether anything at all is waiting (the "waiting to send" pill, which knows no person). */
export function hasKeptPlanWeeks(): boolean {
  return Object.keys(loadKept()).length > 0
}
/** This person's plan weeks changed on the phone and not yet sent, by week number. */
export function keptPlanWeeks(profileId: string): Map<number, MesocycleWeek> {
  const out = new Map<number, MesocycleWeek>()
  for (const kept of Object.values(loadKept())) if (kept.profileId === profileId) out.set(kept.week.week_number, kept.week)
  return out
}

/**
 * The network's own failure, as the Supabase client reports it (a resolved `{ error }` whose message is the
 * browser's fetch error and whose code is empty) or as a thrown fetch error; or anything at all while the phone says
 * it is offline. A Postgres or API refusal carries a code and is NOT one.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!error || typeof error !== 'object') return false
  const e = error as { message?: unknown; code?: unknown; name?: unknown }
  if (typeof e.code === 'string' && e.code.length > 0) return false
  const text = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : ''}`
  return /Failed to fetch|NetworkError|Load failed|network request failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(text)
}

/** One week, saved now or kept for later. Throws only on a real refusal. */
export async function saveWeekKeepingOffline(profileId: string, week: MesocycleWeek): Promise<'saved' | 'kept'> {
  try {
    await saveMesocycleWeek(profileId, week)
    return 'saved'
  } catch (error) {
    if (!isNetworkFailure(error)) throw error
    const map = loadKept()
    map[keptKey(profileId, week.week_number)] = { profileId, week, keptAt: new Date().toISOString() }
    storeKept(map)
    return 'kept'
  }
}

/**
 * Send what is waiting. Each week that saves drops its own kept copy (saveMesocycleWeek); one that fails stays for
 * the next knock. Never throws. Returns how many are still waiting.
 */
let flushing: Promise<number> | null = null
export function sendKeptPlanWeeks(profileId: string): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    for (const week of keptPlanWeeks(profileId).values()) {
      try { await saveMesocycleWeek(profileId, week) } catch (error) {
        // A refusal will be refused again: drop it rather than knock for ever. The screen already shows the edit, and
        // the next read brings back what the server holds.
        if (!isNetworkFailure(error)) { console.error('A plan change kept offline was refused and is dropped:', error); dropKeptWeeks(profileId, week.week_number) }
      }
    }
    return keptPlanWeeks(profileId).size
  })().finally(() => { flushing = null })
  return flushing
}
