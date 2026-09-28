import { useEffect, useMemo, useState } from 'react'
import { datesFrom, pinsFromPicks, serveMealWeek, ROTATION_DAYS, type MealShape, type Rotation, type ServedDay } from '@/lib/meal-rotation'
import { getMealPicksForDates, setMealPick, swapPoolMeal, type MealSlotName } from '@/lib/meal-store'
import { addGroceryDays, removeGroceryDays, readGroceryCoverage, type AddGroceryDaysResult } from '@/lib/grocery-store'
import { readGroceryBuildMemo } from '@/lib/grocery-display'
import { weekdayLong } from '@/lib/day-labels'
import type { PoolOption } from '@/lib/meal-generation'
import type { MacroTargets } from '@/lib/types'

// ---------------------------------------------------------------------------
// THE NUTRITION STRIP'S DAYS — Ashley, 27 Sep 2026: "I can only see today's
// meal, I can't see upcoming meals and I can't add things to the grocery list
// for future meals so I can plan ahead."
//
// ONE HOOK, SO THE HARNESS RUNS THE APP'S CODE. App.tsx and the browser
// harness both call this; the harness supplies a fake database and nothing
// else. A copy of this wiring in the harness would be a driver measuring the
// copy — the rule `verify:prep-weight` learned the expensive way.
//
// EVERY DAY IS THE SAME DERIVATION AS TODAY, AND TODAY IS ONE OF THEM: the
// seven dates are served in one run by serveDates, each with its own picks
// pinned and the pool as it stood that day, so each day knows the dinner
// actually served the night before (28 Sep 2026). The shopping list is handed
// the same pins (`pinsByDate`) and calls the same function, so the strip and
// the list cannot disagree about what a day holds.
// ---------------------------------------------------------------------------

export interface MealDaysInput {
  profileId: string | undefined
  /** The app's today, `YYYY-MM-DD`, dev-clock aware. */
  today: string
  rotation: Rotation | null
  pools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets | null
  softLikedFoods: string[]
  /**
   * Today's pinned meals (her swaps). Today is worked out HERE, in the same
   * run as the strip, so tomorrow's lunch knows tonight's dinner.
   */
  todaysPins: Partial<Record<MealSlotName, PoolOption>>
  mealShape: MealShape
}

export interface OpenMealDay {
  date: string
  dayName: string
  chosen: Partial<Record<MealSlotName, PoolOption>>
  totals: MacroTargets
  onSwap: (slot: MealSlotName, chooseName: string) => Promise<void>
  onAddToGrocery: () => Promise<AddGroceryDaysResult | null>
  onRemoveFromGrocery: () => Promise<AddGroceryDaysResult | null>
  isOnGroceryList: () => Promise<boolean>
}

