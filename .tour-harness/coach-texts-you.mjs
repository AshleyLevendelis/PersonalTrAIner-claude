// ---------------------------------------------------------------------------
// THE COACH TEXTED HER WHILE THE APP WAS SHUT (6 Nov 2026, her "like a WhatsApp notification ... when you open
// it, it's the same message in the chat"; her ruling "Chat, with a shortcut"). On the real chat at 390px:
//   1. the phone remembers ten messages, the server's newest page holds six of them plus a REMINDER the coach's
//      server wrote: the reminder is on screen, once, with its "Open today's session" button (the chat used to
//      throw a shorter server page away whole, reminder and all);
//   2. a second reminder arrives while the app is open in the background: coming back to the app shows it;
//   3. a third arrives while she is looking: the service worker's word draws it at once;
//   4. the shortcut takes her to the session.
// The fixture chooses only which rows exist where (chat.tsx ?seed=texts); the chat decides what to draw.
// PORT 9851.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9851, page: 'chat.html', name: 'coach-texts-you' })
const { ev, check, until, wait, go, shoot, clickAt, finish } = d

const REM1 = 'Hey Ashley, are you ready for your session today?'
const REM2 = "Hey Ashley, nothing logged on Nutrition yet today. Got a minute to add what you've eaten?"
const REM3 = 'Hey Ashley, how was the workout this morning?'
/** How many leaf-ish elements show exactly this text: a message drawn twice counts twice. */
const shownCount = text => ev(`[...document.querySelectorAll('p, span, div')].filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(text)}).length`)
const shortcuts = () => ev(`[...document.querySelectorAll('[data-testid="chat-reminder-shortcut"]')].map(b => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: Math.round(r.height) } })`)
/** A server row, written the way coach-reach-out writes one: after everything on screen. */
const serverWrites = (id, content, moment, shortcut, minutesAfter) => ev(`(() => {
  const rows = window.__fakeDb.chat_messages
  const newest = rows.map(r => r.created_at).sort().pop()
  rows.push({ id: ${JSON.stringify(id)}, profile_id: rows[0].profile_id, role: 'assistant', status: 'complete', content: ${JSON.stringify(content)},
    created_at: new Date(Date.parse(newest) + ${minutesAfter} * 60000).toISOString(), action_data: { source: 'reminder', moment: ${JSON.stringify(moment)}, shortcut: ${JSON.stringify(shortcut)} } })
  return rows.length
})()`)

console.log('\nTHE COACH TEXTED HER: THE SAME MESSAGE IS IN THE CHAT\n')
await go('&seed=texts')
check('0. the chat is up, with the ten messages this phone remembers', (await until(() => ev(`document.body.innerText.includes('Will do.')`), v => v === true, 60)) === true)

// --- 1. A server page shorter than the screen still brings the reminder ---------------------------------------
const one = await until(() => shownCount(REM1), v => v === 1, 40)
check('1a. the reminder the server wrote while she was away is in the chat', one === 1, one)
check('1b. ...exactly once, and every message the phone remembered is still there',
  one === 1 && await ev(`['Morning — deadlifts are first today.', 'Done, felt strong.', 'Will do.'].every(t => document.body.innerText.includes(t))`))
const order = await ev(`(() => { const t = document.body.innerText; return { will: t.indexOf('Will do.'), rem: t.indexOf(${JSON.stringify(REM1)}) } })()`)
check('1c. ...below the last message, as the newest thing said', order.will >= 0 && order.rem > order.will, order)
const sc1 = await shortcuts()
check('1d. under it, one small button: "Open today\'s session", a 44px tap target', sc1.length === 1 && sc1[0].text === "Open today's session" && sc1[0].h >= 44, sc1)
await shoot('coach-texts-you-reminder')

// --- 2. Away, then back: the chat reads again ----------------------------------------------------------------
await wait(2300) // past the re-read's two-second spacing, so this proves the return, not the first load
await serverWrites('rem-2', REM2, 'meal_not_logged', 'nutrition', 1)
await wait(400)
check('2a. a reminder written while the app sat in the background is not yet drawn (nothing has told the chat)', (await shownCount(REM2)) === 0)
await ev(`document.dispatchEvent(new Event('visibilitychange'))`)
const two = await until(() => shownCount(REM2), v => v === 1, 30)
check('2b. coming back to the app draws it, once', two === 1, two)
const sc2 = await shortcuts()
check('2c. ...with its own button, "Open Nutrition", and the first one still under the first', sc2.length === 2 && sc2[1].text === 'Open Nutrition' && sc2[0].text === "Open today's session", sc2)

// --- 3. Looking at it: the service worker's word draws it straight away ---------------------------------------
await serverWrites('rem-3', REM3, 'session_feel', null, 1)
await ev(`navigator.serviceWorker && navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'coach-message', messageId: 'rem-3' } }))`)
const three = await until(() => shownCount(REM3), v => v === 1, 30)
check('3a. a coach message that arrives while she is looking appears at once (the phone told the chat)', three === 1, three)
check('3b. ...and a check-in has no shortcut button: only session and food messages carry one', (await shortcuts()).length === 2, await shortcuts())
await ev(`document.dispatchEvent(new Event('visibilitychange'))`)
await wait(2600)
await ev(`document.dispatchEvent(new Event('visibilitychange'))`)
await wait(800)
check('3c. reading again with nothing new draws nothing twice', (await shownCount(REM1)) === 1 && (await shownCount(REM2)) === 1 && (await shownCount(REM3)) === 1)
await shoot('coach-texts-you-three')

// --- 4. The shortcut ------------------------------------------------------------------------------------------
await clickAt(`document.querySelector('[data-testid="chat-reminder-shortcut"]')`)
const hash = await until(() => ev('location.hash'), v => v === '#/tab/exercise', 20)
check('4. "Open today\'s session" takes her to the session', hash === '#/tab/exercise', hash)

await finish('verify:coach-texts-you PASSED')
