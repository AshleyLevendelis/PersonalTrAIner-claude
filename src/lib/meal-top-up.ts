// ---------------------------------------------------------------------------
// MORE MEAL OPTIONS FOR A PLAN THAT ALREADY EXISTS — Ashley, 28 Sep 2026.
//
// She chose seven options a meal, and then, for plans made at five, "Button,
// keep today": a button adds more to each meal, while today and any day
// already on the shopping list stay exactly as they are. It also follows her
// standing ruling on running out of swaps: new meals are OFFERED, never
// fetched unasked.
//
// How a day is kept exactly: the new meals carry their first day
// (meal-new-from.ts), and every day before it is worked out from the pool as
// it was. See docs/plans/meal-top-up.md for why saving dish names could not
// do it.
//
// This file decides WHAT to ask for and FROM WHEN. The effects (reading the
// list, generating, reloading) are handed in, so a gate can drive the whole
// thing without a network and App keeps its own wiring.
// ---------------------------------------------------------------------------

import { DEFAULT_POOL_SIZE, assembleDay, generateMealPools, type PoolOption } from './meal-generation'
import type { MacroTargets } from './types'
import { addDays, epochDay } from './meal-rotation'
import { weekdayLong, longDate } from './day-labels'
import { readGroceryCoverage } from './grocery-store'
import { moreMealOptionsOffer, moreMealFitOffer, moreMealOptionsDone, moreMealOptionsWhy } from './coach-voice'
import type { MealSlotName } from './meal-store'

/**
 * How many more each meal needs to reach `size` options she can be SERVED.
 * A meal marked as breaking a restriction is kept (her ruling: it comes back
 * if she lifts it) but is not an option, so it does not count. A meal slot
 * with none at all is left out: that is a missing meal, with its own Redo,
 * not a short one.
 */
export function topUpNeeds(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  activeSlots: MealSlotName[],
  size = DEFAULT_POOL_SIZE,
): Partial<Record<MealSlotName, number>> {
  const out: Partial<Record<MealSlotName, number>> = {}
  for (const slot of activeSlots) {
    const servable = (pools[slot] ?? []).filter(o => !o.breaksRestriction).length
    if (servable > 0 && servable < size) out[slot] = size - servable
  }
  return out
}

// ---------------------------------------------------------------------------
// SEVEN OPTIONS IS NOT SEVEN OPTIONS SHE CAN EAT — Ashley, 30 Sep 2026, on
// "all the days' meals look very similar". A meal can hold seven dishes and
// still serve two of them, because the rest no longer land a day on her
// numbers (her targets moved after they were made). The count above cannot
// see that. Measured on the modelled pools: a meal with 0-1 dishes that fit
// served 2.4-3.0 different dinners in a week, one with six served five.
//
// Her ruling, from three options: speak when FEWER THAN THREE fit. Below
// that, the week is a rota of two. The offer is the same button and the same
// promise as the count-based one (today and the shopping-list days stay), and
// it is still an OFFER, never done unasked.
//
// The three numbers, and whose they are:
//   MIN_FITTING  3   hers (the ruling above)
//   FITTING_GOAL 5   mine: a week of five different dishes uses all five
//                    (measure:meal-repeats, 28 Sep), so the ask aims there
//   MAX_POOL     10  mine: the day search is a product over the meals, so a
//                    pool of ten costs the week about 3.4x a pool of seven
//                    (measured 30 Sep). Past it the app stops adding.
// ---------------------------------------------------------------------------
export const MIN_FITTING = 3
export const FITTING_GOAL = 5
export const MAX_POOL = 10

/**
 * How many of each meal's servable dishes can be part of a day that lands on
 * target today. The app's own test, not a new one: pin the dish in its meal,
 * let the search choose the rest, and ask whether the day it would SERVE is
 * within the tolerance bands (assembleDay, quiet resize included).
 *
 * Judged only when every meal has a servable dish: a meal with none is a
 * missing meal with its own Redo, and a day without it proves nothing about
 * the dishes beside it.
 */
