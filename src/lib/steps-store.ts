// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.3 — daily_steps. Manual entry only this round
// (see the migration's doc comment for what real Health Connect/HealthKit
// integration would require and why it's out of scope here). One row per
// (profile, date) — a step count is a single daily figure, not an
// append-only log like water/meals — so this is a plain upsert, matching
// daily_metrics' own shape. Plain async, not local-first: a manual step
// entry happens at most once or twice a day, not in a tap-burst.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

export interface DailyStepsRow {
  id: string
  profile_id: string
  date: string
  steps: number
  source: 'manual' | 'health_connect' | 'healthkit'
  client_id: string | null
  created_at: string
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function getStepsForDate(profileId: string, date: string): Promise<DailyStepsRow | null> {
  const { data, error } = await supabase
    .from('daily_steps')
    .select('*')
    .eq('profile_id', profileId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data as DailyStepsRow | null
}

/**
 * The widest step count the app will accept for one day.
 *
 * Added 5 Sep 2026 with the chat door: a typed 9000 is a normal day, a
 * mistyped 900000 REPLACES that day with a number nobody walked, and the
 * upsert below makes the mistake permanent rather than additive. Same shape
 * of care as lift-plausibility.ts, at lower stakes — a step count cannot hurt
 * anyone, so this is a bound and a sentence rather than a whole module.
 *
 * 100,000 is deliberately generous: multi-day ultra walkers reach ~80,000, so
 * this rejects typos without arguing with anyone's real day.
 */
export const MAX_PLAUSIBLE_DAILY_STEPS = 100_000

/** Is this a number the app will store as a day's step count? */
export function isPlausibleStepCount(steps: number): boolean {
  return Number.isFinite(steps) && Number.isInteger(steps)
    && steps >= 0 && steps <= MAX_PLAUSIBLE_DAILY_STEPS
}

/** Manual entry — upserts on (profile_id, date), so re-entering today's count corrects it rather than duplicating a row. */
export async function logStepsManual(profileId: string, date: string, steps: number): Promise<DailyStepsRow> {
  const { data, error } = await supabase
    .from('daily_steps')
    .upsert({ profile_id: profileId, date, steps, source: 'manual', client_id: generateClientId() }, { onConflict: 'profile_id,date' })
    .select()
    .single()
  if (error) throw error
  return data as DailyStepsRow
}

/**
 * Put a day's step count back the way it was — the undo half of the chat door.
 *
 * NOT A DELETE, which is what water's undo does. That difference is forced by
 * the table: water_logs is append-only so undoing a chat log means removing
 * the row it just added, while daily_steps holds ONE row per day and the
 * write above REPLACES it. Undoing a correction of 6,240 -> 9,240 by deleting
 * the row would throw away the 6,240 the user never touched.
 *
 * `previous === null` means there was no row before, and then a delete IS
 * right: writing 0 would assert "you walked none today", which is a different
 * claim from "nothing recorded yet" even though both draw an empty ring.
 */
export async function restoreStepsForDate(
  profileId: string,
  date: string,
  previous: number | null,
): Promise<void> {
  if (previous === null) {
    const { error } = await supabase
      .from('daily_steps')
      .delete()
      .eq('profile_id', profileId)
      .eq('date', date)
    if (error) throw error
    return
  }
  await logStepsManual(profileId, date, previous)
}

// ---------------------------------------------------------------------------
// Steps from the phone (20 Nov 2026): the two small facts Home needs on its first draw live here, so Home does not
// pull the phone-reading code (health-steps.ts) into the website's first download. That module is loaded only inside
// the phone app.
// ---------------------------------------------------------------------------
export const HEALTH_STEPS_CONNECTED_KEY = 'fitplan_health_steps_connected'

/** He switched "Steps from your phone" on, on this phone. */
export function isHealthStepsConnected(): boolean {
  try { return localStorage.getItem(HEALTH_STEPS_CONNECTED_KEY) === '1' } catch { return false }
}

/** The small line under Home's steps ring, naming where the number came from. Null for a typed number. */
export function stepsSourceLine(row: Pick<DailyStepsRow, 'source'> | null): string | null {
  if (!row) return null
  if (row.source === 'healthkit') return 'From Apple Health'
  if (row.source === 'health_connect') return 'From Health Connect'
  return null
}

/** Is this the phone app? Read off the native shell's own global, so the website never imports Capacitor to ask. */
export function isPhoneApp(): boolean {
  if ((globalThis as { __healthAdapterForTest?: unknown }).__healthAdapterForTest !== undefined) {
    return (globalThis as { __healthAdapterForTest?: unknown }).__healthAdapterForTest != null
  }
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/** Which phone this is, or null in a browser. Synchronous, so Profile can decide its rows without loading anything. */
export function phonePlatform(): 'ios' | 'android' | null {
  const fake = (globalThis as { __healthAdapterForTest?: { platform: 'ios' | 'android' } | null }).__healthAdapterForTest
  if (fake !== undefined) return fake?.platform ?? null
  if (!isPhoneApp()) return null
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return cap?.getPlatform?.() === 'android' ? 'android' : 'ios'
}
