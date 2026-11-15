// A meal he chose that has no dishes (15 Nov 2026, the coeliac nurse: three meals chosen, breakfast and a snack built,
// nothing said). One exit: the count of failures.
import { readFileSync } from 'node:fs'
import type { MealSlotName } from '../src/lib/meal-store'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const fakeFrom = (table: string) => {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'delete' | 'update' | 'upsert' = 'select'
  let payload: Row | Row[] | null = null
  const exec = () => {
    db[table] ??= []
    if (op === 'insert' || op === 'upsert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), ...r }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api, insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api }, upsert: (r: Row | Row[]) => { op = 'upsert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api }, delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api }, in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api, maybeSingle: () => api, single: () => api,
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
  }
  return api
}
;(globalThis as { fetch: unknown }).fetch = async () => { throw new Error('the meal writer is switched off') }

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools, DAY_TESTED_PROTEIN_FLOOR } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')
  const { emptyMealsOf, emptyMealLine, emptyMealsForCoach } = await import('../src/lib/empty-meal')
  const fat = Math.round(2053 * 0.28 / 9)
  const nurse = { calories: 2053, protein: 156, carbs: Math.round((2053 - 156 * 4 - fat * 9) / 4), fat }
  const run = (id: string, extra: Record<string, unknown> = {}) => {
    const quiet = { log: console.log, warn: console.warn, error: console.error }
    console.log = console.warn = console.error = () => {}
    return generateMealPools({ profileId: id, targets: nurse, dietaryPreferences: ['vegan', 'gluten-free'], dislikedFoods: ['tofu', 'avocado', 'oats'], mealsPerDay: 3, includeSnacks: true, skipBreakfast: false, ...extra })
      .finally(() => Object.assign(console, quiet))
  }

  console.log('§1 A new plan with the writer unreachable: every meal filled from the library')
  await run('nurse-new')
  const fresh = await getPools('nurse-new') as Partial<Record<MealSlotName, unknown[]>>
  for (const s of ['breakfast', 'lunch', 'dinner', 'snack'] as MealSlotName[]) ok((fresh[s]?.length ?? 0) > 0, `${s} has dishes`, fresh[s]?.length ?? 0)

  console.log('§2 A regenerate the writer could not refresh keeps what was saved (the 17 Sep rule)')
  db.meal_plan_slots ??= []
  db.meal_plan_slots.push({ id: 'k1', profile_id: 'nurse-kept', slot: 'lunch', pool_index: 0, name: 'Her Kept Lunch', ingredients: [{ name: 'tempeh', quantity: 150, unit: 'g' }], macros: { calories: 740, protein: 56, carbs: 60, fat: 25 }, tags: [], prep: '' })
  await run('nurse-kept', { onlySlots: ['lunch'] })
  const kept = await getPools('nurse-kept') as Partial<Record<MealSlotName, { name: string }[]>>
  ok((kept.lunch ?? []).length === 1 && kept.lunch![0].name === 'Her Kept Lunch', 'her saved lunch is kept, nothing from the library replaces it', (kept.lunch ?? []).map(o => o.name))

  console.log('§3 The leeway is only for a meal that would otherwise be empty')
  const gen = strip(readFileSync('src/lib/meal-generation.ts', 'utf8'))
  ok(DAY_TESTED_PROTEIN_FLOOR >= 0.8 && DAY_TESTED_PROTEIN_FLOOR < 1, 'a dish may carry a little under its meal\'s protein (0.8-1)', DAY_TESTED_PROTEIN_FLOOR)
  ok(/mustFit && leeway \? DAY_TESTED_PROTEIN_FLOOR : 1/.test(gen), 'only a day-tested dish, and only with the leeway asked for')
  ok((gen.match(/libraryPass\([^)]*, true\)/g) ?? []).length === 1 && /libraryPass\(false, nothingSaved, true\)/.test(gen), 'and only the empty-meal fallback asks for it')

  console.log('§4 The sentence: names what it had to fit, never the diet as something to loosen')
  const line = emptyMealLine('lunch', ['vegan', 'gluten-free'], ['tofu', 'avocado', 'oats'])
  ok(line === 'No lunch yet. Nothing we tried fitted vegan and gluten-free, your foods to avoid (tofu, avocado, oats) and your targets. Taking something off your foods to avoid gives it more to work with.', 'the line, exactly', line)
  ok(!/loosen|diet/i.test(line.split('your targets.')[1] ?? 'diet'), 'the suggestion is the avoid list, never the diet')
  ok(emptyMealLine('dinner', [], []) === 'No dinner yet. Nothing we tried fitted your targets.', 'nothing to name: just the targets')
  ok(JSON.stringify(emptyMealsOf(['breakfast', 'lunch', 'dinner', 'snack'], { breakfast: [1], snack: [1] })) === '["lunch","dinner"]', 'the empty meals are the chosen ones with no dishes')
  const coach = emptyMealsForCoach(['lunch', 'dinner'])
  ok(/lunch and dinner/.test(coach) && /never say the calories were moved/.test(coach) && /never suggest loosening their diet/.test(coach), 'the coach is told which, and not to explain them away', coach)
  ok(emptyMealsForCoach([]) === '', 'nothing empty: nothing said')

  console.log('§5 Wired: the screen draws them, the coach is told, the old advice is gone')
  const plan = strip(readFileSync('src/components/MealPlan.tsx', 'utf8'))
  ok(/expectedSlots\.includes\(s\)\) && \(pools\[s\]\?\.length \?\? 0\) === 0/.test(plan) && /line=\{emptyMealLine\(slot, dietaryPreferences, avoidFoods\)\}/.test(plan), 'Nutrition draws a chosen meal with no dishes, with the line')
  ok(/!isGenerating && <TotalsHero/.test(plan), 'the planned total waits for the build')
  const app = strip(readFileSync('src/App.tsx', 'utf8'))
  ok(/emptyMeals=\{[^}]*emptyMealsOf\(/.test(app), 'App works out the empty meals once and hands them to the coach')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  ok(/empty_meals: emptyMealsForCoach\(emptyMeals\)/.test(chat), 'the chat sends them')
  const fn = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  ok(/\$\{context\.empty_meals \? /.test(fn), "the coach's prompt reads them")
  const all = ['src/App.tsx', 'src/lib/meal-plan-actions.ts'].map(f => readFileSync(f, 'utf8')).join('\n')
  ok(!/loosening a (dietary )?restriction|widening your calorie range|don't fit your current targets/.test(all), 'no screen says "loosen a restriction" or "widen your calorie range"')

  console.log(`${ran} checks ran, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
