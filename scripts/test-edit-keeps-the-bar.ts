import { generateMesocycle, setRandomSource, resetRandomSource, enforceSetHierarchy, enforceLoadCoherence, shortenDayTo } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { removeExerciseFromSession, moveExerciseInSession, addExerciseToSession } from '../src/lib/session-edit'
import { getAdditionCandidates } from '../src/lib/exercise-add-candidates'
import { swapExerciseInMesocycle, banExerciseFromMesocycle, getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { settleWeek } from '../src/lib/settle-week'
import { adjustDayVolume } from '../src/lib/volume-adjust'
import { balancingChanges, describeBalancingDone } from '../src/lib/session-balance-cost'
import type { MesocycleWeek, UserProfile, FitnessGoal, TrainingExperience, EquipmentAccess } from '../src/lib/types'

// ---------------------------------------------------------------------------
// AN EDIT KEEPS THE BAR — the check behind Ashley's own sentence.
//
// "best in class, professional meal and exercise plans WHICH CAN BE ADJUSTED
// to fit the user's needs WHILE STILL AIMING TO KEEP THE QUALITY." Adjustment
// and quality are one promise with a conjunction in the middle, and until
// 13 Sep 2026 the second half only held at generation. CLAUDE.md's rule 3 says
// a change path that skips the checks generation runs is a defect.
//
// WHAT THIS GUARDS THAT test:session-edit DOES NOT. That gate proves REMOVING
// an exercise repairs a forged violation. It has never touched swap, ban,
// move or the volume change — the four paths that, measured the same day, ran
// none of the passes at all. This one hands the same forged violations to
// every path, so "one tail, every edit" is a fact rather than an intention.
//
// FORGED VIOLATIONS, NOT RE-RUN PASSES. The method is test:session-edit's §3,
// and its own comment says why it had to be rewritten once: running each pass
// again on the result and finding nothing to change reads well and proves
// nothing, because a well-formed day satisfies every pass whether or not the
// edit re-ran it. Four mutations that DELETED a pass went uncaught that way.
// A day that already violates the rule is the only fixture an edit cannot
// satisfy by accident.
//
// AND THE PLAN IS RE-SCORED. CLAUDE.md marked "a changed plan is re-scored
// like a generated one" MISSING. scorePlan is 11ms for most profiles, so an
// edited plan is put through the same scorer and the same 7.2 floor
// test:quality holds generated plans to.
// ---------------------------------------------------------------------------

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

/** The floor test:quality holds generated plans to (run-quality-score.ts). Stated once. */
const OVERALL_FLOOR = 7.2

function buildProfile(goal: FitnessGoal, exp: TrainingExperience, equip: EquipmentAccess): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: goal, preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: equip, injuries: [], training_style: 'hybrid',
    training_experience: exp, session_duration_preference: '45-60',
    workout_split_preference: 'ai_recommendation',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day) })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  } as UserProfile
}

function planFor(key: string, profile: UserProfile): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  return meso
}

const PROFILE = buildProfile('hypertrophy', 'intermediate', 'full_gym')
const MESO = planFor('edit-keeps-the-bar', PROFILE)
const WEEK = 1
const weekOf = (m: MesocycleWeek[], n = WEEK) => m.find(w => w.week_number === n)!
const dayOf = (m: MesocycleWeek[], dayName: string, n = WEEK) => weekOf(m, n).days.find(d => d.day === dayName)!
/** A training day with room to lose one and still be a session. */
const DAY = weekOf(MESO).days.filter(d => d.exercises.length > 4)[0].day

/** Every in-place edit path, behind one signature, so each gets the same battery. */
type EditPath = { name: string; apply: (meso: MesocycleWeek[], dayName: string) => Promise<MesocycleWeek[]> }

