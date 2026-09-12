import type { WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// SHOP DAY — design handoff 2d, 12 Sep 2026.
//
// The shopping list stopped being a tile on the Tools tab and became a weekly
// errand: it surfaces on Home on the day you shop, and otherwise waits behind
// Nutrition's link. That needs one fact the app did not have — which day that
// is — and one more it needs to forget on demand: whether she has already
// said "not today".
//
// LOCAL, NOT A COLUMN. Adding a profile column would mean a migration, and a
// migration needs Ashley's word every time. This is a device preference of
// the same kind as the theme, so it lives where the theme lives. If it ever
// needs to follow her between devices, that is the moment to ask for the
// column, not before.
//
// THE DEFAULT IS DERIVED, NOT GUESSED AT 'sunday'. The day before the week's
// first training day is when a shop is actually useful — the food has to be
// in before the week starts. For a Monday-start week that IS Sunday, which is
// why the handoff writes it that way; for someone who trains Tue/Thu/Sat it
// is Monday, and hard-coding Sunday would put the card up two days early.
// ---------------------------------------------------------------------------

const KEY = 'fitplan_shop_day_v1'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export type DayName = typeof DAY_NAMES[number]

interface ShopDayRecord {
  /** Null means "not chosen" — the derived default applies. */
  day: DayName | null
  /** Epoch ms; the card stays down until this passes. */
  snoozedUntil: number | null
}

const EMPTY: ShopDayRecord = { day: null, snoozedUntil: null }

function read(): ShopDayRecord {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ShopDayRecord>
    return {
      day: typeof parsed.day === 'string' && (DAY_NAMES as readonly string[]).includes(parsed.day) ? parsed.day as DayName : null,
      snoozedUntil: typeof parsed.snoozedUntil === 'number' ? parsed.snoozedUntil : null,
    }
  } catch {
    // A preference that cannot be read is a preference that is not set. It
    // must never take the shopping card down by throwing on the way past.
    return EMPTY
  }
}

function write(next: ShopDayRecord): void {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage full or blocked — the default still works */ }
}

/**
 * The day before the week's first training day, which is when a shop is
 * useful. Falls back to Sunday only when there is no plan to read.
 */
export function defaultShopDay(plan: WorkoutDay[] | undefined): DayName {
  const trainingDays = (plan ?? []).filter(d => (d.exercises?.length ?? 0) > 0).map(d => d.day)
  const firstIndex = DAY_NAMES.findIndex(d => trainingDays.includes(d))
  if (firstIndex < 0) return 'Sunday'
  return DAY_NAMES[(firstIndex + DAY_NAMES.length - 1) % DAY_NAMES.length]
}

/** Her choice if she has made one, otherwise the derived default. */
export function getShopDay(plan: WorkoutDay[] | undefined): DayName {
  return read().day ?? defaultShopDay(plan)
}

export function setShopDay(day: DayName | null): void {
  write({ ...read(), day })
}

/** True when she tapped "Not today" less than a day ago. */
export function isSnoozed(nowMs: number): boolean {
  const until = read().snoozedUntil
  return until != null && until > nowMs
}

export function snoozeForADay(nowMs: number): void {
  write({ ...read(), snoozedUntil: nowMs + 24 * 60 * 60 * 1000 })
}

/**
 * SHOULD THE HOME CARD BE UP? All three conditions, in one place, so the card
 * and anything that talks about the card cannot disagree about when it shows.
 *
 * Takes the day name rather than a Date so it uses the same "what day is it"
 * the rest of the app already froze at session start — deriving a second one
 * from a fresh clock here is how a card appears on the wrong day for someone
 * training across midnight.
 */
export function isGroceryDueToday(input: {
  todayName: string
  plan: WorkoutDay[] | undefined
  uncheckedCount: number
  nowMs: number
}): boolean {
  if (input.uncheckedCount < 1) return false
  if (getShopDay(input.plan) !== input.todayName) return false
  return !isSnoozed(input.nowMs)
}
