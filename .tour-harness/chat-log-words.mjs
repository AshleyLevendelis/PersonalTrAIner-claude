// ---------------------------------------------------------------------------
// WHAT THE CHAT SAYS WHEN IT HAS LOGGED A WORKOUT, on a real screen (19 Nov 2026).
//
// The coach exam of 18 Nov: "squats done, got 50kg for all three sets" was a first at that weight and got a card
// with no words. A tester the same week: the bubble above the card was the card's own title, so "Logged · <day>"
// read twice, and still said so after Undo.
//
// The model is stubbed at the fetch boundary with the tool call it makes (the lift's name and "3x8 at N kg", as he
// would say it); everything after that is the app's own code: the parse, the write, the record engine, the line.
// test:chat-log-words holds the function; this holds what he sees, and where.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9966, page: 'chat.html', name: 'chat-log-words' })
const { send, ev, shoot, check, wait, go, finish, until } = d

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      const m = /^did (.+?) (\\d+x\\d+ at [\\d.]+ ?kg)$/.exec(said)
      const logWorkout = m ? { date: null, corrects_previous: false, entries: [{ raw_text: said, exercise_phrase: m[1], sets_phrase: m[2] }] } : undefined
      return new Response(JSON.stringify({ reply: logWorkout ? '' : 'Sure.', logWorkout }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
// What he reads: the page's text, the last coach bubble, and where that bubble sits.
const READ = `(() => {
  const text = document.body.innerText
  // The line above the card: a leaf whose WHOLE text is one of the app's three log lines (the card's own "was taken
  // back" detail is a different sentence and is not it).
  const best = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^(That's a new best on .*|Got it, that's (logged|corrected)\\.|That's taken back\\.)$/.test((e.textContent || '').trim())).pop()
  const r = best ? best.getBoundingClientRect() : null
  return {
    // The title as a line of its own (the put-back detail quotes it inside a sentence, which is not the title).
    titles: (text.match(/^Logged · \\w+$/gm) || []).length,
    line: best ? best.textContent.trim() : null,
    onScreen: !!r && r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
    hasUndo: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Undo'),
    putBack: /Put back/.test(text),
    text: text.slice(-700),
  }
})()`
const lift = async () => ev('window.__firstLoadedLift')

// 1. A record to beat: one set of today's first loaded lift, a week ago, at 20 kg.
await go('&earlier=20')
await wait(3500)
const name = await lift()
check('1a. the page has a loaded lift today, and names it', typeof name === 'string' && name.length > 2, name)
console.log('    (lift: ' + name + ')')
const before = await ev(`JSON.stringify((window.__fakeDb?.exercise_set_logs ?? []).map(r => [r.exercise_name, r.weight_kg]))`)
check('1a2. the record to beat is really there: one earlier set of that lift at 20 kg', before === JSON.stringify([[name, 20]]), before)
check('1b. the chat sent', await say(`did ${name} 3x8 at 60 kg`))
await until(() => ev(READ), v => v.titles >= 1)
await wait(600)
const one = await ev(READ)
await shoot('chat-log-words-1-best')
check('1c. the line above the card names the lift and the new best, with its unit', one.line === `That's a new best on ${name}: 60kg. Nice work.`, one.line)
check("1d. 'Logged · <day>' is said ONCE (the card's own title), not twice", one.titles === 1, one.titles)
check('1e. the line is on screen where he is looking', one.onScreen === true, one)
check('1f. the card still offers Undo', one.hasUndo === true)

// 2. Undo takes the line back with the card.
await ev(`(() => { const b = [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === 'Undo').pop(); if (b) b.click() })()`)
await until(() => ev(READ), v => v.putBack)
await wait(500)
const undone = await ev(READ)
await shoot('chat-log-words-2-undone')
check('2a. the card says it was put back', undone.putBack === true, undone.text.slice(-200))
check('2b. the line above it no longer says a best was logged', undone.line === "That's taken back." && !/new best/.test(undone.text), undone.line)
check('2c. ...and nothing on the page still says "Logged · <day>"', undone.titles === 0, undone.titles)
check('2d. the card says what was undone in plain words, not a sentence about its own title', /Those sets are off your log\./.test(undone.text) && !/Logged · \w+ was taken back/.test(undone.text), undone.text.slice(-220))

// 3. No record to beat: a first log is a baseline, and the line is the plain one.
await go('&earlier=0')
await wait(3500)
const name2 = await lift()
check('3a. the chat sent', await say(`did ${name2} 3x8 at 60 kg`))
await until(() => ev(READ), v => v.titles >= 1)
await wait(600)
const plain = await ev(READ)
await shoot('chat-log-words-3-plain')
check('3b. a first log of a lift is not called a best', plain.line === "Got it, that's logged." && !/new best/.test(plain.text), plain.line)
check('3c. ...and the title is still said once', plain.titles === 1, plain.titles)

// 4. The same weight as the record is not a best either.
await go('&earlier=60')
await wait(3500)
check('4a. the chat sent', await say(`did ${await lift()} 3x8 at 60 kg`))
await until(() => ev(READ), v => v.titles >= 1)
await wait(600)
const same = await ev(READ)
check('4b. matching the record is logged, not celebrated', same.line === "Got it, that's logged.", same.line)

await finish()
