/**
 * Gate: every prescribed number the app holds reaches the coach.
 *
 * WHY THIS EXISTS AND WHY IT IS A SWEEP. `f516748` fixed "the coach doesn't
 * have my prescribed weights" by sending `suggested_load`. A review found the
 * SAME omission still live in four more fields, and the gate that shipped with
 * that commit could not see any of them: its only check of the invariant was
 * `loadClauseForCoach({ name: 'Arm Circles' }) === ''` — one hand-built object
 * with no load fields at all, which is not a shape the generator produces.
 *
 * The worst of the four: `Pull-Ups (Assisted)` with `suggested_assistance_kg:
 * 35` reached the coach as " @ Bodyweight" — a phrase the system prompt
 * teaches it to read as NO EXTERNAL LOAD, while `AssistanceChip` rendered
 * "35kg assist" on the next screen. Not a gap: a confident statement of the
 * opposite, in the exact shape of the incident the commit existed to fix.
 *
 * So the check here is structural and runs over REAL GENERATED PLANS: if the
 * exercise carries a prescribed number in any field, that number appears in
 * what the coach is sent. A new prescribed field added to Exercise and
 * forgotten here fails immediately instead of shipping.
 */
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildCoachExerciseSummary, loadClauseForCoach, describeExerciseForCoach } from '../src/lib/chat-plan-context'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import type { Exercise, UserProfile, EquipmentAccess, TrainingExperience } from '../src/lib/types'

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

function base(o: Partial<UserProfile>): UserProfile {
  return { age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o } as UserProfile
}
const quiet = <T,>(f: () => T): T => {
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return f() } finally { console.debug = d; console.warn = w }
}

/**
 * Every field that carries a prescribed NUMBER, and how that number must show
 * up in the coach's copy. Adding a field to Exercise and not to this list is
 * the failure mode; adding it here and not to the builder turns this red.
 */
const NUMERIC_PRESCRIPTIONS: { field: keyof Exercise; label: string }[] = [
  { field: 'suggested_load_kg', label: 'the working weight' },
  { field: 'suggested_added_load_kg', label: 'added weight on a bodyweight movement' },
  { field: 'suggested_assistance_kg', label: 'machine assistance' },
]

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const EXP: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
// TRAINING STYLE IS IN THE SWEEP BECAUSE OF THE TEETH CHECK BELOW. Without it
// `suggested_assistance_kg` never occurred in 12 generated mesocycles at all,
// which would have made this gate's most important assertion vacuously true —
// the exact tautological-control shape this repo keeps hitting. An assisted
// prescription needs a BEGINNER on a bodybuilding-style plan; the base profile
// is 'hybrid', so the field was unreachable and the check could not fail.
const STYLES = ['bodybuilding', 'functional', 'hybrid'] as const

