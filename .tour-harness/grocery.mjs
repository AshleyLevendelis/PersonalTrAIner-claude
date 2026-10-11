// ---------------------------------------------------------------------------
// verify:grocery — THE GROCERY SCREEN (design 3a/3b), ON THE REAL COMPONENT AT
// 390x844, 27 Sep 2026.
//
// Everything Ashley's brief asked to be verified, on grocery.html: the real
// GroceryScreen over a fake database seeded with a believable week's shop, the
// real grocery store behind it, the real tab bar under it. Every write is read
// back from the store's own destination (the fake database, once the write
// queue has flushed), never from what the screen says it did.
//
// Every check runs every time with a null-safe subject, so a broken feature
// prints the same number of checks as a working one.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0].split('#')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/grocery.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const PORT = 9493
const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
async function call(fn, ...args) {
  const r = await send('Runtime.evaluate', { expression: `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}
// A REAL TAP at a point, for Radix menus, which open on pointerdown.
const tapAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
}

let failures = 0, ran = 0
const check = (l, ok, extra) => {
  ran++
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}
const near = (a, b, tol = 1) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message)));` })
const open = async (query = '') => {
  await call(() => { try { localStorage.clear() } catch {} return true }).catch(() => {})
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` })
  let up = false
  for (let i = 0; i < 30 && !up; i++) { await wait(300); up = await call(() => !!document.querySelector('[data-testid="grocery-hero"]')) }
  await wait(600)
}

// ---- page-side helpers, passed by source into each call -------------------
const H = `
  const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height } }
  const q = s => document.querySelector(s)
  const qa = s => [...document.querySelectorAll(s)]
  const row = name => qa('[data-testid="grocery-row"]').find(r => r.dataset.item === name) || null
  const aisleOf = name => { const r = row(name); return r ? r.closest('[data-testid="grocery-aisle"]')?.dataset.aisle ?? null : null }
  const dbRow = name => (window.__fakeDb?.grocery_items ?? []).find(r => r.display_name === name) || null
  const setVal = (el, v) => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  const enter = el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
`
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const page = async (body, ...args) => call(new AsyncFunction('...args', `${H}\n${body}`), ...args)

await open()

console.log('\n[1] At rest: a full page, and the hero, chips and first aisle without scrolling')
const R = await page(`
  const nav = q('nav[aria-label="Primary"]')
  const disc = nav ? [...nav.querySelectorAll('button')].find(b => /^Chat/.test(b.getAttribute('aria-label') || '')) : null
  const topbar = q('[data-testid="grocery-topbar"]')
  const back = topbar ? [...topbar.querySelectorAll('button')].find(b => /Nutrition/.test(b.textContent)) : null
  const title = q('[data-testid="grocery-hero"] h1')
  const firstAisle = q('[data-testid="grocery-aisle"]')
  const firstRow = firstAisle?.querySelector('[data-testid="grocery-row"]')
  const ring = q('[data-testid="grocery-ring"]')
  const left = q('[data-testid="grocery-left"]')
  const cs = e => e ? getComputedStyle(e) : null
  return {
    vw: innerWidth, vh: innerHeight,
    screen: box(q('[data-testid="grocery-screen"]')), topbar: box(topbar), nav: box(nav), disc: box(disc),
    back: back ? { box: box(back), text: back.textContent.trim() } : null,
    share: box(q('[data-testid="grocery-share"]')), gear: box(topbar?.querySelector('button[aria-label="Profile and settings"]')),
    hero: box(q('[data-testid="grocery-hero"]')), chips: box(q('[data-testid="grocery-chips"]')),
    firstAisle: firstAisle?.dataset.aisle ?? null, firstRow: box(firstRow), addbar: box(q('[data-testid="grocery-addbar"]')),
    title: title ? { text: title.textContent.trim(), size: parseFloat(cs(title).fontSize), weight: cs(title).fontWeight } : null,
    ring: box(ring), ringCount: q('[data-testid="grocery-ring-count"]')?.textContent.trim() ?? null,
    left: left ? { text: left.textContent.trim(), size: parseFloat(cs(left).fontSize) } : null,
    compactOpacity: cs(q('[data-testid="grocery-compact-title"]'))?.opacity ?? null,
    chipList: qa('[data-testid="grocery-chip"]').map(c => ({ aisle: c.dataset.aisle, text: c.textContent.trim(), h: c.getBoundingClientRect().height, on: c.getAttribute('aria-pressed') === 'true', bg: cs(c).backgroundColor, border: cs(c).borderTopColor })),
    tokens: (() => { const d = document.createElement('div'); document.body.appendChild(d); d.style.backgroundColor = 'var(--surface-raised)'; d.style.borderTopColor = 'rgba(var(--glow-rgb), .4)'; d.style.color = 'rgba(var(--glow-rgb), .14)'; const s = getComputedStyle(d); const v = { raised: s.backgroundColor, onBorder: s.borderTopColor, onBg: s.color }; d.remove(); return v })(),
    rowText: Object.fromEntries(qa('[data-testid="grocery-row"]').map(r => [r.dataset.item, { purpose: r.querySelector('[data-testid="grocery-purpose"]')?.textContent.trim() ?? null, qty: r.querySelector('[data-testid="grocery-qty"]')?.textContent.trim() ?? null, buttons: r.querySelectorAll('button').length, labels: [...r.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()) }])),
    warnColor: (() => { const r = row('Harissa paste'); const s = r?.querySelector('[data-testid="grocery-purpose"] span'); return s ? cs(s).color : null })(),
    warnToken: (() => { const d = document.createElement('div'); d.style.color = 'var(--role-warn-text)'; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v })(),
    bodyText: document.body.innerText,
  }
