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
console.log('\n1. Four groups of rows, and every editor still behind one of them')
// ---------------------------------------------------------------------------
// DESIGN HANDOFF 2d (10 Oct 2026): the four collapsible groups became four
// titled lists of rows, each row opening the editors it names on a page of
// their own. The disappearance this gate exists for is the same one.
const GROUPS = ['Body & goals', 'Training', 'Food', 'Personal TrAIner & app']
for (const g of GROUPS) {
  check(`a "${g}" group exists`, profileCode.includes(`<ProfileGroup label="${g}"`))
}
check('...and exactly four of them, not four plus a stray',
  (profileCode.match(/<ProfileGroup label=/g) ?? []).length === GROUPS.length,
  (profileCode.match(/<ProfileGroup label="[^"]+"/g) ?? []))

// The sheets: every key the screen names has a title, a body, and a row that
// opens it. A sheet with no row is an editor nobody can reach.
const keys = [...(/type ProfileSheet =([\s\S]*?)\n\n/.exec(profileCode)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map(m => m[1])
check('the sheet list is readable', keys.length >= 12, keys)
const bodyAt = profileCode.indexOf('const sheetBody = ')
const renderAt = profileCode.indexOf('<Dialog open={open}', bodyAt)
const bodies = bodyAt > 0 && renderAt > bodyAt ? profileCode.slice(bodyAt, renderAt) : ''
const page = renderAt > 0 ? profileCode.slice(renderAt) : ''
const noRow = keys.filter(k => !page.includes(`onOpen={() => setSheet('${k}')}`))
const noBody = keys.filter(k => !bodies.includes(`case '${k}': return (`))
check('...every sheet has a row that opens it', noRow.length === 0, noRow)
check('...and a body', noBody.length === 0, noBody)
check('...and a title', keys.every(k => new RegExp(`\\b${k}: '`).test(profileCode)), keys)
check('a sheet replaces the page of rows, and the back button leaves the sheet before Profile',
  /\{sheet \? \(/.test(page) && /onClick=\{\(\) => sheet \? setSheet\(null\) : onOpenChange\(false\)\}/.test(page))

// EVERY EDITOR, by the thing that proves it is really there — and INSIDE a
// sheet body, except the footer's two, which the brief keeps as they are.
const EDITORS: [string, RegExp, 'sheet' | 'footer'][] = [
  ['name', /display_name: v/, 'sheet'],
  ['age / height / onboarding weight', /savePatch\(\{ height_cm: n \}\)/, 'sheet'],
  ['goal', /savePatch\(\{ fitness_goal:/, 'sheet'],
  ['training days', /<TrainingDaysEditor/, 'sheet'],
  ['equipment', /savePatch\(\{ equipment_access/, 'sheet'],
  ['weight caps', /max_dumbbell_kg: n/, 'sheet'],
  ['known lifts', /known_bench_kg: n/, 'sheet'],
  ['other training (a second sport)', /concurrent_activities:/, 'sheet'],
  ['session length', /session_duration_preference: v/, 'sheet'],
  ['style', /training_style: v/, 'sheet'],
  ['daily step target', /savePatch\(\{ daily_step_target: n \}\)/, 'sheet'],
  ['injuries', /savePatch\(\{ injuries:/, 'sheet'],
  ['dietary restrictions', /ref=\{dietaryRef\}/, 'sheet'],
  ['foods liked', /saveLikedFoods/, 'sheet'],
  ['foods to avoid', /saveDislikedFoods/, 'sheet'],
  ['exercises to avoid', /saveDislikedExercises/, 'sheet'],
  ['shopping day', /setShopDay\(/, 'sheet'],
  ['goals', /ref=\{goalsRef\}/, 'sheet'],
  ['remembered facts', /ref=\{factsRef\}/, 'sheet'],
  ['context notes', /ref=\{contextRef\}/, 'sheet'],
  ['reply speed', /onRevealSpeedChange\(level\)/, 'sheet'],
  ['appearance', /<AppearanceSection/, 'sheet'],
  ['reminders', /<RemindersSection/, 'sheet'],
  ['download my data', /handleDownloadData/, 'footer'],
  ['delete everything', /handleDeleteEverything/, 'footer'],
]
for (const [what, re, where] of EDITORS) {
  check(`${what} survived the regrouping, in ${where === 'sheet' ? 'a sheet' : 'the footer'}`, re.test(where === 'sheet' ? bodies : page))
}

// ---------------------------------------------------------------------------
console.log('\n2. A deep link opens the sheet it points into')
// ---------------------------------------------------------------------------
// initialSection is a scroll-to-ref, not a route. A ref inside a sheet that is
// not open scrolls to nothing — and the one caller that matters sends people
// here BECAUSE something of theirs cannot be enforced.
{
  const caseOf = (ref: string) => {
    const at = bodies.indexOf(`ref={${ref}}`)
    if (at === -1) return null
    const opens = [...bodies.slice(0, at).matchAll(/case '([a-z]+)': return \(/g)]
    return opens.length ? opens[opens.length - 1][1] : null
  }
  const map = /const SHEET_FOR_SECTION[^=]*= \{([^}]*)\}/.exec(profileCode)?.[1] ?? ''
  const target = (section: string) => new RegExp(`${section}: '([a-z]+)'`).exec(map)?.[1] ?? null
  check('the dietary deep link opens the sheet holding dietaryRef', target('dietary') != null && caseOf('dietaryRef') === target('dietary'), [target('dietary'), caseOf('dietaryRef')])
  for (const [section, ref] of [['goals', 'goalsRef'], ['facts', 'factsRef'], ['context', 'contextRef']] as const) {
    check(`the ${section} deep link opens the sheet holding ${ref}`, target(section) != null && caseOf(ref) === target(section), [target(section), caseOf(ref)])
  }
  check('...the link is read when Profile opens', /setSheet\(initialSection \? SHEET_FOR_SECTION\[initialSection\] : null\)/.test(profileCode))
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
