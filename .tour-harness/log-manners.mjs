// ---------------------------------------------------------------------------
// THE SMALL MANNERS OF LOGGING A SESSION, ON A REAL SCREEN — tester's M11, M9,
// L10, L11, L13, L32 (tab order) and the day menu before the plan began.
// 9 Oct 2026.
//
// scripts/test-log-manners.ts asks each rule of the function that decides it.
// This asks the screen, with the tester's own taps, on the harness's Sam plan
// (limited kit, shoulder flag — `?sam=1`), whose session today is the leg day
// she was on: its warm-up already holds World's Greatest Stretch and Bodyweight
// Squat to Stand, and Tempo Air Squat is a lift with no planned weight that
// can be done loaded or not, as her Box Squat was.
//
//  1. M11 — 22.5kg on set 1, a blank tick on set 2, and the receipt says 22.5.
//  2. L32 / L10 — Tab goes weight → reps → ✓; Enter logs the set.
//  3. L11 — an added row can be taken away, and a finished card closes again.
//  4. M9 — "Hips" adds nothing the warm-up already holds, and is listed where
//          its own line says.
//  5. L13 — focusing a box does not move the page unless a keyboard would
//          cover it.
//  6. The day menu offers nothing for a day before the plan began.
//
// The card's sideways overflow (L27) is verify:tap-targets' to hold, on every
// card; the "Add an exercise" list (M13) is the logic gate's, on eight plans.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9600, passed: 'The weight carries down, Tab and Enter log a set, added rows come off, the warm-up never doubles a drill, and the page stays put.' })
const { ev, send, check, finish, tapExpr, q, until, wait, load, tick, typeInto, typeText, exerciseNames, shoot, ensureOpen, rowsExpr, cardExpr, escape, J } = b

