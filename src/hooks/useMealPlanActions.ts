import { useState } from 'react'
import { swapMealSlot, regenerateMealSlot, regenerateAllMeals, type MealPlanActionContext } from '@/lib/meal-plan-actions'
import type { MealSlotName } from '@/lib/meal-store'

// ---------------------------------------------------------------------------
// THE NUTRITION TAB'S THREE MEAL BUTTONS — swap, regenerate one, regenerate
// all — as App.tsx and the browser harness BOTH wire them.
//
// They were three functions inside App.tsx, and the harness page passed
// `noop` for each, so no driver could press "Regenerate all" (9 Oct 2026,
// test log M22). The logic is src/lib/meal-plan-actions.ts; this is the thin
// React half: the caller hands over what its screen holds, and gets back the
// handlers plus ONE piece of state the buttons did not have — whether a
// regenerate-all is running, so the tab can show a working state over the
// whole list for the twenty seconds it takes instead of a 12px spinner.
// ---------------------------------------------------------------------------

/** What the screen holds. Null `profileId`/`generation` (no profile, no targets) makes every handler a no-op, as before. */
export type MealPlanActionsInput = Omit<MealPlanActionContext, 'profileId' | 'today'> & {
  profileId: string | undefined
  /** Read when a button is pressed, not when the screen renders. */
  today: () => string
}

export function useMealPlanActions(input: MealPlanActionsInput) {
  const [regeneratingAll, setRegeneratingAll] = useState(false)
  const context = (): MealPlanActionContext | null =>
    input.profileId ? { ...input, profileId: input.profileId, today: input.today() } : null

  return {
    /** True from the tap on "Regenerate all" until the new meals are on screen (or it failed and said so). */
    regeneratingAll,
    swap: async (slot: MealSlotName, chooseName: string) => {
      const ctx = context()
      if (ctx) await swapMealSlot(ctx, slot, chooseName)
    },
    regenerateSlot: async (slot: MealSlotName) => {
      const ctx = context()
      if (ctx) await regenerateMealSlot(ctx, slot)
    },
    regenerateAll: async () => {
      const ctx = context()
      if (!ctx || !ctx.generation) return
      setRegeneratingAll(true)
      try { await regenerateAllMeals(ctx) } finally { setRegeneratingAll(false) }
    },
  }
}
