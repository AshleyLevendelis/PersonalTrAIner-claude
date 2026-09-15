// ---------------------------------------------------------------------------
// "THAT WOULD COST YOU SOMETHING" — ASKED, IN A REAL BROWSER.
//
// Ashley, 14 Sep 2026: "If we just allow users to make any change they want
// without advising them, they will end up with a plan that doesn't help them
// meet their goal." The decision that followed — ask first at tier 2, never
// refuse what is not unsafe — is guarded by test:edit-tradeoff (the rules) and
// test:coach-promises (the wiring).
//
// THIS EXISTS BECAUSE NEITHER OF THOSE CAN SEE A DEAD BRANCH. Measured the same
// day: changing the guard to `if (false && advice)` disabled the entire
// trade-off step and all twelve wiring checks still passed, because they read
// source text and the text was still there. A source gate cannot tell reachable
// code from unreachable code. A browser can — it either gets a question or it
// does not.
//
// TWO ASKS, AND THE SECOND IS THE POINT. The first request for a
// goal-damaging change must produce a QUESTION and no card. The second
// identical request must produce a CARD — that is "once per block, per thing"
// working, and it is also what proves the first outcome was a decision rather
// than the card path being broken.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9391', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9391/json/list').then(r => r.json())
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

console.log('\nA CHANGE THAT WORKS AGAINST THE GOAL IS ASKED ABOUT\n')

// The model is stubbed at the fetch boundary; everything after it — the
// builder, the trial, the verdict, the guards — is the real code.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/drop|remove/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_exercise_remove',
          rawArgs: {
            day: window.__removeDay, item: window.__removeName, scope: 'permanent',
            // The tool has always had this field and nothing ever filled it.
            // Left undefined by default so the default run is "no reason
            // given", which is the state every real request was in.
            ...(window.__removeReason ? { reason: window.__removeReason } : {}),
          },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

// WHICH REMOVAL ACTUALLY COSTS SOMETHING — computed by the page against its
// own generated week, never named here. See chat.tsx's own note.
const removal = await ev('window.__tradeoffRemoval ?? null')
check('0a. this week holds a removal that genuinely works against the goal',
  !!removal && !!removal.name, removal)
