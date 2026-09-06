/**
 * Gate: Profile is four groups and one footer, and nothing fell out of it.
 *
 * Profile was eight headings with every editor in the app open at once —
 * about six screens of controls, most of them set once a year. The design
 * handoff collapses that into four named groups plus a destructive footer.
 * Every failure mode of a change like that is a DISAPPEARANCE:
 *
 *  - An editor that stopped being rendered. §1 asserts each one is still
 *    mounted, by the writer that proves it rather than by its heading.
 *  - A control you can no longer REACH, which is worse than a deleted one
 *    because the code still looks right. §2 covers both halves: every group
 *    can be opened, and the section somebody was deep-linked to opens itself
 *    (a scroll-to-ref inside a collapsed group scrolls to nothing).
 *  - A control that only appears when something unrelated exists. §3 pins the
 *    one this restructure found: reply speed rendered inside the "has the
 *    coach stored a note about you" branch, so a new trainee could not reach
 *    it at all.
 *  - A moved action that got copied instead. §4, the same rule
 *    test:tab-ownership holds for a row that changes tabs.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const profile = read('src/components/ProfileScreen.tsx')
const profileCode = stripComments(profile)
const menu = stripComments(read('src/components/ProfileMenu.tsx'))
const app = stripComments(read('src/App.tsx'))

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

// ---------------------------------------------------------------------------
console.log('\n1. Four groups, and every editor still inside one of them')
// ---------------------------------------------------------------------------
const GROUPS = ['You', 'Nutrition', 'Personal TrAIner', 'App']
for (const g of GROUPS) {
  check(`a "${g}" group exists`, new RegExp(`<Group label="${g}"`).test(profileCode))
}
check('...and exactly four of them, not four plus a stray',
  (profileCode.match(/<Group label=/g) ?? []).length === GROUPS.length,
  (profileCode.match(/<Group label="[^"]+"/g) ?? []))
check('...each one openable', /aria-expanded=\{isOpen\}/.test(profileCode))
check('...and closed content is hidden, not display-none guessed at',
  /hidden=\{!isOpen\}/.test(profileCode))

// EVERY EDITOR, by the thing that proves it is really there. A heading is not
// evidence: the point of this gate is the restructure that moved them.
const EDITORS: [string, RegExp][] = [
  ['name', /display_name: v/],
  ['age / height / onboarding weight', /savePatch\(\{ height_cm: n \}\)/],
  ['training days', /<TrainingDaysEditor/],
  ['equipment', /savePatch\(\{ equipment_access/],
  ['other training (a second sport)', /concurrent_activities:/],
  ['daily step target', /savePatch\(\{ daily_step_target: n \}\)/],
  ['injuries', /savePatch\(\{ injuries:/],
  ['dietary restrictions', /ref=\{dietaryRef\}/],
  ['goals', /ref=\{goalsRef\}/],
  ['remembered facts', /ref=\{factsRef\}/],
  ['context notes', /ref=\{contextRef\}/],
  ['reply speed', /onRevealSpeedChange\(level\)/],
  ['appearance', /<AppearanceSection/],
  ['download my data', /handleDownloadData/],
  ['delete everything', /handleDeleteEverything/],
]
for (const [what, re] of EDITORS) check(`${what} survived the regrouping`, re.test(profileCode))

// ---------------------------------------------------------------------------
console.log('\n2. A deep link opens the group it points into')
// ---------------------------------------------------------------------------
// initialSection is a scroll-to-ref, not a route. Scrolling to a ref inside a
// collapsed group scrolls to nothing — and the one caller that matters sends
// people here BECAUSE something of theirs cannot be enforced.
check('the dietary deep link opens Nutrition',
  /<Group label="Nutrition" forceOpen=\{initialSection === 'dietary'\}>/.test(profileCode))
check('...and the memory deep links open Personal TrAIner',
  /<Group label="Personal TrAIner" forceOpen=\{initialSection === 'goals' \|\| initialSection === 'facts' \|\| initialSection === 'context'\}>/.test(profileCode))
// The refs must actually be in those groups, or the check above is decoration.
{
  const groupOf = (ref: string) => {
    const at = profileCode.indexOf(`ref={${ref}}`)
    if (at === -1) return null
    const opens = [...profileCode.slice(0, at).matchAll(/<Group label="([^"]+)"/g)]
    return opens.length ? opens[opens.length - 1][1] : null
  }
  check('dietaryRef really sits in Nutrition', groupOf('dietaryRef') === 'Nutrition', groupOf('dietaryRef'))
  for (const r of ['goalsRef', 'factsRef', 'contextRef']) {
    check(`${r} really sits in Personal TrAIner`, groupOf(r) === 'Personal TrAIner', groupOf(r))
  }
  check('...and something still routes people here', /setProfileInfoSection\('dietary'\)/.test(app))
}

// ---------------------------------------------------------------------------
console.log('\n3. A preference does not depend on an unrelated record existing')
// ---------------------------------------------------------------------------
// Reply speed rendered INSIDE `contextFacts.length > 0`, so a trainee the
// coach had never stored a note about could not reach it. Found by grouping
// it under a heading that says it is always there.
{
  const at = profileCode.indexOf('onRevealSpeedChange(level)')
  check('the reply-speed control exists to check', at !== -1)
  const guard = profileCode.lastIndexOf('{contextFacts.length > 0 && (', at)
  check('reply speed is not inside the "has stored notes" branch', guard === -1, profileCode.slice(guard, guard + 60))
  // ...and the notes themselves still are, since a heading over nothing is
  // its own small lie.
  check('the notes list still is', /\{contextFacts\.length > 0 && \(/.test(profileCode))
}

// ---------------------------------------------------------------------------
console.log('\n4. Start a new plan moved; it was not copied')
// ---------------------------------------------------------------------------
check('Profile carries the destructive footer', /Start a new plan…/.test(profileCode))
check('...at 44px', /h-11 w-full border-destructive\/40 text-destructive/.test(profileCode))
check('...wired to the existing confirm dialog, not a new one',
  /onNewPlan\(\) \}\}/.test(profileCode) && /setNewPlanConfirmOpen\(true\)/.test(app))
check('...and closing Profile first, so the confirm is not behind it',
  /onOpenChange\(false\); onNewPlan\(\)/.test(profileCode))
check('the gear menu no longer offers it', !/New Plan/.test(menu) && !/RotateCcw/.test(menu))
// Replay the tour STAYS in the gear: the tour's own welcome step promises it
// is in the settings menu, and test:app-tour holds that promise.
check('...but still offers Replay the tour', /Replay the tour/.test(menu))
check('App.tsx stopped passing a handler the menu no longer takes',
  !/onNewPlan=\{\(\) => \{[\s\S]{0,200}\}\}\s*\/>\s*<\/div>\s*<div\s+className="fixed left-3/.test(app))

// ---------------------------------------------------------------------------
console.log('\n5. The identity line is read, never stored')
// ---------------------------------------------------------------------------
check('a summary line is derived from the profile', /const identitySummary = \[/.test(profileCode))
check('...from goal, days and equipment', /GOAL_OPTIONS\.find/.test(profileCode) && /EQUIPMENT_OPTIONS\.find/.test(profileCode))
check('...dropping the parts that are unset rather than guessing',
  /\.filter\(Boolean\)\.join\(' · '\)/.test(profileCode))
check('the dialog keeps an accessible title behind the new header',
  /<DialogHeader className="sr-only">/.test(profileCode) && /<DialogTitle>Profile<\/DialogTitle>/.test(profileCode))

// ---------------------------------------------------------------------------
console.log('\n6. The assistant has one name in front of the user')
// ---------------------------------------------------------------------------
// design_handoff_app_polish: "The assistant is 'Personal TrAIner' everywhere
// in UI text." Comments and identifiers keep saying coach — coach-rules.ts,
// coach_note, coachTip are all fine and are stripped before this runs. What
// is not fine is a STRING the user reads.
{
  const SCAN = [
    'src/components/ProfileScreen.tsx', 'src/components/ProfileMenu.tsx',
    'src/components/BottomTabBar.tsx', 'src/components/Dashboard.tsx',
    'src/components/NutritionDisplay.tsx', 'src/components/MealPlan.tsx',
    'src/components/ToolsTab.tsx', 'src/components/TrainerNudge.tsx',
    'src/components/exercise/TodayPanel.tsx', 'src/components/exercise/WeekContextRow.tsx',
    'src/lib/app-tour-steps.ts', 'src/lib/block-review.ts',
  ]
  // A quoted run that reads like a sentence (two lowercase words in a row)
  // and contains the bare word. Module paths and identifiers do not match.
  const SENTENCE = /(['"`])([^'"`\n]{0,200}?\b[Cc]oach\b[^'"`\n]{0,200}?)\1/g
  for (const rel of SCAN) {
    const code = stripComments(read(rel))
    const bad = [...code.matchAll(SENTENCE)]
      .map(m => m[2])
      .filter(t => /[a-z] [a-z]/.test(t))
      .filter(t => !/@\/lib|\.\/coach|coach-|coachNote|coach_note/.test(t))
    check(`${rel} calls it the Personal TrAIner`, bad.length === 0, bad)
  }
  // The scan has to be able to fail, or a green result says nothing.
  check('the scan really matches a sentence (sanity check on this check)',
    [...`const x = 'ask your coach in chat'`.matchAll(SENTENCE)].length === 1)
}

if (failures > 0) { console.error(`\n${failures} profile-group check(s) FAILED\n`); process.exit(1) }
console.log('\nAll profile-group checks passed.\n')
