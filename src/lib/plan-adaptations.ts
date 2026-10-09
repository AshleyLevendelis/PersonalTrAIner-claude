// ---------------------------------------------------------------------------
// Pure substitution logic for time-bounded plan adaptations (injury +
// equipment/travel) — no I/O, mirrors mesocycle-edit.ts's own contract
// exactly and reuses its helpers (clearOrphanedSupersetLabels,
// applyReplacement, recomputeLoad, getReplacementCandidates, isMainLiftSlot)
// rather than re-deriving any of them. Bounded by an explicit list of PLAN
// DAYS worked out from dates (plan-guard.ts), never a week range: a week was
// the smallest thing this could address until 9 Oct 2026, which is how a
// 14-day change rewrote four days already trained and missed its last three.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, Exercise, UserProfile, EquipmentAccess, WorkoutDay } from './types'
import { getExerciseEntry, isContraindicatedFor } from './exercise-db'
import { getFlaggedJoints, isEquipmentAllowed } from './exercise-plan'
import {
  pickAutomaticReplacement,
  buildReplacementSlot,
  clearOrphanedSupersetLabels,
  isMainLiftSlot,
} from './mesocycle-edit'
import { settleWeek } from './settle-week'
import {
  comparePlanDays, planWeeksOnDate, weekdayIndex, NOTHING_TRAINED,
  type DayGuard, type PlanCalendar, type PlanDayOnDate, type PlanDayRef,
} from './plan-guard'
import { addDays } from './session-move'
import { constraintProfile, NO_ACTIVE_ADAPTATIONS, type EffectiveConstraints } from './effective-constraints'
import { travelProfile } from './kit-list'

/**
 * WHAT EVERY PATH THAT REPLACES DAYS OF A LIVE PLAN MUST KNOW, and is not
 * allowed to run without: which days have already been trained, what the
 * person is temporarily working around, and what today is.
 *
 * REQUIRED on purpose, never defaulted. Until 9 Oct 2026 an adaptation and
 * every rebuild offer took week numbers and nothing else, so each of them
 * rewrote the days of the current week the person had already trained, and
 * none of them knew another adaptation was running. A parameter that can be
 * left out is how that happens again; the compiler now refuses the call.
 * Loaded by `loadPlanEditContext` (plan-edit-context.ts).
 */
export interface PlanEditContext {
  /** True for a plan row already trained. Nothing rewrites one. */
  isProtected: DayGuard
  /** Temporary injuries and kit laid over the profile when a pool is built. */
  constraints: EffectiveConstraints
  /** Today on the app's clock, the plan's start, and any moved sessions. */
  calendar: PlanCalendar
  /** The day the last active temporary injury change ends (YYYY-MM-DD), or null. */
  constrainedUntil: string | null
}

/**
 * For gates, and for a plan nobody has trained on. A live plan loads the real
 * one; `test:adaptations-respect-trained` fails if `src/` names this outside
 * this file.
 */
export function untrainedPlanContext(calendar: PlanCalendar): PlanEditContext {
  return { isProtected: NOTHING_TRAINED, constraints: NO_ACTIVE_ADAPTATIONS, calendar, constrainedUntil: null }
}

export interface TouchedSlot {
  weekNumber: number
  dayName: string
  /** Where the slot sat in the session before the change. */
  position: number
  before: string
  after: string | null
  /** Why this row is not a like-for-like swap, when it is not. Printed on the card. */
  note?: string
}

/** One day an adaptation changed: exactly what it was, and what was left on it. */
export interface AdaptationDayChange {
  weekNumber: number
  dayName: string
  /** The day as it stood before, whole. */
  was: WorkoutDay
  /** The exercise names the adaptation left on the day, in order. */
  became: string[]
  /** Each slot it changed. Empty when the day was rebuilt whole. */
  slots: { position: number; was: Exercise; became: string | null }[]
}

/**
 * What is stored with an adaptation (`plan_adaptations.pre_image`) so that
 * ending it puts back what IT changed and nothing else. Before 9 Oct 2026 the
 * column held whole weeks, and ending wrote them back over anything the
 * person had done to those weeks since. `revertAdaptationChanges` reads both.
 */
export interface AdaptationRecord {
  version: 2
  /** Every plan row the adaptation covers, with its date. */
  days: PlanDayOnDate[]
  changes: AdaptationDayChange[]
}

export function isAdaptationRecord(value: unknown): value is AdaptationRecord {
  return !!value && !Array.isArray(value) && (value as { version?: unknown }).version === 2
}

