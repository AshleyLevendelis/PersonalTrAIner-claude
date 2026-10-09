// ---------------------------------------------------------------------------
// Gate: A DAY NAMED FOR A BODY PART TRAINS IT, OR IT IS A DIFFERENT DAY AND
// SAYS SO. (docs/plans/a-shoulders-day-with-shoulder-work.md, test log H4.)
//
// WRITTEN BEFORE THE FIX AND SEEN RED. The tester's week was Chest & Triceps
// with one press and one triceps movement (seven working sets, fifteen minutes
// of optional mobility), and a "Shoulders & Abs" day holding three leg
// compounds, no shoulder work, and the sentence "not a bug, just a real gap".
// None of it was a wrong number; five rules each held where they were written
// and nowhere else.
//
// The fixtures are OFFENDERS THE BROKEN CODE NAMED, seeded:
//   - Sam (seed sam:2): Minimalist, bodybuilding, four days, 30-45 minutes,
//     intermediate, fat loss, a shoulder flag.
//   - full gym, 60-90 minutes, shoulder flag: chest day was one press and one
//     triceps movement, six working sets, 47 minutes of optional mobility.
//   - home gym, 60-90 minutes, NO injury: "Shoulders & Abs" held three leg
//     compounds. This half is not an injury effect at all.
// A fixture that is merely plausible proves nothing: six "obviously tight"
// profiles once all passed with the guard off.
//
// Section 3 hands each mechanism a constructed input directly, so the unit
// proves the mechanism and the grid proves it matters in a real plan.
//
// THE CHECK COUNT IS THE SAME EVERY RUN. A handle the engine does not export
// yet is a FAIL on its own line, never a skipped section.
// ---------------------------------------------------------------------------

import * as planModule from '../src/lib/exercise-plan'
import {
  generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool, TRACKS,
} from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, getMovementFamily, type ExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { optionalFillerSeconds } from '../src/lib/session-duration'
import { dayAnchorExercise } from '../src/lib/session-derive'
import { scorePlan } from '../src/lib/quality-score'
import { ALL_EQUIPMENT, ALL_DURATIONS, getInjuryCombinations } from '../src/lib/dev-constraint-audit'
import { buildProfile, comboKey, type Combination } from './quality-grid'
import type { UserProfile, WorkoutDay, MesocycleWeek } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

// ---- handles the fix introduces. Absent = a failing check, not a crash. ----
type AnyFn = (...args: never[]) => unknown
const handle = <T extends AnyFn>(name: string): T | null =>
  (typeof (planModule as Record<string, unknown>)[name] === 'function' ? (planModule as Record<string, unknown>)[name] as T : null)

type SelectFn = (focus: string, pool: ExerciseEntry[], opts: {
  profile: UserProfile
  /** True where two other days of the week already train legs. */
  weekTrainsLegsElsewhere?: boolean
}) => { main: ExerciseEntry[]; primer: ExerciseEntry | null; rehab: ExerciseEntry | null }
const selectDayExercises = handle<SelectFn>('selectDayExercises')
const resolveDayTrack = handle<(focus: string, pool: ExerciseEntry[]) => string>('resolveDayTrack')
const isDayTrackViable = handle<(focus: string, pool: ExerciseEntry[]) => boolean>('isDayTrackViable')
const dayHoldsDefiningWork = handle<(focus: string, entries: ExerciseEntry[]) => boolean>('dayHoldsDefiningWork')

type GapNoteFn = (day: WorkoutDay, profile: UserProfile) => string | null
const describeDayGap: GapNoteFn | null = await import('../src/lib/day-gap-note')
  .then(m => (m as { describeDayGap?: GapNoteFn }).describeDayGap ?? null)
  .catch(() => null)
/** What the screen would print under the day: derived where the fix exists, the stamped field where it does not. */
const noteOn = (day: WorkoutDay, profile: UserProfile): string | null =>
  describeDayGap ? describeDayGap(day, profile) : ((day as { pattern_gap_note?: string }).pattern_gap_note ?? null)

// ---- the gate's OWN tables: what makes a day what its name says. Not read
// from the engine, so a change that emptied the engine's table cannot make
// this gate agree with it. ----
const LEG_COMPOUND = new Set(['knee_dominant', 'hip_hinge', 'single_leg'])
const LEG_FOCUS = new Set(['Legs & Calves', 'Squat & Carry', 'Pull & Hinge', 'Full Body Power'])
const isDeltWork = (e: ExerciseEntry) =>
  e.movement_pattern === 'vertical_push' || e.movement_pattern === 'isolation_shoulder' || e.substitution_group === 'rear_delt'
const DEFINING: Record<string, (e: ExerciseEntry) => boolean> = {
  'Chest & Triceps': e => e.movement_pattern === 'horizontal_push',
  'Back & Biceps': e => e.movement_pattern === 'horizontal_pull' || e.movement_pattern === 'vertical_pull',
  'Legs & Calves': e => LEG_COMPOUND.has(e.movement_pattern),
  'Shoulders & Abs': isDeltWork,
}

const working = (day: WorkoutDay): { entry: ExerciseEntry; sets: number; name: string }[] =>
  day.exercises
    .map(e => ({ entry: getExerciseEntry(e.name), sets: e.sets, name: e.name }))
    .filter((x): x is { entry: ExerciseEntry; sets: number; name: string } => !!x.entry && x.entry.mechanics_tier !== 'primer')
const workingSets = (day: WorkoutDay) => working(day).reduce((s, x) => s + x.sets, 0)
const legCompounds = (day: WorkoutDay) =>
  working(day).filter(x => LEG_COMPOUND.has(x.entry.movement_pattern) && x.entry.mechanics_tier !== 'tier3_isolation')
