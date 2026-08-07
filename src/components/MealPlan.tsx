import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  UtensilsCrossed,
  RefreshCw,
  Loader2,
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

/**
 * Turn 7 ("Meals — same structure as the workout day", Density Pass) —
 * applies turn 5's exercise-day system here: no per-meal cards, slot names
 * as section labels, one hero number (today's planned calories), macros as
 * a quiet tabular-mono row, and the per-meal chrome (badges, macro grids,
 * "view ingredients" toggle) cut. Swap and ingredients only render on the
 * one meal the user has open — everything else is a single collapsed line,
 * mirroring ExerciseRow's collapsed/expanded contract.
 */
export function MealPlan({ pools, chosen, totals, targets, isGenerating, onSwapSlot, onRegenerateSlot, onRegenerateAll }: MealPlanProps) {
  const activeSlots = SLOT_ORDER.filter(s => (pools[s]?.length ?? 0) > 0)
  const [expandedSlot, setExpandedSlot] = useState<MealSlotName | null>(null)

  if (activeSlots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <UtensilsCrossed className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No meal plan generated yet.</p>
        <p className="text-xs text-muted-foreground/70">Complete onboarding to generate your meal pools, or regenerate below.</p>
        <Button size="sm" onClick={onRegenerateAll} disabled={isGenerating} className="mt-2">
          {isGenerating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <RefreshCw className="size-3.5 mr-1.5" />}
          Generate meals
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="ds-label">Today's meals</span>
        <button
          type="button"
          onClick={onRegenerateAll}
          disabled={isGenerating}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Regenerate all
        </button>
      </div>

      {targets && <TotalsHero totals={totals} targets={targets} />}

      <div>
        {activeSlots.map((slot, idx) => (
          <MealSlotRow
            key={slot}
            slot={slot}
            isFirst={idx === 0}
            option={chosen[slot] ?? null}
            alternatives={pools[slot] ?? []}
            expanded={expandedSlot === slot}
            onToggle={() => setExpandedSlot(prev => (prev === slot ? null : slot))}
            onSwap={onSwapSlot}
            onRegenerate={onRegenerateSlot}
          />
        ))}
      </div>
    </div>
  )
}

/** One hero number (today's planned calories) + a 2px progress line + a quiet tabular-mono macro row — replaces the old dual progress-bar TotalsBar. */
function TotalsHero({ totals, targets }: { totals: MacroTargets; targets: MacroTargets }) {
  const calPct = targets.calories > 0 ? Math.min(100, (totals.calories / targets.calories) * 100) : 0
  const calDelta = Math.round(totals.calories - targets.calories)
  const deltaLabel = Math.abs(calDelta) < 30 ? 'on the number' : calDelta > 0 ? `${calDelta} over` : `${Math.abs(calDelta)} under`
  const proteinAchieved = targets.protein > 0 && totals.protein >= targets.protein

  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="tabular-mono ds-num-mega glow-mint-lg">{Math.round(totals.calories)}</span>
        <div className="flex flex-col gap-0.5 pb-1.5">
          <span className="text-sm text-foreground">kcal planned</span>
          <span className="ds-label-compact">target {targets.calories} · {deltaLabel}</span>
        </div>
      </div>
      <div className="mt-3 h-[2px] rounded-full" style={{ background: 'var(--hairline)' }}>
        <div className="h-[2px] rounded-full bg-primary glow-mint-box" style={{ width: `${calPct}%` }} />
      </div>
      <div className="mt-3 flex items-baseline gap-4 tabular-mono text-xs">
        <span className={proteinAchieved ? 'text-primary glow-mint' : 'text-muted-foreground'}>
          {Math.round(totals.protein)} / {targets.protein} P
        </span>
        <span className="text-muted-foreground">{Math.round(totals.carbs)} / {targets.carbs} C</span>
        <span className="text-muted-foreground">{Math.round(totals.fat)} / {targets.fat} F</span>
      </div>
    </div>
  )
}

