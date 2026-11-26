// verify:coach-reopen — THE COACH DOES NOT REPEAT WHAT THE PHONE'S REMINDER JUST SAID (his phone, 26 Nov 2026: the
// 8:00 reminder "Squat & Carry today ... Ready for it?" and, when he opened the app at 8:05, "Today's Squat & Carry
// ... Feeling good for it?"). On the whole app (app-boot.html), with every database answer taking 400 ms the way a
// phone on a mobile network does:
//   the app is left open overnight; the next morning the coach's server writes the session reminder into the chat;
//   he comes back to the app five minutes later.
// Coming back both re-reads the chat and asks "is there something to say?". The second used to run first, on the chat
// as it stood before the reminder was read in. It must wait: one message about the session that morning, the
// server's, with its four answers under it. PORT 9988.
//
// WHAT THIS DOES NOT PROVE, said plainly: run against the code from before the fix, B2 passed too. The test app does not
// roll to a new day while it sits open, so it never reaches the moment where the old code spoke twice. The wait itself
// is held by source checks (test:coach-nudge §9); this holds that the reminder is read in, is not repeated, and
// carries its answers.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9988, page: 'app-boot.html', name: 'coach-reopen', timeoutMs: 300_000 })
const { send, ev, check, wait, go, until, shoot, finish } = d
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) return new Response(JSON.stringify({ reply: 'Okay.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return realFetch(url, init)
  }
` })
const PID = '00000000-0000-4000-8000-00000000b007'
const unprompted = `(window.__fakeDb?.chat_messages ?? []).filter(m => m.role === 'assistant' && m.action_data && m.action_data.source === 'reminder')`
const onDay = day => ev(`JSON.stringify(${unprompted}.filter(m => { const t = new Date(m.created_at); const k = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); return k === '${day}' }).map(m => ({ id: m.id, c: m.content, moment: m.action_data.moment })))`).then(x => JSON.parse(x ?? '[]'))

console.log('\n  A. THE EVENING BEFORE: THE APP IS OPEN AND THE COACH HAS SAID ITS HELLO')
await go('&slow=400&chat-yesterday&session-day')
await until(() => ev(`${unprompted}.length`), v => v > 0, 200)
await wait(1500)
const day1 = await ev(`window.__harnessToday ?? null`)
const next = (() => { const [y, m, dd] = day1.split('-').map(Number); const t = new Date(y, m - 1, dd + 1, 12); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` })()
check('A1. the app has a day, and the coach has spoken once on it', /^\d{4}-\d\d-\d\d$/.test(day1 ?? '') && (await onDay(day1)).length === 1, { day1, rows: await onDay(day1) })

console.log('\n  B. THE NEXT MORNING: THE SERVER\'S 8:00 REMINDER, THEN HE OPENS THE APP AT 8:05')
// INPUTS, as the coach's server writes them (coach-reach-out): the reminder row with its marker, shortcut and answers.
await ev(`(() => {
  window.__nextMorning('08:05')
  window.__fakeDb.chat_messages.push({ id: 'srv-8am', profile_id: '${PID}', role: 'assistant', status: 'complete',
    content: "Hey Sam, today's session is on, with your main lift first. Ready for it?",
    action_data: { source: 'reminder', moment: 'workout_today', shortcut: 'exercise', chips: ["I'm short on time today", "I'm tired today", 'Something hurts today', "I can't train today"] },
    created_at: new Date('${next}T08:00:00').toISOString() })
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
})()`)
// Long enough for the slow re-read (400 ms an answer) and for anything the coach would add after it.
await wait(6000)
const morning = await onDay(next)
check('B1. the server\'s reminder is in the chat', morning.some(m => m.id === 'srv-8am'), morning)
check('B2. THE COACH DID NOT SAY IT AGAIN: one message that morning, the server\'s', morning.length === 1, morning)
check('B3. ...no second "feeling good for it?" about the same session', !morning.some(m => m.id !== 'srv-8am' && /Feeling good for it|Ready for it|today's/i.test(m.c)), morning)
// The weekly "add an email" prompt sits over the page on a phone with no account; it is answered "Not now" first.
await ev(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Not now')?.click()`)
await wait(400)
await ev(`location.hash = '#/tab/chat'`)
await until(() => ev(`[...document.querySelectorAll('button')].some(b => /I'm short on time today/.test(b.textContent || ''))`), v => v === true, 80).catch(() => {})
await wait(600)
const chips = await ev(`[...document.querySelectorAll('[data-testid="chat-quick-replies"] button, button')].map(b => (b.textContent || '').trim()).filter(t => /^(I'm short on time today|I'm tired today|Something hurts today|I can't train today)$/.test(t))`)
check('B4. under it, the four answers, and "Open today\'s session" as the yes', Array.isArray(chips) && new Set(chips).size === 4 && (await ev(`[...document.querySelectorAll('button')].some(b => /Open today.s session/.test(b.textContent || ''))`)) === true, chips)
const small = await ev(`[...document.querySelectorAll('button')].filter(b => /^(I'm short on time today|I'm tired today|Something hurts today|I can't train today)$/.test((b.textContent || '').trim()) && b.getBoundingClientRect().height < 40).length`)
check('B5. each answer is a full-height pill, and they fit the phone', small === 0 && (await ev(`[...document.querySelectorAll('button')].filter(b => /^(I'm short|I'm tired|Something hurts|I can't train)/.test((b.textContent || '').trim())).every(b => b.getBoundingClientRect().right <= innerWidth)`)) === true, small)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /I can't train today/.test(b.textContent || '')); b && b.scrollIntoView({ block: 'end' }) })()`)
await wait(400)
await shoot('coach-reopen-1-answers')
const tx = await ev(`document.body.innerText`)
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(tx ?? ''))

await finish('verify:coach-reopen passed: the phone\'s reminder is read in when he opens the app, is not repeated, and carries four answers.')
