// ---------------------------------------------------------------------------
// A MEAL'S FIRST DAY — kept in a module of its own because both the pool
// builder (which stamps it) and the rotation (which honours it) need it, and
// the rotation already imports the pool builder.
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * A MEAL'S FIRST DAY — Ashley's ruling, 28 Sep 2026 ("Button, keep today").
 *
 * Options added to a plan that already exists carry the first date they may
 * be served on, as a tag. Before it they do not exist, so every earlier day is
 * worked out from the pool it was worked out from yesterday, through the same
 * rotation: the same dishes, the same resized portions, the same leftovers.
 * Holding a day by saving its dish names was measured and rejected: a name
 * brings back the stored portion, and 66% of days at 10% target drift carry a
 * dish the search resized, by a median 27%.
 *
 * A DATE, NOT A LIST OF HELD DAYS, because days are a chain: a lunch is last
 * night's dinner, so a held day needs the day before it held too. See
 * docs/plans/meal-top-up.md.
 */
export const NEW_FROM_TAG_PREFIX = 'new-from:'

/** The first date an option may be served on, or null when it has always been servable. */
export function newFromDate(option: { tags?: string[] }): string | null {
  const tag = (option.tags ?? []).find(t => t.startsWith(NEW_FROM_TAG_PREFIX))
  const date = tag?.slice(NEW_FROM_TAG_PREFIX.length) ?? ''
  return DATE_PATTERN.test(date) ? date : null
}

/** An option's tags with its first day set to `date` (replacing any earlier one). */
export function tagsNewFrom(tags: string[], date: string): string[] {
  return [...tags.filter(t => !t.startsWith(NEW_FROM_TAG_PREFIX)), `${NEW_FROM_TAG_PREFIX}${date}`]
}

/** Is this a tag the app keeps for itself, never one to show as a label? */
export function isBookkeepingTag(tag: string): boolean {
  return tag.startsWith(NEW_FROM_TAG_PREFIX)
}

/**
 * The labels a meal card shows: at most two, never the old internal
 * 'slot_appropriate' marker, and never the app's own bookkeeping. One
 * function, so the card cannot filter one list and render another.
 */
export function displayTags(tags: string[]): string[] {
  return tags.filter(t => t !== 'slot_appropriate' && !isBookkeepingTag(t)).slice(0, 2)
}
