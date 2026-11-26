// verify:sleep — SLEEP FROM THE WATCH (his pick "A", 26 Nov 2026; src/lib/sleep-nights.ts), on the whole app at phone
// size. The phone's health store is pretended (fake-health.ts): sixteen nights of about 7 h 25, with the last one or
// two short as the address asks. What this proves is the app's half:
//   A. two short nights on a training day: the coach's first message OFFERS a lighter session, in the app's words,
//      with the two answers, and changes nothing; the coach is sent the sleep lines with a message;
//   B. Home: last night against his usual, the week as bars; one short night says so and nothing is offered;
//   C. the switch off reads nothing and draws nothing; a night the watch missed is a gap, not a short night;
//   D. Profile holds the switch.
// It cannot prove a real watch writes what the pretend one does. Every check runs every time. PORT 9987.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9987, page: 'app-boot.html', name: 'sleep', timeoutMs: 300_000 })
const { send, ev, check, wait, go, until, shoot, clickAt, finish } = d
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__coachBodies = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      try { window.__coachBodies.push(JSON.parse(init.body)) } catch (e) { window.__coachBodies.push(null) }
      return new Response(JSON.stringify({ reply: 'Okay.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const calls = () => ev(`JSON.stringify(window.__healthCalls ?? [])`)
const hellos = `(window.__fakeDb?.chat_messages ?? []).filter(m => m.role === 'assistant' && m.action_data && m.action_data.source === 'reminder')`
const helloList = async () => JSON.parse((await ev(`JSON.stringify(${hellos}.map(m => m.content))`)) ?? '[]')
const row = () => ev(`(() => { const r = document.querySelector('[data-home-sleep]'); if (!r) return null; const bars = [...r.querySelectorAll('[data-sleep-bar]')]; return { state: r.getAttribute('data-home-sleep'), last: r.querySelector('[data-home-sleep-last]')?.getAttribute('aria-label') ?? r.querySelector('[data-home-sleep-last]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, lastSeen: r.querySelector('[data-home-sleep-last]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, usualLabel: r.querySelector('[data-sleep-usual-label]')?.textContent ?? null, top: Math.round(r.getBoundingClientRect().top), bottom: Math.round(r.getBoundingClientRect().bottom), progressOpen: document.querySelector('[data-home-progress-toggle]')?.getAttribute('aria-expanded') ?? null, against: r.querySelector('[data-home-sleep-against]')?.textContent ?? null, bars: bars.map(b => b.getAttribute('data-sleep-bar')), heights: bars.map(b => Math.round(b.getBoundingClientRect().height)), usualLine: !!r.querySelector('[data-sleep-usual-line]'), label: r.querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? '', w: Math.round(r.getBoundingClientRect().width), right: Math.round(r.getBoundingClientRect().right) } })()`)
const openProgress = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
  await wait(1200)
  if (await ev(`!!(${btn('/^Not now$/')})`)) { await ev(`${btn('/^Not now$/')}.click()`); await wait(400) }
  await wait(600)
}

console.log('\n  A. TWO SHORT NIGHTS ON A TRAINING DAY: THE COACH OFFERS A LIGHTER SESSION')
await go('&slow=0&chat-yesterday&session-day&health=android&sleepon=1&healthsleep=short2')
const n = await until(() => ev(`${hellos}.length`), v => v > 0, 150)
await wait(600)
const hello = await helloList()
check('A1. the coach said its one message of the day', n === 1 && hello.length === 1, hello)
check('A2. ...and it is the offer: the two nights, his usual, what short sleep does, today lighter',
  /^Hey Sam — you've slept about 5 h 45 a night for the last 2 nights, against your usual 7 h 2\d\. Short sleep makes hard work feel harder\. Want today's .+ lighter\?$/.test(hello[0] ?? ''), hello[0])
check('A3. it gives no score, names no cause and gives no advice about sleep', !/score|quality|\/100|stress|caffeine|should|need to|go to bed|hours you/i.test(hello[0] ?? ''), hello[0])
const planBefore = await ev(`JSON.stringify(window.__fakeDb?.mesocycle_weeks ?? null)`)
await ev(`location.hash = '#/tab/chat'`)
await until(() => ev(`[...document.querySelectorAll('button')].some(b => /Give me the shortest version today/.test(b.textContent || ''))`), v => v === true, 60)
const chips = await ev(`[...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => /shortest version|keep it as it is/.test(t))`)
check('A4. the chat shows the two answers as buttons: the shortest version, or keep it', Array.isArray(chips) && chips.includes('Give me the shortest version today') && chips.includes('I feel fine, keep it as it is'), chips)
check('A5. nothing about the plan changed by the offer itself', (await ev(`JSON.stringify(window.__fakeDb?.mesocycle_weeks ?? null)`)) === planBefore)
await ev(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Not now')?.click()`)
await wait(500)
await ev(`[...document.querySelectorAll('button')].find(b => /Give me the shortest version today/.test(b.textContent || ''))?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('sleep-1-offer')
const remembered = await ev(`Object.keys(localStorage).filter(k => k.startsWith('coach_nudge_')).map(k => localStorage.getItem(k)).join(' ')`)
check('A6. the coach remembers it said this run (by its first night), so it is not raised again tomorrow', /"recovery:sleep-\d{4}-\d\d-\d\d"/.test(remembered ?? ''), remembered)
// He answers: the message the coach is sent carries the sleep lines.
await clickAt(`[...document.querySelectorAll('button')].find(b => /I feel fine, keep it as it is/.test(b.textContent || ''))`)
await until(() => ev(`window.__coachBodies.length`), v => v > 0, 60)
const sent = await ev(`(() => { const b = window.__coachBodies[window.__coachBodies.length - 1]; const c = b && (b.context || b); return c ? (c.sleep_context ?? null) : null })()`)
check('A7. the coach is sent last night, his usual and "2 short nights in a row" with his message', /Last night: 5 h 40 asleep\./.test(sent ?? '') && /Usual: 7 h 2\d/.test(sent ?? '') && /2 short nights in a row\./.test(sent ?? ''), sent)
check('A8. his sleep was written nowhere: no table holds it', (await ev(`Object.keys(window.__fakeDb ?? {}).filter(t => /sleep/i.test(t)).length`)) === 0 && (await ev(`JSON.stringify(window.__fakeDb ?? {}).includes('5 h 40')`)) === (await ev(`JSON.stringify(window.__fakeDb?.chat_messages ?? []).includes('5 h 40')`)))

console.log('\n  B. HOME: LAST NIGHT AGAINST HIS USUAL')
await openProgress('&health=android&sleepon=1')
await until(row, v => v !== null, 60)
let r = await row()
check('B1. an ordinary night: "7 h NN min last night", "About your usual.", and "usual 7 h NN" on the bars', r && /^7 h \d\d last night$/.test(r.last ?? '') && /^7 h \d\d min last night$/.test(r.lastSeen ?? '') && r.against === 'About your usual.' && /^usual 7 h \d\d$/.test(r.usualLabel ?? '') && r.state === 'ok', r)
check('B1a. it is on Home without a tap: Progress is still closed', r && r.progressOpen === 'false', r?.progressOpen)
check('B2. the week is seven bars, all measured, with his usual drawn across them', r && r.bars.length === 7 && r.bars.every(b => b !== 'none') && r.usualLine, r)
check('B3. the bars say the same in words for a screen reader', r && /Sleep over the last seven nights, usual 7 h \d\d: (7 h \d\d(, )?){7}$/.test(r.label), r?.label)
check('B4. the row fits the phone', r && r.right <= 390 && r.w > 300, r)
await ev(`document.querySelector('[data-home-sleep]').scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('sleep-2-home-usual')

await openProgress('&health=android&sleepon=1&healthsleep=short1')
await until(row, v => v !== null, 60)
r = await row()
check('B5. one short night: "5 h 40 last night", "1 h NN under your usual."', r && r.last === '5 h 40 last night' && /^1 h \d\d under your usual\.$/.test(r.against ?? '') && /^usual 7 h \d\d$/.test(r.usualLabel ?? '') && r.state === 'short', r)
check('B6. last night\'s bar is the shortest of the seven', r && r.heights[6] === Math.min(...r.heights) && r.heights[6] < r.heights[5], r?.heights)
check('B7. no score, grade or advice on the row', r && !/score|quality|poor|bad|should|\/100|%/i.test(`${r.last} ${r.against}`), r)
await ev(`document.querySelector('[data-home-sleep]').scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('sleep-3-home-short')

console.log('\n  B8. ONE SHORT NIGHT IS NOT OFFERED ON')
await ev(`localStorage.clear()`)
await go('&slow=0&chat-yesterday&session-day&health=android&sleepon=1&healthsleep=short1')
await until(() => ev(`${hellos}.length`), v => v > 0, 150)
await wait(600)
const helloOne = await helloList()
check('B8. the coach still says its hello, and it is NOT a lighter-session offer', helloOne.length === 1 && !/slept|lighter|Short sleep/i.test(helloOne[0] ?? ''), helloOne)

console.log('\n  C. THE SWITCH OFF, AND A NIGHT THE WATCH MISSED')
await ev(`localStorage.clear()`)
await openProgress('&health=android&healthsleep=short2')
check('C1. switch off: Home has no sleep row', (await row()) === null)
check('C2. ...and the phone was never asked about sleep', !/"sleep"/.test((await calls()) ?? ''), await calls())
await openProgress('&health=android&sleepon=1&healthsleep=gap')
await until(row, v => v !== null, 60)
r = await row()
check('C3. the watch was off last night: the row says so and the last bar is a gap, not a short night', r && /Nothing from your watch for last night yet/.test(r.last ?? '') && r.bars[6] === 'none' && r.bars.slice(0, 6).every(b => b !== 'none') && r.state === 'ok', r)
await openProgress('&health=android&sleepon=1&healthsleep=none')
await wait(800)
check('C4. the watch holds no sleep at all: no row', (await row()) === null)
check('C5. ...though it did ask the phone', /"sleep":\[/.test((await calls()) ?? ''))
const tx = await ev(`document.body.innerText`)
check('C6. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(tx ?? ''))

console.log('\n  D. PROFILE HOLDS THE SWITCH')
await ev(`localStorage.removeItem('fitplan_health_sleep_connected')`)
await send('Page.navigate', { url: `${d.origin}/.tour-harness/profile.html?load=p1&health=android` })
await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true, 120)
await wait(800)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await ev(`${btn('/^Not now$/')}.click()`); await wait(400) }
await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-profile-row="Steps from your phone"]')`), v => v === true, 60)
await ev(`document.querySelector('[data-profile-row="Steps from your phone"]')?.click()`)
await until(() => ev(`!!document.querySelector('[data-health-sleep]')`), v => v === true, 40)
const sw = () => ev(`document.querySelector('[data-health-sleep]')?.getAttribute('data-health-sleep') ?? null`)
const swText = () => ev(`document.querySelector('[data-health-sleep]')?.textContent ?? ''`)
check('D1. "Sleep from your watch" is on Profile, off until he taps', (await sw()) === 'off' && /Sleep from your watch/.test((await swText()) ?? ''))
check('D2. it says what it reads and that it writes nothing', /It reads sleep and writes nothing/.test((await swText()) ?? ''))
check('D3. nothing was asked of the phone before the tap', !/"sleep"/.test((await calls()) ?? ''))
await ev(`document.querySelector('[data-sleep-connect]')?.scrollIntoView({ block: 'center' })`)
await clickAt(`document.querySelector('[data-sleep-connect]')`)
await until(sw, v => v === 'on', 30)
check('D4. one tap asks the phone for sleep (read) and switches it on', (await sw()) === 'on' && /"request":\["sleep"\]/.test((await calls()) ?? ''), await calls())
check('D5. ...and it now says the plan never changes unless he says yes, and that his sleep is not saved', /Your plan never changes unless you say yes/.test((await swText()) ?? '') && /not saved/.test((await swText()) ?? ''))
await ev(`document.querySelector('[data-health-sleep]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('sleep-4-profile')
const small = await ev(`[...document.querySelectorAll('[data-health-sleep] button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent)`)
check('D6. its button is at least 44px tall', Array.isArray(small) && small.length === 0, small)
await clickAt(`document.querySelector('[data-sleep-off]')`)
await until(sw, v => v === 'off', 20)
check('D7. and one tap switches it off again', (await sw()) === 'off')

await finish('verify:sleep passed: two short nights are offered on, one is only said, Home shows last night against his usual, off reads nothing.')
