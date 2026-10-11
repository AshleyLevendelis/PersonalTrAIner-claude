// ---------------------------------------------------------------------------
// A TYPED MEAL, ON THE REAL CHAT: THE CARD IS THE RIGHT SIZE OR THERE IS NO CARD.
//
// 9 Oct 2026, the test log's H6. "2 scrambled eggs on 2 slices of buttered
// toast" came back as a card reading 266 kcal, and "a chicken caesar wrap and
// a large latte" as 187, both stated as fact, with "Assuming assumed large
// eggs" underneath. The numbers are held by test:meal-amounts; this holds what
// she SEES, on the real chat at phone size:
//   1. eggs on toast is a card of 350+ kcal, with "Assumed: …" written once;
//   2. the wrap and the latte is a QUESTION about the latte, and no card;
//   3. a meal with one food the app does not know says "Not counted: …" on
//      the card, before the tap;
//   4. the tap writes the number the card showed.
//
// THE COACH'S HALF IS NOT STUBBED BY HAND. The server's log_meal handler is a
// Deno function that cannot run here, so the fetch boundary is fed what the
// handler computes: the lines the model parsed go through the coach's OWN
// food database (supabase/functions/_shared/food-db.ts) and its stop, in a
// child process, and the result is what the page receives. The fixture picks
// the input; the app's code makes the output.
//
// PORT 9651.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { spawn, execFileSync } from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = new URL('./dist/', import.meta.url).pathname

// What the model would send for each message: it only PARSES.
const TURNS = {
  eggs: {
    said: 'I had 2 scrambled eggs on 2 slices of buttered toast for breakfast, can you log that',
    args: {
      intent: 'logging', meal_slot: 'breakfast', food_name: 'Scrambled eggs on buttered toast',
      ingredients: [{ name: 'scrambled egg', quantity: 2, unit: 'whole' }, { name: 'bread', quantity: 2, unit: 'slices' }, { name: 'butter', quantity: 10, unit: 'g' }],
      assumptions: ['assumed large eggs', 'assumed white toast', 'assumed 10 g butter'],
    },
  },
  wrap: {
    said: 'I had a chicken caesar wrap and a large latte for lunch, can you log that',
    args: {
      intent: 'logging', meal_slot: 'lunch', food_name: 'Chicken caesar wrap and a large latte',
      ingredients: [{ name: 'chicken caesar wrap', quantity: 1, unit: 'whole' }, { name: 'whole milk latte', quantity: 1, unit: 'large' }],
      assumptions: ['assumed standard chicken caesar wrap portion'],
    },
  },
  bowl: {
    said: 'I had 150g chicken breast with 200g rice and 20g flargle sauce for dinner, log it',
    args: {
      intent: 'logging', meal_slot: 'dinner', food_name: 'Chicken and rice with flargle sauce',
      ingredients: [{ name: 'chicken breast', quantity: 150, unit: 'g' }, { name: 'white rice', quantity: 200, unit: 'g' }, { name: 'flargle sauce', quantity: 20, unit: 'g' }],
      assumptions: [],
    },
  },
}

