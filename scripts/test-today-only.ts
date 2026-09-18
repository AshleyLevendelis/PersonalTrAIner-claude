import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle, setRandomSource, resetRandomSource, shortenDayTo } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { estimateDaySeconds } from '../src/lib/session-duration'
import { describeSessionShortfall } from '../src/lib/session-shortfall'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { adjustDayVolume } from '../src/lib/volume-adjust'
import { settleWeek } from '../src/lib/settle-week'
import type { MesocycleWeek, UserProfile, WorkoutDay, FitnessGoal, TrainingExperience, EquipmentAccess } from '../src/lib/types'

// ---------------------------------------------------------------------------
// "I'VE ONLY GOT 25 MINUTES TODAY" — the two things a day could not be told.
//
// CLAUDE.md's "Changing one workout" block listed six operations and marked
// two MISSING: shorten or lighten TODAY only, and rebuild today. This guards
// the first two. Rebuilding is still MISSING and still named as such.
//
// ASHLEY'S RULING, 13 Sep 2026, is the load-bearing assertion here. Asked what
// should be cut when 50 minutes becomes 25 — protect the main lift and drop
// accessories (recommended), take a set off everything, or cut the rests — she
// chose PROTECT THE MAIN LIFT. So §2 checks the main lift keeps every set and
// is never the thing removed, across a spread of profiles rather than one
// lucky day.
//
// AND "TODAY" HAS TO MEAN TODAY. The whole promise is that next week is the
// full session again, which in this app means exactly one week row is written.
// §4 pins that end to end rather than trusting the word.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

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

/** The lifts the ruling protects, by the same reckoning shortenDayTo uses. */
function mainLifts(day: WorkoutDay): string[] {
  const tierOne = day.exercises.filter(ex => getExerciseEntry(ex.name)?.mechanics_tier === 'tier1_compound')
  return tierOne.map(ex => ex.name)
}

const PROFILE = buildProfile('hypertrophy', 'intermediate', 'full_gym')
const MESO = planFor('today-only', PROFILE)
const WEEK = MESO.find(w => w.week_number === 1)!
const DAY = WEEK.days.filter(d => d.exercises.length > 4)[0]

console.log('today only\n')

// ---------------------------------------------------------------------------
console.log('[1] the fixture')
check('a plan generated with an editable day', !!DAY && DAY.exercises.length > 4, DAY?.exercises.length)
check('...that is longer than the time we will ask for', estimateDaySeconds(DAY) / 60 > 35, Math.round(estimateDaySeconds(DAY) / 60))