const families = (entries: ExerciseEntry[]) => entries.map(getMovementFamily)
const hasDuplicateFamily = (entries: ExerciseEntry[]) => new Set(families(entries)).size !== entries.length
/**
 * THE SAME MOVEMENT TWICE — same family, same plane, an implement in common.
 * Written out here rather than imported, so the gate does not agree with the
 * engine by construction. (Two ANGLES of one family on a long day — Barbell
 * Bench Press beside Incline Dumbbell Press — are variety, and the scorer has
 * always drawn the line in the same place.)
 */
const sameMovementTwice = (entries: ExerciseEntry[]): string[] => {
  const out: string[] = []
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j]
    if (a.mechanics_tier === 'primer' && b.mechanics_tier === 'primer') continue
    if (a.name !== b.name && getMovementFamily(a) === getMovementFamily(b) && a.angle_vector === b.angle_vector && a.equipment.some(eq => b.equipment.includes(eq)))
      out.push(`${a.name} + ${b.name}`)
  }
  return out
}

const quiet = <T>(fn: () => T): T => {
  const log = console.log, warn = console.warn
  console.log = () => {}; console.warn = () => {}
  try { return fn() } finally { console.log = log; console.warn = warn }
}

const samProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'fat_loss', preferred_time: 'evening', bmr: 1800, tdee: 2600,
  equipment_access: 'minimalist', injuries: ['shoulders'], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation',
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', max_dumbbell_kg: 24,
  created_at: '2026-10-05T00:00:00.000Z', ...over,
}) as unknown as UserProfile

const combo = (c: Partial<Combination>): Combination => ({
  equipment: 'full_gym', injuries: [], duration: '60-90', style: 'bodybuilding', experience: 'intermediate',
  goal: 'hypertrophy', recovery: 'moderate', conditioningPref: 'tolerate', ...c,
} as Combination)
const gridWeek = (c: Combination): { week: MesocycleWeek; profile: UserProfile } => {
  const profile = buildProfile(c)
  const meso = quiet(() => {
    setRandomSource(seededRngFromKey(comboKey(c)))
    try { return generateMesocycle(profile) } finally { resetRandomSource() }
  })
  return { week: meso[0], profile }
}
const dayByFocus = (week: MesocycleWeek, focus: string) => week.days.find(d => d.focus === focus && d.exercises.length > 0) ?? null