const PATHS: EditPath[] = [
  {
    name: 'remove',
    apply: async (m, dayName) => removeExerciseFromSession({ mesocycle: m, profile: PROFILE, weekNumber: WEEK, dayName, exIndex: 0, scope: 'today' }).mesocycle,
  },
  {
    name: 'move',
    apply: async (m, dayName) => moveExerciseInSession({ mesocycle: m, profile: PROFILE, weekNumber: WEEK, dayName, fromIndex: 1, toIndex: 0, scope: 'today' }).mesocycle,
  },
  {
    // UNPRICED, deliberately: this battery is about the structural passes, and
    // the coach's own card builds its trial the same way. Pricing here would
    // make every forged-violation case await the progression engine for a
    // number none of them reads.
    name: 'add',
    apply: async (m, dayName) => {
      const entry = getAdditionCandidates(dayOf(m, dayName), PROFILE, [])[0]?.exercise
      if (!entry) return m
      return addExerciseToSession({ mesocycle: m, profile: PROFILE, weekNumber: WEEK, dayName, entry, load: null, scope: 'today' }).mesocycle
    },
  },
  {
    name: 'swap',
    apply: async (m, dayName) => {
      const victim = dayOf(m, dayName).exercises[0]
      const candidate = getReplacementCandidates(victim.name, PROFILE, [])[0]?.exercise
      if (!candidate) return m
      return swapExerciseInMesocycle({ mesocycle: m, profile: PROFILE, currentWeekNumber: WEEK, dayName, exIndex: 0, newExercise: candidate, scope: 'today' })
    },
  },
  {
    name: 'ban',
    apply: async (m, dayName) => {
      const victim = dayOf(m, dayName).exercises[0].name
      return banExerciseFromMesocycle({ mesocycle: m, profile: PROFILE, bannedName: victim, exclusions: [victim] })
    },
  },
  {
    // "I've only got 25 minutes today", 13 Sep 2026. Joins the battery rather
    // than getting a battery of its own: it edits a day like every path above
    // it, so it has to repair the same forged violations, leave no stale
    // warm-up, and not write to the plan it was handed.
    name: 'shorten',
    apply: async (m, dayName) => {
      const week = weekOf(m)
      const r = shortenDayTo(week, dayName, PROFILE, 25)
      if (!r.changed) return m
      const settled = settleWeek(r.week, dayName, PROFILE)
      return m.map(w => (w.week_number === WEEK ? settled.week : w))
    },
  },
  {
    name: 'lighter-today',
    apply: async (m, dayName) => {
      const week = weekOf(m)
      const day = dayOf(m, dayName)
      const r = adjustDayVolume(day, 'lighter', PROFILE)
      if (!r.changed) return m
      const settled = settleWeek({ ...week, days: week.days.map(d => (d.day === dayName ? r.day : d)) }, dayName, PROFILE)
      return m.map(w => (w.week_number === WEEK ? settled.week : w))
    },
  },
  {
    name: 'volume',
    apply: async (m, dayName) => {
      // The executor's own sequence, minus the database: adjust the day, then
      // settle the week. Pinned here rather than reaching into the executor,
      // which needs a Supabase client.
      const week = weekOf(m)
      const day = dayOf(m, dayName)
      const result = adjustDayVolume(day, 'heavier', PROFILE)
      if (!result.changed) return m
      const settled = settleWeek({ ...week, days: week.days.map(d => (d.day === dayName ? result.day : d)) }, dayName, PROFILE)
      return m.map(w => (w.week_number === WEEK ? settled.week : w))
    },
  },
]