`)
check('the screen is the page: from the top of the screen to the tab bar, full width', !!R.screen && near(R.screen.top, 0) && near(R.screen.bottom, R.nav?.top) && near(R.screen.width, R.vw), { screen: R.screen, nav: R.nav?.top })
check('a 52px top bar: "Nutrition" back at the left, Share (40px) and the settings gear at the right',
  !!R.topbar && near(R.topbar.height, 52) && !!R.back && /Nutrition/.test(R.back.text) && R.back.box.left < 40 && !!R.share && near(R.share.width, 40) && !!R.gear && R.gear.left >= R.share.right - 1,
  { topbar: R.topbar, back: R.back, share: R.share, gear: R.gear })
check('the hero, the chips and the first aisle\'s first row are all on screen without scrolling',
  !!R.hero && !!R.chips && !!R.firstRow && R.chips.bottom < R.addbar?.top && R.firstRow.bottom <= R.addbar.top && R.firstAisle === 'produce',
  { hero: R.hero?.bottom, chips: R.chips?.bottom, firstRow: R.firstRow?.bottom, addbar: R.addbar?.top, first: R.firstAisle })
check('"Grocery" 28px bold; the ring 92px reading 3/15; 12 left at 46px', R.title?.text === 'Grocery' && R.title.size === 28 && Number(R.title.weight) >= 700 && near(R.ring?.width, 92) && R.ringCount === '3/15' && R.left?.text === '12' && R.left.size === 46 && /ITEMS LEFT/i.test(R.bodyText), { title: R.title, ring: R.ring?.width, count: R.ringCount, left: R.left })
check('the compact title is hidden while the hero is on screen', R.compactOpacity === '0', R.compactOpacity)
const chipAisles = (R.chipList || []).map(c => c.aisle).join()
check('one chip per aisle with something left in it (Frozen\'s only item is in the trolley), each counting what is left',
  chipAisles === 'produce,meat_fish,dairy,dry_goods' && (R.chipList || []).map(c => c.text).join('|') === 'Produce4|Meat & fish3|Dairy & eggs3|Dry goods2', R.chipList)
check('chips are 32px; the first aisle\'s chip is the active one, lit from the accent\'s own glow',
  (R.chipList || []).length === 4 && R.chipList.every(c => near(c.h, 32)) && R.chipList[0].on && R.chipList.slice(1).every(c => !c.on)
  && R.chipList[0].border === R.tokens.onBorder && R.chipList[0].bg === R.tokens.onBg && R.chipList[1].bg === R.tokens.raised,
  { chips: R.chipList, tokens: R.tokens })
check('the add bar sits straight on the tab bar, and the chat button lies flat (44px) inside the bar',
  !!R.addbar && near(R.addbar.bottom, R.nav?.top) && !!R.disc && near(R.disc.width, 44) && R.disc.top >= R.nav.top - 0.5,
  { addbar: R.addbar?.bottom, nav: R.nav?.top, disc: R.disc })
const rt = R.rowText || {}
check('a row says what it is FOR: "Dinner ×3", and the two biggest uses when there are two', rt['Broccoli']?.purpose === 'Dinner ×3' && rt['Brown rice']?.purpose === 'Lunch ×3 · Dinner ×2' && rt['Banana']?.purpose === 'Breakfast ×6', { broccoli: rt['Broccoli'], rice: rt['Brown rice'] })
check('...and a rough estimate says so, in the warning colour, with no "unmatched" badge', rt['Harissa paste']?.purpose === 'Rough estimate · tap to set the amount' && R.warnColor === R.warnToken && !/unmatched/i.test(R.bodyText), { harissa: rt['Harissa paste'], color: R.warnColor, token: R.warnToken })
check('amounts as you would pick them up: "2 heads", "6 bananas", "~1.2kg", "2 fillets"', rt['Broccoli']?.qty === '2 heads' && rt['Banana']?.qty === '6 bananas' && rt['Chicken breast']?.qty === '~1.2kg' && rt['Salmon fillet']?.qty === '2 fillets', { b: rt['Broccoli']?.qty, ba: rt['Banana']?.qty, c: rt['Chicken breast']?.qty, s: rt['Salmon fillet']?.qty })
check('a closed row has just its tick and itself: no pencil, no bin, no "from N meals"',
  Object.keys(rt).length >= 12 && Object.values(rt).every(r => r.buttons === 2) && !/from \d+ meals?/i.test(R.bodyText) && !Object.values(rt).some(r => r.labels.some(l => /^Edit |^Remove /.test(l))),
  Object.entries(rt).filter(([, r]) => r.buttons !== 2))
check('the old 3d/7d/14d buttons, "Regenerate" and the loose "Clear checked" are gone', !/\b(3d|7d|14d)\b/.test(R.bodyText) && !/Regenerate/.test(R.bodyText) && !/Clear checked/.test(R.bodyText), R.bodyText.match(/\b(3d|7d|14d)\b|Regenerate|Clear checked/g))
await shoot('grocery-rest')

console.log('\n[2] Scrolling: the chips stick, follow the aisle, and the compact title arrives')
const S = await page(`
  const s = q('[data-testid="grocery-scroller"]'), meat = qa('[data-testid="grocery-aisle-heading"]')[1]
  const bar = q('[data-testid="grocery-chips"]')
  if (!s || !meat || !bar) return null
  s.scrollTop = meat.offsetTop - bar.offsetHeight - 12
  s.dispatchEvent(new Event('scroll'))
  await new Promise(r => setTimeout(r, 450))
  const t = q('[data-testid="grocery-compact-title"]')
  return {
    compact: t ? { opacity: getComputedStyle(t).opacity, text: t.textContent.trim() } : null,
    chips: box(bar), topbar: box(q('[data-testid="grocery-topbar"]')),
    active: qa('[data-testid="grocery-chip"]').filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.aisle),
  }
