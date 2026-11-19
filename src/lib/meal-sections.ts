// ---------------------------------------------------------------------------
// TODAY'S MEALS, IN THREE PLACES — design handoff 2b, 10 Oct 2026.
//
// Eaten: every meal logged today. Up next: the first meal, in slot order, not
// yet eaten and with a dish to serve. Later: the rest. An upcoming day has
// nothing eaten and nothing up next — every meal on it is still to come.
// Every slot lands in exactly one of the three.
// ---------------------------------------------------------------------------

export interface MealSections<S extends string> {
  eaten: S[]
  upNext: S | null
  later: S[]
}

export function mealSections<S extends string>({ slots, eaten, hasDish, upcoming }: {
  slots: S[]
  eaten: (slot: S) => boolean
  hasDish: (slot: S) => boolean
  upcoming: boolean
}): MealSections<S> {
  if (upcoming) return { eaten: [], upNext: null, later: [...slots] }
  const eatenSlots = slots.filter(eaten)
  const upNext = slots.find(sl => !eatenSlots.includes(sl) && hasDish(sl)) ?? null
  return { eaten: eatenSlots, upNext, later: slots.filter(sl => !eatenSlots.includes(sl) && sl !== upNext) }
}

/**
 * WHICH MEALS THE NUTRITION LIST DRAWS, and which it draws as empty (the Profile walk, 19 Nov 2026; his 14 Nov ruling
 * "a day serves only the meals the profile says").
 *
 * Changing to two meals a day, or to no snacks, keeps the dropped meal's saved dishes (changing back brings them
 * straight back), and the list drew a row for any meal with saved dishes: "Lunch · No option generated", with a
 * Generate button, for a meal he had just said he does not eat.
 *
 * - `listed`: a meal with saved dishes that the profile serves; and any meal he has LOGGED today whatever the profile
 *   now says, because what he ate is never hidden by a later change of settings.
 * - `empty`: a meal the profile serves that has no saved dish (it is shown, honestly, with a way to make one). A meal
 *   the profile does not serve is never shown as empty.
 *
 * `serves` is the profile's own list of meals; EMPTY means "not known" (an older profile with no meal count) and
 * drops nothing. A profile that never said whether snacks are on keeps the snack, as the day engine does
 * (poolsForShape).
 */
export function mealRowsFor<S extends string>({ order, pools, serves, snacksUnset, logged }: {
  order: readonly S[]
  pools: Partial<Record<S, readonly unknown[] | undefined>>
  serves: readonly S[]
  snacksUnset: boolean
  logged: (slot: S) => boolean
}): { listed: S[]; empty: S[] } {
  const count = (s: S) => pools[s]?.length ?? 0
  const served = (s: S) => serves.length === 0 || serves.includes(s) || (s === 'snack' && snacksUnset)
  return {
    listed: order.filter(s => count(s) > 0 && (served(s) || logged(s))),
    empty: order.filter(s => served(s) && (s in pools || serves.includes(s)) && count(s) === 0),
  }
}
