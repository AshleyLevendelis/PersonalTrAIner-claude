// ---------------------------------------------------------------------------
// test:main-lift-label — A HOLD IS NEVER THE MAIN LIFT (runs 3-4, M38, 10 Oct
// 2026). Swapping the main lift away left the day without a tier-1, and the
// promotion then picked the best-ranked thing left, which could be a timed
// hold: a plank or a wall sit labelled MAIN LIFT. Decided as a CSCS coach: the
// main lift is the movement progressed by load and reps; no main lift beats a
// wrong one. The screen label and the engine's rest floor share the rule.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { dayAnchorExercise, canAnchor, anchorScore } from '../src/lib/session-derive'
import type { Exercise } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const row = (name: string): Exercise => ({ name, sets: 3, reps: '8-10' } as unknown as Exercise)

// The case that bit: a hold that OUTRANKS a reps movement on the same day.
const holds = EXERCISE_DATABASE.filter(e => e.prescription_type === 'time' && e.mechanics_tier !== 'primer')
const reps = EXERCISE_DATABASE.filter(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer' && e.mechanics_tier !== 'tier1_compound' && e.mechanics_tier !== 'cardio')
const hold = holds.sort((a, b) => anchorScore(b.mechanics_tier, b.name) - anchorScore(a.mechanics_tier, a.name))[0]
const weaker = reps.filter(e => anchorScore(e.mechanics_tier, e.name) > 0 && anchorScore(e.mechanics_tier, e.name) < anchorScore(hold.mechanics_tier, hold.name))[0]

console.log(`\n(fixture: ${hold?.name} (${hold?.mechanics_tier}, timed) beside ${weaker?.name} (${weaker?.mechanics_tier}, reps))`)
check('the fixture has a hold that outranks a reps movement (so the case is real)', !!hold && !!weaker)
const anchor = dayAnchorExercise([row(hold.name), row(weaker.name)])
check('the reps movement is the main lift, not the hold', anchor?.name === weaker.name, anchor?.name)
check('a day of holds alone has no main lift', dayAnchorExercise(holds.slice(0, 3).map(e => row(e.name))) === undefined)
check('carries and intervals cannot anchor either', EXERCISE_DATABASE.filter(e => e.prescription_type === 'distance_load' || e.prescription_type === 'intervals').every(e => !canAnchor(e)))
check('a reps movement can', reps.every(e => canAnchor(e)))

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const engine = strip(readFileSync(join(ROOT, 'src/lib/exercise-plan.ts'), 'utf8'))
const promoted = engine.slice(engine.indexOf('const promotedIdx = (() => {'), engine.indexOf('const promotedIdx = (() => {') + 600)
check('the engine\'s rest floor promotes by the same rule', promoted.length > 100 && /if \(!canAnchor\(dayExercises\[i\]\.entry\)\) continue/.test(promoted))

console.log(`\nmain-lift-label: ${ran} checks ran`)
console.log(failures === 0 ? 'All main-lift-label checks passed.\n' : `${failures} main-lift-label check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