export interface SubstitutionResult {
  mesocycle: MesocycleWeek[]
  /** Sorted by week, weekday, then position — the one order the card and the receipt both print. */
  touchedSlots: TouchedSlot[]
  /**
   * Movement patterns that lost a slot with nothing to put in its place — the
   * signal `assessAdaptation` reads to say a rebuild would serve better than
   * a patch. Unchanged in meaning: every dropped slot counts, including an
   * isolation slot left out rather than filled with unrelated work.
   */
  droppedPatterns: string[]
  /** What ending this change would need to put back. */
  changes: AdaptationDayChange[]
}

const ROW_NOTES = {
  off_style: 'Outside your usual style. Nothing in your style fits this slot right now.',
  nearest: 'The closest movement that fits.',
  dropped_isolation: 'Nothing related fits, so this one is left out rather than filled with different work.',
} as const

/**
 * Keeps every day that must not change exactly as it was (the same object),
 * and takes the rest from `next`. Used after anything that works on a whole
 * week, so "protected" is a property of the result and not of each step.
 */
function keepDays(original: MesocycleWeek, next: MesocycleWeek, mayChange: (dayName: string) => boolean): MesocycleWeek {
  const names = [...new Set([...original.days.map(d => d.day), ...next.days.map(d => d.day)])]
    .sort((a, b) => weekdayIndex(a) - weekdayIndex(b))
  const days: WorkoutDay[] = []
  for (const name of names) {
    const before = original.days.find(d => d.day === name)
    const after = next.days.find(d => d.day === name)
    const chosen = mayChange(name) ? after : before
    if (chosen) days.push(chosen)
  }
  return { ...next, days }
}

async function substituteSlots(
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  targetDays: PlanDayRef[],
  exclusions: string[],
  conflicts: (slot: Exercise) => boolean,
  candidateProfile: UserProfile,
  context: PlanEditContext,
): Promise<SubstitutionResult> {
  // RULE 1, at the one place slots are replaced: a day already trained is not
  // a target, whoever asked.
  const targets = new Set(
    targetDays.filter(d => !context.isProtected(d.weekNumber, d.dayName)).map(d => `${d.weekNumber}|${d.dayName}`),
  )
  const touchedSlots: TouchedSlot[] = []
  const droppedPatterns: string[] = []
  const changes: AdaptationDayChange[] = []

  const weeks = await Promise.all(mesocycle.map(async week => {
    const isTarget = (dayName: string) => targets.has(`${week.week_number}|${dayName}`)
    if (!week.days.some(d => isTarget(d.day))) return week

    // DAYS IN ORDER WITHIN A WEEK, SLOTS IN ORDER WITHIN A DAY. Both orders
    // carry information the next pick reads: a slot must not take a movement
    // already on its day (measured before this was sequential: 28 duplicate
    // placements for a shoulder injury), and a day should not take the
    // substitute the previous leg day just took when a fresh one exists.
    const usedThisWeek = new Set<string>()
    const changedDays: string[] = []
    const days: WorkoutDay[] = []
    for (const day of week.days) {
      if (!isTarget(day.day)) { days.push(day); continue }
      const onDay = new Set(day.exercises.filter(e => !conflicts(e)).map(e => e.name))
      const exercises: (Exercise | null)[] = []
      const slots: AdaptationDayChange['slots'] = []

      for (const [position, slot] of day.exercises.entries()) {
        if (!conflicts(slot)) { exercises.push(slot); continue }
        const entry = getExerciseEntry(slot.name)
        if (!entry) { exercises.push(slot); continue }

        const pick = pickAutomaticReplacement(slot.name, candidateProfile, exclusions, onDay, usedThisWeek)
        if (!pick) {
          // Dropping is the honest outcome — a session listing the same lift
          // twice, or a squat where a kickback was, is not an extra exercise.
          const isolation = entry.mechanics_tier === 'tier3_isolation' || entry.movement_pattern.startsWith('isolation_')
          touchedSlots.push({
            weekNumber: week.week_number, dayName: day.day, position, before: slot.name, after: null,
            note: isolation ? ROW_NOTES.dropped_isolation : undefined,
          })
          droppedPatterns.push(slot.movement_pattern ?? entry.movement_pattern)
          slots.push({ position, was: slot, became: null })
          exercises.push(null)
          continue
        }

        onDay.add(pick.exercise.name)
        usedThisWeek.add(pick.exercise.name)
        const replaced = await buildReplacementSlot(slot, pick.exercise, profile, week, isMainLiftSlot(slot))
        touchedSlots.push({
          weekNumber: week.week_number, dayName: day.day, position, before: slot.name, after: pick.exercise.name,
          note: pick.kind === 'off_style' ? ROW_NOTES.off_style
            : pick.kind === 'nearest' ? ROW_NOTES.nearest
            : pick.kind === 'cross' ? (pick.note || undefined)
            : undefined,
        })
        slots.push({ position, was: slot, became: pick.exercise.name })
        exercises.push(replaced)
      }

      if (slots.length === 0) { days.push(day); continue }
      changedDays.push(day.day)
      const kept = exercises.filter((e): e is Exercise => e !== null)
      days.push({ ...day, exercises: clearOrphanedSupersetLabels(kept) })
      changes.push({ weekNumber: week.week_number, dayName: day.day, was: day, became: [], slots })
    }
    if (changedDays.length === 0) return week

    // THE SHARED TAIL (CLAUDE.md rule 3, "adjustment keeps the bar"): warm-up
    // rebuilt for the exercises now on the day, set hierarchy, one weight per
    // lift. Swap, ban, move and volume changes have ended here since 13 Sep
    // 2026; adaptations did not. Settled against the CANDIDATE profile, so the
    // warm-up it builds respects the area being eased off.
    let settled: MesocycleWeek = { ...week, days }
    for (const dayName of changedDays) settled = settleWeek(settled, dayName, candidateProfile).week
    // ...and its week-level passes are not allowed to reach a day this change
    // was not aimed at: a trained day, or one outside the window.
    const result = keepDays({ ...week, days }, settled, name => changedDays.includes(name))
    for (const change of changes) {
      if (change.weekNumber !== week.week_number) continue
      change.became = result.days.find(d => d.day === change.dayName)?.exercises.map(e => e.name) ?? []
    }
    return result
  }))

  touchedSlots.sort(comparePlanDays)
  changes.sort(comparePlanDays)
  return { mesocycle: weeks, touchedSlots, droppedPatterns, changes }
}

