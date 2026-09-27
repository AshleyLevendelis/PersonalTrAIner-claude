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
/**
 * The heart read (select 'name' on favorite_meals) can be made to fail, or to
 * answer late. A late answer is the snapshot taken WHEN IT WAS ASKED, the way
 * a real slow request returns the state it read, not the state at arrival.
 */
const heartRead = { fail: false, delays: [] as number[] }
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | Row[] | null = null
  let single = false
  let cols = ''
  const isHeartRead = () => table === 'favorite_meals' && op === 'select' && cols === 'name'
  const exec = () => {
    db[table] ??= []
    if (isHeartRead() && heartRead.fail) return { data: null, error: { message: 'simulated read failure' } }
    if (op === 'insert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), created_at: new Date(0).toISOString(), ...r }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    const rows = db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r }))
    return { data: single ? rows[0] ?? null : rows, error: null }
  }
  const api: Record<string, unknown> = {
    select: (c?: string) => { if (op === 'select') cols = c ?? '*'; return api },
    insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api,
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => {
      const delay = isHeartRead() ? (heartRead.delays.shift() ?? 0) : 0
      const result = exec()
      return new Promise(r => setTimeout(r, delay)).then(() => res(result), rej)
    },
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
  const { favouritesStillAllowed } = await import('../src/lib/meal-restriction-check')
  const { markFavourite, unmarkFavourite, subscribeFavourites, watchFavouriteNames } = await import('../src/lib/favourite-meals')
  const { FAVOURITE_TAG } = await import('../src/lib/meal-store')
  const { compileSoftFoodPreferences } = await import('../src/lib/fact-compiler')
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

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
    // ONE DIRECTION ONLY (27 Sep 2026 review): a broad like is not lost because
    // a narrower dislike happens to mention it.
    const broad = steeringLikes(['chicken', 'milk'], [], ['chicken liver', 'coconut milk'], [])
    check('a broad like is kept when a narrower dislike merely mentions it', broad.foods.includes('chicken') && broad.foods.includes('milk'), broad.foods)
    const category = steeringLikes(['salmon', 'peanut butter', 'rice'], [], ['fish', 'nuts'], [])
    check('a category she avoids reaches a like through the food database ("fish" drops salmon, "nuts" drops peanut butter)',
      !category.foods.includes('salmon') && !category.foods.includes('peanut butter') && category.foods.includes('rice'), category.foods)
    const cased = steeringLikes(['Salmon', 'salmon', ' SALMON '], ['Oats', 'oats'], [], [])
    check('once each, whatever the case', cased.foods.length === 1 && cased.favouriteMeals.length === 1, cased)
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
    // ONE WAY TO FOLLOW HEARTS, with the two hard parts done once
    // (27 Sep 2026 review): a failed read keeps the last good list, because
    // hearts are likes and "none" would change the meals; and only the latest
    // read applies, so two quick hearts cannot end on the first one's answer.
    db.favorite_meals = []
    const seen: string[][] = []
    let errors = 0
    const stop = watchFavouriteNames('p2', n => seen.push([...n].sort()), () => { errors++ })
    await wait(20)
    check('it reads straight away', seen.length === 1 && seen[0].length === 0, seen)
    heartRead.delays.push(80)
    await markFavourite('p2', { name: 'Apple pie', slot: 'snack', calories: 300, protein: 4, carbs: 50, fat: 10 })
    heartRead.delays.push(0)
    await markFavourite('p2', { name: 'Beef stew', slot: 'dinner', calories: 600, protein: 40, carbs: 40, fat: 25 })
    await wait(150)
    check('the sanity check: the slow first read did arrive after the second', seen.length >= 2, seen)
    check('the LATEST read wins, not the last to arrive', JSON.stringify(seen[seen.length - 1]) === JSON.stringify(['Apple pie', 'Beef stew']), seen)
    check('...and the stale one was never applied', !seen.some(x => JSON.stringify(x) === JSON.stringify(['Apple pie'])), seen)
    heartRead.fail = true
    const before = seen.length
    await unmarkFavourite('p2', 'Apple pie')
    await wait(20)
    heartRead.fail = false
    check('a FAILED read keeps the last good list rather than emptying it', seen.length === before, seen.slice(before))
    check('...and says it failed', errors === 1, errors)
    stop()
    await markFavourite('p2', { name: 'Chips', slot: 'snack', calories: 300, protein: 4, carbs: 40, fat: 14 })
    await wait(20)
    check('...and a stopped watch hears nothing more', seen.length === before, seen.length)
    const mealPlan = read('src/components/MealPlan.tsx')
    check('the meal rows follow hearts through it', /watchFavouriteNames\(profileId, setFavouriteNames\)/.test(mealPlan))
  }

  console.log('\n[5] One likes list in App, reaching everything')
  {
    const app = read('src/App.tsx')
    check('App\'s likes are typed likes plus hearted meal names',
      /const compiledSoftFoodPreferences = useMemo\(\s*\(\) => \[\.\.\.new Set\(\[\.\.\.typedFoodLikes, \.\.\.favouriteMealNames\]\)\]/.test(app))
    check('...hearts followed through the one watcher', /watchFavouriteNames\(profile\.id, /.test(app))
    const calls = app.match(/generateMealPools\(\{[\s\S]*?\}\)/g) ?? []
    check('the sanity check on this check: App generates meals in four places', calls.length === 4, calls.length)
    check('...and every one of them is told the likes and the hearted meals she can still eat',
      calls.every(c => /likedFoods: typedFoodLikes/.test(c) && /favouriteMeals: steerableFavouriteMeals/.test(c)), calls.map(c => c.slice(0, 60)))
    check('...worked out by the shared rule, from the marked pools',
      /const steerableFavouriteMeals = useMemo\(\s*\(\) => favouritesStillAllowed\(mealPools, favouriteMealNames\)/.test(app))
    const opt = (name: string, breaks: boolean) => ({ slot: 'dinner' as const, name, ingredients: [], macros: { calories: 0, protein: 0, carbs: 0, fat: 0 }, tags: [], ...(breaks ? { breaksRestriction: true as const } : {}) })
    const allowed = favouritesStillAllowed({ dinner: [opt('Satay noodles', true), opt('Beef stew', false)] }, ['satay noodles ', 'Beef stew', 'Apple pie'])
    check('...which leaves out a hearted meal the pools mark as breaking a restriction, and keeps the rest',
      JSON.stringify(allowed) === JSON.stringify(['Beef stew', 'Apple pie']), allowed)
    // A LIKE NEVER OVERRIDES WHAT SHE AVOIDS, and every assembly must agree
    // on it, or the strip and the shopping list could pick different days.
    check('the pools every assembly reads are the stored pools with restriction breakers marked',
      /const mealPools = useMemo\(\s*\(\) => markRestrictionBreakers\(storedMealPools, profile\?\.dietary_preferences \?\? \[\], compileFoodDislikes\(memoryFacts\)\)/.test(app))
    check('...and nothing that assembles a day reads the unmarked ones',
      /buildRotation\(mealPools,/.test(app) && /pools: mealPools,/.test(app) && /checkMealRefit\(mealPools,/.test(app) && /mealPools=\{mealPools\}/.test(app)
      && !/(buildRotation|assembleRotationDay|checkMealRefit|useMealDays)\([^;]*storedMealPools/.test(app) && !/mealPools=\{storedMealPools\}/.test(app))
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
      /watchFavouriteNames\(\s*profileId,/.test(prof) && /unmarkFavourite\(profileId, name\)/.test(prof))
    // The list only renders when there are hearts, so an error inside it is
    // invisible exactly when the first read failed.
    const listStart = prof.indexOf('{heartedMeals.length > 0 && (')
    const listEnd = listStart < 0 ? -1 : prof.indexOf('\n              )}', listStart)
    const listBlock = listStart >= 0 && listEnd > listStart ? prof.slice(listStart, listEnd) : ''
    const likesEnd = prof.indexOf('<span className="text-muted-foreground">Foods to avoid</span>')
    const errAt = prof.indexOf('{heartError && <p', listEnd)
    check('...and a failed read of them says so OUTSIDE the list, so it shows even with nothing listed',
      listBlock.length > 0 && !/heartError/.test(listBlock) && errAt > listEnd && errAt < likesEnd, { listBlock: listBlock.length, errAt, listEnd, likesEnd })
    check('a like is compared case-blind, so "Salmon" beside "salmon" is not a second row',
      /const have = new Set\(foodLikeValues\.map\(v => v\.toLowerCase\(\)\)\)/.test(save) && /!have\.has\(v\.toLowerCase\(\)\)/.test(save))
    check('a like of something on her foods to avoid is refused BEFORE anything is written, by the coach\'s own rule',
      /checkFactConflict\(\{ kind: 'food_preference', polarity: 'like'/.test(save) && save.indexOf('checkFactConflict(') < save.indexOf('createFact(')
      && /setLikeRefusal\(`\$\{clash\} is on your foods to avoid/.test(save), save.slice(0, 300))
    check('...shown under the likes box, not in the banner a scroll away',
      /onSave=\{saveLikedFoods\}[^\n]*\/>\s*\{likeRefusal && <p role="alert"/.test(prof))
  }

  console.log('\n[7] The coach says what a like does, and no more')
  {
    const fn = read('supabase/functions/chat-gemini/index.ts')
    const recordFact = fn.slice(fn.indexOf('name: "record_fact"'), fn.indexOf('name: "record_fact"') + 2500)
    check('it is told a like now shapes new meals and the day', /new meals are generated with it in mind/.test(recordFact) && /that day comes first/.test(recordFact))
    check('...that it never overrides an allergy, restriction or dislike', /never overrides an allergy, restriction or dislike/.test(recordFact))
    check('...and never to promise a particular dish', /never promise a particular dish/.test(recordFact))
    check('...and that a heart counts too', /A meal they heart counts as a like too/.test(recordFact))
    const chat = read('src/components/ChatAssistant.tsx')
    check('the receipt for a like never reads as a ban, whatever hardness it was filed at',
      /kind === 'food_preference' && polarity === 'like'\s*\?\s*"recorded — new meals are made with it in mind/.test(chat))
    check('a meal the coach swaps in is not hearted behind her back', !/markFavourite\(/.test(chat))
  }

  console.log('\n[8] Every like counts, whatever hardness the coach filed it at')
  {
    const facts = [
      { kind: 'food_preference', polarity: 'like', hardness: 'hard', resolved_refs: ['salmon'], status: 'active' },
      { kind: 'food_preference', polarity: 'like', hardness: 'soft', resolved_refs: ['curry'], status: 'active' },
      { kind: 'food_preference', polarity: 'dislike', hardness: 'hard', resolved_refs: ['mushroom'], status: 'active' },
    ] as unknown as Parameters<typeof compileSoftFoodPreferences>[0]
    const likes = compileSoftFoodPreferences(facts)
    check('a hard like reaches the meals, as Profile shows it does', likes.includes('salmon') && likes.includes('curry'), likes)
    check('...and a dislike never does', !likes.includes('mushroom'), likes)
  }

  console.log('\n[9] A regenerate never leaves two meals of one name beside a kept one')
  {
    // The generator is told her hearted dishes by name now, so it can propose
    // one back; the kept row is hers, at her portions, and must be the one
    // that stays. Driven through generateMealPools against the fake database.
    const lunchName = 'Verified Chicken Rice Bowl'
    db.meal_plan_slots = [{
      id: 'kept', profile_id: 'p3', slot: 'lunch', pool_index: 0, name: lunchName,
      ingredients: [{ name: 'chicken breast', quantity: 150, unit: 'g' }], macros: { kcal: 500, protein: 45, carbs: 40, fat: 12 },
      tags: [FAVOURITE_TAG], prep: '',
    }]
    let rounds = 0
    ;(globalThis as { fetch: unknown }).fetch = async () => {
      rounds++
      return { ok: true, status: 200, json: async () => ({ meals: [
        { slot: 'lunch', name: lunchName, ingredients: ['200g chicken breast', '220g cooked basmati rice', '1 tbsp olive oil', '100g broccoli'], prep: '20 min', cuisine: 'Other' },
        { slot: 'lunch', name: `Turkey Rice Bowl ${rounds}`, ingredients: ['200g turkey breast', '220g cooked basmati rice', '1 tbsp olive oil', '100g broccoli'], prep: '20 min', cuisine: 'Other' },
      ] }) }
    }
    const result = await generateMealPools({
      profileId: 'p3', targets: { calories: 2200, protein: 150, carbs: 240, fat: 70 }, dietaryPreferences: [],
      mealsPerDay: 3, includeSnacks: false, onlySlots: ['lunch'], poolSize: 3, favouriteMeals: [lunchName],
    })
    const lunch = db.meal_plan_slots.filter(r => r.profile_id === 'p3' && r.slot === 'lunch')
    check('the sanity check: the generator really did propose the kept meal\'s name and it was accepted',
      (result.accepted.lunch ?? []).some(o => o.name === lunchName), result.accepted.lunch?.map(o => o.name))
    check('...and the slot was rewritten', lunch.some(r => String(r.name).startsWith('Turkey Rice Bowl')), lunch.map(r => r.name))
    check('only ONE row of that name is stored', lunch.filter(r => r.name === lunchName).length === 1, lunch.map(r => r.name))
    check('...and it is the kept one, her portions', lunch.find(r => r.name === lunchName)?.tags && (lunch.find(r => r.name === lunchName)!.tags as string[]).includes(FAVOURITE_TAG)
      && (lunch.find(r => r.name === lunchName)!.macros as { kcal: number }).kcal === 500, lunch.find(r => r.name === lunchName))
    check('...and the pool indexes stay contiguous', JSON.stringify(lunch.map(r => r.pool_index).sort((a, b) => Number(a) - Number(b))) === JSON.stringify(lunch.map((_, i) => i)), lunch.map(r => r.pool_index))
  }

  console.log(`\n${ran} checks ran`)
  if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
  console.log('meal likes: all checks passed')
}

main().catch(err => { console.error(err); process.exit(1) })
