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
