// ---------------------------------------------------------------------------
// "LET'S DO A CARDIO WORKOUT TODAY", TO THE COACH.
//
// Ashley's live test, 19 Oct 2026, and her ruling of 20 Oct: "Drop it, today
// only." The coach's propose_session_kind_today card is built by the SAME
// trial the day menu runs (planSessionKindToday) and worded by the same
// builder; this holds what only the real chat can show: the card arrives,
// lists the session and what it could not do BEFORE the tap, nothing is
// written until Apply, Apply makes today exactly the session the card listed —
// the same session the day menu would have built — and Undo puts the planned
// session back. A model that names a kind the app does not have, or a day
// that is not today, gets a sentence, not a card.
//
// WHAT THIS CANNOT SEE: the model is stubbed at the fetch boundary, so the
// edge function's handler and prompt never run here. Whether the coach CALLS
// this tool for "cardio today" rather than the rebuild is the coach exam's
// case `kind-today-not-same-kind`.
//
// PORT 9761.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9761, page: 'chat.html', name: 'chat-session-kind' })
const { send, ev, check, until, wait, go, shoot, finish } = d

await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse((init && init.body) || '{}')
      const said = String(body.message || '')
      const reply = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      const card = rawArgs => reply({ reply: '', proposal: { kind: 'propose_session_kind_today', rawArgs: { ...rawArgs, origin_verbatim_quote: said } } })
      if (/functional workout today/i.test(said)) return card({ kind: 'functional', moves: ['sled push', 'box jumps'], reason: "can't face the planned session" })
      if (/cardio workout today/i.test(said)) return card({ kind: 'cardio', reason: "can't do weights today" })
      // A MODEL THAT INVENTS A KIND, and one that reaches past today.
      if (/yoga/i.test(said)) return card({ kind: 'yoga' })
      if (/next week/i.test(said)) return card({ kind: 'cardio', day: 'Saturday' })
      return reply({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
await go('&kindtoday=1')
const ready = await until(() => ev(`!!document.querySelector('textarea') && typeof window.__todayNames === 'function'`), v => v === true, 40)
check('0a. the chat is up', ready === true)
const start = await ev('window.__todayNames()')
check('0b. today is a real session', Array.isArray(start) && start.length >= 4, start)

const say = async t => {
  await ev(`(() => { const x = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(x, ${JSON.stringify(t)}); x.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const lastCard = () => ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); if (!c) return null;
  // Offers are text since 20 Oct ("Text + small buttons always"): each exercise is one line, "Name: dose".
  const rows = [...c.querySelectorAll('[data-offer-line="change"]')].map(l => { const t = l.textContent.trim(); const i = t.indexOf(': '); return i < 0 ? [t] : [t.slice(0, i), t.slice(i + 2)] })
  return { text: c.innerText.replace(/\\s+/g, ' '), rows, notes: [...c.querySelectorAll('[data-severity]')].map(n => ({ sev: n.getAttribute('data-severity'), text: n.innerText.trim() })), status: c.getAttribute('data-card-status') } })()`)
const cardCount = () => ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)
const body = () => ev('document.body.innerText')
const button = re => ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => ${re}.test((x.textContent || '').trim())).pop(); if (!b || b.disabled) return false; b.click(); return true })()`)

// 1. THE CARD: the session, what it could not do, nothing written.
check('1a. she asks', await say("I can't face it — give me a functional workout today with sled push, box jumps and that kind of thing") === true)
const card = await until(lastCard, v => !!v && v.rows.length > 0, 60)
const lead = await until(body, t => /Want me to make today a functional session instead of [^?\n]+\?/.test(t), 40)
check('1b. a card comes back, asking first', !!card && /Want me to make today a functional session instead of [^?\n]+\?/.test(lead), lead.slice(-500))
const cardNames = (card?.rows ?? []).map(r => r[0])
check('1c. it lists the session, box jumps first', cardNames[0] === 'Box Jumps' && cardNames.length >= 5, card?.rows)
check('1d. it says there is no sled push and what does that job, as a caution', !!card?.notes.find(n => n.sev === 'warn' && /There's no sled push in the app's exercise list, so .+ does the loaded carrying\./.test(n.text)), card?.notes)
check('1e. it says the main lift goes and when it is back', !!card?.notes.find(n => /are out today and back|is out today and back/.test(n.text) && /doesn't change the weight/.test(n.text)), card?.notes)
check('1f. ...and that it is just today', !!card?.notes.find(n => /^Just today — /.test(n.text)), card?.notes)
const screenWould = await ev(`window.__kindPlan('functional', ['sled push', 'box jumps'])`)
check('1g. PARITY: the card lists exactly the session the day menu would build', JSON.stringify(screenWould) === JSON.stringify(cardNames), { screenWould, cardNames })
check('1h. NOTHING WRITTEN before the tap', JSON.stringify(await ev('window.__todayNames()')) === JSON.stringify(start))
await shoot('chat-session-kind-card')

// 2. APPLY: today becomes the session the card listed.
check('2a. Apply', await button('/^Apply/'))
const applied = await until(() => ev('window.__todayNames()'), v => JSON.stringify(v) !== JSON.stringify(start), 60)
check('2b. today is now exactly the listed session', JSON.stringify(applied) === JSON.stringify(cardNames), { applied, cardNames })
check('2c. ...named for what it is', (await ev('window.__todayFocus2()')) === 'Functional session')
const receipt = await until(body, t => /Today swapped/.test(t), 40)
check('2d. a receipt says it was done', /Today swapped/.test(receipt))
await shoot('chat-session-kind-applied')

// 3. UNDO: the planned session back, exactly.
check('3a. Undo', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Undo'); if (!b || b.disabled) return false; b.click(); return true })()`))
const back = await until(() => ev('window.__todayNames()'), v => JSON.stringify(v) === JSON.stringify(start), 60)
check('3b. the planned session is back, exactly', JSON.stringify(back) === JSON.stringify(start), { back, start })
await shoot('chat-session-kind-undone')

