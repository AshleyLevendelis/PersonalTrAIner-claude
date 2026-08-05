/**
 * P1 gate — session-derive.ts pure functions.
 *
 * filterLoggableSets is the sole source LAYOUT-DESIGN.md §5.2 designates for
 * checkmarks/counts/completion/off-plan detection. This asserts its filter
 * rules directly, without a store or a component: id-match (with a
 * name-fallback for legacy rows), warm-up exclusion, malformed-zero-weight
 * exclusion.
 */
import {
  filterLoggableSets,
  formatRampSets,
  groupExercises,
  resolveCalibrationAnchorIndex,
  computeSetRowNumbers,
  nextExtraSetNumber,
  computeOffPlanWork,
  normalizeWarmup,
} from '../src/lib/session-derive'
import { getExerciseId } from '../src/lib/exercise-db'
import type { Exercise, ExerciseSetLog } from '../src/lib/types'
import type { RampBlock } from '../src/lib/warmup'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function makeLog(overrides: Partial<ExerciseSetLog>): ExerciseSetLog {
  return {
    user_id: 'u1',
    date: '2026-01-05',
    exercise_name: 'Barbell Bench Press',
    exercise_id: 'barbell-bench-press',
    set_number: 1,
    weight_kg: 60,
    reps_completed: 8,
    is_bodyweight: false,
    ...overrides,
  }
}

