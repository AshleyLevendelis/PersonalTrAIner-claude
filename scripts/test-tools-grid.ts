// ---------------------------------------------------------------------------
// Gate for the Tools tab as a utility GRID rather than a junk drawer.
//
// design_handoff_app_polish: six tiles, each with a live subtitle, above a
// three-row grocery preview. Two failure shapes this repo has already paid
// for are one tap away here:
//
//   A TILE THAT OPENS NOTHING. The handoff points its first tile at a
//   "rest-timer settings sheet" that does not exist in this codebase — the
//   rest timer starts itself when a set is logged and has nothing to
//   configure. A tile rendered anyway, with no handler, is the dead-control
//   class the whole-app audit spent a day removing.
//
//   A SUBTITLE THAT IS DECORATION. "14 items · 3 checked" is worth six taps
//   of a person's attention only if it is READ from the store. Hard-coded, it
//   is worse than no caption: it is a number that looks live and is not.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const tools = read('src/components/ToolsTab.tsx')
const grocery = read('src/components/GroceryList.tsx')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log('\n1. Six tiles, and every one of them goes somewhere\n')
{
  // The tile table, parsed rather than counted: a label with no onClick is
  // the thing this section exists to catch.
  const tileBlock = tools.slice(tools.indexOf('const TILES'), tools.indexOf('  // A RUNNING ROUND IS A SINGLE-PURPOSE SCREEN'))
  const labels = [...tileBlock.matchAll(/label: '([^']+)'/g)].map(m => m[1])
  // Not `onClick: () => void` — that is the type annotation on the table
  // itself, and counting it made six tiles look like seven handlers.
  const handlers = [...tileBlock.matchAll(/onClick: \(\) => (?!void)/g)].length
  check(`six tiles (${labels.length}): ${labels.join(', ')}`, labels.length === 6, labels)
  check('...and six handlers, so none of them is a label pretending to be a control', handlers === 6, handlers)
  check('...no handler is an empty body', !/onClick: \(\) => \{\s*\}/.test(tileBlock))
  for (const want of ['Rest timer', 'Rounds & intervals', 'Plate calculator', 'Grocery list', 'Session history', 'Your program']) {
    check(`the grid offers "${want}"`, labels.includes(want), labels)
  }
  // Each destination is a real surface in this codebase, named here so that
  // deleting one of them fails against the tile that opens it.
  check('the plate calculator is really mounted', /<PlateCalculator open=\{plateOpen\}/.test(tools))

  // A SUBTITLE THAT WRAPS COSTS MORE THAN A LINE. On 7 Sep the plate tile's
  // caption was rewritten to "20 kg bar · every way to load it" — honest, and
  // 32 characters, which wrapped to a second line in a half-width tile. That
  // grew the tile, grew the grid by 11px, and pushed the app tour's spotlight
  // hole past the bottom of a 390x844 screen. verify:tour-real caught it;
  // all 136 gates did not, because none of them renders anything.
  //
  // This is a PROXY, and says so: it counts characters, not pixels, and a
  // browser is the only thing that truly knows. It is here because the
  // realistic way this breaks again is somebody writing a longer sentence,
  // and a cheap check that catches that beats no check at all. If a subtitle
  // genuinely needs to be longer, measure it in verify:tour-real and move
  // this number — deliberately, not by deleting the check.
  const SUB_MAX = 23
  const staticSubs = [...tileBlock.matchAll(/sub: '([^']+)'/g)].map(m => m[1])
  check('the static subtitles were found (sanity check on this check)', staticSubs.length >= 3, staticSubs)
  const tooLong = staticSubs.filter(t => t.length > SUB_MAX)
  check(`every fixed subtitle fits one line (<=${SUB_MAX} chars)`, tooLong.length === 0,
    tooLong.map(t => ({ text: t, len: t.length })))
  // The two computed ones are exempt: they are counts, and a count long
  // enough to wrap would mean something else has gone wrong first.
  check('...and the computed ones are counts, which cannot run long',
    /groceryCount \? `/.test(tileBlock) && /historyCount \? `/.test(tileBlock))
  check('the session history dialog is really mounted', /<SessionHistoryDialog open=\{historyOpen\}/.test(tools))
  check('the program tile uses the route helper, not a hand-typed hash', /window\.location\.hash = programHash\(\)/.test(tools))
  check('the grocery tile scrolls to the section on this page', /grocerySectionRef\.current\?\.scrollIntoView/.test(tools))
  check('...and that section is where the ref lands', /<div ref=\{grocerySectionRef\}>/.test(tools))
}

console.log('\n2. The counts are read, not written\n')
{
  check('the grocery subtitle comes from the store', /getAllItems\(profileId\)/.test(tools) && /groceryCount \? `\$\{groceryCount\.total\}/.test(tools))
  check('the history subtitle comes from the session history', /getSessionHistory\(profileId/.test(tools))
  check('...and its PR half from the same cache everything else reads', /getPRCache\(profileId\)/.test(tools))
  check('the program subtitle comes from the mesocycle it is describing', /mesocycle && mesocycle\.length > 0/.test(tools))
  // A count that cannot be read must not be invented: each subtitle falls
  // back to a sentence, never to a zero.
  check('an unread grocery count falls back to words, not "0 items"', /: 'This week/.test(tools))
  check('an unread history count does the same', /: 'Everything you have logged'/.test(tools))
  check('...and an absent plan does too', /: 'Your whole plan, week by week'/.test(tools))
}

console.log('\n3. The timer panel is opened, not stacked\n')
{
  // Two tiles set the timer's mode. If the panel were also always mounted
  // below them, the tiles would be decoration on top of the thing they claim
  // to open — and the tab would be back to being a list of everything.
  check('the panel renders only when opened or running',
    /\{\(timerOpen \|\| timers\.running \|\| timers\.isActive\) && \(/.test(tools))
  check('...and both timer tiles open it', (tools.match(/setTimerOpen\(true\)/g) ?? []).length === 2)
  // The state itself lives in the provider, which is what makes unmounting
  // safe — asserted so a future refactor cannot move it into this component.
  check('the running state is not owned by this tab', !/useState.*elapsedMs|useState.*roundConfig/.test(tools))
}

console.log('\n4. The grocery preview is three rows, and the rest is one tap away\n')
{
  check('collapsed to three by default', /const COLLAPSED_COUNT = 3/.test(grocery) && /useState\(false\)/.test(grocery.slice(grocery.indexOf('const [showAll'), grocery.indexOf('const [showAll') + 80)))
  check('...as a flat slice, not the first category', /grouped\.flatMap\(g => g\.items\)\.slice\(0, COLLAPSED_COUNT\)/.test(grocery))
  check('the expander says how many there are', /All \$\{items\.length\} items/.test(grocery))
  check('...and it expands in place rather than navigating', /setShowAll\(v => !v\)/.test(grocery))
  check('...and only when there is more to show', /items\.length > COLLAPSED_COUNT &&/.test(grocery))
  // Restyled rows: hairline, not a bordered box.
  check('rows are hairline-separated', /borderBottom: '1px solid var\(--hairline\)'/.test(grocery))
  check('...and the checkbox is a token-coloured 20px box', /border: item\.checked \? '1\.5px solid var\(--primary\)' : '1\.5px solid var\(--border\)'/.test(grocery))
  check('a checked row reads as done', /line-through opacity-60/.test(grocery))
  // The section label above it names the list, so the component must not.
  check('the component does not repeat the section heading', !/>\s*Grocery List\s*</.test(grocery))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nTools is a grid of things that work.\n')
