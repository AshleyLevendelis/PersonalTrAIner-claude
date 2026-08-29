// ---------------------------------------------------------------------------
// Gate for the post-onboarding app tour.
//
// THE FAILURE THIS EXISTS FOR is silent and specific. A tour stop points at a
// DOM element by a `data-tour` string, and NOTHING IN THE COMPILER CHECKS IT.
// Rename a wrapper in Dashboard.tsx, or drop the attribute while refactoring
// a tab, and the tour still runs, still dims the whole screen, still shows the
// brief — pointing at nothing. It is a defect that only a human on a phone
// would ever see, on the one screen a brand-new user meets first.
//
// So the strings are checked in BOTH directions:
//   - every key a step names must exist in the app's source
//   - every `data-tour` in the source must be named by a step
// The second half is what catches the half-finished rename: an attribute left
// behind on a component nobody points at any more is dead weight that reads
// as wired.
//
// The rest is the honesty rule that governs first-run-intro.ts, applied to
// the tour: it is the app's first promise to a new user, made in the app's own
// voice with no model in the loop, so a claim it cannot keep is worse here
// than anywhere else. §4 reuses test-coach-promises.ts's stub list rather than
// restating it.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { TOUR_STEPS, SET_STEP_KEY, type TourStep } from '../src/lib/app-tour-steps'
import { TABS } from '../src/lib/app-route'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full)
  }
  return out
}

const FILES = sourceFiles(join(ROOT, 'src'))
const SOURCE = FILES.map(f => ({ path: f.slice(ROOT.length + 1), text: readFileSync(f, 'utf8') }))

/**
 * Every `data-tour` value written in the app, and where. Matches both the
 * literal form (`data-tour="hero"`) and the conditional one SetGrid uses
 * (`data-tour={isSaved ? undefined : 'setrow'}`), because the second is a real
 * pattern here — the set stop depends on the attribute DISAPPEARING when the
 * row saves, so it cannot be a plain literal.
 */
