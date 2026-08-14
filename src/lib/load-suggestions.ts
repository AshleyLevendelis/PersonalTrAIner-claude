// ---------------------------------------------------------------------------
// VISION.md Step 6 — the last third of "A coach notices that someone always
// fails the last set, skips every Friday, or consistently beats the
// target — and adjusts." Step 4 (block-review.ts) covers "always fails."
// Step 5 (block-consistency.ts) covers "skips every Friday." This covers
// the opposite pattern: a main lift's real logged performance consistently
// beat what the block prescribed, meaning the formula's own baseline for
// the next block is probably too conservative.
//
// Unlike Steps 4/5, this NEVER auto-applies. Ashley's own reasoning: "a
// wrong hold costs nothing — the user just logs heavier and it self-
// corrects. A wrong bump means someone attempts a load they haven't
// earned, which is a failed rep and possibly form breakdown under a bar."
// It also can't tell whether "beat every target" means genuinely stronger,
// a starting weight that was too light, or reps cut short — the trainee
// knows that, the app doesn't. So this only ever proposes, names the real
// numbers, and applies exclusively on an explicit confirm. A decline is
// permanent per exercise — never asked again, the same weight as a banned
// exercise staying banned.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, Exercise, UserProfile } from './types'
import { getActiveMesocycleWeek } from './calculations'
import { getBlockDateRange, toProgressPoint, improved, lastLoggedWeight, MIN_SESSIONS_TO_JUDGE, type BlockProgressPoint } from './block-review'
import { getExerciseHistory, type ExerciseHistorySession } from './exercise-history'
import { getExerciseId, getExerciseEntry } from './exercise-db'
import { isMainLiftSlot } from './mesocycle-edit'
import { prescribeLoad } from './load-prescription'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { supabase } from './supabase'

export interface LoadSuggestionRow {
  id: string
  profile_id: string
  exercise_id: string
  exercise_name: string
  block_number: number
  day_name: string
  exercise_index: number
  current_weight_kg: number
  proposed_weight_kg: number
  status: 'pending' | 'confirmed' | 'declined'
  created_at: string
  resolved_at: string | null
}

/**
 * The stall check's own comparator, aggregated the other way: MOST
 * consecutive real-session comparisons (not literally every one) must show
 * genuine improvement. Ashley's own correction on why "most" and not
 * "every": once this only ever suggests (never auto-applies), the confirm
 * step itself carries the safety margin — a false positive here just costs
 * a declined suggestion, not a bad rep. Same MIN_SESSIONS_TO_JUDGE floor as
 * the stall check, for the same reason: two sessions is one comparison,
 * and a single good day would look identical to a real pattern.
 */
export function didExerciseOverachieveInBlock(sessionsInBlock: ExerciseHistorySession[]): boolean {
  if (sessionsInBlock.length < MIN_SESSIONS_TO_JUDGE) return false

  const points: BlockProgressPoint[] = [...sessionsInBlock].sort((a, b) => a.date.localeCompare(b.date)).map(toProgressPoint)
  const comparisons = points.slice(1).map((point, i) => improved(points[i], point))
  const improvedCount = comparisons.filter(Boolean).length

  return improvedCount > comparisons.length / 2
}

export interface PendingLoadSuggestion {
  id: string
  exerciseName: string
  currentWeightKg: number
  proposedWeightKg: number
  text: string
}

/** Pure — only ever propose UP. If the formula's own new-block number already matches or beats what was really lifted, there's nothing to suggest. */
export function shouldSuggestBump(proposedWeightKg: number, currentWeightKg: number): boolean {
  return proposedWeightKg > currentWeightKg
}

function suggestionText(exerciseName: string, currentKg: number, proposedKg: number): string {
  return `You've consistently hit the top of your range on ${exerciseName} — if those reps have been clean, want to start at ${proposedKg}kg instead of ${currentKg}kg next block?`
}

export interface LoadSuggestionCheckResult {
  suggestions: PendingLoadSuggestion[]
}

/**
 * Check-on-load sweep — same block-boundary timing as checkForBlockReview
 * and checkForConsistencyHold (week_in_block === 1 of a block after the
 * first), run as their sibling in App.tsx. Never patches or saves the
 * mesocycle itself; only reads real history, and inserts/reads
 * `load_suggestions` rows. Main lifts only, mirroring block-review.ts's own
 * scoping — this is a load-progression concept, not a whole-plan one.
 */
