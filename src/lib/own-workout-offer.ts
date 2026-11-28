// ---------------------------------------------------------------------------
// A WORKOUT OF HIS OWN, FROM THE CHAT (advise-then-allow fix 13, 28 Nov 2026).
//
// His ruling: "if somebody wants to train on the day they weren't supposed to, they should be able to add it and log
// it in the app", and his 25 Nov own-workout request ("on a blank day ... you should just be able to start
// exercising", and "Both": saved workouts in a list AND on a day). The screen has had it since 25 Nov; the coach could
// not. This works out the coach's offer, and Apply goes through the screen's own store functions (own-workout.ts,
// own-workout-plans.ts), so the screen shows exactly what the chat made:
//   start  today: his workout, started now, each exercise's sets in the boxes; nothing is logged until he ticks a set
//          (the screen's Start, from a saved workout).
//   plan   a day ahead, or no day: saved to "My workouts", on that day when one is named, with a Start there.
// A day already gone is not this card: what he DID is logged on that day by the chat's session log.
//
// Advice, not refusal: a move outside his kit, style or level goes in with the screen's own warning. The hard stops
// (his, 28 Nov) refuse: a move his injuries or a running ease-off rule out, the pregnancy rules, his never-again list
// (swapHardStop, one reader for the coach's swap and this). His numbers are his: the sets, reps and weight he gave are
// kept as he gave them (the screen does the same); none given, 3 sets of 8-10, the screen's own default (CSCS, mine:
// the middle of the road for a lift nobody has given numbers to).
//
// Pure: names are resolved by the caller's function, the store is touched only on Apply.
// ---------------------------------------------------------------------------
import { getExerciseEntry, type ExerciseEntry } from './exercise-db'
import type { UserProfile } from './types'
import { swapHardStop, swapFitWarnings } from './swap-advice'
import { saveOwnPlan, deleteOwnPlan, ownPlans, workoutFromPlan, newPlanLift, newPlanCardio, type OwnPlan } from './own-workout-plans'
import { saveOwnWorkout, removeOwnWorkout, loadOwnWorkouts } from './own-workout'

/** One thing he named, as the coach passes it. */
export interface OwnWorkoutItemArg {
  exercise?: string
  sets?: number
  reps?: string | number
  weight_kg?: number
  cardio?: string
  minutes?: number
}

export interface OwnWorkoutOfferLift { kind: 'lift'; name: string; sets: number; reps: string; weight: string }
export interface OwnWorkoutOfferCardio { kind: 'cardio'; activity: string; minutes: string }
export type OwnWorkoutOfferItem = OwnWorkoutOfferLift | OwnWorkoutOfferCardio

export interface OwnWorkoutPayload {
  /** The id the workout (start) or the saved workout (plan) is written under, so Undo finds exactly it. */
  id: string
  mode: 'start' | 'plan'
  /** YYYY-MM-DD: today for start; the day it goes on for plan, or null for the list only. */
  date: string | null
  name: string
  items: OwnWorkoutOfferItem[]
}

export type OwnWorkoutOffer =
  | { ok: true; payload: OwnWorkoutPayload; lines: string[]; warnings: string[]; notes: string[]; lead: string }
  | { ok: false; reason: string }

const MAX_ITEMS = 12
const DEFAULT_NAME = 'My workout'

const words = (s: string) => s.replace("so I won't swap it in", "so I won't put it in").replace('and I can swap it in', 'and I can put it in')

/** "Bench Press · 3 × 8 at 60 kg", "Run · 20 min". */
export function ownItemLine(i: OwnWorkoutOfferItem): string {
  if (i.kind === 'cardio') return i.minutes ? `${i.activity} · ${i.minutes} min` : i.activity
  return `${i.name} · ${i.sets} × ${i.reps}${i.weight ? ` at ${i.weight} kg` : ''}`
}

