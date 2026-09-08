/**
 * Gate: three overlays that got in the trainee's way.
 *
 * Ashley, 8 Sep 2026, all three from her own phone:
 *
 *  1. THE ✕ AT THE BOTTOM OF EVERY MODAL. `.hit-slop-44` — the utility that
 *     gives small controls a 44px tap target — sets `position: relative` to
 *     anchor its ::after. It is one class, declared after Tailwind's own
 *     positioning utilities, so `class="hit-slop-44 absolute"` silently lost
 *     its absolute and the dialog close button laid out as the LAST item in
 *     the dialog's grid instead of pinning to the corner. On a long modal
 *     (Profile, "How your targets are set") you had to scroll to the very
 *     bottom to find the way out. Measured in the harness before the fix: the
 *     ✕ at y=746 in a dialog spanning 73-771.
 *     And a second half, invisible until the first was fixed: the scroll was
 *     on the same element the ✕ was positioned against, so scrolling carried
 *     it off the top of the screen (y=-259).
 *
 *  2. "REST COMPLETE" THAT NEVER LEFT. The rest deadline is persisted so it
 *     survives a reload — right, mid-rest — and nothing ever expired it, so an
 *     overrun sat in the record until somebody tapped Dismiss. It is a fixed
 *     bar above the tab bar on every tab, and the chat composer rides above
 *     it, so an undismissed prompt is a chat box permanently pushed up.
 *
 *  3. THE EMAIL FORM ON TOP OF THE TOUR. Both are armed by finishing
 *     onboarding, from two code paths that had never met, and both are
 *     full-screen overlays at z-50.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { REST_OVERRUN_GRACE_MS, isRestOverrunExpired } from '../src/hooks/useActiveSession'

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
const raw = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

console.log('\n1. The way out of a modal is in the corner, and stays there\n')

const css = code('src/index.css')
check('the tap-target utility no longer steals an explicit position',
  /\.hit-slop-44\.absolute\s*\{\s*position:\s*absolute/.test(css)
  && /\.hit-slop-44\.fixed\s*\{\s*position:\s*fixed/.test(css)
  && /\.hit-slop-44\.sticky\s*\{\s*position:\s*sticky/.test(css))
// The override must come AFTER the base rule or it loses on source order.
check('...and the override is declared after the rule it overrides',
  css.indexOf('.hit-slop-44.absolute') > css.indexOf('position: relative'))

const dialog = code('src/components/ui/dialog.tsx')
check('the close button is still positioned in the corner',
  /dialog-close[\s\S]{0,200}?absolute top-4 right-4/.test(dialog))
check('the dialog shell does not scroll — the body inside it does',
  /data-slot="dialog-content"[\s\S]{0,900}?overflow-hidden/.test(dialog)
  && /data-slot="dialog-body"[\s\S]{0,200}?overflow-y-auto/.test(dialog))
// Scoped to DialogContent's own body. The whole file also contains the plain
// DialogClose re-export near the top, and matching that instead would pass on
// a close button nested back inside the scroller.
const dialogContent = dialog.slice(dialog.indexOf('function DialogContent'), dialog.indexOf('function DialogHeader'))
check('...and the close button is a sibling of that body, not inside it',
  dialogContent.indexOf('data-slot="dialog-body"') > 0
  && dialogContent.indexOf('data-slot="dialog-body"') < dialogContent.indexOf('data-slot="dialog-close"')
  && /<\/div>\s*\n\s*\{showCloseButton/.test(dialogContent))
check('the shell caps its own height, so a long modal scrolls instead of running off the screen',
  /data-slot="dialog-content"[\s\S]{0,900}?max-h-\[calc\(100dvh-2rem\)\]/.test(dialog))
check('the body can actually shrink to scroll (min-h-0 on the flex child)',
  /data-slot="dialog-body"[\s\S]{0,200}?min-h-0/.test(dialog))

// Every dialog in the app goes through that one component, so the scroll must
// not be re-added at a call site — which is where it used to live.
const DIALOG_CALLERS = [
  'src/components/NutritionDisplay.tsx',
  'src/components/PlateCalculator.tsx',
  'src/components/ProfileScreen.tsx',
  'src/components/exercise/ExerciseDetailDialog.tsx',
  'src/components/exercise/SessionHistoryDialog.tsx',
  'src/components/exercise/SessionSummaryDialog.tsx',
  'src/components/exercise/SwapDialog.tsx',
]
for (const f of DIALOG_CALLERS) {
  const src = raw(f)
  const lines = src.split('\n').filter(l => l.includes('<DialogContent'))
  check(`${f.split('/').pop()} opens a dialog and does not re-add the scroll`,
    lines.length > 0 && lines.every(l => !/overflow-y-auto/.test(l)), lines)
}

console.log('\n2. "Rest complete" takes itself away\n')

const HOUR = 60 * 60 * 1000
const now = Date.parse('2026-09-08T10:00:00.000Z')
const at = (msFromNow: number) => new Date(now + msFromNow).toISOString()

check('a rest still running has not expired', !isRestOverrunExpired(at(60_000), now))
check('a rest that just ended has not expired — it is the prompt', !isRestOverrunExpired(at(-1000), now))
check('one second inside the grace window survives',
  !isRestOverrunExpired(at(-(REST_OVERRUN_GRACE_MS - 1000)), now))
check('one second past it does not', isRestOverrunExpired(at(-(REST_OVERRUN_GRACE_MS + 1000)), now))
check('yesterday\'s rest is long gone', isRestOverrunExpired(at(-20 * HOUR), now))
check('a corrupt deadline counts as expired rather than showing forever',
  isRestOverrunExpired('not-a-date', now))
check('the window is minutes, not hours — a prompt, not furniture',
  REST_OVERRUN_GRACE_MS >= 60_000 && REST_OVERRUN_GRACE_MS <= 15 * 60_000, REST_OVERRUN_GRACE_MS)

const session = code('src/hooks/useActiveSession.tsx')
// Scoped to the hydrate effect, so a match somewhere else in the file cannot
// stand in for the restore path actually checking.
const hydrate = session.slice(session.indexOf('if (!record?.restEndsAt) return')).slice(0, 900)
check('the restore path refuses to bring an expired rest back',
  /isRestOverrunExpired\(record\.restEndsAt[\s\S]{0,320}?return\n/.test(hydrate)
  && hydrate.indexOf('isRestOverrunExpired') < hydrate.indexOf('setRestEndsAt(record.restEndsAt)'), hydrate.slice(0, 200))
check('...and clears it from the record, so it cannot return on the next load',
  /isRestOverrunExpired\([\s\S]{0,300}?saveActiveSessionRecord\(\{[\s\S]{0,200}?restEndsAt: undefined/.test(session))
check('the live path dismisses it without waiting to be tapped',
  /isRestOverrunExpired\([\s\S]{0,120}?return\s*\n\s*dismissRest\(\)/.test(session))
check('both paths ask the same question — no second copy of the arithmetic',
  (session.match(/isRestOverrunExpired\(/g) ?? []).length >= 3
  && !/restRemainingMs\s*[<>]=?\s*-?REST_OVERRUN_GRACE_MS/.test(session))

console.log('\n3. The email form waits for the tour\n')

const app = code('src/App.tsx')
check('the prompt is held back while the tour is on screen',
  /askForEmail && !tourRunning && <EmailPrompt/.test(app))
check('...off a signal the tour actually sends, not a guess about timing',
  /onRunningChange=\{setTourRunning\}/.test(app) && /const \[tourRunning, setTourRunning\] = useState\(false\)/.test(app))

const tour = code('src/components/AppTour.tsx')
check('the tour reports only when it OCCUPIES the screen',
  /const running = state\.status === 'active'/.test(tour)
  && /onRunningChange\?\.\(running\)/.test(tour))
check('...so the small "Resume the tour" pill does not keep the prompt away',
  /state\.status === 'skipped'/.test(tour))
check('and the prompt is not otherwise disabled — it still shows without a tour',
  /askForEmail && !tourRunning/.test(app) && !/askForEmail && false/.test(app))

console.log(failures === 0 ? '\nAll overlay-artifact checks pass.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
