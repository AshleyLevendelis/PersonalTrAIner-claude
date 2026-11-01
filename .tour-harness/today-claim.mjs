// ---------------------------------------------------------------------------
// verify:today-claim — THE COACH MAY NOT DESCRIBE A DAY THAT IS NOT HERS (1 Nov 2026).
//
// Ashley, Sunday 11:22, a rest day with nothing logged: "Since it's late in the evening and you've just
// wrapped up your workout ...". The server refuses it and retries with the facts once chat-gemini is
// deployed; this drives the CLIENT copy, the last thing before the screen and the only one running
// until then. The edge function is stubbed to return her reply word for word.
//
// Three scenes, so the check is shown reading the real facts rather than refusing everything:
//   A. no sets today (the harness clock is midday, so "afternoon"): her reply is replaced by the floor,
//      which says the day as it is; and the request told the server trained_today: false;
//   B. today's session finished (?day=done): "you've just wrapped up your workout" is TRUE and shown;
//      the request said trained_today: true;
//   C. nothing logged, but she says "I just did a 5k run": "great session today" is shown.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'


const DIST = new URL('./dist/', import.meta.url).pathname
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9503', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9503/json/list').then(r => r.json())
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
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const HER_REPLY = "Since it's late in the evening and you've just wrapped up your workout, your main focus for the rest of tonight should be getting a good meal in to kickstart recovery, staying hydrated, and winding down for sleep.\n\nFor post-workout nutrition tonight, your plan has a solid Lean Beef Bolognese with Spaghetti lined up for dinner to hit your protein and replenish your glycogen.\n\nDid you manage to get some food in after your session?"
const TRUE_DONE = "Nice — you've just wrapped up your workout, so get some protein in with lunch."
const HER_5K = 'Great session today. Get some carbs in with lunch and plenty of water.'

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__bodies = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      window.__bodies.push({ message: String(body.message || ''), trained: body.context ? body.context.trained_today : undefined, part: body.context ? body.context.current_part_of_day : undefined })
      const scene = new URLSearchParams(location.search).get('scene')
      const reply = scene === 'B' ? ${JSON.stringify(TRUE_DONE)} : scene === 'C' ? ${JSON.stringify(HER_5K)} : ${JSON.stringify(HER_REPLY)}
      return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async (text) => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
}
const thread = () => ev(`document.querySelector('[data-testid="chat-thread"]')?.innerText ?? document.body.innerText`)
let load = 0
const open = async (qs) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=${++load}${qs}` })
  for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('textarea')`)) break; await wait(300) }
  // The day facts come from the week strip's read; let it land before the turn.
  await wait(2500)
}
/** Poll until the thread holds `re` (or 30s), so the typewriter has finished the sentence being read. */
const until = async (re) => {
  let t = await thread()
  for (let i = 0; i < 60 && !re.test(t); i++) { await wait(500); t = await thread() }
  return t
}

console.log('\nTHE COACH DESCRIBES THE DAY AS IT IS\n')

console.log('  A. nothing logged today, midday')
await open('&scene=A')
check('A1. her message goes', await say('What should I focus on for the rest of today?'))
let t = await until(/nothing logged yet today\. Ask me|wrapped up/)
check('A2. "late in the evening" never reaches the screen', !/late in the evening/i.test(t), t.slice(-400))
check('A3. ...nor "you\'ve just wrapped up your workout"', !/wrapped up your workout/i.test(t), t.slice(-400))
check('A4. something is said instead, owning the slip', /had your day wrong/i.test(t), t.slice(-300))
check('A5. ...saying the day as it is (afternoon, nothing logged)', /afternoon/i.test(t) && /nothing logged yet today/i.test(t), t.slice(-300))
let bodies = await ev('window.__bodies')
check('A6. the server was told: afternoon, trained_today false', bodies?.[0]?.part === 'afternoon' && bodies?.[0]?.trained === false, bodies)
await shoot('today-claim-refused')

console.log('\n  B. today\'s session finished')
await open('&scene=B&day=done')
check('B1. her message goes', await say('What should I eat now?'))
t = await until(/wrapped up your workout|had your day wrong/)
check('B2. a TRUE "you\'ve just wrapped up your workout" is shown', /wrapped up your workout/i.test(t), t.slice(-300))
check('B3. ...and not floored', !/had your day wrong/i.test(t), t.slice(-300))
bodies = await ev('window.__bodies')
check('B4. the server was told trained_today true', bodies?.[0]?.trained === true, bodies)

console.log('\n  C. nothing logged, but she says she ran')
await open('&scene=C')
check('C1. her message goes', await say('I just did a 5k run'))
t = await until(/Great session today|had your day wrong/)
check('C2. "great session today" is shown: her own news, not a claim the app made up', /Great session today/.test(t) && !/had your day wrong/i.test(t), t.slice(-300))

const err = await ev('window.__err ?? null')
check('D. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe coach describes the day as it is.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
