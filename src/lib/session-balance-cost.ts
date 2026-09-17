// ---------------------------------------------------------------------------
// WHAT AN EDIT COSTS THE WEEK — measured, never enforced.
//
// The passes that keep a week balanced (enforceWeeklyPatternBalance for
// push:pull and chest:back, balanceWeeklyStructure for six-pattern coverage)
// are private to exercise-plan.ts and need the candidate pool and the whole
// generation context. Re-running the generator to get them back would discard
// every other change the person has made to their plan, so an edit made from
// the app cannot re-assert them.
//
// The honest alternative, and CLAUDE.md's own rule ("when a request would
// break the bar, the app says so and offers the nearest thing that keeps
// it"): measure what those passes would have objected to, and SAY it before
// the tap. This module only reads. It never changes a plan and never refuses
// one — a person is allowed to make their week lopsided on purpose.
//
// The bands are the SCORER's, not the enforcer's (0.6–1.6 push:pull,
// quality-score.ts:967; 1.25 chest:back, exercise-plan.ts:3868). Deliberately
// the looser pair: this sentence exists to warn about a real imbalance, not to
// nag about every set that moves.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, MesocycleMovementPattern } from './types'
import { getExerciseEntry, muscleGroupsOf, type MuscleGroup } from './exercise-db'

// THE PLANNED exercise's vocabulary, not the catalogue's. `Exercise
// .movement_pattern` is a MesocycleMovementPattern — the coarse 'push' /
// 'pull' / 'hinge' / 'squat' set that mapMovementPattern
// (exercise-plan.ts:4948) collapses the catalogue's fifteen patterns into.
// Reading it as though it held 'horizontal_push' would count zero sets on
// every week and report perfect balance forever. quality-score.ts:726 does
// exactly this, for exactly this reason.
const PUSH: ReadonlySet<MesocycleMovementPattern> = new Set(['push'] as MesocycleMovementPattern[])
const PULL: ReadonlySet<MesocycleMovementPattern> = new Set(['pull'] as MesocycleMovementPattern[])

/** The scorer's band — outside this, a week reads as imbalanced. */
const PUSH_PULL_MIN = 0.6
const PUSH_PULL_MAX = 1.6

/**
 * CHEST AGAINST BACK — the second half of what enforceWeeklyPatternBalance
 * polices, and the half this file claimed to measure and did not.
 *
 * The header above has cited the 1.25 band since the file was written; the
 * code only ever counted push and pull. So CLAUDE.md's must-have list said
 * removing an exercise "reports what it costs the week's push:pull AND
 * chest:back balance" and half of that was untrue. Found 13 Sep 2026 by
 * reading the file rather than the note. Same band as the enforcer
 * (exercise-plan.ts's MUSCLE_BAND), counted the same way — through
 * muscleGroupsOf on the catalogue entry, not the planned exercise's coarse
 * pattern, because chest and back are muscle facts and push and pull are
 * movement facts.
 */
const MUSCLE_BAND = 1.25

/** Joins a day name to an exercise name for a lookup key — a character neither can contain. */
const KEY_SEP = String.fromCharCode(0)

export interface WeekBalance {
  pushSets: number
  pullSets: number
  /** null when either side is zero — a ratio against nothing says nothing. */
  ratio: number | null
  inBand: boolean
}

export interface MuscleBalance {
  chestSets: number
  backSets: number
  /** null when either side is zero — a ratio against nothing says nothing. */
  ratio: number | null
  inBand: boolean
}

/** Sets touching a muscle group across the week, by the same reckoning the enforcer uses. */
function muscleSetTotal(week: MesocycleWeek | undefined, group: MuscleGroup): number {
  let total = 0
  for (const day of week?.days ?? []) {
    for (const ex of day.exercises) {
      const entry = getExerciseEntry(ex.name)
      if (entry && muscleGroupsOf(entry).includes(group)) total += ex.sets
    }
  }
  return total
}