// 4. CARDIO, and "Not now" leaves it as it was.
check('4a. she asks for cardio', await say("let's do a cardio workout today, I can't do weights") === true)
const cardio = await until(lastCard, v => !!v && /cardio session instead/.test(v.text) === false && v.rows.length > 0 && v.rows[0][0] !== 'Box Jumps', 60)
const cardioLead = await until(body, t => /Want me to make today a cardio session instead of/.test(t), 40)
check('4b. a cardio card comes back', /Want me to make today a cardio session instead of/.test(cardioLead))
check('4c. ...of conditioning blocks, in rounds or minutes', !!cardio && cardio.rows.filter(r => /rounds, \d+s on, \d+s off|min steady/.test(r[r.length - 1] ?? '')).length >= 2, cardio?.rows)
const cardioPlan = await ev(`window.__kindPlan('cardio', [])`)
check('4d. PARITY again, for cardio', JSON.stringify(cardioPlan) === JSON.stringify((cardio?.rows ?? []).map(r => r[0])), { cardioPlan, rows: cardio?.rows })
check('4e. "Not now" (Keep)', await button('/^(Keep|Not now)/'))
await wait(800)
check('4f. ...and today is untouched', JSON.stringify(await ev('window.__todayNames()')) === JSON.stringify(start))

// 5. A MODEL THAT INVENTS A KIND, OR REACHES PAST TODAY: a sentence, no card.
const before5 = await cardCount()
check('5a. a kind the app does not have', await say('can we do yoga instead') === true)
const which = await until(body, t => /Which kind of session — cardio, functional, bodybuilding or hybrid\?/.test(t), 40)
check('5b. ...is asked about, not carded', /Which kind of session — cardio, functional, bodybuilding or hybrid\?/.test(which) && (await cardCount()) === before5)
check('5c. a day that is not today', await say('make it cardio next week') === true)
const notToday = await until(body, t => /I can only change today's session this way[^\n]*ask me on the day\./.test(t), 60)
check('5d. ...is refused in words, not carded', /I can only change today's session this way[^\n]*ask me on the day\./.test(notToday) && (await cardCount()) === before5, notToday.slice(-300))
check('5e. and today is still the planned session', JSON.stringify(await ev('window.__todayNames()')) === JSON.stringify(start))
await shoot('chat-session-kind-refused')

check('6. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('verify:chat-session-kind PASSED')
