import { TimersPanel } from '@/components/timers/TimersPanel'
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
}

export function ToolsTab({ profileId, mealPools, targets }: ToolsTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="ds-label">Timer</p>
        <div className="mt-2.5">
          <TimersPanel />
        </div>
      </div>
      <div>
        <p className="ds-label">Grocery list</p>
        <div className="mt-2.5">
          <GroceryList profileId={profileId} mealPools={mealPools} targets={targets} />
        </div>
      </div>
    </div>
  )
}