`)
check('with the hero scrolled away, the compact title reads "Grocery · 12 left"', S?.compact?.opacity === '1' && /^Grocery · 12 left$/.test(S.compact.text), S?.compact)
check('the chips stick straight under the top bar', !!S && near(S.chips.top, S.topbar.bottom), S && { chips: S.chips.top, topbar: S.topbar.bottom })
check('the active chip follows the aisle at the top of the list (Meat & Fish)', S?.active?.join() === 'meat_fish', S?.active)
// ONE CANDIDATE CANNOT TEST A CHOICE: the bottom rule below must pick the LAST
// aisle on screen, with earlier ones on screen too.
const SB = await page(`
  const s = q('[data-testid="grocery-scroller"]')
  if (!s) return null
  s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll'))
  await new Promise(r => setTimeout(r, 300))
  const bottom = s.getBoundingClientRect().bottom
  return { onScreen: qa('[data-testid="grocery-aisle-heading"]').filter(h => h.getBoundingClientRect().top < bottom).length, active: qa('[data-testid="grocery-chip"]').filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.aisle) }
`)
check('scrolled to the very end, the last aisle on screen is the one lit (Dry Goods), not one scrolled past', SB?.active?.join() === 'dry_goods' && SB.onScreen >= 2, SB)
await page(`const s = q('[data-testid="grocery-scroller"]'); s.scrollTop = 0; s.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 200)); return true`)
const J = await page(`
  const chip = qa('[data-testid="grocery-chip"]').find(c => c.dataset.aisle === 'meat_fish')
  if (!chip) return null
  chip.click()
  await new Promise(r => setTimeout(r, 900))
  const heading = qa('[data-testid="grocery-aisle-heading"]')[1], bar = q('[data-testid="grocery-chips"]')
  return { headingTop: box(heading).top, barBottom: box(bar).bottom, active: qa('[data-testid="grocery-chip"]').filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.aisle) }
`)
check('tapping a chip brings its aisle up under the chips, and lights it', !!J && near(J.headingTop, J.barBottom + 12, 3) && J.active.join() === 'meat_fish', J)
// ...and the highlight lets go once the list moves away from where the tap
// left it — by any means, not only a finger (here a plain scroll to the top).
const J2 = await page(`
  await new Promise(r => setTimeout(r, 400))
  const s = q('[data-testid="grocery-scroller"]'); s.scrollTop = 0; s.dispatchEvent(new Event('scroll'))
  await new Promise(r => setTimeout(r, 300))
  return qa('[data-testid="grocery-chip"]').filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.aisle)
`)
check('...and lets go when the list is scrolled away from it (back to Produce at the top)', J2.join() === 'produce', J2)

console.log('\n[3] One row opens at a time, into a stepper that writes through the store')
const tapRow = name => page(`const r = row(args[0]); const b = r && [...r.querySelectorAll('button')].find(x => x.getAttribute('aria-expanded') === 'false'); b?.click(); await new Promise(r => setTimeout(r, 250)); return !!b`, name)
await tapRow('Chicken breast')
const E1 = await page(`
  const r = row('Chicken breast')
  return {
    expanded: qa('[data-testid="grocery-row"][data-expanded="true"]').map(x => x.dataset.item),
    readout: r?.querySelector('[data-testid="grocery-readout"]')?.textContent.trim() ?? null,
    exact: r?.querySelector('[data-testid="grocery-exact"]')?.textContent.trim() ?? null,
    meals: [...(r?.querySelectorAll('[data-testid="grocery-meals"] li') ?? [])].map(l => l.textContent.trim()),
  }
