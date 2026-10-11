// ---------------------------------------------------------------------------
// "I'LL COME BACK TO IT" — KEPT, ON THE SCREEN WHERE IT IS KEPT.
//
// Ashley's ruling (August 2026) is that a real fitness question asked during
// setup is parked with a reason and then COME BACK TO. The parking is the
// onboarding coach's job; this is the other half, in the real first chat:
// the question is back in front of the person, in their own words, as
// something to tap, and tapping it asks it.
//
// test:onboarding-detours holds the words and the hand-over by calling the
// functions. Only a browser shows that the first chat really renders them.
// The browser comes from .onb-harness/own-browser.mjs; ports 9740-9749.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from '../.onb-harness/own-browser.mjs'

const { origin, send, ev, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.tour-harness/chat.html',
  ports: [9740, 9749],
})
const until = async (fn, pred, tries = 60) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }
const QUESTION = 'what does creatine actually do, should I take it?'
const bodyText = () => ev(`document.body.innerText`)
const buttons = () => evj(`[...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)`)

/** Load the first-ever chat with this device holding `parked` from setup. */
async function firstChat(parked) {
  // Set before any app code runs, the way a finished onboarding leaves it.
  const { result } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: parked.length
      ? `localStorage.setItem('fitplan_parked_questions', ${JSON.stringify(JSON.stringify(parked))})`
      : `localStorage.removeItem('fitplan_parked_questions')`,
  })
  // seed=opener&rows=0 is the harness's brand-new account: no cached thread
  // and no chat rows, which is what makes this the FIRST-EVER chat. The plan
  // is handed over a moment later, as it is in the app.
  await send('Page.navigate', { url: `${origin}/?seed=opener&rows=0&planDelay=300` })
  await until(bodyText, t => /welcome aboard/i.test(t || ''))
  await wait(600)
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: result.identifier })
}

await section(1, 'A question parked during setup is waiting in the first chat', async () => {
  await firstChat([QUESTION])
  const text = await bodyText()
  check('harness: this is the first-ever chat', /welcome aboard/i.test(text))
  check('the coach says it owes an answer', /You asked me something while we were setting up/.test(text), text.slice(-400))
  const all = await buttons()
  check('the question is there to tap, word for word', all.includes(QUESTION), all.slice(-8))
  const where = await evj(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(QUESTION)}); if (!b) return null; const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) } })()`)
  check('...on screen, not below the fold', !!where && where.top >= 0 && where.bottom <= 844, where)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) writeFileSync(new URL('./parked-question.png', import.meta.url).pathname, Buffer.from(shot.result.data, 'base64'))
  // Tapping it asks it, as the person's own message.
  await ev(`[...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(QUESTION)}).click()`)
  const asked = await until(
    () => evj(`[...document.querySelectorAll('*')].filter(n => n.children.length === 0 && (n.textContent || '').trim() === ${JSON.stringify(QUESTION)}).map(n => n.tagName)`),
    v => v.some(t => t !== 'BUTTON'))
  check('tapping it sends the question as their own message', asked.some(t => t !== 'BUTTON'), asked)
})

await section(2, 'Nothing parked, nothing claimed', async () => {
  await firstChat([])
  const text = await bodyText()
  check('harness: this is the first-ever chat', /welcome aboard/i.test(text))
  check('the coach does not say it owes anything', !/while we were setting up/.test(text))
  check('...and the usual three starters are offered', (await buttons()).filter(b => /Talk me through|Swap an exercise|food I won't eat/.test(b)).length === 3, (await buttons()).slice(-6))
})

finish('A question parked during setup is back in front of the person in the first chat.')