export interface SubstituteForInjuryParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  injuryCode: string
  /** The plan rows to change — from `planDaysInWindow`, never a week range. */
  targetDays: PlanDayRef[]
  exclusions: string[]
  context: PlanEditContext
}

/**
 * For each slot on the given days whose exercise loads a joint flagged by
 * injuryCode, finds a same-constraint-pool replacement that doesn't — the
 * candidate pool is filtered against a LOCAL profile clone with injuryCode
 * added to `injuries` (never written to the real profile, so
 * test:injury-separation's guarantees hold: this function never touches
 * fitness_profiles.injuries), on top of anything else the person is
 * temporarily working around. No candidate -> the slot is dropped rather than
 * leaving the injury-conflicting exercise in place.
 */
export async function substituteForInjury(params: SubstituteForInjuryParams): Promise<SubstitutionResult> {
  const { mesocycle, profile, injuryCode, targetDays, exclusions, context } = params
  const flaggedJoints = getFlaggedJoints([injuryCode])
  const base = constraintProfile(profile, context.constraints)
  const candidateProfile: UserProfile = base.injuries.includes(injuryCode) ? base : { ...base, injuries: [...base.injuries, injuryCode] }

  const conflicts = (slot: Exercise): boolean => {
    const entry = getExerciseEntry(slot.name)
    if (!entry) return false
    // Contraindication, not participation — a rehab movement for the injured
    // joint must NOT be substituted away. See exercise-db.ts's three-state tag.
    return isContraindicatedFor(entry, flaggedJoints)
  }

  return substituteSlots(mesocycle, profile, targetDays, exclusions, conflicts, candidateProfile, context)
}

/** A whole-day change (a rebuild) as the record an adaptation stores. */
export function dayChangesBetween(before: MesocycleWeek[], after: MesocycleWeek[]): AdaptationDayChange[] {
  const changes: AdaptationDayChange[] = []
  for (const week of before) {
    const next = after.find(w => w.week_number === week.week_number)
    if (!next || next === week) continue
    for (const day of week.days) {
      const now = next.days.find(d => d.day === day.day)
      if (now === day) continue
      changes.push({ weekNumber: week.week_number, dayName: day.day, was: day, became: now?.exercises.map(e => e.name) ?? [], slots: [] })
    }
  }
  return changes.sort(comparePlanDays)
}

