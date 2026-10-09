// ---------------------------------------------------------------------------
// THE CARDIO QUICK PICKS, ON A REAL SHEET, FOR TWO DIFFERENT KITS.
//
// Test log L14, 9 Oct 2026: a tester training at home with dumbbells opened
// "Add unplanned work → Cardio" and was offered Incline walk, Heavy bag,
// HIIT bike and Zone 2 — three of the four naming a machine or a bag he does
// not have. The list was one constant in the component.
//
// WHY A DRIVER. test:cardio-presets holds the two lists and that the sheet's
// source asks for them by tier. It cannot tell whether the tier ever REACHES
// the sheet: the prop passes through two components, and a missing prop is
// not an error — it is the no-kit list for everybody, which a source check on
// either end would pass. So this opens the same sheet under two profiles and
// reads the chips that were actually drawn. Two profiles, because one cannot
// test a choice.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9750', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9750/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// Anything naming cardio kit a home trainee has not been promised.
const NEEDS_KIT = /treadmill|incline|bike|cycl|assault|bag|row(er|ing)|ellipt|rope|swim/i

/** Open "Add unplanned work", switch to Cardio, and read the chips as drawn. */
const readChips = async () => {
  const opened = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(n => /Add unplanned work/.test(n.textContent || ''))
    if (!b) return false
    b.scrollIntoView({ block: 'center' }); b.click(); return true
  })()`)
  await wait(700)
  const cardio = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(n => (n.textContent || '').trim() === 'Cardio')
    if (!b) return false
    b.click(); return true
  })()`)
  await wait(700)
  const chips = await ev(`(() => {
    const box = document.querySelector('[data-testid="cardio-unplanned"]')
    if (!box) return null
    box.scrollIntoView({ block: 'center' })
    const vw = window.innerWidth
    return [...box.querySelectorAll('[role="radio"]')].map(n => {
      const r = n.getBoundingClientRect()
      const label = n.querySelector('span')
      return {
        text: (n.innerText || '').replace(/\\s+/g, ' ').trim(),
        label: (label?.textContent || '').trim(),
        inside: r.left >= 0 && r.right <= vw && r.width > 0,
        // A truncated label is a label nobody can read.
        cut: !!label && label.scrollWidth > label.clientWidth + 1,
        h: Math.round(r.height),
      }
    })
  })()`)
  return { opened, cardio, chips }
}

console.log('\nCARDIO QUICK PICKS FOLLOW THE KIT\n')

// --- 1. A full gym keeps the list it always had -----------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=1#/tab/exercise` })
await wait(4500)
const gym = await readChips()
check('1a. the sheet opens and has a Cardio side (full gym)', gym.opened === true && gym.cardio === true && Array.isArray(gym.chips), gym)
const gymLabels = (gym.chips ?? []).map(c => c.label)
check('1b. a full gym is offered what it always was', JSON.stringify(gymLabels) === JSON.stringify(['Incline walk', 'Heavy bag', 'HIIT bike', 'Zone 2', 'Other']), gymLabels)
check('1c. ...and the detector below has teeth: those DO name kit', gymLabels.filter(l => NEEDS_KIT.test(l)).length >= 3, gymLabels)
await shoot('cardio-presets-gym')

// --- 2. A home gym is offered things it can do ------------------------------
// ?legcurl=1 is the harness's home-gym profile. A different address, so this
// is a real load and not a same-page jump to the fragment.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1&load=2#/tab/exercise` })
await wait(4500)
const home = await readChips()
check('2a. the sheet opens and has a Cardio side (home gym)', home.opened === true && home.cardio === true && Array.isArray(home.chips), home)
const homeLabels = (home.chips ?? []).map(c => c.label)
check('2b. a home gym is offered four it can do, plus Other', JSON.stringify(homeLabels) === JSON.stringify(['Brisk walk', 'Run', 'Circuit', 'Zone 2', 'Other']), homeLabels)
check('2c. ...none of them naming a treadmill, a bike or a bag', homeLabels.filter(l => NEEDS_KIT.test(l)).length === 0, homeLabels.filter(l => NEEDS_KIT.test(l)))
check('2d. ...and it is not simply the gym list again', JSON.stringify(homeLabels) !== JSON.stringify(gymLabels), { homeLabels, gymLabels })
check('2e. every chip is on screen, a real tap target, with its label readable in full',
  (home.chips ?? []).length === 5 && home.chips.every(c => c.inside && !c.cut && c.h >= 44), home.chips)
check('2f. each quick pick shows its minutes', (home.chips ?? []).slice(0, 4).every(c => /\d+ min/.test(c.text)), (home.chips ?? []).map(c => c.text))
await shoot('cardio-presets-home')

// --- 3. Choosing one fills the row; nothing is logged by the tap ------------
const picked = await ev(`(() => { const b = document.querySelector('[data-testid="quick-log-brisk-walk"]'); if (!b) return null; b.click(); return true })()`)
await wait(500)
const after = await ev(`(() => {
  const box = document.querySelector('[data-testid="cardio-unplanned"]')
  const chip = document.querySelector('[data-testid="quick-log-brisk-walk"]')
  // The suggestion is shown as the box's faint number until she types over
  // it, so the figure on screen is the value OR the placeholder.
  const mins = box && [...box.querySelectorAll('input')].map(i => i.value || i.placeholder)
  const effort = box && [...box.querySelectorAll('[aria-checked="true"], [aria-pressed="true"], [data-state="on"]')].map(n => (n.textContent || '').trim())
  return { chosen: chip?.getAttribute('aria-checked'), mins, effort }
})()`)
check('3a. tapping "Brisk walk" selects it', picked === true && after?.chosen === 'true', after)
check('3b. ...and puts its 20 minutes in the box', Array.isArray(after?.mins) && after.mins.includes('20'), after)
check('3c. ...with its effort chosen for her: a brisk walk is Easy', Array.isArray(after?.effort) && after.effort.some(t => /^Easy$/.test(t)), after)
await shoot('cardio-presets-home-picked')

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe quick picks are ones the kit can do.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