export function fittingCounts(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  activeSlots: MealSlotName[],
  targets: MacroTargets,
): Partial<Record<MealSlotName, number>> {
  const usable: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const slot of activeSlots) usable[slot] = (pools[slot] ?? []).filter(o => !o.breaksRestriction)
  if (activeSlots.length === 0 || activeSlots.some(s => usable[s]!.length === 0)) return {}
  const out: Partial<Record<MealSlotName, number>> = {}
  for (const slot of activeSlots) {
    out[slot] = usable[slot]!.filter(o => assembleDay(usable, targets, {}, [], { [slot]: o }).withinTolerance).length
  }
  return out
}

/** What is short, everywhere it is short, worked out once and handed to every surface. */
export interface TopUpPlan {
  /** What to ask for, per meal: the larger of the two shortfalls below. The run takes exactly this. */
  needs: Partial<Record<MealSlotName, number>>
  /** Short of SEVEN servable options, per meal (the 28 Sep offer). */
  short: Partial<Record<MealSlotName, number>>
  /** How many dishes she can be served, per meal that has any. */
  have: Partial<Record<MealSlotName, number>>
  /** Meals with fewer than MIN_FITTING dishes that fit, and how many do. Only where adding can help. */
  fewFit: Partial<Record<MealSlotName, number>>
  /** Meals with too few that fit but already at MAX_POOL: the app will not add more there. */
  crowded: MealSlotName[]
}

export function topUpPlan(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  activeSlots: MealSlotName[],
  targets: MacroTargets,
  size = DEFAULT_POOL_SIZE,
): TopUpPlan {
  const short = topUpNeeds(pools, activeSlots, size)
  const fitting = fittingCounts(pools, activeSlots, targets)
  const have: TopUpPlan['have'] = {}
  for (const slot of activeSlots) {
    const n = (pools[slot] ?? []).filter(o => !o.breaksRestriction).length
    if (n > 0) have[slot] = n
  }
  const needs: TopUpPlan['needs'] = { ...short }
  const fewFit: TopUpPlan['fewFit'] = {}
  const crowded: MealSlotName[] = []
  for (const slot of activeSlots) {
    const f = fitting[slot]
    if (f === undefined || f >= MIN_FITTING) continue
    const room = MAX_POOL - (have[slot] ?? 0)
    if (room <= 0) { crowded.push(slot); continue }
    fewFit[slot] = f
    needs[slot] = Math.max(needs[slot] ?? 0, Math.min(FITTING_GOAL - f, room))
  }
  return { needs, short, have, fewFit, crowded }
}

/**
 * The first day the new meals may be served: the day after the later of
 * today and the last day on the shopping list. Every day before it is held,
 * including any gap between list days — days are a chain (a lunch can be last
 * night's dinner), so a held day needs the day before it held too.
 */
export function topUpStartDate(today: string, coveredDates: string[]): string {
  // Starting from today, so a list day that has passed can never hold anything.
  const last = coveredDates.reduce((a, b) => (b > a ? b : a), today)
  return addDays(last, 1)
}

export interface TopUpResult {
  /** New options stored, per meal. */
  added: Partial<Record<MealSlotName, number>>
  /** What was asked for, per meal. */
  asked: Partial<Record<MealSlotName, number>>
  /** The first day they may appear. Null when nothing was asked. */
  from: string | null
  /** At least one request reached the meal generator. */
  reached: boolean
  /** The list could not be read, so nothing was asked for. */
  listUnreadable: boolean
}

/**
 * Tops each short meal up to seven. The list is read FIRST and must be read:
 * a failed read that answered "nothing on the list" would move the start to
 * tomorrow and change days she has shopped for. Meals short by the same
 * number are asked for together, which for a plan made at five is every meal
 * in one go.
 */
