// ---------------------------------------------------------------------------
// CARDIO LOGGED THROUGH THE CHAT, THE WAY THE SCREENS LOG IT.
//
// 24 Sep 2026, the third of the chat fixes Ashley asked for. "Did a 30 min
// walk" through the chat wrote an effort of 5 that nobody chose, stored the
// whole phrase as the activity, read back "Cardio" under "0 exercises · 0
// sets", said "Logged" even when the store refused the write, and its Undo
// left the walk in place. The screens had just stopped inventing an effort
// (her "like a lifting set" ruling), so the chat was the one place still
// saying two things.
//
// Held here on the real chat, with the model's half stubbed at the fetch
// boundary and keyed by what was said:
//   1. no effort in her words -> it ASKS, with Easy / Steady / Hard taps,
//      and nothing is written until she taps;
//   2. the tap logs it and the receipt reads back "Walk · 30 min · Easy";
//   3. Undo removes the walk from the store, not only the sets beside it;
//   4. an effort she DID say is taken without asking, and her exact number
//      is what is stored;
//   5. a length the store refuses is said as "Not logged", never "Logged".
//
// PORT 9453.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9453', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9453/json/list').then(r => r.json())
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


await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      // The model segments; it copies her words. Only the logging turns are
      // stubbed — everything else gets a plain reply.
      const m = /(\\d+) ?min/.exec(said)
      const logWorkout = m
        ? { date: null, corrects_previous: false, entries: [{ raw_text: said, exercise_phrase: said, sets_phrase: m[0] }] }
        : undefined
      return new Response(JSON.stringify({ reply: logWorkout ? '' : 'Sure.', logWorkout }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
  await wait(1500)
  return ok
}
const cardio = () => ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => r.activity_name + ':' + r.duration_minutes + ':' + r.intensity_rpe)`)
const text = () => ev(`document.body.innerText`)
const tapText = (label) => ev(`(() => {
  const b = [...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === ${JSON.stringify(label)})
  if (!b) return false
  b.click(); return true
})()`)

console.log('\n1. No effort in her words: it asks, and writes nothing yet\n')
check('1a. "did a 30 min walk" is sent', await say('did a 30 min walk'))
const t1 = await text()
check('1b. it asks how hard the walk was', /How hard was the walk\?/.test(t1), t1.slice(-300))
// ONE CANDIDATE CANNOT TEST A CHOICE: all three answers must be on screen.
const opts = await ev(`['Easy', 'Steady', 'Hard'].map(l => [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === l))`)
check('1c. ...offering Easy, Steady and Hard as taps', opts.every(Boolean), opts)
check('1d. ...and nothing is written before she answers', (await cardio()).length === 0, await cardio())
await shoot('chat-cardio-ask')

console.log('\n2. The tap logs it and reads it back in the screen\'s words\n')
check('2a. tapping Easy', await tapText('Easy'))
await wait(1200)
const t2 = await text()
check('2b. the receipt says Logged', /Logged · /.test(t2), t2.slice(-300))
check('2c. ...and reads back "Walk" with its minutes and effort', /Walk\s*\n?\s*30 min · Easy/.test(t2), t2.slice(-300))
// NO ZERO COUNT AT ALL, not merely not the pair — found by mutation: a
// summary reading "0 exercises · 1 activity" passed the first version.
check('2d. ...counted as an activity, with no zero count beside it', /1 activity/.test(t2) && !/\b0 (?:exercises?|sets?)\b/.test(t2), t2.slice(-300))
check('2e. the store holds one walk at 30 minutes and Easy\'s RPE, 3', (await cardio()).join(',') === 'Walk:30:3', await cardio())
await shoot('chat-cardio-logged')

console.log('\n3. Undo removes the walk\n')
check('3a. Undo is tapped', await tapText('Undo'))
await wait(1500)
check('3b. ...and the walk is gone from the store, not just the sets beside it', (await cardio()).length === 0, await cardio())

console.log('\n4. An effort she said is taken, exactly\n')
check('4a. "25 min run at RPE 8" is sent', await say('25 min run at RPE 8'))
const t4 = await text()
check('4b. it does not ask', !/How hard was the run\?/.test(t4), t4.slice(-300))
check('4c. ...and the store holds her 8, not Hard\'s 7', (await cardio()).join(',') === 'Run:25:8', await cardio())
check('4d. ...read back as Hard', /Run\s*\n?\s*25 min · Hard/.test(t4), t4.slice(-300))

console.log('\n5. A refused length is never called logged\n')
const before = (await cardio()).length
check('5a. "did a 0 min easy swim" is sent', await say('did a 0 min easy swim'))
const t5 = await text()
check('5b. the receipt says Not logged', /Not logged · /.test(t5), t5.slice(-300))
check('5c. ...and says why', /Not saved — that length doesn't look right/.test(t5), t5.slice(-300))
check('5d. ...and nothing new is in the store', (await cardio()).length === before, await cardio())
await shoot('chat-cardio-refused')

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null || err === undefined, err)

console.log(`\n${failures === 0 ? 'Chat logs cardio in the screen\'s words, and never claims what it did not do.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
