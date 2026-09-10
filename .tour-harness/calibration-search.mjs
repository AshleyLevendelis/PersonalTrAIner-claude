// ---------------------------------------------------------------------------
// CALIBRATION WEEK LOOKS LIKE WHAT IT IS — A SEARCH, WITH THE APP'S NUMBER AS
// THE FIRST GUESS.
//
// Ashley, 10 Sep 2026, after training on it: the weights were too light, the
// screen prescribed a number while the banner said "add until 3-4 reps in
// reserve", and it was not clear whether the ramp came before or after. The
// source rules live in scripts/test-calibration-search.ts. This holds the half
// no source check can: on a real mount at phone width, the ramp is ABOVE the
// number, the number says START HERE, set 1 is pre-filled and sets 2-3 are
// not, ticking set 1 makes the next-weight chips appear, tapping one fills the
// box, and a tick on an empty set 3 is refused rather than logging the guess.
//
// TODAY IS PINNED TO A MONDAY via the dev clock (the verify:ramp-ticks trick):
// the harness's real today has no ramped main lift; Monday's bench press does,
// and the harness plan's week 1 is a calibration week.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9407', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9407/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
console.log('pinning today to', monday)
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  try { localStorage.setItem('fitplan_dev_clock_00000000-0000-4000-8000-000000000001', JSON.stringify({date:'${monday}',enabled:true})) } catch {}
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4000)
// Expand the main lift: the ramp, the number and the grid all live in its expanded body.
await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&/Barbell Bench Press/.test(x.textContent.trim()));
 if(!n) return false; let p=n; for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement; if(p.tagName==='BUTTON'||p.getAttribute('role')==='button'){p.click();return true}} return false})()`)
await wait(1500)

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    \u2713 ${name}`)
  else { failures++; console.error(`    \u2717 ${name}${detail !== undefined ? ` \u2014 ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// The smallest ancestor of the bench-press label that also holds the weight inputs: the expanded row.
const SECTION = `(() => {
  const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&/Barbell Bench Press/.test(x.textContent.trim()))
  if(!n) return null; let p=n
  for(let i=0;i<12&&p.parentElement;i++){ p=p.parentElement; if(p.querySelector('input[id^="setgrid-weight-"]')) return p }
  return null
})()`
const setValue = `(el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const leafTop = re => `(() => { const sec = ${SECTION}; if (!sec) return null
  const n = [...sec.querySelectorAll('*')].find(x => x.children.length === 0 && ${re}.test(x.textContent.trim()))
  return n ? Math.round(n.getBoundingClientRect().top) : null })()`
const box = n => ev(`(() => { const sec = ${SECTION}; const el = sec && sec.querySelector('input[id$="-${n}"][id^="setgrid-weight-"]')
  return el ? { value: el.value, placeholder: el.placeholder } : null })()`)
const tapSave = n => ev(`(() => { const sec = ${SECTION}; const b = sec && [...sec.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Save set ${n}'); if (!b) return false; b.click(); return true })()`)
const savedState = n => ev(`(() => { const sec = ${SECTION}; const b = sec && [...sec.querySelectorAll('button')].find(x => /^(Save set ${n}|Set ${n} saved)$/.test(x.getAttribute('aria-label') || '')); return b ? b.getAttribute('aria-label') : null })()`)
const scrollTo = re => ev(`(() => { const sec = ${SECTION}; if (!sec) return false
  const n = [...sec.querySelectorAll('*')].find(x => x.children.length === 0 && ${re}.test(x.textContent.trim())); (n || sec).scrollIntoView({ block: 'center' }); return true })()`)

console.log('\nCALIBRATION WEEK, ON THE SCREEN\n')
check('0. the expanded bench-press row with its log grid is on screen', (await ev(`!!(${SECTION})`)) === true)
const rampTop = await ev(leafTop('/Ramp up first/i'))
const numberTop = await ev(`(() => { const sec = ${SECTION}; const n = sec && sec.querySelector('.ds-num-lg'); return n ? Math.round(n.getBoundingClientRect().top) : null })()`)
check('1. the ramp block is drawn ABOVE the start number', rampTop != null && numberTop != null && rampTop < numberTop, { rampTop, numberTop })
check('2. ...and says what it is for, on screen', (await ev(`(() => { const sec = ${SECTION}; return sec ? /then set 1/i.test(sec.innerText) : false })()`)) === true)
check('3. the number is labelled START HERE', (await ev(`(() => { const sec = ${SECTION}; return sec ? /start here/i.test(sec.innerText) : false })()`)) === true)
const probe = await ev(`(() => { const sec = ${SECTION}; const c = sec && sec.querySelector('[data-testid="probe-chip"]'); return c ? c.textContent.trim() : null })()`)
check('4. one probe line, not three identical set chips', /Set 1 · probe at ~?[\d.]+kg/.test(probe || '') && (await ev(`(() => { const sec = ${SECTION}; return sec ? /\\bS1: \\d/.test(sec.innerText) : true })()`)) === false, probe)
const b1 = await box(1), b2 = await box(2), b3 = await box(3)
check('5. set 1 is pre-filled with the start weight', !!b1 && /^\d/.test(b1.placeholder), b1)
check('6. sets 2 and 3 are empty and ask to be typed into', !!b2 && !!b3 && b2.value === '' && b3.value === '' && b2.placeholder === 'type it' && b3.placeholder === 'type it', { b2, b3 })
await scrollTo('/Ramp up first/i'); await wait(500); await shoot('calibration-search-start')

check('7a. ticking set 1', await tapSave(1))
await wait(1200)
check('7b. ...logs it', (await savedState(1)) === 'Set 1 saved', await savedState(1))
const chips = await ev(`(() => { const sec = ${SECTION}; const c = sec && sec.querySelector('[data-testid="calibration-cascade"]'); if (!c) return null
  return [...c.querySelectorAll('button')].map(b => ({ label: b.textContent.trim(), aria: b.getAttribute('aria-label') })) })()`)
check('8. three next-weight chips appear under set 2 — same, and two real steps up',
  Array.isArray(chips) && chips.length === 3 && /^same/.test(chips[0].label) && /^\+[\d.]+ ·/.test(chips[1].label) && /^\+[\d.]+ ·/.test(chips[2].label), chips)
const kgs = (chips || []).map(c => parseFloat((c.aria || '').match(/at ([\d.]+)kg/)?.[1] ?? 'NaN'))
check('9. ...climbing from the weight just logged, three DIFFERENT weights',
  kgs.length === 3 && kgs[0] === parseFloat(b1?.placeholder) && kgs[1] > kgs[0] && kgs[2] > kgs[1], kgs)
check('9b. ...and each chip\u2019s label is the kilos it really adds',
  (chips || []).slice(1).every((c, i) => parseFloat(c.label.slice(1)) === Math.round((kgs[i + 1] - kgs[0]) * 100) / 100), { chips, kgs })
check('10a. tapping the top chip', (await ev(`(() => { const sec = ${SECTION}; const c = sec && sec.querySelector('[data-testid="calibration-cascade"]'); const b = c && [...c.querySelectorAll('button')].pop(); if (!b) return false; b.click(); return true })()`)) === true)
await wait(500)
const b2after = await box(2)
check('10b. ...fills set 2\u2019s box with that weight, and only fills it', !!b2after && parseFloat(b2after.value) === kgs[2] && (await savedState(2)) === 'Save set 2', { b2after, kgs })
await scrollTo('/After \\d/'); await wait(400); await shoot('calibration-search-cascade')

check('11a. ticking set 3 with nothing typed', await tapSave(3))
await wait(600)
const refusal = await ev(`(() => { const sec = ${SECTION}; const p = sec && [...sec.querySelectorAll('p')].find(x => x.className.includes('text-destructive')); return p ? p.textContent.trim() : null })()`)
check('11b. ...is refused, naming the probe', /set 1 was the probe/i.test(refusal || ''), refusal)
check('11c. ...and nothing was logged for it', (await savedState(3)) === 'Save set 3', await savedState(3))
await scrollTo('/set 1 was the probe/i'); await wait(400); await shoot('calibration-search-refused')

// A BODYWEIGHT ROW IN THE SAME SESSION IS NOT PART OF THE SEARCH. Found by
// reading the first screenshot on 10 Sep 2026, not by a check: Scapular
// Push-Ups sat above the bench press with "type it" in its weight column, and
// a tick there would have been refused for want of a weight nobody lifts.
const BW_SECTION = `(() => {
  const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&/Scapular Push-Ups/.test(x.textContent.trim()))
  if(!n) return null; let p=n
  for(let i=0;i<12&&p.parentElement;i++){ p=p.parentElement; if(p.querySelector('input[id^="setgrid-weight-"]')) return p }
  return null
})()`
const bwBox2 = await ev(`(() => { const sec = ${BW_SECTION}; const el = sec && sec.querySelector('input[id$="-2"][id^="setgrid-weight-"]')
  return el ? { value: el.value, placeholder: el.placeholder } : null })()`)
check('12. a bodyweight lift in the same week keeps its own default, not "type it"',
  !!bwBox2 && bwBox2.placeholder !== 'type it', bwBox2)
check('13. ...and has no next-weight chips to climb', (await ev(`(() => { const sec = ${BW_SECTION}; return !!(sec && sec.querySelector('[data-testid="calibration-cascade"]')) })()`)) === false)
check('14a. ticking its second set', (await ev(`(() => { const sec = ${BW_SECTION}; const b = sec && [...sec.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Save set 2'); if (!b) return false; b.click(); return true })()`)) === true)
await wait(1200)
check('14b. ...logs it instead of demanding a weight',
  (await ev(`(() => { const sec = ${BW_SECTION}; const b = sec && [...sec.querySelectorAll('button')].find(x => /^(Save set 2|Set 2 saved)$/.test(x.getAttribute('aria-label') || '')); return b ? b.getAttribute('aria-label') : null })()`)) === 'Set 2 saved')
await ev(`(() => { const sec = ${BW_SECTION}; if (sec) sec.scrollIntoView({ block: 'center' }); return !!sec })()`); await wait(400)
await shoot('calibration-search-bodyweight')

console.log(failures === 0 ? '\nCalibration week reads as a search on the screen.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