export function weekMuscleBalance(week: MesocycleWeek | undefined): MuscleBalance {
  const chestSets = muscleSetTotal(week, 'chest')
  const backSets = muscleSetTotal(week, 'back')
  if (chestSets === 0 || backSets === 0) {
    return { chestSets, backSets, ratio: null, inBand: chestSets === 0 && backSets === 0 }
  }
  // The enforcer's band is symmetric about 1: neither side may exceed the
  // other by more than a quarter.
  const ratio = chestSets / backSets
  return { chestSets, backSets, ratio, inBand: ratio <= MUSCLE_BAND && ratio >= 1 / MUSCLE_BAND }
}

export function weekBalance(week: MesocycleWeek | undefined): WeekBalance {
  let pushSets = 0
  let pullSets = 0
  for (const day of week?.days ?? []) {
    for (const ex of day.exercises) {
      if (ex.movement_pattern && PUSH.has(ex.movement_pattern)) pushSets += ex.sets
      if (ex.movement_pattern && PULL.has(ex.movement_pattern)) pullSets += ex.sets
    }
  }
  if (pushSets === 0 || pullSets === 0) {
    return { pushSets, pullSets, ratio: null, inBand: pushSets === 0 && pullSets === 0 }
  }
  const ratio = pushSets / pullSets
  return { pushSets, pullSets, ratio, inBand: ratio >= PUSH_PULL_MIN && ratio <= PUSH_PULL_MAX }
}

/**
 * The sentence to show before the tap, or null when there is nothing to say.
 *
 * Only speaks when the edit MOVES the week out of band, or pushes an
 * already-out-of-band week further out. A week that was lopsided before and is
 * no worse after gets silence: the person did not cause that here, and saying
 * it on every edit is how a warning becomes wallpaper.
 */
export function describeBalanceCost(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
): string | null {
  return describePushPullCost(before, after) ?? describeMuscleCost(before, after)
}

/**
 * PUSH:PULL FIRST, and only one sentence ever shows. Two warnings about the
 * same edit is a paragraph nobody reads on a confirm card, and push:pull is
 * the coarser, more consequential of the two — a week with nothing pulling is
 * a worse week than one whose chest and back are 1.3 apart.
 */
function describePushPullCost(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
): string | null {
  const b = weekBalance(before)
  const a = weekBalance(after)
  if (a.ratio == null) {
    // The edit removed one whole side of the week.
    if (b.ratio != null && a.pullSets === 0) return 'That leaves nothing pulling this week — your back and biceps get no work.'
    if (b.ratio != null && a.pushSets === 0) return 'That leaves nothing pushing this week — your chest and shoulders get no work.'
    return null
  }
  if (a.inBand) return null
  const worse = b.ratio == null || !b.inBand ? Math.abs(Math.log(a.ratio)) > Math.abs(Math.log(b.ratio ?? 1)) : true
  if (!worse) return null
  const heavy = a.ratio > PUSH_PULL_MAX ? 'push-heavy' : 'pull-heavy'
  return `That leaves your week ${heavy} — ${a.pushSets} pushing sets to ${a.pullSets} pulling. Still fine to do; worth balancing later.`
}

/** The same rule for chest against back, in the same shape and the same voice. */
function describeMuscleCost(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
): string | null {
  const b = weekMuscleBalance(before)
  const a = weekMuscleBalance(after)
  if (a.ratio == null) {
    if (b.ratio != null && a.backSets === 0) return 'That leaves nothing for your back this week.'
    if (b.ratio != null && a.chestSets === 0) return 'That leaves nothing for your chest this week.'
    return null
  }
  if (a.inBand) return null
  const worse = b.ratio == null || !b.inBand ? Math.abs(Math.log(a.ratio)) > Math.abs(Math.log(b.ratio ?? 1)) : true
  if (!worse) return null
  const heavy = a.ratio > MUSCLE_BAND ? 'chest' : 'back'
  const light = heavy === 'chest' ? 'back' : 'chest'
  return `That tips your week toward ${heavy} over ${light} — ${a.chestSets} chest sets to ${a.backSets} back. Still fine to do; worth balancing later.`
}

