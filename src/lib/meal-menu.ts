import { isExoticOption, optionMatchesLikedFood, type PoolOption } from './meal-generation'
import { dishKeysFor, dishKeyOf } from './meal-dish-identity'
import type { MealSlotName } from './meal-store'

// ---------------------------------------------------------------------------
// THE WEEK'S MENU — what the app serves from, out of everything you have (9 Nov 2026)
// ---------------------------------------------------------------------------
// Ashley, 9 Nov 2026: "We need a much deeper pool of meals to choose from not only 14". So a plan holds every dish
// of our library that suits the person, which is far more than the day picker can search: it tries every combination
// of one dish a meal (N^4 days at four meals), which is 2,401 at seven a meal and 10^8 at a hundred.
//
// THE POOL IS WHAT YOU HAVE; THE MENU IS WHAT THE APP SERVES FROM. For each week of the rotation (the seven days
// rotationIndexFor numbers 0-6, so a menu never changes in the middle of a rotation week) up to MENU_SIZE dishes a
// meal are drawn from the pool, and every day of that week is searched over the menu alone. Successive weeks take
// successive dishes in a fixed shuffled order, so the whole pool comes round in turn and no two weeks in a row share
// a dish unless the pool is too small to avoid it. The rotation itself never knew the date: without this, a deep pool
// would serve the same seven days every week and most of it never at all.
//
// What stays the same: a pool no deeper than MENU_SIZE IS its menu (the same object, so every identity shortcut the
// rotation relies on still holds, and today's plans are served exactly as before); a liked dish is on every menu
// (likes come first, his 27 Sep ruling) up to half of it; a dish that breaks a current restriction is never on a
// menu (it would never be served anyway); an edited copy and its base are one dish, so a menu never holds both.
// At most one adventurous cuisine a meal per menu: the cap that kept a pool reading as one way of eating, moved from
// what is stored to what is served together. See docs/plans/deep-meal-pool.md.
// ---------------------------------------------------------------------------

/**
 * Dishes a meal on one week's menu. MEASURED, not chosen (measure:deep-pool): the size whose week costs about what a
 * seven-dish pool cost before, against days on target and different dishes a month.
 */
export const MENU_SIZE = menuSizeOverride() ?? 8

/** measure:deep-pool sizes the menu by environment variable; the app never sets it (no `process` in a browser). */
function menuSizeOverride(): number | null {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.MEAL_MENU_SIZE
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 3 ? n : null
}

/** Days since the epoch, UTC by construction: the same count meal-rotation's epochDay uses (gate holds them equal). */
function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return 0
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/** Which rotation week a date is in: the run of seven days whose rotation index goes 0..6. */
export function menuWeekOf(date: string): number {
  return Math.floor(dayNumber(date) / 7)
}

/** A stable shuffle key, so dishes written in groups (five omelettes together) are spread through the order. */
function shuffleKey(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type Pools = Partial<Record<MealSlotName, PoolOption[]>>

/** One meal's menu for one week. */
export function menuForSlot(options: readonly PoolOption[], week: number, softLikedFoods: readonly string[] = []): PoolOption[] {
  // One entry per dish: an edited copy shares its base's identity, and the copy (written later, what he asked for)
  // stands for both.
  const keys = dishKeysFor(options as PoolOption[])
  const byDish = new Map<string, PoolOption>()
  for (const o of options) if (!o.breaksRestriction) byDish.set(dishKeyOf(keys, o.name), o)
  const dishes = [...byDish.entries()].sort((a, b) => shuffleKey(a[0]) - shuffleKey(b[0]) || (a[0] < b[0] ? -1 : 1))
  if (dishes.length <= MENU_SIZE) return dishes.map(([, o]) => o)

  const liked = softLikedFoods.length > 0 ? dishes.filter(([, o]) => optionMatchesLikedFood(o, softLikedFoods as string[])) : []
  const likedRoom = Math.floor(MENU_SIZE / 2)
  const chosen: PoolOption[] = []
  let exotic = false
  const take = (o: PoolOption): boolean => {
    if (chosen.includes(o)) return false
    if (isExoticOption(o)) { if (exotic) return false; exotic = true }
    chosen.push(o)
    return true
  }
  // Liked dishes first, rotating among themselves when there are more than half a menu of them.
  if (liked.length > 0) {
    const start = (week * likedRoom) % liked.length
    for (let i = 0; i < liked.length && chosen.length < Math.min(likedRoom, liked.length); i++) take(liked[(start + i) % liked.length][1])
  }
  // Then the week's window of the shuffled order. Each week starts where a full menu's worth on from the last one,
  // so consecutive weeks do not overlap until the pool is smaller than two menus.
  const start = ((week * MENU_SIZE) % dishes.length + dishes.length) % dishes.length
  for (let i = 0; i < dishes.length && chosen.length < MENU_SIZE; i++) take(dishes[(start + i) % dishes.length][1])
  return chosen
}

const cache = new WeakMap<Pools, Map<string, Pools>>()

/**
 * The menu for the week holding `date`: every meal's menu, or `pools` ITSELF when no meal is deeper than MENU_SIZE.
 * The same inputs return the same object, so a rotation built from a menu is found again by identity.
 */
export function menuFor(pools: Pools, date: string, softLikedFoods: readonly string[] = []): Pools {
  const deep = Object.values(pools).some(opts => (opts?.length ?? 0) > MENU_SIZE)
  if (!deep) return pools
  const week = menuWeekOf(date)
  const key = `${week}\u0000${softLikedFoods.join('\u0001')}`
  let byWeek = cache.get(pools)
  if (!byWeek) { byWeek = new Map(); cache.set(pools, byWeek) }
  const known = byWeek.get(key)
  if (known) return known
  const out: Pools = {}
  for (const [slot, opts] of Object.entries(pools) as [MealSlotName, PoolOption[] | undefined][]) {
    if (!opts) continue
    out[slot] = opts.length > MENU_SIZE ? menuForSlot(opts, week, softLikedFoods) : opts
  }
  byWeek.set(key, out)
  return out
}
