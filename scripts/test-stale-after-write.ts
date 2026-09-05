/**
 * Gate: a write reaches the screen that shows it.
 *
 * Ashley, 5 Sep 2026: "fix the reload bug. also fix it for any other items
 * that need a refresh to update."
 *
 * WHAT THE BUG ACTUALLY WAS, because I got it wrong first and the correction
 * is the useful part. I reported that `onWaterChanged` being declared and
 * never passed meant "the Nutrition tab keeps showing the old number until you
 * reload". Two things make that false, and both were readable at the time:
 * water-store is local-first, so anything reading it fresh already sees the
 * write (the prop's own doc comment says so), and every tab EXCEPT chat
 * unmounts when inactive, so coming back to Nutrition is a fresh mount and a
 * fresh read.
 *
 * The real staleness is the opposite shape. `chat` is the ONE TabsContent with
 * forceMount — App keeps it alive so the conversation survives tab switches —
 * so it is the one surface that never gets a free re-read. Everything it
 * fetches for itself was keyed on [profile.id], which in a component that
 * never unmounts means once per session. Log a set on Exercise, come back and
 * ask what you lifted, and the answer came from app-start.
 *
 * So §1 pins which surfaces are exempt from remount, §2 kills dead callback
 * props (the thing that misled me), and §3-§5 pin that the always-mounted one
 * actually re-reads.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const app = read('src/App.tsx')
const chat = read('src/components/ChatAssistant.tsx')
const stepsRow = read('src/components/exercise/StepsRow.tsx')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

console.log('\n1. Which surfaces never get a fresh mount\n')
{
  const tabs = [...app.matchAll(/<TabsContent value="(\w+)"([^>]*)>/g)].map(m => ({ tab: m[1], attrs: m[2] }))
  check('the tab list was found (sanity check on this check)', tabs.length >= 4, tabs.map(t => t.tab))
  const forced = tabs.filter(t => /forceMount/.test(t.attrs)).map(t => t.tab)
  // This is the fact the rest of the file depends on. If a second tab ever
  // gains forceMount, it inherits the same problem and this goes red so
  // somebody has to think about it rather than inherit it silently.
  check('exactly one tab is kept mounted, and it is chat', forced.length === 1 && forced[0] === 'chat', forced)
  console.log(`     unmounting on switch (so they re-read for free): ${tabs.filter(t => !/forceMount/.test(t.attrs)).map(t => t.tab).join(', ')}`)
}

console.log('\n2. No callback prop is declared and then never passed\n')
{
  // THE onWaterChanged CLASS. It was declared, awaited in two places, and
  // passed by nobody — so every call site was a no-op that read as wiring.
  // A prop that looks connected and is not is worse than an absent one,
  // because it stops the next person looking.
  const i = chat.indexOf('interface ChatAssistantProps')
  const j = chat.indexOf('export function ChatAssistant', i)
  const block = chat.slice(i, j)
  check('the props block was found (sanity check on this check)', i !== -1 && j > i, { i, j })
  const declared = [...block.matchAll(/^\s{2}(on[A-Z]\w*)\??:/gm)].map(m => m[1])
  check(`there are callbacks to check (${declared.length})`, declared.length > 8, declared.length)
  const unpassed = declared.filter(d => !new RegExp(`\\b${d}=\\{`).test(app))
  check('every callback ChatAssistant declares is passed by App', unpassed.length === 0, unpassed)
}

console.log('\n3. The always-mounted tab re-reads what it fetched itself\n')
{
  // The loaders and the conversation are on SEPARATE effects on purpose:
  // re-running loadChatHistory on every logged set would refetch and re-render
  // the conversation underneath the user.
  const loaderEffect = /useEffect\(\(\) => \{\s*if \(profile\.id\) \{\s*loadFavorites\(\)\s*loadWorkoutLogs\(\)\s*loadTodaySteps\(\)\s*\}[\s\S]{0,200}?\}, \[([^\]]*)\]\)/.exec(chat)
  check('the data loaders sit in their own effect', !!loaderEffect, loaderEffect?.[1])
  const deps = loaderEffect?.[1] ?? ''
  check('...keyed on more than profile.id, or it runs once per session', /dataVersion/.test(deps), deps)
  check('...including writes made on other tabs', /dataVersion/.test(deps), deps)
  check('...and writes made in this tab', /ownWriteVersion/.test(deps), deps)
  check('...and sets logged during a session', /logs\.length/.test(deps), deps)
  check('the conversation is NOT reloaded alongside the data',
    !/loadChatHistory/.test(loaderEffect?.[0] ?? ''), loaderEffect?.[0]?.slice(0, 160))

  // proactiveData carries the water figure the coach quotes back at you.
  const proactive = /loadDashboardData\(\{[\s\S]*?\}, \[([^\]]*)\]\)/.exec(chat)
  check('the dashboard read the coach quotes was found (sanity check)', !!proactive, proactive?.[1])
  check('...and refreshes after this tab writes, so it cannot quote a pre-log total',
    /ownWriteVersion/.test(proactive?.[1] ?? ''), proactive?.[1])
}

console.log('\n4. Every write in the chat tab bumps its own view\n')
{
  // Each of these changes something the coach reads back. Missing one means a
  // confident, wrong number in the very next sentence.
  for (const [what, anchor] of [
    ['water', 'const resolveAndSaveWater'],
    ['steps', 'const resolveAndSaveSteps'],
  ] as const) {
    const at = chat.indexOf(anchor)
    const body = at === -1 ? '' : chat.slice(at, at + 3000)
    check(`${what}: handler found (sanity check on this check)`, body.length > 100, at)
    check(`${what}: the write bumps this tab's own read`, /bumpOwnWrites\(\)/.test(body))
  }
  // Undo changes the number back — and must be just as visible.
  const undoAt = chat.indexOf("receipt.kind === 'steps_logged'")
  const undoBody = undoAt === -1 ? '' : chat.slice(undoAt, undoAt + 900)
  check('undoing steps refreshes too', /bumpOwnWrites\(\)/.test(undoBody))
}

console.log('\n5. Writes on other tabs reach the tab that never unmounts\n')
{
  check('App keeps one version for what the coach reads', /coachDataVersion/.test(app))
  check('...bumped when a set is logged', /onLogsUpdated=\{[^}]*bumpCoachData/.test(app))
  check('...when the coach itself logs water', /onWaterChanged=\{bumpCoachData\}/.test(app))
  check('...when the coach itself logs steps', /onStepsChanged=\{[^}]*bumpCoachData/.test(app))
  check('...and when steps are typed on the Exercise tab', /onStepsLogged=\{bumpCoachData\}/.test(app))
  check('the version actually reaches chat', /dataVersion=\{coachDataVersion\}/.test(app))

  // The Exercise tab's own step entry is the one that has to travel furthest:
  // StepsRow -> TodayPanel -> ExerciseTab -> App -> ChatAssistant.
  check('StepsRow reports a successful log', /onLogged\?\.\(\)/.test(stepsRow))
  const handler = /const handleLogSteps[\s\S]*?\n  \}/.exec(stepsRow)?.[0] ?? ''
  check('...only after the write succeeded, never in the catch',
    handler.indexOf('onLogged?.()') !== -1
    && handler.indexOf('onLogged?.()') < handler.indexOf('} catch'), handler.slice(0, 200))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nA write reaches the screen that shows it.\n')
