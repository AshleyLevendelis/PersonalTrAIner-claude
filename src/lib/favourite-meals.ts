// ---------------------------------------------------------------------------
// MEALS SOMEBODY ACTUALLY WANTS AGAIN
// ---------------------------------------------------------------------------
// Ashley, 19 Sep 2026, from four options: **a heart on the meal row.** The app
// never asks whether a meal was any good; she says so when she wants to. She
// rejected asking after every meal, asking once a day, and inferring it from
// what got logged — the last one because not logging a meal usually means a
// busy evening, not a bad dinner, and an app drawing conclusions from silence
// is an app that will be confidently wrong.
//
// THE TABLE ALREADY EXISTED, AND ONLY THE CHAT COULD WRITE TO IT. favorite_meals
// has been there since July, carries a `times_used` counter, and is read into
// the coach's context as `favorites_summary` every turn — so the coach has
// always known your favourites and the screen has never been able to name one.
// That is a parity gap of exactly the kind docs/coach-screen-parity.md exists
// to count, and it is closed here rather than by adding a second store.
//
// ONE WRITE PATH, WHICH IS THE POINT OF THIS FILE. Before it, the only writer
// was a closure inside ChatAssistant. A heart on the meal card could easily
// have become a second, subtly different upsert — a different name for the
// same dish, a `times_used` that counts something else — and the two would
// have drifted without anything noticing. Both surfaces now call the functions
// below, which is the same "parity by construction" shape the meal-resize
// offer uses.
//
// WHAT THE TAP BUYS, so it is not a bookmark. A favourite is tagged on the
// stored pool row, and persistPools keeps tagged rows when everything else is
// regenerated — the mechanism that already protects a meal the coach was asked
// for by name. Hearting a dinner means "Regenerate all" stops throwing it away.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { FAVOURITE_TAG, type MealSlotName } from './meal-store'
import type { PoolOption } from './meal-generation'

/** What both surfaces need to describe a meal they are marking. */
export interface FavouriteMealInput {
  name: string
  slot: MealSlotName | string
  calories: number
  protein: number
  carbs: number
  fat: number
  portionSize?: string | null
  prep?: string | null
}

export function favouriteInputFromOption(option: PoolOption): FavouriteMealInput {
  return {
    name: option.name,
    slot: option.slot,
    calories: option.macros.calories,
    protein: option.macros.protein,
    carbs: option.macros.carbs,
    fat: option.macros.fat,
    prep: option.prep ?? null,
  }
}

/**
 * WHO IS TOLD WHEN A HEART CHANGES — 27 Sep 2026, when a heart started to
 * count as a like (Ashley: "Hearting a meal counts as a like too"). App's
 * likes list and the meal rows read favourites independently; without this a
 * heart tapped on Nutrition, or set by the coach, would reach neither until a
 * reload, and "favoured when picking each day" would quietly not be true for
 * the meal she had just hearted.
 */
const listeners = new Set<() => void>()
export function subscribeFavourites(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
/**
 * Read this profile's hearted names now and again after every heart change,
 * handing each good answer to `onNames`. The one way to follow favourites, so
 * the three readers (the meal rows, App's likes, Profile) cannot each get the
 * two hard parts differently:
 *   - a FAILED read keeps the last good list (onError is told, if given);
 *   - reads can finish out of order, and only the LATEST one started is
 *     applied, so two quick hearts cannot end with the first one's answer.
 */
export function watchFavouriteNames(
  profileId: string,
  onNames: (names: Set<string>) => void,
  onError?: () => void,
): () => void {
  let live = true
  let latest = 0
  const read = () => {
    const ticket = ++latest
    void readFavouriteNames(profileId).then(names => {
      if (!live || ticket !== latest) return
      if (names) onNames(names)
      else onError?.()
    })
  }
  read()
  const unsubscribe = subscribeFavourites(read)
  return () => { live = false; unsubscribe() }
}

function notifyFavourites(): void {
  for (const l of listeners) l()
}

/** The names this profile has marked, or null when the read failed — see below. */
async function readFavouriteNames(profileId: string): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from('favorite_meals')
    .select('name')
    .eq('profile_id', profileId)
  if (error || !data) {
    // A FAILED READ IS NOT AN EMPTY LIST, and since 27 Sep 2026 the
    // difference matters beyond the heart icons: hearts are likes, so "none"
    // would change which day is served and what new meals are asked for.
    // Null, and watchFavouriteNames keeps the last good answer. Logged, so a
    // read that fails every time is not indistinguishable from no favourites.
    console.error('Reading favourite meals failed — keeping the last good list:', error)
    return null
  }
  return new Set((data as { name: string }[]).map(r => r.name))
}