export function planOwnWorkoutOffer(input: {
  mode: unknown
  name: unknown
  date: unknown
  items: unknown
  today: string
  /** "Thursday" for a date: how the card names the day. */
  dayName: (date: string) => string
  /** The chat's own name lookup: an entry, the few it could be, or nothing. */
  resolve: (said: string) => ExerciseEntry | { ambiguous: string[] } | null
  profile: UserProfile
  exclusions: readonly string[]
  /** A fresh id for what Apply writes. */
  newId: () => string
}): OwnWorkoutOffer {
  const raw = Array.isArray(input.items) ? (input.items as OwnWorkoutItemArg[]) : []
  if (raw.length === 0) return { ok: false, reason: 'What do you want in it? Name the exercises (and sets and reps if you have them) and I\'ll set it up.' }
  if (raw.length > MAX_ITEMS) return { ok: false, reason: `That's ${raw.length} things; I can set up ${MAX_ITEMS} at most in one go. Which ones matter most?` }
  // A day he named comes as a date; anything else is asked about, never dropped (a lost day reads as "saved, no day").
  if (input.date != null && input.date !== '' && !(typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date))) {
    return { ok: false, reason: 'Which day do you want it on?' }
  }
  const date = typeof input.date === 'string' && input.date ? input.date : null
  if (date && date < input.today) {
    return { ok: false, reason: "That day has been, so there's nothing to start. Tell me the sets you did and I'll log them on that day." }
  }
  const mode: 'start' | 'plan' = input.mode === 'start' && (!date || date === input.today) ? 'start' : 'plan'

  // The hard stops are read on the day it is FOR (a workout saved for a day past 28 weeks pregnant meets those rules).
  const onDay = date ?? input.today
  const items: OwnWorkoutOfferItem[] = []
  const warnings: string[] = []
  const notes: string[] = []
  const lookUp = (said: string): ExerciseEntry | OwnWorkoutOffer => {
    const found = input.resolve(said)
    if (!found) return { ok: false, reason: `I couldn't find "${said}" in the exercise list. What's it called, or what does it work?` }
    if ('ambiguous' in found) return { ok: false, reason: `Which "${said}" do you mean: ${found.ambiguous.join(', ')}?` }
    return found
  }
  for (const r of raw) {
    const cardio = typeof r.cardio === 'string' ? r.cardio.trim() : ''
    const said = typeof r.exercise === 'string' ? r.exercise.trim() : ''
    if (cardio) {
      // Cardio is his words, but a known conditioning move (box jumps, burpees) is held to the same stops.
      const known = input.resolve(cardio)
      if (known && !('ambiguous' in known)) {
        const stop = swapHardStop(known, input.profile, input.exclusions, onDay)
        if (stop) return { ok: false, reason: words(stop) }
      } else if (known && 'ambiguous' in known) {
        // "Jumps" could be several moves; if any of them is one he may not do, it is asked about, as a lift is.
        const blocked = known.ambiguous.some(n => { const e = getExerciseEntry(n); return !!e && !!swapHardStop(e, input.profile, input.exclusions, onDay) })
        if (blocked) return { ok: false, reason: `Which "${cardio}" do you mean: ${known.ambiguous.join(', ')}?` }
      }
      const m = r.minutes == null ? null : Number(r.minutes)
      if (m != null && (!Number.isFinite(m) || m <= 0 || m > 600)) return { ok: false, reason: `How many minutes of ${cardio}?` }
      items.push({ kind: 'cardio', activity: cardio.replace(/^\w/, c => c.toUpperCase()), minutes: m == null ? '' : String(Math.round(m)) })
      continue
    }
    if (!said) return { ok: false, reason: "I couldn't tell what one of those was. Which exercises do you want in it?" }
    const entry = lookUp(said)
    if ('ok' in entry) return entry
    const stop = swapHardStop(entry, input.profile, input.exclusions, onDay)
    if (stop) return { ok: false, reason: words(stop) }
    // A NEAR-COPY GOES IN, WITH A NOTE (his ruling 28 Nov 2026, "Yes, with a note"): a version of a plan lift, which
    // the plan itself would not pick.
    if (entry.log_only) notes.push(`${entry.name}: a version of ${entry.parent ?? 'a plan lift'}; your plan's own pick is ${entry.parent ?? 'that lift'}.`)
    for (const w of swapFitWarnings(entry, input.profile, input.exclusions)) (/^Good for /.test(w) ? notes : warnings).push(`${entry.name}: ${w}`)
    // HIS NUMBERS AS HE GAVE THEM (the screen keeps reps as typed: "8", "8-10", "AMRAP", "45s"). Only an absent number
    // takes the default; a number that cannot be right is asked about, never replaced.
    const setsN = r.sets == null ? 3 : Math.round(Number(r.sets))
    if (!Number.isFinite(setsN) || setsN < 1 || setsN > 10) return { ok: false, reason: `How many sets of ${entry.name}? I can put in 1 to 10.` }
    const repsRaw = r.reps == null ? '' : String(r.reps).trim()
    if (repsRaw.length > 20) return { ok: false, reason: `How many reps of ${entry.name}?` }
    const reps = repsRaw || '8-10'
    const kg = r.weight_kg == null ? null : Number(r.weight_kg)
    if (kg != null && (!Number.isFinite(kg) || kg <= 0 || kg > 500)) return { ok: false, reason: `What weight for ${entry.name}, in kg?` }
    const weight = kg == null ? '' : String(Math.round(kg * 4) / 4)
    items.push({ kind: 'lift', name: entry.name, sets: setsN, reps, weight })
  }
  if (items.length === 0) return { ok: false, reason: 'What do you want in it? Name the exercises and I\'ll set it up.' }
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 60) : DEFAULT_NAME
  const on = date && date !== input.today ? input.dayName(date) : date ? 'today' : null
  const lead = mode === 'start'
    ? `start **${name}** now`
    : on ? `save **${name}** to your workouts and put it on ${on}` : `save **${name}** to your workouts`
  return { ok: true, payload: { id: input.newId(), mode, date: mode === 'start' ? input.today : date, name, items }, lines: items.map(ownItemLine), warnings, notes, lead }
}

