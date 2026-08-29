/**
 * Gate: one fact, one owner.
 *
 * VISION-ARCHITECTURE §5.1a now states the rule — Nutrition owns what you
 * accumulate through the day, Exercise owns the program and the session,
 * Tools owns nothing, Home owns the progress facts and points at everything
 * else. A rule in a document is a wish; this is the part that holds.
 *
 * The failure class it exists for is already in PROJECT-LOG: "Dashboard and
 * the Exercise tab disagree about…". Two surfaces showing one number, each
 * computing it its own way, drift silently and are found by a user.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const home = read('src/components/Dashboard.tsx')
const nutrition = read('src/components/NutritionDisplay.tsx')
const homeStrip = read('src/components/HomeWeekStrip.tsx')
const exStrip = read('src/components/exercise/WeekStrip.tsx')
const glyphs = read('src/lib/week-glyphs.ts')
const arch = read('docs/VISION-ARCHITECTURE.md')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log('\n1. Home reads and points; it does not log (except the weigh-in)\n')
check('Home no longer writes steps', !/logStepsManual/.test(home))
check('...and still READS them, or its tile would point at nothing', /getStepsForDate/.test(home))
check('Home keeps the weigh-in — the one documented exception', /WeighInCard/.test(home))
check('the exception is written down, not just done',
  /owns no number, with exactly one exception/i.test(arch) && /weigh-in/i.test(arch))

console.log('\n2. Steps moved to Nutrition, target rule unchanged\n')
check('Nutrition logs steps', /logStepsManual/.test(nutrition))
check('...deriving the target from the shared rule, not a second copy',
  /stepsTargetFor/.test(nutrition) && !/daily_step_target\s*\?\?/.test(nutrition))
check('...and says where the override lives', /override it in your profile/.test(nutrition))
check('no second step-target setter was invented',
  !/setDailyStepTarget|daily_step_target:/.test(nutrition))

console.log('\n3. One glyph vocabulary, two strips\n')
check('the vocabulary has its own module', /export const GLYPH/.test(glyphs))
check('Home imports it rather than copying', /from '@\/lib\/week-glyphs'/.test(homeStrip) && !/const GLYPH\s*[:=]/.test(homeStrip))
check('Exercise imports it too', /from '@\/lib\/week-glyphs'/.test(exStrip) && !/const GLYPH\s*[:=]/.test(exStrip))
// The distinction is the whole point: same marks, different affordance.
check("Home's strip is not interactive — no handler", !/onClick/.test(homeStrip))
check('...and not a button', !/<button/.test(homeStrip))
check("Exercise's strip IS interactive", /onClick/.test(exStrip) && /<button/.test(exStrip))
check('Home cells are 26px, Exercise is not', /h-\[26px\]/.test(homeStrip) && !/h-\[26px\]/.test(exStrip))

console.log('\n4. Water is one colour everywhere — status never follows the accent\n')
check('Home draws water in --chart-3, not the mint accent', /--chart-3/.test(home))
check('Nutrition already did', /--chart-3/.test(nutrition))

console.log('\n5. Home derives session state, never re-implements it\n')
// Home shows a status label and a CTA word; both must come from the one
// status value, not from a second reading of the logs.
check('Home reads session.status rather than counting logs itself',
  /data\.session\.status/.test(home) && !/workout_sessions/.test(home))
check('the CTA word is derived from that same status',
  /status === 'not_started' \? 'Start session' : 'Continue session'/.test(home))

console.log('\n6. The rule is written down where the next person will look\n')
check('§5.1a exists', /5\.1a Cross-tab ownership/.test(arch))
check('...and names all four tabs', ['Nutrition', 'Exercise', 'Tools', 'Home'].every(t => new RegExp(`\\*\\*${t}\\*\\* owns`).test(arch)))
check('...and states the derive-from-one-value rule',
  /derive it from one value/i.test(arch))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nOne fact, one owner.\n')