export async function runMealTopUp(deps: {
  needs: Partial<Record<MealSlotName, number>>
  today: string
  /** The dates on the shopping list from today on. Must THROW when it cannot read. */
  readCoverage: () => Promise<string[]>
  /** Appends `count` options to each of `slots`, first served on `servedFrom`. */
  generate: (slots: MealSlotName[], count: number, servedFrom: string) => Promise<{
    accepted: Partial<Record<MealSlotName, PoolOption[]>>
    generatorReached: boolean
  }>
}): Promise<TopUpResult> {
  const asked = { ...deps.needs }
  const slots = Object.keys(asked) as MealSlotName[]
  if (slots.length === 0) return { added: {}, asked, from: null, reached: false, listUnreadable: false }

  let covered: string[]
  try {
    covered = await deps.readCoverage()
  } catch {
    return { added: {}, asked, from: null, reached: false, listUnreadable: true }
  }
  const from = topUpStartDate(deps.today, covered)

  const byCount = new Map<number, MealSlotName[]>()
  for (const slot of slots) byCount.set(asked[slot]!, [...(byCount.get(asked[slot]!) ?? []), slot])

  const added: Partial<Record<MealSlotName, number>> = {}
  let reached = false
  for (const [count, group] of byCount) {
    try {
      const result = await deps.generate(group, count, from)
      reached ||= result.generatorReached
      for (const slot of group) added[slot] = (added[slot] ?? 0) + (result.accepted[slot]?.length ?? 0)
    } catch {
      // One group failing leaves the others' meals in place; the receipt
      // says what arrived, from the counts.
    }
  }
  return { added, asked, from, reached, listUnreadable: false }
}

/** "tomorrow", "on Thursday" within the week, or "on Monday 6 October" beyond it. */
export function topUpStartLabel(today: string, from: string): string {
  const days = epochDay(from) - epochDay(today)
  if (days === 1) return 'tomorrow'
  return days > 1 && days < 7 ? `on ${weekdayLong(from)}` : `on ${longDate(from)}`
}

/**
 * "NOT NOW" IS REMEMBERED ON THIS DEVICE, per kind of offer. A convenience,
 * not a record: in a private window it simply comes back, which is the safe
 * direction. The count offer is keyed on the size, so raising it again would
 * ask again; the fit offer on her calorie and protein targets, so a change to
 * them (which is what makes dishes stop fitting) asks again too.
 */
export type TopUpOfferKind = 'count' | 'fit'
const dismissKey = (profileId: string, kind: TopUpOfferKind, targets?: MacroTargets) =>
  kind === 'count'
    ? `meal-top-up-dismissed:${profileId}:${DEFAULT_POOL_SIZE}`
    : `meal-top-up-dismissed-fit:${profileId}:${targets ? `${Math.round(targets.calories)}:${Math.round(targets.protein)}` : ''}`

export function isTopUpDismissed(profileId: string, kind: TopUpOfferKind = 'count', targets?: MacroTargets): boolean {
  try { return localStorage.getItem(dismissKey(profileId, kind, targets)) === '1' } catch { return false }
}

export function dismissTopUp(profileId: string, kind: TopUpOfferKind = 'count', targets?: MacroTargets): void {
  try { localStorage.setItem(dismissKey(profileId, kind, targets), '1') } catch { /* the offer comes back next time; nothing is lost */ }
}

/**
 * The offer on Nutrition, or null when there is nothing to say. The fit offer
 * comes first: it is the one that explains a week that looks the same, and its
 * button asks for everything the plan needs, count shortfall included.
 * `dismissed` says which kinds she has already turned down.
 */
export function topUpOffer(
  plan: TopUpPlan,
  dismissed: Record<TopUpOfferKind, boolean> = { count: false, fit: false },
): { kind: TopUpOfferKind; text: string } | null {
  const fitSlots = Object.keys(plan.fewFit) as MealSlotName[]
  if (fitSlots.length > 0 && !dismissed.fit) {
    return { kind: 'fit', text: moreMealFitOffer(fitSlots.map(s => ({ slot: s, fitting: plan.fewFit[s]!, have: plan.have[s] ?? 0 }))) }
  }
  const short = Object.keys(plan.short) as MealSlotName[]
  if (short.length > 0 && !dismissed.count) {
    return { kind: 'count', text: moreMealOptionsOffer(short.map(s => DEFAULT_POOL_SIZE - plan.short[s]!), DEFAULT_POOL_SIZE) }
  }
  return null
}