console.log('\n1. Every prescribed number in a real plan reaches the coach')
{
  let exercises = 0, withNumber = 0, unloadedSeen = 0
  const missing: unknown[] = []
  const weightOnUnloaded: unknown[] = []
  const danglingDays: string[] = []
  const seen = new Set<string>()

  for (const equipment_access of EQUIP) {
    for (const training_experience of EXP) {
     for (const training_style of STYLES) {
      const key = `ctx:${equipment_access}:${training_experience}:${training_style}`
      const meso = quiet(() => {
        setRandomSource(seededRngFromKey(key))
        try { return generateMesocycle(base({ equipment_access, training_experience, training_style })) }
        finally { resetRandomSource() }
      })
      for (const week of meso) {
        for (const day of week.days) {
          for (const ex of day.exercises) {
            exercises++
            const clause = loadClauseForCoach(ex)

            // SIBLING CHECK, added after the assistance leak. That bug was a
            // carry-forward fallback (`load ? … : ex.<field>`) surviving a
            // rotation that changed the slot's identity. Four sibling fields
            // — load_guidance, suggested_load, suggested_load_kg, load_source
            // — use the identical shape, so the same leak was possible: a
            // barbell lift rotating out for a bodyweight movement, and the
            // weight coming with it. Swept 74,628 exercises and it does NOT
            // happen; assistance leaked precisely because prescribeAssistance
            // sits OUTSIDE the load branch and had no equivalent guard. This
            // pins the negative result so it stays true.
            const entry = getExerciseEntry(ex.name)
            if (entry && !isExternallyLoaded(entry)) {
              unloadedSeen++
              if (ex.suggested_load_kg != null && weightOnUnloaded.length < 8) {
                weightOnUnloaded.push({ exercise: ex.name, kg: ex.suggested_load_kg, source: ex.load_source })
              }
            }
            for (const { field, label } of NUMERIC_PRESCRIPTIONS) {
              const v = ex[field] as number | null | undefined
              if (v == null) continue
              withNumber++
              seen.add(field as string)
              // The number itself, as digits, must be in what we send. Not a
              // proxy for it, not a category it falls in.
              if (!clause.includes(String(v)) && missing.length < 8) {
                missing.push({ exercise: ex.name, field, value: v, sentAs: clause, why: label })
              }
            }
            // A per-set ramp must send every distinct set weight.
            if (ex.per_set_load && ex.per_set_load.length > 1) {
              const distinct = [...new Set(ex.per_set_load.map(s => s.load_kg))]
              if (distinct.length > 1) {
                const allThere = ex.per_set_load.every(sl => clause.includes(sl.display))
                if (!allThere && missing.length < 8) missing.push({ exercise: ex.name, field: 'per_set_load', sentAs: clause })
              }
            }
          }
          // "Sunday: Active recovery - " with nothing after the separator read
          // as an empty day the coach could say nothing about.
          const line = buildCoachExerciseSummary({ days: [day] })
          if (/-\s*$/.test(line) && danglingDays.length < 5) danglingDays.push(line)
        }
      }
     }
    }
  }

  console.log(`      swept ${exercises} exercises; ${withNumber} carry a prescribed number; ${unloadedSeen} have nothing to load`)
  check('the sweep actually produced exercises (sanity check on this gate)', exercises > 1000, exercises)
  check('every prescribed number appears in what the coach is sent', missing.length === 0, missing)
  check('no day is sent as a dangling separator with nothing after it', danglingDays.length === 0, danglingDays)
  check('a movement with nothing to load carries no kg number', weightOnUnloaded.length === 0, weightOnUnloaded)
  check('...and unloaded movements occur in the sweep, so that check has teeth', unloadedSeen > 0, unloadedSeen)
  // Without this, a field the generator stopped emitting would make its check
  // vacuously true — the tautological-control shape this repo has hit before.
  for (const { field } of NUMERIC_PRESCRIPTIONS) {
    check(`...and ${String(field)} really does occur in the sweep, so its check has teeth`,
      seen.has(field as string), [...seen])
  }
}

console.log('\n1b. Assistance never lands on an exercise that has no machine')
{
  // FOUND BY THE TEETH CHECK ABOVE, not looked for. Widening the sweep so
  // suggested_assistance_kg could occur at all turned up 84 prescriptions
  // carrying it on entries that declare no assistance — Kneeling Band Lat
  // Pulldown (64) and Lat Pulldown (20). A rotation swaps the slot's identity
  // and the old exercise's counterweight was carried onto the new one, so
  // AssistanceChip rendered "40kg assist / less over time = stronger" on a
  // lift where MORE weight is the progress: an inverted cue, not a stray
  // number. This is the sweep that would have caught it.
  const leaks: unknown[] = []
  let assistedSeen = 0
  for (const equipment_access of EQUIP) {
    for (const training_experience of EXP) {
      for (const training_style of STYLES) {
        const key = `leak:${equipment_access}:${training_experience}:${training_style}`
        const meso = quiet(() => {
          setRandomSource(seededRngFromKey(key))
          try { return generateMesocycle(base({ equipment_access, training_experience, training_style })) }
          finally { resetRandomSource() }
        })
        for (const week of meso) for (const day of week.days) for (const ex of day.exercises) {
          if (ex.suggested_assistance_kg == null && !ex.assistance_ready_to_graduate) continue
          assistedSeen++
          const entry = getExerciseEntry(ex.name) as { assistance?: unknown } | undefined
          if (!entry?.assistance && leaks.length < 8) {
            leaks.push({ exercise: ex.name, assist: ex.suggested_assistance_kg, week: week.week_number })
          }
        }
      }
    }
  }
  console.log(`      ${assistedSeen} prescriptions carry an assistance field`)
  check('assistance only ever lands on an entry that declares it', leaks.length === 0, leaks)
  check('...and some prescription actually carries it, so this is not vacuous', assistedSeen > 0, assistedSeen)
}