/** What ending an adaptation did, for the caller to save and to say. */
export interface RevertOutcome {
  mesocycle: MesocycleWeek[]
  changedWeeks: number[]
  /** Days put back exactly as they were. */
  restoredDays: number
  /** Days where the person's own later edit was kept. */
  keptEdits: number
}

/**
 * RULE 4 — ENDING PUTS BACK WHAT THE ADAPTATION CHANGED, AND ONLY THAT.
 *
 * A day nobody has touched since goes back exactly as it was. On a day the
 * person has edited since, each slot is put back only if it still holds what
 * the adaptation put there; a slot they have swapped, banned or removed keeps
 * their edit. A day already trained is never touched: what was logged was
 * logged against what the day showed.
 *
 * This is the plan's owner question 4, built as its recommended answer (B) and
 * recorded as decided unprompted and reversible.
 *
 * `stored` is either the record (written since 9 Oct 2026) or the whole weeks
 * older rows hold. For the old shape there is no list of what the adaptation
 * changed, so it is worked out: a slot is put back only where the exercise it
 * held is one this adaptation would have removed (`wouldHaveRemoved`), is not
 * already on the day, and is not something the person has since banned.
 */
export function revertAdaptationChanges(
  mesocycle: MesocycleWeek[],
  stored: AdaptationRecord | MesocycleWeek[],
  affectedWeekNumbers: number[],
  isProtected: DayGuard,
  profile: UserProfile,
  wouldHaveRemoved: (slot: Exercise) => boolean,
  exclusions: string[] = [],
): RevertOutcome {
  const banned = new Set(exclusions.map(e => e.toLowerCase()))
  const changes: AdaptationDayChange[] = isAdaptationRecord(stored)
    ? stored.changes
    : (Array.isArray(stored) ? stored : [])
        .filter(week => affectedWeekNumbers.includes(week.week_number))
        .flatMap(week => week.days.map(day => ({
          weekNumber: week.week_number, dayName: day.day, was: day, became: [] as string[],
          slots: day.exercises
            .map((was, position) => ({ position, was, became: null as string | null }))
            .filter(s => wouldHaveRemoved(s.was)),
        })))
        .filter(c => c.slots.length > 0)
  const legacy = !isAdaptationRecord(stored)

  let restoredDays = 0
  let keptEdits = 0
  const changedWeeks = new Set<number>()
  const next = mesocycle.map(week => {
    const mine = changes.filter(c => c.weekNumber === week.week_number && !isProtected(c.weekNumber, c.dayName))
    if (mine.length === 0) return week
    let working = week
    const settle: string[] = []
    for (const change of mine) {
      const day = working.days.find(d => d.day === change.dayName)
      if (!day) { keptEdits++; continue }
      const names = day.exercises.map(e => e.name)
      const untouched = !legacy && names.length === change.became.length && names.every((n, i) => n === change.became[i])
      if (untouched) {
        working = { ...working, days: working.days.map(d => (d.day === change.dayName ? change.was : d)) }
        restoredDays++
        changedWeeks.add(week.week_number)
        continue
      }
      if (change.slots.length === 0) { keptEdits++; continue }
      const exercises = [...day.exercises]
      let put = 0
      for (const slot of change.slots) {
        if (exercises.some(e => e.name === slot.was.name)) continue
        if (banned.has(slot.was.name.toLowerCase())) continue
        if (legacy) {
          // No record of what replaced it. Put it back in its old place only
          // when that place now holds something that was not there before.
          const before = new Set(change.was.exercises.map(e => e.name))
          const at = exercises[slot.position]
          if (at && !before.has(at.name)) { exercises[slot.position] = slot.was; put++ }
          else if (!at || exercises.length < change.was.exercises.length) { exercises.splice(Math.min(slot.position, exercises.length), 0, slot.was); put++ }
          continue
        }
        if (slot.became === null) {
          exercises.splice(Math.min(slot.position, exercises.length), 0, slot.was)
          put++
          continue
        }
        const at = exercises.findIndex(e => e.name === slot.became)
        if (at !== -1) { exercises[at] = slot.was; put++ }
      }
      if (put < change.slots.length) keptEdits++
      if (put === 0) continue
      working = { ...working, days: working.days.map(d => (d.day === change.dayName ? { ...d, exercises: clearOrphanedSupersetLabels(exercises) } : d)) }
      settle.push(change.dayName)
      changedWeeks.add(week.week_number)
    }
    if (settle.length === 0) return working
    let settled = working
    for (const dayName of settle) settled = settleWeek(settled, dayName, profile).week
    return keepDays(working, settled, name => settle.includes(name))
  })
  return { mesocycle: next, changedWeeks: [...changedWeeks].sort((a, b) => a - b), restoredDays, keptEdits }
}

