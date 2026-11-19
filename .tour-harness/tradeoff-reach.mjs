// ---------------------------------------------------------------------------
// WARNINGS THAT WERE WRITTEN AND NEVER REACHED (18 Nov 2026). PORT 9957.
// edit-tradeoff.ts has held "an ongoing volume cut in an accumulation block asks first" since 14 Sep; no caller ever
// passed that kind, so it could not fire, and its logic gate stayed green (a test: gate cannot prove a branch is
// reached). The coach is stubbed at the fetch boundary; the builder, the verdict and the guards are the app's own.
// The page is sat in a building week for the volume cut and in a strength week for the reorder and the ban, each
// found from the plan's own phases.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9957', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9957/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 360)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })


console.log('\nWARNINGS WRITTEN IN SEPTEMBER THAT NO REQUEST COULD REACH\n')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (/never give me/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_exercise_ban', rawArgs: { item: window.__main, origin_verbatim_quote: said } } })
      // An ordinary change of order: the second exercise of today goes to the end (the chat walk's own request, C5).
      if (/^move .* to the end of today$/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_exercise_reorder', rawArgs: { day: '', item: window.__todaysExercises[1], after_item: window.__todaysExercises[window.__todaysExercises.length - 1] } } })
      if (/^do .* last/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_exercise_reorder', rawArgs: { day: window.__mainDay, item: window.__main, after_item: window.__last } } })
      if (/lighter/i.test(said)) return json({ reply: '', proposal: { kind: 'propose_volume_change', rawArgs: { day: window.__day, direction: 'lighter', ...(/today/i.test(said) ? { scope: 'today' } : {}) } } })
      return json({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
// WHICH WEEK BINDS IS FOUND, NOT ASSUMED: load once to read the plan's own phases, then sit in the first loading
// week of a phase whose job is building work up.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=1` })
await wait(4000)
const probe = await ev('window.__weekFacts ?? null')
const building = (probe?.phases ?? []).map(p => p.split(':')).find(([, phase, deload]) => /^(Hypertrophy|Metabolic Conditioning|Consolidation)$/.test(phase) && !deload)
check('0. the plan has a building week to sit in', !!building, probe?.phases)
const started = building ? (Number(building[0]) - 1) * 7 + 2 : 9
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=2&started=${started}` })
await wait(4500)
const facts = await ev('window.__weekFacts ?? null')
console.log(`  sitting in week ${facts?.liveWeek} (${facts?.phase}), asking about ${facts?.day}`)
check('0a. the page has a live week with a training day', !!facts && !!facts.day, facts)
check('0b. the app\'s own verdict on an ongoing cut this week is "ask first" (so the case below binds)', !!facts && facts.volumeTier === 2, facts)
if (!facts) { ws.close(); chrome.kill(); server.close(); process.exit(1) }
await ev(`window.__day = ${JSON.stringify(facts.day)}`)
let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0c. the chat is up', ready === true)
const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const ask = async words => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(words)}) })()`)
  await wait(400)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
  await wait(4000)
}
const READ = `(() => {
  const bs = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')]
  const buttons = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return { cards: document.querySelectorAll('[data-testid="proposal-card"]').length, last: bs.length ? bs[bs.length - 1].innerText.trim() : '', chips: buttons.filter(t => t.length < 30) }
})()`

console.log('\n1. An ongoing cut in the block that builds the work up is asked about\n')
const before = await ev(READ)
await ask(`make ${facts.day} lighter from now on`)
const first = await ev(READ)
await shoot('tradeoff-reach-volume')
check('1a. no card is put up', first.cards === before.cards, first)
check('1b. the app asks whether it is a today thing or every week', /is this a today thing, or is every week too much/i.test(first.last), first.last)
check('1c. "Do it anyway" is one tap away, beside "Just today"', first.chips.some(c => /do it anyway/i.test(c)) && first.chips.some(c => /^Just today$/i.test(c)), first.chips)
await ask(`make ${facts.day} lighter from now on`)
const second = await ev(READ)
check('1d. asked once: the same request again goes straight to a card', second.cards === first.cards + 1, second)

console.log('\n2. In a strength week: banning the block\'s main lift, and moving it last, are asked about\n')
const strong = (probe?.phases ?? []).map(p => p.split(':')).find(([, phase, deload]) => /^(Maximal Strength|Power & Expression)$/.test(phase) && !deload)
check('2a. the plan has a strength week to sit in', !!strong, probe?.phases)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=3&started=${strong ? (Number(strong[0]) - 1) * 7 + 2 : 9}` })
await wait(4500)
const f2 = await ev('window.__weekFacts ?? null')
check('2b. that week has a main lift the app says to ask about (so the cases bind)', !!f2?.main, f2)
console.log(`  sitting in week ${f2?.liveWeek} (${f2?.phase}); the lift is ${f2?.main?.name} on ${f2?.main?.day}`)
await ev(`window.__main = ${JSON.stringify(f2?.main?.name ?? '')}; window.__mainDay = ${JSON.stringify(f2?.main?.day ?? '')}; window.__last = ${JSON.stringify(f2?.main?.last ?? '')}`)
ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
const b0 = await ev(READ)
await ask(`do ${f2?.main?.name} last on ${f2?.main?.day}`)
const ro = await ev(READ)
await shoot('tradeoff-reach-reorder')
check('2c. moving the main lift last: no card, a question about hitting it tired', ro.cards === b0.cards && /tired/i.test(ro.last) && /\?/.test(ro.last), ro)
check('2d. ...with "Do it anyway" beside leaving the order', ro.chips.some(c => /do it anyway/i.test(c)) && ro.chips.some(c => /leave the order/i.test(c)), ro.chips)
await ask(`never give me ${f2?.main?.name} again`)
const bn = await ev(READ)
await shoot('tradeoff-reach-ban')
check('2e. banning it: no card, and the question names what the block is built around', bn.cards === ro.cards && /is what this block is built around/i.test(bn.last), bn)
check('2f. ...with "Do it anyway" one tap away', bn.chips.some(c => /do it anyway/i.test(c)), bn.chips)

console.log('\n3. An ordinary change of order is offered with no warning it has not earned\n')
// The chat walk of 18 Nov 2026 (C5): "move <the second exercise> to the end of today" came with "Worth knowing: the
// week stops covering everything it should", because the plan scorer lined the weeks up by row and read a lift one
// row away as a changed main lift. The page as it opens, the tester's own request.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=4` })
await wait(4500)
ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
const today3 = await ev(`window.__todaysExercises ?? []`)
check('3a. today has a session with a second exercise to move', Array.isArray(today3) && today3.length >= 3, today3)
const c0 = await ev(READ)
await ask(`move ${today3?.[1]} to the end of today`)
const mv = await ev(READ)
const offer3 = await ev(`[...document.querySelectorAll('[data-testid="proposal-card"]')].pop()?.innerText ?? ''`)
await shoot('tradeoff-reach-plain-reorder')
check('3b. the move is offered', mv.cards === c0.cards + 1 && offer3.includes(String(today3?.[1])), { cards: [c0.cards, mv.cards], offer3: offer3.slice(0, 300) })
check('3c. WITH NO "Worth knowing" LINE: nothing about the week changed but the order', !/Worth knowing|stops covering|stops building|pulls the plan away/i.test(offer3 + ' ' + mv.last), (offer3 + ' | ' + mv.last).slice(0, 500))

console.log(`\n17 checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('The three warnings are reached.\n')
