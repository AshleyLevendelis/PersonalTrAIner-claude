// ---------------------------------------------------------------------------
// HEALTH CONDITIONS ON THE INJURIES CARD (his ruling 14 Nov 2026, "Fold into injuries"; "Yes, build it").
// The real onboarding screen, the coach scripted (scripted.tsx, state=injuries). It proves, on screen:
//   1. the joints are there, and under "What a doctor has said to watch" the five conditions;
//   2. ticking one shows the GP line on screen, and the joints do not;
//   3. Next keeps the joint and the condition both in the answer (the profile splits them: test:health-conditions §4).
// ---------------------------------------------------------------------------
import { writeFileSync } from 'fs'
import { ownBrowser, wait } from './own-browser.mjs'

const { origin, send, ev, evj, check, section, finish } = await ownBrowser({
  dist: new URL('./dist/', import.meta.url).pathname,
  index: '/.onb-harness/scripted.html',
  ports: [9960, 9969],
})

async function tapEl(expr, what) {
  const b = await evj(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  // A missing target is a failed check further down, never a thrown section: every check runs every time.
  if (!b) { console.log(`     (nothing to tap: ${what})`); return false }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  }
  await wait(200)
  return true
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(new URL(`./health-taps-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}
const pill = label => `[...document.querySelectorAll('[data-slot-card="injuries"] button[aria-pressed]')].find(b => (b.textContent || '').trim() === ${JSON.stringify(label)})`
const line = () => evj(`(() => { const p = document.querySelector('[data-testid="health-condition-line"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { text: p.textContent, inView: r.top >= 0 && r.bottom <= 844 } })()`)

await section(1, 'The card: joints, then the five conditions under their own heading', async () => {
  await send('Page.navigate', { url: `${origin}/?state=injuries` })
  await wait(1800)
  check('1a. the injuries card is on screen', (await evj(`document.querySelectorAll('[data-slot-card="injuries"]').length`)) === 1)
  const health = await evj(`[...document.querySelectorAll('[data-health-taps] button[aria-pressed]')].map(b => (b.textContent || '').trim())`)
  check('1b. five conditions under the health heading', Array.isArray(health) && health.length === 5 && ['High blood pressure', 'A heart condition', 'Diabetes or pre-diabetes', 'On blood thinners', 'Pregnant'].every(l => health.includes(l)), health)
  const heading = await evj(`document.querySelector('[data-health-taps] p')?.textContent ?? null`)
  check('1c. ...headed "What a doctor has said to watch"', heading === 'What a doctor has said to watch', heading)
  const joints = await evj(`[...document.querySelectorAll('[data-slot-card="injuries"] button[aria-pressed]')].filter(b => !b.closest('[data-health-taps]')).map(b => (b.textContent || '').trim())`)
  check('1d. the eight joints are above it, and no condition among them', Array.isArray(joints) && joints.length === 8 && !joints.includes('Pregnant'), joints)
  check('1e. no GP line before anything is ticked', (await line()) === null)
  await shot('card')
})

await section(2, 'A joint shows no line; a condition shows the GP line, on screen', async () => {
  await tapEl(pill('Knees'), 'Knees')
  check('2a. Knees ticked, still no GP line', (await line()) === null)
  await tapEl(pill('High blood pressure'), 'High blood pressure')
  const l = await line()
  check('2b. the GP line appears', !!l && /high blood pressure, check with your GP/.test(l.text), l)
  check('2c. ...inside the screen', !!l && l.inView, l)
  await shot('line')
})

await section(3, 'Next keeps both in the answer', async () => {
  await ev(`window.__onbQueue.push(${JSON.stringify({ reply: 'Noted. Which days can you train?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingDays' } }] })})`)
  await tapEl(`[...document.querySelectorAll('[data-slot-card="injuries"] button')].find(b => /next/i.test(b.textContent || ''))`, 'Next')
  await wait(1200)
  const draft = await evj(`JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null')`)
  check('3a. the answer holds the joint and the condition', JSON.stringify(draft?.values?.injuries) === '["knees","high_blood_pressure"]', draft?.values?.injuries)
})

finish('The injuries card offers the health taps and the GP line.')
