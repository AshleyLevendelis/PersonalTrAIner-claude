/**
 * test:shoulders-day — live test 19 Oct 2026, findings 1 and 2 (docs/plans/shoulders-day-honest.md).
 *
 * Sam's "Shoulders & Abs" held squat marches, a Spanish squat, a heavy kettlebell swing, a step-up and a plank, under
 * "No overhead press fits your kit", while five presses fit his kit. Four things, each held here against the real
 * functions with Sam's own profile:
 *   §1 the note tells the true cause (kit, a flag, a running ease-off, or a plan that predates the kit allowing one),
 *      and names legs as legs;
 *   §2 a knee ease-off on a day that is not about legs fills the gap with the day's own work (Ashley, 20 Oct 2026:
 *      "Work for that day instead"), and a leg day still gets a knee-friendly leg move;
 *   §3 an automatic replacement prefers a movement really tagged with the person's style over one only let in by
 *      the per-pattern floor (a bodybuilder's hinge is Romanian Deadlifts, not a heavy swing);
 *   §4 a hold stored before 9 Oct reads in 5-second steps.
 */
import { generateMesocycle, getConstrainedPool, getFlaggedJoints, setRandomSource, resetRandomSource, TRACKS } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, isContraindicatedFor } from '../src/lib/exercise-db'
import { describeDayGap } from '../src/lib/day-gap-note'
import { substituteForInjury, type PlanEditContext } from '../src/lib/plan-adaptations'
import { pickAutomaticReplacement } from '../src/lib/mesocycle-edit'
import { buildDayGuard, planDaysInWindow, type PlanCalendar } from '../src/lib/plan-guard'
import { NO_ACTIVE_ADAPTATIONS } from '../src/lib/effective-constraints'
import { fromRow, toRow } from '../src/lib/mesocycle-shape'
import type { MesocycleWeek, UserProfile, WorkoutDay } from '../src/lib/types'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const quiet = console.log, loud = console.warn
const silently = <T,>(fn: () => T): T => { console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = quiet; console.warn = loud } }
const silentlyAsync = async <T,>(fn: () => Promise<T>): Promise<T> => { console.log = () => {}; console.warn = () => {}; try { return await fn() } finally { console.log = quiet; console.warn = loud } }

