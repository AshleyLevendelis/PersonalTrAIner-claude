// ---------------------------------------------------------------------------
// TWO QUESTIONS ON ONE SCREEN (his "Light trim", 14 Nov 2026; docs/plans/shorter-setup.md option 1).
// The real onboarding screen, the coach scripted (scripted.tsx). It proves, on screen:
//   1. the days card carries "How long can your sessions usually run?", and Next waits for both;
//   2. one Next keeps the days AND the length, and says both back;
//   3. the diet card carries "Anything else you'd rather I left out?", and one Next keeps the diet and the foods;
//   4. the setup bar counts the two as one screen.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from './own-browser.mjs'

const { origin, send, ev, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9970, 9979],
})

async function tapEl(expr, what) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!b) { console.log(`     (nothing to tap: ${what})`); return false }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  }
  await wait(200)
  return true
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./two-question-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const draft = () => evj(`JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')`)
const next = card => `[...document.querySelectorAll('[data-slot-card="${card}"] [data-slot-next]')][0]`
const nextEnabled = async card => evj(`(() => { const b = ${next(card)}; return b ? !b.disabled : null })()`)
const bar = () => evj(`(() => { const m = (document.body.innerText || '').match(/(\\d+) of (\\d+)/); return m ? { at: Number(m[1]), of: Number(m[2]) } : null })()`)

let barDays = null
await section(1, 'The days card carries the session length, and Next waits for both', async () => {
  await send('Page.navigate', { url: `${origin}/?state=days-card` })
  await wait(1800)
  barDays = await bar()
  check('1a. the days card is on screen', (await evj(`document.querySelectorAll('[data-slot-card="trainingDays"]').length`)) === 1)
  const q = await evj(`document.querySelector('[data-companion="sessionDuration"] p')?.textContent ?? null`)
  check('1b. ...with "How long can your sessions usually run?" under it', q === 'How long can your sessions usually run?', q)
  const lengths = await evj(`[...document.querySelectorAll('[data-companion="sessionDuration"] [role="radio"]')].map(b => b.textContent.trim())`)
  check('1c. ...and the lengths as taps', Array.isArray(lengths) && lengths.length >= 3, lengths)
  await tapEl(`[...document.querySelectorAll('[data-slot-card="trainingDays"] [aria-pressed], [data-slot-card="trainingDays"] [role="checkbox"]')].find(b => /Mon/.test(b.getAttribute('aria-label') || b.textContent))`, 'Mon')
  await tapEl(`[...document.querySelectorAll('[data-slot-card="trainingDays"] [aria-pressed], [data-slot-card="trainingDays"] [role="checkbox"]')].find(b => /Thu/.test(b.getAttribute('aria-label') || b.textContent))`, 'Thu')
  check('1d. a day ticked but no length: Next waits', (await nextEnabled('trainingDays')) === false, await nextEnabled('trainingDays'))
  await tapEl(`[...document.querySelectorAll('[data-companion="sessionDuration"] [role="radio"]')].find(b => b.textContent.trim() === '45-60 min')`, '45-60')
  check('1e. both answered: Next is live', (await nextEnabled('trainingDays')) === true, await nextEnabled('trainingDays'))
  await shot('days')
})

await section(2, 'One Next keeps the days and the length, and says both back', async () => {
  await ev(`window.__onbQueue.push(${JSON.stringify({ reply: 'Good. What style of training suits you?', actions: [] })})`)
  await tapEl(next('trainingDays'), 'Next')
  await wait(1300)
  const d = await draft()
  check('2a. the days are kept', JSON.stringify(d?.values?.trainingDays) === '["Mon","Thu"]', d?.values?.trainingDays)
  check('2b. ...and the length', d?.values?.sessionDuration === '45-60', d?.values?.sessionDuration)
  check('2c. ...both answered', (d?.confirmedSlots ?? []).includes('trainingDays') && (d?.confirmedSlots ?? []).includes('sessionDuration'), d?.confirmedSlots)
  const said = await evj(`[...document.querySelectorAll('.ob-user-bubble')].map(n => n.textContent.trim()).pop() ?? null`)
  check('2d. his answer reads back both', /Mon/.test(said ?? '') && /45-60 min/.test(said ?? ''), said)
  const after = await bar()
  check('2e. the bar moved ONE screen for the two', !!barDays && !!after && after.at === barDays.at + 1 && after.of === barDays.of, { barDays, after })
})

await section(3, 'The diet card carries "anything else to leave out"', async () => {
  await send('Page.navigate', { url: `${origin}/?state=diet-card&load=2` })
  await wait(1800)
  const label = await evj(`document.querySelector('[data-companion="dislikedFoods"] label')?.textContent ?? null`)
  check('3a. the diet card has the leave-out box under it', label === "Anything else you'd rather I left out?", label)
  await tapEl(`[...document.querySelectorAll('[data-slot-card="dietaryPreferences"] [aria-pressed]')].find(b => /Nut-free/i.test(b.textContent))`, 'Nut-free')
  await evj(`(() => { const i = document.getElementById('companion-dislikedFoods'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'mushrooms and olives'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await wait(200)
  await shot('diet')
  await ev(`window.__onbQueue.push(${JSON.stringify({ reply: 'Noted. What do you usually eat?', actions: [] })})`)
  await tapEl(next('dietaryPreferences'), 'Next')
  await wait(1300)
  const d = await draft()
  check('3b. the diet is kept', JSON.stringify(d?.values?.dietaryPreferences) === '["nut-free"]', d?.values?.dietaryPreferences)
  check('3c. ...and the foods, as a list', /mushrooms/.test(d?.values?.dislikedFoods ?? '') && /olives/.test(d?.values?.dislikedFoods ?? ''), d?.values?.dislikedFoods)
  check('3d. ...both answered', (d?.confirmedSlots ?? []).includes('dietaryPreferences') && (d?.confirmedSlots ?? []).includes('dislikedFoods'), d?.confirmedSlots)
})

finish('Two questions, one screen: days with length, diet with leave-outs.')