/** A day's planned totals: the sum of its chosen meals. */
export function sumChosenMacros(chosen: Partial<Record<MealSlotName, PoolOption>>): MacroTargets {
  return Object.values(chosen).reduce<MacroTargets>(
    (acc, o) => ({
      calories: acc.calories + (o?.macros.calories ?? 0),
      protein: acc.protein + (o?.macros.protein ?? 0),
      carbs: acc.carbs + (o?.macros.carbs ?? 0),
      fat: acc.fat + (o?.macros.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export function useMealDays(input: MealDaysInput) {
  const { profileId, today, rotation, pools, targets, softLikedFoods, todaysPins, mealShape } = input
  /** Picks made on the strip's UPCOMING days, keyed by date. Today's live in App's manualMealPicks. */
  const [futurePicks, setFuturePicks] = useState<Record<string, Partial<Record<MealSlotName, string>>>>({})
  /** The day open on the strip when it is not today. Null means today. */
  const [viewDate, setViewDate] = useState<string | null>(null)

  // Seven days from today — the rotation's own length; an eighth day would be
  // the first one again.
  const dates = useMemo(() => datesFrom(today, ROTATION_DAYS), [today])

  useEffect(() => {
    if (!profileId) { setFuturePicks({}); return }
    let live = true
    void getMealPicksForDates(profileId, dates.slice(1)).then(p => { if (live) setFuturePicks(p) })
    return () => { live = false }
  }, [profileId, dates])

  // A day opened yesterday that is today now, or gone, falls back to today.
  const openDate = viewDate && viewDate > today && dates.includes(viewDate) ? viewDate : null

  const pinsByDate = useMemo(() => {
    const out: Record<string, Partial<Record<MealSlotName, PoolOption>>> = {}
    for (const [date, picks] of Object.entries(futurePicks)) {
      if (date > today) out[date] = pinsFromPicks(picks, pools)
    }
    return out
  }, [futurePicks, pools, today])

  /**
   * Every upcoming day's meals, by name — what the coach is told the strip
   * shows. The same derivation as the open day, so the coach cannot describe
   * a Monday the screen would not serve.
   */
  const week: ServedDay[] = useMemo(
    () => serveMealWeek({ today, dates, todaysPins, pinsByDate, pools, targets, softLikedFoods, shape: mealShape, rotation }),
    [dates, pools, targets, softLikedFoods, mealShape, rotation, pinsByDate, today, todaysPins],
  )
  const todaysChosen = useMemo(() => week[0]?.day.chosen ?? {}, [week])

  const upcoming = useMemo(
    () => week.slice(1).map(({ date, day }) => {
      const meals: Partial<Record<MealSlotName, string>> = {}
      for (const [slot, o] of Object.entries(day.chosen) as [MealSlotName, PoolOption][]) meals[slot] = o.name
      return { date, dayName: weekdayLong(date), meals }
    }),
    [week],
  )

  const openAssembled = openDate ? week.find(w => w.date === openDate)?.day ?? null : null

  /**
   * A swap on an upcoming day: the pool's own swap, then the pick saved for
   * THAT date before the screen shows it — exactly the order today's swap
   * keeps — and it pins that one date, so no other day moves.
   */
  const swap = async (date: string, slot: MealSlotName, chooseName: string, currentName: string | undefined) => {
    if (!profileId) return
    const applied = await swapPoolMeal(profileId, slot, currentName, chooseName)
    if (!applied) return
    await applyPick(date, slot, applied.name)
  }

  /**
   * Makes `name` that date's meal for the slot: saved first, then shown. The
   * coach's confirmed swap for an upcoming day lands here too, so a swap made
   * by chat is the same write as one made by tap. False when it did not save.
   */
  const applyPick = async (date: string, slot: MealSlotName, name: string): Promise<boolean> => {
    if (!profileId || !(date > today)) return false
    try {
      await setMealPick(profileId, date, slot, name)
    } catch (err) {
      console.error('useMealDays: the pick did not save — not applying the swap on screen', err)
      return false
    }
    setFuturePicks(prev => ({ ...prev, [date]: { ...(prev[date] ?? {}), [slot]: name } }))
    return true
  }

  const addToGrocery = async (date: string): Promise<AddGroceryDaysResult | null> => {
    if (!profileId || !targets) return null
    return addGroceryDays({
      profileId, mealPools: pools, targets, softLikedFoods,
      todaysPicks: todaysChosen, pinsByDate, mealShape,
      dates: [date], today,
      legacyStartDate: readGroceryBuildMemo(profileId)?.startDate,
    })
  }

  const removeFromGrocery = async (date: string): Promise<AddGroceryDaysResult | null> => {
    if (!profileId || !targets) return null
    return removeGroceryDays({
      profileId, mealPools: pools, targets, softLikedFoods,
      todaysPicks: todaysChosen, pinsByDate, mealShape,
      dates: [date], today,
      legacyStartDate: readGroceryBuildMemo(profileId)?.startDate,
    })
  }

  const isOnGroceryList = async (date: string): Promise<boolean> => {
    if (!profileId) return false
    return (await readGroceryCoverage(profileId, today, readGroceryBuildMemo(profileId)?.startDate)).includes(date)
  }

  const openDay: OpenMealDay | null = openDate && openAssembled ? {
    date: openDate,
    dayName: weekdayLong(openDate),
    chosen: openAssembled.chosen,
    totals: sumChosenMacros(openAssembled.chosen),
    onSwap: (slot, name) => swap(openDate, slot, name, openAssembled.chosen[slot]?.name),
    onAddToGrocery: () => addToGrocery(openDate),
    onRemoveFromGrocery: () => removeFromGrocery(openDate),
    isOnGroceryList: () => isOnGroceryList(openDate),
  } : null

  return {
    /** Today's meals and the pool and rotation that served them, or null before targets exist. */
    today: week[0] ?? null,
    /** Props for NutritionDisplay's strip. */
    strip: {
      dates,
      today,
      selected: openDate ?? today,
      onSelect: (d: string) => setViewDate(d === today ? null : d),
    },
    /** The open upcoming day, or null when today is open. */
    openDay,
    /** Every upcoming day's pins, for the shopping list's Rebuild. */
    pinsByDate,
    /** Raw picks by date — App hands a new today's across when the date moves on. */
    futurePicks,
    /** The next six days' meals by name, for the coach. */
    upcoming,
    /** Saves and shows a pick for an upcoming date — the coach's confirm path. */
    applyPick,
    /** Put a day on the shopping list, or take it back off — the coach's path too. */
    addToGrocery,
    removeFromGrocery,
  }
}