`)
check('the row opens in place, the only one open', E1.expanded.join() === 'Chicken breast', E1.expanded)
check('...with the rounded amount on the stepper and the exact figure beside it', E1.readout === '1.2 kg' && E1.exact === 'exact 1,180g', E1)
check('...and the meals it came from, weekdays named from the day the list was built: three, then "+2 more"',
  E1.meals.length === 4 && E1.meals[0] === 'Wed · Lunch · Chicken rice bowl' && E1.meals[2] === 'Sat · Lunch · Chicken & greens wrap' && E1.meals[3] === '+2 more', E1.meals)
const E1b = await page(`const r = row('Chicken breast'); const more = [...r.querySelectorAll('[data-testid="grocery-meals"] button')][0]; more?.click(); await new Promise(r => setTimeout(r, 150)); return [...r.querySelectorAll('[data-testid="grocery-meals"] li')].map(l => l.textContent.trim())`)
check('"+2 more" opens the rest', E1b.length === 5 && !E1b.some(l => /more$/.test(l)), E1b)
await shoot('grocery-open')
const step = (name, which, times = 1) => page(`
  for (let i = 0; i < args[2]; i++) { row(args[0])?.querySelector('[data-testid="grocery-' + args[1] + '"]')?.click(); await new Promise(r => setTimeout(r, 120)) }
  await new Promise(r => setTimeout(r, 400))
  const r = row(args[0])
  return { readout: r?.querySelector('[data-testid="grocery-readout"]')?.textContent.trim() ?? null, exact: r?.querySelector('[data-testid="grocery-exact"]')?.textContent.trim() ?? null, stored: dbRow(args[0])?.quantity ?? null, minusDisabled: !!r?.querySelector('[data-testid="grocery-minus"]')?.disabled }
`, name, which, times)
const P1 = await step('Chicken breast', 'plus')
check('plus steps a weight by the amount it is shown in (1.2 kg → 1.3 kg), and the store holds 1,300g', P1.readout === '1.3 kg' && P1.stored === 1300, P1)
const P2 = await step('Chicken breast', 'minus', 2)
check('minus steps back down the same grid (1.1 kg), in the store too', P2.readout === '1.1 kg' && P2.stored === 1100, P2)
await tapRow('Broccoli')
const B0 = await page(`return { expanded: qa('[data-testid="grocery-row"][data-expanded="true"]').map(x => x.dataset.item), readout: row('Broccoli')?.querySelector('[data-testid="grocery-readout"]')?.textContent.trim() ?? null }`)
check('opening another row closes the first', B0.expanded.join() === 'Broccoli', B0.expanded)
const B1 = await step('Broccoli', 'plus')
check('a counted item steps a whole unit: 2 heads → 3 heads, stored as three heads\' weight (900g)', B0.readout === '2 heads' && B1.readout === '3 heads' && B1.stored === 900 && B1.exact === 'exact 900g', { B0, B1 })
const B2 = await step('Broccoli', 'minus', 2)
check('...and at one head the minus stops, rather than offering none', B2.readout === '1 head' && B2.stored === 300 && B2.minusDisabled === true, B2)
const T1 = await page(`
  const r = row('Broccoli'); r?.querySelector('[data-testid="grocery-readout"]')?.click()
  await new Promise(r => setTimeout(r, 150))
  const input = row('Broccoli')?.querySelector('input[data-field="grocery-qty"]')
  if (!input) return null
  setVal(input, '0'); enter(input)
  await new Promise(r => setTimeout(r, 300))
  const after = row('Broccoli')?.querySelector('input[data-field="grocery-qty"]')
  return { error: row('Broccoli')?.querySelector('[data-testid="grocery-edit-error"]')?.textContent.trim() ?? null, kept: after?.value ?? null, stored: dbRow('Broccoli')?.quantity ?? null }
`)
check('a typed 0 is refused with the reason, and the typed value is kept in the box', !!T1 && /between 0 and 100,000/.test(T1.error || '') && T1.kept === '0' && T1.stored === 300, T1)
const T2 = await page(`
  const input = row('Broccoli')?.querySelector('input[data-field="grocery-qty"]')
  if (!input) return null
  setVal(input, '450'); enter(input)
  await new Promise(r => setTimeout(r, 400))
  const r = row('Broccoli')
  return { input: !!r?.querySelector('input[data-field="grocery-qty"]'), error: !!r?.querySelector('[data-testid="grocery-edit-error"]'), exact: r?.querySelector('[data-testid="grocery-exact"]')?.textContent.trim() ?? null, stored: dbRow('Broccoli')?.quantity ?? null }
`)
check('...and a good exact figure is saved (450g) and the error goes', !!T2 && !T2.input && !T2.error && T2.exact === 'exact 450g' && T2.stored === 450, T2)
const N1 = await page(`
  const btn = row('Broccoli')?.querySelector('button[aria-label^="Rename"]'); btn?.click()
  await new Promise(r => setTimeout(r, 150))
  const input = document.querySelector('input[data-field="grocery-name"]')
  if (!input) return null
  setVal(input, 'Tenderstem broccoli'); enter(input)
  await new Promise(r => setTimeout(r, 400))
  return { renamed: !!row('Tenderstem broccoli'), stored: (window.__fakeDb?.grocery_items ?? []).find(r => r.id === 'g-1')?.display_name ?? null }
`)
check('tapping the name renames it, saved through the store', !!N1 && N1.renamed && N1.stored === 'Tenderstem broccoli', N1)
const D1 = await page(`
  row('Tenderstem broccoli')?.querySelector('[data-testid="grocery-done"]')?.click()
  await new Promise(r => setTimeout(r, 200))
  return { expanded: qa('[data-testid="grocery-row"][data-expanded="true"]').length }
