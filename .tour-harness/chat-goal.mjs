// ---------------------------------------------------------------------------
// A GOAL GETS BOTH ITS NUMBERS, AND APPLY ALWAYS SAYS WHAT HAPPENED (7 Nov 2026).
//
// Ashley's phone: "set me a bench goal", then "110kg is my max". The coach
// offered "Set goal: Barbell Bench Press", she tapped Apply and nothing
// happened: no target had been asked for, the goals table refuses an active
// measurable goal without one, and the error was swallowed. Before that, the
// missing starting number came back as a failed "Need more detail · Note" card
// with the same sentence twice, once in red.
// This holds, on the real chat at phone size:
//   1. a goal with neither number is ASKED about, with no card;
//   2. one number given, the other is asked for, still no card;
//   3. both numbers: a card that SAYS both, Apply saves an active goal with
//      both, and a "Goal saved" receipt;
//   4. a save the database refuses says so on the card, never silence;
//   5. a card whose save asks a question back shows the question ONCE, as the
//      coach's next message, with no "Note" row.
// The fake database refuses the goal the real table refuses (fake-supabase.ts
// ROW_CHECKS), so a regression to "no target asked" fails here as it did on
// her phone.
//
// WHAT THIS CANNOT SEE: the model is stubbed at the fetch boundary, so whether
// the coach carries 110 into its next call is the model's; the app asks for
// whichever number is still missing either way.
//
// PORT 9877.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9877, page: 'chat.html', name: 'chat-goal' })
const { send, ev, check, until, wait, go, shoot, finish } = d

const goal = extra => `{ reply: '', proposal: { kind: 'record_goal', rawArgs: Object.assign({ origin_verbatim_quote: said, metric: 'lift_1rm_kg', trackable: 'measurable', metric_ref: 'Barbell Bench Press' }, ${extra}) } }`
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const reply = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/bench goal/i.test(said)) return reply(${goal('{}')})
      if (/my max/i.test(said)) return reply(${goal('{ baseline_value: 110 }')})
      if (/aiming for 120/i.test(said)) return reply(${goal('{ baseline_value: 110, target_value: 120 }')})
      if (/aiming for 130/i.test(said)) return reply(${goal('{ baseline_value: 110, target_value: 130 }')})
      if (/zorbwinder/i.test(said)) return reply({ reply: '', proposal: { kind: 'record_fact', rawArgs: { origin_verbatim_quote: said, kind: 'exercise_preference', polarity: 'dislike', target_phrase: 'zorbwinder' } } })
      return reply({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
await go('')
check('0. the chat is up', (await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 40)) === true)

const say = async t => {
  await ev(`(() => { const x = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(x, ${JSON.stringify(t)}); x.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const body = () => ev('document.body.innerText')
const tail = async () => (await body()).slice(-700)
const applyButtons = () => ev(`[...document.querySelectorAll('button')].filter(x => /^Apply/.test((x.textContent || '').trim())).length`)
const tapApply = () => ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Apply/.test((x.textContent || '').trim())).pop(); if (!b) return false; b.click(); return true })()`)
const goals = async () => JSON.parse(await ev(`JSON.stringify(window.__fakeDb.user_goals || [])`) || '[]')
const count = (t, s) => t.split(s).length - 1

console.log('\n1. Neither number: asked, no card\n')
check('1a. she asks for a bench goal', await say('set me a bench goal') === true)
const t1 = await until(tail, t => t.includes('I need both to track it.'), 40)
check('1b. the coach asks for both numbers', t1.includes("What's your Barbell Bench Press max now, and what number are you aiming for?"), t1)
check('1c. no card is offered', await applyButtons() === 0, await applyButtons())
check('1d. nothing reads as a failure', !/Need more detail|Nothing was applied/.test(t1), t1)
await shoot('chat-goal-ask-both')

console.log('\n2. The starting number only: the target is asked for\n')
check('2a. she gives her max', await say('110kg is my max') === true)
const t2 = await until(tail, t => t.includes('110 kg to start. What number are you aiming for?'), 40)
check('2b. the coach takes 110 kg and asks for the target', t2.includes('Got it, 110 kg to start. What number are you aiming for?'), t2.slice(-300))
check('2c. still no card', await applyButtons() === 0, await applyButtons())
check('2d. nothing saved yet', (await goals()).length === 0, await goals())

console.log('\n3. Both numbers: a card that says both, and Apply saves it\n')
check('3a. she names the target', await say("I'm aiming for 120") === true)
const t3 = await until(tail, t => /Apply/.test(t), 40)
check('3b. the card says both numbers', t3.includes('Barbell Bench Press max: 110 kg → 120 kg'), t3)
check('3c. one Apply button', await applyButtons() === 1, await applyButtons())
await shoot('chat-goal-card')
check('3d. Apply is tapped', await tapApply() === true)
const t3b = await until(tail, t => t.includes('Goal saved'), 40)
check('3e. a "Goal saved" receipt', t3b.includes('Goal saved'), t3b)
const g = await goals()
check('3f. one active goal, 110 kg to 120 kg', g.length === 1 && g[0].status === 'active' && g[0].baseline_value === 110 && g[0].target_value === 120 && g[0].metric_ref === 'Barbell Bench Press', g)
await shoot('chat-goal-saved')

console.log('\n4. A save the database refuses says so\n')
await ev(`window.__failWrite = (t, o) => t === 'user_goals' && o === 'insert'`)
check('4a. she names another target', await say("Actually I'm aiming for 130") === true)
await until(applyButtons, n => n === 1, 40)
check('4b. Apply is tapped', await tapApply() === true)
const t4 = await until(tail, t => t.includes("Couldn't save that"), 40)
check('4c. the card says it was not saved', t4.includes("Couldn't save that") && t4.includes("Nothing was applied — the save didn't go through, so try again in a moment."), t4)
check('4d. no goal was added', (await goals()).length === 1, await goals())
await ev(`window.__failWrite = undefined`)
await shoot('chat-goal-refused')

console.log('\n5. A question back from Apply is said once, as the coach\n')
check('5a. she says something the app cannot place', await say("I never want to do the zorbwinder") === true)
await until(applyButtons, n => n === 1, 40)
check('5b. Apply is tapped', await tapApply() === true)
const q = 'could you name it the way it appears on your plan?'
const t5 = await until(tail, t => t.includes('Not saved yet') && t.includes(q), 40)
check('5c. the card says not saved yet, briefly', t5.includes('Not saved yet') && t5.includes('Nothing was applied — it needs one more answer first.'), t5)
check('5d. the question appears exactly once', count(t5, q) === 1, t5)
check('5e. no "Note" row', !/\bNote\b/.test(t5.slice(t5.lastIndexOf('zorbwinder') - 40)), t5)
const lastIsQuestion = await ev(`(() => { const all = document.body.innerText; return all.trimEnd().lastIndexOf(${JSON.stringify(q)}) > all.lastIndexOf('Not saved yet') })()`)
check('5f. the question comes after the card, as the coach\'s next message', lastIsQuestion === true, t5)
await wait(3000)
const settled = (await body()).slice(-900)
check('5g. once settled, the zorbwinder card still says what it offered (never an empty bubble)', /Want me to (save|remember)[^\n]*zorbwinder/i.test(settled), settled)
await shoot('chat-goal-question')

await finish('chat goal: a goal gets both numbers, and Apply always says what happened')
