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
      // "... on 2026-09-15" is the date the coach passes for a session from an earlier day.
      const m = /^did (.+?) (\\d+x\\d+ at [\\d.]+ ?kg)(?: on (\\S+))?$/.exec(said)
      const logWorkout = m ? { date: m[3] || null, corrects_previous: false, entries: [{ raw_text: said, exercise_phrase: m[1], sets_phrase: m[2] }] } : undefined
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

// 5. A SESSION FROM YESTERDAY GOES ON YESTERDAY (19 Nov 2026): the date used to be dropped and the sets written to today.
const shift = (iso, days) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10) }
const DB = `(() => { const d = window.__fakeDb; return {
  sets: (d.exercise_set_logs || []).map(r => [r.exercise_name, r.set_number, r.weight_kg, String(r.completed_at).slice(0, 10)]),
  sessions: (d.workout_sessions || []).map(r => [r.date, !!r.is_completed]),
} })()`
await go('&earlier=0')
await wait(3500)
const today = await ev('window.__todayStr')
const yesterday = shift(today, -1)
const lift5 = await lift()
const label = await ev(`(() => { const [y, m, d] = ${JSON.stringify(yesterday)}.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)); return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][w.getUTCDay()] + ' ' + w.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][w.getUTCMonth()] })()`)
check('5a. the chat sent', await say(`did ${lift5} 3x8 at 50 kg on ${yesterday}`))
await until(() => ev(`document.body.innerText`), t => /logged on |didn't save/.test(t))
await wait(800)
const pastText = await ev('document.body.innerText')
const pastDb = await ev(DB)
await shoot('chat-log-words-5-yesterday')
check('5b. the line names the day it went on', pastText.includes(`Got it, that's logged on ${label}.`), pastText.slice(-300))
check('5c. the card is titled with that day, not today', new RegExp(`Logged · ${label}`).test(pastText), pastText.slice(-300))
check('5c2. nothing on the card talks about TODAY\u2019s plan', !/today's plan|Additional Work|than the estimate/i.test(pastText.slice(pastText.lastIndexOf('logged on'))), pastText.slice(-260))
check('5d. three sets are in the database, every one dated YESTERDAY', pastDb.sets.length === 3 && pastDb.sets.every(r => r[0] === lift5 && r[2] === 50 && r[3] === yesterday), pastDb.sets)
check('5e. NOT ONE set was written to today', pastDb.sets.every(r => r[3] !== today), pastDb.sets)
check('5f. yesterday is a finished session', pastDb.sessions.some(r => r[0] === yesterday && r[1] === true), pastDb.sessions)
// Read off the record: the chat header's "0 of N sets" pill this read was removed on his word, 20 Nov 2026.
check('5g. today\u2019s own session has not moved: not finished, nothing logged on it', !pastDb.sessions.some(r => r[0] === today && r[1] === true) && pastDb.sets.every(r => r[3] !== today), { sessions: pastDb.sessions, today })

// 6. More sets told about the same day are added AFTER the ones there, never over them.
check('6a. the chat sent', await say(`did ${lift5} 2x8 at 55 kg on ${yesterday}`))
await until(() => ev(DB), v => v.sets.length >= 5)
await wait(500)
const more = await ev(DB)
check('6b. five sets now, numbered 1 to 5, the first three untouched', more.sets.length === 5 && JSON.stringify(more.sets.map(r => r[1]).sort()) === '[1,2,3,4,5]' && more.sets.filter(r => r[2] === 50).length === 3 && more.sets.filter(r => r[2] === 55).length === 2, more.sets)

// 7. A day that has not happened is refused and nothing is written; any earlier day, however far back, is that day
// (two weeks until 28 Nov 2026; his "whatever they want" widened it, advise-then-allow fix 20).
const before7 = (await ev(DB)).sets.length
check('7a. the chat sent', await say(`did ${lift5} 3x8 at 50 kg on ${shift(today, 1)}`))
await until(() => ev('document.body.innerText'), t => /hasn't happened yet/.test(t))
const future = await ev('document.body.innerText')
check('7b. tomorrow is refused in a sentence that says nothing was logged', /That day hasn't happened yet, so nothing was logged\./.test(future), future.slice(-200))
check('7b2. ...and wrote no set', (await ev(DB)).sets.length === before7, (await ev(DB)).sets.length)
const twentyBack = shift(today, -20)
check('7c. the chat sent', await say(`did ${lift5} 3x8 at 50 kg on ${twentyBack}`))
await until(() => ev(DB), v => v.sets.some(r => r[3] === twentyBack))
await wait(500)
const old = await ev('document.body.innerText')
const oldDb = await ev(DB)
check('7d. twenty days back is logged, and the line names that date (not a bare weekday)', /logged on \w+day \d{1,2} \w{3}\./.test(old) && !/more than two weeks/.test(old), old.slice(-200))
check('7e. ...three sets, every one on THAT day, none on today', oldDb.sets.filter(r => r[3] === twentyBack).length === 3 && oldDb.sets.length === before7 + 3 && oldDb.sets.every(r => r[3] !== today), oldDb.sets)

await finish()