const ready = async () => { await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000); await wait(1000) }
const key = async (k, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk }); await wait(350) }
const enter = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await wait(700) }
const inCard = (name, sel) => `[...(${cardExpr(name)}?.querySelectorAll(${J(sel)}) ?? [])]`
const cardTexts = (name, sel) => ev(`${inCard(name, sel)}.map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)
const placeholder = (name, row, box = 0) => ev(`${rowsExpr(name)}[${row}]?.querySelectorAll('input')[${box}]?.placeholder ?? null`)
const rowCount = name => ev(`${rowsExpr(name)}.length`)
const dropCount = name => ev(`${inCard(name, '[data-testid="drop-row"]')}.length`)
const stored = (name, setNumber) => ev(`(() => { const all = [...(window.__fakeDb?.exercise_set_logs ?? [])].filter(r => r.exercise_name === ${J(name)} && r.set_number === ${setNumber} && !r.is_warmup && !(r.drop_index > 0)); const r = all[all.length - 1]; return r ? { kg: Number(r.weight_kg), bw: !!r.is_bodyweight } : null })()`)
/** Tick a row exactly as it stands — nothing typed first. */
const blankTick = async (name, row) => { const ok = await tapExpr(`[...(${rowsExpr(name)}[${row}]?.querySelectorAll('button') ?? [])].find(x => /^save set/i.test(x.getAttribute('aria-label') || ''))`); await wait(700); return ok }

console.log('\nTHE SMALL MANNERS OF LOGGING A SESSION\n')

await load('sam=1')
await ready()
const names = (await exerciseNames()) ?? []
// Asked of the page, never named: the lift with no planned weight that can be
// done loaded or unloaded (hers was Box Squat), a second one to leave alone,
// and a lift the plan gives a weight (for the plate calculator and the drop).
const facts = []
for (const name of names) {
  await ensureOpen(name)
  facts.push(await ev(`(() => { const rows = ${rowsExpr(name)}; const r = rows[0]; const ins = r?.querySelectorAll('input') ?? []; return { name: ${J(name)}, rows: rows.length, wph: ins[0]?.placeholder ?? null, bw: !!r?.querySelector('[aria-label="Toggle bodyweight"]'), calc: !!r?.querySelector('[aria-label="Plate calculator"]') } })()`))
}
const U = facts.find(f => f.bw && f.wph === '0' && f.rows >= 4) ?? null
const U2 = facts.filter(f => f.bw && f.wph === '0' && f.rows >= 2 && f.name !== U?.name).pop() ?? null
const L = facts.find(f => f.calc && Number(f.wph) > 0 && f.rows >= 3) ?? null
check('0. today holds an unplanned-weight lift with four sets, a second one, and a planned lift with a plate calculator', !!U && !!U2 && !!L, facts)
if (!U || !U2 || !L) finish()
console.log(`  subjects: "${U.name}" (no planned weight) · "${U2.name}" (left at bodyweight) · "${L.name}" (planned ${L.wph}kg)`)

// ---- 1. M11 — the weight carries down ------------------------------------------
console.log('\n  1. M11 — THE WEIGHT CARRIES DOWN')
await ensureOpen(U.name)
check('1a. before anything is logged, set 2 offers this lift\'s own default (0 — bodyweight)', (await placeholder(U.name, 1)) === '0', await placeholder(U.name, 1))
check('1b. set 1 is logged at 22.5kg', (await tick(U.name, 0, { weight: 22.5 })) === true)
await ensureOpen(U.name)
check('1c. set 2\'s weight box now shows 22.5', (await placeholder(U.name, 1)) === '22.5', await placeholder(U.name, 1))
const marker1 = await cardTexts(U.name, '[data-testid="carried-weight"]')
check('1d. ...and says whose number that is: "same as set 1 · 22.5kg"', marker1.includes('same as set 1 · 22.5kg'), marker1)
check('1e. ...on every set still to do, not only the next', marker1.length === 3 && (await placeholder(U.name, 3)) === '22.5', { marker1, set4: await placeholder(U.name, 3) })
await shoot('log-manners-carry')
check('1f. set 2 is ticked with the weight box left blank', await blankTick(U.name, 1))
await ensureOpen(U.name)
const receipts1 = await cardTexts(U.name, '[data-testid="set-receipt"]')
check('1g. its receipt reads 22.5kg — not "Bodyweight"', /^Set 2: \d+ reps @ 22\.5kg/.test(receipts1[1] ?? '') && !/Bodyweight/i.test(receipts1[1] ?? ''), receipts1)
const s2 = await until(`(() => { const r = [...(window.__fakeDb?.exercise_set_logs ?? [])].filter(r => r.exercise_name === ${J(U.name)} && r.set_number === 2); return r.length ? true : null })()`, 6000) && await stored(U.name, 2)
check('1h. ...and the stored set is 22.5kg, not flagged bodyweight', !!s2 && s2.kg === 22.5 && s2.bw === false, s2)
check('1i. set 3 is logged at 25kg', (await tick(U.name, 2, { weight: 25 })) === true)
await ensureOpen(U.name)
const marker2 = await cardTexts(U.name, '[data-testid="carried-weight"]')
check('1j. a new entry carries down from there: set 4 shows 25, "same as set 3 · 25kg"', (await placeholder(U.name, 3)) === '25' && marker2.length === 1 && marker2[0] === 'same as set 3 · 25kg', { ph: await placeholder(U.name, 3), marker2 })

// A genuinely bodyweight exercise is unaffected.
await ensureOpen(U2.name)
check('1k. a second lift is ticked blank twice', (await blankTick(U2.name, 0)) && (await ensureOpen(U2.name), await blankTick(U2.name, 1)))
await ensureOpen(U2.name)
const receiptsBw = await cardTexts(U2.name, '[data-testid="set-receipt"]')
check('1l. both of its sets are bodyweight, as before', receiptsBw.length === 2 && receiptsBw.every(t => /Bodyweight/.test(t)), receiptsBw)
check('1m. ...and it gains no "same as" line — the carry changed nothing there', (await cardTexts(U2.name, '[data-testid="carried-weight"]')).length === 0, await cardTexts(U2.name, '[data-testid="carried-weight"]'))

// ---- 2. L32 / L10 — Tab and Enter -----------------------------------------------
console.log('\n  2. L32 / L10 — TAB GOES TO REPS, ENTER LOGS THE SET')
await ensureOpen(L.name)
const geometry = await ev(`(() => { const r = ${rowsExpr(L.name)}[0]; const x = el => el ? Math.round(el.getBoundingClientRect().x) : null; const ins = r.querySelectorAll('input'); return { weight: x(ins[0]), calc: x(r.querySelector('[aria-label="Plate calculator"]')), reps: x(ins[1]), tick: x(r.querySelector('[aria-label^="Save set"]')) } })()`)
check('2a. on screen the row still reads weight, plate calculator, reps, ✓ from left to right', geometry.weight < geometry.calc && geometry.calc < geometry.reps && geometry.reps < geometry.tick, geometry)
await tapExpr(`${rowsExpr(L.name)}[0]?.querySelectorAll('input')[0]`)
check('2b. the weight box of set 1 has the cursor', await ev(`document.activeElement === ${rowsExpr(L.name)}[0]?.querySelectorAll('input')[0]`))
await key('Tab', 'Tab', 9)
check('2c. Tab lands on the REPS box of the same row', await ev(`document.activeElement === ${rowsExpr(L.name)}[0]?.querySelectorAll('input')[1]`), await ev(`document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName`))
await key('Tab', 'Tab', 9)
check('2d. ...and Tab again on that row\'s ✓', await ev(`document.activeElement?.getAttribute('aria-label')`) === 'Save set 1', await ev(`document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName`))
await key('Tab', 'Tab', 9)
check('2e. the plate calculator is still reachable by keyboard, after them', await ev(`document.activeElement?.getAttribute('aria-label')`) === 'Plate calculator', await ev(`document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName`))
check('2f. the number boxes draw no spinner over their digits', await ev(`${rowsExpr(L.name)}[0] ? [...${rowsExpr(L.name)}[0].querySelectorAll('input')].every(i => getComputedStyle(i).appearance === 'textfield') : false`), await ev(`[...${rowsExpr(L.name)}[0].querySelectorAll('input')].map(i => getComputedStyle(i).appearance)`))

check('2g. 18 is typed into set 1\'s weight box', await typeInto(L.name, 0, 0, 18))
await enter()
await ensureOpen(L.name)
const receiptsL = await cardTexts(L.name, '[data-testid="set-receipt"]')
check('2h. Enter in the weight box logs the set', /^Set 1: \d+ reps @ 18kg/.test(receiptsL[0] ?? ''), receiptsL)
check('2i. 9 is typed into set 2\'s reps box', await typeInto(L.name, 1, 1, 9))
await enter()
await ensureOpen(L.name)
const receiptsL2 = await cardTexts(L.name, '[data-testid="set-receipt"]')
check('2j. Enter in the reps box logs it — at the 18 she lifted, carried down, not the plan\'s number', /^Set 2: 9 reps @ 18kg/.test(receiptsL2[1] ?? ''), { receiptsL2, planned: L.wph })

// ---- 3. L11 — an added row comes off; a finished card closes --------------------
console.log('\n  3. L11 — AN ADDED ROW CAN BE REMOVED, AND A FINISHED CARD CLOSES AGAIN')
check('3a. "Add a drop" is under the last logged set', (await ev(`${inCard(L.name, '[data-testid="add-drop"]')}.length`)) === 1)
check('3b. tapping it draws one drop row', (await tapExpr(`${inCard(L.name, '[data-testid="add-drop"]')}[0]`)) && (await dropCount(L.name)) === 1, await dropCount(L.name))
const removeLabel = await ev(`${inCard(L.name, '[data-testid="remove-added-row"]')}.map(x => x.getAttribute('aria-label'))`)
check('3c. the row has a Remove of its own, named for it', removeLabel.length === 1 && removeLabel[0] === 'Remove set 2, drop 1', removeLabel)
const tickStillOwn = await ev(`(() => { const row = ${inCard(L.name, '[data-testid="drop-row"]')}[0]; const t = row?.querySelector('[aria-label^="Save set"]'); if (!t) return null; t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height - 2); return !!hit && (hit === t || t.contains(hit)) })()`)
check('3d. ...and it does not reach up over that row\'s ✓ (the bottom edge of the ✓ is still the ✓)', tickStillOwn === true, tickStillOwn)
await shoot('log-manners-remove-row')
check('3e. Remove takes the row away', (await tapExpr(`${inCard(L.name, '[data-testid="remove-added-row"]')}[0]`)) && (await dropCount(L.name)) === 0, await dropCount(L.name))
const leftover = await ev(`(() => { try { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_active_session_v1:')); const m = k ? JSON.parse(localStorage.getItem(k)) : {}; return Object.values(m).flatMap(r => Object.entries(r.extraSets ?? {})).filter(([key, list]) => /#drop/.test(key) && list.length > 0) } catch (e) { return String(e) } })()`)
check('3f. ...and it does not come back on a reload: nothing is left in the session record', Array.isArray(leftover) && leftover.length === 0, leftover)
const before = await rowCount(L.name)
check('3g. "Add Set" draws a fourth row, and Remove takes that away too',
  (await tapExpr(`${inCard(L.name, 'button')}.find(x => x.textContent.trim() === 'Add Set')`)) && (await rowCount(L.name)) === before + 1
  && (await tapExpr(`${inCard(L.name, '[data-testid="remove-added-row"]')}[0]`)) && (await rowCount(L.name)) === before, { before, now: await rowCount(L.name) })
check('3h. a prescribed row never has a Remove', (await ev(`${inCard(L.name, '[data-testid="remove-added-row"]')}.length`)) === 0)

// The card. Its header is tapped (which used to pin it open), then it is finished.
check('3i. the last planned set is ticked blank — and carries the 18 too', await blankTick(L.name, 2))
await wait(600)
check('3j. finished, the card closes itself although its header had been tapped', (await rowCount(L.name)) === 0, await rowCount(L.name))
check('3k. re-opened by its header to add a drop', (await ensureOpen(L.name)) && (await tapExpr(`${inCard(L.name, '[data-testid="add-drop"]')}[0]`)) && (await dropCount(L.name)) === 1, await dropCount(L.name))
check('3l. ...it stays open while the drop row is waiting', (await rowCount(L.name)) > 0)
check('3m. taking the empty drop row away closes the finished card again', (await tapExpr(`${inCard(L.name, '[data-testid="remove-added-row"]')}[0]`)) && (await wait(600), (await rowCount(L.name)) === 0), await rowCount(L.name))
check('3n. re-opened once more, a drop is added and LOGGED',
  (await ensureOpen(L.name)) && (await tapExpr(`${inCard(L.name, '[data-testid="add-drop"]')}[0]`))
  && (await tapExpr(`${inCard(L.name, '[data-testid="drop-row"]')}[0]?.querySelectorAll('input')[1]`)) && (await typeText('6'), true)
  && (await tapExpr(`${inCard(L.name, '[data-testid="drop-row"]')}[0]?.querySelector('[aria-label^="Save set"]')`)))
await wait(900)
check('3o. ...and the card closes: the drop did not stop a finished exercise collapsing', (await rowCount(L.name)) === 0, await rowCount(L.name))
await ensureOpen(L.name)
check('3p. the drop is in the log, under its set', (await cardTexts(L.name, '[data-testid="set-receipt"]')).some(t => /^Set 3, drop 1: 6 reps @/.test(t)), await cardTexts(L.name, '[data-testid="set-receipt"]'))

// ---- 4. M9 — tight hips on a day whose warm-up already opens them ----------------
console.log('\n  4. M9 — "HIPS" ON A DAY WHOSE WARM-UP ALREADY OPENS THE HIPS')
await load('sam=1')
await ready()
const warmup = () => ev(`(() => {
  const root = document.querySelector('[data-testid="warmup-badge"]')?.closest('button')?.parentElement
  if (!root) return null
  const top = el => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
  const heads = [...root.querySelectorAll('p')].filter(p => /^(General|Mobility|For what feels tight)$/i.test(p.textContent.trim()))
  const block = label => { const h = heads.find(p => p.textContent.trim().toLowerCase() === label); return h ? { y: top(h), names: [...h.parentElement.querySelectorAll('div.text-xs span.font-medium')].map(s => s.textContent.trim()) } : null }
  const tight = root.querySelector('[data-testid="warmup-tightness"]')
  return { badge: root.querySelector('[data-testid="warmup-badge"]')?.textContent ?? null, general: block('general'), mobility: block('mobility'), tight: block('for what feels tight'),
    note: tight ? [...tight.querySelectorAll('p')].map(p => p.textContent.trim()).filter(t => /^Added for/.test(t))[0] ?? null : null,
    caveat: root.querySelector('[data-testid="warmup-tightness-caveat"]')?.textContent ?? null }
})()`)
await tapExpr(`document.querySelector('[data-testid="warmup-badge"]')?.closest('button')`)
const w0 = await warmup()
check('4a. the plan\'s warm-up holds World\'s Greatest Stretch and Bodyweight Squat to Stand already', !!w0?.mobility && w0.mobility.names.includes("World's Greatest Stretch") && w0.mobility.names.includes('Bodyweight Squat to Stand'), w0)
check('4b. "Anything feeling tight?" → Hips → save',
  (await tapExpr(q('[data-testid="tightness-open"]'))) && !!(await until(`!!document.querySelector('[data-testid="tight-areas"] [data-area="hips"]')`, 8000))
  && (await tapExpr(q('[data-testid="tight-areas"] [data-area="hips"]'))) && (await tapExpr(q('[data-testid="tight-save"]'))))
await until(`!!document.querySelector('[data-testid="warmup-tightness"]') || !!document.querySelector('[data-testid="warmup-tightness-caveat"]')`, 8000)
if (!(await warmup())?.general) await tapExpr(`document.querySelector('[data-testid="warmup-badge"]')?.closest('button')`)
const w1 = await warmup()
const planNames = [...(w1?.general?.names ?? []), ...(w1?.mobility?.names ?? [])]
check('4c. a block "For what feels tight" is on the warm-up', !!w1?.tight && w1.tight.names.length > 0, w1)
check('4d. nothing in it is a drill the warm-up already had', !!w1?.tight && w1.tight.names.every(n => !planNames.includes(n)), { tight: w1?.tight?.names, planNames })
check('4e. ...one new drill, not three: the warm-up already prepares the hips', w1?.tight?.names.length === 1, w1?.tight?.names)
check('4f. what was already there is named: "Your warm-up already has … for your hips."', /^Your warm-up already has World's Greatest Stretch and Bodyweight Squat to Stand for your hips\.$/.test(w1?.caveat ?? ''), w1?.caveat)
check('4g. the line says where the new one goes: straight after the general warm-up', /^Added for the hips you said felt tight — do this straight after the general warm-up\.$/.test(w1?.note ?? ''), w1?.note)
check('4h. ...and that is where it is listed: General, then what feels tight, then Mobility', !!w1?.general && !!w1?.tight && !!w1?.mobility && w1.general.y < w1.tight.y && w1.tight.y < w1.mobility.y, { general: w1?.general?.y, tight: w1?.tight?.y, mobility: w1?.mobility?.y })
check('4i. the warm-up grew by one move, not by the duplicates', /\+ ?1\b|1 (more|for today|added)/i.test(w1?.badge ?? '') || (w1?.badge ?? '') !== (w0?.badge ?? ''), { before: w0?.badge, after: w1?.badge })
await ev(`document.querySelector('[data-testid="warmup-tightness"]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('log-manners-tight-hips')

// ---- 5. L13 — focusing a box does not move the page -----------------------------
console.log('\n  5. L13 — FOCUSING A BOX DOES NOT MOVE THE PAGE')
/** Put an unsaved weight box `y` px from the top of the screen, click it where it is, and say how far the page moved. */
const focusAt = async (name, y) => {
  await ensureOpen(name)
  const box = `${rowsExpr(name)}[1]?.querySelectorAll('input')[0]`
  await ev(`(() => { document.activeElement?.blur?.(); const n = ${box}; const r = n.getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - ${y}, behavior: 'instant' }) })()`)
  await wait(400)
  const at = await ev(`(() => { const r = ${box}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: Math.round(r.top), scrollY: Math.round(window.scrollY), room: Math.round(document.documentElement.scrollHeight - window.innerHeight - window.scrollY), vh: window.innerHeight } })()`)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 })
  await wait(1300)
  const after = await ev(`({ focused: document.activeElement === ${box}, scrollY: Math.round(window.scrollY), top: Math.round(${box}.getBoundingClientRect().top) })`)
  // How far centring the box would have had to move the page, and whether the page had that much room.
  const wouldMove = Math.round(at.y - at.vh / 2)
  const couldMove = wouldMove < 0 ? Math.min(-wouldMove, at.scrollY) : Math.min(wouldMove, at.room)
  return { ...after, moved: after.scrollY - at.scrollY, startTop: at.top, wouldMove, couldMove, vh: at.vh }
}
const lastName = names[names.length - 1]

// Desktop: a mouse, no soft keyboard.
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await load('sam=1'); await ready()
check('5a. on a desktop the pointer is fine (no soft keyboard)', (await ev(`matchMedia('(pointer: coarse)').matches`)) === false)
const d1 = await focusAt(lastName, 110)
check('5b. a box near the top of a desktop window is clicked and takes the cursor', d1.focused === true, d1)
check('5c. ...the old centring would have slid the page by more than 40px here (the check is under pressure)', d1.couldMove > 40, d1)
check('5d. ...and the page does not move: the next click lands where it was aimed', d1.moved === 0, d1)

// Phone-sized, mouse pointer (how every other driver runs).
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await load('sam=1'); await ready()
const p1 = await focusAt(lastName, 620)
check('5e. with no touch screen the page stays put at phone size too', p1.focused === true && p1.couldMove > 40 && p1.moved === 0, p1)

// A touch screen: a keyboard is about to open.
await send('Emulation.setTouchEmulationEnabled', { enabled: true })
await load('sam=1'); await ready()
check('5f. with a touch screen the pointer is coarse', (await ev(`matchMedia('(pointer: coarse)').matches`)) === true)
const t1 = await focusAt(lastName, 200)
check('5g. a box in the upper half of a phone stays exactly where the thumb is', t1.focused === true && t1.couldMove > 40 && t1.moved === 0, t1)
const t2 = await focusAt(lastName, 640)
check('5h. a box in the lower half — where the keyboard opens — is still lifted clear of it', t2.focused === true && t2.moved > 40 && Math.abs(t2.top + 22 - t2.vh / 2) < 80, t2)
await send('Emulation.setTouchEmulationEnabled', { enabled: false })

// ---- 6. The day menu before the plan began --------------------------------------
console.log('\n  6. THE DAY MENU OFFERS NOTHING FOR A DAY BEFORE THE PLAN BEGAN')
const openSheet = async () => {
  if (!(await tapExpr(q('[aria-label="More options"]')))) return false
  if (!(await until(`!!document.querySelector('[data-testid="what-happened-item"]')`, 5000))) return false
  await tapExpr(q('[data-testid="what-happened-item"]'))
  return !!(await until(`!!document.querySelector('[data-testid="what-happened-sheet"]')`, 6000))
}
const sheetNow = () => ev(`(() => { const s = document.querySelector('[data-testid="what-happened-sheet"]'); return s ? { title: s.querySelector('h2')?.textContent ?? '', verbs: [...s.querySelectorAll('[data-verb]')].map(x => x.getAttribute('data-verb')), text: s.innerText.replace(/\\s+/g, ' ').trim() } : null })()`)
await load('sam=1&joined=today'); await ready()
check('6a. today\'s own "What happened?" sheet opens', await openSheet())
const todaySheet = await sheetNow()
check('6b. ...and still offers "I missed it" and "I did something else instead"', !!todaySheet && todaySheet.verbs.includes('missed') && todaySheet.verbs.includes('something_else'), todaySheet)
await escape(); await wait(400)
const beforeDays = await ev(`[...document.querySelectorAll('[data-strip-day]')].filter(c => /before your plan started/.test(c.getAttribute('aria-label') || '')).map(c => c.getAttribute('data-strip-day'))`)
check('6c. with the plan made today, earlier days this week read "before your plan started"', beforeDays.length > 0, await ev(`[...document.querySelectorAll('[data-strip-day]')].map(c => c.getAttribute('aria-label'))`))
// The first of them whose weekday HOLDS a session in the plan — a rest day
// would offer nothing for a different reason and prove nothing here.
let subject = null
let beforeSheet = null
for (const day of beforeDays) {
  await tapExpr(q(`[data-strip-day="${day}"]`)); await wait(900)
  const rest = await ev(`/is a rest or recovery day/.test(document.body.innerText)`)
  if (rest) continue
  if (!(await openSheet())) continue
  beforeSheet = await sheetNow()
  subject = day
  break
}
check('6d. one of those days has a session on the plan for its weekday, and its sheet opens', !!subject && !!beforeSheet && new RegExp(subject).test(beforeSheet.title), { beforeDays, subject, beforeSheet })
check('6e. it does not offer "I missed it" or "I did something else instead"', !!beforeSheet && !beforeSheet.verbs.includes('missed') && !beforeSheet.verbs.includes('something_else'), beforeSheet?.verbs)
check('6f. ...or anything else: nothing was planned then', !!beforeSheet && beforeSheet.verbs.length === 0 && /No session was planned for/.test(beforeSheet.text), beforeSheet)
await shoot('log-manners-before-plan')

finish()
