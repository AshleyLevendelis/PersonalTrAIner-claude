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

/**
 * A MEAL MADE FOR ONE DAY — Ashley's ruling, 2 Nov 2026 ("Today only"). A food added to, taken out of, swapped in
 * or re-weighed in a meal makes an edited copy, and the card says it is for that day. The copy is served only where a
 * pick names it: no day's search can find it, so later days keep the dish as it was. Before this the copy joined the
 * pool like any dish and came back on later days (whole-app test #8, 1 Nov 2026).
 */
const PIN_ONLY_TAG = 'pin-only'

/** Is this option served only where a pick names it (never by a day's search)? */
export function isPinOnly(option: { tags?: string[] }): boolean {
  return (option.tags ?? []).includes(PIN_ONLY_TAG)
}

/** An option's tags marked as made for one day. */
export function tagsPinOnly(tags: string[]): string[] {
  return tags.includes(PIN_ONLY_TAG) ? tags : [...tags, PIN_ONLY_TAG]
}

/** Is this a tag the app keeps for itself, never one to show as a label? */
export function isBookkeepingTag(tag: string): boolean {
  return tag.startsWith(NEW_FROM_TAG_PREFIX) || tag === PIN_ONLY_TAG
}

/**
 * The labels a meal card shows: at most two, never the old internal
 * 'slot_appropriate' marker, and never the app's own bookkeeping. One
 * function, so the card cannot filter one list and render another.
 */
export function displayTags(tags: string[]): string[] {
  return tags.filter(t => !INTERNAL_TAGS.has(t) && !isBookkeepingTag(t)).slice(0, 2)
}

/**
 * Markers the app writes for its own reasons, never a label. 'user-requested' says a dish was asked for or edited
 * (the dish-identity rule reads it), and 'own recipe' is the verifier's mark on a dish costed from her own amounts:
 * both showed as chips on every edited, moved or added-to meal (1 Nov 2026, whole-app test, meal cards).
 */
const INTERNAL_TAGS = new Set(['slot_appropriate', 'user-requested', 'own recipe'])
