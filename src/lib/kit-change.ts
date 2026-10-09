// ---------------------------------------------------------------------------
// THE DOORS' ONE FUNCTION: somebody says something about their kit.
//
//   record the statement → trial-fit the plan from today to its end (a day
//   already trained is never touched) → say what changes → apply.
//
// docs/plans/kit-list.md; Ashley's ruling of 9 Oct 2026 ("remember what they
// say"). Every door — a Profile tick, the swap sheet's "I don't own it", the
// ceiling prompt's "I don't have one", the coach's card, a list volunteered in
// setup — is meant to be one call here:
//
//   planKitChange(params)       the trial. Writes nothing. For a door that
//                               shows a card before anything changes.
//   recordKitStatement(params)  the same trial, then the writes. Returns what
//                               the trial returned, plus whether it saved.
//
// WHAT IS WRITTEN: one `user_facts` row (the statement, in the shape
// kit-list.ts `kitStatementFact` defines) and the plan weeks that changed.
// NEVER the profile row: the tier the person picked stays the tier they
// picked, and the statement is laid over it wherever a profile is read.
//
// A MODULE OF ITS OWN for the reason screen-adaptations.ts is: it needs
// plan-adaptations and the stores, and a door in the main chunk should import
// this lazily rather than drag them into the first download.
//
// IT WRITES TO THE DATABASE AND DOES NOT TOUCH REACT. It returns what changed
// and leaves the caller to tell the app (set the plan, reload memory so App's
// one derivation picks the statement up).
// ---------------------------------------------------------------------------

import type { MesocycleWeek, UserProfile } from './types'
import {
  KIT_ITEMS, TIER_KIT_ITEMS, isKitItem, kitOf, kitInWords, kitStatementFact, profileWithKit,
  type KitItem, type KitStatement,
} from './kit-list'
import {
  substituteForKit, rebuildAgainstProfile, assessAdaptation, countSlots, dayChangesBetween,
  type PlanEditContext, type TouchedSlot,
} from './plan-adaptations'
import { planDaysInWindow, shortDate, type PlanDayOnDate } from './plan-guard'
import { loadPlanEditContext } from './plan-edit-context'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { createFact } from './memory-store'

export interface KitChangeParams {
  /** The profile as App hands it out: the saved one with anything already said about kit attached. */
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  /** When the plan was made — what turns "from today" into plan rows. */
  planCreatedAt: string | undefined
  statement: KitStatement
  /** The person's real exclusions, already compiled. Required: a replacement must never be something they banned. */
  exclusions: string[]
  source: 'chat' | 'manual' | 'onboarding'
  /** Their words, or what they tapped. Stored with the fact. */
  rawPhrase: string
  /**
   * Which days are already trained, and what is temporarily being eased off.
   * Loaded when absent. A door that already holds one (the coach) passes it
   * so the card and the confirm judge the same days.
   */
  context?: PlanEditContext
  /**
   * How to fit the plan. Left out, it is decided the way an injury is: slot
   * by slot unless that would leave the plan hollow, then a rebuild of the
   * days from today. A door may ask for the rebuild outright ("rebuild the
   * rest of my plan around this").
   */
  mode?: 'substitute' | 'rebuild'
}

/** One plan day the change reaches, before and after. */
export interface KitChangedDay extends PlanDayOnDate {
  before: string[]
  after: string[]
}

export interface KitChangePlan {
  /** The statement as it will be stored (items outside the nine dropped). */
  statement: KitStatement
  /** Which of the nine they had before, and have after. */
  kitBefore: KitItem[]
  kitAfter: KitItem[]
  /** The profile with the statement applied. Not saved; for a caller that needs to read the new kit at once. */
  profileAfter: UserProfile
  /**
   * `none`: nothing from today on needs kit they do not have.
   * `substitute`: each such slot replaced (or left out where nothing fits).
   * `rebuild`: replacing slot by slot would leave the plan hollow, so the days
   *   from today are regenerated around the kit.
   */
  mode: 'none' | 'substitute' | 'rebuild'
  /** The plan as it would be. The same object as the input when `mode` is `none`. */
  mesocycle: MesocycleWeek[]
  /** `substitute` only: every slot that changes, in the order a card prints them. Empty otherwise. */
  touchedSlots: TouchedSlot[]
  /** Every day that changes, either way, with what it held and what it will hold. */
  changedDays: KitChangedDay[]
  /** How many slots from today on need kit they do not have (whatever the mode). */
  conflicts: number
  /** True when a slot-by-slot fit loses enough that a rebuild would serve better — for a door that wants to offer one. */
  rebuildRecommended: boolean
  /** Plain lines a card can print: the kit, then the plan. */
  summary: string[]
  /** Set when the statement cannot be acted on; nothing else is meaningful then. */
  refusal: string | null
}