console.log('\n2. Assistance is sent, and sent as the inverted thing it is')
{
  const ex = (o: Partial<Exercise>): Exercise =>
    ({ name: 'Pull-Ups (Assisted)', sets: 3, reps: '8-10', rest: '90s', substitution: '', ...o }) as Exercise
  const assisted = loadClauseForCoach(ex({ suggested_load: 'Bodyweight', suggested_assistance_kg: 35 }))
  check('the 35kg the machine is taking is sent', assisted.includes('35'), assisted)
  check('...and never as bare "Bodyweight", which the prompt reads as NO external load',
    assisted !== ' @ Bodyweight', assisted)
  check('...with the direction of progress stated, since less assist is more strength',
    /LESS assistance over time/.test(assisted), assisted)
  const graduated = loadClauseForCoach(ex({ suggested_load: 'Bodyweight', suggested_assistance_kg: 0, assistance_ready_to_graduate: true }))
  check('graduating off the machine is said in words, not as "0kg"',
    /unassisted/.test(graduated), graduated)
}

console.log('\n3. A deliberately-light load keeps the hedge the Exercise tab shows')
{
  const ex = (source: Exercise['load_source']): Exercise =>
    ({ name: 'Barbell Squats', sets: 3, reps: '8-10', rest: '90s', substitution: '',
       suggested_load: '~40kg', suggested_load_kg: 40, load_source: source }) as Exercise
  const assumed = loadClauseForCoach(ex('assumed_body'))
  check('an assumed_body load is marked as a deliberate floor', /STARTING LIGHT/.test(assumed), assumed)
  check('...and says it is not a target', /not a target/.test(assumed), assumed)
  // The hedge must NOT be sprayed on loads that earned their number, or it
  // means nothing and the coach hedges everything.
  for (const source of ['known_weight', 'estimate', undefined] as const) {
    check(`...and a ${source ?? 'plain'} load carries no such hedge`,
      !/STARTING LIGHT/.test(loadClauseForCoach(ex(source))), loadClauseForCoach(ex(source)))
  }
}

console.log('\n4. Non-numeric placeholders are never presented as weights')
{
  const ex = (load: string): Exercise =>
    ({ name: 'Arm Circles', sets: 2, reps: '8', rest: '20s', substitution: '', suggested_load: load }) as Exercise
  check('"Light" is labelled a primer, not quoted as a load',
    /primer, no prescribed weight/.test(loadClauseForCoach(ex('Light'))), loadClauseForCoach(ex('Light')))
  check('"Choose by feel" says there is no prescribed weight',
    /no prescribed weight/.test(loadClauseForCoach(ex('Choose by feel'))), loadClauseForCoach(ex('Choose by feel')))
  check('"Bodyweight" is still sent plainly — it IS the prescription',
    loadClauseForCoach(ex('Bodyweight')) === ' @ Bodyweight', loadClauseForCoach(ex('Bodyweight')))
}

