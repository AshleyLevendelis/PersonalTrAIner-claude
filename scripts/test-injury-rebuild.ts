/**
 * Injury rebuild — the gate for "an injury that removes whole movement
 * patterns rebuilds the plan instead of gutting it."
 *
 * Pointwise substitution silently assumed an injury removes SOME exercises.
 * A shoulder injury removes every horizontal push, vertical push and vertical
 * pull in the pool, so every one of those slots was dropped with no
 * replacement — measured at 146 of ~190 slots on a real full_gym profile.
 * This asserts we detect that and produce a real plan instead.
 */
import { generateExercisePlan, generateMesocycle, getFlaggedJoints, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'

// ---------------------------------------------------------------------------
// SEEDED, because this gate was not and its verdict moved on its own.
//
// Three consecutive runs of IDENTICAL code produced 452, 452 and 436 rebuilt
// slots, against a fixed 448 for substitute — so `rebuiltSlots > subSlots`
// passed twice and failed once with nothing changed. That is not a red gate,
// it is a coin flip, and a coin flip is worse: it made an unrelated change
// look like it had caused a regression (measured one run against one run,
// concluded wrongly, and only caught it by re-running).
//
// selectExercisesForTrack carries a ±0.3 tie-break jitter, so any count
// derived from selection needs a fixed stream. Every other report in this
// repo already seeds for exactly this reason; this gate was the exception.
//
// The SUBSTANCE of what it asserts is untouched — whether rebuild should
// yield more slots than substitute is a training question that is flagged and
// still open. This only makes the question answerable.
// ---------------------------------------------------------------------------
setRandomSource(seededRngFromKey('injury-rebuild:fixed'))
process.on('exit', () => resetRandomSource())
import { substituteForInjury, assessAdaptation, rebuildForInjury, countSlots } from '../src/lib/plan-adaptations'
import { getExerciseEntry, isContraindicatedFor, isIndicatedFor } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const profile = {
  age: 34, gender: 'male', height_cm: 178, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2600,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  created_at: new Date().toISOString(),
} as unknown as UserProfile

async function main() {
  const plan = generateExercisePlan(profile, [])
  const meso = generateMesocycle(profile, plan.plan)
  const weekNumbers = meso.map(w => w.week_number)

  console.log('\n[1] A shoulder injury is detected as unviable for pointwise substitution')
  const sub = await substituteForInjury({ mesocycle: meso, profile, injuryCode: 'shoulders', weekNumbers, exclusions: [] })
  const totalSlots = countSlots(meso)
  const verdict = assessAdaptation(sub, totalSlots)
  console.log(`     touched=${verdict.touched} dropped=${verdict.dropped} planLoss=${(verdict.planLossRatio * 100).toFixed(1)}% of ${totalSlots}`)
  // The swap-depth work gave shoulder-affected patterns (horizontal_pull,
  // vertical_push) real off-machine/off-equipment candidates that didn't
  // exist before, so pointwise substitution now finds a home for more
  // slots and the raw drop ratio legitimately fell below the old 0.15
  // fixture value — that's the fix working as intended, not a regression.
  // The invariant that actually matters is wipedPatterns: a shoulder
  // injury still wipes vertical_pull entirely (no shoulder-safe vertical
  // pull exists in the catalogue), which is what should force a rebuild
  // regardless of how the raw ratio happens to land.
  check('a whole movement pattern is wiped, not just thinned', verdict.wipedPatterns.length > 0, verdict.wipedPatterns)
  check('flagged shouldRebuild', verdict.shouldRebuild, verdict)

  console.log('\n[2] A neck injury (thins patterns, wipes none) is NOT flagged for rebuild')
  const subNeck = await substituteForInjury({ mesocycle: meso, profile, injuryCode: 'neck', weekNumbers, exclusions: [] })
  const verdictNeck = assessAdaptation(subNeck, totalSlots)
  console.log(`     touched=${verdictNeck.touched} dropped=${verdictNeck.dropped} planLoss=${(verdictNeck.planLossRatio*100).toFixed(1)}%`)
  check('a thinning injury does not trigger a rebuild', !verdictNeck.shouldRebuild, verdictNeck)

  console.log('\n[2b] Substitution never puts the same exercise in a session twice')
  {
    // THE BUG THIS SECTION EXISTS FOR, and nothing caught it for months: the
    // duplicate guard in substituteSlots read the ORIGINAL day.exercises and
    // every slot resolved inside a Promise.all, so no slot could see what
    // another had chosen. Two conflicting slots got the same ranked list and
    // both took candidates[0]. A real shoulder-injured session read:
    //   Band Dislocates | Barbell Floor Press | Landmine Press |
    //   Landmine Press | Tricep Pushdowns | Side Plank | Barbell Floor Press
    // — seven "exercises", four movements, 28 such placements across the plan.
    //
    // The count assertions in [3] DID fail because of this, but they blamed
    // the rebuild: substitution's slot total was inflated by the duplicates,
    // so an honest rebuild looked worse than a padded substitution. This
    // check names the real defect, so the next failure points at the right
    // thing.
    const dupes: string[] = []
    for (const w of sub.mesocycle) {
      for (const d of w.days) {
        const names = d.exercises.map(e => e.name)
        for (const n of names.filter((n, i) => names.indexOf(n) !== i)) {
          dupes.push(`wk${w.week_number}/${d.day}: ${n}`)
        }
      }
    }
    check('no exercise appears twice in one substituted session', dupes.length === 0, dupes.slice(0, 5))

    // A dropped slot is the HONEST outcome when no unique candidate remains —
    // better than a session listing the same lift twice. It shows up as a
    // higher planLossRatio, which is what assessAdaptation reads to decide a
    // rebuild would serve the user better. Asserted so nobody "fixes" the
    // drop rate by bringing the duplicates back.
    check('...and dropping rather than repeating is reflected in the loss ratio',
      verdict.dropped > 0, verdict)
  }

  console.log('\n[3] The rebuild produces a real plan, not a hollow one')
  const rebuilt = await rebuildForInjury({ profile, injuryCode: 'shoulders', exclusions: [], mesocycle: meso })
  const slotsBefore = meso.flatMap(w => w.days.flatMap(d => d.exercises)).length
  const slotsAfter = rebuilt.flatMap(w => w.days.flatMap(d => d.exercises)).length
  const survivingAfterSub = slotsBefore - verdict.dropped
  console.log(`     original=${slotsBefore}  after pointwise substitution=${survivingAfterSub}  after rebuild=${slotsAfter}`)
  check('rebuild keeps a comparable number of slots', slotsAfter >= slotsBefore * 0.8, { slotsBefore, slotsAfter })
  // ASHLEY'S RULING, 3 Sep 2026 — asked, and she said "decide for me", so
  // this is my call, recorded as such.
  //
  // This check used to read `slotsAfter > survivingAfterSub`, and it was TRUE
  // until PR #15: a shoulder rebuild produced 452 slots of 452, sixteen more
  // than pointwise substitution would have left. That PR gave every
  // non-conditioning goal a two-minute floor on the loaded main lift, and
  // longer rest per set leaves less room under the time cap, so the duration
  // trimmer cuts exercises to keep the cap's promise. The same rebuild became
  // 424 of 448 — eight BELOW substitution — and this line went red on the
  // merge, unread, for a day. Bisected to those three lines in
  // goal-policies.ts: removing only them at that commit restores 452 / 452.
  //
  // Two correct rules in tension, and the resolution is a coaching call:
  // FULL REST WINS. Rest is the half that keeps a rep from failing under
  // load, and it matters most on a plan that exists because someone is
  // already hurt. The rebuild pays for it in size.
  //
  // So the assertion moves to what the rebuild is actually FOR. Its advantage
  // over substitution was never the slot count — it is that it programmes
  // AROUND the injury (the checks below: nothing contraindicated anywhere, a
  // movement indicated for the joint, 410 of 424 shared slots holding a
  // different exercise, and exercises substitution can never reach). What the
  // count still has to prove is that the rebuild did not get GUTTED paying
  // for the rest: it may fall a little behind substitution and no further.
  // Measured today: 424 of 432, 98.1%.
  check('rebuild is not materially smaller than substitution', slotsAfter >= survivingAfterSub * 0.95,
    { slotsAfter, survivingAfterSub, ratio: +(slotsAfter / survivingAfterSub).toFixed(3) })

  // AND THE OTHER HALF OF HER RULING, which the loosening above would
  // otherwise leave unguarded. The cheapest way to make the count check pass
  // again is to exempt a rebuild from the rest floor — which is exactly the
  // trade she declined. So assert the floor holds INSIDE the rebuilt plan:
  // every loaded main lift in it rests at least as long as its goal allows.
  // This check is new, and it is why this section comes out stronger than the
  // line it replaces rather than weaker.
  {
    const floor = getGoalPolicy(profile.fitness_goal).minLoadedMainLiftRestSeconds ?? 60
    let loaded = 0
    let short = 0
    for (const w of rebuilt) {
      for (const d of w.days) {
        const main = d.exercises.find(e => e.tier === 'tier_1_primary')
        if (!main) continue
        const entry = getExerciseEntry(main.name)
        if (!entry || !isExternallyLoaded(entry)) continue
        const seconds = parseInt(String(main.rest), 10)
        if (!Number.isFinite(seconds)) continue
        loaded++
        if (seconds < floor) short++
      }
    }
    check(`the rebuilt plan still honours the ${floor}s main-lift rest floor (${short} of ${loaded} short)`,
      short === 0, { short, loaded, floor })
    check('...and it has loaded main lifts to check', loaded > 0, loaded)
  }

  console.log('\n[4] The rebuilt plan is actually safe for the injury')
  const shoulder = getFlaggedJoints(['shoulders'])
  const unsafe: string[] = []
  for (const w of rebuilt) for (const d of w.days) for (const ex of d.exercises) {
    const e = getExerciseEntry(ex.name)
    if (e && isContraindicatedFor(e, shoulder)) unsafe.push(`${ex.name} (wk${w.week_number} ${d.day})`)
  }
  check('no contraindicated movement anywhere in the rebuilt plan', unsafe.length === 0, unsafe.slice(0, 5))

  console.log('\n[5] The rebuild includes rehab work for the injured joint')
  const indicated = new Set<string>()
  for (const w of rebuilt) for (const d of w.days) for (const ex of d.exercises) {
    const e = getExerciseEntry(ex.name)
    if (e && isIndicatedFor(e, shoulder)) indicated.add(ex.name)
  }
  console.log(`     indicated movements present: ${[...indicated].join(', ') || '(none)'}`)
  check('at least one movement indicated FOR the shoulder is programmed', indicated.size > 0)

  console.log('\n[6] Week identity is preserved so existing references still resolve')
  check('week numbers unchanged', rebuilt.map(w => w.week_number).join() === meso.map(w => w.week_number).join())
  check('block numbers unchanged', rebuilt.map(w => w.block_number).join() === meso.map(w => w.block_number).join())
  check('labels unchanged', rebuilt.map(w => w.label).join() === meso.map(w => w.label).join())

  console.log('\n[7] The WIRED executor path rebuilds, not substitutes')
  {
    // executeLastingInjury with no profile.id still runs the full plan
    // transformation before the persistence guard, so this exercises the
    // real production branch without touching a database.
    const { executeLastingInjury } = await import('../src/lib/pending-action-executor')
    // BOTH CALLS RUN UNDER THE SAME SEED, and that is what makes the
    // comparison below mean anything. executeLastingInjury is NOT
    // deterministic: two rebuilds of the same mesocycle differ in ~250 of 436
    // slots purely by shuffle. An unseeded diff therefore "passes" when the
    // two modes are identical, which is precisely the no-op this section
    // exists to catch — caught by mutating the substitute call to 'rebuild'
    // and watching the check stay green.
    const runSeeded = async (mode: 'rebuild' | 'substitute') => {
      setRandomSource(seededRngFromKey('injury-rebuild:modes'))
      try {
        return await executeLastingInjury(
          { ...profile, id: undefined } as UserProfile, meso,
          { injuryCode: 'shoulders', weekNumbers, exclusions: [], mode },
        )
      } finally { resetRandomSource() }
    }
    const viaRebuild = await runSeeded('rebuild')
    const rebuiltSlots = viaRebuild.mesocycle.flatMap(w => w.days.flatMap(d => d.exercises)).length
    const unsafeWired: string[] = []
    for (const w of viaRebuild.mesocycle) for (const d of w.days) for (const ex of d.exercises) {
      const e = getExerciseEntry(ex.name)
      if (e && isContraindicatedFor(e, shoulder)) unsafeWired.push(ex.name)
    }
    console.log(`     executor(mode=rebuild) -> ${rebuiltSlots} slots, ${unsafeWired.length} unsafe`)
    check('executor rebuild keeps the plan whole', rebuiltSlots >= slotsBefore * 0.8, rebuiltSlots)
    check('executor rebuild is safe for the injury', unsafeWired.length === 0, unsafeWired.slice(0, 5))

    const viaSubstitute = await runSeeded('substitute')
    const subSlots = viaSubstitute.mesocycle.flatMap(w => w.days.flatMap(d => d.exercises)).length
    console.log(`     executor(mode=substitute) -> ${subSlots} slots`)

    // THIS USED TO READ `rebuiltSlots > subSlots` AND THAT WAS A PROXY, not
    // the property. It tested "rebuild is not a no-op" by way of substitute
    // DROPPING slots it could not safely fill — 436 vs 432. Adding four
    // bodyweight/band hip movements to the catalogue gave substitution
    // something safe for those four slots, so both modes now return 436 and
    // the proxy went stably false while the thing it stood for stayed true.
    //
    // The four extra slots are an improvement, not a regression: a
    // shoulder-injured trainee's substituted plan is fuller than it was. A
    // check that goes red BECAUSE the app got better is measuring the wrong
    // thing. Same lesson as test:band-slots' frozen count.
    //
    // So compare CONTENT, which is what "genuinely differ" always meant.
    const namesOf = (m: typeof viaRebuild) =>
      m.mesocycle.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name)))
    const rNames = namesOf(viaRebuild), sNames = namesOf(viaSubstitute)
    // Compared over the COMMON PREFIX only. The two modes legitimately return
    // different lengths, and counting positions past the shorter array as
    // "different" (they compare against undefined) would inflate the number
    // with something that is not a content difference at all.
    const common = Math.min(rNames.length, sNames.length)
    const positionsDiffer = rNames.slice(0, common).filter((n, i) => n !== sNames[i]).length
    const rSet = new Set(rNames), sSet = new Set(sNames)
    const onlyRebuild = [...rSet].filter(n => !sSet.has(n))
    check(`the two modes genuinely differ (${positionsDiffer} of ${common} shared slots hold a different exercise)`,
      positionsDiffer > common * 0.1, { positionsDiffer, common, rLen: rNames.length, sLen: sNames.length })
    check(`...and rebuild reaches exercises substitution never does (${onlyRebuild.slice(0, 3).join(', ')})`,
      onlyRebuild.length > 0, onlyRebuild.slice(0, 5))
    // The old proxy's real content, kept as an assertion that cannot invert:
    // substitution must never come back EMPTIER than it used to be able to.
    check(`substitution still fills the plan (${subSlots} slots, was 432 before hip work existed)`,
      subSlots >= 432, { subSlots })
  }

  if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
  console.log('\nAll injury-rebuild checks passed.')
}

main().catch(e => { console.error(e); process.exit(1) })