/**
 * Mark a meal, or bump its counter if it is already marked.
 *
 * `times_used` counts how many times this profile has ASKED FOR the dish, by
 * hearting it or by requesting it in chat. It is not "times eaten" — nothing
 * here watches the meal log — and the coach's context says "used Nx" off this
 * number, so a second meaning would make the coach quietly wrong.
 */
export async function markFavourite(profileId: string, meal: FavouriteMealInput): Promise<boolean> {
  if (!profileId || !meal.name) return false
  const { data: existing, error: readError } = await supabase
    .from('favorite_meals')
    .select('id, times_used')
    .eq('profile_id', profileId)
    .eq('name', meal.name)
    .maybeSingle()
  if (readError) {
    console.error(`Couldn't check whether ${meal.name} is already a favourite:`, readError)
    return false
  }

  // WHOLE NUMBERS, ROUNDED HERE — at the one write, so no caller can forget.
  // The four columns are `integer`, and a meal's macros carry one decimal
  // (46.6 g of protein): PostgREST does not round a decimal into an integer
  // column, it rejects the row. From the day the heart shipped (19 Sep 2026)
  // to 9 Oct it had never saved a single real meal — 0 of 152 library dishes
  // have whole-number protein, carbs and fat — and said nothing (M21). These
  // figures are a summary for the coach's "used Nx" line, not what the day is
  // costed from; whole grams lose nothing.
  const row = {
    meal_slot: meal.slot,
    calories: Math.round(meal.calories),
    protein: Math.round(meal.protein),
    carbs: Math.round(meal.carbs),
    fat: Math.round(meal.fat),
    portion_size: meal.portionSize || null,
    prep: meal.prep || null,
  }

  const { error } = existing
    ? await supabase.from('favorite_meals')
      .update({ ...row, times_used: (existing as { times_used: number }).times_used + 1, last_used_at: new Date().toISOString() })
      .eq('id', (existing as { id: string }).id)
    : await supabase.from('favorite_meals')
      .insert({ profile_id: profileId, name: meal.name, ...row })

  if (error) {
    console.error(`Couldn't save ${meal.name} as a favourite:`, error)
    return false
  }
  await tagPoolRow(profileId, meal.name, true)
  notifyFavourites()
  return true
}

/** Unmark it. The row goes entirely rather than counting down — a heart is on or off. */
export async function unmarkFavourite(profileId: string, name: string): Promise<boolean> {
  if (!profileId || !name) return false
  const { error } = await supabase
    .from('favorite_meals')
    .delete()
    .eq('profile_id', profileId)
    .eq('name', name)
  if (error) {
    console.error(`Couldn't remove ${name} from your favourites:`, error)
    return false
  }
  await tagPoolRow(profileId, name, false)
  notifyFavourites()
  return true
}

/**
 * Add or remove the tag that makes persistPools keep this row when everything
 * else is regenerated.
 *
 * FAILS QUIETLY AND ON PURPOSE, which is the opposite of the rule everywhere
 * else in this file. The favourite itself is already saved by the time this
 * runs; if the tag write fails, the meal is still marked and still reaches the
 * coach, and the only loss is that a regenerate could drop it. Reporting that
 * as "couldn't save your favourite" would be a lie about what happened. The
 * pool row can also legitimately not exist — a meal logged from history, or
 * one hearted after its pool was replaced — and that is not an error either.
 */
async function tagPoolRow(profileId: string, name: string, add: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('meal_plan_slots')
    .select('id, tags')
    .eq('profile_id', profileId)
    .eq('name', name)
  if (error || !data || data.length === 0) return

  for (const row of data as { id: string; tags: string[] | null }[]) {
    const tags = row.tags ?? []
    const has = tags.includes(FAVOURITE_TAG)
    if (add === has) continue
    const next = add ? [...tags, FAVOURITE_TAG] : tags.filter(t => t !== FAVOURITE_TAG)
    const { error: writeError } = await supabase.from('meal_plan_slots').update({ tags: next }).eq('id', row.id)
    if (writeError) console.error(`Couldn't ${add ? 'protect' : 'release'} ${name} across a regenerate:`, writeError)
  }
}
