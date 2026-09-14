// ---------------------------------------------------------------------------
// "SWAP THIS EXERCISE", IN THE REAL CHAT.
//
// Ashley, 8 Sep 2026: asking the coach to swap an exercise answered "I
// couldn't find that on your current plan" for exercises plainly on it. The
// handler wanted three exact strings — the day as the plan spells it and both
// exercise names in full — and returned null from five places, all surfacing
// as that one sentence.
//
// The unit gate holds the resolver. This holds what it is for: a request with
// the day left out and the exercise named loosely — which is what "swap this
// exercise" produces — reaching a real proposal card with the right lift on
// it, rather than the dead end. The model is stubbed at the fetch boundary;
// everything after it is the real code, including the pending-action write.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9386', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9386/json/list').then(r => r.json())
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

console.log('\nA LOOSELY-NAMED SWAP FINDS THE EXERCISE\n')

// WHICH LIFT TO ASK FOR — read off the page, not typed here. This used to name
// "squats" and assert the card said Squats. Its own comment claimed the plan
// was read from the page, through `window.__todayExercises`, which no page has
// ever published: the read came back null every time and the hard-coded name
// was the whole test. Once "today" stopped drifting with the calendar, today's
// session had no squats on it and the resolver correctly said so — which the
// check reported as the dead end coming back.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(3000)
const swapTarget = await ev(`window.__swapTarget`)
check('0a. today’s session holds a lift with a loose name to ask for',
  !!swapTarget && !!swapTarget.full && !!swapTarget.loose, swapTarget)
if (!swapTarget) { console.error('\nNo usable lift on today’s session.\n'); ws.close(); chrome.kill(); server.close(); process.exit(1) }
console.log(`asking for "${swapTarget.loose}" — the plan spells it "${swapTarget.full}"`)
const TARGET_FULL = swapTarget.full

// THE SLOPPY ARGUMENTS ARE THE TEST. No day at all, and the old exercise named
// the way a person says it rather than the way the catalogue spells it. Both
// were dead ends before; either alone was enough.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__swapOld = ${JSON.stringify(swapTarget.loose)}
  window.__swapNew = 'leg press'
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/swap/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_exercise_swap',
          rawArgs: { day: '', old_item: window.__swapOld, new_item: window.__swapNew, scope: 'today', reason: 'Rack is busy.' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0b. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, 'swap this exercise, the rack is busy') })()`)
await wait(400)
check('1. asking for the swap', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
  if (!b || b.disabled) return false
  b.click(); return true
})()`))

const READ = String.raw`(() => {
  const text = document.body.innerText
  return {
    deadEnd: text.indexOf("couldn't find that on your current plan") !== -1,
    // The card's own heading, its Apply control (labelled with the scope, so
    // "Apply today") and its decline — all client-authored, so matching them
    // cannot be satisfied by model prose.
    hasProposal: /Proposed change/i.test(text)
      && [...document.querySelectorAll('button')].some(b => /^Apply/.test((b.textContent || '').trim()))
      && [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Keep'),
    mentionsTarget: text.indexOf(${JSON.stringify(TARGET_FULL)}) !== -1,
    mentionsLegPress: /Leg Press/i.test(text),
    buttons: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean),
    tail: text.replace(/\s+/g, ' ').slice(-320),
  }
})()`
let state = await ev(READ)
for (let i = 0; i < 24 && !state.hasProposal && !state.deadEnd; i++) { await wait(500); state = await ev(READ) }

check('2a. THE DEAD END IS GONE', state.deadEnd === false, state.tail)
check('2b. ...and a real proposal came back instead', state.hasProposal === true, state.buttons)
check('2c. ...for the exercise that is actually on the day, spelled the way the plan spells it',
  state.mentionsTarget === true, { asked: swapTarget.loose, expected: TARGET_FULL, tail: state.tail })
check('2d. ...swapped to the one that was asked for', state.mentionsLegPress === true, state.tail)
await shoot('swap-request-proposal')

