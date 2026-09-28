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

import { DEFAULT_POOL_SIZE, generateMealPools, type PoolOption } from './meal-generation'
import { addDays, epochDay } from './meal-rotation'
import { weekdayLong, longDate } from './day-labels'
import { readGroceryCoverage } from './grocery-store'
import { moreMealOptionsOffer, moreMealOptionsDone } from './coach-voice'
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
 * "NOT NOW" IS REMEMBERED ON THIS DEVICE, for this pool size. A convenience,
 * not a record: in a private window it simply comes back, which is the safe
 * direction. Keyed on the size, so raising it again would ask again.
 */
const dismissKey = (profileId: string) => `meal-top-up-dismissed:${profileId}:${DEFAULT_POOL_SIZE}`

export function isTopUpDismissed(profileId: string): boolean {
  try { return localStorage.getItem(dismissKey(profileId)) === '1' } catch { return false }
}

export function dismissTopUp(profileId: string): void {
  try { localStorage.setItem(dismissKey(profileId), '1') } catch { /* the offer comes back next time; nothing is lost */ }
}

/** The offer's sentence for these needs, or null when nothing is short. */
export function topUpOffer(needs: Partial<Record<MealSlotName, number>>): string | null {
  const short = Object.keys(needs) as MealSlotName[]
  if (short.length === 0) return null
  return moreMealOptionsOffer(short.map(s => DEFAULT_POOL_SIZE - needs[s]!), DEFAULT_POOL_SIZE)
}

/** Everything the meal generator needs that is about HER, not about the top-up. */
export type TopUpGeneration = Omit<Parameters<typeof generateMealPools>[0], 'profileId' | 'onlySlots' | 'poolSize' | 'appendToExisting' | 'servedFrom'>

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
}): Promise<{ added: number; note: { text: string; failed: boolean }; unrecognised: string[] }> {
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
    return {
      added,
      unrecognised: [...unrecognised],
      note: {
        text: moreMealOptionsDone({
          added, asked, reached: result.reached, listUnreadable: result.listUnreadable,
          startLabel: result.from ? topUpStartLabel(input.today, result.from) : '',
        }),
        failed: added === 0,
      },
    }
  } catch {
    return {
      added: 0,
      unrecognised: [...unrecognised],
      note: { text: moreMealOptionsDone({ added: 0, asked: 0, reached: false, listUnreadable: false, startLabel: '' }), failed: true },
    }
  }
}
