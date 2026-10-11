import { useEffect, useMemo, useState } from 'react'
import { datesFrom, pinsFromPicks, serveMealWeek, ROTATION_DAYS, type MealShape, type Rotation, type ServedDay } from '@/lib/meal-rotation'
import { computeSlotBudgets, type HeldAround } from '@/lib/meal-generation'
import { getMealPicksForDates, setMealPick, swapPoolMeal, getTodayLedger, loggedEventsBySlot, type MealSlotName } from '@/lib/meal-store'
import { addGroceryDays, removeGroceryDays, readGroceryCoverage, type AddGroceryDaysResult } from '@/lib/grocery-store'
import { readGroceryBuildMemo } from '@/lib/grocery-display'
import { weekdayLong } from '@/lib/day-labels'
import type { PoolOption } from '@/lib/meal-generation'
import type { MealDayMoveArgs, MealDayMoveController, MealDayMovePayload, MealDayMoveResult } from '@/lib/meal-day-move'
import type { PendingActionReceipt } from '@/lib/pending-actions-store'
import { DAY_MOVE, KNOCK_ON } from '@/lib/coach-voice'
import type { MealKnockOn } from '@/lib/meal-knock-on'
import type { MacroTargets } from '@/lib/types'
import { readKeptHeldSizes, writeKeptHeldSize } from '@/lib/held-sizes-kept'

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
  /**
   * Puts a saved pick for TODAY on screen (`null`: no pick). Today's picks
   * live with the app, not here, so a meal swapped with another day's can
   * reach today's row. Absent, only the upcoming days update.
   */
  showTodaysPick?: (slot: MealSlotName, name: string | null) => void
  /**
   * Re-reads the meal options. Only a swap of two DIFFERENT meals needs it: it
   * adds a resized copy of each, and a pick can only be shown once the screen
   * knows the option it names. Absent, that kind of swap still saves and the
   * screen catches up on its next read.
   */
  reloadPools?: () => Promise<void>
  /** What a resized meal is verified against (only a swap of two different meals resizes one). */
  dietaryPreferences?: string[]
  /** A getter, because a caller may work its dislikes out after it calls the hook. */
  dislikedFoods?: () => string[]
}

/** One saved pick, to be shown. `null` clears it. */
export interface ShownPick { date: string; slot: MealSlotName; name: string | null }

export interface OpenMealDay {
  date: string
  dayName: string
  chosen: Partial<Record<MealSlotName, PoolOption>>
  totals: MacroTargets
  /** What a swap did to this day's other meals (M34), when one was made. */
  heldAround?: HeldAround
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
  const { profileId, today, rotation, pools, targets, softLikedFoods, todaysPins, mealShape, showTodaysPick, reloadPools, dietaryPreferences, dislikedFoods } = input
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

  // UNDO ON "RESIZED TO FIT AROUND YOUR SWAP" (runs 3-4, M34), by date. On
  // the phone, read by the shopping list too, so the two serve one week.
  const [keptHeldSizes, setKeptHeldSizes] = useState<string[]>(() => readKeptHeldSizes(profileId))
  useEffect(() => { setKeptHeldSizes(readKeptHeldSizes(profileId)) }, [profileId])
  const keepHeldSizes = (date: string, keep: boolean) => {
    if (!profileId) return
    setKeptHeldSizes(writeKeptHeldSize(profileId, date, keep))
  }

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
    () => serveMealWeek({ today, dates, todaysPins, pinsByDate, pools, targets, softLikedFoods, shape: mealShape, rotation, keepHeldSizes: keptHeldSizes }),
    [dates, pools, targets, softLikedFoods, mealShape, rotation, pinsByDate, today, todaysPins, keptHeldSizes],
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

  /**
   * Shows picks that are ALREADY SAVED. State only, no write: the swap across
   * days writes both picks first and shows them together, so the screen never
   * serves one dish on two days while the second write is in flight.
   */
  const showPicks = (updates: ShownPick[]) => {
    const future = updates.filter(u => u.date > today)
    for (const u of updates) if (u.date === today) showTodaysPick?.(u.slot, u.name)
    if (future.length === 0) return
    setFuturePicks(prev => {
      const next = { ...prev }
      for (const u of future) {
        const day = { ...(next[u.date] ?? {}) }
        if (u.name) day[u.slot] = u.name
        else delete day[u.slot]
        next[u.date] = day
      }
      return next
    })
  }

  /** Which of today's meals are logged as eaten. Null when the ledger cannot be read: never "nothing". */
  const readLoggedToday = async (): Promise<MealSlotName[] | null> => {
    if (!profileId || !targets) return null
    try {
      const ledger = await getTodayLedger(profileId, today, targets)
      const logged = loggedEventsBySlot(ledger.events)
      return (Object.keys(logged) as MealSlotName[]).filter(s => (logged[s]?.length ?? 0) > 0)
    } catch {
      return null
    }
  }

