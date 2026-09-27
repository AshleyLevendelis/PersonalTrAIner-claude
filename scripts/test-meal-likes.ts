/**
 * test:meal-likes — foods and meals she likes shape the meals (27 Sep 2026).
 *
 * Ashley: "there's no way to let the app know what kind of meals a user likes
 * so meals are tailored to what users actually eat." Her ruling, from three
 * options: a "Foods and meals I like" list beside "Foods to avoid", the coach
 * can add to it, hearting a meal counts as a like too, new meals are made with
 * likes in mind and favoured when picking each day — and nothing is learnt
 * behind her back.
 *
 * verify:meal-likes drives the Profile list. test:soft-preferences holds the
 * day ranking. This holds the rest:
 *   1. what the generator is told, and what is left out first;
 *   2. the generator's request really carries it, from the pool builder;
 *   3. the prompt asks for SOME options, and never above the other rules;
 *   4. a heart change reaches everything that reads favourites;
 *   5. App's likes list is typed likes plus hearts, and reaches every
 *      generation call, the day, the strip and the list;
 *   6. Profile writes the coach's rows and lists the hearts;
 *   7. the coach says what a like does, and no more.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
const bodies: Record<string, unknown>[] = []
;(globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
  bodies.push(JSON.parse(init?.body ?? '{}'))
  return { ok: true, status: 200, json: async () => ({ meals: [] }) }
}

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { favorite_meals: [], meal_plan_slots: [] }
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null
  let single = false
  const exec = () => {
    db[table] ??= []
    if (op === 'insert') { db[table].push({ id: crypto.randomUUID(), ...payload }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    const rows = db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r }))
    return { data: single ? rows[0] ?? null : rows, error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (r: Row) => { op = 'insert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api,
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve().then(() => res(exec()), rej),
  }
  return api
}

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { steeringLikes, generateMealPools } = await import('../src/lib/meal-generation')
  const { markFavourite, unmarkFavourite, subscribeFavourites } = await import('../src/lib/favourite-meals')

  console.log('meal likes — foods and meals she likes shape the meals')

  console.log('\n[1] What the generator is told, and what is left out first')
  {
    const out = steeringLikes(['salmon', 'mushroom risotto', 'peanut butter', 'bibimbap', ' salmon ', ''], ['Creamy mushroom pasta', 'Salmon traybake'], ['mushroom'], ['nut-free'])
    check('a like that names a food she avoids is left out', !out.foods.includes('mushroom risotto'), out.foods)
    check('...and so is a hearted meal that does', !out.favouriteMeals.includes('Creamy mushroom pasta'), out.favouriteMeals)
    check('a like a restriction forbids is left out, when the database knows the food', !out.foods.includes('peanut butter'), out.foods)
    check('...but a kind of dish the database does not know is kept, for the generator to take as a steer', out.foods.includes('bibimbap'), out.foods)
    check('trimmed, blank-free and once each', JSON.stringify(out.foods) === JSON.stringify(['salmon', 'bibimbap']), out.foods)
    check('a hearted meal that clashes with nothing goes through', out.favouriteMeals.includes('Salmon traybake'), out.favouriteMeals)
    const none = steeringLikes(['peanut butter'], [], [], [])
    check('with no restriction, nothing is second-guessed', none.foods.includes('peanut butter'), none)
  }

  console.log('\n[2] The generator\'s request carries them, from the pool builder')
  {
    await generateMealPools({
      profileId: 'p1', targets: { calories: 2200, protein: 150, carbs: 240, fat: 70 }, dietaryPreferences: ['nut-free'],
      mealsPerDay: 3, likedFoods: ['salmon', 'peanut butter'], favouriteMeals: ['Salmon traybake'], dislikedFoods: ['mushroom'],
    })
    const b = bodies[0] ?? {}
    check('the request was made', bodies.length > 0)
    check('it names the likes', JSON.stringify(b.liked_foods) === JSON.stringify(['salmon']), b.liked_foods)
    check('...without the one her restriction forbids', !(b.liked_foods as string[] ?? []).includes('peanut butter'))
    check('...and names the hearted meals', JSON.stringify(b.favourite_meals) === JSON.stringify(['Salmon traybake']), b.favourite_meals)
    check('...beside the dislikes it always carried', JSON.stringify(b.disliked_foods) === JSON.stringify(['mushroom']), b.disliked_foods)
  }

  console.log('\n[3] The prompt asks for some, and never above the other rules')
  {
    const fn = read('supabase/functions/generate-meals/index.ts')
    check('the function reads both fields', /liked_foods, favourite_meals \} = await req\.json\(\)/.test(fn))
    const block = fn.slice(fn.indexOf('function likesBlock'), fn.indexOf('function dislikedFoodsBlock'))
    check('it asks for SOME of each slot built around them, not every option', /roughly a third to a half of each slot's options/.test(block) && /the rest should still vary/.test(block), block.slice(0, 300))
    check('...and never at the cost of another rule', /never break any other rule in this prompt/.test(block))
    check('...and the block is actually in the prompt', /\$\{avoidBlock\}\$\{likedBlock\}/.test(fn) && /const likedBlock = likesBlock\(/.test(fn))
    check('...with an empty answer when there is nothing to say', /if \(foods\.length === 0 && meals\.length === 0\) return ""/.test(block))
  }

  console.log('\n[4] A heart change reaches everything that reads favourites')
  {
    let told = 0
    const unsubscribe = subscribeFavourites(() => { told++ })
    const ok = await markFavourite('p1', { name: 'Salmon traybake', slot: 'dinner', calories: 700, protein: 45, carbs: 60, fat: 25 })
    check('hearting a meal tells the listeners', ok && told === 1, { ok, told })
    await unmarkFavourite('p1', 'Salmon traybake')
    check('...and so does un-hearting it', told === 2, told)
    unsubscribe()
    await markFavourite('p1', { name: 'Oats', slot: 'breakfast', calories: 400, protein: 20, carbs: 50, fat: 10 })
    check('...and an unsubscribed listener hears nothing more', told === 2, told)
    const mealPlan = read('src/components/MealPlan.tsx')
    check('the meal rows re-read favourites when told', /subscribeFavourites\(read\)/.test(mealPlan))
  }

  console.log('\n[5] One likes list in App, reaching everything')
  {
    const app = read('src/App.tsx')
    check('App\'s likes are typed likes plus hearted meal names',
      /const compiledSoftFoodPreferences = useMemo\(\s*\(\) => \[\.\.\.new Set\(\[\.\.\.typedFoodLikes, \.\.\.favouriteMealNames\]\)\]/.test(app))
    check('...hearts read on load and re-read when a heart changes', /subscribeFavourites\(read\)/.test(app) && /readFavouriteNames\(id\)/.test(app))
    const calls = app.match(/generateMealPools\(\{[\s\S]*?\}\)/g) ?? []
    check('the sanity check on this check: App generates meals in four places', calls.length === 4, calls.length)
    check('...and every one of them is told the likes and the hearted meals',
      calls.every(c => /likedFoods: typedFoodLikes/.test(c) && /favouriteMeals: favouriteMealNames/.test(c)), calls.map(c => c.slice(0, 60)))
    check('the day, the strip and the list all take the same likes',
      /assembleRotationDay\(mealRotation, mealRotationDate, mealPools, macros, compiledSoftFoodPreferences/.test(app)
      && /softLikedFoods: compiledSoftFoodPreferences, todaysChosen/.test(app)
      && /softLikedFoods=\{compiledSoftFoodPreferences\}/.test(app))
  }

  console.log('\n[6] Profile writes the coach\'s rows and lists the hearts')
  {
    const prof = read('src/components/ProfileScreen.tsx')
    const save = prof.slice(prof.indexOf('const saveLikedFoods'), prof.indexOf('const [heartedMeals'))
    check('a like typed on Profile is the same row a chat turn writes', /kind: 'food_preference'/.test(save) && /polarity: 'like', hardness: 'soft'/.test(save), save.slice(0, 200))
    check('...and a removed one is deleted, not hidden', /deleteFactPermanently\(f\.id\)/.test(save))
    check('...and a failed save says so rather than showing it saved', /setSaveError\(/.test(save) && /throw err/.test(save))
    check('the other preferences list leaves likes out, so none shows twice',
      /!\(kind === 'food_preference' && \(f\.polarity === 'dislike' \|\| f\.polarity === 'like'\)\)/.test(prof))
    check('hearted meals are listed and un-hearted through the meal row\'s own function',
      /readFavouriteNames\(profileId\)/.test(prof) && /unmarkFavourite\(profileId, name\)/.test(prof) && /subscribeFavourites\(read\)/.test(prof))
  }

  console.log('\n[7] The coach says what a like does, and no more')
  {
    const fn = read('supabase/functions/chat-gemini/index.ts')
    const recordFact = fn.slice(fn.indexOf('name: "record_fact"'), fn.indexOf('name: "record_fact"') + 2500)
    check('it is told a like now shapes new meals and the day', /new meals are generated with it in mind/.test(recordFact) && /that day comes first/.test(recordFact))
    check('...that it never overrides an allergy, restriction or dislike', /never overrides an allergy, restriction or dislike/.test(recordFact))
    check('...and never to promise a particular dish', /never promise a particular dish/.test(recordFact))
    check('...and that a heart counts too', /A meal they heart counts as a like too/.test(recordFact))
  }

  console.log(`\n${ran} checks ran`)
  if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
  console.log('meal likes: all checks passed')
}

main().catch(err => { console.error(err); process.exit(1) })
