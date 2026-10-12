// ---------------------------------------------------------------------------
// THE DOORS' ONE FUNCTION: somebody says something about their kit.
//
//   record the statement → trial-fit the plan from today to its end (a day
//   already trained is never touched) → say what changes → apply.
//
// docs/plans/kit-list.md; Ashley's ruling of 9 Oct 2026 ("remember what they
// say"). Every door is one call here — Profile's ticks and the coach's card
// today; the swap sheet's "I don't own it" and the ceiling prompt's "I don't
// have one" when she has ruled on them:
//
//   planKitChange(params)       the trial. Writes nothing. Every door shows
//                               what it returns BEFORE anything changes.
//   recordKitStatement(params)  the same trial, then the writes. Returns what
//                               the trial returned, plus whether it saved.
//
// WHAT IS WRITTEN: one `user_facts` row per statement (the shape kit-list.ts
// `kitStatementFact` defines), the plan weeks that changed, and the retiring
// of earlier rows the new ones make redundant. NEVER the profile row: the tier
// the person picked stays the tier they picked, and what they said is laid
// over it wherever a profile is read.
//
// A MODULE OF ITS OWN for the reason screen-adaptations.ts is: it needs
// plan-adaptations and the stores, and a door in the main chunk imports it
// lazily rather than dragging them into the first download.
//
// IT WRITES TO THE DATABASE AND DOES NOT TOUCH REACT. It returns what changed
// and leaves the caller to tell the app (set the plan, reload memory so App's
// one derivation picks the statement up).
// ---------------------------------------------------------------------------

import type { MesocycleWeek, UserProfile } from './types'
import {
  isKitItem, kitItemsFor, kitLine, kitStatementFact, profileWithKit, supersededStatementIndexes,
  type KitItem, type KitStatement,
} from './kit-list'
import {
  substituteForKit, rebuildAgainstProfile, assessAdaptation, countSlots, dayChangesBetween,
  type PlanEditContext, type TouchedSlot,
} from './plan-adaptations'
import { planDaysInWindow, shortDate, type PlanDayOnDate } from './plan-guard'
import { loadPlanEditContext } from './plan-edit-context'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { createFact, retireFact } from './memory-store'
import { rebuildWarmup, warmupDrillsNeedingMissingKit } from './warmup'

/** A kit row already on file: the fact, and what it says. From fact-compiler's `kitFactsIn`. */
export interface KitFactOnFile {
  id: string
  statement: KitStatement
}

export interface KitChangeParams {
  /** The profile as App hands it out: the saved one with anything already said about kit attached. */
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  /** When the plan was made — what turns "from today" into plan rows. */
  planCreatedAt: string | undefined
  /** What was just said, in order. One for a sentence; a `has` and a `hasnt` for a changed tick-list. */
  statements: KitStatement[]
  /** The person's real exclusions, already compiled. Required: a replacement must never be something they banned. */
  exclusions: string[]
  source: 'chat' | 'manual' | 'onboarding'
  /** Their words, or what they tapped. Stored with the fact. */
  rawPhrase: string
  /**
   * The kit rows already on file, oldest first. Rows the new statements make
   * redundant are retired (kit-list.ts `supersededStatementIndexes`), which
   * by construction leaves the resolved kit unchanged. Absent: none retired.
   */
  onFile?: KitFactOnFile[]
  /**
   * Which days are already trained, and what is temporarily being eased off.
   * Loaded when absent. A door that already holds one (the coach) passes it
   * so the card and the confirm judge the same days.
   */
  context?: PlanEditContext
}

/** One plan day the change reaches, before and after. */
export interface KitChangedDay extends PlanDayOnDate {
  before: string[]
  after: string[]
}

export interface KitChangePlan {
  /** The statements as they will be stored (items outside the nine dropped; empty ones dropped). */
  statements: KitStatement[]
  /** Which of the nine they had before, and have after. */
  kitBefore: KitItem[]
  kitAfter: KitItem[]
  /** The profile with the statements applied. Not saved; for a caller that needs to read the new kit at once. */
  profileAfter: UserProfile
  /**
   * `none`: nothing from today on needs kit they do not have.
   * `substitute`: each such slot replaced (or left out where nothing fits).
   * `rebuild`: replacing slot by slot would leave the plan hollow, so the days
   *   from today are regenerated around the kit.
   */
  mode: 'none' | 'substitute' | 'rebuild'
  /** The plan as it would be. The same object as the input when nothing on it changes. */
  mesocycle: MesocycleWeek[]
  /** `substitute` only: every slot that changes, in the order a card prints them. Empty otherwise. */
  touchedSlots: TouchedSlot[]
  /** Every day whose exercises change, with what it held and what it will hold, in date order. */
  changedDays: KitChangedDay[]
  /** Days whose warm-up asked for kit they no longer have and was re-made (exercises unchanged). */
  warmupsRebuilt: number
  /** How many slots from today on need kit they do not have. */
  conflicts: number
  /** Plain lines a card can print: the kit, then the plan. */
  summary: string[]
  /** Set when the statement cannot be acted on; nothing else is meaningful then. */
  refusal: string | null
  /** Earlier kit rows that saving will retire, because the new ones say everything they said. */
  retireIds: string[]
}