/** The "would this adaptation have removed that exercise" test, for an old stored row. */
export function adaptationConflictTest(kind: 'injury' | 'equipment', injuryCode: string | null, equipmentTier: string | null): (slot: Exercise) => boolean {
  if (kind === 'injury' && injuryCode) {
    const joints = getFlaggedJoints([injuryCode])
    return slot => { const entry = getExerciseEntry(slot.name); return !!entry && isContraindicatedFor(entry, joints) }
  }
  if (kind === 'equipment' && equipmentTier) {
    return slot => { const entry = getExerciseEntry(slot.name); return !!entry && !isEquipmentAllowed(entry, equipmentTier as EquipmentAccess) }
  }
  return () => false
}

/**
 * How much of the plan a pointwise substitution would destroy.
 *
 * Pointwise substitution assumes the injury removes SOME exercises. When it
 * removes whole movement patterns — a shoulder injury eliminates every
 * horizontal push, vertical push and vertical pull in the pool — there is no
 * same-pattern candidate for any of those slots by construction, so every one
 * of them gets dropped and the user is left with a hollow plan. Measured on a
 * real full_gym profile: 146 of ~190 slots removed, none substituted.
 *
 * A coach in that situation doesn't delete two thirds of the programme and
 * hand back the remains — they rebuild the week around what the person CAN
 * train. This is the signal for that.
 */
export interface AdaptationViability {
  /** Slots that would be changed at all. */
  touched: number
  /** Slots that would be dropped with no replacement. */
  dropped: number
  /** Movement patterns with no surviving candidate anywhere in the pool. */
  wipedPatterns: string[]
  /** Dropped slots as a fraction of the ENTIRE programme — what the user actually loses. */
  planLossRatio: number
  /** True when dropping is doing most of the work — rebuild instead. */
  shouldRebuild: boolean
}

/**
 * How much of the WHOLE plan the substitution would delete.
 *
 * Measuring against slots-touched was the obvious first cut and it's wrong:
 * a neck injury touches 16 slots and drops all 16, scoring a perfect 1.0,
 * but that's under 4% of a 432-slot programme — rebuilding the entire
 * mesocycle over it would destroy the user's plan to fix a rounding error.
 * A shoulder injury drops 96 of 432 (22%), which genuinely is the plan no
 * longer being the plan. The denominator has to be the whole programme,
 * because that's what the user actually loses.
 */
export const REBUILD_PLAN_LOSS_RATIO = 0.15

export function assessAdaptation(result: SubstitutionResult, totalSlots: number): AdaptationViability {
  const touched = result.touchedSlots.length
  const dropped = result.touchedSlots.filter(s => s.after === null).length
  const wipedPatterns = [...new Set(result.droppedPatterns)]
  return {
    touched,
    dropped,
    wipedPatterns,
    planLossRatio: totalSlots > 0 ? dropped / totalSlots : 0,
    // The ratio alone misses the exact case this function's own doc comment
    // describes: a wiped pattern means there is no same-pattern candidate
    // for those slots BY CONSTRUCTION, no matter how few slots that turns
    // out to be in raw count terms. A shoulder injury that wipes 'pull'
    // entirely, but only touches a small enough share of a large programme
    // to stay under the ratio threshold, still leaves the user with zero
    // pulling work — pointwise substitution can't fix that, only a rebuild
    // (which can re-plan the week's tracks around what's actually left) can.
    shouldRebuild: totalSlots > 0 && (dropped / totalSlots >= REBUILD_PLAN_LOSS_RATIO || wipedPatterns.length > 0),
  }
}

/** Total loaded+unloaded exercise slots in a mesocycle — the denominator for assessAdaptation. */
export function countSlots(mesocycle: MesocycleWeek[]): number {
  return mesocycle.reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.length, 0), 0)
}

export interface RebuildForInjuryParams {
  profile: UserProfile
  injuryCode: string
  exclusions: string[]
  /** Preserved from the outgoing mesocycle so week numbering/labels/blocks stay stable for anything referencing them. */
  mesocycle: MesocycleWeek[]
  /**
   * Only these plan rows are replaced; everything else is returned untouched.
   * A time-bounded adaptation passes its window, so the rebuild is exactly as
   * temporary as the adaptation is; a lasting injury passes every row from
   * today to the end of the plan.
   */
  targetDays: PlanDayRef[]
  context: PlanEditContext
}

