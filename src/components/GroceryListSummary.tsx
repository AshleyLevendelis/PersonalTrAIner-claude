// ---------------------------------------------------------------------------
// Turn 7 gap: the mockup shows Meals ending in a compact grocery summary row
// ("Produce, protein, dairy, pantry" · "Open ›"), with the full checklist
// behind a tap — not the full inline list GroceryList.tsx has always
// rendered. Rather than split GroceryList's day-window/regenerate/checklist
// state apart, this wraps it unchanged inside a Dialog (the same
// tab-owned-dialog precedent PlateCalculator/ExerciseHistoryDialog use) and
// shows only a one-line summary until "Open" is tapped.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShoppingCart } from 'lucide-react'
import { GroceryList } from '@/components/GroceryList'
import { getAllItems, type GroceryCategory } from '@/lib/grocery-store'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import type { MacroTargets } from '@/lib/types'

const CATEGORY_LABEL: Record<GroceryCategory, string> = {
  produce: 'Produce',
  meat_fish: 'Meat & Fish',
  dairy: 'Dairy',
  dry_goods: 'Dry Goods',
  frozen: 'Frozen',
  other: 'Other',
}
const CATEGORY_ORDER: GroceryCategory[] = ['produce', 'meat_fish', 'dairy', 'dry_goods', 'frozen', 'other']

interface GroceryListSummaryProps {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets | null
  refreshToken?: number
}

export function GroceryListSummary({ profileId, mealPools, targets, refreshToken }: GroceryListSummaryProps) {
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<GroceryCategory[]>([])
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!profileId) return
    getAllItems(profileId).then(items => {
      setCount(items.length)
      const present = new Set(items.map(i => i.category))
      setCategories(CATEGORY_ORDER.filter(c => present.has(c)))
    }).catch(console.error)
    // Re-summarize whenever the dialog closes too, so a generate/add/remove
    // done inside it is reflected the moment the user backs out.
  }, [profileId, refreshToken, open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 py-4"
        style={{ borderTop: '1px solid var(--hairline)' }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ShoppingCart className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {count === 0 ? 'No items yet' : categories.map(c => CATEGORY_LABEL[c]).join(', ')}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-primary">Open ›</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Grocery list</DialogTitle>
          </DialogHeader>
          <GroceryList profileId={profileId} mealPools={mealPools} targets={targets} refreshToken={refreshToken} />
        </DialogContent>
      </Dialog>
    </>
  )
}
