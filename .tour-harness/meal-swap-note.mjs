// ---------------------------------------------------------------------------
// THE SWAP SHEET'S NOTE IS WHAT THE SWAP DOES (1 Nov 2026, whole-app test). Swapping breakfast said "Dinner changed
// too, so the day still fits: Salmon pasta is now Salmon and potatoes", and the list still showed Salmon pasta: the
// sheet's trial added a tagged copy of the dish (re-planning the day) where the real swap pins the dish she picked.
// The whole app (app-boot.html) with two more dishes a meal, given as INPUT through the page's fake database (the
// stock fixture has one a meal, so a swap has nothing to choose). Held as a property: every meal the note says
// changed, changed to the dish it names, and every dish that changed is in the note.
// Every check runs every time with a null-safe subject. PORT 9539.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const PID = '00000000-0000-4000-8000-00000000b007'
const g = (name, quantity, unit = 'g') => ({ name, quantity, unit })
const mk = (slot, idx, name, ingredients, macros) => ({ id: `x-${slot}-${idx}`, profile_id: PID, slot, pool_index: idx, name, ingredients, tags: [], prep: '', macros })
const PATCH = {
  profile: { weight_kg: 68, activity_level: 'light', fitness_goal: 'fat_loss' },
  meals: [
    mk('breakfast', 1, 'Eggs on toast', [g('egg', 150), g('wholemeal bread', 80)], { kcal: 420, protein: 27, carbs: 34, fat: 17 }),
    mk('breakfast', 2, 'Yoghurt oat bowl', [g('greek yoghurt 0%', 250), g('dry oats', 40), g('blueberries', 80)], { kcal: 450, protein: 30, carbs: 50, fat: 12 }),
    mk('lunch', 1, 'Tuna pasta', [g('tuna', 120), g('dry pasta', 80), g('broccoli', 100)], { kcal: 450, protein: 40, carbs: 62, fat: 3 }),
    mk('lunch', 2, 'Chicken, potato and greens', [g('raw chicken breast', 150), g('raw potato', 300), g('broccoli', 100)], { kcal: 440, protein: 42, carbs: 55, fat: 4 }),
    mk('dinner', 1, 'Beef and rice', [g('lean beef mince', 150), g('dry white rice', 75), g('broccoli', 100)], { kcal: 560, protein: 38, carbs: 62, fat: 15 }),
    mk('dinner', 2, 'Salmon pasta', [g('salmon', 130), g('dry pasta', 80), g('spinach', 50)], { kcal: 560, protein: 33, carbs: 60, fat: 18 }),
    mk('snack', 1, 'Toast and peanut butter', [g('wholemeal bread', 60), g('peanut butter', 20)], { kcal: 260, protein: 11, carbs: 26, fat: 12 }),
    mk('snack', 2, 'Apple and cheese', [g('apple', 150), g('cheddar', 30)], { kcal: 200, protein: 8, carbs: 20, fat: 10 }),
  ],
}

const d = await startDriver({ port: 9539, page: 'app-boot.html', name: 'meal-swap-note' })
const { send, ev, check, until, wait, go, clickAt, shoot, finish } = d
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const patch = ${JSON.stringify(PATCH)}; let v; Object.defineProperty(window, '__fakeDb', { configurable: true, get(){ return v }, set(db){ v = db; Object.assign(db.fitness_profiles[0], patch.profile); for (const m of patch.meals) db.meal_plan_slots.push(m) } }) })()` })

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
const NOT_NOW = `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Not now')`
if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(500) }
await clickAt(`document.querySelector('[data-tour="navNutrition"]')`); await wait(2500)

const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
// The dish each meal row shows: the row's text after its meal label.
const served = () => ev(`(() => { const out = {}; for (const b of document.querySelectorAll('[data-testid=meal-list] button')) { const t = b.innerText.split('\\n').map(s => s.trim()).filter(Boolean); const slot = ${JSON.stringify(SLOTS)}.find(s => t[0] && t[0].toUpperCase().startsWith(s.toUpperCase())); if (slot && !out[slot] && t[1]) out[slot] = t[1] } return out })()`)
const before = await until(served, v => v && Object.keys(v).length >= 4, 30)
check('2. today shows four meals', !!before && Object.keys(before).length >= 4, before)

const dlg = `document.querySelector('[role=dialog]')`
await clickAt(`[...document.querySelectorAll('[data-testid=meal-list] button')].find(b => /^breakfast/i.test(b.innerText.trim()))`); await wait(1000)
await clickAt(`[...${dlg}.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Swap'))`); await wait(1000)
const options = await ev(`[...${dlg}.querySelectorAll('button')].map(b => b.innerText.split('\\n')[0].trim()).filter(t => ['Eggs on toast', 'Yoghurt oat bowl', 'Porridge with berries'].includes(t) && t !== ${JSON.stringify(before?.Breakfast ?? '')})`)
check('3. the swap list offers another breakfast', Array.isArray(options) && options.length >= 1, options)
const pick = options?.[0]
await clickAt(`[...${dlg}.querySelectorAll('button')].find(b => b.innerText.split('\\n')[0].trim() === ${JSON.stringify(pick ?? '')})`); await wait(2500)
const note = await ev(`document.querySelector('[data-testid="swap-knock-on"]')?.innerText ?? ''`)
await shoot('meal-swap-note-sheet')
const close = `${dlg}?.querySelector('button[aria-label*=lose i]')`
if (await ev(`!!(${close})`)) { await clickAt(close); await wait(1000) }
const after = await until(served, v => v && v.Breakfast === pick, 20)
check('4. breakfast is now the dish picked', after?.Breakfast === pick, { pick, after })

// Every "X is now Y" in the note must be true of the list; every other meal whose DISH changed must be in the note.
const claims = [...(note.matchAll(/([A-Z][^:.]*?) is now ([^.,;]+)/g))].map(m => ({ from: m[1].trim(), to: m[2].trim() }))
const changed = SLOTS.filter(s => s !== 'Breakfast' && before?.[s] && after?.[s] && before[s] !== after[s]).map(s => ({ slot: s, from: before[s], to: after[s] }))
check('5. every dish change the note names really happened', claims.every(c => changed.some(x => x.to.startsWith(c.to) || c.to.startsWith(x.to))), { note, claims, changed })
check('6. ...and every other meal whose dish changed is in the note', changed.every(x => claims.some(c => x.to.startsWith(c.to) || c.to.startsWith(x.to))), { note, claims, changed })
await shoot('meal-swap-note-after')

await finish('verify:meal-swap-note PASSED')
