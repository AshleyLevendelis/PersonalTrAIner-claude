// ---------------------------------------------------------------------------
// THE ACCELERATOR, AND THE FOUR WAYS IT COULD HURT SOMEONE.
//
// beat-target-offer.ts is the first thing in this app that can make a
// prescription HEAVIER from logged history. Everything else that reads
// backward — block-review.ts, block-consistency.ts — can only hold something
// back, and a wrong hold costs a week of easier training. A wrong raise puts
// weight on a bar.
//
// So the checks below are weighted to the unsafe direction. §2 (it stays
// quiet) has more cases than §1 (it fires), and §3 exists solely to prove the
// thing can never propose DOWNWARD — which would make the accelerator a
// silent brake, bypassing the evidence bar block-review is required to meet.
//
// Pure functions only. checkForBeatTargetOffer and confirmBeatTargetOffer
// both talk to Supabase, which this sandbox cannot reach; the decision logic
// they depend on is exported precisely so it can be tested without them, and
// §5 reads source to prove the untestable half is wired to the testable one.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { beatTargetInBlock, offerText, carriedForRepRange, patchBlockFromLiftedKg } from '../src/lib/beat-target-offer'
import { calculateE1RM } from '../src/lib/pr-engine'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'
import { MIN_SESSIONS_TO_JUDGE } from '../src/lib/block-review'
import type { ExerciseHistorySession } from '../src/lib/exercise-history'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

/** A logged session, shaped exactly as exercise-history returns one. */
const session = (date: string, topSetWeightKg: number): ExerciseHistorySession => ({
  sessionId: `s-${date}`,
  date,
  sets: [],
  topSetWeightKg,
  topSetE1RM: topSetWeightKg * 1.1,
})

console.log('\n1. It fires when someone has genuinely outgrown the plan')
{
  // Four sessions, climbing, ending above what the next block plans.
  const climbing = [session('2026-08-04', 60), session('2026-08-11', 65), session('2026-08-18', 70), session('2026-08-25', 72.5)]
  check('a lift climbing past its prescription is offered a catch-up',
    beatTargetInBlock(climbing, 67.5) === true)
  check('...and the offer names both numbers, in that order',
    /72\.5kg/.test(offerText('Bench Press', 67.5, 72.5)) && /67\.5kg/.test(offerText('Bench Press', 67.5, 72.5)),
    offerText('Bench Press', 67.5, 72.5))
  // The copy is the reason the automatic version was rejected. It must report,
  // not applaud — the app cannot see whether the last two reps were clean.
  check('...and praises nobody',
    !/(great|well done|smash|crush|amazing|nice work|proud)/i.test(offerText('Bench Press', 67.5, 72.5)),
    offerText('Bench Press', 67.5, 72.5))
}

console.log('\n2. It stays quiet in every case where the evidence is thin')
{
  const twoSessions = [session('2026-08-04', 70), session('2026-08-11', 75)]
  check(`fewer than ${MIN_SESSIONS_TO_JUDGE} sessions is not evidence, however heavy`,
    beatTargetInBlock(twoSessions, 60) === false)

  // THE CASE THAT MATTERS MOST. One good day inside a flat block is not
  // progress, and reading it as progress is how someone gets a heavier bar
  // for a fluke. didExerciseStallInBlock calls this a stall; so must this.
  const oneGoodDay = [session('2026-08-04', 60), session('2026-08-11', 60), session('2026-08-18', 60), session('2026-08-25', 72.5)]
  check('one heavy day in an otherwise flat block is not a catch-up',
    beatTargetInBlock(oneGoodDay, 67.5) === false)

  const flat = [session('2026-08-04', 70), session('2026-08-11', 70), session('2026-08-18', 70)]
  check('a lift that never moved is not a catch-up, even above the plan',
    beatTargetInBlock(flat, 60) === false)

  const climbingBelow = [session('2026-08-04', 50), session('2026-08-11', 55), session('2026-08-18', 60)]
  check('genuine progress that is still BELOW the plan is not a catch-up',
    beatTargetInBlock(climbingBelow, 67.5) === false)

  const climbingEqual = [session('2026-08-04', 60), session('2026-08-11', 65), session('2026-08-18', 67.5)]
  check('...and neither is landing exactly ON the plan — that is the plan being right',
    beatTargetInBlock(climbingEqual, 67.5) === false)

  check('no sessions at all is silence, not a division by zero', beatTargetInBlock([], 60) === false)
}