export interface KitChangeResult extends KitChangePlan {
  saved: boolean
  /** A refusal or a failure, or null when it simply worked. */
  message: string | null
}

/**
 * WHAT APP HANDS EVERY DOOR — Profile's ticks and the coach's card get the
 * same object, built once from the live plan, the live exclusions and the kit
 * rows on file, so the two cannot price one change differently (the
 * `meal-refit` pattern: parity by construction).
 */
export interface KitController {
  /** The trial: what these statements would do, written nowhere. */
  plan(statements: KitStatement[]): Promise<KitChangePlan>
  /** The trial again against the live plan, then the writes; App takes the new plan and re-reads memory. */
  apply(statements: KitStatement[], from: { source: 'manual' | 'chat'; rawPhrase: string }): Promise<KitChangeResult>
}

/**
 * THE ONE PLACE A CONTROLLER IS BUILT — by App for its two doors, and by the
 * browser harness, so a driver measures the app's own wiring rather than a
 * copy of it. `onSaved` is the caller's half: take the new plan, re-read the
 * remembered facts.
 */
export function makeKitController(live: {
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  planCreatedAt: string | undefined
  exclusions: string[]
  onFile: KitFactOnFile[]
  onSaved: (result: KitChangeResult) => void | Promise<void>
}): KitController {
  const base = { profile: live.profile, mesocycle: live.mesocycle, planCreatedAt: live.planCreatedAt, exclusions: live.exclusions, onFile: live.onFile }
  return {
    plan: statements => planKitChange({ ...base, statements, source: 'manual', rawPhrase: '' }),
    apply: async (statements, from) => {
      const result = await recordKitStatement({ ...base, statements, source: from.source, rawPhrase: from.rawPhrase })
      if (result.saved) await live.onSaved(result)
      return result
    },
  }
}

const DID_NOT_SAVE = "That didn't save — try again in a moment."
const NOT_A_KIT_ITEM = "I couldn't work out which kit that is."
const NOTHING_NEW = 'That is already your kit.'

const clean = (statements: KitStatement[]): KitStatement[] =>
  statements
    .map(s => ({ mode: s.mode, items: (s.items ?? []).filter(isKitItem) }))
    .filter(s => ['has', 'hasnt', 'only'].includes(s.mode) && s.items.length > 0)

/**
 * THE TRIAL. Works out everything the change would do and writes nothing.
 * Pure apart from loading the edit context when one is not passed.
 */
export async function planKitChange(params: KitChangeParams): Promise<KitChangePlan> {
  const { profile, mesocycle, planCreatedAt, exclusions } = params
  const statements = clean(params.statements ?? [])
  const kitBefore = kitItemsFor(profile)
  const said = profile.kit_statements ?? []
  const onFile = params.onFile ?? []
  const nothing = (refusal: string | null, summary: string[], profileAfter: UserProfile, retireIds: string[] = []): KitChangePlan => ({
    statements, kitBefore, kitAfter: kitItemsFor(profileAfter), profileAfter, mode: 'none', mesocycle,
    touchedSlots: [], changedDays: [], warmupsRebuilt: 0, conflicts: 0, summary, refusal, retireIds,
  })
  if (statements.length === 0) return nothing(NOT_A_KIT_ITEM, [], profile)

  const profileAfter = profileWithKit(profile, [...said, ...statements])
  const kitAfter = kitItemsFor(profileAfter)
  const retireIds = supersededStatementIndexes(onFile.map(f => f.statement), statements).map(i => onFile[i].id)
  // A STATEMENT THAT CHANGES NOTHING IS NOT SAVED. Ticking what is already
  // ticked, or the coach hearing "I've got dumbbells" from someone whose kit
  // already has them, must not add a row to "Things it remembers" — unless it
  // is a list given as the whole kit, which says something about everything
  // NOT on it even when the nine read the same.
  const sameItems = kitAfter.length === kitBefore.length && kitAfter.every((i, n) => kitBefore[n] === i)
  if (sameItems && !statements.some(s => s.mode === 'only')) return nothing(NOTHING_NEW, [kitLine(kitAfter)], profileAfter)
  const line = kitLine(kitAfter)

  const context = params.context ?? await loadPlanEditContext(profile, mesocycle, planCreatedAt)
  // FROM TODAY TO THE END OF THE PLAN, by date. Never a whole week: this week
  // holds days already trained, and the guard inside the substitution skips
  // any of these that has been.
  const targetDays = planDaysInWindow(mesocycle, context.calendar)
  if (mesocycle.length === 0 || targetDays.length === 0) {
    return nothing(null, [line, 'There is no plan from today on to change.'], profileAfter, retireIds)
  }

  const trial = await substituteForKit({ mesocycle, profile: profileAfter, targetDays, exclusions, context })
  const conflicts = trial.touchedSlots.length
  const rebuildRecommended = conflicts > 0 && assessAdaptation(trial, countSlots(mesocycle)).shouldRebuild
  const mode: KitChangePlan['mode'] = conflicts === 0 ? 'none' : rebuildRecommended ? 'rebuild' : 'substitute'

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

  // A WARM-UP IS PART OF THE PLAN TOO. A day none of whose exercises needed the
  // kit can still open with Band Pull-Aparts; re-make that warm-up from the
  // exercises it holds, on the days from today that nobody has trained.
  let warmupsRebuilt = 0
  const wantedDays = new Set(targetDays.map(d => `${d.weekNumber}|${d.dayName}`))
  next = next.map(week => {
    let changed = false
    const days = week.days.map(day => {
      if (!wantedDays.has(`${week.week_number}|${day.day}`) || context.isProtected(week.week_number, day.day)) return day
      if (warmupDrillsNeedingMissingKit(day, profileAfter).length === 0) return day
      const rebuilt = rebuildWarmup(day, profileAfter)
      if (rebuilt === day) return day
      changed = true
      warmupsRebuilt++
      return rebuilt
    })
    return changed ? { ...week, days } : week
  })

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
  const planLine = mode === 'none'
    ? (warmupsRebuilt > 0
        ? `Nothing on your plan needs that kit except ${warmupsRebuilt} warm-up${warmupsRebuilt === 1 ? '' : 's'}, which change${warmupsRebuilt === 1 ? 's' : ''}.`
        : 'Nothing on your plan needs to change.')
    : mode === 'rebuild'
      ? `${changedDays.length} day${changedDays.length === 1 ? '' : 's'} of your plan ${changedDays.length === 1 ? 'is' : 'are'} rebuilt around that${from}. Sessions you have already done stay as they are.`
      : `${conflicts} exercise${conflicts === 1 ? '' : 's'} on your plan change${conflicts === 1 ? 's' : ''}${from}. Sessions you have already done stay as they are.`

  return {
    statements, kitBefore, kitAfter, profileAfter, mode, mesocycle: next,
    touchedSlots: mode === 'substitute' ? trial.touchedSlots : [],
    changedDays, warmupsRebuilt, conflicts,
    summary: [line, planLine],
    refusal: null,
    retireIds,
  }
}

