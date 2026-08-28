// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.3 — grocery list surface. Lives inside the
// Meals tab (not its own tab): it is entirely derived from the meal plan,
// and a fifth tab is a cost the vision doc itself flags as one to avoid
// unless something needs primary-navigation weight. Grocery is a
// secondary, occasional surface (shop once a week) the same way the
// ingredient-expander inside MealPlan's own cards already is — a
// collapsible section below today's meals, not a peer of them.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ShoppingCart, Loader2, RefreshCw, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import {
  getAllItems, addItemLocal, editItemLocal, setCheckedLocal, deleteItemLocal, clearCheckedLocal, generateGroceryList,
  DEFAULT_HORIZON_DAYS, type GroceryItemRow, type GroceryCategory,
} from '@/lib/grocery-store'
import { parseIngredientLine } from '@/lib/portion-scaler'
import { lookupIngredient } from '@/lib/food-db'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import type { MacroTargets } from '@/lib/types'

interface GroceryListProps {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  /** Soft food likes — must be the SAME value App.tsx passes to assembleDay, or the list is built from days the app never serves. */
  softLikedFoods: string[]
  targets: MacroTargets | null
  /** Bumped externally (e.g. after a chat-added item) to force a reload without remounting. */
  refreshToken?: number
}

const CATEGORY_ORDER: GroceryCategory[] = ['produce', 'meat_fish', 'dairy', 'dry_goods', 'frozen', 'other']
const CATEGORY_LABEL: Record<GroceryCategory, string> = {
  produce: 'Produce',
  meat_fish: 'Meat & Fish',
  dairy: 'Dairy',
  dry_goods: 'Dry Goods',
  frozen: 'Frozen',
  other: 'Other',
}
const DAY_PRESETS = [3, 7, 14]

function formatQuantity(item: GroceryItemRow): string {
  const qty = Number.isInteger(item.quantity) ? item.quantity : Math.round(item.quantity * 10) / 10
  return item.unit === 'g' || item.unit === 'ml' ? `${qty}${item.unit}` : `${qty} ${item.unit}`
}

/**
 * Shopping-friendly display over the stored gram figure — "378g broccoli"
 * isn't how anyone shops. Read-only: never touches item.quantity/.unit
 * (the raw grams stay the source of truth for edit/merge/aggregation), just
 * how it's shown. `exact` is the unrounded figure, surfaced in the "from N
 * meals" expander so it isn't lost.
 */
function formatShoppingQuantity(item: GroceryItemRow): { primary: string; exact: string } {
  const exact = formatQuantity(item)
  if (item.unit !== 'g') return { primary: exact, exact } // non-gram manual units (e.g. 'rolls') pass through unchanged

  const entry = lookupIngredient(item.display_name)
  if (entry?.purchaseUnit) {
    const count = Math.max(1, Math.round(item.quantity / entry.purchaseUnit.avgGrams))
    return { primary: `${count} ${entry.purchaseUnit.label}${count === 1 ? '' : 's'}`, exact }
  }

  const grams = item.quantity
  const step = grams >= 1000 ? 100 : grams >= 200 ? 50 : grams >= 20 ? 10 : 5
  const rounded = Math.round(grams / step) * step
  const approx = rounded !== grams ? '~' : ''
  const primary = rounded >= 1000
    ? `${approx}${(rounded / 1000).toFixed(rounded % 1000 === 0 ? 0 : 1)}kg`
    : `${approx}${rounded}g`
  return { primary, exact }
}

