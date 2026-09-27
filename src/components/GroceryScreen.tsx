import type { ReactNode } from 'react'
import { ChevronLeft, Share2 } from 'lucide-react'
import { GroceryList } from '@/components/GroceryList'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { useViewportInset } from '@/hooks/useViewportInset'
import type { MacroTargets } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import type { MealShape } from '@/lib/meal-rotation'

// ---------------------------------------------------------------------------
// THE SHOPPING LIST, FULL SCREEN — design 3a/3b, 27 Sep 2026 (was 2b ›).
//
// The list is the page now, the way the coach chat is (design 2a): fixed from
// the top of the screen down to the tab bar, with three rows — a top bar, the
// scrolling list, and an add bar docked on the tab bar. It no longer sits in
// the tab's padded flow, where the add field scrolled away with the list.
//
// SAME COMPONENT, SAME STORE, SAME LIVE STATE. This is the shell: the way
// back, Share and the settings menu. GroceryList owns the list and its rules,
// so there is still no second copy of them to drift.
// ---------------------------------------------------------------------------

export function GroceryScreen({
  profileId,
  mealPools,
  targets,
  softLikedFoods,
  todaysPicks,
  mealShape,
  onClose,
  headerAction,
}: {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets | null
  softLikedFoods: string[]
  todaysPicks?: Partial<Record<MealSlotName, PoolOption>>
  mealShape: MealShape
  onClose: () => void
  /** The settings menu, drawn in this screen's top bar; App hides its own floating one meanwhile. */
  headerAction?: ReactNode
}) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  // WITH THE KEYBOARD UP THE WHOLE SCREEN RIDES IT, as the chat does: the tab
  // bar hides itself then, so the add bar sits straight on the keyboard.
  const { insetPx, isKeyboardOpen } = useViewportInset()
  const bottom = isKeyboardOpen ? `${insetPx}px` : `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom))`

  return (
    <div
      data-grocery-screen
      data-testid="grocery-screen"
      className="fixed inset-x-0 top-0 z-30 mx-auto flex max-w-6xl flex-col bg-background"
      style={{ bottom }}
    >
      <GroceryList
        profileId={profileId}
        mealPools={mealPools}
        targets={targets}
        softLikedFoods={softLikedFoods}
        todaysPicks={todaysPicks}
        mealShape={mealShape}
        header={({ left, compact }) => (
          <header data-testid="grocery-topbar" className="shrink-0 bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="relative flex h-[52px] items-center pl-3 pr-1.5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back to Nutrition"
                className="flex min-h-11 items-center gap-1 pr-2 text-[0.8125rem] text-muted-foreground"
              >
                <ChevronLeft className="size-[18px]" aria-hidden />
                Nutrition
              </button>
              {/* THE COMPACT TITLE, only once the big one has scrolled away —
                  two titles on screen at once say the same thing twice. */}
              <p
                data-testid="grocery-compact-title"
                aria-hidden={!compact}
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.8125rem] font-semibold transition-opacity duration-200 ${compact ? 'opacity-100' : 'opacity-0'}`}
              >
                Grocery · <span className="tabular-mono text-primary-text">{left} left</span>
              </p>
              <div className="ml-auto flex items-center">
                {canShare && (
                  <button
                    type="button"
                    aria-label="Share the list"
                    data-testid="grocery-share"
                    className="hit-slop-44 flex size-10 items-center justify-center"
                    style={{ color: 'var(--primary-text)' }}
                    onClick={() => {
                      // OFFERED ONLY WHERE IT WORKS. The button is not rendered
                      // at all without navigator.share, rather than rendered
                      // and silently doing nothing.
                      void navigator.share({ title: 'Grocery list', text: 'My shopping list' }).catch(() => {})
                    }}
                  >
                    <Share2 className="size-4" aria-hidden />
                  </button>
                )}
                {headerAction}
              </div>
            </div>
          </header>
        )}
      />
    </div>
  )
}
