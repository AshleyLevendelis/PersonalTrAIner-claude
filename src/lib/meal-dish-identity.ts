import { USER_REQUESTED_TAG } from './meal-store'
import type { PoolOption } from './meal-generation'

// ---------------------------------------------------------------------------
// WHICH DISH IS THIS, for the question "have I served it lately?" — Ashley,
// 29 Sep 2026, the third item on her list: a meal with a food added (her
// yoghurt bowl with honey) counts as a different dish, so the app thinks it is
// giving variety when it is not.
//
// An edit never changes a meal, it makes a NEW pool option beside it: adding
// honey to "Greek Yoghurt Berry Power Bowl" stores "Greek Yoghurt Berry Power
// Bowl + 1 sachet honey" as a second dish. The variety code compares dishes by
// name, so the plain bowl on Monday and the honey bowl on Tuesday read as two
// different dishes — and to the person eating them they are one.
// Measured on 60 seeded pools with one edited variant per slot: adding the
// variant made consecutive days repeat the same dish 601 times out of 1,080
// against 524 without it, while the count of consecutive identical NAMES fell
// from 524 to 395. Variety scored better and got worse.
//
// SO A DISH HAS AN IDENTITY, and an edited copy shares its base's. Found by
// name, not by a tag, because the tag would only reach meals edited from now on
// and this has to work on the plan she already has: the edit builders name
// what they make by fixed connectors (" + food", " without food", " with ...",
// " (as dinner)"), and the base is another option in the same pool whose name
// the edit's name STARTS WITH. Two things keep that from misfiring:
//   - only options carrying USER_REQUESTED_TAG are ever read as edits. Every
//     option an edit, an addition or a custom meal makes is tagged so, and no
//     generated option is, so a generated "Salmon with New Potatoes" beside a
//     generated "Salmon" stay two dishes;
//   - the connector is required, so a requested "Salmon bowl" is not an edit
//     of "Salmon".
// ---------------------------------------------------------------------------

/** What follows the base's name in an edit's name. The builders' own words. */
const EDIT_CONNECTOR = /^(?: \+ | without | with | \(as (?:breakfast|lunch|dinner|snack)\)$)/

/** name -> the name of the dish it is a copy of (itself, when it is not a copy). */
export type DishKeys = Map<string, string>

function build(options: readonly PoolOption[]): DishKeys {
  const asked = new Set(options.filter(o => o.tags?.includes(USER_REQUESTED_TAG)).map(o => o.name))
  const names = [...new Set(options.map(o => o.name))]
  const keys: DishKeys = new Map()
  const resolve = (name: string): string => {
    const known = keys.get(name)
    if (known !== undefined) return known
    let base: string | null = null
    if (asked.has(name)) {
      for (const other of names) {
        // The longest other name this one extends with a connector is its base.
        if (other === name || other.length >= name.length || !name.startsWith(other)) continue
        if (!EDIT_CONNECTOR.test(name.slice(other.length))) continue
        if (base === null || other.length > base.length) base = other
      }
    }
    // A base is shorter than its copy, so this always ends.
    const key = base === null ? name : resolve(base)
    keys.set(name, key)
    return key
  }
  for (const n of names) resolve(n)
  return keys
}

const cache = new WeakMap<readonly PoolOption[], DishKeys>()

/** The identity of every option in one slot's pool. Cached per pool array: a week asks for the same few pools again and again. */
export function dishKeysFor(options: readonly PoolOption[] | undefined): DishKeys {
  if (!options || options.length === 0) return new Map()
  let keys = cache.get(options)
  if (!keys) {
    keys = build(options)
    cache.set(options, keys)
  }
  return keys
}

/** A name's identity; a name the pool does not hold is its own. */
export const dishKeyOf = (keys: DishKeys, name: string): string => keys.get(name) ?? name

/** Are these two the same dish, an edited copy counting as its base? */
export function sameDish(options: readonly PoolOption[] | undefined, a: string, b: string): boolean {
  const keys = dishKeysFor(options)
  return dishKeyOf(keys, a) === dishKeyOf(keys, b)
}