// ---------------------------------------------------------------------------
console.log('\n[2] her ruling: the main lift is protected, across a spread of profiles')
{
  const spread: [FitnessGoal, TrainingExperience, EquipmentAccess][] = [
    ['hypertrophy', 'intermediate', 'full_gym'],
    ['fat_loss', 'novice', 'home_gym'],
    ['conditioning', 'advanced', 'minimalist'],
    ['functional', 'beginner', 'bodyweight'],
  ]
  let examined = 0
  for (const [goal, exp, equip] of spread) {
    const key = `today-only|${goal}|${exp}|${equip}`
    const profile = buildProfile(goal, exp, equip)
    const meso = planFor(key, profile)
    const week = meso.find(w => w.week_number === 1)!
    for (const day of week.days.filter(d => d.exercises.length > 3)) {
      const lifts = mainLifts(day)
      if (lifts.length === 0) continue
      const before = new Map(day.exercises.map(e => [e.name, e.sets]))
      // 20 minutes is below anything the engine builds, so the trimmer is
      // pushed as hard as it can go — the case where a protection either
      // holds or does not.
      const r = shortenDayTo(week, day.day, profile, 20)
      if (!r.changed) continue
      examined++
      const after = r.week.days.find(d => d.day === day.day)!
      for (const lift of lifts) {
        const kept = after.exercises.find(e => e.name === lift)
        check(`${key} ${day.day}: ${lift} survives`, !!kept, after.exercises.map(e => e.name))
        check(`${key} ${day.day}: ...with every set`, kept?.sets === before.get(lift), { was: before.get(lift), now: kept?.sets })
      }
      check(`${key} ${day.day}: never goes below three exercises`, after.exercises.length >= 3, after.exercises.length)
    }
  }
  check('the sweep actually shortened something to examine', examined > 0, examined)

  // AND A DAY WHERE THE PROTECTION IS THE ONLY THING SAVING IT.
  //
  // Mutation testing: emptying protectedNames changed nothing above, because a
  // real day is protected three times over — Phase A refuses to trim a `main`
  // role's sets, and Phase B removes from the END of the array while selection
  // sorts tier1 first. The belt was never tested because the braces always
  // held. So: the same day with its main lift moved to the BACK, where Phase B
  // reaches first. Only the protected set can save it there.
  const reversed: MesocycleWeek = {
    ...WEEK,
    days: WEEK.days.map(d => {
      if (d.day !== DAY.day) return d
      const lift = mainLifts(d)[0]
      const i = d.exercises.findIndex(e => e.name === lift)
      if (i < 0) return d
      return { ...d, exercises: [...d.exercises.filter((_, j) => j !== i), d.exercises[i]] }
    }),
  }
  const liftName = mainLifts(DAY)[0]
  check('the fixture has a tier-1 main lift to move', !!liftName, DAY.exercises.map(e => e.name))
  check('...and it is now last, where the trimmer reaches first',
    reversed.days.find(d => d.day === DAY.day)!.exercises.slice(-1)[0].name === liftName)
  const r = shortenDayTo(reversed, DAY.day, PROFILE, 20)
  check('shortening a day whose main lift sits last still changes it', r.changed, r.refusal)
  const survivors = r.week.days.find(d => d.day === DAY.day)!.exercises.map(e => e.name)
  check('...and the main lift is STILL there, saved by the protected set alone',
    survivors.includes(liftName), survivors)
}

