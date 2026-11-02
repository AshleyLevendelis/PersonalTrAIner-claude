// ---------------------------------------------------------------------------
// HOW MANY TAPS IS A WORKOUT? (2 Nov 2026, the UX pass, item 6). A MEASUREMENT, not a gate: it walks today's whole
// session on the whole app (app-boot.html, ?session-day) the way a lifter would, using the one big "Log set" button
// wherever it can, and counts every tap, every box that needed typing, and every sheet or question that came up in
// between, by kind. It prints the tally. PORT 9564.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9564, page: 'app-boot.html', name: 'tap-count' })
const { ev, check, until, wait, go, clickAt, shoot, finish, send } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const taps = { open: 0, start: 0, logSet: 0, typed: 0, dialog: 0, finish: 0, other: 0 }
const events = []
const tap = async (kind, expr, what) => { const ok = await clickAt(expr); if (ok) { taps[kind]++; events.push(`${kind}: ${what}`) } await wait(700); return ok }

await go('&session-day=1')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }

// From Home, the way she would get there: the session card opens Exercise.
await tap('open', `document.querySelector('[data-home-hero] button')`, 'Home session card → Exercise')
await wait(1500)
check('2. Exercise is open', await ev(`/exercise/.test(location.hash)`) === true, await ev('location.hash'))
const startExpr = `document.querySelector('[data-testid="hero-start"]')`
if (await ev(`!!${startExpr}`)) await tap('start', startExpr, 'Start session')
await wait(1200)

const planned = await ev(`(() => { const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/of (\\d+)/); return m ? +m[1] : null })()`)
const saved = () => ev(`(() => { const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/^(\\d+) of/); return m ? +m[1] : null })()`)
const openDialog = () => ev(`(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].find(x => x.getBoundingClientRect().height > 0); return d ? d.innerText.replace(/\\s+/g, ' ').slice(0, 160) : null })()`)

let guard = 0, warmupRows = 0
const nextLabel = () => ev(`document.querySelector('[data-next-set-button]')?.textContent.trim() ?? null`)
while (guard++ < 80) {
  const dlg = await openDialog()
  if (dlg) {
    events.push(`DIALOG: ${dlg}`)
    // Answer it the quickest way a lifter would: the first plain button in it.
    const ok = await tap('dialog', `[...[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].find(x => x.getBoundingClientRect().height > 0).querySelectorAll('button')].find(b => b.textContent.trim() && !/close/i.test(b.getAttribute('aria-label') || ''))`, 'answer the dialog')
    if (!ok) break
    continue
  }
  const label = await nextLabel()
  if (!label) break
  if (/warm/i.test(label)) warmupRows++
  // A box that needs a number first: the button focuses it. Type the prescription's own weight, the way she would.
  const focusBefore = await ev(`document.activeElement?.id ?? null`)
  await tap('logSet', `document.querySelector('[data-next-set-button]')`, label)
  const focusAfter = await ev(`document.activeElement?.tagName === 'INPUT' ? document.activeElement.id : null`)
  if (focusAfter && focusAfter !== focusBefore) {
    const ph = await ev(`document.activeElement.placeholder || '20'`)
    await send('Input.insertText', { text: String(ph).replace(/[^\d.]/g, '') || '20' })
    taps.typed++; events.push(`typed: ${ph} into ${focusAfter}`)
    await wait(300)
    taps.logSet++; await clickAt(`document.querySelector('[data-next-set-button]')`); await wait(700)
  }
}
const loggedSets = await saved()
await shoot('tap-count-end')
if (await ev(`!!${btn('/^Finish session$/')}`)) await tap('finish', btn('/^Finish session$/'), 'Finish session')
await wait(1200)
const dlgEnd = await openDialog()
if (dlgEnd) events.push(`END DIALOG: ${dlgEnd}`)

const total = Object.values(taps).reduce((a, b) => a + b, 0)
console.log('\n' + events.join('\n'))
console.log('\nTALLY', JSON.stringify({ planned, loggedSets, warmupRows, taps, total, perWorkingSet: loggedSets ? Math.round((total / loggedSets) * 100) / 100 : null }))
check('3. the whole session was logged', !!planned && loggedSets === planned, { planned, loggedSets })
await finish('tap-count measured')