/**
 * Regenerates the programme with the injury applied, instead of subtracting
 * from the existing one. Reuses the normal generation pipeline against a
 * profile clone carrying the injury, so the result is a coherent, balanced
 * week built for someone with that injury — including any movements marked
 * INDICATED for it (see exercise-db.ts's three-state joint tags), which is
 * why the rebuild can produce genuinely rehabilitative work rather than just
 * an absence of the dangerous stuff.
 *
 * The profile clone is local and never written back: the caller owns whether
 * fitness_profiles.injuries changes (executeLastingInjury does; the
 * time-bounded adaptation deliberately doesn't), and this function must not
 * quietly make that decision for it — the same separation
 * test:injury-separation protects.
 */
export async function rebuildForInjury(params: RebuildForInjuryParams): Promise<MesocycleWeek[]> {
  const { profile, injuryCode, exclusions, mesocycle, targetDays, context } = params
  const injuredProfile: UserProfile = {
    ...profile,
    injuries: profile.injuries.includes(injuryCode) ? profile.injuries : [...profile.injuries, injuryCode],
  }
  const wanted = new Set(targetDays.map(d => `${d.weekNumber}|${d.dayName}`))
  const weekNumbers = [...new Set(targetDays.map(d => d.weekNumber))]
  // A day outside the window is as untouchable to this rebuild as a trained one.
  const windowed: PlanEditContext = {
    ...context,
    isProtected: (weekNumber, dayName) => context.isProtected(weekNumber, dayName) || !wanted.has(`${weekNumber}|${dayName}`),
  }
  return rebuildAgainstProfile(injuredProfile, exclusions, mesocycle, weekNumbers, windowed)
}

/**
 * The shared half of every "regenerate rather than subtract" rebuild: run the
 * normal generation pipeline against a LOCAL profile clone and splice the
 * result into the live mesocycle, preserving week identity.
 *
 * Extracted when the weight-basis rebuild arrived, because it is the same
 * operation with a different clone — and the identity-preservation below is
 * the part that must not be re-derived per caller. Anything holding a week
 * reference (logged sets, an active session, the week strip, the load-
 * suggestion rows keyed by block_number) resolves through week_number and
 * block_number; a rebuild that renumbered them would orphan all of it while
 * looking perfectly correct in isolation.
 *
 * The clone is never written back. Whether the underlying profile row
 * changes is the CALLER's decision every time — executeLastingInjury writes
 * injuries, the time-bounded adaptation deliberately doesn't, and the
 * weight-basis rebuild must not touch weight_kg at all (it is formally the
 * immutable onboarding weight). The same separation
 * test:plan-adaptations-separation and test:injury-separation protect.
 *
 * THE SPLICE IS PER DAY, AND A TRAINED DAY IS NEVER SPLICED (9 Oct 2026).
 * It used to replace whole weeks, so "rebuild from this week onwards" — every
 * rebuild offer on Profile, the coach's own, the weight-basis and ceiling
 * rebuilds — rewrote the days of the current week already trained. One guard
 * here covers every caller, which is why `context` is not optional.
 *
 * AND IT KNOWS WHAT IS BEING EASED OFF. While a temporary injury change is
 * running, the weeks it reaches are generated against the profile WITH that
 * area flagged; weeks after it ends are generated against the profile alone.
 * Whole weeks, because generation balances a week as a unit: the days of the
 * adaptation's last week that fall after it ends stay cautious a few days
 * longer than asked. That is the safe direction, and it is stated here rather
 * than hidden.
 */