export interface KitChangeResult extends KitChangePlan {
  saved: boolean
  /** A refusal or a failure, or null when it simply worked. */
  message: string | null
}

const DID_NOT_SAVE = "That didn't save — try again in a moment."
const NOT_A_KIT_ITEM = "I couldn't work out which kit that is."

const itemsOf = (profile: UserProfile): KitItem[] => {
  const kit = kitOf(profile)
  const have = kit ? kit.items : new Set<KitItem>(TIER_KIT_ITEMS[profile.equipment_access || 'full_gym'])
  return KIT_ITEMS.filter(i => have.has(i))
}

/**
 * THE TRIAL. Works out everything the change would do and writes nothing.
 * Pure apart from loading the edit context when one is not passed.
 */
export async function planKitChange(params: KitChangeParams): Promise<KitChangePlan> {
  const { profile, mesocycle, planCreatedAt, exclusions } = params
  const statement: KitStatement = { mode: params.statement.mode, items: (params.statement.items ?? []).filter(isKitItem) }
  const kitBefore = itemsOf(profile)
  const nothing = (refusal: string | null, summary: string[], profileAfter: UserProfile): KitChangePlan => ({
    statement, kitBefore, kitAfter: itemsOf(profileAfter), profileAfter, mode: 'none', mesocycle,
    touchedSlots: [], changedDays: [], conflicts: 0, rebuildRecommended: false, summary, refusal,
  })
  if (statement.items.length === 0 || !['has', 'hasnt', 'only'].includes(statement.mode)) {
    return nothing(NOT_A_KIT_ITEM, [], profile)
  }

  const profileAfter = profileWithKit(profile, [...(profile.kit_statements ?? []), statement])
  const kitAfter = itemsOf(profileAfter)
  const kitLine = kitAfter.length > 0 ? `Your kit: ${kitInWords(kitAfter)}.` : 'Your kit: nothing but your own bodyweight.'

  const context = params.context ?? await loadPlanEditContext(profile, mesocycle, planCreatedAt)
  // FROM TODAY TO THE END OF THE PLAN, by date. Never a whole week: this week
  // holds days already trained, and the guard inside the substitution skips
  // any of these that has been.
  const targetDays = planDaysInWindow(mesocycle, context.calendar)
  if (mesocycle.length === 0 || targetDays.length === 0) {
    return nothing(null, [kitLine, 'There is no plan from today on to change.'], profileAfter)
  }

  const trial = await substituteForKit({ mesocycle, profile: profileAfter, targetDays, exclusions, context })
  const conflicts = trial.touchedSlots.length
  if (conflicts === 0) {
    // NOT AN ERROR, AND STILL WORTH REMEMBERING: nothing on the plan needs the
    // kit they just ruled out, but the next block and every swap list will be
    // built from what they said.
    return nothing(null, [kitLine, 'Nothing on your plan needs to change.'], profileAfter)
  }

  const rebuildRecommended = assessAdaptation(trial, countSlots(mesocycle)).shouldRebuild
  const mode: 'substitute' | 'rebuild' = params.mode ?? (rebuildRecommended ? 'rebuild' : 'substitute')

  let next = trial.mesocycle
  if (mode === 'rebuild') {
    const wanted = new Set(targetDays.map(d => `${d.weekNumber}|${d.dayName}`))
    const windowed: PlanEditContext = {
      ...context,
      isProtected: (weekNumber, dayName) => context.isProtected(weekNumber, dayName) || !wanted.has(`${weekNumber}|${dayName}`),
    }
    // Seeded on the two things that define this rebuild, so the card somebody
    // is shown and the plan they get on confirm are the same plan (the trial
    // and the apply each run it once).
    const seedKey = `kit:${profile.id ?? 'anon'}:${JSON.stringify(profileAfter.kit_statements ?? [])}`
    next = await rebuildAgainstProfile(profileAfter, exclusions, mesocycle, [...new Set(targetDays.map(d => d.weekNumber))], windowed, seedKey)
  }

  const dateOf = new Map(targetDays.map(d => [`${d.weekNumber}|${d.dayName}`, d.date]))
  const changedDays: KitChangedDay[] = dayChangesBetween(mesocycle, next)
    .filter(c => JSON.stringify(c.was.exercises.map(e => e.name)) !== JSON.stringify(c.became))
    .map(c => ({
      weekNumber: c.weekNumber, dayName: c.dayName, date: dateOf.get(`${c.weekNumber}|${c.dayName}`) ?? '',
      before: c.was.exercises.map(e => e.name), after: c.became,
    }))
    // IN DATE ORDER. A plan week runs from the weekday the plan was made, so
    // "week 1, Monday" can fall after "week 1, Saturday"; a card lists days as
    // the person will meet them.
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))

  const first = changedDays.find(d => d.date)?.date
  const from = first ? ` from ${shortDate(first)}` : ''
  const planLine = mode === 'rebuild'
    ? `${changedDays.length} day${changedDays.length === 1 ? '' : 's'} of your plan ${changedDays.length === 1 ? 'is' : 'are'} rebuilt around that${from}. Sessions you have already done stay as they are.`
    : `${conflicts} exercise${conflicts === 1 ? '' : 's'} on your plan change${conflicts === 1 ? 's' : ''}${from}. Sessions you have already done stay as they are.`

  return {
    statement, kitBefore, kitAfter, profileAfter, mode, mesocycle: next,
    touchedSlots: mode === 'substitute' ? trial.touchedSlots : [],
    changedDays, conflicts, rebuildRecommended,
    summary: [kitLine, planLine],
    refusal: null,
  }
}

