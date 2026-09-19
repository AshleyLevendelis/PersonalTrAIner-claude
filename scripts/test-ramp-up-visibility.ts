/**
 * Ramp-up-visibility regression test.
 *
 * Real bug: an advanced profile's Push & Press day showed "Barbell Bench
 * Press — S1: 90kg, S2: 90kg, S3: 90kg" on the plan screen with no ramp/
 * build-up sets visible anywhere except inside a collapsed, day-level
 * "Warm-Up" section that has no code-level tie to the specific exercise row.
 * Diagnosis: buildWarmup (warmup.ts) correctly generated a ramp block for
 * Barbell Bench Press — it just lived exclusively on WorkoutDay.warmup.
 * ramp_ups, a day-level array keyed by exercise NAME STRING, never copied
 * onto the Exercise object the row actually renders from.
 *
 * The fix attaches a matching RampBlock onto Exercise.ramp_up wherever
 * generation produces one (exercise-plan.ts) — this test asserts that
 * attachment holds across an entire generated mesocycle, not just the base
 * plan's first pass, and specifically survives variation rotation (a block-
 * boundary or weekly accessory swap changes Exercise.name — carryRampUp is
 * what keeps ramp_up in sync with it, or drops it if the new exercise
 * doesn't qualify).
 */
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { formatRampSets } from '../src/lib/session-derive'
import { supersetAlternation } from '../src/lib/coach-voice'
import { rampedMemberLabels } from '../src/components/exercise/SupersetGroup'
import type { UserProfile, WorkoutDay } from '../src/lib/types'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function findEntry(name: string) {
  return EXERCISE_DATABASE.find(e => e.name === name)
}

/**
 * The actual regression assertion: every externally-loaded tier1_compound
 * in this day must carry a ramp_up on the SAME Exercise object, matching
 * its own name — "present somewhere in warmup.ramp_ups" is not enough, this
 * is exactly the field the exercise row renders from (ExercisePlan.tsx's
 * formatRampSets).
 */
function assertDayRampsAttached(day: WorkoutDay, label: string) {
  for (const ex of day.exercises) {
    const entry = findEntry(ex.name)
    if (!entry || entry.mechanics_tier !== 'tier1_compound' || !isExternallyLoaded(entry)) continue
    check(
      `${label} / ${day.day}: "${ex.name}" (tier1_compound, externally loaded) has ramp_up attached to its own Exercise object`,
      !!ex.ramp_up && ex.ramp_up.exercise === ex.name && ex.ramp_up.sets.length > 0,
      { ramp_up: ex.ramp_up },
    )
  }
}