if (!removal) {
  console.error('\nNo tier-2 removal on this week — nothing to drive.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`  asking to drop "${removal.name}" from ${removal.day} for the block`)
console.log(`  the engine's reason: ${removal.reason}`)
await ev(`window.__removeName = ${JSON.stringify(removal.name)}; window.__removeDay = ${JSON.stringify(removal.day)}`)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0b. the chat is up', ready === true)

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

// What is on screen: whether a confirm card exists, and what chips are offered.
const READ = `(() => {
  const text = document.body.innerText
  const buttons = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return {
    hasCard: /Proposed change/i.test(text),
    // HOW MANY, not whether. The chat keeps every earlier turn on screen, so
    // a boolean answers "has this conversation ever produced a card" — which
    // is true from section 1 onwards and says nothing about THIS turn. Cost a
    // false failure on the reason ask before it was noticed.
    cards: (text.match(/Proposed change/gi) || []).length,
    hasApply: buttons.some(t => /^Apply/.test(t)),
    chips: buttons.filter(t => t.length < 30),
    tail: text.replace(/\\s+/g, ' ').slice(-420),
  }
})()`

// --- 1. THE FIRST ASK ------------------------------------------------------
await ask(`drop ${removal.name} from ${removal.day} for the rest of the block`)
const first = await ev(READ)
await shoot('tradeoff-ask')

check('1a. it does NOT put a confirm card up', first.hasCard === false && first.hasApply === false, first)
check('1b. ...it asks a question instead', /\?/.test(first.tail), first.tail)
check('1c. ...naming what it costs in the goal’s own terms',
  /\bsets\b/i.test(first.tail) && /\d+/.test(first.tail), first.tail)
// THE WHOLE OF THE DECISION: never blocked, exactly one tap further away.
check('1d. ...and offers "Do it anyway"', first.chips.some(c => /do it anyway/i.test(c)), first.chips)
check('1e. ...alongside a cheaper route, not on its own',
  first.chips.filter(c => !/do it anyway/i.test(c) && !/^(Send|Chat|Home|Nutrition|Exercise|Tools)$/i.test(c)).length >= 1, first.chips)

// --- 2. THE SECOND ASK -----------------------------------------------------
// Once per block, per thing. The same request again must go straight to a card
// — which is also what proves the first outcome was a decision and not simply
// a broken card path.
await ask(`drop ${removal.name} from ${removal.day} for the rest of the block`)
const second = await ev(READ)
await shoot('tradeoff-second-ask')

check('2a. asked a second time, it stops asking and shows the card', second.hasCard === true, second)
check('2b. ...and the card still states what it costs',
  /\bsets\b/i.test(second.tail), second.tail)
check('2c. ...so the change was never blocked, only slowed by one tap', second.hasApply === true, second)

// --- 4. THE REASON ASK -----------------------------------------------------
//
// Everything above is the tier-2 path: a change that works against the goal.
// That is the rare case. The ordinary one — drop an accessory, nothing much
// lost — used to go straight to a card, and the app never learned WHY. §3:
// "the bench is busy", "my shoulder hurts" and "I hate this exercise" are
// three different problems answered with the same swap.
//
// DIFFERENT TARGET, DELIBERATELY. The lift above asks its own question, so it
// can never reach this branch. A driver reusing it would report green on code
// it had not entered.
const cheap = await ev('window.__cheapRemoval ?? null')
check('4a. this week holds a removal that is NOT goal-damaging',
  !!cheap && !!cheap.name && cheap.tier !== 2, cheap)

if (cheap) {
  console.log(`  asking to drop "${cheap.name}" from ${cheap.day} — the engine prices it tier ${cheap.tier}`)
  await ev(`window.__removeName = ${JSON.stringify(cheap.name)}; window.__removeDay = ${JSON.stringify(cheap.day)}`)
  const beforeCards = (await ev(READ)).cards
  await ask(`drop ${cheap.name} from ${cheap.day} for the rest of the block`)
  const why = await ev(READ)
  await shoot('tradeoff-reason-ask')

  check('4b. it asks why instead of putting a card up',
    why.cards === beforeCards, { was: beforeCards, now: why.cards, tail: why.tail })
  check('4c. ...naming the exercise', new RegExp(cheap.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(why.tail), why.tail)
  // The four answers, and the escape beside them. Read off the rendered
  // buttons, because the slice that used to drop the escape chip lived
  // between the verdict and the screen.
  // THE REMOVE SET. Swap and remove offer different answers on purpose —
  // nobody removes an exercise because the machine is taken, they put
  // something else there. Using the swap list here was this driver's own
  // first bug.
  const wanted = ["short on time", "wiped", "hurts", "don't like"]
  const got = wanted.filter(w => why.chips.some(c => c.toLowerCase().includes(w)))
  check('4d. ...offering four reasons to choose from', got.length === 4, { got, chips: why.chips })
  check('4e. ...and "Do it anyway" beside them, so nothing is blocked',
    why.chips.some(c => /do it anyway/i.test(c)), why.chips)

  // --- 5. ONCE, THEN TRUSTED ----------------------------------------------
  // The same guard the goal ask uses. Asking a second time about one exercise
  // in one block is the nagging the decision's shape rules exist to prevent.
  await ask(`drop ${cheap.name} from ${cheap.day} for the rest of the block`)
  const again = await ev(READ)
  check('5a. asked again, it stops asking and shows the card', again.cards === beforeCards + 1, { was: beforeCards, now: again.cards })
  check('5b. ...so the change was never blocked, only slowed by one tap', again.hasApply === true, again)
}

// --- 6. SAY WHY AND IT DOES NOT ASK -----------------------------------------
//
// THE NON-VACUITY HALF, and it was missing until a mutation found it: with the
// `reasonGiven` test removed the app asked on EVERY request, and every check
// above still passed, because none of them ever sent a reason. "It asks" is
// only a decision if there is a case where it does not.
//
// A different lift, because the ask is spent once per block per thing.
const cheap2 = await ev('window.__cheapRemoval2 ?? null')
check('6a. the week holds a second non-goal-damaging removal to try', !!cheap2 && !!cheap2.name, cheap2)
if (cheap2) {
  await ev(`window.__removeName = ${JSON.stringify(cheap2.name)}; window.__removeDay = ${JSON.stringify(cheap2.day)}; window.__removeReason = 'my shoulder is sore'`)
  const before2 = (await ev(READ)).cards
  await ask(`drop ${cheap2.name} from ${cheap2.day} for the rest of the block because my shoulder is sore`)
  const told = await ev(READ)
  check('6b. told why, it goes straight to the card without asking',
    told.cards === before2 + 1, { was: before2, now: told.cards, tail: told.tail })
  check('6c. ...and does not ask the reason question anyway',
    !told.chips.some(c => /wiped today|short on time/i.test(c)), told.chips)
  await ev(`window.__removeReason = undefined`)
}

const err = await ev('window.__err ?? null')
check('7. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA goal-damaging change is asked about, then allowed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
