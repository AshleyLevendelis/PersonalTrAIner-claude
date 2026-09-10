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

  console.log('\n[4] The ramp can be ticked off on today, and nowhere else (7 Sep 2026)')
  {
    // Ashley, from the gym: "theres no way to log the ramp up weights." Five
    // steps printed with weights and reps, none of them markable, so a warm-up
    // you were three sets into looked exactly like one you had not started.
    //
    // Her ruling once the options were put to her: TICK THEM OFF, do not log
    // them. That distinction is the whole of this section — a tick that
    // quietly became a database row would put warm-up sets into a place every
    // read in this app deliberately filters out.
    const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
    const strip = read('src/components/exercise/RampStrip.tsx')
    const row = read('src/components/exercise/ExerciseRow.tsx')
    const browse = read('src/components/exercise/ReadOnlyDayList.tsx')
    const hook = read('src/hooks/useActiveSession.tsx')

    check('a ramp step is a real control', /onClick=\{\(\) => onToggle!\(s\.setNumber\)\}/.test(strip))
    check('...that says whether it is done', /aria-pressed=\{done\}/.test(strip))
    check('...and says so in words, not only in styling',
      /tap to unmark/.test(strip) && /tap to mark done/.test(strip))

    // IT MUST LOOK TAPPABLE BEFORE IT IS TAPPED. Ashley reported "theres no
    // way to log the ramp up weights" on 7 Sep 2026; this section was written
    // for that fix — and she reported THE SAME SENTENCE on 10 Sep, because an
    // untapped step rendered with the same colour, size and weight as the
    // read-only <span> one branch above. No border, no icon, nothing. The
    // difference only arrived after a tap nobody knew was possible, and the
    // "tap one to mark it done" hint lives in a `title`, which a phone never
    // shows. Everything above this passed the whole time.
    //
    // Pinned on the PROPERTY — an untapped step carries a visible affordance
    // the plain-text branch does not — rather than on a class name, so a
    // restyle moves with it and a deletion fails.
    const untapped = (strip.match(/: '([^']*)'\s*\n?\s*\}`\}/) || [])[1] ?? ''
    check('an UNTAPPED step is drawn as a control, not as text',
      /border-\[/.test(untapped) && /bg-\[/.test(untapped), untapped)
    check('...and carries an icon before it is tapped, not only after',
      /done\s*\n?\s*\?\s*<Check[\s\S]{0,120}:\s*<Circle/.test(strip), null)
    // Scoped to the read-only block itself. A window measured in characters
    // after `if (!interactive)` reached past the closing brace into the
    // interactive branch below and found its <button> — the check failed on
    // its own regex rather than on the code.
    const readOnlyBlock = strip.slice(
      strip.indexOf('if (!interactive)'),
      strip.indexOf('const done =') > strip.indexOf('if (!interactive)')
        ? strip.indexOf('const done =')
        : strip.indexOf('return (', strip.indexOf('if (!interactive)') + 200),
    )
    check('...while the read-only branch stays plain text, so the two are told apart',
      readOnlyBlock.includes('<span') && !readOnlyBlock.includes('<button') && !/border-\[/.test(readOnlyBlock),
      readOnlyBlock.slice(0, 160))

    // NOT A LOG. If a tick ever writes a set, this whole design is wrong —
    // warm-ups are excluded from volume, PRs, progression and history, so the
    // row would be invisible the moment it was written.
    // Comments stripped: the header explaining WHY warm-ups are not logged
    // names is_warmup, and an absence check a comment can fail is no check at
    // all. Third time this file family has learned that lesson.
    const stripCode = strip.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
    check('ticking writes no set, anywhere in the strip',
      !/logSet|saveSet|isWarmup|is_warmup|supabase/.test(stripCode), stripCode.match(/logSet|saveSet|isWarmup|is_warmup|supabase/g))
    check('...and the row hands it a toggle, not a logger',
      /onToggle=\{n => toggleRampTick\(exerciseId, n\)\}/.test(row))

    // IT HAS TO SURVIVE A TAB SWITCH. Component state would drop every tick
    // the moment she glanced at Nutrition, which on a gym floor is the same
    // as not having it. Stored beside the set drafts, date-keyed, so it
    // expires on its own.
    check('a tick outlives a tab switch', /rampTicks\?: Record<string, number\[\]>/.test(read('src/lib/active-session-store.ts')))

    // THE BUG THE BROWSER FOUND, and the reason this check is shaped the way
    // it is. The first version copied the set drafts next door, which read
    // straight from localStorage on every call. Drafts can do that: they live
    // in uncontrolled inputs and need no re-render. A TICK IS THE OPPOSITE —
    // its entire job is to look different afterwards — and a localStorage read
    // gives React nothing to re-render on. The tap wrote through correctly and
    // the strip did not change; the tick only appeared once a tab switch
    // remounted the row. verify:six caught it. This file's earlier check
    // asserted the read came from the record, which is precisely the defect.
    //
    // So both halves are pinned: state for the repaint, record for the reload.
    check('a tick repaints the strip, because it is React state',
      /const \[rampTicks, setRampTicks\] = useState<Record<string, number\[\]>>/.test(hook)
      && /rampTicks\[exerciseId\] \?\? \[\]/.test(hook))
    check('...and is written through, so a reload mid-warm-up still has it',
      /patchRecord\(\{ rampTicks: updated \}\)/.test(hook))
    check('...and is read back out of the record on mount',
      /setRampTicks\(record\?\.rampTicks \?\? \{\}\)/.test(hook))
    check('...and tapping a ticked step unticks it', /current\.includes\(setNumber\)/.test(hook))

    // READ-ONLY SURFACES STAY READ-ONLY. A tick on the program browser would
    // be marking a set on a day that is not today.
    check('browse and peek pass no handler', /<RampStrip ramp=\{ramp\} \/>/.test(browse))
    check('...so those steps render as text rather than dead buttons',
      /const interactive = typeof onToggle === 'function'/.test(strip) && /if \(!interactive\)/.test(strip))
    // The tick is only offered before the working sets start, which is the
    // only time a warm-up is still ahead of you.
    check('...and today only offers it before the first working set is logged',
      /completedSets === 0 && ramp && \(/.test(row))
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