/** Everything the meal generator needs that is about HER, not about the top-up. */
export type TopUpGeneration = Omit<Parameters<typeof generateMealPools>[0], 'profileId' | 'onlySlots' | 'poolSize' | 'appendToExisting' | 'servedFrom'>

/**
 * WHEN THE NEW MEALS WOULD START, read from the shopping list the same strict
 * way the run reads it. For the coach's card, which states the day before the
 * tap (the screen's offer states the rule and its receipt names the day). Null
 * when the list cannot be read: a card promising "tomorrow" off a failed read
 * would promise days it might then change.
 */
export async function previewTopUpStart(input: {
  profileId: string
  today: string
  legacyStartDate?: string
}): Promise<{ from: string; label: string } | null> {
  try {
    const covered = await readGroceryCoverage(input.profileId, input.today, input.legacyStartDate, { strict: true })
    const from = topUpStartDate(input.today, covered)
    return { from, label: topUpStartLabel(input.today, from) }
  } catch {
    return null
  }
}

/** What the top-up did, for whichever surface asked. */
export interface TopUpOutcome {
  /** New meals stored, all meals together. */
  added: number
  /** New meals stored, per meal. */
  addedBy: Partial<Record<MealSlotName, number>>
  /** New meals asked for, all meals together. A partial landing is `added < asked`. */
  asked: number
  /** "tomorrow", "on Thursday", ... or '' when nothing was asked. */
  startLabel: string
  note: { text: string; failed: boolean }
  /**
   * Why nothing landed, as a clause with no full stop ("I couldn't reach the
   * meal generator just then"), or null when something did. For a receipt
   * that opens with "Nothing was applied —" and so must not say it twice.
   */
  why: string | null
  unrecognised: string[]
}

/**
 * THE BUTTON. One function that App and the browser harness both call, so a
 * driver runs this and not a copy of it. Reads the list STRICTLY (a failed
 * read must never pass for an empty list), appends rather than replaces, and
 * stamps each new meal with its first day. Never throws: every outcome is a
 * receipt, and `failed` says whether anything changed.
 */
export async function topUpMealPlan(input: {
  profileId: string
  today: string
  needs: Partial<Record<MealSlotName, number>>
  /** The shopping list's older rows carry a day offset from this date (see coveredDates). */
  legacyStartDate?: string
  generation: TopUpGeneration
}): Promise<TopUpOutcome> {
  const unrecognised = new Set<string>()
  try {
    const result = await runMealTopUp({
      needs: input.needs,
      today: input.today,
      readCoverage: () => readGroceryCoverage(input.profileId, input.today, input.legacyStartDate, { strict: true }),
      generate: async (slots, count, servedFrom) => {
        const r = await generateMealPools({
          ...input.generation,
          profileId: input.profileId,
          onlySlots: slots,
          poolSize: count,
          appendToExisting: true,
          servedFrom,
        })
        for (const u of r.unrecognisedPreferences) unrecognised.add(u)
        return r
      },
    })
    const added = Object.values(result.added).reduce((a, b) => a + (b ?? 0), 0)
    const asked = Object.values(result.asked).reduce((a, b) => a + (b ?? 0), 0)
    const startLabel = result.from ? topUpStartLabel(input.today, result.from) : ''
    return {
      added,
      addedBy: result.added,
      asked,
      startLabel,
      why: added === 0 ? moreMealOptionsWhy({ reached: result.reached, listUnreadable: result.listUnreadable }) : null,
      unrecognised: [...unrecognised],
      note: {
        text: moreMealOptionsDone({
          added, asked, reached: result.reached, listUnreadable: result.listUnreadable, startLabel,
        }),
        failed: added === 0,
      },
    }
  } catch {
    return {
      added: 0,
      addedBy: {},
      asked: 0,
      startLabel: '',
      why: moreMealOptionsWhy({ reached: false, listUnreadable: false }),
      unrecognised: [...unrecognised],
      note: { text: moreMealOptionsDone({ added: 0, asked: 0, reached: false, listUnreadable: false, startLabel: '' }), failed: true },
    }
  }
}