`)
check('Done closes the row', D1.expanded === 0, D1)
await tapRow('Cheddar')
const X1 = await page(`
  row('Cheddar')?.querySelector('[data-testid="grocery-remove"]')?.click()
  await new Promise(r => setTimeout(r, 400))
  const db = (window.__fakeDb?.grocery_items ?? []).find(r => r.id === 'g-9')
  return { onScreen: !!row('Cheddar'), dismissed: db ? db.dismissed === true : true, chip: qa('[data-testid="grocery-chip"]').find(c => c.dataset.aisle === 'dairy')?.textContent.trim() ?? null }
`)
check('Remove takes it off the list, through the store, and the aisle\'s count follows', !X1.onScreen && X1.dismissed && X1.chip === 'Dairy & eggs2', X1)

console.log('\n[4] A tick lands, waits a beat, leaves — and Undo brings it back')
const K0 = await page(`
  const r = row('Spinach'); r?.querySelector('[data-testid="grocery-check"]')?.click()
  // Read inside the 600ms beat but after the 150ms colour and fade transitions.
  await new Promise(r => setTimeout(r, 330))
  const r2 = row('Spinach'), c = r2?.querySelector('[data-testid="grocery-check"]'), toast = q('[data-testid="grocery-toast"]'), bar = q('[data-testid="grocery-addbar"]')
  const primary = (() => { const d = document.createElement('div'); d.style.backgroundColor = 'var(--primary)'; document.body.appendChild(d); const v = getComputedStyle(d).backgroundColor; d.remove(); return v })()
  return {
    stillInAisle: aisleOf('Spinach'), opacity: r2 ? getComputedStyle(r2).opacity : null,
    struck: r2 ? getComputedStyle(r2.querySelector('button[aria-expanded] span span')).textDecorationLine : null,
    filled: c ? getComputedStyle(c).backgroundColor === primary : false, glow: c ? getComputedStyle(c).boxShadow : null,
    toast: toast ? toast.textContent.trim() : null, toastBottom: box(toast)?.bottom ?? null, barTop: box(bar)?.top ?? null,
    stored: dbRow('Spinach')?.checked ?? null,
  }
`)
check('the tick fills the circle with the main colour and its glow', K0.filled && /px/.test(K0.glow || ''), K0)
check('the row stays in its aisle, struck through at 55%, for a beat', K0.stillInAisle === 'produce' && K0.opacity === '0.55' && /line-through/.test(K0.struck || ''), K0)
check('a toast says "Spinach — in the trolley", 12px above the add bar', /^Spinach — in the trolley\s*Undo$/.test(K0.toast || '') && near(K0.toastBottom, K0.barTop - 12, 1.5), K0)
await wait(800)
const K1 = await page(`return { aisle: aisleOf('Spinach'), trolley: q('[data-testid="grocery-trolley-summary"]')?.textContent.trim() ?? null, ring: q('[data-testid="grocery-ring-count"]')?.textContent.trim() ?? null, left: q('[data-testid="grocery-left"]')?.textContent.trim() ?? null, stored: dbRow('Spinach')?.checked ?? null }`)
check('after the beat it has left the aisle and is in the trolley, written through the store', K1.aisle === null && /^4 items · .*Spinach/.test(K1.trolley || '') && K1.stored === true, K1)
check('...and the ring and the count moved (4/14, 10 left)', K1.ring === '4/14' && K1.left === '10', K1)
const U1 = await page(`
  q('[data-testid="grocery-undo"]')?.click()
  await new Promise(r => setTimeout(r, 400))
  return { aisle: aisleOf('Spinach'), toast: !!q('[data-testid="grocery-toast"]'), trolley: q('[data-testid="grocery-trolley-summary"]')?.textContent.trim() ?? null, stored: dbRow('Spinach')?.checked ?? null }
`)
check('Undo puts it back in its aisle, off the trolley, in the store too, and the toast goes', U1.aisle === 'produce' && !U1.toast && /^3 items/.test(U1.trolley || '') && U1.stored === false, U1)
const K2 = await page(`
  row('Banana')?.querySelector('[data-testid="grocery-check"]')?.click(); await new Promise(r => setTimeout(r, 150))
  row('Sweet potato')?.querySelector('[data-testid="grocery-check"]')?.click(); await new Promise(r => setTimeout(r, 150))
  return qa('[data-testid="grocery-toast"]').map(t => t.textContent.trim())
`)
check('a newer tick replaces the toast — one toast, the latest item', K2.length === 1 && /^Sweet potato — in the trolley/.test(K2[0]), K2)
await wait(5300)
const K3 = await page(`return !!q('[data-testid="grocery-toast"]')`)
check('the toast leaves on its own after five seconds', K3 === false, K3)

console.log('\n[5] The trolley: what is in it, Put back, and Clear')
const Y0 = await page(`
  const t = q('[data-testid="grocery-trolley"]'), sum = q('[data-testid="grocery-trolley-summary"]')
  const toggle = t ? [...t.querySelectorAll('button')].find(b => b.getAttribute('aria-expanded') !== null) : null
  toggle?.click(); await new Promise(r => setTimeout(r, 200))
  const back = t ? [...t.querySelectorAll('button')].find(b => /Put Oats back/.test(b.getAttribute('aria-label') || '')) : null
  const summary = sum?.textContent.trim() ?? null
  back?.click(); await new Promise(r => setTimeout(r, 400))
  return { summary, hadPutBack: !!back, oatsAisle: aisleOf('Oats'), stored: dbRow('Oats')?.checked ?? null }