// ---------------------------------------------------------------------------
console.log('\n[3] it does what it says, and says what it could not do')
/** Taken before anything runs, by value. */
const SNAPSHOT = JSON.stringify(DAY)
{
  const nowMinutes = Math.round(estimateDaySeconds(DAY) / 60)
  const target = Math.max(20, nowMinutes - 20)
  const r = shortenDayTo(WEEK, DAY.day, PROFILE, target)
  check(`asking for ${target} min changes the day`, r.changed, r.refusal)
  const after = r.week.days.find(d => d.day === DAY.day)!
  check('the day really is shorter afterwards', estimateDaySeconds(after) < estimateDaySeconds(DAY),
    { was: nowMinutes, now: Math.round(estimateDaySeconds(after) / 60) })
  check('...and it reports the time it actually reached, not the one it was asked for',
    r.achievedMinutes === Math.round(estimateDaySeconds(after) / 60), { reported: r.achievedMinutes })
  check('the day is marked as shortened on purpose', after.shortened_to_minutes === target, after.shortened_to_minutes)
  check('what came out is reported', r.droppedExercises.length + r.setsRemoved > 0, r)

  // THE INPUT IS NOT TOUCHED — the property today's other edit paths learned
  // the hard way: every confirm card trials the real edit against the live plan.
  //
  // AGAINST A SNAPSHOT TAKEN BEFORE, not against the live object. The first
  // version compared WEEK's day with DAY, which is the same object — it
  // compared a thing with itself and passed while the copy was deleted.
  check('the week it was handed is untouched', JSON.stringify(WEEK.days.find(d => d.day === DAY.day)) === SNAPSHOT)

  // A day that already fits refuses, and the refusal SAYS THAT — not just any
  // refusal. Removing the early return produced a different, misleading
  // sentence and a bare "it refused" check could not tell them apart.
  const already = shortenDayTo(WEEK, DAY.day, PROFILE, nowMinutes + 30)
  check('a day that already fits refuses', !already.changed && !!already.refusal, already.refusal)
  check('...saying it already fits, in those terms', /already fits/i.test(already.refusal ?? ''), already.refusal)
  const noSession = shortenDayTo(WEEK, 'Wednesday', PROFILE, 25)
  check('a rest day refuses, and says so', !noSession.changed && !!noSession.refusal, noSession.refusal)

  // AND THE UNREACHABLE CASE IS NAMED. Asked for something the floors will not
  // allow, it returns the day it CAN build and the time that day really takes,
  // so the card can say "the closest I can get is N".
  const tooFar = shortenDayTo(WEEK, DAY.day, PROFILE, 5)
  check('an impossible target still returns a real day', tooFar.changed, tooFar.refusal)
  check('...reporting a time it did not reach, rather than the one asked for', tooFar.achievedMinutes > 5, tooFar.achievedMinutes)

  // REPLACED 18 Sep 2026 — THE CHECK WAS ENFORCING THE THING ASHLEY RULED
  // AGAINST. It asserted that an impossible target squeezes REST as well as
  // sets, which was true and was the design until her ruling that day (from
  // four options): protect the rest, do less. What survives is the half that
  // still matters — asked for a time it cannot reach, the day still shrinks
  // rather than silently returning the full session — and the new half, that
  // what it shed was WORK.
  //
  // This is the shape CLAUDE.md keeps recording: a mechanism-pinned check
  // does not merely fail to catch a drift, it can BLOCK the correction. Left
  // standing, this one would have made her ruling un-implementable on the
  // "just today" path.
  const tooFarDay = tooFar.week.days.find(d => d.day === DAY.day)!
  const restsBefore = new Map(DAY.exercises.map(e => [e.name, e.rest]))
  const workBefore = DAY.exercises.reduce((n, e) => n + e.sets, 0)
  const workAfter = tooFarDay.exercises.reduce((n, e) => n + e.sets, 0)
  check('...and it is WORK that was shed, not rest',
    workAfter < workBefore, { before: workBefore, after: workAfter })
  check('...with every exercise that survived keeping the rest it had',
    tooFarDay.exercises.every(e => !restsBefore.has(e.name) || restsBefore.get(e.name) === e.rest),
    tooFarDay.exercises.map(e => ({ name: e.name, was: restsBefore.get(e.name), now: e.rest })))
}

