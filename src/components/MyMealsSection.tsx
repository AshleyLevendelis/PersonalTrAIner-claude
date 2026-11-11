import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MealSlotName } from '@/lib/meal-store'
import { makeMyMealsController, type MyMealPlan, type MyMealsSource } from '@/lib/my-meals'

// ---------------------------------------------------------------------------
// MY MEALS, ON PROFILE — the meals he already eats, added by typing them.
//
// Ashley's ruling, 11 Nov 2026, "My usual meals first". This is the screen
// half: a list of his meals and a form to add one (a name, which meal, its
// foods with amounts). Everything it decides is my-meals.ts; this draws it.
// It sits under "Foods and meals I like" because that is where he already
// tells the app what he eats.
//
// The check is the coach's own: a line the app cannot read, a food he avoids,
// a clash with his diet are each said in the place he typed, and nothing is
// kept until he has seen the meal as the app costed it.
// ---------------------------------------------------------------------------

const SLOT_LABEL: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

export function MyMealsSection({ source }: { source: MyMealsSource | null }) {
  // Built HERE, not in App: this file loads with Profile, so the planner is not part of opening the app.
  const controller = useMemo(() => (source ? makeMyMealsController(source.context, source.reload) : null), [source])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slot, setSlot] = useState<MealSlotName | null>(null)
  const [lines, setLines] = useState('')
  const [plan, setPlan] = useState<MyMealPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!controller) return null
  const chosenSlot = slot ?? controller.slots[0] ?? null

  const check = () => {
    setNote(null)
    if (!chosenSlot) { setPlan({ ok: false, reason: 'Your plan has no meals yet. Make a meal plan first, then add yours.' }); return }
    setPlan(controller.plan({ name, slot: chosenSlot, lines }))
  }
  const keep = async () => {
    if (!plan || !plan.ok) return
    setBusy(true)
    const saved = await controller.save(plan)
    setBusy(false)
    if (!saved.ok) { setNote(saved.reason); return }
    setNote(`${plan.card.title} added to your meals.`)
    setName(''); setLines(''); setPlan(null); setOpen(false)
  }
  const remove = async (meal: { slot: MealSlotName; name: string }) => {
    setNote(null)
    const ok = await controller.remove(meal)
    setNote(ok ? `${meal.name} removed from your meals.` : `${meal.name} didn't come off. Check your connection and try again.`)
  }

  return (
    <div className="space-y-1.5 pt-2" data-testid="profile-my-meals">
      <span className="text-muted-foreground">My meals</span>
      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
        Meals you already eat. They come first when each week's meals are chosen, sized to your targets.
      </p>
      {controller.meals.length > 0 && (
        <ul className="space-y-1" data-testid="my-meals-list">
          {controller.meals.map(m => (
            <li key={`${m.slot}:${m.name}`} className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-[color:var(--surface-raised)] px-3 py-1.5" data-my-meal={m.name}>
              <span className="min-w-0">
                <span className="block truncate text-sm">{m.name}</span>
                <span className="block text-[0.6875rem] text-muted-foreground">{SLOT_LABEL[m.slot]} · {m.calories} kcal · {m.protein}g protein</span>
              </span>
              <button
                type="button"
                onClick={() => void remove(m)}
                aria-label={`Remove ${m.name} from your meals`}
                className="hit-slop-44 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p role="status" data-testid="my-meals-note" className="text-[0.6875rem] leading-snug text-muted-foreground">{note}</p>}

      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setNote(null) }}
          className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary-text"
          data-testid="my-meals-add"
        >
          <Plus className="size-4" aria-hidden /> Add a meal
        </button>
      ) : (
        <div className="space-y-2 rounded-2xl border border-border p-3" data-testid="my-meals-form">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="my-meal-name">What do you call it?</label>
            <Input id="my-meal-name" value={name} maxLength={60} placeholder="e.g. Chicken, rice and veg" className="h-11"
              onChange={e => { setName(e.target.value); setPlan(null) }} />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Which meal?</span>
            <div role="radiogroup" aria-label="Which meal" className="flex flex-wrap gap-2">
              {controller.slots.map(s => (
                <button key={s} type="button" role="radio" aria-checked={chosenSlot === s} data-my-meal-slot={s}
                  onClick={() => { setSlot(s); setPlan(null) }}
                  className={`min-h-[44px] rounded-full border px-3 text-[0.8125rem] font-medium ${chosenSlot === s ? 'border-primary text-primary-text' : 'border-border text-muted-foreground'}`}>
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="my-meal-lines">What's in it? One food per line, with its amount.</label>
            <textarea id="my-meal-lines" value={lines} rows={4}
              placeholder={'150g chicken breast\n70g dry rice\n100g broccoli'}
              onChange={e => { setLines(e.target.value); setPlan(null) }}
              className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm leading-relaxed" />
          </div>

          {plan && !plan.ok && <p role="alert" data-testid="my-meal-refused" className="text-xs leading-snug text-[color:var(--role-warn-text)]">{plan.reason}</p>}
          {plan && plan.ok && (
            <div className="space-y-1 rounded-xl bg-[color:var(--surface-raised)] p-3" data-testid="my-meal-card">
              <p className="text-sm font-semibold">{plan.card.title}</p>
              <p className="text-xs text-muted-foreground" data-testid="my-meal-numbers">{plan.card.numbers}</p>
              <p className="text-xs text-muted-foreground" data-testid="my-meal-portions">{plan.card.portions}</p>
              <p className="text-xs text-muted-foreground" data-testid="my-meal-what">{plan.card.what}</p>
            </div>
          )}

          <div className="flex gap-2">
            {plan && plan.ok ? (
              <Button className="min-h-[44px] flex-1" disabled={busy} onClick={() => void keep()} data-testid="my-meal-keep">Add to my meals</Button>
            ) : (
              <Button variant="outline" className="min-h-[44px] flex-1" onClick={check} data-testid="my-meal-check">Check it</Button>
            )}
            <Button variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => { setOpen(false); setPlan(null) }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