// ---------------------------------------------------------------------------
// APPLY AND UNDO, through the screen's own store (the same functions its Start and "My workouts" call).
// ---------------------------------------------------------------------------

function asPlan(p: OwnWorkoutPayload, nowIso: string): OwnPlan {
  return {
    id: p.id,
    name: p.name,
    items: p.items.map(i => i.kind === 'cardio'
      ? newPlanCardio(i.activity, i.minutes)
      : { ...newPlanLift(i.name), sets: i.sets, reps: i.reps, weight: i.weight }),
    onDates: p.mode === 'plan' && p.date ? [p.date] : [],
    updatedAt: nowIso,
  }
}

/** What a saved workout holds, for "is it still as the card left it". */
function planFingerprint(p: OwnPlan): string {
  return JSON.stringify([p.name, [...p.onDates].sort(), p.items.map(i => i.kind === 'cardio' ? ['c', i.activity, i.minutes] : ['l', i.name, i.sets, i.reps, i.weight])])
}

/** Writes it. `taken` gives the set numbers already used today for an exercise, so his never write over the plan's. */
/** The hard stops again at Apply (the card may have sat while his injuries or the date changed): a sentence, or null. */
export function ownWorkoutStopAtApply(p: OwnWorkoutPayload, profile: UserProfile, exclusions: readonly string[], today: string): string | null {
  const onDay = p.date ?? today
  for (const i of p.items) {
    const e = getExerciseEntry(i.kind === 'lift' ? i.name : i.activity)
    const stop = e ? swapHardStop(e, profile, exclusions, onDay) : null
    if (stop) return words(stop)
  }
  return null
}

export function applyOwnWorkout(profileId: string, p: OwnWorkoutPayload, nowIso: string, taken: (exerciseId: string) => number[]): boolean {
  if (p.mode === 'plan') {
    if (!saveOwnPlan(profileId, asPlan(p, nowIso), nowIso)) return false
    return ownPlans(profileId).some(x => x.id === p.id)
  }
  const started = workoutFromPlan(asPlan(p, nowIso), p.date!, 'live', nowIso, taken)
  // Not started FROM a saved workout: nothing in "My workouts" was made, so it names none.
  const { planId: _none, ...rest } = started
  void _none
  if (!saveOwnWorkout(profileId, { ...rest, id: p.id })) return false
  return loadOwnWorkouts(profileId).some(w => w.id === p.id)
}

/**
 * Takes it back. A started workout only while nothing in it is saved (a ticked set or cardio is his record, and stays:
 * the screen offers removal on the same terms); a saved workout is removed everywhere.
 */
export function undoOwnWorkout(profileId: string, p: OwnWorkoutPayload, nowIso: string): { ok: true } | { ok: false; kept: string } {
  if (p.mode === 'plan') {
    // ONLY WHILE IT IS AS THE CARD LEFT IT (his 29 Oct rule for every Undo): changed since, it is his, and stays.
    const saved = ownPlans(profileId).find(x => x.id === p.id)
    if (!saved) return { ok: true }
    if (planFingerprint(saved) !== planFingerprint(asPlan(p, nowIso))) return { ok: false, kept: "You've changed it since, so it stays in your workouts." }
    deleteOwnPlan(profileId, p.id, nowIso)
    return ownPlans(profileId).some(x => x.id === p.id) ? { ok: false, kept: '' } : { ok: true }
  }
  const w = loadOwnWorkouts(profileId).find(x => x.id === p.id)
  if (!w) return { ok: true }
  const anythingSaved = w.items.some(i => i.kind === 'cardio' ? i.done : i.sets.some(s => s.done))
  if (anythingSaved) return { ok: false, kept: "You've logged some of it, so it stays. Your sets are kept." }
  removeOwnWorkout(profileId, p.id)
  return loadOwnWorkouts(profileId).some(x => x.id === p.id) ? { ok: false, kept: '' } : { ok: true }
}