// ---------------------------------------------------------------------------
// AND WHAT THE APP DID ABOUT IT — Ashley's ruling, 13 Sep 2026.
//
// Asked whether changing one day should be allowed to touch another day to
// keep the week balanced, she chose "yes, and it says so" over "only touch the
// day I changed" and over asking a second time. So the week-level balance pass
// now runs on every edit (settleWeekBalance, exercise-plan.ts) and this is the
// sentence that keeps the app's other standing rule — nothing changes silently.
//
// DIFFED, NOT REPORTED BY THE PASS. The pass could have been made to describe
// itself, but then two things would have to stay in step: what it does and
// what it says it does. A diff of the week before against the week after is
// true whatever the pass does next.
// ---------------------------------------------------------------------------

/** One exercise whose set count moved, on a day the person did not edit. */
export interface BalancingChange {
  day: string
  exercise: string
  from: number
  to: number
}

/**
 * Set-count changes the balancing made on days OTHER than the one being
 * edited. The edited day is excluded on purpose: its changes are the ones the
 * person asked for, and repeating them back as a side effect would read as the
 * app having done something extra.
 */
export function balancingChanges(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
  editedDay: string,
): BalancingChange[] {
  if (!before || !after) return []
  // ONE PLACE THAT SAYS "NOT THE EDITED DAY". It was written twice — once when
  // reading the before, once when reading the after — and mutation testing
  // showed the two covering for each other: delete either guard and the other
  // still keeps the edited day out, so no check could see the rule break. One
  // expression, one thing to get wrong.
  const otherDays = (week: MesocycleWeek) => week.days.filter(d => d.day !== editedDay)

  const was = new Map<string, number>()
  for (const day of otherDays(before)) {
    for (const ex of day.exercises) was.set(day.day + KEY_SEP + ex.name, ex.sets)
  }
  const out: BalancingChange[] = []
  for (const day of otherDays(after)) {
    for (const ex of day.exercises) {
      const n = was.get(day.day + KEY_SEP + ex.name)
      if (n !== undefined && n !== ex.sets) out.push({ day: day.day, exercise: ex.name, from: n, to: ex.sets })
    }
  }
  return out
}

/**
 * The sentence, or null when nothing else moved.
 *
 * Future tense because it is shown BEFORE the tap — the whole point of her
 * ruling is that the person reads it while they can still say no.
 */
export function describeBalancingDone(changes: BalancingChange[]): string | null {
  if (changes.length === 0) return null
  const phrase = (c: BalancingChange) => {
    const n = Math.abs(c.to - c.from)
    const sets = n === 1 ? 'a set' : n + ' sets'
    return (c.to > c.from ? 'add ' : 'trim ') + sets + ' of ' + c.exercise.toLowerCase() + ' on ' + c.day
  }
  // Two named at most. A list of five set-count nudges is not a sentence
  // anybody reads on a phone before tapping Confirm.
  const named = changes.slice(0, 2).map(phrase)
  const rest = changes.length - named.length
  const list = named.length === 1 ? named[0] : named[0] + ' and ' + named[1]
  const tail = rest > 0 ? ', and ' + rest + ' other small change' + (rest === 1 ? '' : 's') + ',' : ''
  return "I'll also " + list + tail + ' to keep your week balanced.'
}

/**
 * BOTH SENTENCES, FROM ONE PLACE — what the edit costs, and what the app will
 * do about it. Every confirm surface asks this one question rather than
 * assembling its own pair, so the screen and the coach cannot describe the
 * same edit differently.
 *
 * NOTE WHAT CHANGED ABOUT `cost` ON 13 Sep 2026. Until the week-level balance
 * pass joined the edit tail, this sentence meant "your week is now lopsided
 * and nothing will fix it". Now the pass runs first, so a cost sentence only
 * appears when the balancing could NOT bring the week back into band — which
 * is rarer, and more worth reading when it happens.
 */
export interface EditImpact {
  /** What the edit costs the week, after the balancing has done what it can. */
  cost: string | null
  /** What the balancing will change on other days. */
  balancing: string | null
}

export function describeEditImpact(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
  editedDay: string,
): EditImpact {
  return {
    cost: describeBalanceCost(before, after),
    balancing: describeBalancingDone(balancingChanges(before, after, editedDay)),
  }
}