export async function checkForLoadSuggestions(
  profileId: string,
  mesocycle: MesocycleWeek[],
  _profile: UserProfile,
  planCreatedAt: string,
  now: Date,
): Promise<LoadSuggestionCheckResult> {
  if (mesocycle.length === 0) return { suggestions: [] }

  const totalWeeks = mesocycle.length
  const liveWeek = getActiveMesocycleWeek(planCreatedAt, now, totalWeeks)
  const currentWeek = mesocycle.find(w => w.week_number === liveWeek)
  if (!currentWeek || currentWeek.block_number == null || currentWeek.block_number <= 1 || currentWeek.week_in_block !== 1) {
    return { suggestions: [] }
  }

  const previousBlockNumber = currentWeek.block_number - 1
  const { start, end } = getBlockDateRange(planCreatedAt, previousBlockNumber)

  const suggestions: PendingLoadSuggestion[] = []

  for (const day of currentWeek.days) {
    for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
      const ex = day.exercises[exIndex]
      if (!isMainLiftSlot(ex)) continue
      if (ex.suggested_load_kg == null) continue

      const exerciseId = ex.id ?? getExerciseId(ex.name)

      // Permanent decline check — across every past block, not just this one.
      const { data: declinedRows } = await supabase
        .from('load_suggestions')
        .select('id')
        .eq('profile_id', profileId)
        .eq('exercise_id', exerciseId)
        .eq('status', 'declined')
        .limit(1)
      if (declinedRows && declinedRows.length > 0) continue

      // Already assessed for THIS block boundary — return the existing
      // pending row (so it keeps showing until answered) rather than
      // re-scanning history and possibly inserting a duplicate.
      const { data: existingRows } = await supabase
        .from('load_suggestions')
        .select('*')
        .eq('profile_id', profileId)
        .eq('exercise_id', exerciseId)
        .eq('block_number', currentWeek.block_number)
        .limit(1)
      const existing = (existingRows?.[0] as LoadSuggestionRow | undefined)
      if (existing) {
        if (existing.status === 'pending') {
          suggestions.push({
            id: existing.id,
            exerciseName: existing.exercise_name,
            currentWeightKg: existing.current_weight_kg,
            proposedWeightKg: existing.proposed_weight_kg,
            text: suggestionText(existing.exercise_name, existing.current_weight_kg, existing.proposed_weight_kg),
          })
        }
        continue
      }

      const allSessions = await getExerciseHistory(profileId, exerciseId)
      const sessionsInBlock = allSessions.filter(s => s.date >= start && s.date < end)
      if (!didExerciseOverachieveInBlock(sessionsInBlock)) continue

      const proposedWeightKg = lastLoggedWeight(sessionsInBlock)
      const currentWeightKg = ex.suggested_load_kg
      if (!shouldSuggestBump(proposedWeightKg, currentWeightKg)) continue

      const { data: inserted, error: insertErr } = await supabase
        .from('load_suggestions')
        .insert({
          profile_id: profileId,
          exercise_id: exerciseId,
          exercise_name: ex.name,
          block_number: currentWeek.block_number,
          day_name: day.day,
          exercise_index: exIndex,
          current_weight_kg: currentWeightKg,
          proposed_weight_kg: proposedWeightKg,
        })
        .select()
        .single()
      // A concurrent insert (two near-simultaneous app-opens) trips the
      // unique constraint — not an error worth surfacing, just skip; the
      // other caller's row already represents this suggestion.
      if (insertErr || !inserted) continue

      const row = inserted as LoadSuggestionRow
      suggestions.push({
        id: row.id,
        exerciseName: row.exercise_name,
        currentWeightKg: row.current_weight_kg,
        proposedWeightKg: row.proposed_weight_kg,
        text: suggestionText(row.exercise_name, row.current_weight_kg, row.proposed_weight_kg),
      })
    }
  }

  return { suggestions }
}

/**
 * Applies a confirmed suggestion — same forceStartingWeightKg mechanism
 * block-review.ts's stall-hold already uses, just going up instead of
 * down, and gated behind this explicit call (a button tap) rather than the
 * check-on-load sweep itself. Patches every week of the suggestion's own
 * block, matched by day + exercise INDEX (not name — mirrors block-
 * review.ts's own day/exIndex targeting) with a name guard against index
 * drift from an unrelated swap in between.
 */
export async function confirmLoadSuggestion(
  suggestionId: string,
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  profileId: string,
): Promise<MesocycleWeek[] | null> {
  const { data: row } = await supabase.from('load_suggestions').select('*').eq('id', suggestionId).maybeSingle()
  if (!row || row.status !== 'pending') return null
  const suggestion = row as LoadSuggestionRow

  const entry = getExerciseEntry(suggestion.exercise_name)
  if (!entry) return null

  const anchorWeek = mesocycle.find(w => w.block_number === suggestion.block_number)
  const anchorDay = anchorWeek?.days.find(d => d.day === suggestion.day_name)
  const anchorEx = anchorDay?.exercises[suggestion.exercise_index]
  if (!anchorEx || anchorEx.name !== suggestion.exercise_name) return null

  const load = prescribeLoad(entry, profile, {
    targetRpeLabel: anchorEx.intensity || '',
    isFirstBlock: false,
    sets: anchorEx.sets,
    repRangeLabel: anchorEx.reps,
    forceStartingWeightKg: suggestion.proposed_weight_kg,
  })

  const patchedWeeks = mesocycle
    .filter(w => w.block_number === suggestion.block_number)
    .map(week => {
      const targetDay = week.days.find(d => d.day === suggestion.day_name)
      const targetEx = targetDay?.exercises[suggestion.exercise_index]
      if (!targetDay || !targetEx || targetEx.name !== suggestion.exercise_name) return week
      const patchedEx: Exercise = {
        ...targetEx,
        suggested_load: load.display,
        suggested_load_kg: load.starting_weight_kg,
        per_set_load: load.per_set,
        load_guidance: load.basis,
      }
      const days = week.days.map(d => (d.day === suggestion.day_name ? { ...d, exercises: d.exercises.map((e, i) => (i === suggestion.exercise_index ? patchedEx : e)) } : d))
      return { ...week, days }
    })

  await Promise.all(patchedWeeks.map(w => saveMesocycleWeek(profileId, w)))
  await supabase.from('load_suggestions').update({ status: 'confirmed', resolved_at: new Date().toISOString() }).eq('id', suggestionId)

  const patchedByWeekNumber = new Map(patchedWeeks.map(w => [w.week_number, w]))
  return mesocycle.map(w => patchedByWeekNumber.get(w.week_number) ?? w)
}

/** Declining is permanent for this exercise — checkForLoadSuggestions' own declined-row check skips it forever after this. */
export async function declineLoadSuggestion(suggestionId: string): Promise<void> {
  await supabase.from('load_suggestions').update({ status: 'declined', resolved_at: new Date().toISOString() }).eq('id', suggestionId)
}
