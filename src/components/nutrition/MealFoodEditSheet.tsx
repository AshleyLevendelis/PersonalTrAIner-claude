import { useMemo, useState } from 'react'
import { Loader2, ShieldAlert, Info } from 'lucide-react'
import type { MacroTargets, FitnessGoal } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { MealAdditionPayload } from '@/lib/meal-addition'
import { applyMealOptionToSlot } from '@/lib/pending-action-executor'
import {
  buildMealFoodRemoveProposal,
  buildMealFoodReplaceProposal,
  buildMealFoodResizeProposal,
  type MealFoodEditResult,
} from '@/lib/meal-food-edit'
import { parseIngredientLines } from '@/lib/portion-scaler'
import { assessMealEdit, type MealEditKind } from '@/lib/meal-tradeoff'
import { applyTradeoff, downgradeToCard } from '@/lib/tradeoff-shape'

// ---------------------------------------------------------------------------
// CHANGING ONE FOOD, BY TAPPING IT.
//
// The coach could take a food out of a meal, swap it or resize it before the
// screen could, which is exactly the parity gap CLAUDE.md's promise 2 exists
// to close: every screen action has a coach path and every coach tool a
// screen path. This is the screen path, and it is deliberately not a second
// implementation of anything — the same three builders, the same single
// verification inside them, the same rows and the same offer the chat card
// shows, applied through the same executor with the same rollback.
//
// The two surfaces can therefore disagree about wording, and about nothing
// else. That is the property; the rest of this file is layout.
//
// NO RADIX MENU. The three verbs are plain buttons in an expanded row: a
// menu here would be one more tap on a screen someone is reading in a
// supermarket, and synthetic pointer events on Radix items have a history
// with the browser harness that is not worth inheriting for a three-item
// list.
// ---------------------------------------------------------------------------

type Verb = 'remove' | 'replace' | 'resize'

const VERB_LABEL: Record<Verb, string> = {
  remove: 'Take it out',
  replace: 'Swap it',
  resize: 'Change amount',
}

export interface MealFoodEditContext {
  profileId: string
  date: string
  slot: MealSlotName
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods: string[]
  meal: { name: string; ingredients: string[]; macros: { calories: number; protein: number; carbs: number; fat: number } }
  /** Every ingredient line across today's meals — orders the swaps offered. */
  pantryFoods: string[]
  /** Whose goal this is judged against — see tradeoffFor. */
  fitnessGoal?: FitnessGoal
  /**
   * THE WHOLE DAY AS IT STANDS, so this sheet can say what a change costs the
   * GOAL rather than only what it does to one meal's numbers. The slot's own
   * budget cannot answer "does the day still hit protein", which is the only
   * question worth asking here.
   *
   * Optional, and that is deliberate: a caller that cannot supply it gets the
   * card it always got, never a judgement made up from a day this sheet does
   * not know about. Silence is the safe direction — see assessMealEdit's own
   * "no planned day, no judgement".
   */
  dayTotals?: MacroTargets
}