function main() {
  // =========================================================================
  console.log('\n1. The named offenders')
  // =========================================================================
  const sam = samProfile()
  const samMeso = quiet(() => {
    setRandomSource(seededRngFromKey('sam:2'))
    try { return generateMesocycle(sam, generateExercisePlan(sam, []).plan) } finally { resetRandomSource() }
  })
  const samWeek = samMeso[0]
  const samMon = samWeek.days.find(d => d.day === 'Monday')!
  const samSat = samWeek.days.find(d => d.day === 'Saturday')!
  const satWorking = working(samSat)
  const satKeepsItsName = samSat.focus === 'Shoulders & Abs'

  check('Sam, Saturday: a "Shoulders & Abs" day holds delt work, or is called something else',
    !satKeepsItsName || satWorking.some(x => isDeltWork(x.entry)),
    { focus: samSat.focus, day: satWorking.map(x => x.name) })
  check('Sam, Saturday: not a third leg session — one leg compound at most',
    LEG_FOCUS.has(samSat.focus) ? false : legCompounds(samSat).length <= 1,
    { focus: samSat.focus, legs: legCompounds(samSat).map(x => x.name) })
  {
    const lastWorking = satWorking[satWorking.length - 1]
    const legs = legCompounds(samSat)
    check('Sam, Saturday: the one leg accessory is the LAST exercise, never the main lift',
      legs.length === 0 || (legs.length === 1 && lastWorking?.name === legs[0].name),
      { order: satWorking.map(x => x.name) })
  }
  check('Sam, Saturday: upper-body pulling carries the freed volume (a row or rear-delt work is on the day)',
    satWorking.some(x => x.entry.movement_pattern === 'horizontal_pull'),
    satWorking.map(x => `${x.name}:${x.entry.movement_pattern}`))
  check('Sam, Saturday: abs are still on a day called "Shoulders & Abs"',
    satWorking.some(x => x.entry.movement_pattern === 'core') || samSat.focus !== 'Shoulders & Abs',
    satWorking.map(x => x.name))

  const monWorking = working(samMon)
  check('Sam, Monday: the chest day is ten working sets or more (it was seven)',
    workingSets(samMon) >= 10, { sets: workingSets(samMon), day: monWorking.map(x => `${x.name} ${x.sets}`) })
  check('Sam, Monday: not under ten working sets with ten minutes of optional mobility on top',
    !(workingSets(samMon) <= 9 && optionalFillerSeconds(samMon) >= 600),
    { sets: workingSets(samMon), optionalMinutes: optionalFillerSeconds(samMon) / 60 })
  {
    const triceps = monWorking.filter(x => x.entry.movement_pattern === 'isolation_tricep').map(x => x.entry)
    // RE-ANCHORED 9 Oct 2026 (docs/plans/kit-list.md). This held "two triceps
    // movements", and the second one was a BAND pushdown beside dumbbells he
    // owns — the cost this gate's own author measured afterwards and did not
    // fix. A band or bag movement is no longer a candidate where the person
    // owns a properly loading equivalent, and with a shoulder flag his kit
    // holds exactly one of those for the triceps (the dumbbell kickback the
    // pack added). So: the day's triceps work is properly loaded, and no band
    // stands beside it. Two different triceps movements is held where the pool
    // holds two loaded ones (3q2 below).
    const improvised = (e: ExerciseEntry) => e.equipment.some(q => q === 'resistance band' || q === 'weighted backpack')
    check('Sam, Monday: a properly loaded triceps movement, and no band movement beside it',
      triceps.length >= 1 && !hasDuplicateFamily(triceps) && triceps.every(e => !improvised(e)), triceps.map(e => `${e.name}=${getMovementFamily(e)}`))
  }
  check('Sam, Monday: still a chest day — the press is there and the day opens with it',
    samMon.focus === 'Chest & Triceps' && monWorking[0]?.entry.movement_pattern === 'horizontal_push',
    { focus: samMon.focus, first: monWorking[0]?.name })
  check('Sam: no day in the week holds the same movement twice',
    samWeek.days.every(d => sameMovementTwice(working(d).map(x => x.entry)).length === 0),
    samWeek.days.flatMap(d => sameMovementTwice(working(d).map(x => x.entry)).map(p => `${d.day}: ${p}`)))

  {
    // The week's push:pull pass used to cut the back day's only row to its
    // two-set floor to "balance" a four-set floor press — the thing Ashley's
    // 24 Sep ruling rejected ("over cutting pulling to match").
    const samTue = samWeek.days.find(d => d.day === 'Tuesday')!
    const rows = working(samTue).filter(x => x.entry.substitution_group === 'row')
    check('Sam, Tuesday: the back day\'s row is not cut to its floor to match one press',
      rows.length > 0 && rows.every(x => x.sets >= 3), working(samTue).map(x => `${x.name} ${x.sets}`))
    check('Sam, Tuesday: the back day did not get thinner to pay for the other two (it was nine working sets)',
      workingSets(samTue) >= 9, { sets: workingSets(samTue), day: working(samTue).map(x => `${x.name} ${x.sets}`) })
    const weekPull = samWeek.days.reduce((s, d) => s + working(d).filter(x => x.entry.movement_pattern === 'horizontal_pull' || x.entry.movement_pattern === 'vertical_pull').reduce((t, x) => t + x.sets, 0), 0)
    const weekPress = samWeek.days.reduce((s, d) => s + working(d).filter(x => x.entry.movement_pattern === 'horizontal_push' || x.entry.movement_pattern === 'vertical_push').reduce((t, x) => t + x.sets, 0), 0)
    check('Sam, week: pulls more than it presses, and the press is at least what it was (four sets)',
      weekPull > weekPress && weekPress >= 4, { weekPress, weekPull })
  }

  const samNote = noteOn(samSat, sam)
  check('Sam, Saturday: nothing on screen says "not a bug"',
    !samWeek.days.some(d => /not a bug/i.test(noteOn(d, sam) ?? '')), samNote)
  check('Sam, Saturday: the note describes the day as it is — no overhead pressing, and what it is instead',
    satKeepsItsName
      ? samNote === "No overhead pressing while your shoulder's flagged, so today is upper back and abs."
      : samNote === null,
    { focus: samSat.focus, note: samNote })
  check('Sam, Saturday: the note does not send anyone to Profile',
    !/profile/i.test(samNote ?? ''), samNote)
  {
    // The flag comes off; the stored day is unchanged. The note was stamped
    // once at generation and went on blaming "your injury settings".
    const cleared = samProfile({ injuries: [] })
    const after = noteOn(samSat, cleared)
    check('Sam, flag removed, same stored day: the note no longer names a flag nobody has',
      !/flagged|injur/i.test(after ?? ''), after)
  }

  const fullFlagged = gridWeek(combo({ equipment: 'full_gym', injuries: ['shoulders'] }))
  {
    const chest = dayByFocus(fullFlagged.week, 'Chest & Triceps')
    const presses = chest ? working(chest).filter(x => x.entry.movement_pattern === 'horizontal_push').map(x => x.entry) : []
    check('full gym, 60-90, shoulder flag: the chest day holds two presses, different movements',
      presses.length >= 2 && !hasDuplicateFamily(presses), presses.map(e => `${e.name}=${getMovementFamily(e)}`))
    check('full gym, 60-90, shoulder flag: the chest day is ten working sets or more (it was six)',
      !!chest && workingSets(chest) >= 10, chest ? { sets: workingSets(chest), day: working(chest).map(x => x.name) } : 'no chest day')
    const shoulders = dayByFocus(fullFlagged.week, 'Shoulders & Abs')
    check('full gym, 60-90, shoulder flag: the Shoulders day is not led by a deadlift — one leg compound at most',
      !!shoulders && legCompounds(shoulders).length <= 1,
      shoulders ? working(shoulders).map(x => x.name) : 'no Shoulders day')
    const shNote = shoulders ? noteOn(shoulders, fullFlagged.profile) : 'no Shoulders day'
    check('full gym, 60-90, shoulder flag: a Shoulders day that HAS its overhead press carries no note',
      shNote === null, shNote)
    check('full gym, 60-90, shoulder flag: a session with room holds two core movements',
      !!shoulders && working(shoulders).filter(x => x.entry.movement_pattern === 'core').length >= 2,
      shoulders ? working(shoulders).filter(x => x.entry.movement_pattern === 'core').map(x => x.name) : null)
    const top = shoulders ? [...working(shoulders)].sort((a, b) => b.sets - a.sets)[0] : null
    const leg = shoulders ? legCompounds(shoulders)[0] : null
    check('full gym, 60-90, shoulder flag: the leg accessory is last and is not the day\'s biggest dose',
      !!shoulders && !!leg && working(shoulders)[working(shoulders).length - 1].name === leg.name && !!top && leg.sets <= Math.min(...working(shoulders).filter(x => x.entry.movement_pattern === 'vertical_push').map(x => x.sets), 99) + 1,
      shoulders ? working(shoulders).map(x => `${x.name} ${x.sets}`) : null)
  }

  const homeUninjured = gridWeek(combo({ equipment: 'home_gym', injuries: [] }))
  {
    const shoulders = dayByFocus(homeUninjured.week, 'Shoulders & Abs')
    check('home gym, 60-90, NO injury: "Shoulders & Abs" holds one leg compound at most (it held three)',
      !!shoulders && legCompounds(shoulders).length <= 1,
      shoulders ? working(shoulders).map(x => x.name) : 'no Shoulders day')
    const delts = shoulders ? working(shoulders).filter(x => isDeltWork(x.entry)) : []
    check('home gym, 60-90, NO injury: the freed slots went to shoulders — three delt movements or more',
      delts.length >= 3, delts.map(x => x.name))
    check('home gym, 60-90, NO injury: rear-delt work is on the Shoulders day, and no row came with it',
      delts.some(x => x.entry.substitution_group === 'rear_delt') &&
      !!shoulders && !working(shoulders).some(x => x.entry.substitution_group === 'row'),
      shoulders ? working(shoulders).map(x => `${x.name}:${x.entry.substitution_group}`) : null)
  }

  // =========================================================================
  console.log('\n2. The properties, over the bodybuilding slice of the grid')
  // =========================================================================
  // 4 kits x 9 injury sets x 4 lengths x two (experience, goal) pairs = 288
  // seeded plans, the grid's own keys. DAY_PURPOSE_GRID=full runs all 2,304.
  // DAY_PURPOSE_GRID=small is for mutation rounds only: one pair, 144 plans.
  // The same checks run; only the slice (and the size it is checked against)
  // is smaller.
  const full = process.env.DAY_PURPOSE_GRID === 'full'
  const small = process.env.DAY_PURPOSE_GRID === 'small'
  const pairs: [Combination['experience'], Combination['goal']][] = full
    ? (['beginner', 'novice', 'intermediate', 'advanced'] as Combination['experience'][])
        .flatMap(x => (['hypertrophy', 'fat_loss', 'conditioning', 'functional'] as Combination['goal'][]).map(g => [x, g] as [Combination['experience'], Combination['goal']]))
    : small ? [['beginner', 'fat_loss']]
    : [['intermediate', 'hypertrophy'], ['beginner', 'fat_loss']]

  const offenders = { noDefining: [] as string[], legHeavy: [] as string[], onePress: [] as string[], thin: [] as string[], family: [] as string[], notABug: [] as string[], allLegs: [] as string[], legLeads: [] as string[], legIsMain: [] as string[], rowTaken: [] as string[] }
  let plans = 0, bodyPartDays = 0, renamed = 0, chestDaysWithTwoInPool = 0, thinButExhausted = 0, onePressByBalance = 0, shouldersDaysWithLeg = 0, presslessShoulders = 0
  for (const equipment of ALL_EQUIPMENT) for (const injuries of getInjuryCombinations()) for (const duration of ALL_DURATIONS) for (const [experience, goal] of pairs) {
    const c = combo({ equipment, injuries, duration, experience, goal })
    const { week, profile } = gridWeek(c)
    const key = comboKey(c)
    plans++
    const pool = getConstrainedPool(profile, [])
    const weekCount = new Map<string, number>()
    for (const d of week.days) for (const x of working(d)) weekCount.set(x.name, (weekCount.get(x.name) ?? 0) + 1)
    const trained = week.days.filter(d => d.exercises.length > 0)
    if (trained.length >= 4 && trained.every(d => LEG_FOCUS.has(d.focus))) offenders.allLegs.push(key)
    const weekSets = (pats: string[]) => trained.reduce((s, d) => s + working(d).filter(x => pats.includes(x.entry.movement_pattern)).reduce((t, x) => t + x.sets, 0), 0)
    const pressSets = weekSets(['horizontal_push', 'vertical_push']), pullSets = weekSets(['horizontal_pull', 'vertical_pull'])
    for (const d of trained) {
      const w = working(d)
      const entries = w.map(x => x.entry)
      if (!(d.focus in DEFINING)) renamed++
      // P1
      if (d.focus in DEFINING) {
        bodyPartDays++
        if (!entries.some(DEFINING[d.focus])) offenders.noDefining.push(`${key} ${d.day} ${d.focus}`)
      }
      // P2
      if (!LEG_FOCUS.has(d.focus) && legCompounds(d).length >= 3) offenders.legHeavy.push(`${key} ${d.day} ${d.focus}`)
      // P3
      if (d.focus === 'Chest & Triceps') {
        const pressFamiliesInPool = new Set(pool.filter(e => e.movement_pattern === 'horizontal_push').map(getMovementFamily))
        if (pressFamiliesInPool.size >= 2) {
          chestDaysWithTwoInPool++
          if (entries.filter(e => e.movement_pattern === 'horizontal_push').length < 2) {
            // The week-level push:pull pass may take a second press away — a
            // deliberate rule with its own gate. It only ever does so where
            // the week already presses as much as it pulls; a one-press chest
            // day in a week that pulls MORE than it presses is the defect.
            if (pressSets >= pullSets) onePressByBalance++
            else offenders.onePress.push(`${key} ${d.day} press=${pressSets} pull=${pullSets}`)
          }
        }
      }
      // P4
      if (workingSets(d) <= 9 && optionalFillerSeconds(d) >= 600) {
        const track = (TRACKS as Record<string, { primary_patterns: string[]; secondary_patterns: string[]; forbidden_patterns: string[]; borrow?: { patterns?: string[]; groups?: string[] }[] }>)[d.focus]
        // Everything the day is already carrying, warm-up drills included:
        // the selector keeps one movement per family across the WHOLE day.
        const onTheDay = families(d.exercises.map(ex => getExerciseEntry(ex.name)).filter((e): e is ExerciseEntry => !!e))
        const hasMainLift = entries.some(e => e.mechanics_tier === 'tier1_compound')
        const reachable = track ? pool.filter(e => {
          if (e.mechanics_tier === 'primer' || e.mechanics_tier === 'cardio') return false
          if (e.mechanics_tier === 'tier1_compound' && hasMainLift) return false
          const own = [...track.primary_patterns, ...track.secondary_patterns].includes(e.movement_pattern) && !track.forbidden_patterns.includes(e.movement_pattern)
          const borrowed = (track.borrow ?? []).some(b => (b.patterns ?? []).includes(e.movement_pattern) || (b.groups ?? []).includes(e.substitution_group))
          if (!own && !borrowed) return false
          if (borrowed && !own && e.mechanics_tier === 'tier1_compound') return false
          if (onTheDay.includes(getMovementFamily(e))) return false
          return (weekCount.get(e.name) ?? 0) < 2
        }) : []
        if (reachable.length > 0) offenders.thin.push(`${key} ${d.day} ${d.focus} sets=${workingSets(d)} could still take ${reachable.slice(0, 3).map(e => e.name).join(', ')}`)
        else thinButExhausted++
      }
      // P11: a Shoulders day with no overhead press keeps its row. Where one
      // press is all the pool holds, the week's exercise-count balance pass
      // used to REMOVE pulls to match it — and the row on this day is the
      // first it reaches, leaving "upper back" as shrugs and a curl.
      if (d.focus === 'Shoulders & Abs' && !entries.some(e => e.movement_pattern === 'vertical_push')) {
        presslessShoulders++
        // By substitution group, not pattern: a rear-delt flye is filed as a
        // horizontal pull too, and it is not the row this is about.
        const poolHasRow = pool.some(e => e.substitution_group === 'row' && e.mechanics_tier !== 'primer')
        if (poolHasRow && !entries.some(e => e.substitution_group === 'row'))
          offenders.rowTaken.push(`${key} ${d.day}: ${w.map(x => x.name).join(' | ')}`)
      }
      // P9: the leg accessory on a Shoulders day is last, and never its biggest dose.
      if (d.focus === 'Shoulders & Abs') {
        const legs = legCompounds(d)
        if (legs.length > 0) {
          shouldersDaysWithLeg++
          const mostSets = Math.max(...w.map(x => x.sets))
          const others = w.filter(x => !LEG_COMPOUND.has(x.entry.movement_pattern))
          if (w[w.length - 1].name !== legs[0].name || (legs[0].sets === mostSets && others.every(x => x.sets < mostSets)))
            offenders.legLeads.push(`${key} ${d.day}: ${w.map(x => `${x.name} ${x.sets}`).join(' | ')}`)
          // P10: nor the movement the screen labels "Main lift". Where the day
          // has no tier-1 of its own that label goes to the highest-ranked
          // movement on it, so a leg accessory that outranks the day's own
          // work would be drawn as the point of a Shoulders day. Asked of the
          // function the screen itself uses.
          if (dayAnchorExercise(d.exercises)?.name === legs[0].name)
            offenders.legIsMain.push(`${key} ${d.day}: ${w.map(x => x.name).join(' | ')}`)
        }
      }
      for (const pair of sameMovementTwice(entries)) offenders.family.push(`${key} ${d.day}: ${pair}`)
      if (/not a bug/i.test(noteOn(d, profile) ?? '')) offenders.notABug.push(`${key} ${d.day}`)
    }
  }
  console.log(`  (${plans} plans, ${bodyPartDays} body-part days, ${renamed} days carrying another name, ${chestDaysWithTwoInPool} chest days whose pool holds two presses — ${onePressByBalance} of them left with one by the week's push:pull pass, ${thinButExhausted} thin days with nothing left to take, ${shouldersDaysWithLeg} Shoulders days carrying a leg accessory)`)
  check('the slice is the size it claims', plans === (full ? 2304 : small ? 144 : 288) && bodyPartDays > plans, { plans, bodyPartDays })
  check('P1: every body-part day holds its defining work, or carries a different name',
    offenders.noDefining.length === 0, { count: offenders.noDefining.length, first: offenders.noDefining.slice(0, 3) })
  check('P2: no day holds three leg compounds unless it is named for legs',
    offenders.legHeavy.length === 0, { count: offenders.legHeavy.length, first: offenders.legHeavy.slice(0, 3) })
  check('P3: a chest day holds two presses wherever the pool has two different ones',
    chestDaysWithTwoInPool > 0 && offenders.onePress.length === 0, { of: chestDaysWithTwoInPool, count: offenders.onePress.length, first: offenders.onePress.slice(0, 3) })
  check('P4: no day is under ten working sets with ten minutes of optional mobility while its pool still has work to give',
    offenders.thin.length === 0, { count: offenders.thin.length, first: offenders.thin.slice(0, 3) })
  check('P5: no day holds the same movement twice (same family, same plane, an implement in common)',
    offenders.family.length === 0, { count: offenders.family.length, first: offenders.family.slice(0, 2) })
  check('P6: no plan is four leg days because its chest and shoulders days had nowhere else to go',
    offenders.allLegs.length === 0, { count: offenders.allLegs.length, first: offenders.allLegs.slice(0, 3) })
  check('P7: "not a bug" appears under no day', offenders.notABug.length === 0, { count: offenders.notABug.length, first: offenders.notABug.slice(0, 3) })
  check('P8: the fallback is real — some day on the slice took another name', renamed > 0, { renamed })
  check('P9: the leg accessory on a Shoulders day is written last and is never alone as the day\'s biggest dose',
    shouldersDaysWithLeg > 0 && offenders.legLeads.length === 0, { of: shouldersDaysWithLeg, count: offenders.legLeads.length, first: offenders.legLeads.slice(0, 3) })
  check('P11: a Shoulders day with no overhead press keeps a row wherever the pool holds one — pulling is not removed to match one press',
    presslessShoulders > 0 && offenders.rowTaken.length === 0, { of: presslessShoulders, count: offenders.rowTaken.length, first: offenders.rowTaken.slice(0, 3) })
  check('P10: the leg accessory on a Shoulders day is never the movement the screen labels "Main lift"',
    shouldersDaysWithLeg > 0 && offenders.legIsMain.length === 0, { of: shouldersDaysWithLeg, count: offenders.legIsMain.length, first: offenders.legIsMain.slice(0, 3) })

  // =========================================================================
  console.log('\n3. Each mechanism, handed its input directly')
  // =========================================================================
  const live = EXERCISE_DATABASE.filter(e => !e.retired)
  const named = (...names: string[]) => names.map(n => { const e = live.find(x => x.name === n); if (!e) throw new Error(`fixture names a movement the catalogue does not hold: ${n}`); return e })
  const legsAndCore = live.filter(e => (LEG_COMPOUND.has(e.movement_pattern) || e.movement_pattern === 'core') && e.mechanics_tier !== 'primer')
  const pulling = named('Towel Row', 'Backpack Row', 'Hammer Curls', 'Dumbbell Shrugs')

  check('3a. the four new handles exist', !!selectDayExercises && !!resolveDayTrack && !!isDayTrackViable && !!dayHoldsDefiningWork,
    { selectDayExercises: !!selectDayExercises, resolveDayTrack: !!resolveDayTrack, isDayTrackViable: !!isDayTrackViable, dayHoldsDefiningWork: !!dayHoldsDefiningWork })

  // --- defining patterns and viability
  check('3b. twenty leg exercises and a plank do not make a Shoulders day viable',
    legsAndCore.length >= 20 && isDayTrackViable?.('Shoulders & Abs', legsAndCore) === false,
    { pool: legsAndCore.length, viable: isDayTrackViable?.('Shoulders & Abs', legsAndCore) ?? 'no handle' })
  check('3c. …and one rear-delt movement does (rear delts are delt work)',
    isDayTrackViable?.('Shoulders & Abs', [...legsAndCore, ...named('Rear Delt Flyes')]) === true,
    isDayTrackViable?.('Shoulders & Abs', [...legsAndCore, ...named('Rear Delt Flyes')]) ?? 'no handle')
  check('3d. a chest day with triceps work and no press is not viable',
    isDayTrackViable?.('Chest & Triceps', named('Band Tricep Pushdown', 'Band Tricep Kickback', 'Tricep Pushdowns', 'Skull Crushers')) === false,
    isDayTrackViable?.('Chest & Triceps', named('Band Tricep Pushdown', 'Band Tricep Kickback', 'Tricep Pushdowns', 'Skull Crushers')) ?? 'no handle')
  check('3e. the two rules that were written by hand still hold: no squat, no "Squat & Carry"; no overhead press, no "Push & Press"',
    isDayTrackViable?.('Squat & Carry', live.filter(e => e.movement_pattern !== 'knee_dominant' && e.movement_pattern !== 'single_leg')) === false &&
    isDayTrackViable?.('Push & Press', live.filter(e => e.movement_pattern !== 'vertical_push')) === false &&
    isDayTrackViable?.('Squat & Carry', live) === true && isDayTrackViable?.('Push & Press', live) === true)

  // --- the named fallback, tried before "richest track"
  {
    const pool = [...legsAndCore, ...pulling]
    const got = resolveDayTrack?.('Shoulders & Abs', pool) ?? 'no handle'
    check('3f. no delt work in the pool: the day becomes "Upper Pull & Core", not the richest track (which is legs)',
      got === 'Upper Pull & Core', got)
    const chest = resolveDayTrack?.('Chest & Triceps', pool) ?? 'no handle'
    check('3g. no press in the pool: the chest day becomes "Upper Pull & Core" too', chest === 'Upper Pull & Core', chest)
    const nowhere = resolveDayTrack?.('Shoulders & Abs', legsAndCore.filter(e => e.movement_pattern !== 'core')) ?? 'no handle'
    check('3h. the fallback is not viable either (legs only): the old search still finds a day rather than an empty one',
      typeof nowhere === 'string' && nowhere !== 'Shoulders & Abs' && nowhere !== 'Upper Pull & Core' && nowhere !== 'no handle', nowhere)
    check('3i. a viable day is left alone', resolveDayTrack?.('Shoulders & Abs', live) === 'Shoulders & Abs' && resolveDayTrack?.('Chest & Triceps', live) === 'Chest & Triceps')
  }

  // --- legs out of the fill; the one leg slot; rear delts in, rows out
  const uninjuredLong = buildProfile(combo({ equipment: 'full_gym', injuries: [], duration: '90+' }))
  // 60-90 is the longest session an uninjured full-gym pool fills from its
  // own patterns. At 90+ the count is ten and the Shoulders pool holds eight
  // families, so that day borrows — which is the rule working, tested below.
  const uninjured = buildProfile(combo({ equipment: 'full_gym', injuries: [], duration: '60-90' }))
  const pick = (focus: string, profile: UserProfile, seed: string, weekTrainsLegsElsewhere = false) => {
    if (!selectDayExercises) return null
    return quiet(() => {
      setRandomSource(seededRngFromKey(seed))
      try { return selectDayExercises(focus, getConstrainedPool(profile, []), { profile, weekTrainsLegsElsewhere }) } finally { resetRandomSource() }
    })
  }
  {
    const runs = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => pick('Shoulders & Abs', uninjuredLong, `unit:${s}`))
    const legCounts = runs.map(r => r ? r.main.filter(e => LEG_COMPOUND.has(e.movement_pattern)).length : -1)
    check('3j. full gym, 90+, uninjured, six seeds: the Shoulders day never takes more than one leg movement (the longest session is where it took four)',
      legCounts.every(n => n === 0 || n === 1) && legCounts.some(n => n === 1), legCounts)
    check('3k. …and that one is last', runs.every(r => {
      if (!r) return false
      const i = r.main.findIndex(e => LEG_COMPOUND.has(e.movement_pattern))
      return i === -1 || i === r.main.length - 1
    }), runs.map(r => r?.main.map(e => e.name).join(' | ')).slice(0, 2))
    const own = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => pick('Shoulders & Abs', uninjured, `unit:${s}`))
    check('3l. 60-90: a rear-delt movement is on it, and nothing from the row family',
      own.every(r => !!r && r.main.some(e => e.substitution_group === 'rear_delt') && !r.main.some(e => e.substitution_group === 'row')),
      own.map(r => r?.main.filter(e => e.movement_pattern === 'horizontal_pull').map(e => e.name)))
    const elsewhere = ['a', 'b', 'c'].map(s => pick('Shoulders & Abs', uninjuredLong, `unit:${s}`, true))
    check('3m. where two other days already train legs, the leg slot is not filled at all',
      elsewhere.every(r => !!r && !r.main.some(e => LEG_COMPOUND.has(e.movement_pattern))),
      elsewhere.map(r => r?.main.filter(e => LEG_COMPOUND.has(e.movement_pattern)).map(e => e.name)))
    check('3n. 60-90: a Shoulders day that reaches its count from its own pool borrows nothing — no row, no traps, no biceps',
      own.every(r => !!r && !r.main.some(e => e.substitution_group === 'row' || e.movement_pattern === 'isolation_bicep' || e.movement_pattern === 'isolation_trap')),
      own.map(r => r?.main.filter(e => e.substitution_group === 'row' || e.movement_pattern === 'isolation_bicep' || e.movement_pattern === 'isolation_trap').map(e => e.name)))
    // 90+: the count is ten. Where the day's own pool cannot reach it, it
    // borrows in list order — a row first — and never a tier-1.
    // RE-ANCHORED 9 Oct 2026 (docs/plans/kit-list.md). This held "what it
    // borrows first is a row", which is the lead this gate's own author left:
    // a row on an UNINJURED Shoulders day makes the week's balance pass trim
    // the back day. The row now stands in only for shoulder work that is
    // missing; a day that has its press, in a pool that has raises, borrows
    // traps and then biceps.
    const borrowedRows = runs.map(r => r ? r.main.filter(e => e.substitution_group === 'row') : [])
    const borrowedOther = runs.map(r => r ? r.main.filter(e => e.movement_pattern === 'isolation_bicep' || e.movement_pattern === 'isolation_trap') : [])
    check('3n2. 90+, uninjured: some seed has to borrow, and it borrows traps (then biceps), never a row',
      borrowedRows.every(rows => rows.length === 0) && borrowedOther.some(o => o.length >= 1) &&
      borrowedOther.every(o => o.length === 0 || o.some(e => e.movement_pattern === 'isolation_trap')),
      runs.map(r => r?.main.filter(e => e.substitution_group === 'row' || e.movement_pattern === 'isolation_bicep' || e.movement_pattern === 'isolation_trap').map(e => e.name)))
    // ...and where a flag has taken the raises, the row still comes (it stands in for them).
    const flaggedLong = buildProfile(combo({ equipment: 'full_gym', injuries: ['shoulders'], duration: '90+' }))
    const flaggedRuns = ['a', 'b', 'c'].map(s => pick('Shoulders & Abs', flaggedLong, `unit:${s}`))
    check('3n3. 90+, shoulder flag: the row is still borrowed, and is not a main lift',
      flaggedRuns.every(r => !!r && r.main.filter(e => e.substitution_group === 'row').length === 1 && r.main.filter(e => e.substitution_group === 'row').every(e => e.mechanics_tier !== 'tier1_compound')),
      flaggedRuns.map(r => r?.main.map(e => e.name)))
    check('3o. no selection holds the same movement twice — at 90+, where the refill loop took three lateral raises in one pass',
      runs.every(r => !!r && sameMovementTwice(r.main).length === 0), runs.flatMap(r => r ? sameMovementTwice(r.main) : ['no handle']))
  }

  // --- the family splits, on the day they exist for
  {
    const flaggedHome = buildProfile(combo({ equipment: 'home_gym', injuries: ['shoulders'], duration: '60-90' }))
    const runs = ['a', 'b', 'c', 'd'].map(s => pick('Chest & Triceps', flaggedHome, `unit:${s}`))
    check('3p. home gym, shoulder flag, four seeds: the chest day takes two presses of different families',
      runs.every(r => !!r && r.main.filter(e => e.movement_pattern === 'horizontal_push').length === 2 && !hasDuplicateFamily(r.main)),
      runs.map(r => r?.main.filter(e => e.movement_pattern === 'horizontal_push').map(e => e.name)))
    // RE-ANCHORED 9 Oct 2026, as the Sam check above: with a shoulder flag a
    // home gym holds ONE properly loaded triceps isolation (the dumbbell
    // kickback), and a band is not put beside it.
    const isBandOrBag = (e: ExerciseEntry) => e.equipment.some(q => q === 'resistance band' || q === 'weighted backpack')
    check('3q. …and its triceps work is the one properly loaded movement that flag leaves, with no band beside it',
      runs.every(r => !!r && r.main.filter(e => e.movement_pattern === 'isolation_tricep').length === 1 && r.main.filter(e => e.movement_pattern === 'isolation_tricep').every(e => !isBandOrBag(e))),
      runs.map(r => r?.main.filter(e => e.movement_pattern === 'isolation_tricep').map(e => e.name)))
    // Where the pool holds two loaded triceps movements, the split still gives two of different families.
    const plainHome = buildProfile(combo({ equipment: 'home_gym', injuries: [], duration: '60-90' }))
    const flaggedGym = buildProfile(combo({ equipment: 'full_gym', injuries: ['shoulders'], duration: '60-90' }))
    const twoLoaded = [...['a', 'b', 'c', 'd'].map(s => pick('Chest & Triceps', plainHome, `unit:${s}`)), ...['a', 'b', 'c', 'd'].map(s => pick('Chest & Triceps', flaggedGym, `unit:${s}`))]
    check('3q2. home gym with no flag, and a full gym with one: two triceps movements of different families, neither a band',
      twoLoaded.every(r => {
        if (!r) return false
        const tri = r.main.filter(e => e.movement_pattern === 'isolation_tricep')
        return tri.length === 2 && !hasDuplicateFamily(tri) && tri.every(e => !isBandOrBag(e))
      }),
      twoLoaded.map(r => r?.main.filter(e => e.movement_pattern === 'isolation_tricep').map(e => e.name)))
    check('3r. …and no overhead triceps work came in with the split (still out for a shoulder flag)',
      runs.every(r => !!r && !r.main.some(e => e.name === 'Overhead Tricep Extension' || e.name === 'Skull Crushers')))
  }

  // --- thin-day borrowing
  {
    const chest = ['a', 'b', 'c'].map(s => pick('Chest & Triceps', sam, `unit:${s}`))
    check('3s. Sam, chest day: the press slot that cannot be filled goes to rear delts, not to nothing',
      chest.every(r => !!r && r.main.some(e => e.substitution_group === 'rear_delt') && r.main.length >= 4),
      chest.map(r => r?.main.map(e => e.name).join(' | ')))
    check('3t. …borrowed work never leads: the press is first',
      chest.every(r => !!r && r.main[0]?.movement_pattern === 'horizontal_push'), chest.map(r => r?.main[0]?.name))
    const sh = ['a', 'b', 'c'].map(s => pick('Shoulders & Abs', sam, `unit:${s}`))
    check('3u. Sam, Shoulders day: the press and raise slots that cannot be filled go to a row and a trap movement',
      sh.every(r => !!r && r.main.some(e => e.substitution_group === 'row') && r.main.some(e => e.movement_pattern === 'isolation_trap')),
      sh.map(r => r?.main.map(e => e.name).join(' | ')))
    check('3v. …and it still holds its rear delts and no more than one leg movement',
      sh.every(r => !!r && r.main.some(e => e.substitution_group === 'rear_delt') && r.main.filter(e => LEG_COMPOUND.has(e.movement_pattern)).length <= 1),
      sh.map(r => r?.main.map(e => e.name).join(' | ')))
    const uninjuredChest = ['a', 'b', 'c'].map(s => pick('Chest & Triceps', uninjured, `unit:${s}`))
    // The triceps split must not turn a chest day into an arm day: the fill
    // stops at the two triceps movements the slots are for. (Held by the
    // muscle-balance gate's ratio too — which is how it was found — but a
    // mutation removing the cap was MISSED here until this check existed.)
    check('3w0. an uninjured 60-90 chest day holds exactly two triceps movements and at least four chest movements',
      uninjuredChest.every(r => !!r && r.main.filter(e => e.movement_pattern === 'isolation_tricep').length === 2 && r.main.filter(e => e.movement_pattern === 'horizontal_push').length >= 4),
      uninjuredChest.map(r => r?.main.map(e => `${e.name}:${e.movement_pattern}`).join(' | ')))
    check('3w. an uninjured chest day borrows nothing: no rear delts, no traps, no core',
      uninjuredChest.every(r => !!r && !r.main.some(e => e.substitution_group === 'rear_delt' || e.movement_pattern === 'isolation_trap' || e.movement_pattern === 'core')),
      uninjuredChest.map(r => r?.main.map(e => e.name).join(' | ')))
  }

  // --- "pull-heavy is the prescription" is asked of the pool, in one place
  {
    const fn = handle<(p: UserProfile, exclusions?: string[]) => boolean>('pullHeavyIsPrescribed')
    check('3w2. one press left (Sam) means pulling is never trimmed to match; four presses left (full gym, same flag) or no flag does not',
      fn?.(sam) === true &&
      fn?.(buildProfile(combo({ equipment: 'full_gym', injuries: ['shoulders'] }))) === false &&
      fn?.(uninjured) === false &&
      fn?.(samProfile({ injuries: [] }), ['Dumbbell Floor Press']) === false,
      fn ? [fn(sam), fn(buildProfile(combo({ equipment: 'full_gym', injuries: ['shoulders'] }))), fn(uninjured)] : 'no handle')
  }

  // --- the scorer's label rule reads the same defining patterns
  {
    const rules = (meso: MesocycleWeek[]) => quiet(() => scorePlan(sam, meso, 'sam:2', { skipComparisons: true })).dimensions.structure.deductions.map(d => d.rule)
    const relabel = (from: string, to: string): MesocycleWeek[] => samMeso.map(w => ({ ...w, days: w.days.map(d => (d.focus === from ? { ...d, focus: to } : d)) }))
    check('3w3. the scorer: Sam\'s week as generated has no label that its day does not keep',
      !rules(samMeso).includes('day_label_mismatch'), rules(samMeso))
    check('3w4. …a leg day CALLED "Shoulders & Abs" is a mismatch — the label the old rule did not know',
      rules(relabel('Legs & Calves', 'Shoulders & Abs')).includes('day_label_mismatch'))
    check('3w5. …so is a back day called "Chest & Triceps", and a chest day called "Legs & Calves"',
      rules(relabel('Back & Biceps', 'Chest & Triceps')).includes('day_label_mismatch') &&
      rules(relabel('Chest & Triceps', 'Legs & Calves')).includes('day_label_mismatch'))
    check('3w6. …and the two labels it always knew still are: a chest day called "Squat & Carry" or "Push & Press"',
      rules(relabel('Chest & Triceps', 'Squat & Carry')).includes('day_label_mismatch') &&
      rules(relabel('Chest & Triceps', 'Push & Press')).includes('day_label_mismatch'))
  }

  // --- the one question the scorer and the generator both ask
  check('3x. "does this day hold what its name says" answers for content, not for the label',
    dayHoldsDefiningWork?.('Shoulders & Abs', named('Rear Delt Flyes', 'Plank')) === true &&
    dayHoldsDefiningWork?.('Shoulders & Abs', named('Romanian Deadlifts', 'Plank', 'Walking Lunges')) === false &&
    dayHoldsDefiningWork?.('Chest & Triceps', named('Tricep Pushdowns')) === false &&
    dayHoldsDefiningWork?.('Chest & Triceps', named('Dumbbell Floor Press')) === true &&
    dayHoldsDefiningWork?.('Shoulders & Abs', named('Band Pull-Aparts', 'Plank')) === false,
    'a warm-up drill is preparation, not the day\'s shoulder work')

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) console.error(`\n${failures} day-purpose check(s) FAILED`)
  else console.log('\nPASSED — a day named for a body part trains it, or says what it is instead.')
}

main()
process.exit(failures > 0 ? 1 : 0)
