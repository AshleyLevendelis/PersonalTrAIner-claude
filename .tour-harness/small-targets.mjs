// ---------------------------------------------------------------------------
// THE CONTROLS INSIDE MENUS, SHEETS AND THE REST TIMER CAN BE HIT BY A THUMB (2 Nov 2026, the UX pass, item 3:
// "readable and tappable on a gym floor"). verify:tap-targets walks the tabs as they open; the whole-app test found
// the small ones one tap further in: every ⋮ / ⋯ menu item 32px, the What-happened options 36px, the rest timer's
// −30s / +30s / Skip 28px, the "Why this weight" ⓘ 10px, Profile's boxes and dropdowns 28px.
//
// ASKED THE WAY A THUMB ASKS IT, the tap-targets rule: a point 21px above, below, left and right of the control's
// centre must land on the control (or off the screen). A hit-slop's ::after counts, a bounding box alone does not.
// Whole app (app-boot.html), a training day. PORT 9553.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9553, page: 'app-boot.html', name: 'small-targets' })
const { ev, send, check, until, wait, go, clickAt, shoot, finish } = d

/** In the page: every element matched, each with whether a thumb reaches it. */
const REACH = `(sel, text) => [...document.querySelectorAll(sel)].filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (!text || new RegExp(text).test((el.textContent || '').trim())) }).map(el => {
  // A DISABLED CONTROL CANNOT BE TAPPED AT ALL ("Move earlier" on the first exercise, "−30s" under 30s left): sized, not hit.
  const off = el.hasAttribute('disabled') || el.hasAttribute('data-disabled') || el.getAttribute('aria-disabled') === 'true'
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
  const b = el.getBoundingClientRect()
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2, R = 21
  const ok = [[0, -R], [0, R], [-R, 0], [R, 0]].every(([dx, dy]) => {
    const x = cx + dx, y = cy + dy
    if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return true
    const hit = document.elementFromPoint(x, y)
    return !!hit && (hit === el || el.contains(hit))
  })
  return { off, label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40), h: Math.round(b.height), w: Math.round(b.width), ok }
})`
const reach = (sel, text = '') => ev(`(${REACH})(${JSON.stringify(sel)}, ${JSON.stringify(text)})`)
const small = list => (list ?? []).filter(x => x.off ? x.h < 44 : !x.ok)
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(500) }

await go('&session-day=1')
check('0. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }

// --- 1. Exercise: an exercise's ⋮ menu ---------------------------------------------------------------------------
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
check('1a. an exercise row has its ⋮', await clickAt(`document.querySelector('button[aria-label="Exercise options"]')`))
await wait(700)
const rowMenu = await reach('[role="menuitem"]')
check('1b. ...its menu has items', (rowMenu ?? []).length >= 2, rowMenu)
check('1c. ...and a thumb reaches every one', (rowMenu ?? []).length >= 2 && small(rowMenu).length === 0, small(rowMenu))
await shoot('small-targets-row-menu')
await escape()

// --- 2. The day's ⋯ menu and the What-happened sheet ---------------------------------------------------------------
check('2a. the day has its ⋯', await clickAt(`document.querySelector('button[aria-label="More options"]')`))
await wait(700)
const dayMenu = await reach('[role="menuitem"]')
check('2b. ...and a thumb reaches every item in it', (dayMenu ?? []).length >= 1 && small(dayMenu).length === 0, small(dayMenu).length ? small(dayMenu) : dayMenu)
await clickAt(`document.querySelector('[data-testid="what-happened-item"]')`); await wait(900)
const verbs = await reach('[data-testid="what-happened-sheet"] [data-verb]')
check('2c. the What-happened options are all reachable', (verbs ?? []).length >= 3 && small(verbs).length === 0, small(verbs).length ? small(verbs) : verbs)
await shoot('small-targets-what-happened')
await escape()

// --- 3. "Why this weight" -----------------------------------------------------------------------------------------
// The ⓘ sits on an opened lift: open the first loaded one (a row whose summary carries a weight).
await clickAt(`[...document.querySelectorAll('[data-exercise-name]')].find(n => /~\\d/.test(n.innerText) && !n.querySelector('button[aria-label="Why this weight"]'))?.querySelector('h3, [data-exercise-title], p, span') ?? null`)
await wait(900)
const why = await reach('button[aria-label="Why this weight"]')
check('3. every "Why this weight" ⓘ is reachable', (why ?? []).length >= 1 && small(why).length === 0, small(why).length ? small(why) : why)

// --- 4. The rest timer, after a set is logged -------------------------------------------------------------------------
const started = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Start session$/.test((x.textContent || '').trim())); if (b) b.click(); return !!b })()`)
await wait(1200)
// The running button logs the set it names ("Log set 1 · Box Jumps × 8"), the way she logs one mid-session.
const ticked = await clickAt(`[...document.querySelectorAll('button')].find(b => /^Log set \\d/.test((b.textContent || '').trim()))`)
// MEASURED IN THE SAME READ THAT FINDS IT: the dock can be drawn and redrawn between two reads.
const dock = await until(() => reach('button', '^(−30s|\\+30s|Skip ▸)$'), v => Array.isArray(v) && v.length === 3, 160)
const restBtns = (dock ?? []).filter(x => /^(−30s|\+30s|Skip ▸)$/.test(x.label))
check('4a. a logged set starts the rest timer, with −30s, +30s and Skip', started !== null && ticked && restBtns.length === 3, { started, ticked, found: restBtns })
check('4b. ...and a thumb reaches each', restBtns.length === 3 && small(restBtns).length === 0, restBtns)
await shoot('small-targets-rest')

// --- 5. Profile: a sheet's boxes and dropdowns ------------------------------------------------------------------
const named = re => `[...document.querySelectorAll('button,[role=menuitem]')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`
// The gear itself (QA round 3, 8 Nov 2026): a 32px icon with no tap area round it.
const gear = await reach('button[aria-label="Profile and settings"]')
check('5-. the settings gear is there, and a thumb reaches it', (gear ?? []).length >= 1 && small(gear).length === 0, gear)
await clickAt(named('/Profile and settings/')); await wait(600)
await clickAt(named('/^Profile$/')); await wait(1500)
const opened = await clickAt(`[...document.querySelectorAll('[data-profile-page] button')].find(b => b.textContent.trim().startsWith('Height & weight'))`)
await wait(1200)
const fields = await reach('[data-profile-sheet] input, [data-profile-sheet] select, [data-profile-sheet] [role="combobox"]')
check('5a. a Profile sheet opens with its fields', opened && (fields ?? []).length >= 2, { opened, fields })
check('5b. ...and a thumb reaches every box and dropdown', (fields ?? []).length >= 2 && small(fields).length === 0, small(fields))
await shoot('small-targets-profile')

await finish('verify:small-targets PASSED')
