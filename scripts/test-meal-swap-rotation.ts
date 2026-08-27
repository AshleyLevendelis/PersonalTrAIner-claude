/**
 * Gate: "swap this for something else" never hands back what was just rejected.
 *
 * swapPoolMeal used to pick uniformly at random from the alternatives, so with
 * the default pool of five a user saying "no, something else" had a one-in-four
 * chance of getting the meal they had just turned down — and no way to tell
 * that apart from the app ignoring them. Rotation through pool_index order
 * fixes it deterministically: N-1 swaps show N-1 different meals.
 *
 * Tested against a stubbed supabase client rather than a live project, for the
 * reason every other offline gate here gives: the TEST project pauses after a
 * week idle, and a swap rule this simple should not need a network to prove.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const POOL = ['Porridge', 'Omelette', 'Greek yoghurt bowl', 'Smoothie', 'Shakshuka']
const rows = POOL.map((name, i) => ({
  slot: 'breakfast', pool_index: i, name,
  ingredients: [{ name: 'oats', quantity: 80, unit: 'g' }],
  macros: { kcal: 500, protein: 30, carbs: 60, fat: 15 }, tags: ['British', 'quick'],
}))

// Minimal stub of the one query getPools makes.
const stub = {
  from: () => ({
    select: () => ({
      eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
    }),
  }),
}

const { setSupabaseClient } = await import('../src/lib/supabase')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSupabaseClient(stub as any)
const { swapPoolMeal } = await import('../src/lib/meal-store')

console.log('\n1. A swap never returns the meal being swapped away from')
{
  const misses: string[] = []
  for (const current of POOL) {
    const got = await swapPoolMeal('p', 'breakfast', current)
    if (!got || got.name === current) misses.push(`${current} -> ${got?.name ?? 'null'}`)
  }
  check('every option swaps to a different one', misses.length === 0, misses)
}

console.log('\n2. Swapping repeatedly walks the whole pool before repeating')
{
  // The actual user complaint this fixes: "no, something else" twice in a row
  // handing back the first rejection.
  const seen: string[] = []
  let current = POOL[0]
  for (let i = 0; i < POOL.length - 1; i++) {
    const got = await swapPoolMeal('p', 'breakfast', current)
    if (!got) break
    seen.push(got.name)
    current = got.name
  }
  check(`${POOL.length - 1} swaps produced ${POOL.length - 1} different meals`,
    new Set(seen).size === POOL.length - 1, seen)
  check('...and none of them was the starting meal', !seen.includes(POOL[0]), seen)
}

console.log('\n3. It is deterministic — the same state gives the same answer')
{
  // Not a stylistic preference: a random swap is untestable and, worse, it is
  // indistinguishable from a bug when a user sees the same meal twice.
  const a = await swapPoolMeal('p', 'breakfast', 'Omelette')
  const b = await swapPoolMeal('p', 'breakfast', 'Omelette')
  const c = await swapPoolMeal('p', 'breakfast', 'Omelette')
  check('three identical calls give the same meal', a?.name === b?.name && b?.name === c?.name,
    [a?.name, b?.name, c?.name])

  const src = readFileSync(join(ROOT, 'src/lib/meal-store.ts'), 'utf8')
  // Comments stripped first: the rotation's own comment quotes the random
  // draw it replaced, which is worth keeping and is not code.
  const body = src
    .slice(src.indexOf('export async function swapPoolMeal'), src.indexOf('export async function voidMealEvent'))
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  check('no Math.random left in the swap itself', !/Math\.random/.test(body))
}

console.log('\n4. The other two entry points still behave')
{
  const picked = await swapPoolMeal('p', 'breakfast', 'Porridge', 'Shakshuka')
  check('an explicitly chosen alternative is honoured', picked?.name === 'Shakshuka', picked?.name)

  const unknownChoice = await swapPoolMeal('p', 'breakfast', 'Porridge', 'Beef Wellington')
  check('a choice that is not in the pool returns null rather than a substitute', unknownChoice === null)

  // A meal that isn't in the pool at all — an assembleDay pick, or one added
  // from chat before the pool reloads. Must still swap, and to pool order's
  // first entry rather than nothing.
  const notInPool = await swapPoolMeal('p', 'breakfast', 'Something else entirely')
  check('a current meal outside the pool still swaps', notInPool !== null && notInPool.name === POOL[0], notInPool?.name)

  const noCurrent = await swapPoolMeal('p', 'breakfast')
  check('with no current meal it returns a pool option', noCurrent !== null && POOL.includes(noCurrent.name))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll meal-swap rotation checks passed.\n')
