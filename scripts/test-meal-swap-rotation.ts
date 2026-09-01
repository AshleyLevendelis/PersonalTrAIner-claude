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

console.log('\n5. THE PING-PONG REGRESSION: the chat swap reaches the whole pool')
{
  // The bug this section exists for. chat-gemini used to fetch the pool and
  // pick `alternatives[0]` — the first option that isn't the current one — so
  // a chat swap went A -> B, then B -> A, then A -> B, forever. Three of five
  // generated meals were unreachable from the chat entirely, and because the
  // server always filled in chooseName, meal-store's own chooser never ran:
  // the rule existed twice and the live copy was the broken one.
  const { buildMealSwapProposal } = await import('../src/lib/meal-swap-proposal')

  const seen: string[] = []
  let current = POOL[0]
  const alreadySeen: string[] = [POOL[0]]
  for (let i = 0; i < POOL.length - 1; i++) {
    const r = await buildMealSwapProposal({ rawArgs: { meal_slot: 'breakfast', old_item: current }, profileId: 'p', alreadySeen })
    if (!r.ok) break
    seen.push(r.payload.chooseName)
    alreadySeen.push(r.payload.chooseName)
    current = r.payload.chooseName
  }
  check(`${POOL.length - 1} chat swaps reach ${POOL.length - 1} distinct meals`,
    new Set(seen).size === POOL.length - 1, seen)
  check('...covering the whole pool, not just the first two',
    POOL.slice(1).every(n => seen.includes(n)), { seen, unreachable: POOL.slice(1).filter(n => !seen.includes(n)) })

  const alternatives0 = POOL.filter(n => n !== POOL[1])[0]
  check('the old alternatives[0] answer is genuinely different, so this has teeth',
    seen[1] !== alternatives0, { rotation: seen[1], oldBehaviour: alternatives0 })

  // The chooser must exist ONCE. An edge function can't import src/lib, so a
  // chooser living there is a second copy by construction.
  const edge = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const swapBranch = edge.slice(edge.indexOf('name === "propose_meal_swap"'), edge.indexOf('name === "propose_meal_addition"'))
  const code = swapBranch.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  check('the edge function no longer picks the swap target itself', !/alternatives\[0\]|\.filter\(/.test(code))
  check('...and no longer reads the pool at all', !/meal_plan_slots/.test(code))
  check('...it just forwards the raw arguments', /rawArgs: args/.test(code))
}

console.log('\n6. Running out of options offers new ones instead of repeating')
{
  const { buildMealSwapProposal } = await import('../src/lib/meal-swap-proposal')
  // Ashley's ruling: once they have seen the lot, OFFER — never silently
  // spend a generation call, and never re-serve what they already rejected.
  const r = await buildMealSwapProposal({ rawArgs: { meal_slot: 'breakfast', old_item: POOL[0] }, profileId: 'p', alreadySeen: POOL })
  check('a fully-seen pool does not propose a swap', !r.ok)
  check('...it reports the pool as exhausted so the caller can offer', !r.ok && r.exhausted?.slot === 'breakfast', (r as { exhausted?: unknown }).exhausted)
  check('...and says how many they have seen', !r.ok && new RegExp(`all ${POOL.length}`).test(r.reason), (r as { reason?: string }).reason)

  // Naming a meal explicitly is the user choosing, and must never be
  // overridden by the exhausted path.
  const explicit = await buildMealSwapProposal({ rawArgs: { meal_slot: 'breakfast', old_item: POOL[0], new_item: POOL[3] }, profileId: 'p', alreadySeen: POOL })
  check('an explicitly named meal still swaps even when everything has been seen',
    explicit.ok && explicit.payload.chooseName === POOL[3], explicit.ok ? explicit.payload.chooseName : explicit.reason)
}

console.log('\n7. Finding new options ADDS, it never replaces')
{
  // persistPools deletes a slot's rows before inserting. Reaching for it here
  // would answer "find me some more" by deleting the five they have and
  // handing back five different ones — the pool-wipe trap, second instance.
  const gen = readFileSync(join(ROOT, 'src/lib/meal-generation.ts'), 'utf8')
  const appendBody = gen.slice(gen.indexOf('async function appendPools'), gen.indexOf('async function persistPools'))
  check('appendPools never deletes', !/\.delete\(/.test(appendBody))
  check('...and offsets new rows past the existing ones', /pool_index: base \+ i/.test(appendBody))
  check('appendToExisting routes to appendPools, not persistPools',
    /if \(params\.appendToExisting\) await appendPools/.test(gen))
  // The half that makes "new" mean new: the duplicate-name check has to see
  // what the slot ALREADY holds, or "find me something else" can hand back
  // the four meals sitting in the pool.
  const dedupe = gen.slice(gen.indexOf('const normalizedName = proposal.name'), gen.indexOf('const slotTimingDislikes'))
  check('the duplicate-name check consults the existing pool', /existing\.some\(o => o\.name/.test(dedupe), dedupe.slice(0, 200))
  check('...and `existing` is the slot\'s stored options', /const existing = existingBySlot\[slot\] \?\? \[\]/.test(gen))
  check('...loaded only when appending', /params\.appendToExisting\s*\n?\s*\? await getPools/.test(gen))

  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  // The closure became a named function when the Meals panel gained its own
  // "More options" button (1 Sep 2026) — chat and panel now share ONE
  // handler, so this anchors on the function and on both call sites, not on
  // prose adjacency that broke the moment the body moved.
  check('the shared find-more handler passes appendToExisting',
    /handleFindMoreMealOptions[\s\S]{0,2400}appendToExisting: true/.test(app))
  check('...and the chat prop uses that handler', /onFindMoreMealOptions=\{handleFindMoreMealOptions\}/.test(app))
  check('...and the Meals panel gets the same one, not a second copy', /onFindMoreOptions=\{handleFindMoreMealOptions\}/.test(app))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll meal-swap rotation checks passed.\n')
