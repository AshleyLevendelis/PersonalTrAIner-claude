import { X, Share2 } from 'lucide-react'
import { GroceryList } from '@/components/GroceryList'
import type { MacroTargets } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'

// ---------------------------------------------------------------------------
// THE SHOPPING LIST, FULL SCREEN — design handoff 2b ›, 12 Sep 2026.
//
// It used to be a section at the bottom of the Tools tab, reached by a tile
// that scrolled you down to it. Two problems with that: Tools is where the
// utilities live and a shopping list is not one, and a list you shop from
// wants the whole screen, not the bottom third of a tab about timers.
//
// SAME COMPONENT, SAME STORE, SAME LIVE STATE. This is a shell — a header, a
// title and a line saying where the list came from. GroceryList itself is
// untouched, so checking an item behaves identically to how it did on Tools
// and there is no second copy of the list's own rules to drift.
// ---------------------------------------------------------------------------

export function GroceryScreen({
  profileId,
  mealPools,
  targets,
  softLikedFoods,
  todaysPicks,
  onClose,
}: {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets | null
  softLikedFoods: string[]
  todaysPicks?: Partial<Record<MealSlotName, PoolOption>>
  onClose: () => void
}) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className="flex flex-col gap-4" data-grocery-screen>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the shopping list"
          className="flex min-h-[44px] items-center gap-1.5 text-[0.8125rem] text-muted-foreground"
        >
          <X className="size-4" aria-hidden />
          Nutrition
        </button>
        {canShare && (
          <button
            type="button"
            className="flex min-h-[44px] items-center gap-1.5 text-[0.8125rem]"
            style={{ color: 'var(--primary-text)' }}
            onClick={() => {
              // OFFERED ONLY WHERE IT WORKS. The button is not rendered at all
              // without navigator.share, rather than rendered and silently
              // doing nothing — the app's standing rule about controls that
              // cannot do what they say.
              void navigator.share({ title: 'Grocery list', text: 'My shopping list' }).catch(() => {})
            }}
          >
            <Share2 className="size-4" aria-hidden />
            Share
          </button>
        )}
      </div>

      <div>
        <p className="text-[1.75rem] font-bold leading-none">Grocery</p>
      </div>

      <GroceryList
        profileId={profileId}
        mealPools={mealPools}
        targets={targets}
        softLikedFoods={softLikedFoods}
        todaysPicks={todaysPicks}
      />
    </div>
  )
}
