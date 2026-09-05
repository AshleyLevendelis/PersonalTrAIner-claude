import { TimersPanel } from '@/components/timers/TimersPanel'
import { RoundField } from '@/components/timers/RoundField'
import { useTimers } from '@/hooks/useTimers'
import { GroceryList } from '@/components/GroceryList'
import { useActiveSession } from '@/hooks/useActiveSession'
import type { MacroTargets, WorkoutDay } from '@/lib/types'
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
  /**
   * The training week, so the round timer can offer today's conditioning as a
   * one-tap prefill.
   *
   * Added 5 Sep 2026. TimersPanel has always accepted `todaysConditioning` and
   * this screen — its only mount — never passed one, so `prefill` was
   * permanently null: the "Load from today's session" button could not render
   * on any device, in any state, and the round defaults stayed at a generic
   * 8x30/30 on the day the plan actually prescribed 10x40/20.
   */
  exercisePlan?: WorkoutDay[]
}

export function ToolsTab({ profileId, mealPools, targets, softLikedFoods, todaysPicks, exercisePlan }: ToolsTabProps) {
  const timers = useTimers()
  // The session facade already owns "which day is it" (frozen at session
  // start, dev-clock aware). Deriving it again here from a fresh Date would
  // be a second answer to a question this app deliberately has one owner for.
  const { dayName } = useActiveSession()
  const todaysConditioning = (exercisePlan ?? []).find(d => d.day === dayName)?.recommendedCardio

  // A RUNNING ROUND IS A SINGLE-PURPOSE SCREEN (design handoff 2a). While one
  // is live the field takes the whole tab content area rather than sitting as
  // a card above the rest — a flooded surface is legible across a gym, a card
  // is not. The stopwatch, lap and grocery sections are intentionally out of
  // reach until it is reset.
  //
  // `isRoundComplete` holds the screen too, so the red finished state stays
  // until the user acts instead of vanishing the moment the clock stops.
  // PAUSED COUNTS AS HOLDING THE SCREEN, and leaving it out was a real bug.
  // pauseRound sets running:false, so a round that only required `running`
  // made the entire full-bleed timer vanish the moment you tapped Pause,
  // dropping you back to the setup form mid-workout. You pause to catch your
  // breath, not to lose your place. `isActive` is true while there is
  // accumulated time, which is exactly "started and not reset".
  const roundHoldsScreen =
    timers.mode === 'round' && !!timers.roundConfig
    && (timers.running || timers.isRoundComplete || timers.isActive)

  if (roundHoldsScreen) {
    // NO `relative` AND NO minHeight HERE. Both used to be, and together they
    // were the bug: they made this wrapper the containing block for
    // RoundField's absolute positioning, so the full-bleed field became a
    // 60vh card sitting in the page's padding. RoundField is `fixed` now and
    // belongs to the viewport, so this wrapper must stay unpositioned or it
    // will capture it again.
    return (
      <div data-tour="toolsall">
        <RoundField />
      </div>
    )
  }

  return (
    <div data-tour="toolsall" className="space-y-8">
      <div>
        <p className="ds-label">Timer</p>
        <div className="mt-2.5">
          <TimersPanel todaysConditioning={todaysConditioning} />
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
