import { useEffect, useState } from 'react'
import { ShoppingBasket } from 'lucide-react'
import { getAllItems, coveredDates, type GroceryItemRow } from '@/lib/grocery-store'
import { readGroceryBuildMemo } from '@/lib/grocery-display'
import { getMealPicksForDates } from '@/lib/meal-store'
import { groceryHash } from '@/lib/app-route'
import { isGroceryDueToday, snoozeForADay } from '@/lib/shop-day-store'
import { shopCardState } from '@/lib/shop-card'
import type { WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// SHOPPING, ON THE DAY YOU SHOP — design handoff 2d, 12 Sep 2026.
//
// The list left the Tools tab because it is not a utility; it is a weekly
// errand built from the week's meals. An errand wants to find you on the
// right day rather than wait behind a tile, so on shop day it is a card on
// Home and every other day it is a link on Nutrition and nothing else.
//
// THREE CONDITIONS, ALL OF THEM, and they live in shop-day-store so that the
// card and anything that talks about the card cannot disagree: there is
// something unchecked to buy, today is the shop day, and she has not already
// said "not today".
//
// IT SAYS WHAT IS IN THE LIST, not just that there is one. A card reading
// "you have a shopping list" is a tile with extra steps; the count and the
// first few names are what let her decide from Home whether to open it.
// ---------------------------------------------------------------------------

export function ShopDayCard({ profileId, exercisePlan, todayName, today, nowMs }: {
  profileId?: string
  /** For the default shop day — the day before the week's first training day. */
  exercisePlan: WorkoutDay[]
  /** The app's frozen "what day is it", not a fresh clock. */
  todayName: string
  /** The app's today as a date (YYYY-MM-DD) — which of the list's days are still ahead. */
  today: string
  nowMs: number
}) {
  const [items, setItems] = useState<GroceryItemRow[] | null>(null)
  const [picks, setPicks] = useState<Record<string, Partial<Record<string, string>>> | undefined>(undefined)
  const [dismissed, setDismissed] = useState(false)
  const legacyStartDate = readGroceryBuildMemo(profileId)?.startDate

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    void getAllItems(profileId)
      .then(async rows => {
        if (cancelled) return
        setItems(rows)
        // THE MEALS NOW, for the days the list covers: a swap made since the
        // build is a meal the list does not hold. A failed read is "no
        // picks", which can only ever under-report a change.
        const ahead = coveredDates(rows, today, legacyStartDate).filter(d => d >= today)
        const read = await getMealPicksForDates(profileId, ahead).catch(() => undefined)
        if (!cancelled) setPicks(read)
      })
      // A LIST THAT CANNOT BE READ SHOWS NO CARD, rather than a card claiming
      // zero things to buy. The two are not the same statement.
      .catch(() => { if (!cancelled) setItems(null) })
    return () => { cancelled = true }
  }, [profileId, today, legacyStartDate])

  if (!items || dismissed) return null
  const state = shopCardState({ items, today, legacyStartDate, picks })
  const unchecked = state.toBuy
  const checked = state.checked
  if (!isGroceryDueToday({ todayName, plan: exercisePlan, uncheckedCount: unchecked.length, nowMs, listOutOfDate: state.outOfDate })) return null

  const names = unchecked.slice(0, 4).map(i => i.display_name)
  const more = unchecked.length - names.length
  // NEVER "the week ahead" unless it is (M44): the list's own coverage
  // otherwise, and that it is out of date.
  const staleLines = state.outOfDate
    ? [
        state.coverage ?? 'Built for days that have passed.',
        state.mealsChanged ? 'Meals have changed since it was built.' : null,
        'Rebuild it to match this week — anything ticked or edited stays.',
      ].filter((l): l is string => !!l)
    : []

  return (
    <div
      data-shop-day-card
      style={{ background: 'var(--card)', borderRadius: 18, padding: 16, boxShadow: 'inset 3px 0 0 var(--primary)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-semibold uppercase" style={{ fontSize: '0.65625rem', letterSpacing: '.16em', color: 'var(--primary-text)' }}>
          <ShoppingBasket className="size-4" aria-hidden />
          Shopping
        </span>
        {state.weekAhead
          ? <span className="text-[0.6875rem] text-muted-foreground" data-shop-day-scope>for the week ahead</span>
          : state.outOfDate && <span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--role-warn-text)' }} data-shop-day-scope>out of date</span>}
      </div>

      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="tabular-mono" style={{ fontSize: '2.125rem', fontWeight: 700, lineHeight: 1 }}>{unchecked.length}</span>
        <span className="text-[0.8125rem]" style={{ color: 'var(--text-tertiary)' }}>
          thing{unchecked.length === 1 ? '' : 's'} to buy{checked > 0 ? ` · ${checked} already in` : ''}
        </span>
      </div>

      {names.length > 0 && (
        <p className="mt-1.5 text-[0.75rem] text-muted-foreground">
          {names.join(', ')}{more > 0 ? ` +${more}` : ''}
        </p>
      )}

      {staleLines.length > 0 && (
        <p className="mt-1.5 text-[0.75rem]" style={{ color: 'var(--text-tertiary)' }} data-shop-day-stale>
          {staleLines.join(' ')}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-shop-day-open
          onClick={() => { window.location.hash = groceryHash() }}
          className="flex-1 font-semibold"
          style={{ height: 44, borderRadius: 12, border: 0, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.9375rem' }}
        >
          {state.outOfDate ? 'Rebuild the list' : 'Open the list'}
        </button>
        <button
          type="button"
          data-shop-day-snooze
          onClick={() => { snoozeForADay(nowMs); setDismissed(true) }}
          className="font-medium"
          style={{ height: 44, padding: '0 16px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}
        >
          Not today
        </button>
      </div>
    </div>
  )
}
