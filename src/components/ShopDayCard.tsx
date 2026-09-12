import { useEffect, useState } from 'react'
import { ShoppingBasket } from 'lucide-react'
import { getAllItems, type GroceryItemRow } from '@/lib/grocery-store'
import { groceryHash } from '@/lib/app-route'
import { isGroceryDueToday, snoozeForADay } from '@/lib/shop-day-store'
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

export function ShopDayCard({ profileId, exercisePlan, todayName, nowMs }: {
  profileId?: string
  /** For the default shop day — the day before the week's first training day. */
  exercisePlan: WorkoutDay[]
  /** The app's frozen "what day is it", not a fresh clock. */
  todayName: string
  nowMs: number
}) {
  const [items, setItems] = useState<GroceryItemRow[] | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    void getAllItems(profileId)
      .then(rows => { if (!cancelled) setItems(rows) })
      // A LIST THAT CANNOT BE READ SHOWS NO CARD, rather than a card claiming
      // zero things to buy. The two are not the same statement.
      .catch(() => { if (!cancelled) setItems(null) })
    return () => { cancelled = true }
  }, [profileId])

  if (!items || dismissed) return null
  const unchecked = items.filter(i => !i.checked)
  const checked = items.length - unchecked.length
  if (!isGroceryDueToday({ todayName, plan: exercisePlan, uncheckedCount: unchecked.length, nowMs })) return null

  const names = unchecked.slice(0, 4).map(i => i.display_name)
  const more = unchecked.length - names.length

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
        <span className="text-[0.6875rem] text-muted-foreground">for the week ahead</span>
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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-shop-day-open
          onClick={() => { window.location.hash = groceryHash() }}
          className="flex-1 font-semibold"
          style={{ height: 44, borderRadius: 12, border: 0, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.9375rem' }}
        >
          Open the list
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
