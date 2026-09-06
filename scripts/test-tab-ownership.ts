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
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const home = read('src/components/Dashboard.tsx')
const nutrition = read('src/components/NutritionDisplay.tsx')
const homeStrip = read('src/components/HomeWeekStrip.tsx')
// THE LIVE Exercise strip. This read WeekStrip.tsx until 30 Aug, which is
// dead code no file imports — so every assertion below was passing against a
// component nobody renders. Exactly the failure the M5 mutation in
// test-no-question-beside-generate was written to catch, reached from a
// direction nothing checked: not a deleted call site, but a call site that
// never existed.
const exStrip = read('src/components/exercise/WeekContextRow.tsx')
const exToday = read('src/components/exercise/TodayPanel.tsx')
const glyphs = read('src/lib/week-glyphs.ts')
const arch = read('docs/VISION-ARCHITECTURE.md')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log("\n1. Home is the day's quick log — and still owns no target\n")
// REVERSED 6 Sep 2026 (design_handoff_app_polish, "Home becomes
// informative"). Home's "Today so far" grid logs water, steps and the
// weigh-in in place. The rule did not change — one fact, one owner — the
// place you tap did: see VISION-ARCHITECTURE §5.1a, which records this as the
// third move steps have made and says why the destination changed and the
// invariant did not.
check('Home logs steps', /logStepsManual/.test(home))
check('...and water', /logWater/.test(home))
check('...and the weigh-in', /WeighInCard/.test(home))
check('...and still READS steps, or the cell would show nothing', /getStepsForDate/.test(home))
// THE HALF THAT KEEPS IT AN OWNERSHIP RULE RATHER THAN A FREE-FOR-ALL. Home
// may log, but it must not invent a target: every one of these still belongs
// to the tab that sets it.
check('Home sets no target of its own',
  !/setWaterTargetMl|setDailyStepTarget|daily_step_target:/.test(home))
check('...and derives the step target from the shared rule, not a second copy',
  /stepsTargetFor/.test(home))
check('the reversal is written down, not just done', /quick log came back to Home/i.test(arch))

// MOVED AGAIN, 6 Sep 2026. Home -> Nutrition -> Exercise -> Home. The checks
// below are the ones that guarded the row on each previous tab, re-pointed at
// the one it now lives on. §5.1a records every move and why the destination
// changed while the rule did not, rather than pretending it never said
// otherwise.
console.log('\n2. Steps are logged in exactly one place\n')
check('...and Home says where the target override lives', /override it in your profile/.test(home))
check('no second step-target setter was invented',
  !/setDailyStepTarget|daily_step_target:/.test(home))
// THE OTHER HALF, and the one that would otherwise let two tabs own it. A
// move that only adds is a copy: the row has to be GONE from the tab it left,
// or two screens log one number and this file's whole premise is broken.
check('Nutrition no longer logs steps', !/logStepsManual/.test(nutrition))
check('Exercise no longer logs steps either', !/logStepsManual|StepsRow/.test(exToday))
check('...and the deleted row is really deleted, not just unmounted',
  !existsSync(join(ROOT, 'src/components/exercise/StepsRow.tsx')))
check('...and no longer draws a step ring of its own', !/STEP_RING/.test(nutrition))
// AN IMPORT IS NOT A RENDER. This block used to assert that StepsRow was both
// imported AND drawn somewhere — added after deleting a `<StepsRow />` call
// site left the import line behind and kept the check green against a tab
// that no longer showed the row. The component is gone now (the input moved
// into Home's Steps cell), so the same lesson is pointed at the thing that
// replaced it: importing logStepsManual proves nothing if no control calls it.
{
  const callsIt = /onClick=\{\(\) => void handleLogSteps\(\)\}/.test(home)
    && /onKeyDown=\{e => \{ if \(e\.key === 'Enter'\) void handleLogSteps\(\) \}\}/.test(home)
  check('Home does not merely import the writer — a control calls it', callsIt)
  check('...from an input the user can actually reach', /setStepsOpen\(true\)/.test(home) && /type="number"/.test(home))
}

console.log('\n3. One glyph vocabulary, two strips\n')
check('the vocabulary has its own module', /export const GLYPH/.test(glyphs))
check('Home imports it rather than copying', /from '@\/lib\/week-glyphs'/.test(homeStrip) && !/const GLYPH\s*[:=]/.test(homeStrip))
check('Exercise imports it too', /from '@\/lib\/week-glyphs'/.test(exStrip) && !/const GLYPH\s*[:=]/.test(exStrip))
// The distinction is the whole point: same marks, different affordance.
check("Home's strip is not interactive — no handler", !/onClick/.test(homeStrip))
check('...and not a button', !/<button/.test(homeStrip))
check("Exercise's strip IS interactive", /onClick/.test(exStrip) && /<button/.test(exStrip))
check('Home cells are 26px, Exercise is not', /h-\[26px\]/.test(homeStrip) && !/h-\[26px\]/.test(exStrip))
check('the spoken label is English, not the raw state',
  /STATE_LABEL\[d\.state\]/.test(exStrip) && !/\$\{d\.state\}/.test(exStrip))

// A COMPONENT NOTHING IMPORTS PROVES NOTHING. The checks above read a file and
// assert what it renders; that is worthless if no screen mounts it. Verified
// for every strip this gate speaks for, so a future extraction cannot be wired
// into a copy again.
for (const rel of ['src/components/exercise/WeekContextRow.tsx', 'src/components/HomeWeekStrip.tsx']) {
  const base = rel.split('/').pop()!.replace('.tsx', '')
  const importers = execSync(
    `grep -rl "from '[^']*${base}'" src/ --include=*.tsx --include=*.ts || true`,
    { cwd: ROOT, encoding: 'utf8' },
  ).split('\n').filter(l => l.trim() && !l.endsWith(rel))
  check(`${base} is actually imported by something`, importers.length > 0, importers)
}

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