`)
check('the trolley says how many and what: "5 items · …"', /^5 items · /.test(Y0.summary || '') && ['Peanut butter', 'Frozen berries', 'Oats', 'Banana', 'Sweet potato'].every(n => (Y0.summary || '').includes(n)), Y0.summary)
check('...opens to "Put back", which returns an item to its aisle through the store', Y0.hadPutBack && Y0.oatsAisle === 'dry_goods' && Y0.stored === false, Y0)
const Y1 = await page(`
  q('[data-testid="grocery-clear"]')?.click(); await new Promise(r => setTimeout(r, 500))
  const ids = (window.__fakeDb?.grocery_items ?? []).map(r => r.display_name)
  return { trolley: !!q('[data-testid="grocery-trolley"]'), stillStored: ['Peanut butter', 'Frozen berries', 'Banana', 'Sweet potato'].filter(n => ids.includes(n)) }
`)
check('Clear empties the trolley and takes those items out of the store', !Y1.trolley && Y1.stillStored.length === 0, Y1)

console.log('\n[6] The horizon pill, Rebuild, and what the note claims')
const note0 = await page(`return q('[data-testid="grocery-note"]')?.textContent.trim() ?? null`)
check('the note names the horizon the list was BUILT with, and the allergy limit', note0 === 'Built from your next 7 days of meals. Ingredients are filtered, not verified. Check labels if you have an allergy.', note0)
const pill = await page(`const p = q('[data-testid="grocery-horizon"]'); p?.scrollIntoView({ block: 'center' }); const b = box(p); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null`)
if (pill) await tapAt(pill.x, pill.y)
await wait(400)
const menu = await page(`return qa('[role="menuitem"]').map(m => { const b = box(m); return { text: m.textContent.trim(), x: b.left + b.width / 2, y: b.top + b.height / 2 } })`)
check('the pill opens a menu of 3, 7 and 14 days', menu.map(m => m.text).join() === '3 days,7 days,14 days', menu.map(m => m.text))
const fourteen = menu.find(m => m.text === '14 days')
if (fourteen) await tapAt(fourteen.x, fourteen.y)
await wait(400)
const H1 = await page(`return { pill: q('[data-testid="grocery-horizon"]')?.textContent.trim() ?? null, note: q('[data-testid="grocery-note"]')?.textContent.trim() ?? null }`)
check('choosing 14 sets the pill, and the note still says 7 until the list is rebuilt', H1.pill === '14 days' && /next 7 days/.test(H1.note || ''), H1)
const RB = await page(`
  q('[data-testid="grocery-rebuild"]')?.click()
  const tunaRow = () => qa('[data-testid="grocery-row"]').find(r => /tuna/i.test(r.dataset.item)) || null
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 200)); if (tunaRow()) break }
  await new Promise(r => setTimeout(r, 400))
  let memo = null; try { memo = JSON.parse(localStorage.getItem('fitplan_grocery_built_v1:00000000-0000-4000-8000-000000000003') || 'null') } catch {}
  return { tuna: tunaRow()?.dataset.item ?? null, storedTuna: !!(window.__fakeDb?.grocery_items ?? []).find(r => /tuna/i.test(r.display_name)), note: q('[data-testid="grocery-note"]')?.textContent.trim() ?? null, memo }
`)
check('Rebuild builds the list from the meals, through the store (tuna arrives)', RB.tuna && RB.storedTuna, RB)
check('...and the note now says 14 days, remembered with the day it was built', /next 14 days/.test(RB.note || '') && RB.memo?.days === 14 && RB.memo?.startDate === '2026-09-16', RB)

console.log('\n[7] The add bar, with the keyboard shut and open')
const A1 = await page(`
  const input = q('[data-testid="grocery-addbar"] input'), add = q('[data-testid="grocery-add"]')
  const emptyDisabled = !!add?.disabled
  if (input) { setVal(input, '2 bagels'); await new Promise(r => setTimeout(r, 100)); enter(input) }
  await new Promise(r => setTimeout(r, 500))
  const hit = qa('[data-testid="grocery-row"]').find(r => /bagel/i.test(r.dataset.item))
  return { emptyDisabled, added: hit?.dataset.item ?? null, stored: !!(window.__fakeDb?.grocery_items ?? []).find(r => /bagel/i.test(r.display_name)), cleared: input?.value === '', inputH: box(input)?.height ?? 0 }