function formatIngredient(ing: { name: string; quantity: number; unit: string }): string {
  const qty = Number.isInteger(ing.quantity) ? ing.quantity : Math.round(ing.quantity * 10) / 10
  return `${qty}${ing.unit === 'g' || ing.unit === 'ml' ? ing.unit : ` ${ing.unit}`} ${ing.name}`
}

function MealSlotRow({
  slot,
  isFirst,
  option,
  alternatives,
  expanded,
  onToggle,
  onSwap,
  onRegenerate,
}: {
  slot: MealSlotName
  isFirst: boolean
  option: PoolOption | null
  alternatives: PoolOption[]
  expanded: boolean
  onToggle: () => void
  onSwap: (slot: MealSlotName, chooseName: string) => Promise<void>
  onRegenerate: (slot: MealSlotName) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const otherOptions = alternatives.filter(o => o.name !== option?.name)

  const handleChoose = async (name: string) => {
    setBusy(true)
    try {
      await onSwap(slot, name)
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

  return (
    <div className="py-4" style={!isFirst ? { borderTop: '1px solid var(--hairline)' } : undefined}>
      <button type="button" onClick={onToggle} disabled={!option} className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default">
        <span className={expanded ? 'ds-label-compact text-primary glow-mint' : 'ds-label-compact'}>
          {SLOT_LABEL[slot]}{expanded ? ' · open' : ''}
        </span>
        <div className="flex items-baseline justify-between gap-3">
          {option ? (
            <>
              <span className={expanded ? 'min-w-0 truncate text-[19px] font-semibold tracking-[-.02em]' : 'min-w-0 truncate text-[16.5px] font-medium'}>
                {option.name}
              </span>
              {!expanded && (
                <span className="tabular-mono shrink-0 text-xs text-muted-foreground">{Math.round(option.macros.calories)} kcal</span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No option generated</span>
          )}
        </div>
      </button>

      {!option && (
        <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy} className="mt-2 h-7 px-2 text-xs">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Generate'}
        </Button>
      )}

      {expanded && option && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <span className="tabular-mono ds-num-lg">{Math.round(option.macros.calories)}</span>
            <div className="flex flex-col gap-0.5 pb-0.5">
              <span className="text-xs text-foreground">kcal</span>
              <span className="tabular-mono ds-label-compact">
                {Math.round(option.macros.protein)} P · {Math.round(option.macros.carbs)} C · {Math.round(option.macros.fat)} F
              </span>
            </div>
          </div>

          {option.ingredients.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="ds-label-compact">{option.ingredients.length} ingredients</span>
              <div className="flex flex-col gap-1.5">
                {option.ingredients.map((ing, i) => (
                  <span key={i} className="tabular-mono text-xs text-[color:var(--text-tertiary)]">{formatIngredient(ing)}</span>
                ))}
              </div>
            </div>
          )}

          {option.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {option.tags.map(t => (
                <span key={t} className="rounded-full bg-[color:var(--surface-raised)] px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy} className="h-8 px-2.5 text-xs" title="Regenerate this slot's pool">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
            {otherOptions.length > 0 && (
              <span className="text-xs text-muted-foreground">Swap · {otherOptions.length} option{otherOptions.length === 1 ? '' : 's'}</span>
            )}
          </div>

          {otherOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              {otherOptions.map(alt => {
                const calDelta = Math.round(alt.macros.calories - option.macros.calories)
                const proteinDelta = Math.round(alt.macros.protein - option.macros.protein)
                return (
                  <button
                    key={alt.name}
                    type="button"
                    onClick={() => handleChoose(alt.name)}
                    disabled={busy}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-raised)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{alt.name}</p>
                      <p className="tabular-mono text-[10.5px] text-muted-foreground">{Math.round(alt.macros.calories)} kcal · P {Math.round(alt.macros.protein)}g</p>
                    </div>
                    <span className={`tabular-mono shrink-0 text-[10.5px] ${Math.abs(calDelta) < 20 ? 'text-muted-foreground' : calDelta > 0 ? 'text-[color:var(--role-warn)]' : 'text-primary'}`}>
                      {calDelta > 0 ? '+' : ''}{calDelta} kcal, {proteinDelta > 0 ? '+' : ''}{proteinDelta}g P
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