console.log('\n5. Tempo and intensity reach the coach, because sometimes they ARE the prescription')
{
  const line = describeExerciseForCoach({ name: 'Push-Ups', sets: 3, reps: '8-10', rest: '90s', substitution: '',
    suggested_load: 'Bodyweight', tempo: '4-1-1', intensity: 'RPE 6-7' } as Exercise)
  check('intensity is sent', line.includes('RPE 6-7'), line)
  check('tempo is sent in plain English, not as "4-1-1"',
    line.includes('4s down') && !line.includes('4-1-1'), line)
}

console.log('\n6. The prompt teaches every form the builder can emit')
{
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('assistance is explained as EASIER than bodyweight', /EASIER than bodyweight/.test(fn))
  check('...and that progress is the number going DOWN', /assist number going DOWN/.test(fn))
  check('a primer is named as not-a-weight', /these are NOT weights/.test(fn))
  check('the starting-light hedge is passed on rather than swallowed', /deliberate floor/.test(fn))
  check('tempo is named as the prescription where there is no weight', /the TEMPO is the prescription/.test(fn))
  check('the added-load divergence with the Exercise tab is admitted',
    /the screen is right/.test(fn))
  // The builder started emitting a technique block on 5 Sep 2026. This
  // section's own rule — the prompt teaches every form the builder can emit
  // — is what says an assertion for it belongs here and not only in the new
  // test:coach-sees-technique.
  check('the technique block the builder now emits is taught too',
    /HOW TO PERFORM THESE/.test(fn) && /never contradict them/i.test(fn))
  // The instruction that produced "today's bench and shoulder press" about a
  // session two days out. The builder now states the answer; the prompt must
  // send the model to it rather than asking for the join again.
  check('the prompt no longer asks the model to work out which day is which',
    !/Cross-reference this with the user's exercise plan/.test(fn))
  check('...and points at the tagged rows instead',
    /is NOT today's, however well it fits/.test(fn))
}

// ---------------------------------------------------------------------------
// WHICH DAY IT IS — answered, not left for the model to cross-reference.
//
// Ashley, 7 Sep 2026, 6:33 PM on a Monday. "Let me know how today's bench and
// shoulder press go" — that session is Tuesday's. Then, asked outright: "Today
// is Monday, so you've got Full Body Power... are you planning to head in for
// that session this morning?" — of a session already finished, in the evening.
//
// The week reached the coach as seven unmarked rows and the prompt said
// "Today is Monday. Cross-reference this with the user's exercise plan below."
// Every fact was in the app; the join was the model's job, every turn.
// ---------------------------------------------------------------------------
console.log('\n7. WHICH DAY IT IS')
{
  const { buildTodayHeader, buildCoachExerciseSummary: build } = await import('../src/lib/chat-plan-context')
  type Today = Parameters<typeof buildTodayHeader>[0]

  const lift = (name: string) => ({ name, sets: 3, reps: '8-10', rest: '2 min' }) as unknown as Exercise
  const week = [
    { day: 'Monday', focus: 'Full Body Power', exercises: [lift('Trap Bar Deadlifts')] },
    { day: 'Tuesday', focus: 'Push & Press', exercises: [lift('Barbell Bench Press')] },
    { day: 'Thursday', focus: 'Pull & Hinge', exercises: [lift('Deadlifts')] },
  ] as never

  /** Her case exactly: Monday evening, the Monday session closed out. */
  const hers: Today = {
    dayName: 'Monday', hour: 18, clock: '6:33 PM',
    focus: 'Full Body Power', isGymSession: true,
    setsLogged: 3, setsPlanned: 3, finished: true,
    next: { dayName: 'Tuesday', focus: 'Push & Press', isTomorrow: true },
  }

  const summary = build({ days: week, today: hers })
  check('today is named outright, not implied by a day list', /Today's session is Monday's Full Body Power/.test(summary), summary.slice(0, 200))
  check('...and said to be done, so it is not offered as something to head in for',
    /ALREADY DONE/.test(summary), summary.slice(0, 200))
  check('the row for today carries the tag', /^Monday \(TODAY\): Full Body Power/m.test(summary))
  check('...and exactly one row does', (summary.match(/\(TODAY\)/g) ?? []).length === 1)
  check('tomorrow is tagged too, so "today\'s bench" cannot be Tuesday\'s',
    /^Tuesday \(tomorrow\): Push & Press/m.test(summary))
  check('...and exactly one row is tomorrow', (summary.match(/\(tomorrow\)/g) ?? []).length === 1)
  check('a day that is neither is left unmarked', /^Thursday: Pull & Hinge/m.test(summary))

  // "this morning", at 6:33 PM. The clock alone was already in the prompt and
  // was not enough; the part of the day is now said in words.
  check('the evening is called the evening', /It is Monday evening \(6:33 PM\)\./.test(summary), summary.slice(0, 60))
  check('the morning is called the morning', /Monday morning/.test(buildTodayHeader({ ...hers, hour: 8, clock: '8:05 AM' })))
  check('the afternoon is called the afternoon', /Monday afternoon/.test(buildTodayHeader({ ...hers, hour: 13, clock: '1:10 PM' })))
  check('midday is afternoon, not morning', /afternoon/.test(buildTodayHeader({ ...hers, hour: 12, clock: '12:01 PM' })))
  check('one minute to midday is still morning', /morning/.test(buildTodayHeader({ ...hers, hour: 11, clock: '11:59 AM' })))

  // DONE means the session was CLOSED OUT, not that the set count happens to
  // match. A trainee who logs every set and never finishes the session is
  // mid-workout, and telling the coach otherwise is the same class of error.
  const allSetsButOpen = buildTodayHeader({ ...hers, finished: false })
  check('every set logged but the session still open is not "done"', !/ALREADY DONE/.test(allSetsButOpen), allSetsButOpen)
  check('part-done says how far', /PART-DONE: 1 of 3 sets logged/.test(buildTodayHeader({ ...hers, setsLogged: 1, finished: false })))
  check('nothing logged says so', /NOT LOGGED yet/.test(buildTodayHeader({ ...hers, setsLogged: 0, finished: false })))

  const rest = buildTodayHeader({ ...hers, dayName: 'Wednesday', focus: null, isGymSession: false, setsLogged: 0, setsPlanned: 0, finished: false })
  check('a rest day never claims a session', /REST DAY/.test(rest) && !/Today's session is/.test(rest), rest)
  const walk = buildTodayHeader({ ...hers, dayName: 'Wednesday', focus: 'Recovery', isGymSession: false, setsLogged: 0, setsPlanned: 0, finished: false })
  check('a walk day is not called a rest day — the tagged row below would contradict it',
    !/REST DAY/.test(walk) && /Recovery/.test(walk), walk)
  // ...and is not described as a gym session either. The first version of this
  // check passed with the whole non-gym branch deleted, because a walk day then
  // fell through to "Today's session is Wednesday's Recovery, NOT LOGGED yet" —
  // which mentions Recovery and never says rest, and is wrong in both
  // directions: there are no sets to log, and nothing is outstanding.
  check('...nor as a session with sets outstanding',
    /not a gym session/.test(walk) && !/NOT LOGGED|PART-DONE|Today's session is/.test(walk), walk)

  check('the next session is named', /next session after today is tomorrow's Push & Press/.test(summary))
  check('...by day name when it is not tomorrow',
    /next session after today is Thursday's Pull & Hinge/.test(buildTodayHeader({ ...hers, next: { dayName: 'Thursday', focus: 'Pull & Hinge', isTomorrow: false } })))
  check('...and left out entirely when there is none', !/next session/.test(buildTodayHeader({ ...hers, next: null })))

  // The tomorrow tag has to wrap the week, or a Saturday says nothing is next.
  const satWeek = [
    { day: 'Saturday', focus: 'Full Body', exercises: [lift('Squats')] },
    { day: 'Sunday', focus: 'Conditioning', exercises: [lift('Rower')] },
  ] as never
  const sat = build({ days: satWeek, today: { ...hers, dayName: 'Saturday', focus: 'Full Body' } })
  check('Saturday\'s tomorrow is Sunday', /^Sunday \(tomorrow\)/m.test(sat), sat)

  // FACTS, NOT INSTRUCTIONS. This block is context; the moment it starts
  // telling the coach what to say it becomes a second, invisible prompt that
  // nothing reviews.
  const everyShape = [summary, allSetsButOpen, rest, walk, buildTodayHeader({ ...hers, setsLogged: 0, finished: false })]
  for (const shape of everyShape) {
    const header = shape.split('\n')[0]
    check(`states facts rather than directing the coach: ${header.slice(0, 40)}...`,
      !/\b(do not|don't|you should|make sure|tell them|ask them|remind them|never say)\b/i.test(header), header)
  }

  // The empty-plan contract, which a prepended header is exactly the shape of
  // change that breaks. The prompt has a rule keyed on this section being
  // empty; a header here would make the coach think it had a plan it lacks.
  check('an empty plan is still exactly the empty string', build({ days: [], today: hers }) === '')

  // The wiring: the app must send the closed-out status, and must not walk the
  // week twice to find the next session.
  {
    const { readFileSync } = await import('fs')
    const { join, dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
    const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    check('the coach is told which day it is', /buildCoachExerciseSummary\(\{[\s\S]{0,400}?today: \{/.test(chat))
    check('...from the same clock every write uses', /hour: nowForToday\.getHours\(\)/.test(chat))
    check('...and "done" is the session status, not the set count',
      /finished: activeSession\.status === 'finished'/.test(chat))
    check('one walk of the week finds the next session, shared with the opener',
      (chat.match(/const nextSessionAfterToday =/g) ?? []).length === 1 &&
      (chat.match(/nextSessionAfterToday\(\)/g) ?? []).length >= 2)
  }
}

// ---------------------------------------------------------------------------
// A MOVED SESSION MUST LEAVE THE COACH'S WEEK, NOT JUST ITS HEADER.
//
// Ashley, 12 Sep 2026: she moved today's session, the card confirmed it, and
// the coach kept talking about "today's deadlifts". MEASURED before any fix —
// the payload she was actually handed, all of it:
//
//   ...THEY MOVED IT TO MONDAY... The next session after today is Tuesday's...
//   Monday (tomorrow): Rest - no session prescribed
//   Sunday (TODAY): Pull & Hinge - Deadlift (3x5), Barbell Row (3x8-10)
//
// One sentence knew; three statements contradicted it, and the deployed prompt
// tells the model to trust the ROWS over the prose ("A session on a row that is
// not tagged (TODAY) is NOT today's"). So the checks below are about agreement,
// not wording: nothing tagged (TODAY) may list exercises while the header says
// the session left.
// ---------------------------------------------------------------------------
console.log('\n8. A MOVED SESSION LEAVES THE WEEK')
{
  const { buildCoachExerciseSummary: build, nextSessionAfter } = await import('../src/lib/chat-plan-context')
  const { sessionForDate } = await import('../src/lib/session-move')
  type Row = NonNullable<Parameters<typeof build>[0]['week']>[number]
  type Day = import('../src/lib/types').WorkoutDay

  const lift = (name: string) => ({ name, sets: 3, reps: '5', rest: '2 min' }) as unknown as Exercise
  // Sunday trains (deadlifts). Monday is a rest row — the shape that made the
  // naive lookup skip the day the session had just landed on.
  const PLAN = [
    { day: 'Monday', focus: 'Rest', exercises: [] },
    { day: 'Tuesday', focus: 'Push & Press', exercises: [lift('Barbell Bench Press')] },
    { day: 'Sunday', focus: 'Pull & Hinge', exercises: [lift('Deadlift'), lift('Barbell Row')] },
  ] as unknown as Day[]

  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  /** The Mon-Sun window the hook builds, resolved exactly as useTrainingWeek resolves it. */
  const windowOf = (dates: string[], moves: { fromDate: string; toDate: string }[]): Row[] =>
    dates.map(date => {
      const r = sessionForDate({ date, plan: PLAN, moves })
      return { date, dayName: NAMES[new Date(`${date}T12:00:00`).getDay()], session: r.day, movedTo: r.movedTo, movedFrom: r.movedFrom }
    })

  const MON_TO_SUN = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']
  const TUE = '2026-09-08', WED = '2026-09-09', SUN = '2026-09-13', MON_NEXT = '2026-09-14'

  const todayFor = (dayName: string, focus: string, movedTo: { dayName: string } | null, next: ReturnType<typeof nextSessionAfter>) => ({
    dayName, hour: 10, clock: '10:05 AM', focus, isGymSession: true,
    setsLogged: 0, setsPlanned: 6, finished: false,
    next: next ? { dayName: next.dayName, focus: next.focus, isTomorrow: next.isTomorrow } : null,
    movedTo, movedFrom: null,
  })

  /** Every row that carries the (TODAY) tag. */
  const todayRows = (s: string) => s.split('\n').filter(l => l.includes('(TODAY)'))

  // --- Tuesday -> Wednesday, both ends inside the window --------------------
  {
    const moves = [{ fromDate: TUE, toDate: WED }]
    const out = build({
      days: PLAN,
      week: windowOf(MON_TO_SUN, moves),
      today: todayFor('Tuesday', 'Push & Press', { dayName: 'Wednesday' }, nextSessionAfter({ date: TUE, plan: PLAN, moves })),
    })
    const rows = out.split('\n')
    const tue = rows.find(l => l.startsWith('Tuesday')) ?? ''
    const wed = rows.find(l => l.startsWith('Wednesday')) ?? ''

    check('the day it LEFT says where the session went', /MOVED TO WEDNESDAY/.test(tue), tue)
    check('...and no longer lists the exercises as if they were still there',
      !/Barbell Bench Press/.test(tue), tue)
    check('the day it LANDED ON carries the session', /Barbell Bench Press/.test(wed), wed)
    check("...named by the day it came from, never renamed to the day it landed on",
      /Tuesday's Push & Press/.test(wed) && !/Wednesday's Push & Press/.test(wed), wed)

    // THE PROPERTY THAT ACTUALLY FAILED. The header and the rows are one
    // payload and must not contradict each other; the prompt points the model
    // at the rows.
    check('nothing tagged (TODAY) lists a session while the header says it moved',
      /THEY MOVED IT TO WEDNESDAY/.test(out) && todayRows(out).length === 1 && !/Barbell Bench Press/.test(todayRows(out)[0]),
      todayRows(out))
    // Counted in the DAY ROWS only: the technique block at the foot of the
    // payload names every exercise once more, by design.
    const dayRows = rows.filter(l => /^[A-Z][a-z]+( \((TODAY|tomorrow)\))?: /.test(l))
    // A destination can sit EARLIER in the week than its origin, so the row
    // that points at it must not tell the coach to look "below". Placed in
    // THIS block deliberately: the off-window branch never renders that
    // sentence, so a copy of this check over there passed a mutation that put
    // "below" straight back — found by breaking it, which is the only way it
    // ever is.
    check('the moved row points at the destination without claiming a direction',
      /it is listed on the Wednesday row$/.test(tue), tue)
    check('...and the session appears on exactly one day row',
      dayRows.filter(l => /Barbell Bench Press/.test(l)).length === 1, dayRows)
  }

  // --- Sunday -> the FOLLOWING Monday, destination outside the window -------
  // The case that exposed a name-vs-date bug while this was being built:
  // matching the destination by weekday name found Monday the 7th, three rows
  // ABOVE, and the exercises vanished from the payload entirely.
  {
    const moves = [{ fromDate: SUN, toDate: MON_NEXT }]
    const out = build({
      days: PLAN,
      week: windowOf(MON_TO_SUN, moves),
      today: todayFor('Sunday', 'Pull & Hinge', { dayName: 'Monday' }, nextSessionAfter({ date: SUN, plan: PLAN, moves })),
    })
    const rows = out.split('\n')
    const sun = rows.find(l => l.startsWith('Sunday')) ?? ''
    const mon = rows.find(l => l.startsWith('Monday')) ?? ''

    check('a destination past the last row keeps the exercises on the origin',
      /Deadlift/.test(sun) && /Barbell Row/.test(sun), sun)
    check('...and says the destination is outside the week, not that a row holds it',
      /outside the week listed here/.test(sun) && !/it is listed on/.test(sun), sun)
    check('...and does NOT claim the Monday three rows up holds it',
      !/Deadlift/.test(mon), mon)
    check('...while still saying the session is not to be trained today',
      /MOVED TO MONDAY/.test(sun) && /nothing to train here/.test(sun), sun)
  }

  // --- nextSessionAfter, the walk that named the wrong day ------------------
  {
    const moves = [{ fromDate: SUN, toDate: MON_NEXT }]
    const next = nextSessionAfter({ date: SUN, plan: PLAN, moves })
    check('the next session is the day the moved session landed on',
      next?.dayName === 'Monday' && next?.isTomorrow === true && next?.focus === 'Pull & Hinge', next)
    check("...and it is NOT the plan's own next training row", next?.focus !== 'Push & Press', next)

    const away = nextSessionAfter({ date: '2026-09-07', plan: PLAN, moves: [{ fromDate: TUE, toDate: WED }] })
    check('a day whose session has left is skipped, and the day it went to is found',
      away?.dayName === 'Wednesday' && away?.focus === 'Push & Press', away)

    check('with no moves at all it still finds the plain next training day',
      nextSessionAfter({ date: '2026-09-07', plan: PLAN, moves: [] })?.dayName === 'Tuesday')
    check('and null when nothing trains in the next six days',
      nextSessionAfter({ date: '2026-09-08', plan: [{ day: 'Tuesday', focus: 'Push', exercises: [lift('Bench')] }] as unknown as Day[], moves: [] }) === null)
  }

  // --- the contract every other gate leans on -------------------------------
  {
    const plainToday = todayFor('Tuesday', 'Push & Press', null, null)
    const onlyPlanRows = (s: string) =>
      s.split('\n').filter(l => /^(Monday|Tuesday|Sunday)( \(TODAY\)| \(tomorrow\))?: /.test(l)).join('\n')
    check('a week with no moves renders the same rows it did before the week was passed',
      onlyPlanRows(build({ days: PLAN, week: windowOf(MON_TO_SUN, []), today: plainToday }))
      === onlyPlanRows(build({ days: PLAN, today: plainToday })))
    check('an empty plan is still exactly the empty string, week or no week',
      build({ days: [], week: windowOf(MON_TO_SUN, []), today: plainToday }) === '')
  }

  // The wiring, on the property rather than the line: the component hands over
  // the week the strip is drawn from, withholds it while that read is in
  // flight, and no longer walks the plan by weekday name to find what is next.
  {
    const { readFileSync } = await import('fs')
    const { join, dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
    // Comments stripped: a note SAYING the naive lookup is gone would
    // otherwise satisfy the check that it is gone.
    const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    check('the coach gets the resolved week, not just the plan rows',
      /week: trainingWeek\.loading \? null : trainingWeek\.days/.test(chat))
    check('...and the next-session walk goes through the resolver',
      /nextSessionAfter\(\{ date: activeSession\.date, plan: liveWeekDays, moves: trainingWeek\.moves \}\)/.test(chat))
    check('...with the naive weekday walk gone from the component',
      !/liveWeekDays\.find\(x => x\.day === name/.test(chat))
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll coach plan-context checks passed.\n')
