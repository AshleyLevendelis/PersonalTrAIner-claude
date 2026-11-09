// ---------------------------------------------------------------------------
// test:eaten-correction — QA round 3, 9 Nov 2026 (the meals tester's finding 8).
//
// Editing a meal already logged as eaten is a CORRECTION (Ashley, 2 Nov 2026, "Same dishes"). It changed the plan's
// copy and left the eaten record on the old numbers, so the day fitted the rest around two different breakfasts:
// the card said "lunch goes from 822 to 957", lunch landed at 894, and the line said "came to 134 kcal more than
// planned, so lunch, dinner and snack are 7% smaller" over a lunch that had grown. Now the correction reaches the record.
//   1. The correction itself, with a fake ledger: the old entry comes off first, the edited meal goes on as eaten,
//      a failed take-off writes nothing, Undo puts back exactly what was logged, and a retried Undo never doubles it.
//   2. Not a correction: nothing in the ledger is touched.
//   3. Wiring: the one function every edit lands through (screen and coach) runs it in that order, and both Undos run
//      its undo first. Source only; the screen is driven in verify:meal-food-edit §9.
// Every check runs every time.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

type Ev = { clientId: string; slot: string; date: string; mealName: string; macros: { kcal: number; protein: number; carbs: number; fat: number }; eventType: 'confirmed' }