async function main() {
  console.log('[1] Reproduce the exact reported scenario: advanced, full_gym, push/press day')
  // Seeded (not Math.random) so this is deterministic across runs — same
  // pattern run-quality-score.ts/run-llm-review.ts use for reproducible
  // audit/scoring runs (see seeded-random.ts's doc comment).
  setRandomSource(seededRngFromKey('ramp-visibility-advanced-full_gym'))

  const trainingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({
    day,
    available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day),
  }))
  const profile: UserProfile = {
    age: 32, gender: 'male', height_cm: 178, weight_kg: 90,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    training_days: trainingDays, session_duration_preference: '45-60', workout_split_preference: 'ppl',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym', training_style: 'hybrid',
    training_experience: 'advanced', coaching_persona: 'supportive', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    known_bench_kg: 90, known_squat_kg: 100, known_deadlift_kg: 120, skip_calibration_week: true,
  }

  const mesocycle = generateMesocycle(profile)
  resetRandomSource()
  check('mesocycle generated at least one week', mesocycle.length > 0)

  // Not asserting a specific exercise NAME exists (generation legitimately
  // varies which barbell press/squat/hinge variant it picks) — the real
  // regression is about ramp attachment, not exercise selection. Any
  // tier1_compound, externally-loaded exercise in week 1 reproduces the
  // reported bug shape (a heavy compound with a prescribed working weight).
  const week1 = mesocycle[0]
  const mainLiftDay = week1?.days.find(d =>
    d.exercises.some(e => {
      const entry = findEntry(e.name)
      return entry?.mechanics_tier === 'tier1_compound' && isExternallyLoaded(entry) && e.suggested_load_kg != null
    })
  )
  check('week 1 contains a day with an externally-loaded tier1_compound main lift', !!mainLiftDay)

  if (mainLiftDay) {
    const mainLift = mainLiftDay.exercises.find(e => {
      const entry = findEntry(e.name)
      return entry?.mechanics_tier === 'tier1_compound' && isExternallyLoaded(entry) && e.suggested_load_kg != null
    })!
    check(`"${mainLift.name}" has a working weight prescribed`, mainLift.suggested_load_kg != null, mainLift.suggested_load_kg)
    check(
      `"${mainLift.name}" has ramp_up attached, matching its own name, with build-up sets`,
      !!mainLift.ramp_up && mainLift.ramp_up.exercise === mainLift.name && mainLift.ramp_up.sets.length > 0,
      mainLift.ramp_up,
    )
  }

  console.log('\n[2] Every tier1_compound externally-loaded exercise, every week — not just week 1')
  for (const week of mesocycle) {
    for (const day of week.days) {
      assertDayRampsAttached(day, `Week ${week.week_number}`)
    }
  }

  console.log('\n[3] Extended display assertions (LAYOUT-DESIGN.md §7.5, three-assertion version)')
  for (const week of mesocycle) {
    for (const day of week.days) {
      // (A) every tier1 externally-loaded exercise with a matching ramp_up
      // yields a non-empty, floored, plate-rounded kg list via the exact
      // function the row renders from.
      for (const ex of day.exercises) {
        if (!ex.ramp_up || ex.ramp_up.exercise !== ex.name) continue
        const entry = findEntry(ex.name)
        if (!entry || entry.mechanics_tier !== 'tier1_compound' || !isExternallyLoaded(entry)) continue
        if (ex.suggested_load_kg == null) continue // no working weight yet — covered by (B) if it qualifies there
        const display = formatRampSets(ex)
        check(
          `(A) Week ${week.week_number}/${day.day}: "${ex.name}" formatRampSets yields a non-empty, floored kg list`,
          display?.kind === 'kg' && display.sets.length > 0 && display.sets.every(s => s.kg > 0 && Number.isFinite(s.kg)),
          display,
        )
      }

      // (B) every warmup.ramp_ups-named exercise with suggested_load_kg ==
      // null (a bodyweight compound) yields the rep-only variant, never the
      // kg list (which would divide by a null working weight) and never null
      // (which would silently drop the ramp now that the day-level
      // percentage block is gone).
      const rampUps = day.warmup?.ramp_ups ?? []
      for (const rb of rampUps) {
        const ex = day.exercises.find(e => e.name === rb.exercise)
        if (!ex || ex.suggested_load_kg != null) continue
        const display = ex.ramp_up ? formatRampSets(ex) : null
        check(
          `(B) Week ${week.week_number}/${day.day}: "${rb.exercise}" (no suggested load) yields the rep-only variant`,
          display?.kind === 'bodyweight' && display.sets.length > 0,
          display,
        )
      }

      // (C) no warmup.ramp_ups entry may be orphaned by the initial attach
      // pass (exercise-plan.ts:2710-2713, the exact seam §1.5's deletion
      // depends on) — every RampBlock buildWarmup decided on must land on
      // its own Exercise object at generation time. Scoped to week 1 only:
      // day.warmup.ramp_ups is a snapshot from THIS generation pass and is
      // never rewritten by later block-to-block rotation, while carryRampUp
      // legitimately renames or drops an exercise's own ramp_up as it
      // rotates — comparing a rotated week's exercises against week 1's
      // stale name snapshot would flag that intentional drift as a false
      // orphan, not a real attachment failure.
      if (week.week_number === 1) {
        const attachedNames = new Set(
          day.exercises.filter(e => e.ramp_up && e.ramp_up.exercise === e.name).map(e => e.name),
        )
        for (const rb of rampUps) {
          check(
            `(C) Week 1/${day.day}: warmup ramp for "${rb.exercise}" is attached to its exercise, not orphaned`,
            attachedNames.has(rb.exercise),
            { ramp_ups: rampUps.map(r => r.exercise), attached: [...attachedNames] },
          )
        }
      }
    }
  }

  console.log('\n[4] The build-up is boxes on today and text everywhere else (17 Sep 2026)')
  {
    // Ashley, from the gym on 7 Sep 2026: "theres no way to log the ramp up
    // weights." Her ruling then was TICK THEM OFF, do not log them — a
    // place-keeper that wrote nothing down. Standing in the gym again on
    // 17 Sep she reversed it, from three options: a box for every set,
    // labelled, so the build-up is logged like any other work and marked so it
    // never counts toward the weight going up.
    //
    // THIS SECTION USED TO PIN THE TICK MECHANISM, AND THAT IS THE LESSON.
    // Fourteen checks asserted the toggle's onClick, its aria-pressed, its
    // border before it was tapped, and the four pieces of rampTicks state
    // behind it. Every one had to go red for her ruling to land, and while
    // they stood they would have kept dead code alive — a mechanism-pinned
    // check does not merely fail to catch a drift, it can BLOCK the
    // correction. What is checked now is the property underneath: the
    // build-up is on screen, it is never mistaken for working volume, and it
    // cannot be tapped on a day nobody is training.
    const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
    const strip = read('src/components/exercise/RampStrip.tsx')
    const row = read('src/components/exercise/ExerciseRow.tsx')
    const browse = read('src/components/exercise/ReadOnlyDayList.tsx')
    const hook = read('src/hooks/useActiveSession.tsx')

    check('today\'s card no longer renders the tickable strip — the grid has the rows',
      !/<RampStrip[\s\S]{0,200}onToggle=/.test(row), row.match(/<RampStrip[\s\S]{0,120}/)?.[0])
    const gridSrc = readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8')
    // RE-ANCHORED 19 Sep 2026 — the row testid gained a third value for drop
    // rows. The property is that a build-up row is distinguishable from a
    // working one, not the shape of the ternary that decides it.
    check('...the grid draws a labelled build-up row',
      /data-testid={warm \? 'warmup-row'/.test(gridSrc) && /'working-row'/.test(gridSrc))
    check('...labelled by the shared function, with no third case', /\{setLabel\(ref\)\}/.test(gridSrc))
    check('...and a build-up row is SAVED as one', /isWarmup: warm,/.test(gridSrc))
    // RE-ANCHORED 19 Sep 2026. This pinned the delete call's exact text and went
    // red the moment the call gained a third coordinate — drop_index — which is
    // the same key growing for the same reason. The PROPERTY is that every
    // coordinate of the natural key is read off the ROW rather than defaulted:
    // a literal there tombstones a different row than the one tapped.
    const del = gridSrc.slice(gridSrc.indexOf('deleteSet({ userId: profileId'))
    const delCall = del.slice(0, del.indexOf('})') + 2)
    check('the delete call was located (sanity check on this check)', delCall.length > 60 && delCall.length < 400, delCall.length)
    check('...and DELETED as one — the kind comes off the row, not a default',
      /isWarmup: isWarm\(ref\)/.test(delCall), delCall)
    check('...and so does which drop it is, for the same reason one column along',
      /dropIndex: ref\.dropIndex/.test(delCall), delCall)
    check('...with no literal standing in for either', !/isWarmup: (true|false)/.test(delCall) && !/dropIndex: \d/.test(delCall), delCall)
    // WHAT THIS FILE CANNOT PROVE, said out loud rather than left implied:
    // every check here reads SOURCE. Deleting the warm-up refs from the row
    // list leaves all of this green while the rows vanish from the screen —
    // measured, by doing exactly that. Only a browser can see a row that is
    // not there, which is verify:warmup-rows' job.
    // The half that makes it safe rather than merely visible.
    check('...while a build-up never fires a personal best', /const pr = warm[^:]*\? null : checkForPR\(/.test(gridSrc))
    check('...and never starts the rest timer or the same-session bump', /if \(!warm &&[^)]*onSetCompleted && prescribedReps\)/.test(gridSrc))
    check('...and never takes last week\'s WORKING weight as its ghost',
      /const ghostFor = \(ref: SetRef\) => \(isWarm\(ref\)[^?]*\? undefined :/.test(gridSrc))


    // THE STRIP IS READ-ONLY EVERYWHERE NOW, AND THE MACHINERY IS GONE WITH IT.
    // Left in place, the props and the stored ticks would be dead code that
    // three checks in this very file insisted on.
    const stripCode = strip.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
    check('the strip takes a ramp and nothing else — no toggle, no ticks',
      /export function RampStrip\(\{ ramp \}: \{ ramp: RampDisplay \}\)/.test(stripCode), stripCode.slice(0, 200))
    check('...so it draws no buttons at all', !/<button/.test(stripCode), stripCode.match(/<button[\s\S]{0,80}/)?.[0])
    check('...and writes no set, as it never did',
      !/logSet|saveSet|isWarmup|is_warmup|supabase/.test(stripCode), stripCode.match(/logSet|saveSet|isWarmup|is_warmup|supabase/g))
    check('the tick state is gone from the session hook', !/rampTicks/.test(hook), hook.match(/.{0,40}rampTicks.{0,40}/g)?.slice(0, 3))
    check('...and today\'s card no longer asks for it',
      !/rampTicksFor|toggleRampTick/.test(row), row.match(/.{0,40}(rampTicksFor|toggleRampTick).{0,20}/g)?.slice(0, 3))

    // AND THE SENTENCE THAT STATES THE ORDER SURVIVED THE DELETION. It used to
    // render only on the tickable surface; removing the ticks would have taken
    // it off the only screen still showing this block, silently undoing
    // Ashley's 10 Sep ruling that the order is said on screen, not in a
    // tooltip. Checked as a rendered line outside any `interactive` guard.
    check('browse and peek render the strip', /<RampStrip ramp=\{ramp\} \/>/.test(browse))
    check('...and it still says the build-up comes first', /Ramp up first:/.test(stripCode))
    // PINNED ON THE WHOLE CONDITION, not on part of it. A first version asked
    // whether `ramp.kind === 'kg' && (` preceded the sentence, and passed with
    // `{false && ramp.kind === 'kg' && (` in front of it — the sentence
    // switched off and the check green. The property is that the KIND is the
    // only thing standing between a reader and this line.
    check('...and that set 1 follows it, on screen rather than in a title',
      /\{ramp\.kind === 'kg' && \(\s*\n?\s*<span[\s\S]{0,200}?→ then set 1/.test(stripCode), stripCode.match(/.{0,140}then set 1/)?.[0])
    check('...with no surviving notion of an interactive strip', !/interactive/.test(stripCode))
  }

  // -------------------------------------------------------------------
  // A PAIR THAT RAMPS IS TOLD SO — Ashley's handoff, 19 Sep 2026.
  //
  // "alternate — no rest between", read literally by somebody with a
  // build-up in front of them, says to alternate the WARM-UP sets with the
  // other exercise. That is not how a superset is run and it is not what the
  // app means. The clause appears only when a member actually ramps, so the
  // common pair keeps its one short line.
  //
  // CALLED, NOT GREPPED, for both halves: the sentence comes from the
  // phrasebook function and the "does this pair ramp?" answer from the
  // shared one, so a check here cannot pass on an expression that is merely
  // present in the file.
  // -------------------------------------------------------------------
  console.log('\n8. The alternation line, when one of the pair ramps')
  {
    check('a pair with no build-up says one thing and stops',
      supersetAlternation([]) === 'alternate — no rest between', supersetAlternation([]))
    const one = supersetAlternation(['A1'])
    check('a pair where A1 ramps still says to alternate', /alternate/.test(one), one)
    check('...and says to ramp A1 before the pairing starts', /ramp A1 first/.test(one), one)
    check('...and names the pairing as what follows', /then start the pairing/.test(one), one)
    const both = supersetAlternation(['A1', 'A2'])
    check('both ramping names both, readably', /ramp A1 and A2 first/.test(both), both)
    // The label is a parameter, not a constant: a B-group pair must not be
    // told to ramp A1.
    check('a B group is told about B1, not A1', /ramp B1 first/.test(supersetAlternation(['B1'])), supersetAlternation(['B1']))

    // WHICH MEMBERS RAMP, answered by the shared function against real
    // exercises rather than hand-built ones.
    // Every day of the generated mesocycle, so the pair below comes from a
    // plan the app actually produced rather than one written here.
    const allDays = mesocycle.flatMap(w => w.days)
    const rampedEx = allDays.flatMap(d => d.exercises).find(e => {
      const r = formatRampSets(e)
      return !!r && r.kind !== 'stale' && r.sets.length > 0
    })
    const plainEx = allDays.flatMap(d => d.exercises).find(e => !formatRampSets(e))
    check('the fixture plan holds a ramped exercise and a plain one to pair',
      !!rampedEx && !!plainEx, { ramped: rampedEx?.name, plain: plainEx?.name })
    const labels = rampedEx && plainEx ? rampedMemberLabels('A', [rampedEx, plainEx]) : null
    check('a pair of (ramped, plain) reports only the ramped member',
      JSON.stringify(labels) === JSON.stringify(['A1']), labels)
    const reversed = rampedEx && plainEx ? rampedMemberLabels('A', [plainEx, rampedEx]) : null
    check('...by POSITION, so reversing the pair moves the label to A2',
      JSON.stringify(reversed) === JSON.stringify(['A2']), reversed)
    check('a pair with no build-up at all reports nothing',
      plainEx ? rampedMemberLabels('A', [plainEx, plainEx]).length === 0 : false)
    // A STALE RAMP NAMES AN EXERCISE THE SLOT NO LONGER HOLDS, so it
    // prescribes nothing — and must not produce a clause telling somebody to
    // ramp a lift that is not there.
    const stale = rampedEx
      ? { ...rampedEx, ramp_up: { ...(rampedEx.ramp_up as object), exercise: 'Something Else' } } as typeof rampedEx
      : null
    check('a stale build-up produces no clause',
      stale ? rampedMemberLabels('A', [stale]).length === 0 : false,
      stale ? formatRampSets(stale)?.kind : null)

    // AND IT REACHES THE SCREEN — both of them, from one function.
    // COMMENTS STRIPPED BEFORE ASSERTING THE SENTENCE IS ABSENT — the
    // standing rule, and this check broke it on its first run: the file's own
    // header explains what the old hard-coded line was, so a note about the
    // removal satisfied the check that it was removed.
    const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const shell = noComments(readFileSync(join(ROOT, 'src/components/exercise/SupersetGroup.tsx'), 'utf8'))
    const peek = noComments(readFileSync(join(ROOT, 'src/components/exercise/ReadOnlyDayList.tsx'), 'utf8'))
    check('the shell renders the phrasebook sentence rather than its own',
      /\{supersetAlternation\(ramped\)\}/.test(shell) && !/alternate — no rest between/.test(shell), shell.match(/.{0,80}alternate.{0,60}/)?.[0])
    check('today\'s card works out which members ramp', /ramped=\{rampedMemberLabels\(/.test(shell))
    check('...and the read-only surfaces call the SAME function, not a copy',
      /rampedMemberLabels\(/.test(peek) && /from '.\/SupersetGroup'/.test(peek))
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll ramp-up-visibility checks passed.')
}

main().catch(err => {
  console.error('Test harness crashed:', err)
  process.exit(1)
})
