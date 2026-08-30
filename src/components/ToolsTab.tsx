import { TimersPanel } from '@/components/timers/TimersPanel'
import { RoundField } from '@/components/timers/RoundField'
import { useTimers } from '@/hooks/useTimers'
import { GroceryList } from '@/components/GroceryList'
import type { MacroTargets } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'

// ---------------------------------------------------------------------------
// Turn 12 ("one owner per fact") — the retired Meals tab's grocery section
// and the Exercise tab's dialog-only timers now share one "Tools" tab:
// neither owns daily-plan content (that's Nutrition/Exercise's job), they're
// both ephemeral utilities reached from wherever, so a shared utility tab is
// the honest home for both rather than two separate dialog entry points.
// ---------------------------------------------------------------------------

export interface ToolsTabProps {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets | null
  /** Passed straight through to GroceryList — the shopping list assembles the same days the Nutrition tab shows, so it needs the same preferences or the two diverge. */
  softLikedFoods: string[]
  /** And today's actual picks, for the same reason: a swapped dinner has to reach the shopping list too (audit §5.1). */
  todaysPicks?: Partial<Record<MealSlotName, PoolOption>>
}

export function ToolsTab({ profileId, mealPools, targets, softLikedFoods, todaysPicks }: ToolsTabProps) {
  const timers = useTimers()

  // A RUNNING ROUND IS A SINGLE-PURPOSE SCREEN (design handoff 2a). While one
  // is live the field takes the whole tab content area rather than sitting as
  // a card above the rest — a flooded surface is legible across a gym, a card
  // is not. The stopwatch, lap and grocery sections are intentionally out of
  // reach until it is reset.
  //
  // `isRoundComplete` holds the screen too, so the red finished state stays
  // until the user acts instead of vanishing the moment the clock stops.
  const roundHoldsScreen =
    timers.mode === 'round' && !!timers.roundConfig && (timers.running || timers.isRoundComplete)

  if (roundHoldsScreen) {
    // Positioned against the tab content area, with the dock's own height as
    // the bottom inset — BottomTabBar stays visible and interactive, so the
    // user can navigate away mid-round and the timer keeps running.
    return (
      <div data-tour="toolsall" className="relative" style={{ minHeight: '60vh' }}>
        <RoundField />
      </div>
    )
  }

  return (
    <div data-tour="toolsall" className="space-y-8">
      <div>
        <p className="ds-label">Timer</p>
        <div className="mt-2.5">
          <TimersPanel />
        </div>
      </div>
      <div>
        <p className="ds-label">Grocery list</p>
        <div className="mt-2.5">
          <GroceryList profileId={profileId} mealPools={mealPools} targets={targets} softLikedFoods={softLikedFoods} todaysPicks={todaysPicks} />
        </div>
      </div>
    </div>
  )
}
