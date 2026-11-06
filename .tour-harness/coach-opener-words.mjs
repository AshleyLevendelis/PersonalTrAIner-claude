// ---------------------------------------------------------------------------
// THE CHAT OPENER IN THE COACH'S OWN WORDS, ON THE REAL CHAT AT 390px (Ashley's ruling 6 Nov 2026, "Coach writes,
// app checks"). The app still chooses what the opener is about; it asks the coach's server to say it, and the
// server checks every word (test:reminder-writer). A pretend server stands in here, in three moods, each on a cold load:
// A RETURNING user who clears the chat (the bin, tapped twice): that is where the everyday opener runs. On an
// ordinary open her past messages come back instead, and a first-ever chat gets the welcome, which stays the app's.
//   1. it answers in time: the coach's words replace the placeholder, the buttons stay, and the request carried the
//      app's own opener, the buttons' question and the two facts its check needs;
//   2. it sends nothing back (its check refused the words): the app's fixed opener shows;
//   3. it is too slow: the fixed opener shows within a few seconds, and late words never replace it.
// Every check runs every time with a null-safe subject. PORT 9867.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9867, page: 'chat.html', name: 'coach-opener-words' })
const { send, ev, check, until, wait, go, shoot, finish } = d

const COACH = 'Lovely to see you, it has been a good week so far.'
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__asks = []
  const mood = new URLSearchParams(location.search).get('om') || 'coach'
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      let body = {}; try { body = JSON.parse(init && init.body || '{}') } catch {}
      if (body.mode === 'opener') {
        window.__asks.push(body)
        const q = body.opener && body.opener.question
        const words = ${JSON.stringify(COACH)} + (q ? ' ' + q.charAt(0).toUpperCase() + q.slice(1) : '')
        if (mood === 'slow') await new Promise(r => setTimeout(r, 7000))
        const opener = mood === 'none' ? null : words
        return new Response(JSON.stringify({ opener }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ reply: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const bubbles = () => ev(`[...document.querySelectorAll('[data-testid="chat-message-assistant"], [data-role="assistant"]')].map(b => b.innerText.trim()).filter(Boolean)`)
const pageText = () => ev(`document.querySelector('main, #root')?.innerText || document.body.innerText`)
const lastAsk = () => ev(`window.__asks[window.__asks.length - 1] || null`)
const clearChat = async () => {
  await until(() => ev(`!!document.querySelector('button[aria-label="Clear chat"]')`), v => v === true, 60)
  await wait(1200)
  await ev(`document.querySelector('button[aria-label="Clear chat"]')?.click()`)
  await wait(250)
  return ev(`(() => { const b = document.querySelector('button[aria-label="Tap again to clear this conversation"]'); if (!b) return false; b.click(); return true })()`)
}
const chipTexts = () => ev(`[...document.querySelectorAll('[data-testid="quick-reply"], [data-testid="chat-quick-reply"]')].map(b => b.innerText.trim())`)

console.log('\n1. The coach answers in time')
await go('&seed=opener&rows=2&om=coach')
check('10. she clears the chat', await clearChat())
const ask1 = await until(lastAsk, v => !!v, 60)
check('1a. the chat asked the coach for its opener', !!ask1 && ask1.mode === 'opener', ask1)
check('1b. ...sending the app\'s own opener, and the two facts its check needs',
  !!ask1 && typeof ask1.opener?.fixed === 'string' && ask1.opener.fixed.length > 10
    && ['morning', 'afternoon', 'evening'].includes(ask1.context?.current_part_of_day) && typeof ask1.context?.trained_today === 'boolean', ask1)
const t1 = await until(pageText, t => (t || '').includes(COACH), 40)
check('1c. the coach\'s words are the first bubble', (t1 || '').includes(COACH), (t1 || '').slice(0, 300))
check('1d. ...and the app\'s fixed opener is not also there', !!ask1 && !(t1 || '').includes(ask1.opener.fixed), ask1?.opener?.fixed)
const chips1 = await chipTexts()
check('1e. when the opener has buttons, the coach was handed their question and ended on it',
  !ask1?.opener?.question || (t1 || '').toLowerCase().includes(String(ask1.opener.question).toLowerCase()), { q: ask1?.opener?.question, chips1 })
await shoot('coach-opener-words-coach')

console.log('\n2. The coach sends nothing back')
await go('&seed=opener&rows=2&om=none')
check('20. she clears the chat', await clearChat())
const ask2 = await until(lastAsk, v => !!v, 60)
const fixed2 = ask2?.opener?.fixed || null
const t2 = await until(pageText, t => !!fixed2 && (t || '').includes(fixed2), 40)
check('2a. the app\'s fixed opener shows', !!fixed2 && (t2 || '').includes(fixed2), { fixed2, t2: (t2 || '').slice(0, 300) })
check('2b. ...and nothing of the coach\'s', !(t2 || '').includes(COACH))

console.log('\n3. The coach is too slow')
await go('&seed=opener&rows=2&om=slow')
check('30. she clears the chat', await clearChat())
const ask3 = await until(lastAsk, v => !!v, 60)
const fixed3 = ask3?.opener?.fixed || null
const asked3 = Date.now()
const t3 = await until(pageText, t => !!fixed3 && (t || '').includes(fixed3), 40)
const waited = Date.now() - asked3
check('3a. the fixed opener shows within a few seconds', !!fixed3 && (t3 || '').includes(fixed3) && waited < 7000, { waited })
await wait(4000)
const late = await pageText()
check('3b. ...and the late words never replace it', !(late || '').includes(COACH) && !!fixed3 && (late || '').includes(fixed3), (late || '').slice(0, 300))
await shoot('coach-opener-words-slow')

await finish('verify:coach-opener-words PASSED')