async function main() {
  console.log('an edit keeps the bar\n')

  console.log('[0] the fixture')
  check('a plan generated', MESO.length > 0, MESO.length)
  check(`${DAY} has enough exercises to edit`, dayOf(MESO, DAY).exercises.length > 4, dayOf(MESO, DAY).exercises.length)
  check('the volume path actually moves something on this fixture',
    adjustDayVolume(dayOf(MESO, DAY), 'heavier', PROFILE).changed)

  // -------------------------------------------------------------------------
  console.log('\n[1] every path repairs a forged SET HIERARCHY violation')
  // FORTY sets, not nine, and the mutation testing is why. At 9 the week went
  // push/pull out of band, the week-balance pass trimmed the accessory back on
  // its own, and deleting enforceSetHierarchy from the tail changed nothing the
  // check could see — one pass silently covering for another. 40 is far beyond
  // what the balance pass can reach: it moves one set at a time, at most 20
  // times, and only on a week outside its band.
  {
    const lastIdx = dayOf(MESO, DAY).exercises.length - 1
    const forged = MESO.map(w => w.week_number !== WEEK ? w : {
      ...w,
      days: w.days.map(d => d.day !== DAY ? d : { ...d, exercises: d.exercises.map((e, i) => i === lastIdx ? { ...e, sets: 40 } : e) }),
    })
    check('the forge is real — 40 sets there is a hierarchy violation',
      enforceSetHierarchy(dayOf(forged, DAY).exercises)[lastIdx].sets !== 40,
      enforceSetHierarchy(dayOf(forged, DAY).exercises)[lastIdx].sets)

    // THE INVARIANT, NOT "SMALLER THAN THE FORGE". Mutation testing again:
    // asserting `sets < 40` passed with enforceSetHierarchy deleted, because
    // the balance pass nudged 40 down to 20 all by itself — smaller, and still
    // four times the main lift. Only the hierarchy pass produces the property
    // that actually matters, so that is what is asserted.
    for (const path of PATHS) {
      const after = await path.apply(forged, DAY)
      const day = dayOf(after, DAY)
      const name = dayOf(forged, DAY).exercises[lastIdx].name
      const ex = day.exercises.find(e => e.name === name)
      const repaired = enforceSetHierarchy(day.exercises)
      const holds = repaired.every((e, i) => e.sets === day.exercises[i].sets)
      check(`${path.name}: the day satisfies the set hierarchy afterwards`, holds,
        { forged: name, sets: ex?.sets, wouldBecome: repaired.find(e => e.name === name)?.sets })
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n[2] every path repairs a forged LOAD COHERENCE violation')
  {
    // FOUND, not assumed: which lift the pass objects to is a fact about the
    // catalogue. Inflate each in turn and keep the first one it pulls back.
    const weekDays = weekOf(MESO).days
    let outlier: { day: string; idx: number; was: number } | null = null
    for (const d of weekDays) {
      for (let i = 1; i < d.exercises.length && !outlier; i++) {
        const was = d.exercises[i].suggested_load_kg
        if (was == null) continue
        const trial = JSON.parse(JSON.stringify(weekDays)) as typeof weekDays
        const td = trial.find(x => x.day === d.day)!
        td.exercises[i].suggested_load_kg = was * 20
        enforceLoadCoherence(trial)
        if (td.exercises[i].suggested_load_kg !== was * 20) outlier = { day: d.day, idx: i, was }
      }
      if (outlier) break
    }
    check('the forge is real — a 20x weight in the week is incoherent', !!outlier, outlier)

    if (outlier) {
      const name = dayOf(MESO, outlier.day).exercises[outlier.idx].name
      const forged = MESO.map(w => w.week_number !== WEEK ? w : {
        ...w,
        days: w.days.map(d => d.day !== outlier!.day ? d
          : { ...d, exercises: d.exercises.map((e, i) => i === outlier!.idx ? { ...e, suggested_load_kg: outlier!.was * 20 } : e) }),
      })
      for (const path of PATHS) {
        // Edited on the SAME day the forge sits on — load coherence is a week
        // rule, but an edit that never settles will not run it at all.
        const after = await path.apply(forged, outlier.day)
        const ex = dayOf(after, outlier.day).exercises.find(e => e.name === name)
        check(`${path.name}: the 20x weight is pulled back`,
          !ex || (ex.suggested_load_kg != null && ex.suggested_load_kg < outlier!.was * 20),
          { name, kg: ex?.suggested_load_kg, forged: outlier!.was * 20 })
      }
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n[3] no edit leaves a warm-up describing a session that is not there')
  // THE EDITED DAY MUST BE ONE THE WARM-UP ACTUALLY DESCRIBES, and the victim
  // must be the ramped lift. Mutation testing again: on a day whose exIndex 0
  // is a primer with no ramp, removing it leaves the warm-up correct either
  // way, and deleting the rebuild from the tail went uncaught. The same trap
  // test:session-edit's own comment records falling into.
  const RAMP_DAY = weekOf(MESO).days.find(d =>
    d.exercises.length > 4 && (d.warmup?.ramp_ups ?? []).some(r => d.exercises.some(e => e.name === r.exercise)))
  check('the fixture has a day whose warm-up ramps one of its own lifts', !!RAMP_DAY,
    weekOf(MESO).days.map(d => `${d.day}:${(d.warmup?.ramp_ups ?? []).length}`))
  // Every path edits index 0, so the ramped lift is moved there first — the
  // forge is "the edit lands on the exercise the warm-up is about".
  const rampedFirst = RAMP_DAY ? MESO.map(w => w.week_number !== WEEK ? w : {
    ...w,
    days: w.days.map(d => {
      if (d.day !== RAMP_DAY.day) return d
      const name = (d.warmup?.ramp_ups ?? []).find(r => d.exercises.some(e => e.name === r.exercise))!.exercise
      const i = d.exercises.findIndex(e => e.name === name)
      const reordered = [d.exercises[i], ...d.exercises.filter((_, j) => j !== i)]
      return { ...d, exercises: reordered }
    }),
  }) : MESO
  const RAMPED_NAME = RAMP_DAY ? dayOf(rampedFirst, RAMP_DAY.day).exercises[0].name : ''
  check('the exercise every path will edit is the one the warm-up ramps',
    !!RAMP_DAY && (dayOf(rampedFirst, RAMP_DAY.day).warmup?.ramp_ups ?? []).some(r => r.exercise === RAMPED_NAME),
    RAMPED_NAME)

  for (const path of PATHS) {
    const after = await path.apply(rampedFirst, RAMP_DAY ? RAMP_DAY.day : DAY)
    let bad: string[] = []
    for (const w of after) {
      for (const d of w.days) {
        for (const r of d.warmup?.ramp_ups ?? []) {
          if (!d.exercises.some(e => e.name === r.exercise)) bad.push(`w${w.week_number} ${d.day}: ${r.exercise}`)
        }
      }
    }
    check(`${path.name}: every ramp belongs to an exercise still in its session`, bad.length === 0, bad.slice(0, 4))
  }

  // -------------------------------------------------------------------------
  console.log('\n[4] generation itself ships no stale warm-up')
  // MEASURED 13 Sep 2026 before the fix: 286 of 4,096 training days (7.0%)
  // shipped a warm-up ramping an exercise the weekly rotation had already
  // swapped out. Nothing compared the two, so nobody had seen it.
  {
    let stale = 0, days = 0
    for (const w of MESO) for (const d of w.days.filter(x => x.exercises.length > 0)) {
      days++
      if ((d.warmup?.ramp_ups ?? []).some(r => !d.exercises.some(e => e.name === r.exercise))) stale++
    }
    check(`no generated day ramps an exercise it does not contain (${days} days)`, stale === 0, stale)
  }

  // -------------------------------------------------------------------------
  console.log('\n[5] the balancing tells the truth about itself')
  {
    // A WEEK THAT ACTUALLY NEEDS BALANCING, AND NEEDS IT SOMEWHERE ELSE.
    //
    // Mutation testing found this section passing vacuously: on an already
    // balanced fixture nothing moved on any other day, so "reports what
    // happened" and "reports nothing" were the same answer, and gutting
    // balancingChanges went uncaught. The first attempt at a fix doubled the
    // PULLING sets — which the pass corrected entirely on the edited day, so
    // the section still had nothing to check. Tripling the PUSHING sets is
    // what forces pull up on OTHER days, measured: three changes across
    // Tuesday and Friday.
    const pushHeavy = MESO.map(w => w.week_number !== WEEK ? w : {
      ...w,
      // EVERY EXERCISE ON THE OTHER DAYS, TRIPLED. Three narrower forges
      // failed first and each says something: tripling push everywhere let the
      // pass absorb it all on the edited day; tripling push on the other days
      // changed nothing, because this split puts every pushing exercise on the
      // edited day; and tripling by the PLANNED exercise's coarse pattern
      // misses most of what the pass counts, which classifies through the
      // catalogue entry instead. Tripling everything is blunt and unmissable
      // in whatever the pass reckons by.
      days: w.days.map(d => d.day === DAY ? d
        : { ...d, exercises: d.exercises.map(e => ({ ...e, sets: e.sets * 3 })) }),
    })
    const before = weekOf(pushHeavy)
    const after = weekOf(await PATHS[0].apply(pushHeavy, DAY))
    const changes = balancingChanges(before, after, DAY)
    // Whatever it reports must be real, and it must report everything real.
    const realChanges: string[] = []
    for (const d of after.days) {
      if (d.day === DAY) continue
      for (const ex of d.exercises) {
        const was = before.days.find(x => x.day === d.day)?.exercises.find(e => e.name === ex.name)
        if (was && was.sets !== ex.sets) realChanges.push(`${d.day}:${ex.name}`)
      }
    }
    // THE PRECONDITION THAT STOPS THIS SECTION PASSING ON NOTHING.
    check('the forged week gives the balancing something to do', realChanges.length > 0, realChanges)
    check('every change it reports actually happened',
      changes.every(c => realChanges.includes(`${c.day}:${c.exercise}`)), { reported: changes.length, real: realChanges.length })
    check('every change that happened is reported', realChanges.length === changes.length, { reported: changes.length, real: realChanges.length })
    check('the edited day is never described as a side effect', changes.every(c => c.day !== DAY))

    // AND THAT EXCLUSION IS PROVEN, not assumed. On the forge above the edited
    // day happens not to move, so "excludes the edited day" and "there was
    // nothing to exclude" were the same answer — a mutation that reported the
    // edited day went uncaught. Pinned directly instead: a week whose ONLY
    // change is on the edited day must produce an empty list, and the same
    // change on any other day must not.
    const b2 = weekOf(MESO)
    const bump = (dayName: string) => ({
      ...b2,
      days: b2.days.map(d => d.day !== dayName ? d
        : { ...d, exercises: d.exercises.map((e, i) => i === 0 ? { ...e, sets: e.sets + 1 } : e) }),
    })
    check('a change on the edited day alone is not a side effect',
      balancingChanges(b2, bump(DAY), DAY).length === 0, balancingChanges(b2, bump(DAY), DAY))
    const otherDay = b2.days.find(d => d.day !== DAY && d.exercises.length > 0)!.day
    check('...while the same change on another day is', 
      balancingChanges(b2, bump(otherDay), DAY).length === 1, balancingChanges(b2, bump(otherDay), DAY))
    check('nothing to report means no sentence', describeBalancingDone([]) === null)
    const sentence = describeBalancingDone([{ day: 'Thursday', exercise: 'Barbell Rows', from: 2, to: 3 }])
    check('one change reads as a sentence', sentence === "I'll also add a set of barbell rows on Thursday to keep your week balanced.", sentence)
    const many = describeBalancingDone([
      { day: 'Thursday', exercise: 'Barbell Rows', from: 2, to: 3 },
      { day: 'Friday', exercise: 'Lat Pulldown', from: 3, to: 2 },
      { day: 'Monday', exercise: 'Cable Flyes', from: 2, to: 3 },
    ])
    check('a long list names two and counts the rest', !!many && many.includes('and 1 other small change'), many)
  }

  // -------------------------------------------------------------------------
  console.log('\n[6] a deload week is left alone')
  {
    const deload = MESO.find(w => w.is_deload)
    check('the fixture has a deload week', !!deload, MESO.map(w => w.week_number))
    if (deload) {
      const dayName = deload.days.find(d => d.exercises.length > 0)!.day
      const settled = settleWeek(deload, dayName, PROFILE)
      check('the balance pass declares itself skipped on a deload', settled.balance.skipped === 'deload', settled.balance)
      check('...and changes no set counts there', settled.balance.changes.length === 0, settled.balance.changes)
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n[7] an edited plan is re-scored, and stays above the floor')
  // The line CLAUDE.md marked MISSING. Scored across a spread of profiles
  // rather than one, because a single plan proves a single plan.
  {
    const spread: [FitnessGoal, TrainingExperience, EquipmentAccess][] = [
      ['hypertrophy', 'intermediate', 'full_gym'],
      ['fat_loss', 'novice', 'home_gym'],
      ['conditioning', 'advanced', 'minimalist'],
      ['functional', 'beginner', 'bodyweight'],
    ]
    for (const [goal, exp, equip] of spread) {
      const key = `${goal}|${exp}|${equip}`
      const profile = buildProfile(goal, exp, equip)
      const meso = planFor(key, profile)
      const day = meso.find(w => w.week_number === WEEK)!.days.filter(d => d.exercises.length > 4)[0]
      if (!day) { check(`${key}: has an editable day`, false); continue }
      const base = scorePlan(profile, meso, key)
      check(`${key}: the generated plan clears the floor (${base.overall.toFixed(1)})`, base.overall >= OVERALL_FLOOR, base.overall)

      for (const path of PATHS) {
        const edited = await (async () => {
          // Each path's own closure captures PROFILE; re-point it at this one.
          switch (path.name) {
            case 'remove': return removeExerciseFromSession({ mesocycle: meso, profile, weekNumber: WEEK, dayName: day.day, exIndex: 0, scope: 'today' }).mesocycle
            case 'move': return moveExerciseInSession({ mesocycle: meso, profile, weekNumber: WEEK, dayName: day.day, fromIndex: 1, toIndex: 0, scope: 'today' }).mesocycle
            case 'swap': {
              const c = getReplacementCandidates(day.exercises[0].name, profile, [])[0]?.exercise
              return c ? await swapExerciseInMesocycle({ mesocycle: meso, profile, currentWeekNumber: WEEK, dayName: day.day, exIndex: 0, newExercise: c, scope: 'today' }) : meso
            }
            case 'add': {
              const e = getAdditionCandidates(day, profile, [])[0]?.exercise
              return e ? addExerciseToSession({ mesocycle: meso, profile, weekNumber: WEEK, dayName: day.day, entry: e, load: null, scope: 'today' }).mesocycle : meso
            }
            case 'ban': return await banExerciseFromMesocycle({ mesocycle: meso, profile, bannedName: day.exercises[0].name, exclusions: [day.exercises[0].name] })
            case 'shorten': {
              const week = meso.find(w => w.week_number === WEEK)!
              const r = shortenDayTo(week, day.day, profile, 25)
              if (!r.changed) return meso
              const settled = settleWeek(r.week, day.day, profile)
              return meso.map(w => (w.week_number === WEEK ? settled.week : w))
            }
            case 'lighter-today': {
              const week = meso.find(w => w.week_number === WEEK)!
              const r = adjustDayVolume(day, 'lighter', profile)
              if (!r.changed) return meso
              const settled = settleWeek({ ...week, days: week.days.map(d => (d.day === day.day ? r.day : d)) }, day.day, profile)
              return meso.map(w => (w.week_number === WEEK ? settled.week : w))
            }
            default: {
              const week = meso.find(w => w.week_number === WEEK)!
              const r = adjustDayVolume(day, 'heavier', profile)
              if (!r.changed) return meso
              const settled = settleWeek({ ...week, days: week.days.map(d => (d.day === day.day ? r.day : d)) }, day.day, profile)
              return meso.map(w => (w.week_number === WEEK ? settled.week : w))
            }
          }
        })()
        const after = scorePlan(profile, edited, key)
        check(`${key} / ${path.name}: still above the floor (${after.overall.toFixed(1)})`, after.overall >= OVERALL_FLOOR, after.overall)
      }
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n[8] no edit writes to the plan it was handed')
  // THE PROPERTY THAT MATTERS MOST ON THE CONFIRM CARD, and the one that was
  // silently false. Every card runs the real edit as a TRIAL against the live
  // plan to work out what to say before the person taps. The passes in the
  // tail mutate in place, and settleWeek used to hand them the caller's own
  // day objects for every day it was not editing — so a trial rewrote the plan
  // it was measuring, and the before/after diff then compared an object with
  // itself and reported nothing.
  //
  // Found by §5 refusing to go green on a week the balancing had visibly
  // changed. The sharing pre-dates the balance pass — load coherence and
  // one-weight have always mutated through — but they only write when they
  // find something wrong, so on a healthy plan it almost never showed.
  for (const path of PATHS) {
    const input = planFor('no-mutation', PROFILE)
    const day = weekOf(input).days.filter(d => d.exercises.length > 4)[0].day
    const fingerprint = (m: MesocycleWeek[]) => JSON.stringify(m.map(w => w.days.map(d => d.exercises.map(e => [e.name, e.sets, e.suggested_load_kg]))))
    const before = fingerprint(input)
    await path.apply(input, day)
    check(`${path.name}: the plan it was given is untouched`, fingerprint(input) === before)
  }

  console.log('')
  if (failures > 0) {
    console.error(`an edit keeps the bar: ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('an edit keeps the bar: all checks passed')
}

main().catch(err => {
  console.error('an edit keeps the bar: threw', err)
  process.exit(1)
})
