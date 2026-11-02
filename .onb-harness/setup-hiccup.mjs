// ---------------------------------------------------------------------------
// WHEN THE SETUP COACH CANNOT BE REACHED, SETUP KEEPS GOING (2 Nov 2026, the UX pass, item 4; whole-app test #30).
// It said "say that again" to someone who had TAPPED an answer, offered no retry, and the next question never came.
// The real onboarding screen, the coach scripted (scripted.tsx): an empty queue answers 500, which is the failure.
//   1. A tapped answer: it is kept, the screen says so, and the next open question is asked, with its card.
//   2. A typed message that answered nothing: it goes back in the box to send again, and the screen says so.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from './own-browser.mjs'

const { origin, send, ev, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9750, 9759],
})

async function tapEl(expr, what) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!b) throw new Error(`nothing to tap: ${what}`)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  await wait(150)
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./setup-hiccup-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const lastAssistant = () => evj(`(() => { const d = JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null'); const m = (d?.messages ?? []).filter(x => x.role === 'assistant'); return m[m.length - 1] ?? null })()`)

await section(1, 'A tapped answer, then the coach cannot be reached', async () => {
  await send('Page.navigate', { url: `${origin}/?state=h14` })
  await wait(1800)
  check('1a. the recovery question is on screen with its card', (await evj(`document.querySelectorAll('[data-slot-card="recoveryCapacity"]').length`)) === 1)
  // NOTHING QUEUED: the call fails (500), the case under test.
  await tapEl(`document.querySelector('[data-slot-card="recoveryCapacity"] button')`, 'a recovery answer')
  await wait(1500)
  check('1b. the coach was asked, and failed (the case binds)', (await evj('window.__onbUnscripted')) === 1, await evj('window.__onbUnscripted'))
  const draft = await evj(`JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')`)
  check('1c. the tapped answer is kept', (draft?.confirmedSlots ?? []).includes('recoveryCapacity') && !!draft?.values?.recoveryCapacity, { confirmed: draft?.confirmedSlots, v: draft?.values?.recoveryCapacity })
  const said = await lastAssistant()
  check('1d. the screen says the answer is saved, and never asks her to say it again', /your answer is saved/.test(said?.content ?? '') && !/say that again/i.test(said?.content ?? ''), said?.content)
  check('1e. ...and asks the next open question, with its card on screen', !!said?.slotCard && said.slotCard !== 'recoveryCapacity' && (await evj(`document.querySelectorAll('[data-slot-card="${said?.slotCard}"]').length`)) === 1, said)
  await shot('tapped')
})

await section(2, 'A typed message that answered nothing, then the coach cannot be reached', async () => {
  await send('Page.navigate', { url: `${origin}/?state=h14&load=2` })
  await wait(1800)
  const before = await evj('window.__onbUnscripted')
  const typed = 'what does recovery capacity mean here'
  // Typed and sent the way the turns test does it: the composer, text inserted, the send circle tapped.
  await tapEl(`document.querySelector('.ob-composer-fade input')`, 'the composer')
  await send('Input.insertText', { text: typed })
  await wait(150)
  await tapEl(`document.querySelector('button:has(svg.lucide-send)')`, 'the send button')
  await wait(1500)
  check('2a. the coach was asked, and failed', (await evj('window.__onbUnscripted')) === before + 1)
  const said = await lastAssistant()
  check('2b. the screen says it did not go through, and how to send it again', /didn’t go through/.test(said?.content ?? '') && /tap send to try again/.test(said?.content ?? ''), said?.content)
  check('2c. ...and her words are back in the box', (await evj(`document.querySelector('.ob-composer-fade input')?.value ?? null`)) === typed)
  await shot('typed')
})

finish('When the setup coach cannot be reached, the answer is kept and setup moves on.')