export async function rebuildAgainstProfile(
  clone: UserProfile,
  exclusions: string[],
  mesocycle: MesocycleWeek[],
  weekNumbers: number[] | undefined,
  context: PlanEditContext,
  /**
   * Makes generation REPRODUCIBLE for callers that run it twice and must get
   * the same answer both times — see rebuildForWeightBasis, which previews a
   * rebuild to show the trainee what they would be agreeing to and then runs
   * it again when they agree.
   *
   * Without this the two runs disagree: exercise selection shuffles, so the
   * preview could name a lift ("this would take Barbell Squats from 32.5kg to
   * 67.5kg") that the applied rebuild does not even contain. A flaky assertion
   * in test:weight-basis is what surfaced it — the check passed or failed by
   * luck depending on what Math.random happened to return.
   *
   * Omitted by the injury rebuild, which generates once and applies it, so it
   * has no second run to agree with and keeps its existing variety.
   */
  seedKey?: string,
): Promise<MesocycleWeek[]> {
  const targetWeeks = weekNumbers ? new Set(weekNumbers) : null
  const { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } = await import('./exercise-plan')
  const { seededRngFromKey } = await import('./seeded-random')

  const generate = (against: UserProfile): MesocycleWeek[] => {
    // Both generate* calls are synchronous, so the seeded window never spans an
    // await and cannot leak into unrelated generation happening elsewhere.
    if (seedKey) setRandomSource(seededRngFromKey(seedKey))
    try {
      const plan = generateExercisePlan(against, exclusions)
      return generateMesocycle(against, plan.plan)
    } finally {
      if (seedKey) resetRandomSource()
    }
  }

  // Which weeks an active temporary injury change still reaches.
  const cautiousProfile = constraintProfile(clone, { ...context.constraints, temporaryEquipment: null })
  const cautiousWeeks = new Set<number>()
  if (cautiousProfile !== clone && context.constrainedUntil) {
    for (let date = context.calendar.today; date <= context.constrainedUntil; date = addDays(date, 1)) {
      for (const w of planWeeksOnDate(context.calendar.planCreatedAt, date, mesocycle.length)) cautiousWeeks.add(w)
    }
  }
  const wanted = (n: number) => !targetWeeks || targetWeeks.has(n)
  const needsPlain = mesocycle.some(w => wanted(w.week_number) && !cautiousWeeks.has(w.week_number))
  const needsCautious = mesocycle.some(w => wanted(w.week_number) && cautiousWeeks.has(w.week_number))
  const plain = needsPlain ? generate(clone) : null
  const cautious = needsCautious ? generate(cautiousProfile) : null

  // Keep the outgoing week identity (numbers, labels, block boundaries) so
  // anything holding a week reference — logged sets, an active session, the
  // week strip — still resolves. Only the CONTENT is replaced, and only on
  // days nobody has trained.
  return mesocycle.map((original, i) => {
    if (!wanted(original.week_number)) return original
    const week = (cautiousWeeks.has(original.week_number) ? cautious : plain)?.[i]
    if (!week) return original
    const mayChange = (dayName: string) => !context.isProtected(original.week_number, dayName)
    const dayNames = [...new Set([...original.days.map(d => d.day), ...week.days.map(d => d.day)])]
    if (!dayNames.some(mayChange)) return original
    const identity = {
      ...week,
      week_number: original.week_number,
      block_number: original.block_number,
      label: original.label,
      phase_label: original.phase_label,
    }
    return keepDays(original, identity, mayChange)
  })
}

export interface RebuildForWeightBasisParams {
  profile: UserProfile
  /**
   * The weight to rebuild from — the rolling-average anchor
   * (getEffectiveTargetWeightKg), not a single raw reading. Overrides
   * profile.weight_kg on the LOCAL clone only; the profile row keeps its
   * onboarding weight, which is formally immutable (see nutrition-targets.ts).
   */
  basisWeightKg: number
  exclusions: string[]
  mesocycle: MesocycleWeek[]
  /**
   * Which weeks may be replaced. The caller passes the live week onward — a
   * past week is history and is never rewritten, however wrong its numbers
   * turned out to be.
   */
  weekNumbers: number[]
  context: PlanEditContext
}

/**
 * Rebuilds the remaining programme now that we know what this person
 * actually weighs.
 *
 * Backlog item 2b made a declined bodyweight honest: loads come from a
 * deliberately light stand-in and are labelled 'assumed_body'. The cost is
 * that nothing releases it — food targets follow later weigh-ins on their
 * own (computeTargets prefers the latest daily_metrics reading), but the
 * training side reads only profile.weight_kg and generateMesocycle runs once,
 * at onboarding. Measured before this: a 100kg man who declines is prescribed
 * 0.35x his real loads, and weighing in every day for a year would not move
 * them.
 *
 * Deliberately NOT applied on sight. Ashley's ruling was to ask first — see
 * weight-basis-offer.ts, which owns the offer, the diff the trainee is shown,
 * and the permanence of a decline. This function is only the "yes" branch.
 */
