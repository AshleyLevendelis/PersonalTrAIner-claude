// verify:heart-uses — WHAT THE HEART RATE DOES FOR HIS TRAINING (his "Build 1, 2 and 3 now", 25 Nov 2026), on the
// whole app (app-boot.html, App.tsx's own start). With six weeks of the same easy jog at a falling heart rate and three
// raised resting mornings (?heart-history, rows as the app's own writers leave them):
//   A. on a training day, the coach's first message of the day OFFERS a lighter session, in the app's words, with the
//      chips, and changes nothing;
//   B. Home's Progress says the jog now runs at a lower heart rate (a strap alone is enough);
//   C. the corner heart: "♥ N" beside the gear while the strap sends, gone when it stops, a tap opens the strap's row.
// Every check runs every time with a null-safe subject. PORT 9984.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9984, page: 'app-boot.html', name: 'heart-uses', timeoutMs: 300_000 })
const { send, ev, check, wait, go, until, shoot, clickAt, finish } = d
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) return new Response(JSON.stringify({ reply: 'Okay.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return realFetch(url, init)
  }
` })

console.log('\n  A. A RAISED RESTING HEART RATE ON A TRAINING DAY: THE COACH OFFERS A LIGHTER SESSION')
const hellos = `(window.__fakeDb?.chat_messages ?? []).filter(m => m.role === 'assistant' && m.action_data && m.action_data.source === 'reminder')`
await go('&slow=0&chat-yesterday&session-day&heart-history&clear-storage')
const n = await until(() => ev(`${hellos}.length`), v => v > 0, 150)
await wait(600)
const hello = JSON.parse((await ev(`JSON.stringify(${hellos}.map(m => ({ c: m.content, chips: m.action_data?.chips ?? null, kind: m.action_data?.kind ?? m.action_data?.moment ?? null })))`)) ?? '[]')
check('A1. the coach said its one message of the day', n === 1 && hello.length === 1, hello)
check('A2. ...and it is the recovery offer: the reading, his usual, that it can mean fatigue, today lighter',
  /resting heart rate has been about 6 above your usual \(58\) for 3 mornings\. That can mean you're still carrying some fatigue\. Want today's .+ lighter\?/.test(hello[0]?.c ?? ''), hello[0])
check('A3. it names no cause and no heart rate target', !/\b(ill|sick|infection|virus|overtrain|zone|bpm)\b/i.test(hello[0]?.c ?? ''), hello[0]?.c)
const planBefore = await ev(`JSON.stringify(window.__fakeDb?.mesocycle_weeks ?? null)`)
await ev(`location.hash = '#/tab/chat'`)
await until(() => ev(`[...document.querySelectorAll('button')].some(b => /Give me the shortest version today/.test(b.textContent || ''))`), v => v === true, 60)
const chips = await ev(`[...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => /shortest version|keep it as it is/.test(t))`)
check('A4. the chat shows the two replies as buttons: the shortest version, or keep it', Array.isArray(chips) && chips.includes('Give me the shortest version today') && chips.includes('I feel fine, keep it as it is'), chips)
check('A5. nothing about the plan changed by the offer itself', (await ev(`JSON.stringify(window.__fakeDb?.mesocycle_weeks ?? null)`)) === planBefore)
await ev(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Not now')?.click()`)
await wait(500)
await ev(`[...document.querySelectorAll('button')].find(b => /Give me the shortest version today/.test(b.textContent || ''))?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('heart-uses-1-recovery')

console.log('\n  A6. RAISED ONCE: THE SAME RUN IS NOT RAISED AGAIN THE NEXT DAY')
const remembered = await ev(`Object.keys(localStorage).filter(k => k.startsWith('coach_nudge_')).map(k => localStorage.getItem(k)).join(' ')`)
check('A6. the coach remembers it said this run (its first morning), so the next day of it is not raised again', /"recovery:\d{4}-\d\d-\d\d"/.test(remembered ?? ''), remembered)

console.log('\n  B. HOME: THE SAME EASY JOG AT A LOWER HEART RATE')
// No clear-storage here: the page clears AFTER the pretend strap has paired, which would unpair it.
await go('&slow=0&health=android&strap=1&strappaired=1&heart-history')
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
// The weekly "add an email" prompt sits over the page on a phone with no account; it is answered "Not now" first.
await wait(1200)
await ev(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Not now')?.click()`)
await wait(500)
// Progress is one tap away on Home (his 30 Oct "less is more").
await ev(`[...document.querySelectorAll('button')].find(b => /^Progress/.test((b.textContent || '').trim()))?.click()`)
const fit = await until(() => ev(`document.querySelector('[data-home-fitness-hr]')?.textContent ?? null`), v => !!v, 80)
check('B1. Progress says "Easy jog: average heart rate 152 → 141 over 6 weeks" and what it means', /Easy jog: average heart rate 152 → 141 over 6 weeks/.test(fit ?? '') && /fitness is improving/.test(fit ?? ''), fit)
check('B2. a strap alone shows no resting line (the watch gives that)', (await ev(`!!document.querySelector('[data-home-resting-hr]')`)) === false)
await ev(`document.querySelector('[data-home-fitness-hr]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('heart-uses-2-fitness')

console.log('\n  C. THE CORNER HEART')
check('C1. no reading yet: no heart in the corner', (await ev(`!!document.querySelector('[data-live-heart-corner]')`)) === false)
await ev(`window.__strapConnect()`); await wait(200)
await ev(`window.scrollTo(0, 0)`)
await ev(`window.__strapSend(148)`); await wait(500)
const corner = await ev(`(() => { const n = document.querySelector('[data-live-heart-corner]'); const g = document.querySelector('[aria-label="Profile and settings"]'); if (!n || !g) return null; const a = n.getBoundingClientRect(), b = g.getBoundingClientRect(); return { text: n.textContent.trim(), right: Math.round(a.right), gearLeft: Math.round(b.left), top: Math.round(a.top), h: Math.round(a.height), w: Math.round(a.width) } })()`)
check('C2. "148" with a heart beside the gear, at the top right, a 44px tap', corner?.text === '148' && corner.right <= corner.gearLeft + 1 && corner.top < 60 && corner.h >= 44, corner)
await shoot('heart-uses-3-corner')
await clickAt(`document.querySelector('[data-live-heart-corner]')`)
await until(() => ev(`!!document.querySelector('[data-heart-strap]')`), v => v === true, 40)
await shoot('heart-uses-4-after-corner-tap')
check('C3. a tap opens the strap\'s row on Profile', (await ev(`!!document.querySelector('[data-profile-sheet="health"] [data-heart-strap="paired"]')`)) === true)
await wait(6000)
check('C4. no reading for over 5 seconds: the corner heart goes', (await ev(`!!document.querySelector('[data-live-heart-corner]')`)) === false)

const txt = await ev('document.body.innerText')
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(txt ?? ''))
await finish('verify:heart-uses passed: the coach offers a lighter day, Home shows the fitness line, and the corner heart says the strap is live.')
