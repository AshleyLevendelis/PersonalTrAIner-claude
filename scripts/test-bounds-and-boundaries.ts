/**
 * Gate: numbers have limits, controls do something, and a crash is not a
 * white screen.
 *
 * The whole-app audit's third and fourth shapes, held in one place because
 * they share a cause: nothing anywhere asserted that a control the user can
 * see is a control that does something, or that a box the user can type into
 * has an answer for what they might type.
 *
 * What was live on 5 Sep 2026:
 *
 *   - The Exercise tab's steps box had no ceiling, while isPlausibleStepCount
 *     sat thirty lines away being used only by the chat door — and the write
 *     REPLACES the day, so a mistyped 900000 became the day's step count
 *     permanently.
 *   - The plate calculator would build 180,000 plate divs and lock the tab.
 *   - Cardio duration and grocery quantity accepted 0 and negatives (`min="1"`
 *     is a hint a browser does not enforce).
 *   - The plate-calculator button in Additional Work did nothing at all.
 *   - The first-ever-log celebration had a firing condition, a prop and a
 *     forwarding chain, and no parent that ever passed one.
 *   - "Load from today's session" in Timers could never render, because its
 *     only mount passed no conditioning.
 *   - Clear chat used window.confirm, which an installed PWA can suppress —
 *     this repo documents that twice, in the two places that stopped using it.
 *   - There was no error boundary anywhere: one render throw took the app to
 *     a blank page with no message and no way back.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { isPlausibleStepCount, MAX_PLAUSIBLE_DAILY_STEPS } from '../src/lib/steps-store'
import { isPlausibleCardioDuration, MAX_PLAUSIBLE_CARDIO_MINUTES } from '../src/lib/cardio-log-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log('\n1. The bounds are real functions, and they say no\n')
// Behavioural, not textual: a constant nothing rejects is decoration.
check('a normal day passes', isPlausibleStepCount(9_000))
check('zero steps is a real answer, not a rejection', isPlausibleStepCount(0))
check('a slipped decimal point does not', !isPlausibleStepCount(900_000))
check('...nor a negative', !isPlausibleStepCount(-1))
check('...nor a fraction of a step', !isPlausibleStepCount(9_000.5))
check(`the ceiling is generous enough for a real walker (${MAX_PLAUSIBLE_DAILY_STEPS.toLocaleString()})`,
  isPlausibleStepCount(80_000))

check('a 45-minute run passes', isPlausibleCardioDuration(45))
check('zero minutes of cardio is not a cardio session', !isPlausibleCardioDuration(0))
check('...and neither is minus five', !isPlausibleCardioDuration(-5))
check(`a day is the ceiling (${MAX_PLAUSIBLE_CARDIO_MINUTES} min)`,
  isPlausibleCardioDuration(MAX_PLAUSIBLE_CARDIO_MINUTES) && !isPlausibleCardioDuration(MAX_PLAUSIBLE_CARDIO_MINUTES + 1))

console.log('\n2. Every typed number goes through one\n')
const steps = stripComments(read('src/components/exercise/StepsRow.tsx'))
check('the steps box checks plausibility before writing',
  /isPlausibleStepCount\(rounded\)/.test(steps))
check('...and says what the limit is rather than just refusing',
  /MAX_PLAUSIBLE_DAILY_STEPS\.toLocaleString\(\)/.test(steps))

// THE STORE, NOT ONLY THE FORMS. Four writers reach saveCardioLog and two of
// them are typed-entry forms; a rule enforced in the forms alone is a rule
// the other two do not have.
const cardioStore = stripComments(read('src/lib/cardio-log-store.ts'))
check('saveCardioLog refuses an implausible duration itself',
  /if \(!isPlausibleCardioDuration\(input\.durationMinutes\)\)/.test(cardioStore))
check('...and returns null rather than throwing on a tap',
  /export function saveCardioLog\([^)]*\): CardioLogView \| null/.test(cardioStore))
for (const file of ['src/components/exercise/RestDayCard.tsx', 'src/components/exercise/AddUnplannedWork.tsx']) {
  const src = stripComments(read(file))
  check(`${file} checks the typed duration`, /isPlausibleCardioDuration\(minutes\)/.test(src))
  check(`...and shows the refusal`, /setDurationError\(/.test(src))
}
for (const file of ['src/components/exercise/FinisherRow.tsx', 'src/components/exercise/RestDayCard.tsx']) {
  const src = stripComments(read(file))
  check(`${file} does not report "logged" when the store refused`, /if \(!view\)/.test(src))
}

const grocery = stripComments(read('src/components/GroceryList.tsx'))
check('a grocery quantity must be positive and bounded',
  /quantity <= 0 \|\| quantity > MAX_GROCERY_QUANTITY/.test(grocery))

const plates = stripComments(read('src/components/PlateCalculator.tsx'))
check('the plate calculator has a target ceiling', /MAX_BARBELL_TARGET_KG/.test(plates))
check('...applied to the bar as well as the target', /bar > MAX_BARBELL_TARGET_KG/.test(plates))
// Belt as well as braces: the loop itself cannot run away even if a future
// caller reaches it around the input.
check('...and the plate loop is bounded structurally too',
  /plates\.length < MAX_PLATES_PER_SIDE/.test(plates))

console.log('\n3. No control is drawn that cannot do anything\n')
const setGrid = stripComments(read('src/components/exercise/SetGrid.tsx'))
check('the plate-calculator button only renders where a handler exists',
  /\{onOpenPlateCalc && \(/.test(setGrid))
check('...and Additional Work is given one', /onOpenPlateCalc=\{onOpenPlateCalc\}/.test(stripComments(read('src/components/exercise/AdditionalWorkSection.tsx'))))
check('...threaded from the panel that has it',
  /<AdditionalWorkSection[^>]*onOpenPlateCalc=\{onOpenPlateCalc\}/.test(stripComments(read('src/components/exercise/TodayPanel.tsx'))))

// The dead prop chain, held down by absence so it cannot be re-added
// half-wired. If the celebration is ever built, this check is what forces the
// parent to be built with it.
for (const file of ['src/components/exercise/SetGrid.tsx', 'src/components/exercise/ExerciseRow.tsx']) {
  check(`${file} has no onFirstEverLog with nobody passing it`, !read(file).includes('onFirstEverLog?.('))
}

check('the timer panel is actually given today\'s conditioning',
  /<TimersPanel todaysConditioning=\{todaysConditioning\}/.test(stripComments(read('src/components/ToolsTab.tsx'))))
check('...derived from the plan the tab is given',
  /exercisePlan \?\? \[\]/.test(stripComments(read('src/components/ToolsTab.tsx'))))

console.log('\n4. No window.confirm anywhere — it is suppressible in a PWA\n')
{
  const chat = stripComments(read('src/components/ChatAssistant.tsx'))
  check('Clear chat no longer uses window.confirm', !/window\.confirm/.test(chat))
  check('...and arms instead, like every other undoable-nothing delete',
    /clearArmed/.test(chat) && /Tap again to clear/.test(chat))
  // The rule, not the instance: nothing in src may call it.
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSyncSafe(dir)) {
      const full = join(dir, entry)
      if (entry === 'node_modules') continue
      if (isDir(full)) walk(full)
      else if (/\.(ts|tsx)$/.test(entry) && /window\.confirm/.test(stripComments(readFileSync(full, 'utf8')))) {
        offenders.push(full.replace(ROOT + '/', ''))
      }
    }
  }
  walk(join(ROOT, 'src'))
  check('no component anywhere calls window.confirm', offenders.length === 0, offenders)
}

console.log('\n5. A render throw is caught, not a white screen\n')
{
  check('the boundary exists', existsSync(join(ROOT, 'src/components/AppErrorBoundary.tsx')))
  const boundary = read('src/components/AppErrorBoundary.tsx')
  check('...it is a real boundary (getDerivedStateFromError)', /static getDerivedStateFromError/.test(boundary))
  check('...it logs rather than swallowing', /componentDidCatch/.test(boundary) && /console\.error/.test(boundary))
  check('...it offers a way out', /Try again/.test(boundary) && /location\.reload/.test(boundary))
  // The most useful true sentence: the queues really do hold the data.
  check('...and tells the user their logged work is safe', /Anything you logged is saved/.test(boundary))
  // A boundary that imports the design system fails in the situations it
  // exists for — if a theme provider is what threw, the fallback throws too.
  check('...with no dependency on the app it is catching',
    !/@\/components\/ui\//.test(boundary) && !/useAppearance/.test(boundary))

  const main = stripComments(read('src/main.tsx'))
  check('it is mounted', /<AppErrorBoundary>/.test(main))
  // OUTSIDE the appearance provider, or a throw in the provider escapes it.
  check('...outside every provider, so nothing escapes it',
    main.indexOf('<AppErrorBoundary>') < main.indexOf('<AppearanceProvider>'))
}

function readdirSyncSafe(dir: string): string[] {
  try { return readdirSync(dir) } catch { return [] }
}
function isDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nEvery bound holds, every control does something, and a crash has a screen.\n')
