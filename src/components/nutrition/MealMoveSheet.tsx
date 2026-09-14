import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { buildMealMoveProposal } from '@/lib/meal-move'
import { executeMealMove } from '@/lib/pending-action-executor'
import type { MealAdditionPayload } from '@/lib/meal-addition'
import type { MealSlotName } from '@/lib/meal-store'
import type { MacroTargets } from '@/lib/types'
import type { CurrentMealForSlot } from '@/lib/meal-food-add'

// ---------------------------------------------------------------------------
// MOVING A MEAL, FROM THE SCREEN — "I'll have dinner as my snack instead."
//
// NO RADIX MENU, and the same reason MealFoodEditSheet gives for not having
// one: the destinations are three plain buttons in an expanded row, because a
// dropdown on a phone held one-handed in a kitchen is a second tap and a
// target that moves. This is that component's shape with a different verb.
//
// PROPOSE, THEN CONFIRM — never a one-tap move. The resize is the part she
// cannot predict from the request she made ("put dinner in the snack slot"
// does not tell her the portions halve), so the card states both new sizes
// and nothing is written until she taps again. That is the same contract the
// coach's cards have, and the screen does not get a weaker one.
// ---------------------------------------------------------------------------

export interface MealMoveContext {
  profileId: string
  date: string
  fromSlot: MealSlotName
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods: string[]
  /** Every slot's current meal — the destination's is what comes back the other way. */
  mealsBySlot: Partial<Record<MealSlotName, CurrentMealForSlot>>
}

const SLOT_LABEL: Record<MealSlotName, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
}

export function MealMoveSheet({ ctx, onPick, onDone, onCancel }: {
  ctx: MealMoveContext
  onPick: (slot: MealSlotName, chosenName: string) => Promise<boolean>
  onDone: (summary: string) => void
  onCancel: () => void
}) {
  const [toSlot, setToSlot] = useState<MealSlotName | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only slots this profile actually has. A destination with no budget is a
  // control that cannot take effect, and the builder refuses it anyway — but
  // offering it and then refusing is worse than not offering it.
  const destinations = useMemo(
    () => (Object.keys(SLOT_LABEL) as MealSlotName[]).filter(s => s !== ctx.fromSlot && s in ctx.mealsBySlot),
    [ctx.fromSlot, ctx.mealsBySlot],
  )

  const proposal = useMemo(
    () => (toSlot ? buildMealMoveProposal({
      rawArgs: { from_slot: ctx.fromSlot, to_slot: toSlot },
      mealsBySlot: ctx.mealsBySlot,
      profileId: ctx.profileId,
      todayDate: ctx.date,
      targets: ctx.targets,
      mealsPerDay: ctx.mealsPerDay,
      includeSnacks: ctx.includeSnacks,
      dietaryPreferences: ctx.dietaryPreferences,
      dislikedFoods: ctx.dislikedFoods,
    }) : null),
    [toSlot, ctx],
  )

  const confirm = async () => {
    if (!proposal?.ok) return
    setBusy(true)
    setError(null)
    const pick = (payload: MealAdditionPayload) => onPick(payload.slot, payload.option.name)
    const receipt = await executeMealMove(ctx.profileId, proposal.payload, pick)
    setBusy(false)
    if (receipt.failed.length > 0) {
      setError(receipt.failed[0].error)
      return
    }
    onDone(proposal.payload.legs.length === 2
      ? `${SLOT_LABEL[ctx.fromSlot]} and ${SLOT_LABEL[proposal.payload.legs[0].slot]} swapped`
      : `Moved to ${SLOT_LABEL[proposal.payload.legs[0].slot].toLowerCase()}`)
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-[color:var(--surface-raised)] p-2.5" data-testid="meal-move-sheet">
      {destinations.length === 0 ? (
        <p className="text-[0.71875rem] text-muted-foreground">
          There's nowhere else to put it — this is your only meal today.
        </p>
      ) : (
        <>
          <p className="text-[0.71875rem] text-muted-foreground">Move it to…</p>
          <div className="flex flex-wrap gap-2">
            {destinations.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setToSlot(prev => (prev === s ? null : s)); setError(null) }}
                className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold ${
                  toSlot === s ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-base)] text-foreground'
                }`}
                data-testid={`meal-move-to-${s}`}
              >
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </>
      )}

      {proposal && !proposal.ok && (
        <p className="text-[0.71875rem] text-[color:var(--role-warn)]" data-testid="meal-move-refusal">{proposal.reason}</p>
      )}

      {/* WHAT IT WILL DO, BEFORE THE TAP. Both new sizes, because the resize
          is the thing she did not ask for and cannot predict. */}
      {proposal?.ok && (
        <div className="space-y-1.5" data-testid="meal-move-preview">
          {proposal.diff.rows.map(r => (
            <p key={r.field} className="text-[0.71875rem]">
              <span className="font-medium">{r.field}</span>
              <span className="text-muted-foreground"> · {r.before} → {r.after}{r.note ? ` (${r.note})` : ''}</span>
            </p>
          ))}
          {proposal.diff.implications?.map((imp, i) => (
            <p
              key={i}
              className={`text-[0.65625rem] ${imp.severity === 'warn' ? 'text-[color:var(--role-warn)]' : 'text-muted-foreground'}`}
            >
              {imp.text}
            </p>
          ))}
          {error && <p className="text-[0.71875rem] text-[color:var(--role-warn)]" data-testid="meal-move-error">{error}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
              data-testid="meal-move-confirm"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {proposal.payload.legs.length === 2 ? 'Swap them' : 'Move it'}
            </button>
            <button type="button" onClick={onCancel} className="min-h-[44px] px-2 text-xs text-muted-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!proposal && destinations.length > 0 && (
        <button type="button" onClick={onCancel} className="min-h-[44px] px-2 text-xs text-muted-foreground">
          Cancel
        </button>
      )}
    </div>
  )
}