export function MealFoodEditSheet({
  ctx,
  line,
  onPick,
  onDone,
  onCancel,
}: {
  ctx: MealFoodEditContext
  /** The ingredient line being changed, exactly as the meal holds it. */
  line: string
  /** Makes a verified option the slot's meal, and refreshes the screen. Returns false if it didn't land. */
  onPick: (slot: MealSlotName, mealName: string) => Promise<boolean>
  onDone: (summary: string) => void
  onCancel: () => void
}) {
  const [verb, setVerb] = useState<Verb | null>(null)
  const [withFood, setWithFood] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const parsed = useMemo(() => parseIngredientLines([line])[0], [line])
  const food = parsed?.name ?? line

  const build = (v: Verb, extra: Record<string, unknown> = {}): MealFoodEditResult => {
    const input = {
      rawArgs: { meal_slot: ctx.slot, food, date: ctx.date, ...extra },
      currentMeal: { name: ctx.meal.name, ingredients: ctx.meal.ingredients, macros: ctx.meal.macros },
      profileId: ctx.profileId,
      todayDate: ctx.date,
      targets: ctx.targets,
      mealsPerDay: ctx.mealsPerDay,
      includeSnacks: ctx.includeSnacks,
      dietaryPreferences: ctx.dietaryPreferences,
      dislikedFoods: ctx.dislikedFoods,
      pantryFoods: ctx.pantryFoods,
    }
    if (v === 'remove') return buildMealFoodRemoveProposal(input)
    if (v === 'replace') return buildMealFoodReplaceProposal(input)
    return buildMealFoodResizeProposal(input)
  }

  /**
   * The removal is built even when she is here to SWAP, because it is what
   * carries the offer: the swaps that would close the gap are worked out by
   * the remove builder and are the same list the coach's card shows. One
   * source, so the two surfaces cannot name different foods.
   */
  const removal = useMemo(() => build('remove'), [line, ctx])
  const suggestions = removal.ok ? (removal.diff.alternatives ?? []) : []

  /**
   * WHAT IT COSTS THE GOAL, on the screen too.
   *
   * THE SCREEN TAKES THE GUARDED-OUT PATH BY CONSTRUCTION, and that is a
   * decision rather than a shortcut. Ashley's ruling says a change working
   * against the goal is ASKED about — but a question is a conversational move,
   * and a sheet has no turn to ask in. `downgradeToCard` is exactly the shape
   * the coach already falls back to when an ask is guarded out (asked already
   * this block, or mid-session): the cost is stated, the cheaper route is
   * offered, and nothing is blocked. So both surfaces say the same sentence,
   * from the same phrasebook, and only the coach turns it into a question.
   *
   * NO DAY TOTALS, NO SENTENCE — the caller may not know the day, and a
   * judgement invented from a day this sheet cannot see is worse than silence.
   */
  const verbKind: Record<Verb, MealEditKind> = {
    remove: 'meal_food_remove', replace: 'meal_food_replace', resize: 'meal_food_resize',
  }
  const tradeoffFor = (v: Verb, result: MealFoodEditResult) => {
    if (!result.ok || !ctx.dayTotals || !ctx.fitnessGoal) return null
    const after = result.payload.option.macros
    return downgradeToCard(assessMealEdit({
      goal: ctx.fitnessGoal,
      targets: ctx.targets,
      dayBefore: ctx.dayTotals,
      dayAfter: {
        calories: ctx.dayTotals.calories - ctx.meal.macros.calories + after.calories,
        protein: ctx.dayTotals.protein - ctx.meal.macros.protein + after.protein,
        carbs: ctx.dayTotals.carbs - ctx.meal.macros.carbs + after.carbs,
        fat: ctx.dayTotals.fat - ctx.meal.macros.fat + after.fat,
      },
      kind: verbKind[v],
      slot: ctx.slot,
      foodName: food,
    }))
  }

  const rawProposal: MealFoodEditResult | null =
    verb === 'remove' ? removal
    : verb === 'replace' ? (withFood.trim() ? build('replace', { with_food: withFood.trim() }) : null)
    : verb === 'resize' ? (amount.trim() ? build('resize', { amount: Number(amount) }) : null)
    : null

  // THE COST GOES ON THE CARD, through the SAME function the coach uses. The
  // sheet already renders `implications`, so a warn line lands where the
  // structural ones do, and the cheaper route joins the swaps already offered.
  // Nothing is blocked: Apply is untouched below.
  const proposal: MealFoodEditResult | null = (() => {
    if (!rawProposal?.ok || !verb) return rawProposal
    const t = tradeoffFor(verb, rawProposal)
    if (!t || t.tier === 0) return rawProposal
    return { ...rawProposal, diff: applyTradeoff(rawProposal.diff, t) }
  })()

  const apply = async () => {
    if (!proposal?.ok) return
    setBusy(true)
    setSaveError(null)
    const result = await applyMealOptionToSlot(
      ctx.profileId,
      proposal.payload as MealAdditionPayload,
      async p => await onPick(p.slot, p.option.name),
    )
    setBusy(false)
    if (result.receipt.failed.length > 0) {
      // SAID OUT LOUD. A write that didn't happen must never look like one
      // that did — the same rule the coach's receipts follow.
      setSaveError(result.receipt.failed[0].error)
      return
    }
    onDone(verb === 'remove' ? `Took the ${food} out` : verb === 'replace' ? `Swapped the ${food}` : `Changed the ${food}`)
  }

  return (
    <div className="mt-2 rounded-xl bg-[color:var(--surface-raised)] p-3" data-meal-food-edit>
      {/* The line only while she is choosing what to do to it — once a verb
          is picked the card's own first row names it, and saying it twice is
          two chances to disagree. */}
      {verb === null && <p className="text-[0.71875rem] text-muted-foreground">{line}</p>}

      {verb === null && (
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(VERB_LABEL) as Verb[]).map(v => (
            <button
              key={v}
              type="button"
              className="min-h-[44px] rounded-xl bg-[color:var(--surface)] px-3 text-sm"
              data-edit-verb={v}
              onClick={() => setVerb(v)}
            >
              {VERB_LABEL[v]}
            </button>
          ))}
          <button type="button" className="min-h-[44px] px-3 text-sm text-muted-foreground" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}

      {verb === 'replace' && (
        <div className="mt-2 flex flex-col gap-2">
          {suggestions.length > 0 && (
            <>
              <span className="text-[0.59375rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Put in instead</span>
              {suggestions.map(alt => (
                <button
                  key={alt.label}
                  type="button"
                  className={`flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 text-left ${withFood === alt.label ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface)]'}`}
                  data-edit-suggestion={alt.label}
                  onClick={() => setWithFood(alt.label)}
                >
                  <span className="text-[0.84375rem] font-medium">{alt.label}</span>
                  <span className="shrink-0 text-[0.625rem] opacity-70">{alt.note}</span>
                </button>
              ))}
            </>
          )}
          <input
            className="min-h-[44px] rounded-xl bg-[color:var(--surface)] px-3 text-sm"
            placeholder="or type a food and amount"
            aria-label="Food and amount to put in instead"
            value={withFood}
            onChange={e => setWithFood(e.target.value)}
          />
        </div>
      )}

      {verb === 'resize' && (
        <div className="mt-2 flex items-center gap-2">
          <input
            className="min-h-[44px] w-28 rounded-xl bg-[color:var(--surface)] px-3 text-sm tabular-mono"
            inputMode="decimal"
            placeholder={String(parsed?.quantity ?? '')}
            aria-label={`New amount of ${food}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">{parsed?.unit ?? ''}</span>
        </div>
      )}

      {verb !== null && proposal && !proposal.ok && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[color:var(--role-warn)]">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{proposal.reason}</span>
        </p>
      )}

      {verb !== null && proposal?.ok && (
        /* THE SAME CARD THE COACH SHOWS, in the same order: what changes,
           then what it costs, then the offer, then the tap. */
        <div className="mt-3 space-y-2">
          {proposal.diff.rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-[0.625rem] text-muted-foreground">{row.field}</span>
              <span className="text-[0.84375rem] line-through text-muted-foreground/70">{row.before}</span>
              <span className="text-[0.90625rem] font-semibold">{row.after}</span>
              {row.note && <span className="text-[0.625rem] text-muted-foreground/80">{row.note}</span>}
            </div>
          ))}
          {proposal.diff.implications?.map((imp, i) => (
            <p key={i} className={`flex items-start gap-1.5 text-xs ${imp.severity === 'warn' ? 'text-[color:var(--role-warn)]' : 'text-muted-foreground'}`}>
              {imp.severity === 'warn' ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> : <Info className="mt-0.5 size-3.5 shrink-0" />}
              <span>{imp.text}</span>
            </p>
          ))}
          {verb === 'remove' && suggestions.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-0.5">
              <span className="text-[0.59375rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Or put in instead</span>
              {suggestions.map(alt => (
                <button
                  key={alt.label}
                  type="button"
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-[color:var(--surface)] px-3 text-left"
                  data-edit-suggestion={alt.label}
                  onClick={() => { setWithFood(alt.label); setVerb('replace') }}
                >
                  <span className="text-[0.84375rem] font-medium">{alt.label}</span>
                  <span className="shrink-0 text-[0.625rem] text-muted-foreground">{alt.note}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {saveError && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[color:var(--role-warn)]">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{saveError}</span>
        </p>
      )}

      {verb !== null && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            data-edit-apply
            onClick={() => void apply()}
            disabled={busy || !proposal?.ok}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Apply'}
          </button>
          <button type="button" className="min-h-[44px] px-3 text-sm text-muted-foreground" onClick={onCancel} disabled={busy}>
            Keep it
          </button>
        </div>
      )}
    </div>
  )
}
