/**
 * Gate: swapping a whole meal is priced against the goal, like the other six.
 *
 * THE DEFECT THIS EXISTS FOR. `assessMealEdit` judges seven meal edit kinds.
 * The coach reaches it through `adviseMealEdit`, which reads the trial's
 * numbers off the built PAYLOAD and bails on `!option?.macros` before it ever
 * looks at the kind. Six builders put a verified `option` in the payload.
 * `buildMealSwapProposal` put a NAME — so `propose_meal_swap` was listed in the
 * coach's MEAL_KINDS map, looked wired to any reader, and returned null every
 * single time. The biggest single-tap macro change in the app was the only one
 * that never asked anything.
 *
 * WHY NOTHING CAUGHT IT. `test:meal-tradeoff` builds its contexts by hand and
 * every fixture in it uses `kind: 'meal_swap'` — the one case production could
 * not produce. The module was proved correct and proved unreachable at the same
 * time, which is this repo's "tested in pieces is not has ever run" in its
 * purest form. So this gate does NOT hand-build a context: it drives the real
 * builder against a stubbed pool and feeds what comes out through the same
 * guard the coach applies, because the guard is the thing that was failing.
 *
 * Offline against a stubbed supabase client, for the reason the sibling
 * rotation gate gives: the TEST project pauses after a week idle and a payload
 * rule should not need a network to prove.
 */
import { assessMealEdit, type MealEditContext } from '../src/lib/meal-tradeoff'
import type { MacroTargets } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

type Row = { slot: string; pool_index: number; name: string; ingredients: { name: string; quantity: number; unit: string }[]; macros: { kcal: number; protein: number; carbs: number; fat: number }; tags: string[] }

/** The pool the stubbed client will serve on the next getPools call. */
let currentRows: Row[] = []

const row = (i: number, name: string, protein: number, kcal = 500): Row => ({
  slot: 'breakfast', pool_index: i, name,
  ingredients: [{ name: 'oats', quantity: 80, unit: 'g' }],
  macros: { kcal, protein, carbs: 60, fat: 15 },
  tags: ['British'],
})

const stub = {
  from: () => ({
    select: () => ({
      eq: () => ({ order: () => Promise.resolve({ data: currentRows, error: null }) }),
    }),
  }),
}

const { setSupabaseClient } = await import('../src/lib/supabase')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSupabaseClient(stub as any)

const { buildMealSwapProposal, higherProteinAlternative } = await import('../src/lib/meal-swap-proposal')
type PoolOption = import('../src/lib/meal-generation').PoolOption

/**
 * THE COACH'S GUARD, copied as a PREDICATE rather than asserted as text.
 *
 * `adviseMealEdit` is inside a 4,600-line React component and cannot be
 * imported here. What can be pinned is the property it turns on: a payload
 * reaches the judgement only if it carries `option.macros`. Pinning the
 * predicate rather than the source line means this gate keeps working when
 * that component moves, and still fails the day a builder goes back to
 * shipping a bare name.
 */
const reachesJudgement = (payload: Record<string, unknown>): boolean => {
  const slot = String((payload as { slot?: unknown }).slot ?? '').toLowerCase()
  const option = (payload as { option?: { macros?: MacroTargets } }).option
  return Boolean(slot && option?.macros)
}

const swap = async (rows: Row[], oldItem: string, newItem?: string) => {
  currentRows = rows
  return buildMealSwapProposal({
    rawArgs: { meal_slot: 'breakfast', old_item: oldItem, ...(newItem ? { new_item: newItem } : {}) },
    profileId: 'p1',
    dislikedFoods: [],
    dietaryPreferences: [],
  })
}

console.log('\nMEAL SWAP — priced against the goal\n')

// A pool where the rotation lands on a protein crash, and a rescue exists.
// Porridge is current; the next in pool order is the 10g option.
const POOL = [
  row(0, 'Porridge', 45),
  row(1, 'Toast and jam', 10),
  row(2, 'Chicken omelette', 55),
  row(3, 'Smoothie', 20),
]

// --- 1. The payload carries the NUMBERS, not just a name ---------------------

const r1 = await swap(POOL, 'Porridge')
check('a swap proposal is built', r1.ok === true, r1.ok ? undefined : r1)
const p1 = r1.ok ? r1.payload : null
check('rotation lands on the next option in pool order', p1?.chooseName === 'Toast and jam', p1?.chooseName)
check('THE DEFECT: payload carries option.macros', Boolean(p1?.option?.macros), p1?.option ?? null)
check('option.name agrees with chooseName', p1?.option?.name === p1?.chooseName, { a: p1?.option?.name, b: p1?.chooseName })
check('option.macros are the chosen meal\'s, not the current one\'s', p1?.option?.macros?.protein === 10, p1?.option?.macros)
check('the coach guard now reaches the judgement', p1 ? reachesJudgement(p1 as unknown as Record<string, unknown>) : false)

// PROVE THE DETECTOR. The pre-fix payload is exactly this one minus `option`;
// if the guard let that through, every check above would be vacuous.
const nameOnly = p1 ? { slot: p1.slot, currentName: p1.currentName, chooseName: p1.chooseName } : {}
check('detector: a name-only payload does NOT reach the judgement', !reachesJudgement(nameOnly as Record<string, unknown>))

// --- 2. The cheaper route, read off their own pool ---------------------------

