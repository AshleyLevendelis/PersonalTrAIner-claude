/**
 * Combined fix #1+#2 gate — interval/steady-state prescription differentiation.
 *
 * Covers the three pieces of the live bug report: fixedUnitPrescription no
 * longer returns one hardcoded literal for every 'intervals' exercise
 * (differentiated by bodyweight vs machine equipment), steady-state cardio
 * (Elliptical) gets its own type sized to session length rather than a flat
 * 20 minutes, and the per-week duration step no longer borrows
 * phaseConfig.rep_shift (the "33s" bug) — work and rest step together so the
 * ratio holds. Also proves the near-miss Ashley caught before it shipped:
 * estimateSlotsSeconds must actually COUNT a steady-state slot's real
 * duration, not silently default it to ~30s.
 */
import { fixedUnitPrescription } from '../src/lib/exercise-plan'
import { stepIntervalSeconds } from '../src/lib/periodization'
import { estimateSlotsSeconds, getSteadyStateSeconds } from '../src/lib/session-duration'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'

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
  const e = EXERCISE_DATABASE.find(x => x.name === name)
  if (!e) throw new Error(`fixture exercise not found: ${name}`)
  return e
}

function main() {
  const burpees = findEntry('Burpees')
  const mountainClimbers = findEntry('Mountain Climbers')
  const jumpRope = findEntry('Jump Rope')
  const battleRopes = findEntry('Battle Ropes')
  const treadmill = findEntry('Treadmill Intervals')
  const cycling = findEntry('Cycling Intervals')
  const rowing = findEntry('Rowing Machine')
  const elliptical = findEntry('Elliptical')

  console.log('[1] fixedUnitPrescription differentiates by category, not one literal for every "intervals" exercise')
  const burpeesRx = fixedUnitPrescription(burpees)
  const mcRx = fixedUnitPrescription(mountainClimbers)
  const cyclingRx = fixedUnitPrescription(cycling)
  const rowingRx = fixedUnitPrescription(rowing)
  const treadmillRx = fixedUnitPrescription(treadmill)
  check('Burpees and Mountain Climbers (both bodyweight) get the same bodyweight-HIIT base', burpeesRx?.reps === mcRx?.reps && burpeesRx?.rest === mcRx?.rest, { burpeesRx, mcRx })
  check('Cycling Intervals, Rowing Machine and Treadmill Intervals (all machines) get the same machine-interval base', cyclingRx?.reps === rowingRx?.reps && rowingRx?.reps === treadmillRx?.reps, { cyclingRx, rowingRx, treadmillRx })
  check('bodyweight-HIIT base differs from machine-interval base — the actual bug being fixed', burpeesRx?.reps !== cyclingRx?.reps, { burpeesRx, cyclingRx })

  // The regression this exact test caught before shipping: Jump Rope and
  // Battle Ropes are equipment: ['jump rope']/['battle ropes'], NOT
  // ['bodyweight'] — an equipment.includes('bodyweight') check silently
  // dropped both into the machine-interval bucket despite being bodyweight-
  // adjacent HIIT work by nature. Classification is keyed off the actual
  // cardio-machine equipment set instead, so anything that isn't a named
  // machine defaults to bodyweight-HIIT.
  const jumpRopeRx = fixedUnitPrescription(jumpRope)
  const battleRopesRx = fixedUnitPrescription(battleRopes)
  check('Jump Rope classifies as bodyweight-HIIT, not machine-interval', jumpRopeRx?.reps === burpeesRx?.reps, { jumpRopeRx, burpeesRx })
  check('Battle Ropes classifies as bodyweight-HIIT, not machine-interval', battleRopesRx?.reps === burpeesRx?.reps, { battleRopesRx, burpeesRx })
  check('bodyweight-HIIT rest equals work (equal-or-longer rest framing)', burpeesRx?.reps === burpeesRx?.rest, burpeesRx)
  check('machine-interval rest is a real recovery period, shorter than work but substantial', cyclingRx != null && cyclingRx.restSeconds < parseInt(cyclingRx.reps, 10) && cyclingRx.restSeconds >= 30, cyclingRx)

  console.log('[2] steady_state (Elliptical) sizes to session_duration_preference instead of a flat 20min')
  const tiers: Array<['30-45' | '45-60' | '60-90' | '90+', number]> = [
    ['30-45', 900], ['45-60', 1200], ['60-90', 1800], ['90+', 2100],
  ]
  for (const [pref, expectedSeconds] of tiers) {
    const rx = fixedUnitPrescription(elliptical, pref)
    check(`${pref} -> ${expectedSeconds}s`, rx?.reps === `${expectedSeconds}s` && rx.sets === 1 && rx.restSeconds === 0, rx)
    check(`getSteadyStateSeconds(${pref}) matches`, getSteadyStateSeconds(pref) === expectedSeconds)
  }
  check('no preference falls back to 45-60 (1200s)', fixedUnitPrescription(elliptical)?.reps === '1200s', fixedUnitPrescription(elliptical))

  console.log('[3] estimateSlotsSeconds actually counts a steady-state slot — the near-miss caught before shipping')
  const steadyStateSlotSeconds = estimateSlotsSeconds([
    { entry: elliptical, sets: 1, reps: '1200s', restSeconds: 0 },
  ])
  check(
    'a 1200s Elliptical slot estimates near 1200s, not a ~30-35s flat default',
    steadyStateSlotSeconds > 1000,
    { steadyStateSlotSeconds }
  )

  console.log('[4] stepIntervalSeconds — work and rest step together, ratio holds, deload flat')
  check('week 1 = base', stepIntervalSeconds(45, 1, false) === 45)
  check('week 2 = base + 5', stepIntervalSeconds(45, 2, false) === 50)
  check('week 3 = base + 10', stepIntervalSeconds(45, 3, false) === 55)
  check('deload holds at base regardless of week', stepIntervalSeconds(45, 3, true) === 45)
  const machineWork = [1, 2, 3].map(w => stepIntervalSeconds(45, w, false))
  const machineRest = [1, 2, 3].map(w => stepIntervalSeconds(40, w, false))
  const ratios = machineWork.map((w, i) => w / machineRest[i])
  check(
    'machine-interval work:rest ratio stays effectively constant across the block (not 1.13 -> 1.38)',
    Math.max(...ratios) - Math.min(...ratios) < 0.05,
    { machineWork, machineRest, ratios }
  )
  const bodyweightWork = [1, 2, 3].map(w => stepIntervalSeconds(30, w, false))
  const bodyweightRest = [1, 2, 3].map(w => stepIntervalSeconds(30, w, false))
  check('bodyweight-HIIT stays exactly 1:1 every week', bodyweightWork.every((w, i) => w === bodyweightRest[i]), { bodyweightWork, bodyweightRest })

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