// --- 4. THE CARD SAYS WHAT THE SWAP COSTS THE WEEK ------------------------
// Added 14 Sep 2026. CLAUDE.md named this card as the one surface still silent
// about cost while every other edit path stated it before the tap.
//
// TWO SWAPS, NOT ONE, and that is the whole design. A like-for-like swap
// costing nothing is the CORRECT answer and proves nothing — a card printing a
// constant would pass it. So this proposes a cross-pattern swap as well, off a
// differently-focused day, and asserts the card DIFFERS between them. That is
// the only way from out here to tell a real trial from a fixed string.
//
// READ THE CARD'S OWN CLASSIFICATION, NOT ITS WORDS. Each implication line
// carries data-severity, which is the app saying which line is a COST and
// which is a note. Matching the whole card's text for numbers is what the
// first version of these checks did, and it was worthless: "Sets × reps: 2×8"
// in the Unchanged row satisfied "the cost names real set counts" even after
// the words "pushing sets to" were deliberately deleted from the sentence.
const READ_CARD = String.raw`(() => {
  const all = [...document.querySelectorAll('*')].filter(e => /Proposed change/i.test(e.textContent || ''))
  const heading = all[all.length - 1]
  if (!heading) return null
  let p = heading
  for (let i = 0; i < 12 && p.parentElement; i++) {
    p = p.parentElement
    const btns = [...p.querySelectorAll('button')].map(b => (b.textContent || '').trim())
    if (btns.some(t => /^Apply/.test(t)) && btns.includes('Keep')) break
  }
  const lines = [...p.querySelectorAll('[data-severity]')]
  return {
    text: p.textContent.replace(/\s+/g, ' ').trim(),
    warns: lines.filter(e => e.getAttribute('data-severity') === 'warn').map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    infos: lines.filter(e => e.getAttribute('data-severity') === 'info').map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  }
})()`

const likeForLike = await ev(READ_CARD)
check('4a. the first card can be read', !!likeForLike && typeof likeForLike.text === 'string' && likeForLike.text.length > 40, likeForLike)
// THE WEIGHT STAYS DEFERRED — the half the original silence was right about.
check('4b. it still leaves the weight to confirm rather than quoting one',
  /Load recomputed for the new movement once you confirm/i.test(likeForLike?.text || ''), likeForLike?.text)
// The severity hook itself, checked separately so that losing it fails under
// its own name instead of looking like a card that went quiet about cost.
check('4b2. the card labels its lines by severity, so a cost can be told from a note',
  (likeForLike?.infos?.length ?? 0) > 0, likeForLike)

const cross = await ev('window.__crossPatternSwap ?? null')
check('4c. the plan offers a cross-pattern swap to test with', !!cross && !!cross.from && !!cross.to, cross)
if (cross) {
  console.log(`  second swap: ${cross.from} (${cross.fromFocus}) -> ${cross.to} (${cross.toFocus})`)
  await ev(`window.__swapOld = ${JSON.stringify(cross.from)}; window.__swapNew = ${JSON.stringify(cross.to)}`)
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) {
    const proto = window.HTMLTextAreaElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(t, 'swap this exercise, the rack is busy')
    t.dispatchEvent(new Event('input', { bubbles: true }))
  } })()`)
  await wait(400)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
  await wait(3500)
  const crossCard = await ev(READ_CARD)
  check('4d. the second card can be read', !!crossCard && typeof crossCard.text === 'string' && crossCard.text.length > 40, crossCard)

  // WHAT COUNTS AS A COST: a line the card ITSELF marks as a warning. Two
  // earlier versions of this check were worthless and both were found by
  // breaking the code rather than by reading them:
  //   1st — asserted only that the two cards DIFFER. They always do: the
  //         exercise names differ. It passed on a card with no cost at all.
  //   2nd — matched the whole card text for a sentence with a number in it.
  //         Deleting "pushing sets to" from the real sentence left it GREEN,
  //         because "Unchanged: … Sets × reps: 2×8" sits in the same card.
  // Reading the warn-severity lines fixes both: nothing else on the card is
  // one, so neither a silent card nor a neighbouring row can satisfy it.
  const costs = [likeForLike, crossCard].flatMap(c => c?.warns ?? [])
  check('4e. at least one of the two swaps reports a balance cost, in its own warning line',
    costs.length > 0, { first: likeForLike?.warns, second: crossCard?.warns })
  // AND THE NUMBERS ARE IN THE SENTENCE SHE READS, not merely somewhere on the
  // card: a warning that says "your week is unbalanced" and nothing else is
  // the thing this was built to avoid.
  const COUNTED = /\b\d+ (?:pushing|chest) sets to \d+ (?:pulling|back)\b/i
  const EMPTY_SIDE = /leaves nothing (?:pulling|pushing) this week|leaves nothing for your (?:back|chest) this week/i
  check('4f. ...naming both set counts, not a vague warning',
    costs.every(c => COUNTED.test(c) || EMPTY_SIDE.test(c)), costs)
  // AND NOT ON EVERY SWAP. A card that warned every time would be wallpaper —
  // session-balance-cost's own header says a week no worse after gets silence.
  check('4g. ...and a swap that costs nothing stays quiet about balance',
    costs.length < 2, { first: likeForLike?.warns, second: crossCard?.warns })
  await shoot('swap-request-cost')
}

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe swap finds the exercise.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