/**
 * THE TRIAL, THEN THE WRITES. The plan weeks that changed are saved first and
 * the statement second, both or a plain "that didn't save": a retry after a
 * half-finished save finds nothing left to change on the plan and writes the
 * statement, so it cannot double up.
 *
 * Returns what the trial returned. The caller sets the plan it is handed and
 * reloads memory; App's one derivation then gives every tab the new kit.
 */
export async function recordKitStatement(params: KitChangeParams): Promise<KitChangeResult> {
  let plan: KitChangePlan
  try {
    plan = await planKitChange(params)
  } catch (err) {
    console.error('recordKitStatement: could not work out the change', err)
    const kit = (params.statement.items ?? []).filter(isKitItem)
    return {
      statement: { mode: params.statement.mode, items: kit }, kitBefore: itemsOf(params.profile), kitAfter: itemsOf(params.profile),
      profileAfter: params.profile, mode: 'none', mesocycle: params.mesocycle, touchedSlots: [], changedDays: [], conflicts: 0,
      rebuildRecommended: false, summary: [], refusal: null, saved: false, message: DID_NOT_SAVE,
    }
  }
  if (plan.refusal) return { ...plan, saved: false, message: plan.refusal }
  // No silent success: a statement with nowhere to be remembered is not saved.
  if (!params.profile.id) return { ...plan, mesocycle: params.mesocycle, saved: false, message: DID_NOT_SAVE }

  try {
    const changed = plan.mesocycle.filter((week, i) => week !== params.mesocycle[i])
    await Promise.all(changed.map(week => saveMesocycleWeek(params.profile.id!, week)))
    await createFact({
      profileId: params.profile.id,
      ...kitStatementFact(plan.statement, { source: params.source, rawPhrase: params.rawPhrase }),
    })
  } catch (err) {
    console.error('recordKitStatement: saving failed', err)
    // The caller keeps the plan it had: nothing is shown as changed that may not be.
    return { ...plan, mesocycle: params.mesocycle, saved: false, message: DID_NOT_SAVE }
  }
  return { ...plan, saved: true, message: null }
}