async function main() {
  const ec = await import('../src/lib/eaten-correction')
  const { tagsAfterEaten } = await import('../src/lib/meal-new-from')

  // A FAKE LEDGER: entries with a void flag, a void that can be made to fail, and a key-value store.
  let ledger: (Ev & { voided?: boolean })[] = []
  let n = 0
  let failVoid: string | null = null
  const kv = new Map<string, string>()
  const deps = {
    slotEvents: async (_p: string, date: string, slot: string) => ledger.filter(e => !e.voided && e.date === date && e.slot === slot) as never,
    voidEvent: async (id: string) => { if (id === failVoid) return false; const e = ledger.find(x => x.clientId === id); if (e) e.voided = true; return true },
    log: (_p: string, date: string, slot: string, mealName: string, macros: Ev['macros']) => {
      const e: Ev = { clientId: `c${++n}`, date, slot, mealName, macros, eventType: 'confirmed' }
      ledger.push(e); return e as never
    },
    store: { get: (k: string) => kv.get(k) ?? null, set: (k: string, v: string) => { kv.set(k, v) }, remove: (k: string) => { kv.delete(k) } },
  }
  const live = (slot = 'breakfast') => ledger.filter(e => !e.voided && e.slot === slot).map(e => `${e.mealName}@${e.macros.kcal}`)
  const DATE = '2026-11-09'
  const old = { kcal: 904, protein: 49, carbs: 110, fat: 26 }
  const reset = () => { ledger = []; n = 0; failVoid = null; kv.clear(); deps.log('p', DATE, 'breakfast', 'Oats bowl', old) }
  const option = (tags: string[]) => ({ slot: 'breakfast', name: 'Oats bowl without banana', ingredients: [], tags, macros: { calories: 770, protein: 47, carbs: 80, fat: 25 } })
  const corrected = { slot: 'breakfast', date: DATE, option: option(tagsAfterEaten([], true)) } as never
  const plain = { slot: 'breakfast', date: DATE, option: option([]) } as never

  console.log('\n1. A correction reaches the eaten record')
  reset()
  const off = await ec.takeOffEaten('p', corrected, deps as never)
  check('the old entry comes off before anything is written', Array.isArray(off) && off.length === 1 && live().length === 0, { off, live: live() })
  ec.logCorrected('p', corrected, off as never, deps as never)
  check('...and the edited meal goes on as eaten, at its own numbers', JSON.stringify(live()) === JSON.stringify(['Oats bowl without banana@770']), live())
  check('undo: what was logged comes back, exactly', (await ec.undoEatenCorrection('p', corrected, deps as never)) && JSON.stringify(live()) === JSON.stringify(['Oats bowl@904']), live())
  check('...and a second undo (a retry) never logs it twice', (await ec.undoEatenCorrection('p', corrected, deps as never)) && live().length === 1, live())

  reset()
  failVoid = 'c1'
  const refused = await ec.takeOffEaten('p', corrected, deps as never)
  check('an entry that will not come off (no signal): nothing changes, and the caller is told', refused === false && JSON.stringify(live()) === JSON.stringify(['Oats bowl@904']), { refused, live: live() })

  reset()
  deps.log('p', DATE, 'breakfast', 'Oats bowl', old)
  failVoid = 'c2'
  const half = await ec.takeOffEaten('p', corrected, deps as never)
  check('logged twice, and the second will not come off: the first goes back on, so both still count', half === false && live().length === 2, live())

  reset()
  const off2 = await ec.takeOffEaten('p', corrected, deps as never)
  ec.putBackEaten('p', corrected, off2 as never, deps as never)
  check('the plan half failed: exactly what came off goes back on', JSON.stringify(live()) === JSON.stringify(['Oats bowl@904']), live())

  reset()
  const off3 = await ec.takeOffEaten('p', corrected, deps as never)
  ec.logCorrected('p', corrected, off3 as never, deps as never)
  const newId = ledger.find(e => !e.voided)!.clientId
  failVoid = newId
  check('undo whose corrected entry will not come off: false, and nothing is put back on top', !(await ec.undoEatenCorrection('p', corrected, deps as never)) && JSON.stringify(live()) === JSON.stringify(['Oats bowl without banana@770']), live())
  failVoid = null
  check('...and the retry, once it can, restores it', (await ec.undoEatenCorrection('p', corrected, deps as never)) && JSON.stringify(live()) === JSON.stringify(['Oats bowl@904']), live())

  console.log('\n2. Not a correction: the eaten record is not touched')
  reset()
  const none = await ec.takeOffEaten('p', plain, deps as never)
  ec.logCorrected('p', plain, none as never, deps as never)
  check('an edit not made after eating takes nothing off and logs nothing', Array.isArray(none) && none.length === 0 && JSON.stringify(live()) === JSON.stringify(['Oats bowl@904']), { none, live: live() })
  check('...and its undo touches nothing either', (await ec.undoEatenCorrection('p', plain, deps as never)) && JSON.stringify(live()) === JSON.stringify(['Oats bowl@904']), live())
  ledger = []; n = 0; kv.clear()
  const nothingLogged = await ec.takeOffEaten('p', corrected, deps as never)
  ec.logCorrected('p', corrected, nothingLogged as never, deps as never)
  check('marked after eating but nothing logged there now (taken off since): nothing is logged', ledger.length === 0, ledger)

  console.log('\n3. Every edit lands through it, and both Undos run it first')
  const exec = strip(readFileSync('src/lib/pending-action-executor.ts', 'utf8'))
  const apply = exec.slice(exec.indexOf('export async function applyMealOptionToSlot'), exec.indexOf('export interface MealEditUndo'))
  const at = (s: string) => apply.indexOf(s)
  check('the take-off runs before the plan is written, and a refusal returns before it', at('takeOffEaten(') > -1 && at('takeOffEaten(') < at('executeMealAddition(') && /if \(tookOff === false\) return/.test(apply), { take: at('takeOffEaten('), write: at('executeMealAddition(') })
  check('the edited meal is logged only once the pick has landed', /if \(picked\) \{ logCorrected\(profileId, payload, tookOff\); return result \}/.test(apply))
  check('every failure after the take-off puts it back', (apply.match(/putBackEaten\(profileId, payload, tookOff\)/g) ?? []).length === 2)
  const undo = exec.slice(exec.indexOf('export async function undoMealEdit'), exec.indexOf('export async function undoMealEdit') + 600)
  check('the screen\'s Undo puts the eaten record back first', undo.indexOf('undoEatenCorrection(') > -1 && undo.indexOf('undoEatenCorrection(') < undo.indexOf('undoMealAddition('))
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const chatUndo = chat.slice(chat.indexOf("row.kind === 'propose_meal_addition' || row.kind === 'propose_custom_meal' || row.kind === 'propose_meal_food_add'", chat.indexOf('undoReceiptCore')))
  check('...and so does the coach\'s', chatUndo.indexOf('undoEatenCorrection(profile.id, payload)') > -1 && chatUndo.indexOf('undoEatenCorrection(profile.id, payload)') < chatUndo.indexOf('undoMealAddition(profile.id, payload)'))
  check('the coach applies its edits through the same function', /applyMealOptionToSlot\(editProfileId, payload/.test(chat))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('A correction of a meal already eaten reaches the eaten record, and Undo puts it back.')
}
main().catch(e => { console.error(e); process.exit(1) })
