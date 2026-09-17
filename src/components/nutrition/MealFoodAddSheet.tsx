import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { buildMealFoodAddProposal } from '@/lib/meal-food-add'
import { applyMealOptionToSlot } from '@/lib/pending-action-executor'
import { FOOD_DB } from '@/lib/food-db'
import type { MealAdditionPayload } from '@/lib/meal-addition'
import type { MealSlotName } from '@/lib/meal-store'
import type { MacroTargets } from '@/lib/types'
import type { CurrentMealForSlot } from '@/lib/meal-food-add'

// ---------------------------------------------------------------------------
// ADDING A FOOD TO A MEAL, FROM THE SCREEN.
//
// The last thing on the meal row the coach could do and the screen could not.
// The written parity list (docs/coach-screen-parity.md) recorded it as a
// deliberate EXCEPTION with one reason, repeated on three rows: "there is no
// free-text food entry on the screen, and adding one is a design question,
// not a wiring one."
//
// THAT REASON WAS TOO STRONG, and closing it needed no design question at all.
// The coach takes free text because a person types free text at it. The screen
// does not have to: the foods the app can actually cost are a KNOWN LIST —
// FOOD_DB — and anything outside it is rejected by the same verifier either
// way. So this is a SEARCH over that list plus an amount, which is strictly
// more honest than free text, because a food that cannot be costed never gets
// offered in the first place rather than being typed and then refused.
//
// SAME BUILDER, SAME VERIFIER, SAME EXECUTOR as the coach's path. The whole
// point of closing a parity gap is that both doors leave the plan in the same
// state; a second implementation of "and then it becomes the meal" is exactly
// how they stop doing that.
// ---------------------------------------------------------------------------

export interface MealFoodAddContext {
  profileId: string
  date: string
  slot: MealSlotName
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods: string[]
  meal: CurrentMealForSlot
}

/** Grams unless the food carries named units — then its first one, which is how a person says it. */
function unitsFor(name: string): string[] {
  const entry = FOOD_DB.find(f => f.name === name)
  const named = Object.keys(entry?.units ?? {})
  return ['g', ...named]
}

export function MealFoodAddSheet({ ctx, onPick, onDone, onCancel }: {
  ctx: MealFoodAddContext
  onPick: (slot: MealSlotName, chosenName: string) => Promise<boolean>
  onDone: (summary: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [food, setFood] = useState<string | null>(null)
  const [amount, setAmount] = useState('100')
  const [unit, setUnit] = useState('g')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // NAME AND ALIASES BOTH, because "ground beef" is how it is said and "beef
  // mince 5% fat" is how it is filed. Matching the filed name only would make
  // half the database unfindable by the words people use.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return FOOD_DB
      .filter(f => f.name.includes(q) || f.aliases.some(a => a.toLowerCase().includes(q)))
      .slice(0, 8)
      .map(f => f.name)
  }, [query])

  const proposal = useMemo(() => {
    const n = Number(amount)
    if (!food || !Number.isFinite(n) || n <= 0) return null
    return buildMealFoodAddProposal({
      rawArgs: { meal_slot: ctx.slot, food_lines: [`${n}${unit === 'g' ? 'g' : ' ' + unit} ${food}`] },
      currentMeal: ctx.meal,
      profileId: ctx.profileId,
      todayDate: ctx.date,
      targets: ctx.targets,
      mealsPerDay: ctx.mealsPerDay,
      includeSnacks: ctx.includeSnacks,
      dietaryPreferences: ctx.dietaryPreferences,
      dislikedFoods: ctx.dislikedFoods,
    })
  }, [food, amount, unit, ctx])

  const confirm = async () => {
    if (!proposal?.ok) return
    setBusy(true)
    setError(null)
    const result = await applyMealOptionToSlot(
      ctx.profileId,
      proposal.payload as MealAdditionPayload,
      p => onPick(p.slot, p.option.name),
    )
    setBusy(false)
    if (result.receipt.failed.length > 0) {
      setError(result.receipt.failed[0].error)
      return
    }
    onDone(`${food} added to your ${ctx.slot}`)
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-[color:var(--surface-raised)] p-2.5" data-testid="meal-food-add-sheet">
      <p className="text-[0.71875rem] text-muted-foreground">Add a food to this meal</p>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setFood(null); setError(null) }}
        placeholder="Search foods…"
        aria-label="Search foods to add"
        className="min-h-[44px] w-full rounded-xl bg-[color:var(--surface-base)] px-3 text-sm"
        data-testid="meal-food-add-search"
      />
      {/* ONLY FOODS THE APP CAN ACTUALLY COST. A free-text box would let her
          type something the verifier then refuses, which is a dead end dressed
          up as a control. */}
      {!food && matches.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="meal-food-add-results">
          {matches.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setFood(m); setUnit(unitsFor(m)[0]); setQuery(m) }}
              className="min-h-[44px] rounded-xl px-3 text-left text-xs hover:bg-[color:var(--surface-base)]"
              data-testid={`meal-food-add-result`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {!food && query.trim().length >= 2 && matches.length === 0 && (
        <p className="text-[0.71875rem] text-muted-foreground" data-testid="meal-food-add-nomatch">
          Nothing like that in the food list. Ask me in chat and I'll work it out from what you tell me.
        </p>
      )}

      {food && (
        <>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(null) }}
              aria-label={`How much ${food}`}
              className="min-h-[44px] w-24 rounded-xl bg-[color:var(--surface-base)] px-3 text-sm"
              data-testid="meal-food-add-amount"
            />
            {unitsFor(food).length > 1 ? (
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                aria-label="Unit"
                className="min-h-[44px] rounded-xl bg-[color:var(--surface-base)] px-2 text-sm"
                data-testid="meal-food-add-unit"
              >
                {unitsFor(food).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : (
              <span className="text-sm text-muted-foreground">g</span>
            )}
          </div>

          {proposal && !proposal.ok && (
            <p className="text-[0.71875rem] text-[color:var(--role-warn)]" data-testid="meal-food-add-refusal">{proposal.reason}</p>
          )}

          {/* WHAT IT COSTS, BEFORE THE TAP — the same contract the removal has
              carried since Ashley's ruling on 12 Sep: state what changes, then
              let her decide. */}
          {proposal?.ok && (
            <div className="space-y-1" data-testid="meal-food-add-preview">
              {proposal.diff.rows.map(r => (
                <p key={r.field} className="text-[0.71875rem]">
                  <span className="font-medium">{r.field}</span>
                  <span className="text-muted-foreground"> · {r.before} → {r.after}{r.note ? ` (${r.note})` : ''}</span>
                </p>
              ))}
              {proposal.diff.implications?.map((imp, i) => (
                <p key={i} className={`text-[0.65625rem] ${imp.severity === 'warn' ? 'text-[color:var(--role-warn)]' : 'text-muted-foreground'}`}>{imp.text}</p>
              ))}
            </div>
          )}
          {error && <p className="text-[0.71875rem] text-[color:var(--role-warn)]" data-testid="meal-food-add-error">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy || !proposal?.ok}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              data-testid="meal-food-add-confirm"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Add it
            </button>
            <button type="button" onClick={onCancel} className="min-h-[44px] px-2 text-xs text-muted-foreground">Cancel</button>
          </div>
        </>
      )}
      {!food && (
        <button type="button" onClick={onCancel} className="min-h-[44px] px-2 text-xs text-muted-foreground">Cancel</button>
      )}
    </div>
  )
}
