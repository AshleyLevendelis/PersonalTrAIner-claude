// ---------------------------------------------------------------------------
// Gate for the Tools tab as ONE TIMER SURFACE rather than a junk drawer.
//
// REWRITTEN 12 Sep 2026 for design handoff 2a. What this guarded before was a
// six-tile grid, and the grid is gone: two of its tiles opened the same panel
// in different modes, one ("Rest timer") pointed at a settings screen that has
// never existed, and a grocery section sat below it that a tile scroll-jumped
// you to. The failure shapes it was written for are unchanged and still worth
// paying for, so they are re-pinned against what is actually there now:
//
//   A CONTROL THAT OPENS NOTHING — the dead-control class the whole-app audit
//   spent a day removing.
//
//   A SUBTITLE THAT IS DECORATION. "14 items · 3 checked" is worth attention
//   only if it is READ from the store. Hard-coded, it is worse than no
//   caption: a number that looks live and is not.
//
//   A SUBTITLE THAT WRAPS. Costs a line, then a row, then the app tour's
//   spotlight hole falls off a 390x844 screen. THE THRESHOLD MOVED with this
//   redesign and the old number is not comparable: the subtitles used to sit
//   in HALF-WIDTH tiles (limit 23 characters) and now sit in FULL-WIDTH rows,
//   so the limit is 40. Measured, not guessed — verify:tools-timer reads the
//   rendered line count at 390px.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const tools = read('src/components/ToolsTab.tsx')
const grocery = read('src/components/GroceryList.tsx')
const card = read('src/components/timers/RoundCard.tsx')
const field = read('src/components/timers/RoundField.tsx')
const hook = read('src/hooks/useTimers.tsx')
const route = read('src/lib/app-route.ts')
const app = read('src/App.tsx')
const screen = read('src/components/GroceryScreen.tsx')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log('\n1. One timer surface, and every row goes somewhere\n')
{
  // THE GRID IS GONE, and its absence is the point of the redesign — pinned
  // on the source with comments stripped, so a note explaining the removal
  // cannot satisfy the check that it was removed.
  const bare = tools.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('no tile table survives', !/const TILES/.test(bare), bare.match(/const TILES/)?.[0])
  check('...and no grid layout with it', !/grid-cols-2/.test(bare))

  // THE ROUND CARD IS NOT ON THE TAB AT REST — 4b, and this REVERSES the 4a
  // assertion that stood here ("it is always there"). Ashley, 14 Sep 2026, on
  // the shipped screen: the round timer should not sit permanently at the top
  // of Tools; it belongs behind a Timers row with the other two.
  //
  // The property is two-sided and both sides matter. At rest the card is
  // absent, or her complaint is unfixed. While a round RUNS the card is on the
  // tab, or a counting clock is hidden behind a row, which is worse than what
  // she reported.
  check('the round card exists at all', /<RoundCard/.test(tools))
  check('...and is on the tab ONLY while a round is running',
    /\{roundLive && \(/.test(tools) && /<RoundCard live idleConfig/.test(tools),
    bare.match(/.{0,30}<RoundCard[^>]{0,40}/g))
  check('...and a finished round can still be written down from it', /onLogSession=\{setRoundToLog\}/.test(tools))
  check('...only once a round is started and not reset', /const roundLive =/.test(tools) && /timers\.mode === 'round' && !!timers\.roundConfig/.test(tools))
  // PAUSED STILL COUNTS. pauseRound sets running:false, and a condition that
  // only checked `running` used to make the whole timer vanish on Pause.
  check('...and a paused round still holds the card', /timers\.running \|\| timers\.isRoundComplete \|\| timers\.isActive/.test(tools))

  // FULL SCREEN IS OPT-IN — the behaviour change this redesign is for.
  check('the flooded field renders only when she asked for it', /if \(roundLive && timers\.roundFullScreen\)/.test(tools))
  check('...and the card is what offers it', /timers\.setRoundFullScreen\(true\)/.test(card))
  check('...and the field can be left again, so it is not a dead end', /timers\.setRoundFullScreen\(false\)/.test(field))
  check('...with the flag owned by the provider, so a tab switch keeps it', /roundFullScreen: boolean/.test(hook) && !/useState.*roundFullScreen/.test(tools))
  check('...and cleared when a round starts or is reset', (hook.match(/setRoundFullScreen\(false\)/g) ?? []).length >= 2)

  // ONE PHASE MAP. Two surfaces painting the same running timer must not be
  // able to disagree about what "rest" looks like.
  check('the card imports the field\'s phase colours rather than its own', /import \{ FIELD, roundPhaseOf, formatRemaining \} from '@\/components\/timers\/RoundField'/.test(card))
  check('...and defines no second map', !/const FIELD/.test(card))
  check('...and derives the phase by the one rule', /roundPhaseOf\(timers\)/.test(card) && /export function roundPhaseOf/.test(field))

  // THE PROTOCOLS ARE ON THE TAB, not behind a second screen — design handoff
  // 4a, 13 Sep 2026. RE-ANCHORED off `data-change-intervals`, which this
  // change deletes: the property was never "there is a row", it was that the
  // interval choice is reachable without leaving the tab. Now it is the whole
  // control surface, so the check reads the chips.
  // UNCONDITIONAL, like the card. `{false && <ProtocolChips` left the string
  // in place and the row off the screen — the same shape as the dead branch
  // that satisfied two checks on 9 Sep, so it is pinned the same way.
  // REACHABLE FROM TOOLS WITHOUT LEAVING IT — that was always the property,
  // and it survives 4b: the sheet opens over Tools rather than routing away.
  // What changed is that the chips are inside it rather than on the surface.
  check('the protocols are still reachable without leaving Tools',
    /<ProtocolChips/.test(bare) && !/data-change-intervals/.test(bare)
    && !/window\.location\.hash = .*timer/i.test(bare), bare.match(/.{0,24}<ProtocolChips/)?.[0])
  check('...built from the preset table rather than a second list here',
    /protocolChoices\(/.test(tools) && !/'Tabata'|'EMOM'|'40\/20'/.test(bare))
  // MOUNTED IN PLACE, not routed to. Written to allow the Suspense wrapper the
  // code-split needs — the property is that the setup appears INSIDE this tab
  // when the chip is on, not that one particular JSX shape does it.
  // STILL IN PLACE, now meaning "under the chips inside the timers sheet".
  // The 4a version of this line also forbade a Dialog; under 4b the sheet IS
  // a dialog, so that clause would forbid the layout Ashley asked for. What is
  // still worth pinning is that Custom appears BENEATH the chips it belongs
  // to, rather than being a further screen away — the chips and the panel in
  // the same block, in that order.
  check('...and Custom unfolds under the chips, not a screen further in',
    /<ProtocolChips[\s\S]{0,400}?\{customOpen && \(?[\s\S]{0,120}?<RoundSetupPanel/.test(tools),
    bare.match(/<ProtocolChips[\s\S]{0,60}/)?.[0])
  check('the rest timer is explained, not faked', /runs itself in the session dock/.test(tools))
  // THE SETUP PANEL IS NOT LEFT STANDING UNDER A RUNNING ROUND. It used to
  // stay mounted for as long as anything was running — which under the old
  // design was how you reached the round at all — and put a tab strip beneath
  // the card. Caught by reading the screenshot, not by any assertion here.
  check('...and the setup is mounted only when asked for', /\{customOpen && [(<]/.test(tools))
  check('...not merely because something is running', !/customOpen \|\| timers\.running/.test(tools))
  // THE TAB STRIP IS GONE WITH IT (4a). Round is this tab's own content, so a
  // tab labelled "Round" beside it was the surface competing with itself.
  const panelSrc = read('src/components/timers/TimersPanel.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('no Stopwatch / Lap / Round tab strip survives',
    !/TabsList|TabsTrigger/.test(panelSrc), panelSrc.match(/Tabs\w+/g)?.slice(0, 3))
  check('...and no control claims to configure the rest timer', !/'Rest timer'/.test(bare))

  // ALL THREE TIMERS, BY NAME, BEHIND ONE ROW — 4b, and the reason it is
  // pinned on the MODE UNION rather than on three labels. Between 12 and 14
  // Sep the tab offered "Stopwatch" as one row that called setMode('lap'):
  // 'stopwatch' was a real mode in timer-store.ts and reachable from nowhere
  // in the app. Ashley noticed the missing one from the outside ("the lap
  // timer is also gone"). Reading the union means a fourth mode cannot be
  // added and left unreachable the same way.
  const modeUnion = read('src/lib/timer-store.ts').match(/export type TimerMode = ([^\n]+)/)?.[1] ?? ''
  const modes = [...modeUnion.matchAll(/'([a-z]+)'/g)].map(m => m[1])
  check(`timer-store declares ${modes.length} modes: ${modes.join(', ')}`, modes.length >= 3, modes)
  for (const mode of modes) {
    check(`...'${mode}' is offered by name in the timers sheet`,
      new RegExp(`mode: '${mode}', label: '`).test(tools), tools.match(/mode: '[a-z]+', label: '[^']+'/g))
  }
  check('...and picking one really opens its panel',
    /<StopwatchPanel \/>/.test(tools) && /timerPick === 'round'/.test(tools))
  // A MODE SWITCH WIPES THE TIMER RECORD, so the chooser must refuse to walk
  // away from a running round rather than destroying it silently.
  // BOTH GUARDS, SEPARATELY. The first version of this check tested for the
  // expression `roundLive && choice.mode !== 'round'` anywhere in the file —
  // and passed with the click guard DELETED, because the same words remain in
  // the `disabled` prop and in the subtitle beside it. Caught by mutation, not
  // by reading. A disabled button is the visual half; the early return is what
  // actually stops the mode switch if the button is reached any other way.
  check('...and a live round cannot be silently wiped: the button is disabled',
    /disabled=\{roundLive && choice\.mode !== 'round'\}/.test(tools))
  check('...nor by the handler if it is reached anyway',
    /if \(roundLive && choice\.mode !== 'round'\) return/.test(tools))

  // GROCERY IS BACK ON TOOLS — hers, 14 Sep. Pinned on the route helper, the
  // same property `chat-app-reality` reads to decide whether the coach may
  // claim Tools opens the shopping list.
  check('the grocery list is a row on Tools again', /groceryHash\(\)/.test(tools))
  check('...with a live count rather than a fixed label', /subscribeGroceryStore/.test(tools))

  // ALSO HERE — four rows, four handlers, no labels pretending to be controls.
  // FROM the table TO the render — searched forward from the table's own
  // start, because '  return (' is a substring of the early return's
  // '    return (' higher up the file and indexOf would land there instead,
  // slicing an empty block and passing four checks about nothing.
  const alsoStart = tools.indexOf('const rows:')
  const alsoBlock = tools.slice(alsoStart, tools.indexOf('\n\n  return (', alsoStart))
  const labels = [...alsoBlock.matchAll(/label: '([^']+)'/g)].map(m => m[1])
  const handlers = [...alsoBlock.matchAll(/onClick: \(\) => (?!void)/g)].length
  // FIVE ROWS UNDER 4b: Timers and Grocery list joined, Stopwatch left for the
  // sheet. Counted rather than fixed at five, so the number and the list
  // cannot drift apart.
  check(`${labels.length} rows: ${labels.join(', ')}`, labels.length === handlers, { labels, handlers })
  check('...no handler is an empty body', !/onClick: \(\) => \{\s*\}/.test(alsoBlock))
  for (const want of ['Timers', 'Grocery list', 'Plate calculator', 'Session history', 'Your program']) {
    check(`"${want}" is reachable`, labels.includes(want), labels)
  }
  // THE TOUR POINTS AT SOMETHING THAT EXISTS. Its target was the round card,
  // which is no longer on the tab at rest — a spotlight on an absent element
  // is the tour bug this repo has already shipped once.
  check('the tour target is on a row that is always rendered', /tour: 'toolstimer'/.test(alsoBlock))
  check('the plate calculator is really mounted', /<PlateCalculator open=\{plateOpen\}/.test(tools))
  check('the session history dialog is really mounted', /<SessionHistoryDialog open=\{historyOpen\}/.test(tools))
  check('the program row uses the route helper, not a hand-typed hash', /window\.location\.hash = programHash\(\)/.test(tools))

  // THE LENGTH LIMIT, AT ITS NEW SCALE. 40, not 23 — full-width rows, not
  // half-width tiles. The two numbers are not comparable.
  const SUB_MAX = 40
  // EVERY FIXED SUBTITLE IN THE BLOCK, however it is written. The stopwatch's
  // is a ternary since 4a (it says why it is unavailable mid-round), so a
  // pattern that only saw `sub: '...'` would silently stop measuring it —
  // which is how a wrapping subtitle gets back in.
  // Comment-stripped first: a note ABOUT a subtitle is not a subtitle, and
  // measuring one would fail the check on prose.
  const alsoBare = alsoBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const staticSubs = [...alsoBare.matchAll(/sub:[^\n]+/g)]
    .flatMap(m => [...m[0].matchAll(/'([^']+)'/g)].map(q => q[1]))
    .filter(t => !t.includes('${'))
  check('the static subtitles were found (sanity check on this check)', staticSubs.length >= 3, staticSubs)
  const tooLong = staticSubs.filter(t => t.length > SUB_MAX)
  check(`every fixed subtitle fits one line (<=${SUB_MAX} chars)`, tooLong.length === 0, tooLong.map(t => ({ text: t, len: t.length })))
  // AND THE CHIPS CARRY THEIR OWN NUMBERS, read from the config rather than
  // typed beside the name — a chip cannot come to describe a protocol it does
  // not run.
  const chips = read('src/components/timers/ProtocolChips.tsx')
  check('each protocol chip states its own numbers', /chipNumbers\(choice\.config[,)]/.test(chips))
}

console.log('\n2. The counts are read, not written\n')
{
  check('the history subtitle comes from the session history', /getSessionHistory\(profileId/.test(tools))
  check('...and its PR half from the same cache everything else reads', /getPRCache\(profileId\)/.test(tools))
  check('the program subtitle comes from the mesocycle it is describing', /mesocycle && mesocycle\.length > 0/.test(tools))
  // A count that cannot be read must not be invented: each subtitle falls
  // back to a sentence, never to a zero.
  check('an unread history count falls back to words, not "0 sessions"', /: 'Everything you have logged'/.test(tools))
  check('...and an absent plan does too', /: 'Your whole plan, week by week'/.test(tools))
}

console.log('\n3. The grocery LIST is a screen of its own — Tools links to it, it is not rendered inline\n')
{
  const bare = tools.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the list is not rendered here any more', !/<GroceryList/.test(bare))
  check('...nor imported', !/from '@\/components\/GroceryList'/.test(bare))
  check('...and the scroll-jump is gone with it', !/grocerySectionRef/.test(bare))
  // IT WENT SOMEWHERE. Removing a surface without a destination would be a
  // worse defect than the tile ever was.
  check('it has a route of its own', /kind: 'grocery'/.test(route) && /export function groceryHash/.test(route))
  check('...that the app actually renders', /route\.kind === 'grocery'/.test(app) && /<GroceryScreen/.test(app))
  check('...and that Nutrition\'s link points at', /onOpenGrocery=\{\(\) => \{ window\.location\.hash = groceryHash\(\) \}\}/.test(app))
  check('the screen wraps the same list component, not a copy', /<GroceryList/.test(screen))
}

console.log('\n4. The list is a screen, grouped by aisle, and the trolley is out of the way\n')
{
  // REWRITTEN 12 Sep 2026 with the section it guarded. The three-row preview
  // existed because the list sat at the bottom of the Tools tab and could not
  // have the page; it has the page now, so previewing three of it and hiding
  // the rest behind "All 14 items" is a step that no longer buys anything.
  // What is still worth guarding is the shopping behaviour underneath.
  check('the preview and its expander are gone', !/COLLAPSED_COUNT/.test(grocery))
  check('items are grouped by aisle', /CATEGORY_ORDER/.test(grocery) && /CATEGORY_LABEL\[category\]/.test(grocery))
  check('...with a count on each heading, so a detour can be judged', /\{catItems\.length\}/.test(grocery))
  // CHECKED ITEMS LEAVE THE AISLES. A struck-through line still occupying its
  // slot is a thing you read past every time you look down.
  check('a checked item leaves its group', /i\.category === cat && !i\.checked/.test(grocery))
  check('...and collects in one trolley row', /data-trolley/.test(grocery) && /In the trolley · \{inTrolley\.length\}/.test(grocery))
  check('...which can be opened to undo a mis-tap', /Put back/.test(grocery) && /toggleChecked\(item\)/.test(grocery))
  // Rows and checkbox, unchanged in kind: hairline, not a bordered box.
  check('rows are hairline-separated', /borderBottom: '1px solid var\(--hairline\)'/.test(grocery))
  check('...and the checkbox is a token-coloured 24px box',
    /size-6 shrink-0 rounded-md/.test(grocery)
    && /border: item\.checked \? '1\.5px solid var\(--primary\)' : '1\.5px solid var\(--border\)'/.test(grocery))
  check('a checked row reads as done', /line-through opacity-60/.test(grocery))
  // The screen above it names the list, so the component must not.
  check('the component does not repeat the section heading', !/>\s*Grocery List\s*</.test(grocery))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nTools is one timer, and a short list of things that work.\n')