check('payload offers a higher-protein option from the same pool', p1?.higherProteinOption?.name === 'Chicken omelette', p1?.higherProteinOption ?? null)
check('the offered alternative carries its protein', p1?.higherProteinOption?.protein === 55, p1?.higherProteinOption ?? null)

const opt = (name: string, protein: number): PoolOption => ({
  slot: 'breakfast', name, ingredients: [], tags: [],
  macros: { calories: 500, protein, carbs: 60, fat: 15 },
}) as PoolOption

// The current meal is the protein leader: suggesting it back is not an
// alternative, it is the meal they are leaving.
const leaderIsCurrent = higherProteinAlternative(
  [opt('Porridge', 45), opt('Toast and jam', 10), opt('Smoothie', 20)],
  opt('Toast and jam', 10),
  'Porridge',
)
check('never suggests the meal being left, even as protein leader', leaderIsCurrent?.name === 'Smoothie', leaderIsCurrent ?? null)

// Nothing beats what is going in — offering one would be inventing food.
const noneBetter = higherProteinAlternative(
  [opt('A', 50), opt('B', 20)],
  opt('A', 50),
  'B',
)
check('no alternative when nothing in the pool has more protein', noneBetter === undefined, noneBetter ?? null)

// Equal protein is not an improvement dressed up as one.
const equalOnly = higherProteinAlternative([opt('A', 30), opt('C', 30)], opt('A', 30), 'B')
check('equal protein is not offered as a higher-protein route', equalOnly === undefined, equalOnly ?? null)

// --- 3. End to end: the payload actually produces the ask --------------------

const targets: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 60 }
/**
 * NULL-SAFE ON PURPOSE, and the reason is the whole point of this gate.
 *
 * The defect being guarded is a payload with NO `option`. Reading
 * `payload.option.macros` directly would throw on exactly that input, the
 * script would die, and the run would report 0 checks instead of a failure —
 * which this repo's mutation rule reads as a crash rather than a catch, and
 * rightly. Measured: the first version of this file did throw, and the most
 * important mutation of the six came back CRASH. A missing option must FAIL
 * these checks, not silence them.
 */
const ZERO: MacroTargets = { calories: 0, protein: 0, carbs: 0, fat: 0 }
const judge = (payload: NonNullable<typeof p1>, dayProtein: number, dayCalories: number): MealEditContext => {
  const om = payload.option?.macros ?? ZERO
  return {
    goal: 'hypertrophy',
    targets,
    dayBefore: { calories: dayCalories, protein: dayProtein, carbs: 200, fat: 60 },
    // The edited slot leaves at its old numbers and comes back at its new ones
    // — the same arithmetic adviseMealEdit does.
    dayAfter: {
      calories: dayCalories - 500 + om.calories,
      protein: dayProtein - 45 + om.protein,
      carbs: 200, fat: 60,
    },
    kind: 'meal_swap',
    slot: 'breakfast',
    higherProteinOption: payload.higherProteinOption,
  }
}

const crash = p1 ? assessMealEdit(judge(p1, 150, 2000)) : null
check('a swap that crashes the day\'s protein is tier 2', crash?.tier === 2, crash?.tier)
check('tier 2 asks a question', Boolean(crash?.question), crash?.reason)
check('the question names the protein it costs', Boolean(crash?.question?.includes('115g')), crash?.question)
check('the ask offers the higher-protein route', Boolean(crash?.question?.includes('higher-protein')), crash?.question)
check('the chip names the actual meal from their pool',
  crash?.alternatives.some(a => a.note?.includes('Chicken omelette')) ?? false, crash?.alternatives)
check('the chip prompt is a swap instruction the coach can act on',
  crash?.alternatives.some(a => a.prompt === 'Swap my breakfast for Chicken omelette instead') ?? false, crash?.alternatives)
check('"just today" is always on offer beside it',
  crash?.alternatives.some(a => a.label === 'Just today') ?? false, crash?.alternatives)

// --- 4. And it does NOT nag on a swap that costs nothing ---------------------

// Rotation from Toast lands on Chicken omelette (55g) — the day goes UP.
const r2 = await swap(POOL, 'Toast and jam')
const p2 = r2.ok ? r2.payload : null
check('a second swap rotates onward rather than back', p2?.chooseName === 'Chicken omelette', p2?.chooseName)
const fine = p2
  ? assessMealEdit({
      goal: 'hypertrophy', targets,
      dayBefore: { calories: 2000, protein: 150, carbs: 200, fat: 60 },
      dayAfter: { calories: 2000, protein: 160, carbs: 200, fat: 60 },
      kind: 'meal_swap', slot: 'breakfast',
      higherProteinOption: p2.higherProteinOption,
    })
  : null
check('a swap that keeps the day on target says nothing', fine?.tier === 0, fine?.reason)

// --- 5. A named swap is priced too ------------------------------------------

const r3 = await swap(POOL, 'Porridge', 'Smoothie')
const p3 = r3.ok ? r3.payload : null
check('an explicitly named swap still carries its numbers', p3?.option?.macros?.protein === 20, p3?.option ?? null)
check('an explicitly named swap still reaches the judgement',
  p3 ? reachesJudgement(p3 as unknown as Record<string, unknown>) : false)

console.log(`\n${ran} checks ran, ${failures} failed\n`)
if (failures > 0) process.exit(1)