  /**
   * SWAP A MEAL WITH ANOTHER DAY'S (Ashley, 29 Sep 2026: they swap places).
   * The whole decision is buildMealDayMoveProposal, run over THIS hook's week
   * so the trial is the week the screen serves. What it cannot know itself is
   * read here: which of today's meals are already eaten, and which days are on
   * the shopping list. Either read failing is passed as `null`, never as
   * "nothing", so an unreadable ledger or list is said on the card rather than
   * treated as empty. Imported lazily: first paint never needs it.
   */
  const planDayMove = async (rawArgs: MealDayMoveArgs): Promise<MealDayMoveResult> => {
    const { buildMealDayMoveProposal } = await import('@/lib/meal-day-move')
    // Null (never "nothing") when the ledger or the list cannot be read: the
    // builder refuses a move involving today, and the card says the list could
    // not be checked.
    const loggedTodaySlots = await readLoggedToday()
    let listDates: string[] | null = null
    if (profileId && targets) {
      try {
        listDates = await readGroceryCoverage(profileId, today, readGroceryBuildMemo(profileId)?.startDate, { strict: true })
      } catch { /* stays null: the card says the list could not be checked */ }
    }
    return buildMealDayMoveProposal({
      profileId: profileId ?? '',
      rawArgs,
      serving: { today, dates, todaysPins, pinsByDate, pools, targets, softLikedFoods, shape: mealShape, rotation, keepHeldSizes: keptHeldSizes },
      loggedTodaySlots,
      listDates,
      dietaryPreferences,
      dislikedFoods: dislikedFoods?.(),
    })
  }

  /**
   * WHAT ELSE CHANGES when a new option becomes a date's meal (9 Oct 2026, the
   * test log's H9): the trial behind the add-a-food card and the custom-meal
   * card, run over THIS hook's week — the one the screen serves — with the
   * same shopping-list read the day swap makes. Never throws: a trial that
   * cannot run comes back as the line saying it could not be checked.
   */
  const knockOn = async (date: string, slot: MealSlotName, option: PoolOption): Promise<MealKnockOn> => {
    const { knockOnOfPin } = await import('@/lib/meal-knock-on')
    let listDates: string[] | null = null
    if (profileId && targets) {
      try {
        listDates = await readGroceryCoverage(profileId, today, readGroceryBuildMemo(profileId)?.startDate, { strict: true })
      } catch { /* stays null: the card says the list could not be checked */ }
    }
    try {
      return knockOnOfPin({
        serving: { today, dates, todaysPins, pinsByDate, pools, targets, softLikedFoods, shape: mealShape, rotation, keepHeldSizes: keptHeldSizes },
        date, slot, option, listDates,
      })
    } catch (err) {
      console.error('useMealDays: the knock-on trial failed', err)
      return { changes: [], lines: [{ severity: 'info', text: KNOCK_ON.unknown }] }
    }
  }

  /**
   * Confirm re-plans against the live week and writes only if every day still
   * gets the dish the card named. A dish swapped on either day since the card
   * was built would otherwise be overwritten by a pick for a card she read
   * before it changed.
   */
  const confirmDayMove = async (payload: MealDayMovePayload): Promise<PendingActionReceipt> => {
    const failed = (error: string): PendingActionReceipt => ({ landed: [], failed: [{ op: 'propose_meal_day_move', error }] })
    if (!profileId) return failed(DAY_MOVE.why.saveFailed)
    const [{ sameMealDayMove }, { executeMealDayMove }] = await Promise.all([
      import('@/lib/meal-day-move'),
      import('@/lib/pending-action-executor'),
    ])
    const live = await planDayMove({
      meal_slot: payload.legs[0].slot, from_date: payload.legs[0].date,
      to_date: payload.legs[1].date, to_slot: payload.legs[1].slot,
    })
    if (!live.ok || !sameMealDayMove(live.payload, payload)) return failed(DAY_MOVE.why.changed)
    return executeMealDayMove(profileId, live.payload, { show: showPicks, reloadPools })
  }

  /**
   * Puts a confirmed swap back (30 Sep 2026). The payload IS the record of
   * what the swap wrote and what was there before, so the sheet and the coach
   * hand back the payload they already hold. It reads the ledger again: a meal
   * of today's eaten since the swap is left alone.
   */
  const undoDayMove = async (payload: MealDayMovePayload): Promise<PendingActionReceipt> => {
    if (!profileId) return { landed: [], failed: [{ op: 'propose_meal_day_move', error: DAY_MOVE.undo.saveFailed }] }
    const { undoMealDayMove } = await import('@/lib/pending-action-executor')
    return undoMealDayMove(profileId, payload, { show: showPicks, reloadPools, today, loggedTodaySlots: await readLoggedToday() })
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
    heldAround: openAssembled.heldAround,
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
    /** Undo (keep) or redo (false) the re-size around a swap on one date: the screen and the list follow. */
    keepHeldSizes,
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
    /**
     * Swap a meal with another day's: what the Move sheet and the coach both
     * call, so the coach cannot offer a swap the sheet would refuse.
     */
    dayMove: {
      dates, today,
      slots: targets ? (Object.keys(computeSlotBudgets(targets, mealShape.mealsPerDay, mealShape.includeSnacks)) as MealSlotName[]) : [],
      plan: planDayMove, confirm: confirmDayMove, undo: undoDayMove, knockOn,
    } satisfies MealDayMoveController,
  }
}