function main() {
  console.log('[1] id-match includes only the target exercise')
  const logs: ExerciseSetLog[] = [
    makeLog({ set_number: 1 }),
    makeLog({ set_number: 2 }),
    makeLog({ exercise_name: 'Incline DB Press', exercise_id: 'incline-db-press', set_number: 1 }),
  ]
  const bench = filterLoggableSets(logs, 'barbell-bench-press')
  check('returns exactly the 2 bench rows', bench.length === 2, bench)

  console.log('\n[2] warm-up rows are excluded')
  const withWarmup: ExerciseSetLog[] = [
    makeLog({ set_number: 1 }),
    makeLog({ set_number: 2, is_warmup: true }),
  ]
  const filtered = filterLoggableSets(withWarmup, 'barbell-bench-press')
  check('warm-up row dropped, 1 remains', filtered.length === 1 && filtered[0].set_number === 1, filtered)

  console.log('\n[3] malformed zero-weight rows are excluded')
  const withMalformed: ExerciseSetLog[] = [
    makeLog({ set_number: 1 }),
    makeLog({ set_number: 2, weight_kg: 0, is_bodyweight: false }),
  ]
  const filtered2 = filterLoggableSets(withMalformed, 'barbell-bench-press')
  check('malformed row dropped, 1 remains', filtered2.length === 1 && filtered2[0].set_number === 1, filtered2)

  console.log('\n[4] legitimate bodyweight zero-weight rows are kept')
  const withBodyweight: ExerciseSetLog[] = [
    makeLog({ exercise_name: 'Pull-Ups', exercise_id: 'pull-ups', set_number: 1, weight_kg: 0, is_bodyweight: true }),
  ]
  const filtered3 = filterLoggableSets(withBodyweight, 'pull-ups')
  check('bodyweight row kept', filtered3.length === 1, filtered3)

  console.log('\n[5] legacy rows with no exercise_id fall back to name match')
  const legacy: ExerciseSetLog[] = [
    { user_id: 'u1', date: '2026-01-05', exercise_name: 'Barbell Bench Press', set_number: 1, weight_kg: 60, reps_completed: 8, is_bodyweight: false },
  ]
  const filtered4 = filterLoggableSets(legacy, 'some-id-the-row-never-had', 'Barbell Bench Press')
  check('legacy row matched by name', filtered4.length === 1, filtered4)

  const legacyMiss = filterLoggableSets(legacy, 'some-id-the-row-never-had', 'Different Exercise')
  check('legacy row does not match a different name', legacyMiss.length === 0, legacyMiss)

  console.log('\n[6] formatRampSets: kg variant for an externally-loaded exercise')
  function makeRamp(exerciseName: string): RampBlock {
    return {
      exercise: exerciseName,
      abbreviated: false,
      loadSource: 'estimate',
      sets: [
        { set_number: 1, load_percent: 0, reps: 10, note: '' },
        { set_number: 2, load_percent: 50, reps: 5, note: '' },
        { set_number: 3, load_percent: 70, reps: 3, note: '' },
      ],
    }
  }
  const benchEx: Exercise = {
    name: 'Barbell Bench Press', sets: 3, reps: '8-11', rest: '90s',
    suggested_load_kg: 60, ramp_up: makeRamp('Barbell Bench Press'),
  }
  const kgRamp = formatRampSets(benchEx)
  check('kg variant returned', kgRamp?.kind === 'kg', kgRamp)
  if (kgRamp?.kind === 'kg') {
    check('3 ramp steps present', kgRamp.sets.length === 3, kgRamp.sets)
    check('set 1 (0%) floors at the equipment minimum, never 0kg', kgRamp.sets[0].kg > 0, kgRamp.sets[0])
  }

  console.log('\n[7] formatRampSets: rep-only variant for a bodyweight compound')
  const pullUpEx: Exercise = {
    name: 'Pull-Ups', sets: 3, reps: '8-11', rest: '90s',
    suggested_load_kg: null, ramp_up: makeRamp('Pull-Ups'),
  }
  const bwRamp = formatRampSets(pullUpEx)
  check('bodyweight variant returned (not null)', bwRamp?.kind === 'bodyweight', bwRamp)
  if (bwRamp?.kind === 'bodyweight') {
    check('reps preserved, no kg field implied', bwRamp.sets.length === 3, bwRamp.sets)
  }

  console.log('\n[8] formatRampSets: stale-name fallback')
  const staleEx: Exercise = {
    name: 'Incline Barbell Bench Press', sets: 3, reps: '8-11', rest: '90s',
    suggested_load_kg: 60, ramp_up: makeRamp('Barbell Bench Press'), // named for a DIFFERENT exercise
  }
  const staleRamp = formatRampSets(staleEx)
  check('stale ramp yields the stale marker, not null', staleRamp?.kind === 'stale', staleRamp)

  console.log('\n[9] formatRampSets: no ramp_up at all returns null')
  const noRampEx: Exercise = { name: 'Barbell Bench Press', sets: 3, reps: '8-11', rest: '90s' }
  check('null when ramp_up is absent', formatRampSets(noRampEx) === null)

  console.log('\n[10] groupExercises: superset exIndex round-trip')
  const dayExercises: Exercise[] = [
    { name: 'Barbell Squats', sets: 3, reps: '8-11', rest: '90s' },
    { name: 'Incline DB Press', sets: 3, reps: '10', rest: 'alternate', superset_label: 'A1' },
    { name: 'Chest-Supported Row', sets: 3, reps: '10', rest: '60s', superset_label: 'A2' },
    { name: 'Plank', sets: 3, reps: 'Hold', rest: '20s' },
  ]
  const groups = groupExercises(dayExercises)
  check('4 exercises collapse to 3 groups (1 single + 1 superset + 1 single)', groups.length === 3, groups)
  const flatIndices = groups.flatMap(g => g.kind === 'single' ? [g.exIndex] : g.members.map(m => m.exIndex)).sort((a, b) => a - b)
  check('every original exIndex round-trips exactly once', JSON.stringify(flatIndices) === JSON.stringify([0, 1, 2, 3]), flatIndices)
  const supersetGroup = groups.find(g => g.kind === 'superset')
  check('superset group orders A1 before A2', supersetGroup?.kind === 'superset' && supersetGroup.members[0].ex.superset_label === 'A1', supersetGroup)

  console.log('\n[11] calibration anchor: prefers the first estimate row')
  const calDay: Exercise[] = [
    { name: 'Pull-Ups', sets: 3, reps: '8-11', rest: '90s' }, // bodyweight, no load
    { name: 'Barbell Squats', sets: 3, reps: '8-11', rest: '90s', suggested_load_kg: 60, load_source: 'known_weight' },
    { name: 'Barbell Bench Press', sets: 3, reps: '8-11', rest: '90s', suggested_load_kg: 40, load_source: 'estimate' },
  ]
  check('anchors to the estimate row (index 2), not the known_weight row', resolveCalibrationAnchorIndex(calDay) === 2, resolveCalibrationAnchorIndex(calDay))

  console.log('\n[12] calibration anchor: falls back to any loaded row when no estimate exists')
  const calDayKnownOnly: Exercise[] = [
    { name: 'Pull-Ups', sets: 3, reps: '8-11', rest: '90s' },
    { name: 'Barbell Squats', sets: 3, reps: '8-11', rest: '90s', suggested_load_kg: 60, load_source: 'known_weight' },
  ]
  check('anchors to the known_weight row (index 1)', resolveCalibrationAnchorIndex(calDayKnownOnly) === 1)

  console.log('\n[13] calibration anchor: falls back to row 0 on an all-bodyweight day')
  const calDayBodyweightOnly: Exercise[] = [
    { name: 'Pull-Ups', sets: 3, reps: '8-11', rest: '90s' },
    { name: 'Push-Ups', sets: 3, reps: '11-15', rest: '60s' },
  ]
  check('anchors to row 0', resolveCalibrationAnchorIndex(calDayBodyweightOnly) === 0)
  check('empty day anchors to null', resolveCalibrationAnchorIndex([]) === null)

  console.log('\n[14] set-row numbering: gap semantics (log 1-4, remove 2, add -> 5)')
  const rowList = computeSetRowNumbers(3, [1, 3, 4], [4], [2])
  check('rowList is [1,3,4] — set 2 does not reappear', JSON.stringify(rowList) === JSON.stringify([1, 3, 4]), rowList)
  const nextNum = nextExtraSetNumber(3, [1, 3, 4], [4])
  check('next extra set number is 5, never reusing removed 2', nextNum === 5, nextNum)

  console.log('\n[15] set-row numbering: fresh exercise shows its prescribed baseline')
  const freshRows = computeSetRowNumbers(3, [], [])
  check('fresh 3-set exercise renders rows [1,2,3]', JSON.stringify(freshRows) === JSON.stringify([1, 2, 3]), freshRows)

  console.log('\n[16] offPlanWork: includes a chat-logged (detected) fixture alongside a declared one')
  const plannedIds = new Set([getExerciseId('Barbell Bench Press')])
  const chatLoggedLog: ExerciseSetLog = {
    user_id: 'u1', date: '2026-01-05', exercise_name: 'Face Pulls',
    exercise_id: getExerciseId('Face Pulls'), set_number: 1, weight_kg: 15, reps_completed: 15, is_bodyweight: false,
  }
  const offPlan = computeOffPlanWork(['Farmers Carry'], [chatLoggedLog], plannedIds, getExerciseId)
  check('2 off-plan items found', offPlan.length === 2, offPlan)
  check('declared item present with source=declared', offPlan.some(i => i.name === 'Farmers Carry' && i.source === 'declared'), offPlan)
  check('chat-logged item present with source=logged', offPlan.some(i => i.name === 'Face Pulls' && i.source === 'logged'), offPlan)
  const offPlanNoPlanted = computeOffPlanWork([], [
    { ...chatLoggedLog, exercise_id: getExerciseId('Barbell Bench Press'), exercise_name: 'Barbell Bench Press' },
  ], plannedIds, getExerciseId)
  check('a planned exercise\'s log is never treated as off-plan', offPlanNoPlanted.length === 0, offPlanNoPlanted)

  // ---- normalizeWarmup: legacy/partial warmup shapes never throw (cleanup round, defect 1) --
  console.log('\n[17] normalizeWarmup degrades legacy/partial warmup shapes instead of crashing')
  check('undefined warmup -> null', normalizeWarmup(undefined) === null)
  check('null warmup -> null', normalizeWarmup(null) === null)
  // The actual live-DB legacy shape (672 rows found in the cleanup-round
  // audit): a mesocycle_weeks row written before ramp_ups existed on
  // WarmupBlock. general/mobility/total_seconds/coach_note are all present
  // and well-formed — this shape never crashed WarmupSection (it never reads
  // ramp_ups), but is the concrete evidence that this JSON drifts over time.
  const missingRampUps = {
    general: [{ name: 'Bike', prescription: '5 min', purpose: 'raise temp', duration_seconds: 300 }],
    mobility: [{ name: 'Cat-Cow', prescription: '10 reps', purpose: 'spine mobility', duration_seconds: 45 }],
    total_seconds: 345,
    coach_note: 'No loaded ramp-up needed today.',
    // ramp_ups intentionally absent
  } as unknown as Parameters<typeof normalizeWarmup>[0]
  const normalizedMissingRampUps = normalizeWarmup(missingRampUps)
  check('a warmup missing ramp_ups (the real legacy shape) still renders general/mobility',
    normalizedMissingRampUps?.general.length === 1 && normalizedMissingRampUps?.mobility.length === 1, normalizedMissingRampUps)
  check('total_seconds converts to minutes correctly', normalizedMissingRampUps?.totalMinutes === 6, normalizedMissingRampUps)

  // A hypothetically older shape than anything currently live: general/mobility
  // themselves missing or null (pre-dates the WarmupBlock array fields
  // entirely, or hand-edited data). Must degrade to empty arrays, not throw.
  const noGeneralMobility = { total_seconds: 120, coach_note: 'Ease into it.' } as unknown as Parameters<typeof normalizeWarmup>[0]
  const normalizedNoGM = normalizeWarmup(noGeneralMobility)
  check('warmup missing general/mobility entirely renders as empty arrays, not a throw',
    normalizedNoGM?.general.length === 0 && normalizedNoGM?.mobility.length === 0 && normalizedNoGM?.coachNote === 'Ease into it.', normalizedNoGM)

  const nullGeneralMobility = { general: null, mobility: null, total_seconds: 'not-a-number', coach_note: null } as unknown as Parameters<typeof normalizeWarmup>[0]
  const normalizedNullGM = normalizeWarmup(nullGeneralMobility)
  check('warmup with null general/mobility and a non-numeric total_seconds renders as empty, 0 minutes, no crash',
    normalizedNullGM === null, normalizedNullGM) // nothing renderable (no items, no coach note) -> null, same as !warmup

  // A day with genuinely nothing to show (e.g. a rest day's warmup: null) must still return null.
  const emptyButPresent = { general: [], mobility: [], total_seconds: 0, coach_note: '' } as unknown as Parameters<typeof normalizeWarmup>[0]
  check('an empty-but-present warmup (nothing to show) also returns null', normalizeWarmup(emptyButPresent) === null)

  // ---- formatRampSets: a legacy/malformed ramp_up.sets never throw --------
  console.log('\n[18] formatRampSets degrades a legacy/malformed ramp_up.sets instead of crashing')
  const exWithBadRampSets: Exercise = {
    id: getExerciseId('Barbell Bench Press'), name: 'Barbell Bench Press', sets: 3, reps: '8-10', rest: '90s',
    substitution: '', suggested_load_kg: 60,
    ramp_up: { exercise: 'Barbell Bench Press', sets: undefined as unknown as RampBlock['sets'], abbreviated: false },
  }
  check('ramp_up.sets not an array -> null, not a throw', formatRampSets(exWithBadRampSets) === null)

  const exWithEmptyRampSets: Exercise = { ...exWithBadRampSets, ramp_up: { exercise: 'Barbell Bench Press', sets: [], abbreviated: false } }
  check('ramp_up.sets an empty array -> null (nothing to show)', formatRampSets(exWithEmptyRampSets) === null)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll session-derive checks passed.')
}

main()