export async function rebuildForWeightBasis(params: RebuildForWeightBasisParams): Promise<MesocycleWeek[]> {
  const { profile, basisWeightKg, exclusions, mesocycle, weekNumbers, context } = params
  const reweighed: UserProfile = { ...profile, weight_kg: basisWeightKg }
  // Seeded on the two things that define this rebuild, so the preview the
  // trainee is shown and the rebuild they get on confirm are the same plan.
  // See rebuildAgainstProfile's seedKey doc comment.
  const seedKey = `weight-basis:${profile.id ?? 'anon'}:${basisWeightKg}`
  return rebuildAgainstProfile(reweighed, exclusions, mesocycle, weekNumbers, context, seedKey)
}

export interface SubstituteForEquipmentParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  equipmentTier: EquipmentAccess
  /** The plan rows to change — from `planDaysInWindow`, never a week range. */
  targetDays: PlanDayRef[]
  exclusions: string[]
  context: PlanEditContext
}

/**
 * For each slot on the given days whose exercise isn't fully coverable by
 * equipmentTier's allowed set, finds a same-constraint-pool replacement that
 * is — candidate pool filtered against a local profile clone with
 * equipment_access set to the travel tier, ON TOP OF anything the person is
 * temporarily easing off. Same drop-if-no-candidate fallback as
 * substituteForInjury.
 *
 * Test log H17, 9 Oct 2026: this built its pool from the saved profile with
 * only the kit changed, so a travel week proposed five minutes after "ease
 * off my knees" put Box Squat straight back.
 */
export async function substituteForEquipment(params: SubstituteForEquipmentParams): Promise<SubstitutionResult> {
  const { mesocycle, profile, equipmentTier, targetDays, exclusions, context } = params
  // A TRAVEL TIER DESCRIBES SOMEWHERE ELSE: that tier's plain set, with the
  // person's own kit list left at home (kit-list.ts `travelProfile` — which
  // also keeps a bag or bands they have said they do not have out of it). The
  // conflict test and the candidate pool read the SAME profile, so a slot is
  // never called fine by one and unfillable by the other.
  // (The injuries being eased off come along; a travel tier already running
  // does not — this card's own tier replaces it, read against the person's
  // own list rather than against the other trip's.)
  const candidateProfile: UserProfile = travelProfile(
    constraintProfile(profile, { ...context.constraints, temporaryEquipment: null }),
    equipmentTier,
  )

  const conflicts = (slot: Exercise): boolean => {
    const entry = getExerciseEntry(slot.name)
    if (!entry) return false
    return !isEquipmentAllowed(entry, candidateProfile)
  }

  return substituteSlots(mesocycle, profile, targetDays, exclusions, conflicts, candidateProfile, context)
}

export interface SubstituteForKitParams {
  mesocycle: MesocycleWeek[]
  /**
   * The profile WITH the kit the plan is being fitted to already attached
   * (`profileWithKit`) — what the person has, as of the statement being
   * applied. Nothing here reads the statement itself.
   */
  profile: UserProfile
  /** The plan rows to change — from `planDaysInWindow`: today to the end of the plan. */
  targetDays: PlanDayRef[]
  exclusions: string[]
  context: PlanEditContext
}

/**
 * FIT THE PLAN TO THE KIT THE PERSON HAS SAID THEY HAVE. docs/plans/kit-list.md.
 *
 * For each slot on the given days whose exercise needs something the kit does
 * not hold, a replacement from the pool that kit allows (on top of anything
 * being eased off temporarily); dropped where nothing fits, like every other
 * substitution here. A day already trained is never a target — the one guard
 * in `substituteSlots`.
 *
 * LASTING, unlike `substituteForEquipment`: this is their own kit, not a week
 * somewhere else, so it reads their list and reaches the end of the plan. The
 * pure core of `recordKitStatement` (kit-change.ts) and of the coach's card.
 */
export async function substituteForKit(params: SubstituteForKitParams): Promise<SubstitutionResult> {
  const { mesocycle, profile, targetDays, exclusions, context } = params
  // An active travel week keeps its own tier: those days are fitted to where
  // the person IS, and are put back when it ends. Only the injuries carry over.
  const candidateProfile: UserProfile = constraintProfile(profile, { ...context.constraints, temporaryEquipment: null })

  const conflicts = (slot: Exercise): boolean => {
    const entry = getExerciseEntry(slot.name)
    if (!entry) return false
    return !isEquipmentAllowed(entry, candidateProfile)
  }

  return substituteSlots(mesocycle, profile, targetDays, exclusions, conflicts, candidateProfile, context)
}
