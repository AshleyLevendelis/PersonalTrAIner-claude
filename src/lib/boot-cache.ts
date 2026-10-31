// ---------------------------------------------------------------------------
// THE APP AS IT WAS WHEN IT WAS LAST OPEN, KEPT ON THE PHONE — 31 Oct 2026. Ashley: "When I first open the app, it
// takes a few seconds to load ... make it load quicker, and not show that loading as soon as you open it."
//
// Measured (verify:app-boot, every database answer 300 ms): even with every start-up read asked for at once, the
// app cannot draw anything until one round trip has come back, so "Loading your plan..." was on screen for every
// open. A phone that has opened the app before already knows the answer: the profile, the plan, the meals, the
// targets and the weigh-ins it drew last time. So the app draws those at once and asks the server behind them;
// when the answers land they replace what was drawn, the way Home's own snapshot of the day already works
// (dashboard-cache.ts).
//
// WHAT IT NEVER DOES:
//   - It is never read for a profile this phone is not holding (the stored profile id must match), so a New Plan, a
//     different account or a cleared phone starts the honest way, from the server.
//   - It never replaces something changed on screen while the refresh was out: App swaps the fresh copy in only
//     where the value on screen is still the one drawn from here.
//   - A failed refresh does not wipe it. A plan that "comes back empty" while one was drawn is a read that failed,
//     not a deleted plan (New Plan clears the stored id, so it never reaches here).
//
// Storage that fails or is full answers "nothing kept" and the app starts as it did before this existed.
// ---------------------------------------------------------------------------
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from './types'
import type { UserFactRow } from './memory-store'
import type { MealSlotName } from './meal-store'
import type { PoolOption } from './meal-generation'

export interface BootSnapshot {
  v: 1
  savedAt: string
  profile: UserProfile
  facts: UserFactRow[]
  exclusions: string[]
  macros: MacroTargets | null
  latestWeightKg: number | null
  targetWeightAnchorKg: number | null
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  mesocycleCreatedAt: string | null
  pools: Partial<Record<MealSlotName, PoolOption[]>>
}

const KEY = 'fitplan_boot_v1'
/** Well under the 5 MB most phones give a site, so this can never crowd out the logs that matter more. */
const MAX_CHARS = 1_500_000

export function readBootSnapshot(storedProfileId: string | null): BootSnapshot | null {
  if (!storedProfileId) return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<BootSnapshot> | null
    // Shape check, so a copy written by an older build cannot crash the first render.
    // ONE test of whose copy it is: the profile inside it. (A second, the id it was filed under, said the same thing;
    // a mutation found it could never decide anything, so it went.)
    if (!s || s.v !== 1) return null
    if (!s.profile || s.profile.id !== storedProfileId || !Array.isArray(s.mesocycle) || !Array.isArray(s.exercisePlan)) return null
    if (!Array.isArray(s.facts) || !Array.isArray(s.exclusions) || !s.pools || typeof s.pools !== 'object') return null
    return s as BootSnapshot
  } catch {
    return null
  }
}

/** New Plan: the old plan's copy goes with it. */
export function clearBootSnapshot(): void {
  try { localStorage.removeItem(KEY) } catch { /* nothing to do */ }
}

/** False when it could not be kept (no storage, full, or too big); the next open then starts from the server. */
export function saveBootSnapshot(snapshot: Omit<BootSnapshot, 'v' | 'savedAt'>): boolean {
  try {
    const text = JSON.stringify({ v: 1, savedAt: new Date().toISOString(), ...snapshot })
    if (text.length > MAX_CHARS) { localStorage.removeItem(KEY); return false }
    localStorage.setItem(KEY, text)
    return true
  } catch {
    try { localStorage.removeItem(KEY) } catch { /* nothing to do */ }
    return false
  }
}
