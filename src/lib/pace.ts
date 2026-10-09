/**
 * PACING WITH A CLOCK — the one place the app works out "how much should be
 * done by now?".
 *
 * 9 Oct 2026, the test log's L28 and L8. Three rules said "behind" and only
 * one of them knew what time it was:
 *
 *   - Nutrition: "Protein is behind — 162g to go" before breakfast, and
 *     "Water is behind — 2000ml to go" at 8:30. The rule compared what had
 *     been eaten with the WHOLE DAY's target, so first thing in the morning
 *     everything was 100% behind, every day.
 *   - Home: an amber "no meals logged yet" at 07:01.
 *   - Home's water tip: "about 1850ml behind on water for this time of day",
 *     seconds after signing up at 21:53. Its arithmetic was right and it
 *     counted a day the person had not been using the app for.
 *
 * So all three now ask ONE question of ONE function: `expectedByNow`.
 *
 * WHAT WAS DECIDED, and by whom. Decided unprompted, reversible (the tracer's
 * option A; "when may the app say behind?" is Ashley's to overrule):
 *   - "Behind" is only said once the time for it has passed. For food that is
 *     a meal whose usual time has gone by; for water it is the 08:00-22:00
 *     pro-rata her own example was built on, which stays exactly as it was.
 *   - Before anything is due the app is quiet. Once something has been due
 *     and the person is keeping up, it may say what is left in neutral words
 *     ("120g of protein to come today") — never "behind".
 *   - Nothing at all on the day the account or the plan was made. Somebody
 *     who joins at ten to ten at night is not a day behind on anything.
 *
 * NO IMPORTS, on purpose: `coach-tips.ts` is a pure function by design and
 * calls this, so it must stay something a gate can run with no browser.
 */

/** The waking day water is spread across. Ashley's example ("1,200 ml behind on water target for 12 PM") is this window. */
export const WAKING_START_HOUR = 8
export const WAKING_END_HOUR = 22

export type PaceSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner'

/**
 * The hour by which each meal has usually been eaten.
 *
 * Decided unprompted, reversible. Basis: the usual British pattern is
 * breakfast between 7 and 9, lunch between 12 and 2, an afternoon snack and
 * an evening meal between 6 and 8; each figure is the END of that span plus
 * about an hour, so somebody who eats a little late is not called behind at
 * five past. The app does not ask anybody when they eat. If it ever does,
 * this table is the one thing to replace.
 */
export const MEAL_DUE_HOUR: Record<PaceSlot, number> = {
  breakfast: 10,
  lunch: 14,
  snack: 17,
  dinner: 21,
}

/**
 * Keeping up means having at least this share of what was due. The figure is
 * the water tip's own (it has always stayed quiet at 60% of pace or better),
 * now shared so the three rules cannot hold three opinions.
 */
export const PACE_KEEPING_UP_FRACTION = 0.6
/**
 * ...and the shortfall has to be worth a sentence: an eighth of the day's
 * target. For the default 2,000 ml of water that is the tip's existing 250 ml
 * floor; for 164 g of protein it is about 20 g, less than any one meal.
 */
export const PACE_WORTH_SAYING_FRACTION = 0.125

export interface PaceClock {
  /** Hour of the day on the APP's clock, with minutes as a fraction: 21:53 is 21.88. */
  hour: number
  /** True on the day the account or the plan was created. Nothing is expected of anybody on that day. */
  firstDay: boolean
}

export type PaceBasis =
  /** Spread evenly across the waking day (water). */
  | { kind: 'waking-day' }
  /** Due meal by meal: each meal's SHARE of the day is owed once its usual time has passed. */
  | { kind: 'meals'; meals: { slot: PaceSlot; amount: number }[] }

export const WAKING_DAY: PaceBasis = { kind: 'waking-day' }

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The clock every pace rule reads. `now` MUST come from the app's clock
 * (`getAppNow`), never `new Date()`: the browser harness has one fixed today
 * and a rule that read the machine's clock would give a different answer
 * depending on when the check was run.
 *
 * `startedOn` is every date that counts as "they started today" — the
 * account's creation and the current plan's. Timestamps or plain dates; a
 * missing one is simply not a reason.
 */
export function paceClock(now: Date, startedOn: (string | null | undefined)[] = []): PaceClock {
  const today = localDate(now)
  const firstDay = startedOn.some(s => {
    if (!s) return false
    // A bare date is already somebody's local day; a timestamp is an instant
    // and has to be read in local time, or a sign-up at 00:30 in summer lands
    // on yesterday.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s === today
    const d = new Date(s)
    return !Number.isNaN(d.getTime()) && localDate(d) === today
  })
  return { hour: now.getHours() + now.getMinutes() / 60, firstDay }
}

/**
 * How much of `target` should be done by now.
 *
 * Zero means "nothing is due yet", and every caller treats zero as a reason
 * to say nothing about pace. It is zero for the whole of the first day.
 */
export function expectedByNow(target: number, clock: PaceClock, basis: PaceBasis): number {
  if (!Number.isFinite(target) || target <= 0) return 0
  if (!clock || !Number.isFinite(clock.hour) || clock.firstDay) return 0
  if (basis.kind === 'waking-day') {
    const span = WAKING_END_HOUR - WAKING_START_HOUR
    const elapsed = Math.min(Math.max(clock.hour - WAKING_START_HOUR, 0), span)
    return target * (elapsed / span)
  }
  // THE AMOUNTS ARE SHARES OF THE DAY, not grams owed: what is due by the end
  // of the day is the TARGET, whatever the plan happens to add up to. A plan
  // that runs a little over or under its target, or a day with a meal
  // missing, must not move the finishing line.
  let due = 0
  let all = 0
  for (const m of basis.meals) {
    if (!Number.isFinite(m.amount) || m.amount <= 0) continue
    all += m.amount
    if (clock.hour >= MEAL_DUE_HOUR[m.slot]) due += m.amount
  }
  return all > 0 ? target * (due / all) : 0
}

/**
 * Is `actual` behind what was due? Only ever true once something WAS due,
 * and only when the gap is worth a sentence.
 */
export function isBehindPace(actual: number, expected: number, target: number, keepingUp = PACE_KEEPING_UP_FRACTION): boolean {
  if (![actual, expected, target, keepingUp].every(n => Number.isFinite(n))) return false
  if (expected <= 0 || target <= 0) return false
  if (actual >= expected * keepingUp) return false
  return expected - actual >= target * PACE_WORTH_SAYING_FRACTION
}
