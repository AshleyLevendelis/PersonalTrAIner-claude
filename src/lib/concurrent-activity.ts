// ---------------------------------------------------------------------------
// A SECOND SPORT THE PLAN CAN SEE.
//
// Ashley, 5 Sep 2026: "I train in the gym mon, tue, thu, fri in the mornings
// but I also do muay thai twice a week in the evenings" — and have the chat
// acknowledge it and create a plan for that.
//
// `concurrent_activities` had been a column since July, with a type, DB
// hydration and a line in the coach's prompt — and nothing wrote it, nothing
// in generation read it, and `movement_demands` had no vocabulary. A field
// that was sent and ignored for two months. This module is the reader.
//
// Her ruling, 6 Sep 2026, choosing this over also cutting volume (a separate
// later piece) and over recording-only: KEEP the gym days, but put the
// LIGHTER sessions on the days that also carry a class, and keep prescribed
// cardio off those nights — the classes are the cardio. It changes WHICH day
// gets a session, never how much work a session holds, which is what lets it
// ship without a volume argument.
// ---------------------------------------------------------------------------

import type { ConcurrentActivity, TrainingDay } from './types'

/**
 * What a second sport asks of the body, in the plan's own vocabulary.
 *
 * A closed set on purpose: `movement_demands` was `string[]` with no
 * example anywhere, which is a field that lies about carrying information.
 * The first six are MovementPattern values the generator already reasons
 * about; the last four name things a sport does that a lift does not. The
 * coach maps a named sport onto these — "Muay Thai" is striking +
 * knee_dominant + hip_hinge + conditioning — and this module only ever asks
 * one question of them today: is there any at all.
 */
export const MOVEMENT_DEMANDS = [
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull',
  'hip_hinge', 'knee_dominant',
  'striking', 'grappling', 'running', 'conditioning',
] as const
export type MovementDemand = typeof MOVEMENT_DEMANDS[number]

export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'] as const
export type TimeOfDay = typeof TIMES_OF_DAY[number]

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Case-insensitive, whitespace-tolerant day match against the app's own spelling; null for anything else. */
export function canonicalDay(raw: string): string | null {
  const t = String(raw ?? '').trim().toLowerCase()
  return DAY_ORDER.find(d => d.toLowerCase() === t || d.toLowerCase().slice(0, 3) === t) ?? null
}

/**
 * The weekdays that carry a class, as a set of the app's own day names.
 *
 * Reads every activity rather than the first: two sports on different nights
 * is the same question asked twice. Days the model spelled in a way the app
 * does not recognise are dropped, not guessed — see canonicalDay.
 */
export function activityDays(activities: ConcurrentActivity[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const a of activities ?? []) for (const d of a.days ?? []) {
    const c = canonicalDay(d)
    if (c) out.add(c)
  }
  return out
}

/**
 * The tracks that ask the most of a body.
 *
 * This set was a local constant inside assignConditioningNotes, used there
 * to keep post-lift cardio brief on heavy days. It is the same fact this
 * module needs for a different decision, so it lives here once and both
 * callers read it. Anything not in it is a lighter day: upper pulls, core,
 * the bro-split accessory days, dedicated conditioning.
 */
export const HEAVY_TRACKS: ReadonlySet<string> = new Set([
  'Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Legs & Calves', 'Full Body Power',
])

/**
 * Reorder a week's tracks so the lighter ones land on class days.
 *
 * `split` is the generator's ordered list of focuses; day i gets split[i].
 * This returns a permutation of it — the SAME multiset of tracks, so the
 * week's total work is untouched — with heavy tracks steered away from the
 * days in `classDays` and light ones steered towards them.
 *
 * Deliberately a stable, greedy assignment rather than an optimiser:
 * 1. Every day is either a class day or not; every track is either heavy or
 *    light.
 * 2. Light tracks fill class days first, in the split's own order.
 * 3. Whatever remains fills the remaining days, in the split's own order.
 * That keeps a plan with no class days BYTE-IDENTICAL (step 2 is empty, step
 * 3 is the original order) and keeps the relative order of tracks within
 * each group, so "Push then Pull then Legs" survives as far as it can.
 *
 * When there are more class days than light tracks — a five-day week of heavy
 * work and three classes — the extra class days take heavy tracks, because
 * something has to. The card should say so; this function returns the fact
 * (`unavoidable`) so the caller can.
 */
export function reorderTracksForClassDays<T extends string>(
  days: readonly TrainingDay[],
  split: readonly T[],
  classDays: ReadonlySet<string>,
): { tracks: T[]; unavoidable: string[] } {
  if (classDays.size === 0 || days.length === 0) return { tracks: split.slice(0, days.length) as T[], unavoidable: [] }

  // The tracks this week will use, in the generator's order — split repeats
  // when a week has more days than the split has entries, exactly as the
  // generator's `split[index % split.length]` does.
  const weekTracks = days.map((_, i) => split[i % split.length])
  const light = weekTracks.filter(t => !HEAVY_TRACKS.has(t))
  const heavy = weekTracks.filter(t => HEAVY_TRACKS.has(t))

  const result: (T | null)[] = days.map(() => null)
  const unavoidable: string[] = []

  // Step 2: light tracks onto class days, in order.
  days.forEach((d, i) => {
    if (!classDays.has(d.day)) return
    const next = light.shift()
    if (next != null) result[i] = next
  })
  // Step 3: everything left — remaining light first, then heavy — onto the
  // remaining days, in day order. Light before heavy here too, so if a class
  // day was left empty above (more class days than light tracks) it still
  // gets the lightest thing available and is recorded as unavoidable.
  const rest = [...light, ...heavy]
  days.forEach((d, i) => {
    if (result[i] != null) return
    const next = rest.shift()
    if (next == null) return
    result[i] = next
    if (classDays.has(d.day) && HEAVY_TRACKS.has(next)) unavoidable.push(d.day)
  })

  return { tracks: result.map((t, i) => t ?? weekTracks[i]), unavoidable }
}

/**
 * The one sentence a card or the coach needs about a stored activity.
 * "Muay Thai · Tuesday & Thursday evenings". Never invents a time of day.
 */
export function describeActivity(a: ConcurrentActivity): string {
  const days = [...activityDays([a])].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y))
  const when = days.length === 0 ? 'days not set'
    : days.length === 1 ? days[0]
    : `${days.slice(0, -1).join(', ')} & ${days[days.length - 1]}`
  return `${a.name} · ${when}${a.timeOfDay ? ` ${a.timeOfDay}s` : ''}`
}