`)
check('the + is off while the field is empty; Enter adds the line through the store and clears the field', A1.emptyDisabled && !!A1.added && A1.stored && A1.cleared, A1)
check('the field itself is a 44px target', A1.inputH >= 44, A1.inputH)
const KB = await page(`
  const vv = window.visualViewport
  Object.defineProperty(vv, 'height', { get: () => window.innerHeight - 336, configurable: true })
  Object.defineProperty(vv, 'offsetTop', { get: () => 0, configurable: true })
  q('[data-testid="grocery-addbar"] input')?.focus()
  vv.dispatchEvent(new Event('resize'))
  await new Promise(r => setTimeout(r, 600))
  return { addbar: box(q('[data-testid="grocery-addbar"]')), nav: !!q('nav[aria-label="Primary"]'), focused: document.activeElement?.tagName }
`)
check('with the keyboard up, the add bar rides straight on the keyboard and the tab bar steps aside', KB.focused === 'INPUT' && near(KB.addbar?.bottom, 844 - 336) && KB.nav === false, KB)
await shoot('grocery-keyboard')

console.log('\n[8] Every control is a 44px target, or carries the invisible slop to one')
await open()
await tapRow('Chicken breast')
const small = await page(`
  const s = q('[data-testid="grocery-screen"]')
  return [...s.querySelectorAll('button, input')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ l: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 24), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, slop: e.classList.contains('hit-slop-44') }))
    .filter(c => !(c.slop || (c.w >= 44 && c.h >= 44)))
`)
check('no control on the screen, open row included, is under 44px without the slop', small.length === 0, small)

console.log('\n[9] It follows the theme and the accent')
const themes = await page(`
  const names = [...new Set([...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules] } catch { return [] } }).flatMap(r => (r.selectorText || '').split(',').map(x => x.trim().match(/^\\[data-theme="([a-z]+)"\\]$/)?.[1])).filter(Boolean))]
  const out = []
  for (const [theme, accent] of [...names.map(n => [n, 'theme']), ['nightshift', 'sky'], ['daylight', 'coral']]) {
    const el = document.documentElement
    el.setAttribute('data-theme', theme); el.setAttribute('data-accent', accent)
    if (['daylight', 'linen', 'frost'].includes(theme)) el.setAttribute('data-canvas', 'light'); else el.removeAttribute('data-canvas')
    // Past the chip's 150ms colour transition, or the border is read mid-fade.
    await new Promise(r => setTimeout(r, 260))
    const d = document.createElement('div'); document.body.appendChild(d)
    d.style.borderTopColor = 'rgba(var(--glow-rgb), .4)'; d.style.filter = 'drop-shadow(0 0 8px rgba(var(--glow-rgb),.45))'; d.style.color = 'var(--primary)'
    const want = { border: getComputedStyle(d).borderTopColor, filter: getComputedStyle(d).filter, primary: getComputedStyle(d).color }; d.remove()
    const chip = qa('[data-testid="grocery-chip"]').find(c => c.getAttribute('aria-pressed') === 'true')
    const svg = q('[data-testid="grocery-ring"] svg'), arc = q('[data-testid="grocery-ring-arc"]')
    out.push({ theme, accent, chip: chip ? getComputedStyle(chip).borderTopColor === want.border : false, ring: svg ? getComputedStyle(svg).filter === want.filter : false, arc: arc ? getComputedStyle(arc).stroke === want.primary : false })
  }
  document.documentElement.setAttribute('data-theme', 'nightshift'); document.documentElement.setAttribute('data-accent', 'theme'); document.documentElement.removeAttribute('data-canvas')
  return out