const attrsInSource = new Map<string, string[]>()
const addAttr = (key: string, path: string) => {
  const at = attrsInSource.get(key) ?? []
  if (!at.includes(path)) at.push(path)
  attrsInSource.set(key, at)
}
for (const { path, text } of SOURCE) {
  if (path.startsWith('src/lib/app-tour-steps')) continue
  for (const m of text.matchAll(/data-tour=(?:"([\w-]+)"|\{[^}]*?['"]([\w-]+)['"][^}]*?\})/g)) {
    const key = m[1] ?? m[2]
    if (key) addAttr(key, path)
  }
}

/**
 * The tab bar sets its attribute through a map — `data-tour={TOUR_KEY[tab]}`
 * — so no literal appears at the attribute site and the scan above finds
 * nothing there. That indirection is deliberate and worth keeping (it is what
 * stops a newly added tab from silently having no key), so the gate reads the
 * map instead of forcing the component to spell four literals.
 *
 * This half was written after the first run of this file reported all four nav
 * targets missing. They were not: the check was.
 */
{
  const path = 'src/components/BottomTabBar.tsx'
  const text = SOURCE.find(f => f.path === path)?.text ?? ''
  const block = /const TOUR_KEY: Record<Tab, string> = \{([\s\S]*?)\}/.exec(text)
  check('the tab bar still derives its tour keys from one map', !!block)
  for (const m of (block?.[1] ?? '').matchAll(/(\w+):\s*'([\w-]+)'/g)) addAttr(m[2], path)
}

/** Keys the tour actually points at: a stop's spotlight target and its tap target. */
function keysOf(step: TourStep): string[] {
  return [step.target, step.nav].filter((k): k is string => !!k)
}
const referenced = new Set(TOUR_STEPS.flatMap(keysOf))

// ---------------------------------------------------------------------------
console.log('\n1. Every stop points at an element that exists')
// ---------------------------------------------------------------------------
{
  check(`there are stops to check, so this has teeth (${TOUR_STEPS.length})`, TOUR_STEPS.length >= 8, TOUR_STEPS.length)
  for (const step of TOUR_STEPS) {
    for (const key of keysOf(step)) {
      const where = attrsInSource.get(key)
      check(`${step.key}: data-tour="${key}" exists${where ? ` (${where[0]})` : ''}`, !!where, key)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. And nothing is tagged that no stop points at')
// ---------------------------------------------------------------------------
{
  // The other direction. An orphan attribute is not merely untidy — it reads
  // as wired to the next person, so a real stop looks already-handled.
  //
  // navHome is the deliberate exception and is asserted BY NAME rather than
  // skipped by a pattern: BottomTabBar derives a key for all five tabs from
  // one map (so adding a tab cannot forget one), and the tour never needs to
  // spotlight Home because it starts there.
  const EXPECTED_UNREFERENCED = ['navHome']
  const orphans = [...attrsInSource.keys()].filter(k => !referenced.has(k))
  check(`unreferenced tags are exactly the expected ones (${orphans.join(', ') || 'none'})`,
    JSON.stringify(orphans.sort()) === JSON.stringify([...EXPECTED_UNREFERENCED].sort()), orphans)

  // A key must be tagged in exactly one place, or the tour spotlights
  // whichever the DOM happens to return first.
  for (const [key, where] of attrsInSource) {
    if (!referenced.has(key)) continue
    check(`data-tour="${key}" is tagged in one file only`, where.length === 1, where)
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. The step model holds together')
// ---------------------------------------------------------------------------
{
  const keys = TOUR_STEPS.map(s => s.key)
  check('step keys are unique', new Set(keys).size === keys.length, keys)
  for (const s of TOUR_STEPS) {
    check(`${s.key}: tab "${s.tab}" is a real tab`, (TABS as string[]).includes(s.tab), s.tab)
    check(`${s.key}: has copy`, s.copy.trim().length > 20)
    // A gated stop asks the user to do something, so it must SAY what — a
    // pulsing outline with no caption is a puzzle, not an instruction.
    const gated = !!s.nav || !!s.gate
    if (gated) {
      check(`${s.key}: gated, so it has a tap hint`, !!s.tapHint?.trim(), s.tapHint)
      check(`${s.key}: gated, so it has a teaser`, !!s.teaser?.trim(), s.teaser)
    } else {
      check(`${s.key}: not gated, so no tap hint to strand`, !s.tapHint && !s.teaser)
    }
  }
  const last = TOUR_STEPS[TOUR_STEPS.length - 1]
  check('only the final stop is marked last', TOUR_STEPS.filter(s => s.last).length === 1 && last.last === true)
  check('the tour ends in chat, where the first-run intro takes over', last.tab === 'chat', last.tab)
  check('exactly one stop is action-gated', TOUR_STEPS.filter(s => s.gate).length === 1)

  // The rest-day variant renumbers to "N of 9". Asserted as arithmetic on the
  // real list rather than as a hardcoded 9, so it survives a stop being added.
  const setIndex = TOUR_STEPS.findIndex(s => s.key === SET_STEP_KEY)
  check(`the set stop is findable by SET_STEP_KEY (index ${setIndex})`, setIndex > 0, setIndex)
  check('dropping it leaves a whole tour behind', TOUR_STEPS.length - 1 >= 8, TOUR_STEPS.length - 1)
}

// ---------------------------------------------------------------------------
console.log('\n4. Nothing the tour promises is a capability the coach declines')
// ---------------------------------------------------------------------------
{
  // Same rule as first-run-intro.ts's chips, same two stubs. The tour speaks
  // in the app's own voice with no model in the loop, so there is nothing
  // downstream to catch an overclaim — this is the only check between the
  // copy and a new user's first impression.
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const DECLINING_STUBS = ['adjust_volume', 'update_workout_schedule']
  for (const stub of DECLINING_STUBS) {
    const at = chat.indexOf(`if (name === "${stub}")`)
    check(`${stub} is still a declining stub, so this check still means something`,
      at !== -1 && /can't safely make plan changes yet/.test(chat.slice(at, at + 1200)))
  }

  // Vocabulary that would have the user ask for one of them. Narrower than the
  // chip screen: the tour DESCRIBES rather than puts words in the user's
  // mouth, so "every set" is fine — a change verb next to a plan noun is not.
  const OVERCLAIM: Array<[RegExp, string]> = [
    [/\bre-?schedul/i, 'update_workout_schedule'],
    [/\bchange your (training )?days?\b/i, 'update_workout_schedule'],
    [/\bmove (a|your) (training )?day\b/i, 'update_workout_schedule'],
    [/\b(add|drop|cut|reduce|increase)\s+(\w+\s+)?(sets?|reps?|volume)\b/i, 'adjust_volume'],
  ]
  for (const s of TOUR_STEPS) {
    const text = [s.copy, s.teaser, s.tapHint, s.title].filter(Boolean).join(' ')
    const hit = OVERCLAIM.find(([re]) => re.test(text))
    check(`${s.key}: promises nothing that lands on a stub`, hit === undefined, hit?.[1])
  }
}

// ---------------------------------------------------------------------------
console.log('\n5. The behaviour the copy depends on is still wired')
// ---------------------------------------------------------------------------
{
  const tour = readFileSync(join(ROOT, 'src/components/AppTour.tsx'), 'utf8')
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  const setGrid = readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8')

  check('the tour is mounted in App.tsx', /<AppTour\s/.test(app))
  // Mounted as a SIBLING of <main> — inside a tab's subtree it could not
  // overlay the tab bar, which is what three of its stops spotlight.
  check('...outside <main>, so it can overlay the tab bar',
    app.indexOf('<AppTour') > app.indexOf('</main>'))
  check('...and only after onboarding actually succeeded',
    /armed=\{tourArmed\}/.test(app) && /setTourArmed\(true\)/.test(app))
  // Arming must not sit in the finally block, which also runs on failure.
  const armAt = app.indexOf('setTourArmed(true)')
  const finallyAt = app.indexOf('} finally {', app.indexOf('const handleOnboardingComplete'))
  check('...on the success path, not in the finally that also runs on failure',
    armAt !== -1 && finallyAt !== -1 && armAt < finallyAt, { armAt, finallyAt })

  // The set stop's whole design: the attribute is conditional on the row being
  // unsaved, and the tour advances when it goes away. Either half alone is a
  // tour that congratulates the user for a set that never saved.
  check('the set ✓ is tagged only while the row is open',
    /data-tour=\{isSaved \? undefined : 'setrow'\}/.test(setGrid))
  check('...and the tour advances on that attribute disappearing',
    /getAttribute\('data-tour'\) !== key/.test(tour))

  check('persistence is keyed per profile', /fitplan_tour_v1:\$\{profileId\}/.test(tour))
  check('halos scale with --glow-strength and motion is respected',
    /tour-breathe/.test(tour) && /tour-echo/.test(tour))

  const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
  for (const name of ['tourBreathe', 'tourEcho', 'tourFade']) {
    check(`@keyframes ${name} exists`, new RegExp(`@keyframes ${name}\\b`).test(css))
  }
  check('the pulse scales with --glow-strength like every other halo',
    /@keyframes tourBreathe[\s\S]{0,600}var\(--glow-strength\)/.test(css))
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  check('reduced motion stops the pulse', /\.tour-breathe/.test(reduced))
  check('...and hides the echo rather than freezing a second static ring',
    /\.tour-echo\s*\{[^}]*opacity:\s*0/.test(reduced))

  // The prototype's hexes must not have come along for the ride: the app has
  // four themes and five accent overrides, so a literal mint is a bug on three
  // of them.
  const HEXES = ['#5BE9C2', '#241E4E', '#9A93C9', '#F5F3FF', '#08281F', '#7DEDCD', '#3ED3AA']
  for (const hex of HEXES) {
    check(`no literal ${hex} — themed tokens only`, !tour.toUpperCase().includes(hex.toUpperCase()))
  }
}

// ---------------------------------------------------------------------------
console.log('\nTHE SET STOP\'S PROMISE HAS TO BE KEEPABLE')
// ---------------------------------------------------------------------------
{
  // FOUND BY DRIVING THE REAL TOUR AGAINST THE REAL SCREENS (verify:tour-real),
  // and invisible to every check above, which reason about the tour's own
  // wiring rather than about whether the app can do what the tour says.
  //
  // The set stop tells the user to tap the ✓ and says "Leave the fields blank
  // and I'll take the prescribed numbers." The weight column had a prescribed
  // fallback; the reps column did not — it fell back to '' and the save was
  // refused with "Enter reps to log this set". The reps box was meanwhile
  // suggesting "0", the one value the save explicitly rejects.
  //
  // It could only ever bite on week 1, and week 1 is the ONLY week the tour
  // runs in: `tourArmed` is set at exactly one call site, the moment
  // onboarding succeeds. Ghost values come from last week, so the tour and
  // the missing fallback were guaranteed to meet.
  const grid = readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8')
  const setStep = TOUR_STEPS.find(s => s.key === SET_STEP_KEY)!

  const promisesBlank = /blank/i.test(setStep.copy)
  check('the set stop still promises blank fields work', promisesBlank, setStep.copy)

  if (promisesBlank) {
    check('...and reps has a prescribed fallback to make that true',
      /const defaultRepsFor = \(\)/.test(grid) &&
      /input\.reps \|\| \(ghost \? String\(ghost\.reps_completed\) : defaultRepsFor\(\)\)/.test(grid))
    check('...and the reps box no longer suggests the value the save refuses',
      !/placeholder=\{ghost \? String\(ghost\.reps_completed\) : '0'\}/.test(grid))
  }

  // THE GUARD THAT MUST NOT BE REOPENED. A weight-only tap committing "0
  // reps" as a done set fed the dot ladder, the progress bar and the
  // progression engine a set that never happened. The fallback supplies a
  // real target where one exists; it must not become a licence to log zero.
  //
  // MATCHED AS THE CONDITION, NOT AS THE PHRASE. Written first as
  // /reps <= 0/, it went green against a mutation that deleted the guard —
  // because the phrase also appears in the comment I had just written above
  // the fallback explaining the guard. A check that a comment can satisfy is
  // a check on the documentation.
  check('a zero/absent rep count still refuses to log',
    /if \(!Number\.isFinite\(reps\) \|\| reps <= 0\) \{/.test(grid) &&
    /Enter reps to log this set/.test(grid))

  // BOTTOM of the range, never the top — the number drives next week's load,
  // so erring high hands someone heavier weights off a set the app invented.
  // The regex is read out of the source rather than restated, then run
  // against the shapes the generator actually emits.
  const src = /const defaultRepsFor = \(\): string => \/(.+?)\/\.exec/.exec(grid)?.[1]
  check('the fallback parses a number out of the prescription', !!src, src)
  if (src) {
    const re = new RegExp(src)
    const cases: [string, string][] = [
      ['9-11', '9'], ['8', '8'], ['11-13', '11'], ['18-23', '18'],
      ['33-48s', '33'], ['30-45s', '30'], ['40m', '40'],
    ]
    const wrong = cases.filter(([input, want]) => (re.exec(input)?.[0] ?? '') !== want)
    check(`it takes the BOTTOM of every prescription shape (${cases.length} checked)`,
      wrong.length === 0, wrong)
    check('a prescription with no number falls through to the refusal',
      (re.exec('')?.[0] ?? '') === '' && (re.exec('AMRAP')?.[0] ?? '') === '')
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. Skip actually skips')
// ---------------------------------------------------------------------------
// Ashley, with two screenshots: "the skip tour doesn't actually skip it. the
// tour is still at the bottom of the app and won't go away until you fully
// complete it." She was exactly right about the mechanism. skip() wrote the
// current step number and moved to 'skipped', which renders the "Resume the
// tour" pill — and the ONLY route to 'done' was reaching the last of ten
// stops, so nothing a person could do would dismiss it. The pill also sat
// over the weigh-in row, covering the number.
//
// Her ruling was Skip-means-gone WITH a way back, because at the time nothing
// anywhere in the app could restart a finished tour: one mistaken tap would
// have destroyed it permanently. The two halves are gated together here for
// that reason — the permanence is only safe while the Replay row exists.
{
  const tour = readFileSync(join(ROOT, 'src/components/AppTour.tsx'), 'utf8')
  const menu = readFileSync(join(ROOT, 'src/components/ProfileMenu.tsx'), 'utf8')
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')

  const skipBody = /const skip = useCallback\(\(\) => \{([\s\S]*?)\}, \[/.exec(tour)?.[1] ?? ''
  check('skip() has a body to read (sanity check on this check)', skipBody.trim().length > 0)
  check('skip() ends the tour rather than parking it',
    /finish\(\)/.test(skipBody), skipBody.trim().slice(0, 120))
  check("...and never re-enters the 'skipped' state that renders the pill",
    !/status:\s*'skipped'/.test(skipBody), skipBody.trim().slice(0, 120))

  // The pill is deliberately KEPT for the one case it is right for: the app
  // was closed part-way through, so offering to pick up where you left off is
  // useful rather than nagging. Asserting it still exists stops a later
  // "simplify" from deleting the resume path along with the skip bug.
  // Matched as the actual render BRANCH, not as two strings that happen to be
  // in the file. The first version of this check grepped for `status ===
  // 'skipped'` and `ResumePill` separately, and stayed green when the whole
  // branch was replaced by `if (false)` — because that comparison also
  // appears in the stepIndex expression higher up. A check that survives the
  // deletion of the thing it checks is worth nothing.
  check('the resume pill still exists for an interrupted tour',
    /if \(state\.status === 'skipped'\) \{[\s\S]{0,400}?<ResumePill/.test(tour))

  check('a replay trigger is exported', /export function replayAppTour/.test(tour))
  check('...the tour listens for it', /TOUR_REPLAY_EVENT/.test(tour) && /addEventListener\(TOUR_REPLAY_EVENT/.test(tour))
  check('...the settings menu offers it', /Replay the tour/.test(menu) && /onReplayTour/.test(menu))
  check('...and App.tsx wires the two together',
    /onReplayTour=\{replayAppTour\}/.test(app) && /replayAppTour/.test(app))
}

console.log(failures === 0 ? '\nAll app-tour checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
