// ---------------------------------------------------------------------------
// THE COACH STILL ANSWERS WHEN IT KEEPS SOMETHING (7 Nov 2026).
//
// The coach exam on TEST, 7 Nov: "honestly it's been a rough few weeks" and
// "I did 90 minutes of cardio after dinner too because I'd overeaten" were
// answered with an EMPTY reply and a save, so the chat showed only the app's
// receipt line ("Saved: ..."). chat-gemini now writes the coach's reply beside
// the save; this holds the app's half, on the real chat screen at phone size:
//   1. the coach's words are the message and the save keeps its small note,
//      and the row is written;
//   2. the app's own "Saved: ..." line is not shown in their place;
//   3. an older coach that still sends an empty reply leaves the app's own
//      warm line, so a message is never blank;
//   4. a clinical or judging label is never shown or kept: her own words are.
//
// WHAT THIS CANNOT SEE: the model is stubbed at the fetch boundary, so whether
// the deployed coach writes a good reply is the exam's (cases ask-cant-face-it
// and scope-disordered-eating).
//
// PORT 9871.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9871, page: 'chat.html', name: 'chat-save-reply' })
const { send, ev, check, until, wait, go, shoot, finish } = d

const SPOKEN = "That sounds like a lot to carry, Ashley. Let's keep this week light and just aim for one short session."

await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const reply = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/rough few weeks/i.test(said)) return reply({ reply: ${JSON.stringify(SPOKEN)}, memoryIntent: { tool: 'record_context_fact', rawArgs: {
        origin_verbatim_quote: "it's been a rough few weeks", display_text: 'Having a rough few weeks' } } })
      if (/new job/i.test(said)) return reply({ reply: '', memoryIntent: { tool: 'record_context_fact', rawArgs: {
        origin_verbatim_quote: 'started a new job', display_text: 'Started a new job' } } })
      if (/overeaten/i.test(said)) return reply({ reply: 'Thanks for telling me that, it matters.', memoryIntent: { tool: 'record_context_fact', rawArgs: {
        origin_verbatim_quote: "I did 90 minutes of cardio after dinner too because I'd overeaten",
        display_text: 'Compensatory exercise pattern (90m cardio after overeating) & extreme restriction (600 kcal rest day)' } } })
      return reply({ reply: 'Sure.' })
    }
    return realFetch(url, init)
  }
` })
await go('')
const ready = await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 40)
check('0. the chat is up', ready === true)

const say = async t => {
  await ev(`(() => { const x = document.querySelector('textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(x, ${JSON.stringify(t)}); x.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const body = () => ev('document.body.innerText')
/** Where a piece of text sits, and whether it is inside the screen. */
const where = text => ev(`(() => {
  const el = [...document.querySelectorAll('*')].reverse().find(e => e.children.length === 0 && (e.textContent || '').includes(${JSON.stringify(text)}))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= 844 }
})()`)
const contextRows = () => ev(`JSON.stringify((window.__fakeDb.user_context_facts || []).map(f => f.display_text))`).then(s => JSON.parse(s || '[]'))

console.log('\n1. The coach keeps it AND answers\n')
check('1a. she says it', await say("honestly it's been a rough few weeks, not just today") === true)
const t1 = await until(body, t => t.includes('one short session'), 60)
check('1b. the coach\'s own words are the message', t1.includes(SPOKEN), t1.slice(-500))
const spot = await where('a lot to carry')
check('1c. ...on screen where the reply is', !!spot && spot.inView, spot)
check('1d. the save keeps its small note beneath', /Saved to memory/.test(t1) && t1.includes('Having a rough few weeks'), t1.slice(-500))
check('1e. the app\'s own "Saved: ..." line is not shown in place of the reply', !t1.includes('Saved: Having a rough few weeks'), t1.slice(-500))
check('1f. the row is written', (await contextRows()).includes('Having a rough few weeks'), await contextRows())
await shoot('chat-save-reply-spoken')

console.log('\n2. An older coach with an empty reply still leaves a message\n')
check('2a. she says it', await say('I just started a new job so evenings are hard') === true)
const t2 = await until(body, t => /Thanks for telling me\.\s/.test(t.slice(-400)) && t.includes('Started a new job'), 40)
check('2b. the app\'s own warm line is the message, never a blank and never "Saved: ..."', /Thanks for telling me\./.test(t2.slice(-400)) && !t2.includes('Saved: Started a new job'), t2.slice(-500))
check('2c. the row is written, and the note names it', (await contextRows()).includes('Started a new job') && t2.includes('Started a new job'), await contextRows())
await shoot('chat-save-reply-empty')

console.log('\n3. A clinical label never reaches her screen or her Profile\n')
check('3a. she says it', await say("I did 90 minutes of cardio after dinner too because I'd overeaten") === true)
const t3 = await until(body, t => t.includes('it matters') && t.includes('Saved to memory') && t.lastIndexOf('overeaten') > t.lastIndexOf('it matters'), 60)
check('3b. the coach answers', t3.includes('Thanks for telling me that, it matters.'), t3.slice(-500))
check('3c. the clinical label is nowhere on screen', !/Compensatory|extreme restriction|pattern/i.test(t3), t3.slice(-500))
check('3d. the note shows her own words instead', t3.slice(t3.lastIndexOf('it matters')).includes("“I did 90 minutes of cardio after dinner too because I'd overeaten”"), t3.slice(-400))
const rows3 = await contextRows()
check('3e. the row keeps her own words, not the label (what Profile and the coach read)', rows3.includes("“I did 90 minutes of cardio after dinner too because I'd overeaten”") && !rows3.some(r => /Compensatory/i.test(r)), rows3)
await shoot('chat-save-reply-clinical')

await finish('chat save reply: the coach answers beside a save, and a message is never blank')