`)
console.log('      ' + themes.map(t => `${t.theme}/${t.accent} ${t.chip && t.ring && t.arc ? 'ok' : 'NO'}`).join(', '))
check('every theme, and two accent overrides, were tried (11 today)', themes.length >= 11, themes.length)
check('...and in each, the active chip, the ring\'s glow and its arc come from that accent', themes.length >= 11 && themes.every(t => t.chip && t.ring && t.arc), themes.filter(t => !(t.chip && t.ring && t.arc)))
await page(`document.documentElement.setAttribute('data-theme', 'daylight'); document.documentElement.setAttribute('data-canvas', 'light'); return true`)
await wait(200)
await shoot('grocery-light')
await page(`document.documentElement.setAttribute('data-theme', 'nightshift'); document.documentElement.removeAttribute('data-canvas'); return true`)

console.log('\n[10] The tab bar\'s icons say what is behind them')
const icons = await page(`const nav = q('nav[aria-label="Primary"]'); return nav ? [...nav.querySelectorAll('button')].map(b => ({ label: b.textContent.trim(), icon: [...(b.querySelector('svg')?.classList ?? [])].find(c => /^lucide-/.test(c) && c !== 'lucide') ?? null })) : []`)
const iconOf = l => icons.find(i => i.label === l)?.icon
check('Home is a trend line, Nutrition a knife and fork, Exercise a dumbbell', iconOf('Home') === 'lucide-chart-spline' && iconOf('Nutrition') === 'lucide-utensils' && iconOf('Exercise') === 'lucide-dumbbell', icons)

console.log('\n[11] Empty, and a list this phone never built')
await open('?empty=1')
const EM = await page(`return { ring: q('[data-testid="grocery-ring-count"]')?.textContent.trim() ?? null, empty: q('[data-testid="grocery-empty"]')?.textContent.trim() ?? null, chips: !!q('[data-testid="grocery-chips"]'), addbar: !!q('[data-testid="grocery-addbar"] input'), hero: !!q('[data-testid="grocery-hero"]') }`)
check('an empty list keeps the hero and the add bar, drops the chips, and points at "Build my list" — the button that exists, by its own words', EM.hero && EM.addbar && !EM.chips && EM.ring === '0/0' && /tap Build my list above/.test(EM.empty || '') && !/Rebuild|Regenerate/.test(EM.empty || ''), EM)
await open('?nomemo=1')
await tapRow('Chicken breast')
const NM = await page(`return { note: q('[data-testid="grocery-note"]')?.textContent.trim() ?? null, first: row('Chicken breast')?.querySelector('[data-testid="grocery-meals"] li')?.textContent.trim() ?? null }`)
check('with no record of when it was built, it says "Day 1" and makes no claim about how many days', NM.first === 'Day 1 · Lunch · Chicken rice bowl' && /^Built from the meals on your Nutrition tab\./.test(NM.note || '') && !/next \d+ days/.test(NM.note || ''), NM)

console.log('\n[12] A list built for the first time: the button, the names, the amounts and the aisles')
// 9 Oct 2026 (M23, L26). A list the plan has never filled says "Build my list",
// not "Rebuild"; the rows it builds are named and weighed as you buy them
// ("brown rice", dry weight — never "brown rice cooked"); eggs and butter are
// under "Dairy & eggs" and tofu is not beside the meat.
await open('?empty=1&eggs=1')
const FB0 = await page(`return { button: q('[data-testid="grocery-rebuild"]')?.textContent.trim() ?? null, rows: qa('[data-testid="grocery-row"]').length }`)
check('a list that was never built offers "Build my list"', FB0.button === 'Build my list' && FB0.rows === 0, FB0)
const FB1 = await page(`
  q('[data-testid="grocery-rebuild"]')?.click()
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 200)); if (qa('[data-testid="grocery-row"]').length >= 6) break }
  await new Promise(r => setTimeout(r, 500))
  const stored = window.__fakeDb?.grocery_items ?? []
  return {
    button: q('[data-testid="grocery-rebuild"]')?.textContent.trim() ?? null,
    names: qa('[data-testid="grocery-row"]').map(r => r.dataset.item),
    rice: stored.find(r => r.canonical_key === 'brown rice cooked') ?? null,
    riceShown: row('brown rice')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    aisles: { egg: aisleOf('egg'), butter: aisleOf('butter'), tofu: aisleOf('tofu firm'), chicken: aisleOf('chicken breast') },
    dairyHeading: q('[data-testid="grocery-aisle"][data-aisle="dairy"] [data-testid="grocery-aisle-heading"]')?.textContent.trim() ?? null,
    dairyChip: qa('[data-testid="grocery-chip"]').find(c => c.dataset.aisle === 'dairy')?.textContent.trim() ?? null,
  }
`)
check('her tap builds it from the meals, and the button then reads "Rebuild"', FB1.button === 'Rebuild' && FB1.names.length >= 8, FB1)
check('no row is named "... cooked"; the rice is "brown rice"', FB1.names.includes('brown rice') && !FB1.names.some(n => /cooked/i.test(n)), FB1.names)
// 80g of cooked rice a day for seven days is 560g on the plate and 190g from the bag (x0.34).
check('the rice is the dry weight to buy (190g for the week, not 560g), under its own unchanged key', FB1.rice?.quantity === 190 && FB1.rice?.unit === 'g' && FB1.rice?.display_name === 'brown rice', FB1.rice)
check('...and the row shows it (190g)', /190g/.test(FB1.riceShown || '') && !/560|600/.test(FB1.riceShown || ''), FB1.riceShown)
check('eggs and butter are under dairy, tofu is in dry goods, chicken is still with the meat', FB1.aisles.egg === 'dairy' && FB1.aisles.butter === 'dairy' && FB1.aisles.tofu === 'dry_goods' && FB1.aisles.chicken === 'meat_fish', FB1.aisles)
check('...and the aisle is called "Dairy & eggs", on its heading and on its chip', /^Dairy & eggs/.test(FB1.dairyHeading || '') && /^Dairy & eggs\d+$/.test(FB1.dairyChip || ''), [FB1.dairyHeading, FB1.dairyChip])
const FB2 = await page(`
  row('egg')?.scrollIntoView({ block: 'center' })
  row('egg')?.querySelector('[data-testid="grocery-check"]')?.click()
  await new Promise(r => setTimeout(r, 330))
  const t = q('[data-testid="grocery-toast"]'); const b = box(t)
  return { toast: t?.textContent.trim() ?? null, onScreen: !!b && b.top >= 0 && b.bottom <= innerHeight }
`)
check('ticking the eggs says "Egg — in the trolley", on screen (no "is")', /^Egg — in the trolley\s*Undo$/.test(FB2.toast || '') && FB2.onScreen === true, FB2)
await send('Page.captureScreenshot', { format: 'png' }).then(s => writeFileSync(new URL('./grocery-first-build.png', import.meta.url).pathname, Buffer.from(s.result.data, 'base64')))

const errs = await call(() => window.__errs ?? [])
check('nothing on the page threw', errs.length === 0, errs)

console.log(`\n${ran} checks ran`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('The grocery list is the page, and every change goes through the store.')
