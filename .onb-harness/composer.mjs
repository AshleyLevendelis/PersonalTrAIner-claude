// Reads the composer placeholder off the REAL onboarding screen, in Chromium.
// Ashley reported it describing a different question than the one on screen;
// this is what turns "it says the wrong thing" into a before/after.
import { createServer } from 'http'
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.onb-harness/composer.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9341', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 60; i++) { try { const l = await fetch('http://127.0.0.1:9341/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = x => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then(r => r.result?.result?.value)
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const CASES = [
  ['fresh',    'the opener, which asks for a name',        'Your name…'],
  ['card',     'a live chip card for training style',      'How do you like to train?'],
  ['resolved', 'card answered, nothing else on screen',    'Which days?'],
  // The coach asked freehand — no card, no asksSlot. A guess here contradicts
  // a question the user can read directly above the box, so the only honest
  // placeholder is the neutral one. Reported live as "Which days?" under a
  // question about squat, bench and deadlift.
  ['freehand', 'a question the app cannot map to a slot',  'Say anything…'],
  // ...and when that same question DOES carry its card, the composer names it.
  // All three lift slots shipped with no inputHint at all, so even a correctly
  // identified slot fell through to the neutral text.
  // The lift trio is a grouped card too, so this expectation MOVED when the
  // group fix landed: naming only the squat under a card showing three boxes
  // was the same defect one screen over. The hint names all three, and
  // narrows as they are filled in.
  ['liftcard', 'the squat question, with its card',        'squat, bench and deadlift…'],
  // A grouped card asks three things at once, so naming one is wrong — and
  // the first member is the likeliest to be the one already answered. Live
  // report: age already filled in at 37, box still reading "Your age…".
  ['bodygroup', 'age/height/weight, with age already given', 'height and weight…'],
]
let bad = 0
for (const [state, what, expected] of CASES) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?state=${state}` }); await wait(1600)
  const got = await ev(`(() => {
    // THE COMPOSER SPECIFICALLY, not "the first input with a placeholder".
    // A numeric slot card renders its own field ABOVE the composer, so the
    // loose selector read the card's placeholder ("1-500") and called it the
    // composer's — a harness reporting confidently on the wrong element.
    const composer = document.querySelector('.ob-composer-fade')
    const i = composer && composer.querySelector('input[placeholder], textarea[placeholder]')
    return JSON.stringify({ ph: i?.placeholder ?? '(no composer found)',
      body: document.body.innerText.slice(0, 300), err: window.__err ?? null,
      composerFound: !!composer })
  })()`)
  const parsed = JSON.parse(got); const ph = parsed.ph
  if (process.env.DEBUG) console.log('      BODY:', JSON.stringify(parsed.body), '\n      ERR:', parsed.err)
  const ok = ph === expected
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${what}\n      on screen: ${expected}\n      composer:  ${ph}`)
}

