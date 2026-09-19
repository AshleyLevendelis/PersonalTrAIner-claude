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

/** The names this profile has marked. Empty on a failed read — see below. */
export async function readFavouriteNames(profileId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('favorite_meals')
    .select('name')
    .eq('profile_id', profileId)
  if (error || !data) {
    // A FAILED READ IS NOT AN EMPTY LIST, but here the two lead to the same
    // screen: an unfilled heart. The alternative — showing every meal as
    // favourited because the read failed — would have someone un-hearting
    // meals they never marked. Logged rather than silent, so a read that
    // fails every time is not indistinguishable from a profile with no
    // favourites.
    console.error('Reading favourite meals failed — hearts will show unfilled:', error)
    return new Set()
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

  const row = {
    meal_slot: meal.slot,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
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