// The handler's own decision, from the coach's own modules: cost the meal,
// ask the stop, and hand back either its question or the proposal.
const handlerScript = `
import { computeMealMacros, doubtAboutLoggedMeal } from ${JSON.stringify(join(ROOT, 'supabase/functions/_shared/food-db.ts'))}
const turns = ${JSON.stringify(TURNS)}
const out = {}
for (const [key, t] of Object.entries(turns)) {
  const computed = computeMealMacros(t.args.ingredients)
  const doubt = doubtAboutLoggedMeal(computed, t.args.meal_slot)
  out[key] = doubt
    ? { reply: doubt }
    : { reply: '', proposal: { kind: 'propose_meal_log', rawArgs: t.args, assumptions: t.args.assumptions,
        computed: { kcal: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat, unmatched: computed.unmatched, coverage: computed.coverage } } }
}
console.log(JSON.stringify(out))
`
const scriptPath = join(DIST, '__meal-log-handler.mts')
writeFileSync(scriptPath, handlerScript)
const RESPONSES = JSON.parse(execFileSync('npx', ['tsx', scriptPath], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop())

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const wait = ms => new Promise(r => setTimeout(r, ms))
// A browser still holding this port is somebody else's run (or the tail of the
// last one). Talking to it would measure THEIR page and then hang when it
// closes, so say so and stop rather than attach.
const portBusy = await fetch('http://127.0.0.1:9651/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9651 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
// ITS OWN PROFILE DIRECTORY. Chromium is one process per profile: started
// while another driver's browser is up on the default profile, it hands its
// window to THAT browser and exits 0 — and the window dies when the other
// driver finishes. Found 9 Oct 2026 with several checkouts driving at once:
// this driver stopped part-way, on correct code, with nothing on its port.
const profileDir = mkdtempSync(join(tmpdir(), 'meal-log-card-'))
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9651', `--user-data-dir=${profileDir}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
// A driver that waits for ever reads as a slow one, and a browser that dies
// mid-run leaves every pending question unanswered. Both end the run loudly.
// (A stopwatch on the run, not a clock: it never decides what "today" is.)
const giveUp = why => { console.error(`    ✗ ${why}`); try { chrome.kill('SIGKILL') } catch {} ; process.exit(1) }
const watchdog = setTimeout(() => giveUp('the driver did not finish in 150 seconds'), 150_000)
let finishing = false
chrome.once('exit', code => { if (!finishing) giveUp(`the browser exited mid-run (code ${code}) — something outside this driver stopped it; run it again`) })
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9651/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const RESPONSES = ${JSON.stringify(RESPONSES)}
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      const key = /scrambled eggs/.test(said) ? 'eggs' : /caesar wrap/.test(said) ? 'wrap' : /flargle/.test(said) ? 'bowl' : null
      return new Response(JSON.stringify(key ? RESPONSES[key] : { reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)
let up = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !up; i++) { await wait(500); up = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', up === true)

const setValue = `(el, v) => {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async (text) => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  const ok = await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
  await wait(1800)
  return ok
}
const text = () => ev(`document.body.innerText`)
const applyButtons = () => ev(`[...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === 'Apply' && !b.disabled).length`)
const logged = () => ev(`(window.__fakeDb?.meal_events ?? []).map(r => r.slot + ':' + r.meal_name + ':' + (r.macros?.kcal ?? r.kcal ?? '?'))`)
// Every "N kcal" on the page, as numbers.
const kcals = t => [...String(t).matchAll(/(\d[\d,]*)\s*kcal/g)].map(m => Number(m[1].replace(/,/g, '')))

console.log('\n1. Eggs on toast: a card the size of the meal\n')
check('1a. the sanity of the fixture: the handler\'s own code produced a card, not a question', !!RESPONSES.eggs.proposal, RESPONSES.eggs)
check('1b. the message is sent', await say(TURNS.eggs.said))
const t1 = await text()
check('1c. it asks to log it to breakfast', /Log this to your breakfast\?/.test(t1), t1.slice(-400))
const eggKcal = /Scrambled eggs on buttered toast — (\d+) kcal/.exec(t1)?.[1]
check('1d. the card says 350 kcal or more — it was 266', Number(eggKcal) >= 350 && Number(eggKcal) <= 520, eggKcal)
check('1e. no figure under 300 kcal is anywhere in the conversation', kcals(t1.slice(t1.indexOf(TURNS.eggs.said))).every(k => k >= 300), kcals(t1.slice(t1.indexOf(TURNS.eggs.said))))
check('1f. assumptions are written once: "Assumed: large eggs; white toast; 10 g butter."', /Assumed: large eggs; white toast; 10 g butter\./.test(t1), t1.slice(-400))
check('1g. ...and never "Assuming assumed"', !/assum\w*\s+assum/i.test(t1), t1.slice(-400))
check('1h. nothing is written before the tap', (await logged()).length === 0, await logged())
check('1i. one card is waiting for her tap', (await applyButtons()) === 1, await applyButtons())
await shoot('meal-log-card-eggs')

console.log('\n2. The tap writes what the card showed\n')
check('2a. tapping Apply', await ev(`(() => { const b = [...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === 'Apply' && !x.disabled); if (!b) return false; b.click(); return true })()`))
await wait(1500)
const rows = await logged()
check('2b. one breakfast is in the meal log', rows.length === 1 && /^breakfast:Scrambled eggs on buttered toast:/.test(rows[0] ?? ''), rows)
check('2c. ...at the calories the card showed', rows.length === 1 && rows[0].endsWith(`:${eggKcal}`), { rows, eggKcal })
await shoot('meal-log-card-eggs-logged')

console.log('\n3. A wrap and a large latte: a question, and no card\n')
check('3a. the sanity of the fixture: the handler\'s own code asked a question', typeof RESPONSES.wrap.reply === 'string' && RESPONSES.wrap.reply.length > 0 && !RESPONSES.wrap.proposal, RESPONSES.wrap)
check('3b. the message is sent', await say(TURNS.wrap.said))
const t3 = (await text())
const after3 = t3.slice(t3.lastIndexOf(TURNS.wrap.said))
check('3c. the coach asks how big the latte was', /How big was the whole milk latte\?/.test(after3), after3.slice(0, 400))
check('3d. ...in one short question', (after3.match(/\?/g) ?? []).length === 1 && after3.length < TURNS.wrap.said.length + 260, after3)
check('3e. no card is offered for it', !/Log this to your lunch\?/.test(after3) && (await applyButtons()) === 0, after3.slice(0, 300))
check('3f. no calorie figure is stated for it at all — it said 187', kcals(after3).length === 0, kcals(after3))
check('3g. nothing new was written', (await logged()).length === 1, await logged())
// A MESSAGE IS ONLY SHOWN IF IT IS ON SCREEN: the question, inside the viewport.
const qBox = await ev(`(() => {
  const els = [...document.querySelectorAll('p, div, span')].filter(e => e.children.length === 0 && /How big was the whole milk latte/.test(e.textContent || ''))
  const r = els.length ? els[els.length - 1].getBoundingClientRect() : null
  return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight } : null
})()`)
check('3h. the question is inside the screen, not a scroll away', !!qBox && qBox.top >= 0 && qBox.bottom <= qBox.h, qBox)
await shoot('meal-log-card-question')

console.log('\n4. A food the app does not know is named on the card\n')
check('4a. the sanity of the fixture: the handler produced a card with one food left out', RESPONSES.bowl.proposal?.computed?.unmatched?.join() === 'flargle sauce' && RESPONSES.bowl.proposal.computed.coverage >= 0.8, RESPONSES.bowl)
check('4b. the message is sent', await say(TURNS.bowl.said))
const t4 = await text()
const after4 = t4.slice(t4.lastIndexOf(TURNS.bowl.said))
check('4c. it asks to log it to dinner', /Log this to your dinner\?/.test(after4), after4.slice(0, 400))
check('4d. the card says "Not counted: flargle sauce."', /Not counted: flargle sauce\./.test(after4), after4.slice(0, 500))
const warn = await ev(`(() => { const p = [...document.querySelectorAll('p[data-severity]')].filter(e => /Not counted/.test(e.textContent || '')).pop(); if (!p) return null; const r = p.getBoundingClientRect(); return { severity: p.getAttribute('data-severity'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight } })()`)
check('4e. ...as the card\'s own warning line', warn?.severity === 'warn', warn)
check('4f. ...on screen, above the Apply button she would tap', !!warn && warn.top >= 0 && warn.bottom <= warn.h, warn)
check('4g. no "Assumed" line when nothing was assumed', !/Assumed:/.test(after4), after4.slice(0, 400))
await shoot('meal-log-card-not-counted')

console.log(`\n${ran} checks ran.`)
clearTimeout(watchdog)
finishing = true
// Wait for the browser to be gone, so the port is free for the next run.
await new Promise(r => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 5000) })
server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('The card is the size of the meal, or the coach asks.\n')
process.exit(0)
