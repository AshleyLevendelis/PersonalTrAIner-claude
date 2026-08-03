import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  UtensilsCrossed,
  RefreshCw,
  Loader2,
  Flame,
  Beef,
  Wheat,
  Droplets,
  ChefHat,
} from 'lucide-react'
import type { MacroTargets } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'

const SLOT_ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const SLOT_LABEL: Record<MealSlotName, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

interface MealPlanProps {
  /** Every generated option per slot — what the swap panel offers. */
  pools: Partial<Record<MealSlotName, PoolOption[]>>
  /** Today's assembled pick, one per active slot. */
  chosen: Partial<Record<MealSlotName, PoolOption>>
  /** Sum of the chosen options' macros. */
  totals: MacroTargets
  targets: MacroTargets | null
  isGenerating: boolean
  onSwapSlot: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerateSlot: (slot: MealSlotName) => Promise<void>
  onRegenerateAll: () => Promise<void>
}

export function MealPlan({ pools, chosen, totals, targets, isGenerating, onSwapSlot, onRegenerateSlot, onRegenerateAll }: MealPlanProps) {
  const activeSlots = SLOT_ORDER.filter(s => (pools[s]?.length ?? 0) > 0)

  if (activeSlots.length === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <UtensilsCrossed className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No meal plan generated yet.</p>
          <p className="text-xs text-muted-foreground/70">Complete onboarding to generate your meal pools, or regenerate below.</p>
          <Button size="sm" onClick={onRegenerateAll} disabled={isGenerating} className="mt-2">
            {isGenerating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <RefreshCw className="size-3.5 mr-1.5" />}
            Generate meals
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ChefHat className="size-4 text-emerald-500" />
            Today's Meals
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onRegenerateAll} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <RefreshCw className="size-3.5 mr-1.5" />}
            Regenerate all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {targets && <TotalsBar totals={totals} targets={targets} />}

        <Separator />

        <div className="space-y-2">
          {activeSlots.map(slot => (
            <MealSlotCard
              key={slot}
              slot={slot}
              option={chosen[slot] ?? null}
              alternatives={pools[slot] ?? []}
              onSwap={onSwapSlot}
              onRegenerate={onRegenerateSlot}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Running totals vs targets. Calories and protein are the non-negotiables —
 * given the large bar and the top row; carbs/fat are secondary, smaller text
 * underneath.
 */
function TotalsBar({ totals, targets }: { totals: MacroTargets; targets: MacroTargets }) {
  const calPct = targets.calories > 0 ? Math.min(150, (totals.calories / targets.calories) * 100) : 0
  const proPct = targets.protein > 0 ? Math.min(150, (totals.protein / targets.protein) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Flame className="size-3.5 text-orange-400" />
            Calories
          </span>
          <span className="font-mono">{Math.round(totals.calories)} / {targets.calories} kcal</span>
        </div>
        <Progress value={calPct} className="h-2" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Beef className="size-3.5 text-sky-400" />
            Protein
          </span>
          <span className="font-mono">{Math.round(totals.protein)} / {targets.protein}g</span>
        </div>
        <Progress value={proPct} className="h-2" />
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Wheat className="size-3" />
          {Math.round(totals.carbs)}g / {targets.carbs}g carbs
        </span>
        <span className="flex items-center gap-1">
          <Droplets className="size-3" />
          {Math.round(totals.fat)}g / {targets.fat}g fat
        </span>
      </div>
    </div>
  )
}

function formatIngredient(ing: { name: string; quantity: number; unit: string }): string {
  const qty = Number.isInteger(ing.quantity) ? ing.quantity : Math.round(ing.quantity * 10) / 10
  return `${qty}${ing.unit === 'g' || ing.unit === 'ml' ? ing.unit : ` ${ing.unit}`} ${ing.name}`
}

function MealSlotCard({
  slot,
  option,
  alternatives,
  onSwap,
  onRegenerate,
}: {
  slot: MealSlotName
  option: PoolOption | null
  alternatives: PoolOption[]
  onSwap: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerate: (slot: MealSlotName) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const otherOptions = alternatives.filter(o => o.name !== option?.name)

  const handleChoose = async (name: string) => {
    setBusy(true)
    try {
      await onSwap(slot, name)
      setSwapOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const handleRegenerate = async () => {
    setBusy(true)
    try {
      await onRegenerate(slot)
    } finally {
      setBusy(false)
    }
  }

  if (!option) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{SLOT_LABEL[slot]} — no option generated</span>
        <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Generate'}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] shrink-0 bg-accent/50">
              {SLOT_LABEL[slot]}
            </Badge>
            <span className="text-sm font-medium truncate">{option.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{Math.round(option.macros.calories)} kcal</span>
            <span>P: {Math.round(option.macros.protein)}g</span>
            <span>C: {Math.round(option.macros.carbs)}g</span>
            <span>F: {Math.round(option.macros.fat)}g</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleRegenerate}
            disabled={busy}
            title="Regenerate this slot's pool"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setSwapOpen(s => !s)}
            disabled={busy || otherOptions.length === 0}
            title={otherOptions.length === 0 ? 'No other options in this pool yet' : 'Swap for another pool option'}
          >
            Swap ({otherOptions.length})
          </Button>
        </div>
      </div>

      {option.ingredients.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {expanded ? 'Hide ingredients' : `View ${option.ingredients.length} ingredients`}
          </button>
          {expanded && (
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-3 border-l-2 border-border/50">
              {option.ingredients.map((ing, i) => (
                <li key={i}>{formatIngredient(ing)}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {option.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {option.tags.map(t => (
            <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0">{t}</Badge>
          ))}
        </div>
      )}

      {swapOpen && otherOptions.length > 0 && (
        <div className="rounded-md border border-border/50 divide-y divide-border/50 mt-1">
          {otherOptions.map(alt => {
            const calDelta = Math.round(alt.macros.calories - option.macros.calories)
            const proteinDelta = Math.round(alt.macros.protein - option.macros.protein)
            return (
              <button
                key={alt.name}
                onClick={() => handleChoose(alt.name)}
                disabled={busy}
                className="w-full text-left px-2.5 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{alt.name}</p>
                  <p className="text-[10px] text-muted-foreground">{Math.round(alt.macros.calories)} kcal · P {Math.round(alt.macros.protein)}g</p>
                </div>
                <span className={`text-[10px] font-mono shrink-0 ${Math.abs(calDelta) < 20 ? 'text-muted-foreground' : calDelta > 0 ? 'text-amber-500' : 'text-sky-500'}`}>
                  {calDelta > 0 ? '+' : ''}{calDelta} kcal, {proteinDelta > 0 ? '+' : ''}{proteinDelta}g P
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
