// ---------------------------------------------------------------------------
// LESSONS THAT BUILD, ON THE REAL CHAT AT 390px (Ashley's ruling 6 Nov 2026, "A why on every answer", plus lessons
// taught when her week makes them relevant, never repeated). A pretend coach stands in for the model; the chat decides
// everything else:
//   0. a coach that marks a DIFFERENT lesson from the one offered: shown to nobody, recorded nowhere, and the lesson
//      is offered again next turn (a wrong marker is only a test while a real lesson IS on offer);
//   1. the app hands the coach the lesson, from her week, with its id;
//   2. she never sees the marker, and the message that taught it carries the lesson on its stored row;
//   3. the same day, a second message gets NO new lesson, and is told what was taught.
// Every check runs every time with a null-safe subject. PORT 9863.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9863, page: 'chat.html', name: 'coach-lessons' })
const { send, ev, check, until, wait, go, shoot, finish } = d

// The pretend coach. While __wrong is set it marks a lesson OTHER than the one offered.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__reqs = []
  window.__wrong = true
  const NL = String.fromCharCode(10)
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      let body = {}; try { body = JSON.parse(init && init.body || '{}') } catch {}
      window.__reqs.push(body)
      const brief = (body.context && body.context.lesson_brief) || ''
      const m = brief.match(/LESSON TO TEACH [(]id ([a-z0-9-]+)/)
      let reply = 'Answer first, then the reason, in a line.'
      if (m && window.__wrong) reply += NL + '[LESSON: ' + (m[1] === 'consistency' ? 'deload' : 'consistency') + ']'
      else if (m) reply += NL + '[BREAK]' + NL + 'And the idea behind it, briefly.' + NL + '[LESSON: ' + m[1] + ']'
      return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const setText = text => ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); if (!t) return false; const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const sendIt = () => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
const page = () => ev(`document.querySelector('main, #root')?.innerText || document.body.innerText`)
const say = async (text) => { await setText(text); await wait(150); const ok = await sendIt(); await wait(2200); return ok }
const lastBrief = () => ev(`(() => { const r = window.__reqs[window.__reqs.length - 1]; return r && r.context ? (r.context.lesson_brief ?? null) : null })()`)
const coachRows = () => ev(`(window.__fakeDb.chat_messages || []).filter(r => r.role === 'assistant').map(r => ({ content: r.content, lesson: r.action_data && r.action_data.lesson || null, status: r.status }))`)
const offeredIn = brief => ((brief || '').match(/LESSON TO TEACH \(id ([a-z0-9-]+)/) || [])[1] || null

await go('')
check('0. the chat is up', (await until(() => ev(`!!document.querySelector('[data-testid="chat-composer"] textarea')`), v => v === true, 60)) === true)
await wait(1500)

console.log('\n0. A coach that marks a lesson the app did not offer')
check('0a. she sends a message', await say('Morning, how are things looking?'))
const offered0 = offeredIn(await lastBrief())
check('0b. a lesson was on offer', !!offered0, offered0)
await until(page, t => /Answer first/.test(t || ''), 30)
const shown0 = (await page()) || ''
check('0c. the wrong marker is never shown', /Answer first/.test(shown0) && !/\[LESSON|LESSON:/.test(shown0), shown0.slice(-200))
const rows0 = (await coachRows()) || []
check('0d. ...and recorded nowhere', rows0.some(r => /Answer first/.test(r.content || '')) && !rows0.some(r => r.lesson), rows0)
await ev(`window.__wrong = false`)

console.log('\n1. The lesson is offered again, since it was never taught')
check('1a. she sends a message', await say('What should I focus on today?'))
const offered = offeredIn(await lastBrief())
check('1b. the coach was handed the same lesson again, with its id', !!offered && offered === offered0, { offered0, offered })

console.log('\n2. She never sees the marker; the message that taught it carries it')
await until(page, t => /idea behind it/.test(t || ''), 30)
const shown1 = (await page()) || ''
check('2a. the lesson arrived on screen', /And the idea behind it, briefly\./.test(shown1), shown1.slice(-200))
check('2b. ...and the marker never did', !/\[LESSON|LESSON:/.test(shown1), shown1.slice(-200))
const rows1 = await until(coachRows, rs => Array.isArray(rs) && rs.some(r => r.lesson), 30)
const taughtRow = (rows1 || []).find(r => r.lesson) || null
check('2c. the coach message that taught it carries the lesson on its stored row', !!taughtRow && taughtRow.lesson === offered, rows1)
check('2d. ...and its stored words carry no marker either', !!taughtRow && !/LESSON/.test(taughtRow.content || ''), taughtRow)
await shoot('coach-lessons-taught')

console.log('\n3. The same day: no second lesson, and the coach is told what was taught')
check('3a. she sends another message', await say('And what about tomorrow?'))
const brief2 = await lastBrief()
check('3b. no new lesson is handed over the same day', typeof brief2 === 'string' && !/LESSON TO TEACH/.test(brief2), brief2)
check('3c. ...and the coach is told what it already taught, so it can build on it', /Already taught, never repeat/.test(brief2 || ''), brief2)
const rows2 = (await coachRows()) || []
check('3d. still exactly one taught message, the offered lesson', rows2.filter(r => r.lesson).length === 1 && rows2.some(r => r.lesson === offered), rows2)
await shoot('coach-lessons-second')

await finish('verify:coach-lessons PASSED')