export function GroceryList({ profileId, mealPools, targets, softLikedFoods, refreshToken }: GroceryListProps) {
  const [items, setItems] = useState<GroceryItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [horizonDays, setHorizonDays] = useState(DEFAULT_HORIZON_DAYS)
  const [quickAdd, setQuickAdd] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editQty, setEditQty] = useState('')
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set())

  const reload = async () => {
    if (!profileId) return
    setLoading(true)
    try {
      setItems(await getAllItems(profileId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [profileId, refreshToken])

  const handleGenerate = async () => {
    if (!profileId || !targets) return
    setGenerating(true)
    try {
      // generateGroceryList reads the current merged view then enqueues local
      // writes (it doesn't await the network) — reload picks up the merged
      // pending state immediately, no round-trip wait.
      await generateGroceryList({ profileId, mealPools, targets, softLikedFoods, days: horizonDays })
      await reload()
    } finally {
      setGenerating(false)
    }
  }

  const handleQuickAdd = () => {
    if (!profileId || !quickAdd.trim()) return
    const parsed = parseIngredientLine(quickAdd.trim())
    const { row } = addItemLocal({ profileId, name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, source: 'manual', currentItems: items })
    setItems(prev => (prev.some(i => i.id === row.id) ? prev.map(i => (i.id === row.id ? row : i)) : [...prev, row]))
    setQuickAdd('')
  }

  const startEdit = (item: GroceryItemRow) => {
    setEditingId(item.id)
    setEditName(item.display_name)
    setEditQty(String(item.quantity))
  }
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditQty('') }
  const saveEdit = (id: string) => {
    const current = items.find(i => i.id === id)
    if (!current) return
    const quantity = Number(editQty)
    const row = editItemLocal(current, { displayName: editName.trim() || undefined, quantity: Number.isFinite(quantity) ? quantity : undefined })
    setItems(prev => prev.map(i => (i.id === id ? row : i)))
    cancelEdit()
  }

  const toggleChecked = (item: GroceryItemRow) => {
    const row = setCheckedLocal(item, !item.checked)
    setItems(prev => prev.map(i => (i.id === item.id ? row : i)))
  }

  const remove = (item: GroceryItemRow) => {
    deleteItemLocal(item)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  const handleClearChecked = () => {
    clearCheckedLocal(items)
    setItems(prev => prev.filter(i => !i.checked))
  }

  const toggleRefs = (id: string) => {
    setExpandedRefs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grouped = CATEGORY_ORDER
    .map(cat => ({ category: cat, items: items.filter(i => i.category === cat).sort((a, b) => Number(a.checked) - Number(b.checked)) }))
    .filter(g => g.items.length > 0)

  return (
    <Card className="border-border/50 bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ShoppingCart className="size-4 text-primary" />
            Grocery List
          </CardTitle>
          {items.some(i => i.checked) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearChecked}>
              Clear checked
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          {DAY_PRESETS.map(d => (
            <Button
              key={d}
              variant={horizonDays === d ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setHorizonDays(d)}
            >
              {d}d
            </Button>
          ))}
          <Button variant="secondary" size="sm" className="h-7 text-xs ml-auto" onClick={handleGenerate} disabled={generating || !targets}>
            {generating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <RefreshCw className="size-3.5 mr-1.5" />}
            Regenerate ({horizonDays}d)
          </Button>
        </div>
        <p className="pt-1 text-xs text-muted-foreground/70">
          Ingredients are filtered, not verified. Check labels if you have an allergy.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Input
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleQuickAdd() }}
            placeholder="Add an item, e.g. 2 eggs"
            className="h-8 text-sm"
          />
          <Button size="icon" aria-label="Add item to list" className="size-8 shrink-0" onClick={handleQuickAdd} disabled={!quickAdd.trim()}>
            <Plus className="size-4" />
          </Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <ShoppingCart className="size-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Your list is empty.</p>
            <p className="text-xs text-muted-foreground/70 max-w-[26ch]">It fills from your meal plan — tap Regenerate above, or add an item by hand.</p>
          </div>
        )}

        {grouped.map(({ category, items: catItems }, idx) => (
          <div key={category} className="space-y-1.5">
            {idx > 0 && <Separator />}
            <h3 className="ds-label pt-1">{CATEGORY_LABEL[category]}</h3>
            {catItems.map(item => (
              <div key={item.id} className={`rounded-md border p-2 flex items-start gap-2 ${item.checked ? 'opacity-50 border-border/30' : 'border-border/50'}`}>
                <button
                  onClick={() => toggleChecked(item)}
                  className={`hit-slop-44 mt-0.5 size-5 shrink-0 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}
                  aria-label={item.checked ? 'Uncheck item' : 'Check off item'}
                >
                  {item.checked && <Check className="size-3.5 text-primary-foreground" />}
                </button>

                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm flex-1" />
                      <Input value={editQty} onChange={e => setEditQty(e.target.value)} className="h-7 text-sm w-16" inputMode="decimal" />
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveEdit(item.id)}><Check className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between gap-2 ${item.checked ? 'line-through' : ''}`}>
                      <span className="text-sm truncate">
                        <span className="font-mono text-xs text-muted-foreground mr-1.5">{formatShoppingQuantity(item).primary}</span>
                        {item.display_name}
                      </span>
                      {/* Fix 4.5 (ux-sweep): bare "check" told a shopper nothing about what to check or why. needs_review means the ingredient name didn't match anything in food-db, so its quantity/unit is a rough guess rather than a real lookup. */}
                      {item.needs_review && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0" title="Not matched to a known ingredient — quantity is a rough estimate">unmatched</Badge>}
                    </div>
                  )}

                  {item.meal_refs.length > 0 && editingId !== item.id && (
                    <button onClick={() => toggleRefs(item.id)} className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground mt-0.5">
                      {expandedRefs.has(item.id) ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
                      from {item.meal_refs.length} meal{item.meal_refs.length === 1 ? '' : 's'}
                    </button>
                  )}
                  {expandedRefs.has(item.id) && (
                    <ul className="text-[10px] text-muted-foreground pl-3 border-l-2 border-border/50 mt-1 space-y-0.5">
                      <li>Exact: {formatShoppingQuantity(item).exact}</li>
                      {item.meal_refs.map((r, i) => <li key={i}>Day {r.day + 1} · {r.slot} · {r.mealName}</li>)}
                    </ul>
                  )}
                </div>

                {editingId !== item.id && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(item)}><Pencil className="size-3" /></Button>
                    <Button size="icon" variant="ghost" className="hit-slop-44 size-6 text-destructive" onClick={() => remove(item)}><Trash2 className="size-3" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
