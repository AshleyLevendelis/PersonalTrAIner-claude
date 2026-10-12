// ---------------------------------------------------------------------------
// THE KIT, AS TICKS, ON THE SCREEN SHE WOULD READ IT ON (Profile → Equipment).
//
// Ashley, 9 Oct 2026: "Remember what they say" — keep the four choices,
// remember the specifics, show them as ticks on Profile. Nobody's plan changes
// unless they say something. `test:kit-list` holds the engine and the source
// wiring; this holds what only a screen can: at 390x844 the nine ticks are
// there and tappable, an untick SHOWS what it changes before anything is
// saved, Save writes the kit row and the plan stops needing the thing, Cancel
// writes nothing, and a new equipment choice starts the list again.
//
// WHAT THIS CANNOT PROVE, so it is not overread: App's own wiring. The page
// (profile.tsx ?kit=1) builds the controller with the app's own
// `makeKitController` and derives the profile with the app's own functions,
// and reproduces only App's two lines of "take the new plan, re-read the
// facts". `test:kit-list` §8 holds App's half by source.
//
// PORT 9663.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9663, page: 'profile.html', name: 'kit-ticks' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

const ITEMS = ['dumbbells', 'bench', 'incline_bench', 'barbell', 'squat_rack', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag']
const ticked = () => ev(`JSON.stringify(${JSON.stringify(ITEMS)}.filter(i => document.querySelector('[data-testid="kit-tick-' + i + '"]')?.getAttribute('aria-checked') === 'true'))`).then(s => JSON.parse(s ?? '[]'))
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').trim()`)
const kitRows = () => ev(`JSON.stringify((window.__fakeDb.user_facts ?? []).filter(f => f.kind === 'hard_constraint' && f.constraint_kind === 'equipment').map(f => ({ status: f.status, polarity: f.polarity, refs: f.resolved_refs, source: f.source, display: f.display_text })))`).then(s => JSON.parse(s ?? '[]'))
const needsBands = () => ev(`document.querySelector('[data-testid="plan-needs-bands"]')?.textContent ?? '{}'`).then(s => JSON.parse(s))
const inViewport = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 0 })()`)

const openEquipment = async () => {
  await ev(`document.querySelector('[data-profile-sheet]') && document.querySelector('[data-profile-back]')?.click()`)
  await wait(250)
  const ok = await ev(`(() => { const b = document.querySelector('[data-profile-row="Equipment"]'); if (!b) return false; b.click(); return true })()`)
  await until(() => ev(`!!document.querySelector('[data-testid="kit-ticks"]')`), v => v)
  return ok
}

await go('&kit=1')
await until(() => ev(`!!document.querySelector('[data-slot="dialog-content"]')`), v => v)
check('0. the Equipment sheet opens and holds the ticks', (await openEquipment()) === true && await ev(`!!document.querySelector('[data-testid="kit-ticks"]')`))

// 1. NOTHING SAID YET: the choice's own assumption, labelled as such.
const start = await ticked()
check('1a. all nine are there, one tick each', (await ev(`document.querySelectorAll('[data-testid^="kit-tick-"]').length`)) === 9)
check('1b. with nothing said, Minimalist\'s own assumption is ticked: dumbbells, kettlebell, bands, pull-up bar, bag',
  JSON.stringify(start) === JSON.stringify(['dumbbells', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag']), start)
check('1c. ...and the line says so, rather than claiming she said it', /from your equipment choice/i.test(await text('[data-testid="kit-ticks-caption"]')), await text('[data-testid="kit-ticks-caption"]'))
const heights = await ev(`JSON.stringify([...document.querySelectorAll('[data-testid^="kit-tick-"]')].map(b => Math.round(b.getBoundingClientRect().height)))`).then(JSON.parse)
check('1d. every tick is a 44px target, one-handed on a gym floor', heights.length === 9 && heights.every(h => h >= 44), heights)
check('1e. no change, no preview and no Save', !(await ev(`!!document.querySelector('[data-testid="kit-preview"]')`)))
await ev(`document.querySelector('[data-testid="kit-ticks"]').scrollIntoView({ block: 'start' })`)
await wait(200)
await shoot('kit-ticks-start')

// 2. UNTICK BANDS: the change is SHOWN before anything is saved.
const bandsBefore = await needsBands()
check('2a. the plan from today needs bands somewhere, and so do days already behind her (or the checks below prove nothing)', bandsBefore.fromToday.length >= 1 && bandsBefore.before.length >= 1 && bandsBefore.daysAhead > 7, bandsBefore)
await clickAt(`document.querySelector('[data-testid="kit-tick-bands"]')`)
check('2b. the tick goes off', !(await ticked()).includes('bands'))
const preview = await until(() => text('[data-testid="kit-preview"]'), v => /Your kit:/.test(v) && !/Checking/.test(v), 60)
check('2c. the preview names the kit it would be', /Your kit: dumbbells, a kettlebell, a pull-up bar and a weighted bag\./.test(preview), preview)
check('2d. ...and what changes on the plan, from which day, and that done sessions stay',
  /\d+ exercises? on your plan changes? from (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+\./.test(preview) && /already done stay as they are/.test(preview), preview)
const dayLines = await ev(`[...document.querySelectorAll('[data-testid="kit-preview-day"]')].map(p => p.textContent.trim())`)
check('2e. ...naming the days, by date, with what goes and what comes in', dayLines.length >= 1 && dayLines.every(l => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+: .+ → .+$/.test(l)), dayLines)
check('2f. NOTHING IS SAVED YET: no kit row, and the plan still needs bands', (await kitRows()).length === 0 && JSON.stringify(await needsBands()) === JSON.stringify(bandsBefore))
await ev(`document.querySelector('[data-testid="kit-save"]').scrollIntoView({ block: 'center' })`)
await wait(200)
check('2g. Save is on screen where the tap was', await inViewport('[data-testid="kit-save"]'))
await shoot('kit-ticks-preview')

// 3. SAVE: the row is written, the plan stops needing bands, the line changes.
await clickAt(`document.querySelector('[data-testid="kit-save"]')`)
const note = await until(() => text('[data-testid="kit-note"]'), v => v.length > 0, 60)
check('3a. a receipt says it saved and what changed', /^Saved\. \d+ exercises? on your plan changes? from /.test(note), note)
const rows = await kitRows()
check('3b. exactly one kit row, "no bands", from the screen', rows.length === 1 && rows[0].status === 'active' && rows[0].polarity === 'dislike'
  && JSON.stringify(rows[0].refs) === '["bands"]' && rows[0].source === 'manual' && rows[0].display === 'Kit: no resistance bands', rows)
const bandsAfter = await needsBands()
check('3c. from today on the plan no longer needs bands anywhere, warm-ups included', bandsAfter.fromToday.length === 0, bandsAfter)
check('3c2. ...and the days already behind her are exactly as they were', JSON.stringify(bandsAfter.before) === JSON.stringify(bandsBefore.before), { before: bandsBefore.before, after: bandsAfter.before })
check('3d. the ticks now show what she said, and the line says it is hers',
  JSON.stringify(await ticked()) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag'])
  && /what you've told me/i.test(await text('[data-testid="kit-ticks-caption"]')), { ticked: await ticked(), caption: await text('[data-testid="kit-ticks-caption"]') })
check('3e. the receipt is on screen', await inViewport('[data-testid="kit-note"]'))
await shoot('kit-ticks-saved')

// 4. TICK SOMETHING, THEN CANCEL: nothing is written.
await clickAt(`document.querySelector('[data-testid="kit-tick-bench"]')`)
const benchPreview = await until(() => text('[data-testid="kit-preview"]'), v => /Your kit:/.test(v) && !/Checking/.test(v), 60)
check('4a. ticking the bench shows its own preview', /Your kit: dumbbells, a flat bench, a kettlebell/.test(benchPreview), benchPreview)
await clickAt(`document.querySelector('[data-testid="kit-cancel"]')`)
await wait(300)
check('4b. Cancel puts the ticks back and writes nothing',
  !(await ticked()).includes('bench') && (await kitRows()).length === 1 && !(await ev(`!!document.querySelector('[data-testid="kit-preview"]')`)))

// 5. A NEW EQUIPMENT CHOICE STARTS THE LIST AGAIN.
await ev(`(() => {
  const label = [...document.querySelectorAll('span')].find(s => /^Equipment$/.test((s.textContent || '').trim()) && s.parentElement.querySelector('[role="combobox"], button'))
  const c = label && label.parentElement.querySelector('[role="combobox"], button')
  if (c) c.click()
})()`)
await wait(500)
const picked = await ev(`(() => {
  const o = [...document.querySelectorAll('[role="option"]')].find(x => /^Home gym/i.test((x.textContent || '').trim()))
  if (!o) return [...document.querySelectorAll('[role="option"]')].map(x => (x.textContent || '').trim())
  o.click(); return true
})()`)
check('5a. the equipment choice can be changed to Home gym', picked === true, picked)
const afterChoice = await until(() => kitRows(), v => v.length === 1 && v[0].status === 'retired', 40)
check('5b. the kit row is retired, not deleted (the history stays)', afterChoice.length === 1 && afterChoice[0].status === 'retired', afterChoice)
const homeTicks = await until(() => ticked(), v => v.length === 9, 40)
check('5c. the ticks show the new choice\'s own assumption (Home gym: all nine), ready to correct',
  homeTicks.length === 9 && /from your equipment choice/i.test(await text('[data-testid="kit-ticks-caption"]')), { homeTicks, caption: await text('[data-testid="kit-ticks-caption"]') })
check('5d. ...and the rebuild offer still comes, after the list was cleared', (await until(() => text('[data-testid="plan-invalidation"]'), v => v.length > 0)).length > 0)
await ev(`document.querySelector('[data-testid="kit-ticks"]').scrollIntoView({ block: 'start' })`)
await wait(200)
await shoot('kit-ticks-new-choice')

await finish('verify:kit-ticks PASSED')
