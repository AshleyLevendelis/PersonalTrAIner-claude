import { useState } from 'react'
import { ChevronDown, ShoppingCart } from 'lucide-react'
import type { MacroTargets } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import { dayVerdictLabel } from '@/lib/meal-generation'
import { dayOfMonth, weekdayShort } from '@/lib/day-labels'
import { plannedRings, ringShares } from '@/lib/nutrition-week'
import { NestedRings, MealMacros, KcalSwatch, DayVerdict, RING_COLOR, RING_LABEL } from '@/components/nutrition/NutritionRings'
import { AddDayToGrocery, SLOT_LABEL, SLOT_ORDER, type UpcomingMealDay } from '@/components/MealPlan'

// ---------------------------------------------------------------------------
// THE WEEK AHEAD ON NUTRITION — his design handoff of 11 Nov 2026, "W1 + W3" (he rejected W2, a long scroll of full
// day cards). W1: a future day tapped in the strip turns the rings card into that day's PLANNED totals, with the
// engine's own verdict and the strip's add-to-list moved into it. W3: the strip's seven days on one screen, small
// rings each, one open at a time. Presentation only: every day, meal and number comes from the week the strip
// already serves (useMealDays), and the verdict is dayVerdictLabel, never a second opinion.
// ---------------------------------------------------------------------------

/** The violet of a planned day, the strip's selected future day and this card's border. */
const PLANNED_INK = 'color-mix(in srgb, var(--chart-2) 55%, var(--foreground))'
const PLANNED_BORDER = 'color-mix(in srgb, var(--chart-2) 45%, transparent)'

const MACROS = ['calories', 'protein', 'carbs', 'fat'] as const

/** "2,710" — a whole number as the screen prints it. */
const n = (v: number) => Math.round(v).toLocaleString('en-GB')

/**
 * W1: AN UPCOMING DAY'S RINGS CARD, "planned". Four rings (no water: water is logged, never planned), each filled by
 * planned over target; four rows beside it; the day's verdict top right; "Add Friday to the shopping list" at the foot.
 */