console.log('\n3. It can never, on any input, propose a lighter weight')
{
  // The accelerator must not be able to act as a brake. Holding a weight back
  // is block-review.ts's job and carries its own evidence bar; if this could
  // fire below the plan it would be a second, weaker route to the same
  // outcome. Swept rather than argued.
  let firedBelowOrEqual = 0, firedAbove = 0, cases = 0
  for (const planned of [20, 42.5, 60, 67.5, 100, 140]) {
    for (const last of [10, 20, 42.5, 60, 67.5, 100, 140, 200]) {
      // A climbing block ending at `last`, long enough to be judged.
      const sessions = [session('2026-08-04', last * 0.8), session('2026-08-11', last * 0.9), session('2026-08-18', last)]
      cases++
      if (!beatTargetInBlock(sessions, planned)) continue
      if (last > planned) firedAbove++
      else firedBelowOrEqual++
    }
  }
  console.log(`      ${cases} planned/lifted combinations swept; fired on ${firedAbove}`)
  check('it never fires at or below the planned weight', firedBelowOrEqual === 0, firedBelowOrEqual)
  check('...and it does fire somewhere, so that check has teeth', firedAbove > 0, firedAbove)
}

console.log('\n4. The evidence bar is the SAME one the brake uses')
{
  // Two definitions of "progress" in one app is how the accelerator and the
  // brake end up disagreeing about the same four weeks. This pins that
  // beatTargetInBlock is built on block-review's exports rather than a
  // private copy.
  const src = readFileSync(join(ROOT, 'src/lib/beat-target-offer.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('it imports the stall check rather than reimplementing it',
    /didExerciseStallInBlock/.test(src) && /from '\.\/block-review'/.test(src))
  check('...and the three-session bar is block-review\'s constant, not a literal',
    /MIN_SESSIONS_TO_JUDGE/.test(src) && !/length < 3\b/.test(src))
  check('...and the weight it proposes is the one actually logged',
    /lastLoggedWeight\(/.test(src))
}

console.log('\n5. The half that needs a database is wired to the half that does not')
{
  const src = readFileSync(join(ROOT, 'src/lib/beat-target-offer.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  check('the check gates on the decision function', /beatTargetInBlock\(/.test(src))
  // THE ONE WRITER. Setting suggested_load_kg by hand is the bug that had
  // this app telling the coach 7.5kg for a lift prescribed at 8kg; the fix
  // was to stop having a second way to write a weight, and this must not add
  // one back. prescribeLoad returns number, string and per-set together.
  // ONE PATCH PATH. The rewrite itself lives in patchBlockFromLiftedKg, shared
  // since 10 Sep 2026 with the calibration-week re-anchor — so this pins that
  // confirm hands the LOGGED weight to that one helper and that the helper
  // rebuilds through prescribeLoad, rather than pinning the line the code
  // happened to sit on before the two callers existed.
  check('confirm hands the logged weight to the one patch helper',
    /patchBlockFromLiftedKg\(mesocycle, profile, \{/.test(src) && /liftedKg: payload\.liftedKg/.test(src))
  // RE-ANCHORED 9 Oct 2026. This pinned `const targetKg = …anchor.liftedKg`,
  // and went red when the target became the lifted weight CAPPED at what the
  // person has said they own (test log H18: a 30kg set against 24kg dumbbells
  // was written as 24 but its deload was 70% of 30, and the week was reported
  // as changed when the number had not moved). The property was always "the
  // number written comes from the lifted weight, through prescribeLoad" — so
  // that is what is read: lifted -> what prescribeLoad can actually write for it -> target -> prescribeLoad.
  // test:calibration-search §6 holds the behaviour, on a real plan.
  check('...which rebuilds the load through prescribeLoad, never field by field',
    /prescribeLoad\(/.test(src) && /forceStartingWeightKg: targetKg/.test(src)
    && /const reachableKg = prescribeLoad\([^\n]*forceStartingWeightKg: anchor\.liftedKg/.test(src)
    && /const targetKg = [^\n]*reachableKg/.test(src))
  check('...and all three load fields are written from that one result',
    /suggested_load: load\.display/.test(src)
    && /suggested_load_kg: load\.starting_weight_kg/.test(src)
    && /per_set_load: load\.per_set/.test(src))
  // It proposes; it never applies. If createPendingAction ever disappears
  // from the check, the offer has become an action.
  check('the check only ever raises a proposal', /createPendingAction\(/.test(src))
  check('...and confirming goes through the rail\'s claim, so a double tap cannot apply twice',
    /claimPendingAction\(/.test(src))
  // SCOPED TO THE CLAIM CALL, not to the file. The first version of this
  // check just looked for `plannedKgForSlot(` anywhere in the module, and a
  // mutation that replaced the precondition with `async () => true` while
  // leaving a dead reference behind sailed straight through it — a check its
  // own subject can satisfy from unreachable code, which is the exact defect
  // this repo keeps finding in its gates. Take the claim call and look inside.
  const claimCall = src.slice(src.indexOf('claimPendingAction(offerId'), src.indexOf('claimPendingAction(offerId') + 400)
  check('the claim call exists to be checked (sanity check on this check)', claimCall.length > 50, claimCall.length)
  check('...with a precondition, so a plan that moved underneath is refused',
    /plannedKgForSlot\(/.test(claimCall) && !/async \(\) => true/.test(claimCall))

  check('App.tsx runs the check at the block boundary', /checkForBeatTargetOffer\(/.test(app))
  check('...and offers both answers, not just the yes', /handleLoadCatchupConfirm\(/.test(app) && /handleLoadCatchupDecline\(/.test(app))
  // A success receipt for a write that did not happen is the defect the
  // weight-basis path already hit and fixed in a browser run.
  // SCOPED TO THIS HANDLER. `if (patched) {` also appears in the weight-basis
  // handler, so a file-wide match was green even with the guard deleted from
  // the one it was written for — found by mutating it, not by reading it.
  const handlerStart = app.indexOf('const handleLoadCatchupConfirm')
  const handler = handlerStart < 0 ? '' : app.slice(handlerStart, app.indexOf('const handleLoadCatchupDecline'))
  check('the catch-up handler exists to be checked (sanity check on this check)', handler.length > 200, handler.length)
  check('...and only updates the plan when confirm actually patched something',
    /if \(patched\) \{/.test(handler))
}

console.log('\n6. Runs 3-4 (M43): the new block\'s reps, the kit limit, and a deload that is lighter')
{
  // The tester: Floor Press 18 kg x 11 in block 1, block 2 planned at 16 kg x 6-8.
  const e1rm = calculateE1RM(18, 11)
  const carry = carriedForRepRange(e1rm, '6-8')
  // 18 x 11 is an Epley 1RM of 24.6; back down to 8 reps is 19.4, rounded down
  // to the half kilo. The confirm then rounds to a dumbbell that exists.
  check('18 kg x 11 is carried as 19 kg for 6-8 reps (above the 16 kg planned)', carry === 19, { e1rm, carry })
  check('...aimed at the TOP of the range, so 6 reps leave some in reserve', carry !== null && carry < (carriedForRepRange(e1rm, '6') ?? 0))
  check('a higher-rep block carries LOWER, and the offer only ever raises over the plan',
    (carriedForRepRange(e1rm, '12-15') ?? 99) < 18 && beatTargetInBlock([session('2026-01-01', 18), session('2026-01-08', 18), session('2026-01-15', 18)], 16, carriedForRepRange(e1rm, '12-15') ?? 0) === false)
  check('a range with no number carries nothing', carriedForRepRange(e1rm, 'AMRAP') === null)
  check('the sentence says what the number is for', offerText('Dumbbell Floor Press', 16, 19, '6-8') === "Your Dumbbell Floor Press sets last block work out at about 19kg for this block's 6-8 reps, and it is planned from 16kg. Want me to start it from that?")

  // The kit limit and the deload, through the real patch.
  const profile = {
    id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', fitness_goal: 'hypertrophy',
    equipment_access: 'minimalist', injuries: [], training_style: 'bodybuilding', training_experience: 'intermediate',
    session_duration_preference: '45-60', max_dumbbell_kg: 24, dietary_preferences: [], concurrent_activities: [],
    training_days: [], weekly_schedule: {}, recovery_capacity: 'moderate',
  } as unknown as UserProfile
  const week = (n: number, kg: number, deload = false): MesocycleWeek => ({
    week_number: 4 + n, block_number: 2, week_in_block: n, is_deload: deload, label: '', phase_label: 'Hypertrophy',
    days: [{ day: 'Monday', focus: 'Pull', exercises: [{ name: 'Dumbbell Rows', sets: 3, reps: '8-10', intensity: 'RPE 7', suggested_load_kg: kg, suggested_load: `${kg}kg` }] }],
  } as unknown as MesocycleWeek)
  const plan = [week(1, 20), week(2, 22), week(3, 24), week(4, 24, true)]
  const { next } = patchBlockFromLiftedKg(plan, profile, { blockNumber: 2, dayName: 'Monday', exIndex: 0, exerciseName: 'Dumbbell Rows', liftedKg: 30 })
  const kgOf = (m: MesocycleWeek[], n: number) => m.find(w => w.week_in_block === n)!.days[0].exercises[0].suggested_load_kg ?? 0
  check('a lift carried past the stated 24 kg limit is written at the limit, never above', [1, 2, 3].every(n => kgOf(next, n) <= 24) && kgOf(next, 1) === 24, [1, 2, 3, 4].map(n => kgOf(next, n)))
  check('the deload stored AT the limit comes DOWN to its fraction (it used to stay at 24)', kgOf(next, 4) < 24 && kgOf(next, 4) <= Math.ceil(24 * 0.7) + 2, kgOf(next, 4))
  check('...and the loading weeks never come down', [1, 2, 3].every(n => kgOf(next, n) >= kgOf(plan, n)))
}

{
  const src = readFileSync(join(ROOT, 'src/lib/beat-target-offer.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  check('the block-start offer judges and offers the carried number, not the raw last weight',
    /const carryKg = recent \? \(carriedForRepRange\(recent\.topSetE1RM, ex\.reps\)/.test(src)
    && /beatTargetInBlock\(sessionsInBlock, plannedKg, carryKg\)/.test(src) && /liftedKg: carryKg,/.test(src))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe accelerator asks first, and can only ever go up.\n')
