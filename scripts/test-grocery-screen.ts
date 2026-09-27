/**
 * test:grocery-screen — the parts of the grocery revamp (design 3a/3b, 27 Sep
 * 2026) that no harness page can render, because they live in App.tsx and no
 * harness boots App, plus the brief's one hard constraint: every write goes
 * through the grocery store. Everything ON the screen is measured in a real
 * browser by verify:grocery; this holds only:
 *
 *   1. App hides its floating settings gear while the grocery screen is open
 *      (the screen's top bar carries it), and still hides it for the chat.
 *   2. App hands the grocery top bar the REAL ProfileMenu with its own handlers.
 *   3. App lays the tab bar's chat button flat on the grocery screen and the
 *      chat, and nowhere else.
 *   4. The screen writes only through the store's own functions — it never
 *      reaches the database or the write queue itself.
 *
 * Source checks, so they prove the wiring exists and not that it is reached;
 * verify:grocery drives the harness copy of each on a real screen.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))
const app = read('src/App.tsx')
const list = read('src/components/GroceryList.tsx')
const screen = read('src/components/GroceryScreen.tsx')

console.log('grocery screen — the App.tsx half, and writes through the store')

console.log('\n[1] One settings gear')
const at = app.indexOf('data-tour="settings"')
const gearOpen = at < 0 ? '' : app.slice(app.lastIndexOf('<div', at), app.indexOf('>', app.indexOf('style=', at)) + 1)
const hideCond = (gearOpen.match(/\$\{([^}]*?)\?\s*'hidden'/) || [])[1] ?? ''
check('the floating gear hides while the grocery screen is open', /\bgroceryFullScreen\b/.test(hideCond), hideCond)
check('...and still hides for the chat', /activeTab\s*===\s*'chat'/.test(hideCond), hideCond)
check('...and "the grocery screen is open" means the grocery route, the same flag that mounts it', /const groceryFullScreen = route\.kind === 'grocery'/.test(app) && /\{groceryFullScreen \? \(\s*(?:<Suspense[\s\S]*?\}>\s*)?<GroceryScreen/.test(app))

console.log('\n[1b] Off the main bundle, and still there offline')
check('the screen loads as its own chunk', /const GroceryScreen = lazy\(/.test(app) && !/import \{ GroceryScreen \} from/.test(app))
check('...and that chunk is fetched soon after start, so the offline cache has it before the shop', /useEffect\(\(\) => \{[\s\S]{0,200}?loadGroceryScreen\(\)/.test(app) && /const loadGroceryScreen = \(\) => import\('@\/components\/GroceryScreen'\)/.test(app))

console.log('\n[2] The top bar carries the real menu')
const gAt = app.indexOf('<GroceryScreen')
const gProps = gAt < 0 ? '' : app.slice(gAt, app.indexOf('</Suspense>', gAt))
const header = gProps.match(/headerAction=\{\s*<ProfileMenu([\s\S]*?)\/>\s*\}/)
check('App hands the grocery top bar the real ProfileMenu', !!header, gProps.slice(-400))
check('...with App\'s own handlers: opening Profile and replaying the tour', !!header && /setProfileInfoOpen\(true\)/.test(header[1]) && /onReplayTour=\{replayAppTour\}/.test(header[1]), header?.[1])
check('...and the screen draws what it is handed, in its top bar', /\{headerAction\}/.test(screen))

console.log('\n[3] The chat button lies flat where something is docked on the bar')
const bar = app.match(/<BottomTabBar[^>]*\/>/)?.[0] ?? ''
const flat = (bar.match(/flatChatDisc=\{([^}]*)\}/) || [])[1] ?? ''
check('App tells the tab bar to lay the disc flat on the grocery screen', /\bgroceryFullScreen\b/.test(flat), bar)
check('...and on the chat', /activeTab\s*===\s*'chat'/.test(flat), bar)
check('...and nowhere else: the condition is exactly those two', flat.replace(/\s+/g, '') === "groceryFullScreen||activeTab==='chat'", flat)

console.log('\n[4] Every write goes through the store')
for (const fn of ['addItemLocal', 'editItemLocal', 'setCheckedLocal', 'deleteItemLocal', 'clearCheckedLocal', 'generateGroceryList']) {
  check(`the list writes with ${fn}(…)`, new RegExp(`\\b${fn}\\(`).test(list))
}
const both = list + screen
check('...and never reaches the database, the write queue or its storage key itself',
  !/from '@\/lib\/supabase'/.test(both) && !/\bsupabase\b/.test(both) && !/fitplan_grocery_pending/.test(both) && !/\bflushPending\b/.test(both),
  [/supabase/.test(both), /fitplan_grocery_pending/.test(both), /flushPending/.test(both)])

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('grocery screen: all checks passed')
