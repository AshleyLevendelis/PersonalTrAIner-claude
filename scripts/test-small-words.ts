/**
 * SMALL WORDS THE WHOLE-APP TEST FOUND WRONG (1 Nov 2026). Each line was a sentence or label the app showed that
 * disagreed with the app's own name for something, or with English:
 *   - Appearance's theme preview said "12 day streak"; her ruling (17 Oct 2026) is "12 in a row".
 *   - Profile's back button said "‹ Dashboard"; the tab is called Home.
 *   - Profile's weigh-in row said "Log a weigh-in on Dashboard".
 *   - A one-interval round ended "All 1 intervals done".
 * Behaviour where it can be called (the timer), the rendered source where it cannot. One exit.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { roundSubline } from '../src/lib/timer-engine'

const ROOT = join(import.meta.dirname, '..')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))
let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}

console.log('\n1. The theme preview says the streak the way the app does')
const appearance = read('src/components/AppearanceSection.tsx')
check('"12 in a row"', /12 in a row/.test(appearance))
check('...never "day streak"', !/day streak/i.test(appearance))

console.log('\n2. Profile names Home as Home')
const app = read('src/App.tsx')
const backExpr = app.match(/backLabel=\{([^\n]+)\}/)?.[1] ?? ''
check('the back label maps the dashboard tab to "Home"', /activeTab === 'dashboard' \? 'Home'/.test(backExpr), backExpr)
const profile = read('src/components/ProfileScreen.tsx')
check('the weigh-in row points at Home', /Log a weigh-in on Home/.test(profile) && !/on Dashboard/.test(profile))

console.log('\n3. A round of one is not "All 1 intervals"')
const one = roundSubline({ rounds: 1, workSeconds: 30, restSeconds: 0 }, 'done', 1)
check('one round: no "All 1"', !/All 1 /.test(one), one)
check('...and it still says it is done', /done/.test(one), one)
const eight = roundSubline({ rounds: 8, workSeconds: 20, restSeconds: 10 }, 'done', 8)
check('eight rounds: "All 8 ... done" as before', /^All 8 \w+s done/.test(eight), eight)

console.log(`\nsmall-words: ${ran} checks ran`)
if (failures > 0) { console.log(`${failures} small-words check(s) FAILED`); process.exit(1) }
console.log('All small-words checks passed.')
