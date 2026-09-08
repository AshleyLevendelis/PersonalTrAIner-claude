/**
 * Gate: a weight nobody lifted must not become data.
 *
 * THE GAP. Until 8 Sep 2026 the set logger had no view on the number at all.
 * The only bound anywhere on the path was SetGrid's 9999.99 — the width of the
 * database column, not a claim about lifting — so a fat-fingered 240 on a 24kg
 * dumbbell was stored, fed the progression engine, moved every future
 * prescription for that lift, and came back as a personal record. The app
 * already checked a stated lift at onboarding (lift-plausibility.ts) and a
 * cardio duration at its store (isPlausibleCardioDuration); the set logger,
 * the one path a trainee touches forty times a session, was unguarded.
 *
 * ASHLEY'S RULING, 8 Sep 2026, from four options: "warn, second tap logs it."
 * So this gate holds two behaviours apart and must keep holding them apart:
 *
 *   REFUSED  — past anything anyone lifts. Never written, by ANY writer, which
 *              is why §1 tests the store rather than the screen.
 *   WARNED   — past what the app believes they can load. Said out loud, and
 *              written on a second tap. The app is not the authority on what
 *              is in somebody's garage; it is only the thing that noticed.
 *
 * §3 is the half that protects the trainee from the fix: a warning on a real
 * set argues with someone about work they actually did.
 */

// --- Environment shims (before any lib module is imported) ------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
/** Comment-stripped source — an absence check a doc comment can satisfy is not a check. */
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const P = (o: Record<string, unknown>) => o as unknown as UserProfile
const BASE = P({ training_experience: 'advanced', gender: 'female', weight_kg: 70 })