// ---------------------------------------------------------------------------
// AGE, HEIGHT AND WEIGHT, THROUGH THE REAL CONTROLS (Ashley, 9 Nov 2026): a date picker for the date of birth, and a
// unit toggle beside the weight and the height. Driven as a person would: pick the unit, fill the boxes, Save, and
// read what was stored back off the screen. The receipts ("from 5'10") prove the boxes reached the same converter
// that typing did, so the stored numbers are the ones the parser gives.
// ---------------------------------------------------------------------------
const shoot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64')) }
const say = (label, ok, extra) => {
  if (ok) console.log('  ✓ ' + label)
  else { bad++; console.log('  ✗ ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')) }
}
const setVal = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const tapUnit = (field, unit) => ev(`(() => { const b = document.querySelector('[data-body-field="${field}"] [data-unit="${unit}"]'); if (!b) return false; b.click(); return true })()`)
const val = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.value ?? null`)
const tapSave = () => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save'); if (!b) return false; b.click(); return true })()`)
const bodyText = () => ev(`document.body.innerText`)

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?state=bodygroup` })
await wait(1800)
console.log('\n  age, height and weight have their own controls:')
const kinds = JSON.parse(await ev(`JSON.stringify({ age: document.querySelector('#slot-age')?.type ?? null, h: document.querySelector('#slot-heightCm')?.type ?? null, w: document.querySelector('#slot-weightKg')?.type ?? null,
  label: document.querySelector('label[for="slot-age"]')?.textContent.trim() ?? null,
  units: [...document.querySelectorAll('[data-body-field] [data-unit]')].map(b => b.dataset.unit),
  small: [...document.querySelectorAll('[data-body-field] [data-unit]')].filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).length })`))
say('the age is a date picker, labelled "Date of birth"', kinds.age === 'date' && kinds.label === 'Date of birth', kinds)
say('height and weight are number boxes', kinds.h === 'number' && kinds.w === 'number', kinds)
say('weight toggles kg / lb / st, height toggles cm / ft', JSON.stringify(kinds.units) === JSON.stringify(['cm', 'ft', 'kg', 'lb', 'st']) || JSON.stringify([...kinds.units].sort()) === JSON.stringify(['cm', 'ft', 'kg', 'lb', 'st']), kinds.units)
say('every unit button is a thumb\'s size (44px)', kinds.small === 0, kinds.small)

// Switching unit carries what is in the box across, converted.
await setVal('#slot-weightKg', '82')
await tapUnit('weightKg', 'lb'); await wait(150)
const lb = await val('#slot-weightKg')
await tapUnit('weightKg', 'st'); await wait(150)
const st = [await val('#slot-weightKg'), await val('#slot-weightKg-lb')]
say('82 kg switched to lb reads 181', lb === '181', lb)
say('...and to stone reads 12 st 13 lb, in two boxes', JSON.stringify(st) === JSON.stringify(['12', '13']), st)
const boxUnits = await ev(`[...document.querySelectorAll('[data-body-field="weightKg"] [data-box-unit]')].map(e => e.textContent).join(',')`)
say('...each box saying which it is (st, lb)', boxUnits === 'st,lb', boxUnits)

// An under-13 date of birth is refused with the limits, and nothing is saved.
const young = (() => { const d = new Date(); return `${d.getFullYear() - 10}-01-01` })()
await setVal('#slot-age', young)
await wait(150)
const hintYoung = await ev(`document.querySelector('[data-testid="slot-age-hint"]')?.textContent ?? null`)
say('picking a date shows the age it makes', /That makes you (9|10)\./.test(hintYoung ?? ''), hintYoung)
await tapSave(); await wait(300)
const youngText = await bodyText()
say('a date making them under 13 is refused, with the limits said', /between 13 and 100/.test(youngText) && (await ev(`!!document.querySelector('#slot-age')`)) === true, youngText.slice(0, 300))

// The real answers: 5'10, 13 st 2, born 15 June 1990.
await setVal('#slot-age', '1990-06-15'); await wait(120)
const hint = await ev(`document.querySelector('[data-testid="slot-age-hint"]')?.textContent ?? null`)
const ageShown = Number((hint ?? '').match(/That makes you (\d+)/)?.[1] ?? NaN)
await tapUnit('heightCm', 'ft'); await wait(150)
await setVal('#slot-heightCm', '5'); await setVal('#slot-heightCm-in', '10')
await setVal('#slot-weightKg', '13'); await setVal('#slot-weightKg-lb', '2')
await wait(150)
await shoot('body-controls')
await tapSave(); await wait(1500)
const after = await bodyText()
say('the age the picker showed is the age stored', Number.isFinite(ageShown) && ageShown >= 30 && new RegExp(`\\b${ageShown}\\b`).test(after), { ageShown, after: after.slice(0, 400) })
say('178cm was stored and read back', /178/.test(after), after.slice(0, 400))
say('83.5kg was stored and read back', /83\.5/.test(after), after.slice(0, 400))
say(`the receipt says where 178 came from`, /from 5'10/.test(after), after.slice(0, 400))
say('...and where 83.5 came from', /from 13st 2lb/.test(after), after.slice(0, 400))

console.log(bad === 0 ? '\n  composer matches the question on screen in all cases.\n' : `\n  ${bad} MISMATCHED\n`)
chrome.kill(); server.close()
process.exit(bad === 0 ? 0 : 1)
