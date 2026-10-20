import type { MesocycleWeek, TrainingStyle, UserProfile, WorkoutDay } from './types'

// ---------------------------------------------------------------------------
// A DIFFERENT KIND OF SESSION TODAY — the small, import-free half.
//
// Split out of session-kind.ts on 20 Oct 2026 for one measured reason: the
// Exercise tab needs to know, on every render, whether today was swapped and
// what to say about it, and importing the whole builder for that put ~27 kB
// into the first download (test:bundle, 1148 -> 1175 kB app chunk). This file
// holds only what the tab draws with — the kinds, the marker and its sentence —
// and imports nothing but types. The builder is fetched when it is used.
// ---------------------------------------------------------------------------

export type SessionKind = 'cardio' | 'functional' | 'bodybuilding' | 'hybrid'

export interface SessionKindOption {
  kind: SessionKind
  /** The word on the button and in every sentence. */
  label: string
  /** One line under it, in her terms. */
  blurb: string
  /** The training style whose tables price it; null for cardio, which is not a style. */
  style: TrainingStyle | null
}

/**
 * EVERY KIND THE APP CAN BUILD. Combat is deliberately absent: Ashley's August
 * ruling took it out of every place a style can be CHOSEN (onboarding-slots
 * STYLES_NOT_OFFERED), and offering it for a day is choosing it.
 */
export const SESSION_KINDS: readonly SessionKindOption[] = [
  { kind: 'cardio', label: 'Cardio', blurb: 'Intervals and steady work, no weights', style: null },
  { kind: 'functional', label: 'Functional', blurb: 'Jumps, swings, carries and full-body moves', style: 'functional' },
  { kind: 'bodybuilding', label: 'Bodybuilding', blurb: 'Muscle-focused lifting, moderate reps', style: 'bodybuilding' },
  { kind: 'hybrid', label: 'Hybrid', blurb: 'Strength work with a conditioning finish', style: 'hybrid' },
]

/**
 * The kinds offered to THIS person. A style kind equal to her own style is
 * left out: "a bodybuilding session today" for someone already training
 * bodybuilding is a different session of the same kind, which is the rebuild
 * and keeps her main lift. Functional is always offered — the app's own label
 * for that style is "Functional / athletic, explosive & dynamic", and the
 * athletic session is not her lifting plan whatever her style.
 */
export function sessionKindsFor(profile: Pick<UserProfile, 'training_style'>): SessionKindOption[] {
  const own = profile.training_style || 'hybrid'
  return SESSION_KINDS.filter(k => k.kind === 'cardio' || k.kind === 'functional' || k.style !== own)
}

/** A kind from the words the coach was given. Unknown words are null, never a guess. */
export function sessionKindFrom(word: unknown): SessionKind | null {
  const w = String(word ?? '').trim().toLowerCase()
  if (!w) return null
  if (/^(cardio|conditioning|hiit|intervals?|aerobic|endurance)\b/.test(w)) return 'cardio'
  if (/^(functional|athletic|crossfit|metcon|circuit)\b/.test(w)) return 'functional'
  if (/^(bodybuilding|hypertrophy|muscle|pump)\b/.test(w)) return 'bodybuilding'
  if (/^hybrid\b/.test(w)) return 'hybrid'
  return null
}

/**
 * WHAT A SWAPPED DAY REMEMBERS, so it can be put back exactly — after a
 * reload too, because it rides in the week row's `days` jsonb.
 */
export interface KindTodayMarker {
  kind: SessionKind
  label: string
  /** The day as it was planned, before this. Never itself carries a marker. Nothing else in the week is changed, so this is all Undo needs. */
  planned: WorkoutDay
  /** The planned main lift this day dropped, if it had one. */
  droppedMainLift: string | null
}

export function kindTodayOf(day: WorkoutDay | undefined | null): KindTodayMarker | null {
  return day?.kind_today ?? null
}


/** "Box Jumps need", "Overhead Carry needs": the catalogue's plural names end in s. */
export const plural = (name: string) => /[^s]s(\s*\([^)]*\))?$/.test(name)

/** When a dropped lift is next on the plan, in words. */
export function nextTimeDue(mesocycle: MesocycleWeek[], weekNumber: number, dayName: string, name: string): string | null {
  const weeks = [...mesocycle].sort((a, b) => a.week_number - b.week_number)
  for (const w of weeks) {
    if (w.week_number < weekNumber) continue
    const days = w.week_number === weekNumber
      ? w.days.slice(w.days.findIndex(d => d.day === dayName) + 1)
      : w.days
    const hit = days.find(d => d.exercises.some(e => e.name === name))
    if (!hit) continue
    if (w.week_number === weekNumber) return `on ${hit.day}`
    if (w.week_number === weekNumber + 1) return `next ${hit.day}`
    return `in week ${w.week_number}`
  }
  return null
}

/**
 * WHAT TODAY IS, ONCE IT HAS BEEN SWAPPED — the line under the session on the
 * Exercise tab, beside "Put my planned session back". Read off the stored
 * marker and the plan, so it is the same sentence after a reload.
 */
export function describeKindToday(mesocycle: MesocycleWeek[], weekNumber: number, dayName: string): string | null {
  const day = mesocycle.find(w => w.week_number === weekNumber)?.days.find(d => d.day === dayName)
  const marker = kindTodayOf(day)
  if (!marker) return null
  const lead = `Today is a ${marker.label.toLowerCase()} session instead of ${marker.planned.focus}, just for today.`
  const main = marker.droppedMainLift
  if (!main) return lead
  const back = nextTimeDue(mesocycle, weekNumber, dayName, main)
  return `${lead} ${main} ${plural(main) ? 'are' : 'is'} back ${back ?? 'next time'}, at the weight you've built.`
}