async function main() {
  const { checkLoggedSetWeight, isLoggableSetWeight, MAX_LOGGABLE_SET_KG, WARN_ABOVE_CEILING_MULTIPLE } =
    await import('../src/lib/set-plausibility')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const { saveSet } = await import('../src/lib/set-log-store')
  // Read the local queue directly rather than through getSetsForDate, which
  // is async and reaches for Supabase. This is the store's own record of what
  // it accepted — the thing that later flushes to the server — so it is the
  // right place to prove a refusal wrote nothing.
  const queuedWeights = (): number[] =>
    JSON.parse(localStorage.getItem('fitplan_setlog_pending_v1') ?? '[]')
      .filter((op: { kind: string }) => op.kind === 'upsert')
      .map((op: { set: { weightKg: number; addedLoadKg: number | null } }) => op.set.addedLoadKg ?? op.set.weightKg)

  console.log('\n1. The absolute rule lives at the store, where every writer passes\n')

  check('0kg is a real row — a bodyweight set stores exactly that', isLoggableSetWeight(0))
  check(`the ceiling itself passes (${MAX_LOGGABLE_SET_KG}kg)`, isLoggableSetWeight(MAX_LOGGABLE_SET_KG))
  check('one kilo past it does not', !isLoggableSetWeight(MAX_LOGGABLE_SET_KG + 1))
  check('a negative weight is not a weight', !isLoggableSetWeight(-5))
  check('neither is a number that is not one', !isLoggableSetWeight(NaN) && !isLoggableSetWeight(Infinity))

  const day = '2026-09-08'
  const input = (weightKg: number, setNumber: number, addedLoadKg: number | null = null) => ({
    userId: 'gate-profile', date: day, weekNumber: 1, day: 'Monday',
    exerciseId: 'lateral-raises', exerciseName: 'Lateral Raises',
    setNumber, weightKg, repsCompleted: 10, addedLoadKg,
  })

  storeMap.clear()
  check('a real set is written and handed back', saveSet(input(14, 1)) !== null)
  check('900kg is refused', saveSet(input(900, 2)) === null)
  check('...and nothing at all was queued for it', !queuedWeights().includes(900), queuedWeights())
  check('the refusal costs the good row beside it nothing',
    queuedWeights().filter(w => w === 14).length === 1, queuedWeights())
  check('an absurd ADDED load is refused too — a belt is not exempt', saveSet(input(0, 3, 900)) === null)
  check('a real added load still writes', saveSet(input(0, 4, 20)) !== null)
  check('...and the refused belt weight is not in the queue either',
    !queuedWeights().includes(900) && queuedWeights().includes(20), queuedWeights())

  const store = code('src/lib/set-log-store.ts')
  check('the guard is inside saveSet itself, not left to callers',
    /export function saveSet\([\s\S]{0,400}?isLoggableSetWeight\([\s\S]{0,300}?return null/.test(store))

  console.log('\n2. Past what she can load: warned, and told what it is measured against\n')

  const stated24 = P({ ...BASE, max_dumbbell_kg: 24 })
  const lateral = getExerciseEntry('Lateral Raises')
  const bench = getExerciseEntry('Barbell Bench Press')
  check('the catalogue entries this section reasons about exist', !!lateral && !!bench)

  const fatFingered = checkLoggedSetWeight({ weightKg: 240, entry: lateral, profile: stated24 })
  check('240kg against a stated 24kg dumbbell is warned, not stored silently', fatFingered.verdict === 'above_ceiling', fatFingered)
  check('...and the message quotes HER number back, because she is the source of it',
    fatFingered.verdict === 'above_ceiling' && fatFingered.ceilingSource === 'stated' && fatFingered.message.includes('24kg'), fatFingered)
  check('...in the unit the row is logged in — per hand, for a dumbbell pair',
    fatFingered.verdict === 'above_ceiling' && fatFingered.message.includes('per hand'), fatFingered)
  check('...and never names a column, a field or a rule',
    fatFingered.verdict === 'above_ceiling' && !/max_|_kg\b|ceilingKg|verdict/.test(fatFingered.message), fatFingered)

  const noStatement = checkLoggedSetWeight({ weightKg: 80, entry: lateral, profile: BASE })
  check('with nothing stated, the implement itself is still a ceiling (80kg per hand)', noStatement.verdict === 'above_ceiling', noStatement)
  check('...and the message does NOT claim she told us anything',
    noStatement.verdict === 'above_ceiling' && noStatement.ceilingSource === 'table' && !/told me/.test(noStatement.message), noStatement)

  // The lie this guards: effectiveLoadingCeilingKg takes the LOWER of stated
  // and table, so a stated ceiling ABOVE the table is not what anyone is being
  // measured against, and quoting it would misdescribe our own reasoning.
  const statedHigh = checkLoggedSetWeight({ weightKg: 80, entry: lateral, profile: P({ ...BASE, max_dumbbell_kg: 200 }) })
  check('a stated ceiling that is not the binding one is not quoted as if it were',
    statedHigh.verdict === 'above_ceiling' && statedHigh.ceilingSource === 'table', statedHigh)

  const impossible = checkLoggedSetWeight({ weightKg: 900, entry: bench, profile: BASE })
  check('900kg on a barbell is refused outright, not offered a second tap', impossible.verdict === 'impossible', impossible)
  check('an exercise the catalogue has never seen still gets the absolute rule',
    checkLoggedSetWeight({ weightKg: 900, entry: null, profile: BASE }).verdict === 'impossible')
  check('...and no profile means no opinion beyond that',
    checkLoggedSetWeight({ weightKg: 80, entry: lateral, profile: null }).verdict === 'ok')

  console.log('\n3. A warning on a real set is worse than a missed typo — these stay silent\n')

  for (const [label, kg, entryName, profile] of [
    ['an ordinary lateral raise', 12, 'Lateral Raises', BASE],
    ['a borrowed pair one notch over the stated 24kg', 26, 'Lateral Raises', stated24],
    ['exactly the warning boundary, which is not past it', 24 * WARN_ABOVE_CEILING_MULTIPLE, 'Lateral Raises', stated24],
    ['a heavy but real bench', 140, 'Barbell Bench Press', BASE],
    ['a strong leg press, on the one machine that runs past a barbell', 380, 'Leg Press', BASE],
    ['a bodyweight row storing 0kg', 0, 'Push-Ups', BASE],
  ] as const) {
    const entry = getExerciseEntry(entryName)
    const v = checkLoggedSetWeight({ weightKg: kg, entry, profile: profile as UserProfile })
    check(`silent: ${label}`, !!entry && v.verdict === 'ok', { entry: !!entry, v })
  }

  console.log('\n4. The screen asks, and then obeys\n')

  const grid = code('src/components/exercise/SetGrid.tsx')
  const handler = grid.slice(grid.indexOf('const handleSaveSet'), grid.indexOf('const handleDeleteSet'))
  check('the save handler was found', handler.length > 500)
  check('the weight is judged before anything is stored',
    handler.indexOf('checkLoggedSetWeight') > 0 && handler.indexOf('checkLoggedSetWeight') < handler.indexOf('logSet({'))
  check('an impossible weight leaves the handler without logging',
    /verdict === 'impossible'[\s\S]{0,240}?return\b[\s\S]{0,80}?\}/.test(handler), handler.slice(handler.indexOf("'impossible'"), handler.indexOf("'impossible'") + 240))
  check('a warned weight is refused a FIRST tap — the confirm state gates it',
    /verdict === 'above_ceiling' && confirmWeightSet !== setNumber[\s\S]{0,400}?setConfirmWeightSet\(setNumber\)[\s\S]{0,160}?return\b/.test(handler))
  check('the warning says what the second tap will do',
    /Tap ✓ again to log it anyway/.test(grid))
  check('a second tap on the same row does log it — the arm is cleared on the way through',
    /setConfirmWeightSet\(null\)/.test(handler))
  check('editing the weight disarms it: a new number is a new decision',
    /field === 'weight'[\s\S]{0,300}?setConfirmWeightSet\(null\)/.test(grid))
  check('the warning is not dressed as a refusal (amber, not destructive)',
    /rowWarnings\[setNumber\][\s\S]{0,200}?text-amber-600/.test(grid))
  check('the database column width is gone as a stand-in for a lifting bound',
    !/9999\.99/.test(grid))
  check('both SetGrid parents hand it the profile, so Additional Work is not the weak row',
    /profile=\{profile\}/.test(code('src/components/exercise/ExerciseRow.tsx'))
    && /profile=\{profile\}/.test(code('src/components/exercise/AdditionalWorkSection.tsx')))

  console.log('\n5. The coach never claims a set the store refused\n')

  const { executeLogWorkout } = await import('../src/lib/nl-logging-executor')
  const written: number[] = []
  const ctx = {
    profileId: 'gate-profile', date: day, weekNumber: 1, dayName: 'Monday',
    setsFor: () => [],
    logSet: (i: { weightKg: number }) => {
      if (!isLoggableSetWeight(i.weightKg)) return null
      written.push(i.weightKg)
      return {} as never
    },
    declareOffPlan: () => {},
    todaysPlanSetCounts: new Map<string, number>([['Lateral Raises', 3]]),
    todaysPlanLoads: new Map<string, number>(),
  }
  const group = (weightKg: number, count: number) => ({
    matchedRawPhrase: 'lateral raises', resolution: 'exact' as const,
    exerciseId: 'lateral-raises', exerciseName: 'Lateral Raises',
    sets: Array.from({ length: count }, (_, i) => ({ setNumber: i + 1, reps: 10, weightKg, isBodyweight: false })),
  })

  written.length = 0
  const refused = executeLogWorkout([group(900, 3)], ctx)
  check('three refused sets are counted as none', refused.totalSets === 0 && written.length === 0, refused)
  check('...and undo is offered nothing to put back', refused.loggedKeys.length === 0, refused.loggedKeys)
  check('...and the receipt says so instead of listing sets that do not exist',
    refused.rows.length === 1 && !/3 ×/.test(refused.rows[0].detail) && /past anything I can record/.test(refused.rows[0].note ?? ''),
    refused.rows)

  written.length = 0
  const ok = executeLogWorkout([group(14, 3)], ctx)
  check('a real log is untouched by any of this', ok.totalSets === 3 && /3 × 10 @ 14kg/.test(ok.rows[0].detail), ok.rows)

  const exec = code('src/lib/nl-logging-executor.ts')
  check('the receipt counts what the store took, not what was parsed',
    /writtenSets/.test(exec) && !/\$\{group\.sets\.length\} × /.test(exec))

  console.log(failures === 0 ? '\nAll set-plausibility checks pass.\n' : `\n${failures} FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
