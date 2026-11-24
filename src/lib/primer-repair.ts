import type { MesocycleWeek, UserProfile } from './types'
import { getExerciseEntry } from './exercise-db'
import { primerPrescription, resolveLoadFields } from './warmup'

// ---------------------------------------------------------------------------
// A PLAN ALREADY SAVED CARRIES THE NEW WARM-UP PRICE (24 Nov 2026; docs/plans/primer-dose.md).
//
// The warm-up price is a function of the person alone (warmup.ts primerPrescription), so a stored warm-up weight that
// disagrees with it was written by an older rule: the halved-twice 8 kg swing Ashley met on his own plan, or the half
// a swing no longer takes. Read on every open, written only where a slot differs, so it costs nothing once the plan
// agrees. Pure: the shell in App.tsx saves the weeks it returns.
// ---------------------------------------------------------------------------

export function repricePrimerSlots(weeks: MesocycleWeek[], profile: UserProfile): { next: MesocycleWeek[]; changed: MesocycleWeek[] } {
  const changed: MesocycleWeek[] = []
  const next = weeks.map(week => {
    let touched = false
    const days = week.days.map(day => {
      let dayTouched = false
      const exercises = day.exercises.map(ex => {
        const entry = getExerciseEntry(ex.name)
        if (!entry || entry.mechanics_tier !== 'primer' || ex.suggested_load_kg == null) return ex
        const fields = resolveLoadFields(entry, true, primerPrescription(entry, profile, ex.sets))
        if (fields.suggested_load_kg == null || fields.suggested_load_kg === ex.suggested_load_kg) return ex
        dayTouched = true
        return { ...ex, suggested_load: fields.suggested_load, suggested_load_kg: fields.suggested_load_kg, per_set_load: null }
      })
      if (!dayTouched) return day
      touched = true
      return { ...day, exercises }
    })
    if (!touched) return week
    const w = { ...week, days }
    changed.push(w)
    return w
  })
  return { next, changed }
}