export function PlannedDayCard({ date, totals, targets, upcoming }: {
  date: string
  totals: MacroTargets
  targets: MacroTargets | null
  upcoming: UpcomingMealDay
}) {
  const verdict = targets ? dayVerdictLabel(totals, targets) : null
  const shares = ringShares(totals, targets)
  return (
    <div
      className="rounded-[24px] p-5"
      style={{ background: 'var(--surface-deep)', border: `1px solid ${PLANNED_BORDER}`, boxShadow: '0 10px 30px rgba(0, 0, 0, .35)' }}
      data-planned-card={date}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[.12em]" style={{ color: PLANNED_INK }} data-testid="planned-kicker">
          {upcoming.dayName} {dayOfMonth(date)} · planned
        </span>
        {verdict && (
          <span className="text-[0.75rem]"><DayVerdict label={verdict} data-testid="planned-verdict" /></span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <NestedRings
          size={150}
          rings={plannedRings(150)}
          shares={shares}
          label={`${upcoming.dayName}'s planned meals: ${n(totals.calories)}${targets ? ` of ${n(targets.calories)}` : ''} kcal, ${Math.round(totals.protein)} g protein, ${Math.round(totals.carbs)} g carbs, ${Math.round(totals.fat)} g fat.`}
          data-testid="planned-rings"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3" data-planned-rows>
          {MACROS.map(k => (
            <div key={k} className="flex items-center gap-2 text-[0.8125rem]" data-planned-row={k}>
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: RING_COLOR[k] }} />
              <span className="flex-1 font-semibold">{RING_LABEL[k]}</span>
              <span className="tabular-mono shrink-0 text-[0.75rem]">
                <span className="font-bold" data-planned-value>{n(totals[k])}</span>
                <span className="text-muted-foreground">/{targets ? n(targets[k]) : '—'}{k === 'calories' ? '' : 'g'}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <AddDayToGrocery key={date} upcoming={upcoming} />
      </div>
    </div>
  )
}

export interface WeekViewDay {
  date: string
  dayName: string
  chosen: Partial<Record<MealSlotName, PoolOption>>
  totals: MacroTargets
}

/**
 * W3: THE WEEK ON ONE SCREEN. One row per strip day: small rings (planned over target), the day, its planned
 * calories, its meals on one line. A tap opens the day in place, only one at a time, with its total, its verdict
 * and its meals; a meal opens that day on the strip, where everything it can do lives. "Shop the whole week" opens
 * the shopping list on its 7-day choice.
 */
export function NutritionWeekView({ days, today, targets, onOpenDay, onShopWeek }: {
  days: WeekViewDay[]
  today: string
  targets: MacroTargets | null
  /** Closes the week and opens that day on the strip. */
  onOpenDay: (date: string) => void
  onShopWeek: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2" data-testid="nutrition-week">
      {days.map(day => {
        const isToday = day.date === today
        const isOpen = open === day.date
        const slots = SLOT_ORDER.filter(s => day.chosen[s])
        const verdict = targets ? dayVerdictLabel(day.totals, targets) : null
        const label = isToday ? 'Today' : `${weekdayShort(day.date)} ${dayOfMonth(day.date)}`
        return (
          <div
            key={day.date}
            className="rounded-[18px]"
            style={{
              background: isToday ? 'color-mix(in srgb, var(--primary) 8%, var(--surface-deep))' : 'var(--surface-deep)',
              border: `1px solid ${isOpen ? 'color-mix(in srgb, var(--chart-2) 70%, var(--foreground))' : isToday ? 'rgba(var(--glow-rgb), .35)' : 'var(--hairline)'}`,
            }}
            data-week-day={day.date}
            data-week-day-open={isOpen ? 'yes' : 'no'}
          >
            <button
              type="button"
              onClick={() => setOpen(o => (o === day.date ? null : day.date))}
              aria-expanded={isOpen}
              className="flex min-h-[64px] w-full items-center gap-3 px-3.5 py-2.5 text-left"
            >
              <NestedRings
                size={44}
                rings={plannedRings(44)}
                shares={ringShares(day.totals, targets)}
                label={`${day.dayName}: ${n(day.totals.calories)}${targets ? ` of ${n(targets.calories)}` : ''} kcal planned`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[0.9375rem] font-semibold ${isToday ? 'text-primary-text' : ''}`} data-week-day-label>{label}</span>
                  {!isOpen && (
                    <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                      <KcalSwatch />
                      <span className="tabular-mono text-[0.875rem] font-bold text-foreground" data-week-day-kcal>{n(day.totals.calories)}</span> kcal
                    </span>
                  )}
                </span>
                {isOpen ? (
                  <span className="mt-0.5 block text-[0.75rem] text-muted-foreground" data-week-day-summary>
                    <span className="tabular-mono" data-week-day-kcal>{n(day.totals.calories)}</span> kcal
                    {verdict && <> · <DayVerdict label={verdict} data-testid="week-day-verdict" /></>}
                  </span>
                ) : (
                  <span className="mt-0.5 block truncate text-[0.75rem] text-muted-foreground" data-week-day-meals>
                    {slots.length > 0 ? slots.map(s => day.chosen[s]!.name).join(' · ') : 'No meals planned'}
                  </span>
                )}
              </span>
              <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-3.5 pb-1" data-week-day-list>
                {slots.map(slot => {
                  const o = day.chosen[slot]!
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => onOpenDay(day.date)}
                      aria-label={`Open ${isToday ? 'today' : day.dayName}: ${SLOT_LABEL[slot]}, ${o.name}`}
                      className="flex w-full items-start gap-3 py-3 text-left"
                      style={{ borderTop: '1px solid var(--hairline)' }}
                      data-week-meal={slot}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                        <span className="block text-[0.65625rem] uppercase tracking-[.12em] text-muted-foreground">
                          {SLOT_LABEL[slot]}
                          {o.leftoverFrom === 'dinner' && <span style={{ color: 'var(--role-warn-text)' }}> · leftovers</span>}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[0.96875rem] font-semibold leading-[1.3]">{o.name}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end pt-0.5">
                          <span className="flex items-center gap-1.5"><KcalSwatch /><span className="tabular-mono text-[1.0625rem] font-bold leading-none">{n(o.macros.calories)}</span></span>
                          <span className="mt-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[.12em] text-muted-foreground">kcal</span>
                        </span>
                        </span>
                        <MealMacros protein={o.macros.protein} carbs={o.macros.carbs} fat={o.macros.fat} className="mt-2" />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onShopWeek}
        className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-[0.8125rem] font-semibold"
        style={{ background: 'rgba(var(--glow-rgb), .12)', border: '1px solid rgba(var(--glow-rgb), .30)', color: 'var(--primary-text)' }}
        data-testid="shop-whole-week"
      >
        <ShoppingCart className="size-4" aria-hidden /> Shop the whole week
      </button>
    </div>
  )
}