const sam = {
  id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', fitness_goal: 'fat_loss',
  preferred_time: 'evening', bmr: 1800, tdee: 2500, equipment_access: 'minimalist', injuries: [],
  training_style: 'bodybuilding', training_experience: 'intermediate', session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation', max_dumbbell_kg: 24,
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

const LEG = new Set(['knee_dominant', 'hip_hinge', 'single_leg', 'lunge', 'isolation_quad', 'isolation_hamstring', 'isolation_calf', 'isolation_glute'])
const kneeJoints = getFlaggedJoints(['knees'])
const loadsKnee = (name: string) => { const e = getExerciseEntry(name); return !!e && isContraindicatedFor(e, kneeJoints) }
const patternOf = (name: string) => getExerciseEntry(name)?.movement_pattern ?? '?'
const day = (focus: string, names: string[]): WorkoutDay => ({ day: 'Saturday', focus, exercises: names.map(name => ({ name, sets: 3, reps: '8-10', rest_seconds: 60 })) } as unknown as WorkoutDay)

async function main() {
  // The day she saw, exercise for exercise.
  const herDay = day('Shoulders & Abs', ['Bodyweight Squat Marches', 'Spanish Squat', 'Kettlebell Swing (Heavy)', 'Low Box Step-Up', 'Plank'])

  console.log('\n§1 The note tells the true cause')
  {
    const presses = getConstrainedPool(sam).filter(e => e.movement_pattern === 'vertical_push').map(e => e.name)
    check('Sam\'s own pool holds overhead presses (the fixture is the case: the kit allows one)', presses.length >= 3, presses)
    const note = describeDayGap(herDay, sam, sam.injuries)
    check('her day, her profile: the note does NOT blame the kit', !!note && !/No overhead press fits your kit/.test(note), note)
    check('...it says the plan has no press though one fits now', !!note && /no overhead press/i.test(note) && /fits your kit now/.test(note), note)
    check('...and names the leg work as legs, not just abs', !!note && /legs/.test(note) && /abs/.test(note), note)

    // A real "nothing fits": bodyweight kit with no pull-up bar or bag still has pike push-ups, so the honest
    // nothing-fits case is the kit plus a flag; the kit sentence is reached only when the POOL is empty.
    const noPress = { ...sam, equipment_access: 'bodyweight', injuries: [] } as UserProfile
    const noPressPool = getConstrainedPool(noPress).filter(e => e.movement_pattern === 'vertical_push').length
    const noteNoPress = describeDayGap(herDay, { ...noPress, equipment_access: noPressPool === 0 ? 'bodyweight' : 'bodyweight' } as UserProfile, [])
    check('the kit sentence is said only when the person\'s own pool truly has no press', noPressPool === 0 ? /fits your kit/.test(noteNoPress ?? '') && !/now/.test(noteNoPress ?? '') : !/No overhead press fits your kit/.test(noteNoPress ?? ''), { noPressPool, noteNoPress })

    const flagged = { ...sam, injuries: ['shoulders'] } as UserProfile
    const lastingNote = describeDayGap(herDay, flagged, ['shoulders'])
    check('a lasting shoulder flag is named as a flag', /while your shoulder's flagged/.test(lastingNote ?? ''), lastingNote)
    const easingNote = describeDayGap(herDay, flagged, [])
    check('a RUNNING shoulder ease-off is named as one, not as a lasting flag', /easing off your shoulder/.test(easingNote ?? '') && !/flagged/.test(easingNote ?? ''), easingNote)
    const withPress = day('Shoulders & Abs', ['Dumbbell Shoulder Press', 'Plank'])
    check('a day that holds its press says nothing', describeDayGap(withPress, sam, []) === null)
    check('a partial profile (no kit known) never makes the kit claim', !/fits your kit/.test(describeDayGap(herDay, { injuries: [] } as unknown as UserProfile, []) ?? ''))
  }

  console.log('\n§2 A knee ease-off on a non-leg day keeps the day\'s purpose')
  {
    setRandomSource(seededRngFromKey('sam:shoulders-day'))
    const plan: MesocycleWeek[] = silently(() => generateMesocycle(sam))
    resetRandomSource()
    const CREATED = new Date(2026, 9, 5, 0, 0, 0).toISOString()
    const cal: PlanCalendar = { planCreatedAt: CREATED, today: '2026-10-05', moves: [] }
    const context: PlanEditContext = {
      isProtected: buildDayGuard(plan, { ...cal, loggedDates: [], closedDates: [] }),
      constraints: NO_ACTIVE_ADAPTATIONS, calendar: cal, constrainedUntil: null,
    }
    const targets = planDaysInWindow(plan, cal, 28)
    const out = await silentlyAsync(() => substituteForInjury({ mesocycle: plan, profile: sam, injuryCode: 'knees', targetDays: targets, exclusions: [], context }))

    let shoulderSlots = 0, shoulderLegIn = 0, shoulderOwnWork = 0, legDaySlots = 0, legDayLegIn = 0
    const legsIn: string[] = []
    for (const t of out.touchedSlots) {
      const focus = plan.find(w => w.week_number === t.weekNumber)?.days.find(d => d.day === t.dayName)?.focus ?? ''
      const track = TRACKS[focus as keyof typeof TRACKS]
      const legDay = !!track && track.primary_patterns.some(p => LEG.has(p))
      const beforeLeg = LEG.has(patternOf(t.before))
      if (!beforeLeg) continue
      if (focus === 'Shoulders & Abs') {
        shoulderSlots++
        if (t.after && LEG.has(patternOf(t.after))) { shoulderLegIn++; legsIn.push(`${t.before} -> ${t.after}`) }
        if (t.after && ['vertical_push', 'isolation_shoulder', 'core'].includes(patternOf(t.after))) shoulderOwnWork++
      } else if (legDay) {
        legDaySlots++
        if (t.after && LEG.has(patternOf(t.after))) legDayLegIn++
      }
    }
    console.log(`  measured: ${shoulderSlots} knee-loading leg slots replaced on shoulders days (${shoulderOwnWork} with the day's own work, ${shoulderLegIn} with legs); ${legDaySlots} on leg days (${legDayLegIn} with legs)`)
    check('the fixture is the case: a shoulders day had a knee-loading leg slot to replace', shoulderSlots >= 1, shoulderSlots)
    check('no leg movement is put on a shoulders day by the ease-off', shoulderLegIn === 0, legsIn)
    check('...the day\'s own work goes in instead (a press, a raise or core)', shoulderOwnWork >= 1, { shoulderSlots, shoulderOwnWork })
    check('a leg day still gets leg replacements (her ruling keeps knee-friendly leg moves there)', legDaySlots === 0 || legDayLegIn >= 1, { legDaySlots, legDayLegIn })
    const anyKneeLeft = out.mesocycle.flatMap(w => targets.filter(t => t.weekNumber === w.week_number).flatMap(t => (w.days.find(d => d.day === t.dayName)?.exercises ?? []).map(e => e.name))).filter(loadsKnee)
    check('nothing that loads the knee is left on a target day', anyKneeLeft.length === 0, anyKneeLeft)
  }

  console.log('\n§3 An automatic replacement prefers a real style match')
  {
    const knee = { ...sam, injuries: ['knees'] } as UserProfile
    const pick = pickAutomaticReplacement('Single-Leg Glute Bridge', knee, [], new Set())
    check('a bodybuilder\'s hinge replacement under a knee flag is not the heavy kettlebell swing', pick?.exercise.name !== 'Kettlebell Swing (Heavy)', pick?.exercise.name)
    check('...it is one tagged bodybuilding', !!pick && pick.exercise.style_tags.includes('bodybuilding'), pick?.exercise.name)
    const functional = { ...knee, training_style: 'functional' } as UserProfile
    const fpick = pickAutomaticReplacement('Single-Leg Glute Bridge', functional, [], new Set())
    check('a functional trainee may still get the swing (it is tagged functional)', !!fpick, fpick?.exercise.name)
  }

  console.log('\n§4 A stored hold reads in 5-second steps')
  {
    const stored = { days: [day('Shoulders & Abs', ['Plank'])] } as unknown as MesocycleWeek
    stored.days[0].exercises[0].reps = '34-49s'
    const read = fromRow({ ...toRow('p', { week_number: 2, label: 'W2', days: stored.days } as MesocycleWeek) })
    check('"34-49s" reads as "35-50s"', read.days[0].exercises[0].reps === '35-50s', read.days[0].exercises[0].reps)
    const single = { ...toRow('p', { week_number: 2, label: 'W2', days: [day('Core', ['Plank'])] } as MesocycleWeek) }
    single.days[0].exercises[0].reps = '42s'
    check('"42s" reads as "40s"', fromRow(single).days[0].exercises[0].reps === '40s', fromRow(single).days[0].exercises[0].reps)
    const reps = { ...toRow('p', { week_number: 2, label: 'W2', days: [day('Legs', ['Goblet Squat'])] } as MesocycleWeek) }
    reps.days[0].exercises[0].reps = '11-13'
    check('a rep range is left exactly as stored', fromRow(reps).days[0].exercises[0].reps === '11-13')
    const tidy = { ...toRow('p', { week_number: 2, label: 'W2', days: [day('Core', ['Plank'])] } as MesocycleWeek) }
    tidy.days[0].exercises[0].reps = '30-45s'
    const back = fromRow(tidy)
    check('a hold already in 5-second steps is returned untouched (same object: nothing is rewritten for nothing)', back.days === tidy.days)
  }

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('shoulders day: all checks passed')
}

main().catch(e => { console.error(e); process.exit(1) })
