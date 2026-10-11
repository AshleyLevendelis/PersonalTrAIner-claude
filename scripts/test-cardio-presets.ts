/**
 * The quick-pick cardio options are ones the person's kit can do.
 *
 * Test log L14, 9 Oct 2026: a tester training at home with dumbbells was
 * offered "Incline walk · Heavy bag · HIIT bike · Zone 2". The list was a
 * constant in a component that took no profile.
 *
 * WHAT THIS HOLDS: no tier but Full gym is offered an option that names a
 * machine or a bag; every tier still gets four, spread easy / steady / hard;
 * the Full gym list is byte-for-byte what it was (the activity string is what
 * the log records and what the duration memory is keyed on); the sheet really
 * asks, and both screens that open it tell it the tier. And what it does NOT
 * change: the 1,440-minute bound on a logged session, which is deliberate —
 * "the point past which the number is certainly a typo".
 *
 * It cannot prove the chips are DRAWN — verify:cardio-presets drives the real
 * sheet for that.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { cardioPresetsFor } from '../src/lib/cardio-presets'
import { MAX_PLAUSIBLE_CARDIO_MINUTES } from '../src/lib/cardio-log-store'
import type { EquipmentAccess } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}

// Anything that names a piece of cardio kit a home trainee has not been
// promised. Deliberately broad: a new preset called "Rower" must fail here.
const NEEDS_KIT = /treadmill|incline|bike|cycl|spin|assault|bag|row(er|ing)|ellipt|cross.?trainer|stair|ski.?erg|sled|rope|pool|swim/i
const TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']

console.log('\n[1] Nobody outside a full gym is offered a machine or a bag')
for (const tier of TIERS) {
  const picks = cardioPresetsFor(tier)
  const needing = picks.filter(p => NEEDS_KIT.test(`${p.label} ${p.activity}`)).map(p => p.label)
  if (tier === 'full_gym') check('the detector has teeth: the full-gym list DOES name kit', needing.length >= 3, needing)
  else check(`${tier}: no option names kit the tier does not promise`, needing.length === 0, needing)
}
const unknown = cardioPresetsFor(undefined)
check('an unknown tier gets the no-kit list, never the gym one', unknown.every(p => !NEEDS_KIT.test(`${p.label} ${p.activity}`)) && unknown.length === 4, unknown.map(p => p.label))
check('...and so does null', JSON.stringify(cardioPresetsFor(null)) === JSON.stringify(unknown))

console.log('\n[2] Every tier still gets a real choice')
for (const tier of TIERS) {
  const picks = cardioPresetsFor(tier)
  check(`${tier}: four options (the row is laid out for four plus "Other")`, picks.length === 4, picks.length)
  check(`${tier}: an easy one, a steady one and a hard one`, picks.some(p => p.rpe <= 4) && picks.some(p => p.rpe >= 5 && p.rpe <= 6) && picks.some(p => p.rpe >= 7), picks.map(p => p.rpe))
  check(`${tier}: labels are distinct, short enough for a chip, and every one has minutes`, new Set(picks.map(p => p.label)).size === 4 && picks.every(p => p.label.length <= 12 && p.minutes >= 5 && p.minutes <= 60 && p.activity.trim().length > 0), picks.map(p => `${p.label}/${p.minutes}`))
}
check('Zone 2 is offered to everyone, logged under the same name — it needs no kit', TIERS.every(t => cardioPresetsFor(t).some(p => p.activity === 'Zone 2 Cardio' && p.rpe === 5 && p.minutes === 15)))

console.log('\n[3] The full-gym list is exactly what it was')
check('labels, logged names, minutes and efforts are unchanged',
  JSON.stringify(cardioPresetsFor('full_gym')) === JSON.stringify([
    { label: 'Incline walk', activity: 'Incline Treadmill Walk', minutes: 15, rpe: 4 },
    { label: 'Heavy bag', activity: 'Heavy Bag / Functional Circuit', minutes: 15, rpe: 7 },
    { label: 'HIIT bike', activity: 'HIIT / Assault Bike', minutes: 10, rpe: 8 },
    { label: 'Zone 2', activity: 'Zone 2 Cardio', minutes: 15, rpe: 5 },
  ]), cardioPresetsFor('full_gym'))

// The no-kit list, pinned the same way — so that changing a name, a duration
// or an effort is a deliberate act with this line in the diff.
check('the no-kit list is exactly what was decided',
  JSON.stringify(cardioPresetsFor('minimalist')) === JSON.stringify([
    { label: 'Brisk walk', activity: 'Brisk Walk', minutes: 20, rpe: 4 },
    { label: 'Run', activity: 'Run', minutes: 15, rpe: 6 },
    { label: 'Circuit', activity: 'Bodyweight Circuit', minutes: 10, rpe: 7 },
    { label: 'Zone 2', activity: 'Zone 2 Cardio', minutes: 15, rpe: 5 },
  ]), cardioPresetsFor('minimalist'))
check('...and is the same for every tier that is not a full gym',
  ['home_gym', 'minimalist', 'bodyweight'].every(t => JSON.stringify(cardioPresetsFor(t as EquipmentAccess)) === JSON.stringify(cardioPresetsFor('minimalist'))))

console.log('\n[4] The sheet asks, and the screens that open it tell it the tier')
const sheet = code('src/components/exercise/AddUnplannedWork.tsx')
check('the sheet takes its options from the kit tier', /picks=\{cardioPresetsFor\(equipmentAccess\)\}/.test(sheet))
check('...and holds no list of its own any more', !/Incline Treadmill Walk|Heavy Bag|Assault Bike|CONDITIONING_PRESETS/.test(sheet))
// The element's own text, from its opening tag to its "/>" — a `[^>]*` would
// stop at the first arrow function inside a prop.
const elementOf = (src: string) => { const at = src.indexOf('<AddUnplannedWork'); return at < 0 ? '' : src.slice(at, src.indexOf('/>', at) + 2) }
const onExercise = elementOf(code('src/components/exercise/TodayPanel.tsx'))
const onTools = elementOf(code('src/components/ToolsTab.tsx'))
check('both screens that open the sheet were found', onExercise.length > 20 && onTools.length > 20, { exercise: onExercise.length, tools: onTools.length })
check('the Exercise tab passes the person\'s tier', /equipmentAccess=\{profile\?\.equipment_access\}/.test(onExercise), onExercise)
check('the Tools tab passes it through', /equipmentAccess=\{equipmentAccess\}/.test(onTools), onTools.slice(0, 200))
check('...from the app', /<ToolsTab[^>]*equipmentAccess=\{profile\.equipment_access\}/.test(code('src/App.tsx')))

console.log('\n[5] What is deliberately untouched')
check('a logged session is still bounded at a whole day of minutes, the typo guard', MAX_PLAUSIBLE_CARDIO_MINUTES === 24 * 60, MAX_PLAUSIBLE_CARDIO_MINUTES)

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) FAILED.`); process.exit(1) }
console.log('All cardio-preset checks passed.')