// ---------------------------------------------------------------------------
console.log('\n[4] "today" means one week, and next week is the full session')
{
  const target = 25
  const r = shortenDayTo(WEEK, DAY.day, PROFILE, target)
  const settled = settleWeek(r.week, DAY.day, PROFILE)
  const next = MESO.map(w => (w.week_number === 1 ? settled.week : w))

  const laterWeeks = next.filter(w => w.week_number > 1)
  const laterUnchanged = laterWeeks.every(w =>
    JSON.stringify(w) === JSON.stringify(MESO.find(o => o.week_number === w.week_number)))
  check(`all ${laterWeeks.length} later weeks are byte-identical`, laterUnchanged)
  check('...and none of them carries the shortened marker',
    laterWeeks.every(w => w.days.every(d => d.shortened_to_minutes === undefined)))

  // THE WRITE, PINNED. saveScopedEdit's 'today' branch is what makes the
  // sentence true; the executor must reach for the single-week saver, not the
  // whole-plan one. Comments stripped so a note about writing one week cannot
  // stand in for writing one week.
  const exec = readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const body = exec.slice(exec.indexOf('export async function executeSessionShorten'), exec.indexOf('export interface ScheduleChangePayload'))
  check('the shorten executor exists', body.length > 200)
  check('...and writes ONE week, not the whole plan', body.includes('saveMesocycleWeek(') && !body.includes('saveMesocycle('),
    { one: body.includes('saveMesocycleWeek('), all: /saveMesocycle\(/.test(body) })
  check('...through the shared settling tail', body.includes('settleWeek('))
  check('...and through shortenDayTo rather than its own trimming', body.includes('shortenDayTo('))
}

// ---------------------------------------------------------------------------
console.log('\n[5] the app does not argue with a decision it just carried out')
{
  const short = 20 * 60
  const asIf = describeSessionShortfall(short, '45-60', {})
  check('a genuinely short session still gets its note', asIf !== null, asIf?.note?.slice(0, 40))
  const shortened = describeSessionShortfall(short, '45-60', { shortenedToMinutes: 25 })
  check('a session shortened on purpose gets none', shortened === null, shortened)
  // The other two exemptions are unchanged — a regression here would be a
  // deload or a low-recovery week suddenly being told it is short.
  check('deload still exempt', describeSessionShortfall(short, '45-60', { isDeload: true }) === null)
  check('low recovery still exempt', describeSessionShortfall(short, '45-60', { lowRecovery: true }) === null)
}

// ---------------------------------------------------------------------------
console.log('\n[6] lighter today is the same step the coach already takes, narrowed')
{
  const r = adjustDayVolume(DAY, 'lighter', PROFILE)
  check('one step lighter changes the day', r.changed, r.blocked)
  check('...by removing sets and nothing else',
    r.day.exercises.length === DAY.exercises.length && r.setsAfter < r.setsBefore,
    { before: r.setsBefore, after: r.setsAfter })

  // THE SCOPE THE COACH SENDS, pinned at both ends. The tool has to offer it
  // and the courier has to forward it: an argument declared and then dropped
  // reads on the client as the default, which here is the FAR more
  // far-reaching of the two options.
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const fnCode = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const decl = fnCode.slice(fnCode.indexOf('name: "propose_volume_change"'), fnCode.indexOf('name: "propose_session_shorten"'))
  check('propose_volume_change offers a scope', /scope:\s*\{/.test(decl) && decl.includes('"today"') && decl.includes('"ongoing"'), decl.length)
  const courier = fnCode.slice(fnCode.indexOf('kind: "propose_volume_change"'))
  check('...and the courier forwards it to the client', /rawArgs:\s*\{[^}]*scope:\s*args\.scope/.test(courier.slice(0, 400)),
    courier.slice(0, 200))

  const shortenDecl = fnCode.slice(fnCode.indexOf('name: "propose_session_shorten"'), fnCode.indexOf('name: "ban_exercise"'))
  check('propose_session_shorten is declared and takes minutes', shortenDecl.includes('minutes'), shortenDecl.length > 0)
  check('...and is NOT a declining stub — it returns a proposal', fnCode.includes('kind: "propose_session_shorten"'))
}

// ---------------------------------------------------------------------------
console.log('\n[7] both surfaces offer it')
{
  // WHAT A SOURCE CHECK CAN HONESTLY SAY: the controls exist and are wired.
  // Whether they are REACHABLE on a real day is a question about gating, and a
  // grep cannot answer it — mutation testing proved that by disabling the
  // gate and leaving this section green. verify:session-edit taps them on a
  // real screen; that is where reachability is proven.
  const sheet = readFileSync(join(ROOT, 'src/components/exercise/WhatHappenedSheet.tsx'), 'utf8')
  check('the day menu has a "short of time" control', /data-verb="shorten"/.test(sheet))
  check('...and a "make it easier today" one', /data-verb="lighter"/.test(sheet))
  const panel = readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8')
  check('...both wired to the panel that owns plan edits', /onShorten=\{shortenToday\}/.test(panel) && /onLighter=\{lighterToday\}/.test(panel))
  const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const slot of ['buildSessionShortenProposal', 'executeSessionShorten', "kind === 'propose_session_shorten'"]) {
    check(`the coach half has its ${slot} slot`, chat.includes(slot))
  }
}

console.log('')
if (failures > 0) {
  console.error(`today only: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('today only: all checks passed')
