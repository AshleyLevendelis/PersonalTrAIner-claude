import { useEffect, useState } from 'react'
import { computeSlotBudgets } from '@/lib/meal-generation'
import type { MealSlotName } from '@/lib/meal-store'
import {
  ELSEWHERE_WORDS, WEEKDAYS, WORKING_WEEK, mealsElsewhereClauses, hasMealsElsewhere, setMealElsewhereDays,
  toggleMealElsewhere, weekdayName, weekdayShort, type MealsElsewhere, type Weekday,
} from '@/lib/meals-elsewhere'

// ---------------------------------------------------------------------------
// MEALS COOKED FOR ME, ON PROFILE — Ashley's ruling, 11 Nov 2026, "Set days +
// optional menu": he says ONCE which meals somebody else cooks, on which days.
//
// A row a meal, a button a weekday, and a "Mon to Fri" shortcut, so his own
// example (breakfast and lunch at work) is four taps. Every tap is saved
// before it is believed: this setting changes what every future day holds, so
// a tap that did not save is put back and says so, in the place he tapped.
// What it decides is meals-elsewhere.ts; this draws it.
// ---------------------------------------------------------------------------

const SLOT_LABEL: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }
const ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function MealsElsewhereSection({ answer, mealsPerDay, includeSnacks, skipBreakfast, onSave }: {
  /** The saved answer, as the profile holds it. */
  answer: MealsElsewhere | undefined
  mealsPerDay: number | undefined
  includeSnacks: boolean | undefined
  /** Breakfast skipped: a two-meal day is lunch and dinner. */
  skipBreakfast: boolean | undefined
  /** Saves the whole answer. 'not-yet': the database has no place for it yet. Throws when it did not save. */
  onSave: (next: MealsElsewhere) => Promise<'saved' | 'not-yet'>
}) {
  const [shown, setShown] = useState<MealsElsewhere>(answer ?? {})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  // The profile is the truth: whatever it holds after a save (or a reload) is what is drawn.
  useEffect(() => { setShown(answer ?? {}) }, [answer])

  // Only the meals his day has: a two-meal day has no lunch to be cooked for him.
  // (Asked of the app's own split with a round day: the shares are rounded, so a day of 1 would give every meal none.)
  const budgets = computeSlotBudgets({ calories: 1000, protein: 100, carbs: 100, fat: 100 }, mealsPerDay, includeSnacks, skipBreakfast)
  const slots = ORDER.filter(s => (budgets[s]?.calories ?? 0) > 0)

  const save = async (next: MealsElsewhere) => {
    if (busy) return
    const before = shown
    setShown(next)
    setBusy(true)
    setNote(null)
    try {
      const result = await onSave(next)
      if (result === 'not-yet') { setShown(before); setNote({ tone: 'bad', text: ELSEWHERE_WORDS.notSavedYet }) }
      else setNote({ tone: 'ok', text: ELSEWHERE_WORDS.saved(hasMealsElsewhere(next)) })
    } catch {
      setShown(before)
      setNote({ tone: 'bad', text: ELSEWHERE_WORDS.notSaved })
    } finally {
      setBusy(false)
    }
  }

  const clauses = mealsElsewhereClauses(shown)
  return (
    <div className="space-y-2 pt-2" data-testid="profile-meals-elsewhere" style={{ borderTop: '1px solid var(--hairline)' }}>
      <span className="block text-muted-foreground">{ELSEWHERE_WORDS.profileHeading}</span>
      {/* What is set, in his words, one line for each set of days. */}
      <p className="text-xs font-medium" data-testid="meals-elsewhere-summary">
        {clauses.length === 0 ? ELSEWHERE_WORDS.profileNone : clauses.map((c, i) => <span key={c} className="block" data-meals-elsewhere-clause={i}>{c}</span>)}
      </p>
      <p className="text-[0.6875rem] leading-snug text-muted-foreground">{ELSEWHERE_WORDS.profileHelp}</p>
      {slots.map(slot => {
        const days = shown[slot] ?? []
        const workingWeek = WORKING_WEEK.every(d => days.includes(d)) && days.length === WORKING_WEEK.length
        return (
          <div key={slot} className="space-y-1" data-meals-elsewhere-row={slot}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{SLOT_LABEL[slot]}</span>
              <button
                type="button"
                disabled={busy}
                aria-pressed={workingWeek}
                data-meals-elsewhere-weekdays={slot}
                onClick={() => void save(setMealElsewhereDays(shown, slot, workingWeek ? [] : WORKING_WEEK))}
                className={`min-h-[44px] rounded-full border px-3 text-[0.75rem] font-medium ${workingWeek ? 'border-primary text-primary-text' : 'border-border text-muted-foreground'}`}
              >
                Mon to Fri
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label={`${SLOT_LABEL[slot]} cooked for me on`}>
              {WEEKDAYS.map((d: Weekday) => {
                const on = days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    aria-label={`${SLOT_LABEL[slot]}, ${weekdayName(d)}`}
                    data-meals-elsewhere-day={`${slot}-${d}`}
                    onClick={() => void save(toggleMealElsewhere(shown, slot, d))}
                    className={`min-h-[44px] rounded-xl border text-[0.6875rem] font-medium ${on ? 'border-primary bg-[color:var(--surface-raised)] text-primary-text' : 'border-border text-muted-foreground'}`}
                  >
                    {weekdayShort(d)}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {note && (
        <p
          role={note.tone === 'bad' ? 'alert' : 'status'}
          data-testid="meals-elsewhere-note"
          data-tone={note.tone}
          className={`text-[0.6875rem] leading-snug ${note.tone === 'bad' ? 'text-[color:var(--role-warn-text)]' : 'text-muted-foreground'}`}
        >
          {note.text}
        </p>
      )}
    </div>
  )
}
