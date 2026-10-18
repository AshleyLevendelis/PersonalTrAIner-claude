// ---------------------------------------------------------------------------
// SETUP SHOWS THE KIT ONCE (runs 7-10, H34, 18 Oct 2026; her ruling "Show ticks once").
//
// Sam picked "no barbell or bench" and was never asked what he owns, so the app's guess (kettlebell, bands, pull-up
// bar, bag) built his plan. The real onboarding screen, the coach scripted (scripted.tsx), state=kit: equipment just
// answered, the ticks the app's next question. It proves, on screen:
//   1. the ticks are on screen under the question, pre-ticked with the guess, no bench;
//   2. a tap changes a tick, and what he leaves ticked is what is saved (the draft the app keeps);
//   3. Next with nothing tapped keeps the guess as shown, never an empty kit.
// What reaches the first plan from that answer is test:setup-kit-ticks's (the assembly, on his real profile).
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from './own-browser.mjs'

const { origin, send, ev, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9730, 9739],
})

async function tapAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  }
  await wait(150)
}
async function tapEl(expr, what) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!b) throw new Error(`nothing to tap: ${what}`)
  if (b.y < 0 || b.y > 844) throw new Error(`${what} is off screen at y=${Math.round(b.y)}`)
  await tapAt(b.x, b.y)
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./setup-kit-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const button = label => `[...document.querySelectorAll('[data-slot-card="kitTicks"] button')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === ${JSON.stringify(label)})`
const ticked = () => evj(`[...document.querySelectorAll('[data-slot-card="kitTicks"] button[aria-pressed]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => (b.getAttribute('aria-label') || b.textContent || '').trim())`)

await section(1, 'The ticks are on screen, pre-ticked with the guess', async () => {
  await send('Page.navigate', { url: `${origin}/?state=kit` })
  await wait(1800)
  check('1a. the kit card is on screen', (await evj(`document.querySelectorAll('[data-slot-card="kitTicks"]').length`)) === 1)
  const all = await evj(`[...document.querySelectorAll('[data-slot-card="kitTicks"] button[aria-pressed]')].map(b => (b.getAttribute('aria-label') || b.textContent || '').trim())`)
  check('1b. ...all nine things, in Profile\'s words', all.length === 9 && all.some(l => /Flat bench/.test(l)) && all.some(l => /Resistance bands/.test(l)), all)
  const t = await ticked()
  check('1c. ...ticked as the equipment choice assumes: dumbbells, kettlebell, bands, pull-up bar, bag — no bench',
    t.length === 5 && ['Dumbbells', 'Kettlebell', 'Resistance bands', 'Pull-up bar', 'Weighted bag'].every(x => t.some(l => l.includes(x))) && !t.some(l => /bench/i.test(l)), t)
  await shot('ticks')
})

await section(2, 'He ticks what he has, and that is what is kept', async () => {
  for (const label of ['Kettlebell', 'Resistance bands', 'Pull-up bar', 'Weighted bag', 'Flat bench']) {
    const exact = await evj(`(() => { const b = [...document.querySelectorAll('[data-slot-card="kitTicks"] button[aria-pressed]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(${JSON.stringify(label)})); return b ? (b.getAttribute('aria-label') || b.textContent || '').trim() : null })()`)
    await tapEl(button(exact), label)
  }
  const t = await ticked()
  check('2a. dumbbells and a flat bench, nothing else', t.length === 2 && t.some(l => l.includes('Dumbbells')) && t.some(l => l.includes('Flat bench')), t)
  const next = await evj(`(() => { const b = [...document.querySelectorAll('[data-slot-card="kitTicks"] button')].find(b => /Next/.test(b.textContent || '')); return b ? b.textContent.trim() : null })()`)
  check('2b. Next is there', next === 'Next →', next)
  // The coach's next turn, scripted: the screen after Next is the app's, not a missing reply.
  await ev(`window.__onbQueue.push(${JSON.stringify({ reply: 'Dumbbells and a bench is plenty to build on. Which days can you train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingDays' } }] })})`)
  await tapEl(`[...document.querySelectorAll('[data-slot-card="kitTicks"] button')].find(b => /Next/.test(b.textContent || ''))`, 'Next')
  await wait(1200)
  const draft = await evj(`JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')`)
  check('2c. the answer kept is exactly what he ticked', JSON.stringify(draft?.values?.kitTicks) === '["dumbbells","bench"]', draft?.values?.kitTicks)
  check('2d. ...and it counts as answered (shown once)', (draft?.confirmedSlots ?? []).includes('kitTicks'), draft?.confirmedSlots)
  check('2e. ...and the card is gone: the next question is on screen', (await evj(`document.querySelectorAll('[data-slot-card="kitTicks"]').length`)) === 0 && (await evj(`document.querySelectorAll('[data-slot-card="trainingDays"]').length`)) === 1)
  await shot('answered')
})

await section(3, 'Next without touching keeps the guess, never "nothing"', async () => {
  // THE CASE THAT BINDS: a card whose ticks start from the guess must save the guess when nothing is tapped. Saving
  // the raw (empty) answer would tell the plan he owns none of the nine.
  await send('Page.navigate', { url: `${origin}/?state=kit&load=2` })
  await wait(1800)
  await ev(`window.__onbQueue.push(${JSON.stringify({ reply: 'Good. Which days can you train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingDays' } }] })})`)
  await tapEl(`[...document.querySelectorAll('[data-slot-card="kitTicks"] button')].find(b => /Next/.test(b.textContent || ''))`, 'Next')
  await wait(1200)
  const draft = await evj(`JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')`)
  check('3a. untouched, the answer kept is the guess as shown (five things), not nothing', JSON.stringify(draft?.values?.kitTicks) === '["dumbbells","kettlebell","bands","pull_up_bar","weighted_bag"]', draft?.values?.kitTicks)
})

finish('Setup shows the kit once, and keeps what he ticks.')