/**
 * THE TRIAL, THEN THE WRITES. The plan weeks that changed are saved first,
 * then the statements, then the redundant rows retired. Both halves or a plain
 * "that didn't save": a retry after a half-finished save finds nothing left to
 * change on the plan and writes the statement, so it cannot double up. A
 * retire that fails is not a failure — the kit resolves the same either way —
 * and is logged.
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
    const items = kitItemsFor(params.profile)
    return {
      statements: clean(params.statements ?? []), kitBefore: items, kitAfter: items, profileAfter: params.profile,
      mode: 'none', mesocycle: params.mesocycle, touchedSlots: [], changedDays: [], warmupsRebuilt: 0, conflicts: 0,
      summary: [], refusal: null, retireIds: [], saved: false, message: DID_NOT_SAVE,
    }
  }
  if (plan.refusal) return { ...plan, saved: false, message: plan.refusal }
  // No silent success: a statement with nowhere to be remembered is not saved.
  if (!params.profile.id) return { ...plan, mesocycle: params.mesocycle, saved: false, message: DID_NOT_SAVE }

  try {
    const changed = plan.mesocycle.filter((week, i) => week !== params.mesocycle[i])
    await Promise.all(changed.map(week => saveMesocycleWeek(params.profile.id!, week)))
    for (const statement of plan.statements) {
      await createFact({
        profileId: params.profile.id,
        ...kitStatementFact(statement, { source: params.source, rawPhrase: params.rawPhrase }),
      })
    }
  } catch (err) {
    console.error('recordKitStatement: saving failed', err)
    // The caller keeps the plan it had: nothing is shown as changed that may not be.
    return { ...plan, mesocycle: params.mesocycle, saved: false, message: DID_NOT_SAVE }
  }
  for (const id of plan.retireIds) {
    await retireFact(id).catch(err => console.error('recordKitStatement: an earlier kit line was not retired (the kit is the same either way)', err))
  }
  return { ...plan, saved: true, message: null }
}

/**
 * CHANGING THE EQUIPMENT CHOICE STARTS THE LIST AGAIN. The statements were
 * said on top of the choice they were made against; laid over a new one, a
 * list given as the whole kit ("only dumbbells and a bench") would silently
 * cancel somebody's move to a full gym. So every kit row is retired, and the
 * ticks show the new choice's own assumption, ready to be corrected. Returns
 * how many could not be retired (0 when all went).
 */
export async function clearKitStatements(onFile: KitFactOnFile[]): Promise<number> {
  let failed = 0
  for (const f of onFile) {
    await retireFact(f.id).catch(err => { failed++; console.error('clearKitStatements: a kit line was not retired', err) })
  }
  return failed
}
