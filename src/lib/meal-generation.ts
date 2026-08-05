// ---------------------------------------------------------------------------
// MEAL GENERATION (M1) — pool builder: AI proposes, code verifies & enforces
// ---------------------------------------------------------------------------
// generate-meals (the edge function) is a pure proposal engine: given slot
// macro budgets, it returns named dishes with quantified ingredient strings.
// It is NOT trusted for macros or dietary safety — every proposal goes
// through this module's verification pipeline before it's allowed anywhere
// near meal_plan_slots:
//
//   1. Parse ingredient strings -> structured lines (portion-scaler.ts)
//   2. Resolve every line against food-db.ts; reject if resolved-mass
//      coverage < MIN_COVERAGE (an under-resolved meal's real macros are
//      unknowable, not just imprecise)
//   3. validateMealAgainstDiet — any violation rejects outright (diet-rules.ts
//      fails closed on unresolved ingredients too, so this also catches most
//      cases 2 already caught, redundantly and intentionally)
//   4. Compute REAL macros from food-db — the AI's own claimed numbers are
//      never read, only its ingredient list
//   5. Scale portions to the slot budget (portion-scaler.ts); an absurd
//      scale factor (>2.5x or <0.4x) rejects rather than forcing
//   6. Recompute macros on the SCALED ingredients and require the result
//      within CALORIE_TOLERANCE of target calories and at/above target
//      protein
//
// A proposal surviving all six is accepted into a slot's pool. Filling a
// pool is bounded-retry (a few generation rounds, not infinite) — a slot
// that can't reach its target pool size keeps whatever passed and logs the
// shortfall; it is never padded with a placeholder claiming false macros.
// ---------------------------------------------------------------------------

import { supabase, resolveEnv } from './supabase'
import { computeMealMacros, type Macros100g } from './food-db'
import { validateMealAgainstDiet } from './diet-rules'
import { parseIngredientLines, scaleToTarget, isWithinCalorieTolerance, meetsProteinFloor } from './portion-scaler'
import type { MacroTargets, CookingTimePreference, BreakfastStyle } from './types'
import type { MealSlotName } from './meal-store'

export const MIN_COVERAGE = 0.8
export const DEFAULT_POOL_SIZE = 5
export const MAX_GENERATION_ROUNDS = 3

const ALL_SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** Ratios of the daily target each active slot gets, by meals-per-day (snack-less base case). Mirrors the interim placeholder plan's SLOT_RATIOS but keyed to this module's slot set. */
const BASE_RATIOS: Record<2 | 3 | 4, Partial<Record<MealSlotName, number>>> = {
  2: { breakfast: 0.45, dinner: 0.55 },
  3: { breakfast: 0.30, lunch: 0.40, dinner: 0.30 },
  4: { breakfast: 0.25, lunch: 0.30, dinner: 0.30, snack: 0.15 },
}

function scaleTargets(targets: MacroTargets, ratio: number): MacroTargets {
  return {
    calories: Math.round(targets.calories * ratio),
    protein: Math.round(targets.protein * ratio),
    carbs: Math.round(targets.carbs * ratio),
    fat: Math.round(targets.fat * ratio),
  }
}

/**
 * Slot budgets for a day, derived from daily targets + meals_per_day +
 * include_snacks. mealsPerDay outside {2,3,4} falls back to 3 (the onboarding
 * default). include_snacks on a 2/3-meal profile carves out a flat 10% for a
 * snack slot and proportionally shrinks the others to make room for it;
 * 4-meal profiles already have a snack slot in their base ratios.
 */
export function computeSlotBudgets(
  targets: MacroTargets,
  mealsPerDay: number | undefined,
  includeSnacks: boolean | undefined,
): Partial<Record<MealSlotName, MacroTargets>> {
  const mpd: 2 | 3 | 4 = mealsPerDay === 2 ? 2 : mealsPerDay === 4 ? 4 : 3
  let ratios: Partial<Record<MealSlotName, number>> = { ...BASE_RATIOS[mpd] }

  if (includeSnacks && ratios.snack == null) {
    const snackShare = 0.10
    const scale = 1 - snackShare
    const scaled: Partial<Record<MealSlotName, number>> = {}
    for (const slot of Object.keys(ratios) as MealSlotName[]) {
      scaled[slot] = (ratios[slot] ?? 0) * scale
    }
    scaled.snack = snackShare
    ratios = scaled
  }

  const budgets: Partial<Record<MealSlotName, MacroTargets>> = {}
  for (const slot of ALL_SLOTS) {
    const ratio = ratios[slot]
    if (ratio != null) budgets[slot] = scaleTargets(targets, ratio)
  }
  return budgets
}

export interface PoolOption {
  slot: MealSlotName
  name: string
  ingredients: { name: string; quantity: number; unit: string }[]
  macros: MacroTargets
  tags: string[]
}

export interface RawProposal {
  slot: string
  name: string
  ingredients: string[]
  prep: string
  cuisine: string
}

async function requestProposals(
  slotCounts: Partial<Record<MealSlotName, number>>,
  budgets: Partial<Record<MealSlotName, MacroTargets>>,
  dietaryPreferences: string[],
  cookingTimePreference: CookingTimePreference | undefined,
  favoriteCuisines: string[],
  dislikedFoods: string[],
  breakfastStyle: BreakfastStyle | undefined,
): Promise<RawProposal[]> {
  const slots = (Object.entries(slotCounts) as [MealSlotName, number][])
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => {
      const budget = budgets[slot]!
      return { slot, calories: budget.calories, protein: budget.protein, carbs: budget.carbs, fat: budget.fat, count }
    })

  if (slots.length === 0) return []

  // Dual-context env resolution (browser Vite vs. a plain-Node tsx script —
  // the quality harness calls this same pipeline outside Vite) mirrors
  // supabase.ts's own resolveClient, which needed the identical fallback.
  const env = resolveEnv()
  const apiUrl = `${env.VITE_SUPABASE_URL}/functions/v1/generate-meals`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slots,
        dietary_preferences: dietaryPreferences,
        cooking_time_preference: cookingTimePreference,
        favorite_cuisines: favoriteCuisines,
        disliked_foods: dislikedFoods,
        breakfast_style: breakfastStyle,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data.meals) ? data.meals : []
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

function macrosToTargets(m: Macros100g): MacroTargets {
  return { calories: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat }
}

// ---------------------------------------------------------------------------
// Slot appropriateness (meal-realism round) — the generate-meals prompt now
// steers toward slot-correct dishes (SLOT_GUIDANCE in the edge function), but
// prompt steering is a nicety, not a guard (same split as diet-rules.ts vs
// buildDietarySafetyBlock). This keyword heuristic is the actual reject gate.
// No keyword list is exhaustive, so it only rejects CLEAR mismatches — a dish
// name/prep that reads unmistakably as a heavy dinner dish landing in
// breakfast, or a multi-component dish landing in snack. Ambiguous cases pass
// through: a false reject just costs a generation round, a false accept is a
// realism nit, not a safety issue, so this errs permissive.
// ---------------------------------------------------------------------------
const DINNER_STYLE_KEYWORDS = [
  'curry', 'stew', 'casserole', 'roast', 'bourguignon', 'tagine', 'braised',
  'biryani', 'paella', 'risotto', 'lasagna', 'moussaka', 'goulash',
  'chili con carne', 'pot pie', "shepherd's pie", 'cottage pie', 'ramen',
  'pho', 'schnitzel', 'mapo tofu', 'pad thai', 'gochujang', 'bibimbap', 'jambalaya',
]

const BREAKFAST_SIGNAL_KEYWORDS = [
  'egg', 'oat', 'yog', 'toast', 'pancake', 'waffle', 'smoothie', 'granola',
  'muffin', 'hash brown', 'omelette', 'omelet', 'frittata', 'shakshuka',
  'porridge', 'cereal', 'bagel', 'crepe',
]

const MAX_SNACK_INGREDIENTS = 5

// ---------------------------------------------------------------------------
// Cuisine coherence (meal-realism round) — mirrors generate-meals/index.ts's
// FAMILIAR_CUISINES/EXOTIC_CUISINES split. Kept in sync by hand: the edge
// function is a separate Deno deploy target with no shared import surface
// with src/lib. Used to cap POOL COMPOSITION, not to reject a proposal
// outright — an exotic dish is a perfectly fine proposal, just not more than
// one per slot's pool (see the exotic-cap check in generateMealPools below).
// ---------------------------------------------------------------------------
export const EXOTIC_CUISINES = new Set([
  'Thai', 'Middle Eastern (Persian, Moroccan)', 'Korean', 'Indian (North Indian, South Indian)',
  'Caribbean (Jamaican, Cuban)', 'Japanese', 'Vietnamese', 'Ethiopian',
  'Spanish (Basque, Catalan)', 'Brazilian', 'West African (Nigerian, Ghanaian)',
  'Peruvian', 'Filipino', 'Georgian', 'Cajun / Creole', 'Scandinavian (Nordic)',
])

/** tags[0] is always the cuisine (see verifyProposal) — undefined/'' cuisine never counts as exotic. */
export function isExoticOption(option: PoolOption): boolean {
  return EXOTIC_CUISINES.has(option.tags[0] ?? '')
}

/** Returns a rejection reason, or null if the proposal reads as fitting its slot. */
export function checkSlotAppropriate(
  name: string,
  prep: string,
  slot: MealSlotName,
  ingredientCount: number,
): string | null {
  const lower = `${name} ${prep}`.toLowerCase()

  if (slot === 'breakfast') {
    const isDinnerStyle = DINNER_STYLE_KEYWORDS.some(kw => lower.includes(kw))
    const hasBreakfastSignal = BREAKFAST_SIGNAL_KEYWORDS.some(kw => lower.includes(kw))
    if (isDinnerStyle && !hasBreakfastSignal) {
      return 'reads as a dinner-style dish, not breakfast food'
    }
  }

  if (slot === 'snack' && ingredientCount > MAX_SNACK_INGREDIENTS) {
    return `${ingredientCount} ingredients is too composed to be a snack (snacks should be simple — yoghurt, a shake, nuts, fruit+protein, a bar)`
  }

  return null
}

/**
 * Runs one proposal through the full verification pipeline. Returns the
 * accepted PoolOption, or null with a logged reason if it fails any stage.
 */
/** Exported so tests (and the vegan-fixture rejection test in particular) can run a synthetic AI proposal through the exact verification pipeline without hitting the network. */
export function verifyProposal(
  proposal: RawProposal,
  slot: MealSlotName,
  budget: MacroTargets,
  dietaryPreferences: string[],
  rejectLog: string[],
  dislikedFoods: string[] = [],
): PoolOption | null {
  const parsed = parseIngredientLines(proposal.ingredients)
  if (parsed.length === 0) {
    rejectLog.push(`[${slot}] "${proposal.name}": no ingredients parsed`)
    return null
  }

  const slotIssue = checkSlotAppropriate(proposal.name, proposal.prep, slot, parsed.length)
  if (slotIssue) {
    rejectLog.push(`[${slot}] "${proposal.name}": not slot-appropriate — ${slotIssue}`)
    return null
  }

  // Onboarding's disliked_foods is a hard filter, not steering (favorite
  // cuisines/breakfast_style only nudge the prompt) — substring match
  // against the parsed ingredient names, same fail-permissive spirit as
  // checkSlotAppropriate: a food the user didn't actually use isn't matched
  // just because it shares a common word, but we don't try to be clever
  // about it either (e.g. "mushroom" disliked also rejects "mushroom soup").
  if (dislikedFoods.length > 0) {
    const lowerNames = parsed.map(l => l.name.toLowerCase())
    const hit = dislikedFoods.find(food => food.trim() && lowerNames.some(n => n.includes(food.trim().toLowerCase())))
    if (hit) {
      rejectLog.push(`[${slot}] "${proposal.name}": contains disliked food "${hit}"`)
      return null
    }
  }

  const computed = computeMealMacros(parsed)
  if (computed.coverage < MIN_COVERAGE) {
    rejectLog.push(`[${slot}] "${proposal.name}": coverage ${(computed.coverage * 100).toFixed(0)}% below ${MIN_COVERAGE * 100}% floor — unmatched: ${computed.unmatched.join(', ')}`)
    return null
  }

  const dietResult = validateMealAgainstDiet(parsed, dietaryPreferences)
  if (!dietResult.ok) {
    rejectLog.push(`[${slot}] "${proposal.name}": diet violation(s) — ${dietResult.violations.map(v => v.reason).join('; ')}`)
    return null
  }

  const target100g: Macros100g = { kcal: budget.calories, protein: budget.protein, carbs: budget.carbs, fat: budget.fat }
  const scaled = scaleToTarget(parsed, { kcal: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat }, target100g)
  if (scaled.rejectedReason) {
    rejectLog.push(`[${slot}] "${proposal.name}": ${scaled.rejectedReason}`)
    return null
  }

  const finalComputed = computeMealMacros(scaled.ingredients)
  if (finalComputed.coverage < MIN_COVERAGE) {
    rejectLog.push(`[${slot}] "${proposal.name}": post-scale coverage dropped below floor (unexpected — scaling shouldn't change resolution)`)
    return null
  }
  if (!isWithinCalorieTolerance(finalComputed.kcal, budget.calories) || !meetsProteinFloor(finalComputed.protein, budget.protein)) {
    rejectLog.push(`[${slot}] "${proposal.name}": post-scale result (${finalComputed.kcal} kcal, ${finalComputed.protein}g protein) missed target (${budget.calories} kcal, ${budget.protein}g protein) even at a sane scale factor (${scaled.scaleFactor.toFixed(2)}x) — likely a macro-ratio mismatch scaling alone can't fix`)
    return null
  }

  const prepBand = /\b(1[0-5]|[1-9])\s*(min|minute)/i.test(proposal.prep) ? 'quick' : proposal.prep.length > 0 ? 'standard' : 'unspecified'
  const keyProtein = parsed.find(l => {
    const entry = computed.lines.find(ln => ln.input === l)?.entry
    return entry?.category === 'protein'
  })

  return {
    slot,
    name: proposal.name,
    ingredients: scaled.ingredients,
    macros: macrosToTargets(finalComputed),
    // Fixed order: [cuisine, prepBand, proteinSourceName, ...]. slot_appropriate
    // is appended, not inserted, so existing tags[0]/tags.find() consumers are
    // unaffected — every option reaching here already passed checkSlotAppropriate
    // above, so this documents the pass rather than gating anything further.
    tags: [proposal.cuisine, prepBand, keyProtein?.name ?? '', 'slot_appropriate'].filter(Boolean),
  }
}

export interface GenerateMealPoolsResult {
  accepted: Partial<Record<MealSlotName, PoolOption[]>>
  rejectionLog: string[]
  shortfalls: { slot: MealSlotName; requested: number; filled: number }[]
}

/**
 * Builds a full week's worth of meal pools for a profile: for every active
 * slot (per meals_per_day/include_snacks), requests candidate dishes in
 * bounded rounds, verifies each, and returns whatever passed. Persists
 * accepted options into meal_plan_slots, replacing that profile's existing
 * pool for each touched slot (regenerate-per-slot semantics — Part 5's UI
 * control calls this with a single slot to avoid nuking the whole week).
 */
export async function generateMealPools(params: {
  profileId: string
  targets: MacroTargets
  dietaryPreferences: string[]
  mealsPerDay?: number
  includeSnacks?: boolean
  cookingTimePreference?: CookingTimePreference
  poolSize?: number
  /** Restrict generation to these slots only (per-slot regenerate). Omit to fill every active slot. */
  onlySlots?: MealSlotName[]
  /** Steering only — nudges generate-meals's cuisine selection, never enforced in code. */
  favoriteCuisines?: string[]
  /** Hard filter — see the dislikedFoods check in verifyProposal. */
  dislikedFoods?: string[]
  /**
   * Memory & goals (VISION-ARCHITECTURE.md §1.2) — slot-scoped timing rules
   * only ("no eggs at breakfast"). Training-anchored rules ("no eggs before
   * training") are NOT applied here: doing so correctly needs day-context
   * (is today a training day?) that `assembleDay`/`generateMealPools` don't
   * have — the vision doc's own §1.1 conflict note flags this as a future
   * `ctx.dayContext` addition. Those rules are recorded (fact-compiler.ts
   * still returns them) but the memory screen must show them as not yet
   * applied rather than silently pretending they're honoured.
   */
  timingRules?: import('./fact-compiler').CompiledTimingRule[]
  /** Steering only — nudges the breakfast slot's prompt guidance. */
  breakfastStyle?: BreakfastStyle
}): Promise<GenerateMealPoolsResult> {
  const poolSize = params.poolSize ?? DEFAULT_POOL_SIZE
  const budgets = computeSlotBudgets(params.targets, params.mealsPerDay, params.includeSnacks)
  const activeSlots = (Object.keys(budgets) as MealSlotName[]).filter(
    s => !params.onlySlots || params.onlySlots.includes(s)
  )

  const accepted: Partial<Record<MealSlotName, PoolOption[]>> = {}
  const rejectionLog: string[] = []
  for (const slot of activeSlots) accepted[slot] = []

  for (let round = 0; round < MAX_GENERATION_ROUNDS; round++) {
    const remaining: Partial<Record<MealSlotName, number>> = {}
    for (const slot of activeSlots) {
      const need = poolSize - (accepted[slot]?.length ?? 0)
      if (need > 0) remaining[slot] = need
    }
    if (Object.keys(remaining).length === 0) break

    // Ask for a couple of spares beyond what's needed per round, since some
    // proposals will fail verification — cheaper than a strict 1:1 retry loop.
    const requestCounts: Partial<Record<MealSlotName, number>> = {}
    for (const [slot, need] of Object.entries(remaining) as [MealSlotName, number][]) {
      requestCounts[slot] = need + 2
    }

    const proposals = await requestProposals(
      requestCounts,
      budgets,
      params.dietaryPreferences,
      params.cookingTimePreference,
      params.favoriteCuisines ?? [],
      params.dislikedFoods ?? [],
      params.breakfastStyle,
    )
    for (const proposal of proposals) {
      const slot = proposal.slot as MealSlotName
      if (!activeSlots.includes(slot)) continue
      if ((accepted[slot]?.length ?? 0) >= poolSize) continue

      const budget = budgets[slot]
      if (!budget) continue

      const isExoticProposal = EXOTIC_CUISINES.has(proposal.cuisine)
      const poolAlreadyHasExotic = accepted[slot]?.some(isExoticOption) ?? false
      if (isExoticProposal && poolAlreadyHasExotic) {
        rejectionLog.push(`[${slot}] "${proposal.name}": pool already has an exotic-cuisine option — cuisine coherence cap (${proposal.cuisine})`)
        continue
      }

      const slotTimingDislikes = (params.timingRules ?? [])
        .filter(r => r.anchor === 'slot' && r.slot === slot)
        .map(r => r.subject)
      const effectiveDislikes = [...(params.dislikedFoods ?? []), ...slotTimingDislikes]
      const option = verifyProposal(proposal, slot, budget, params.dietaryPreferences, rejectionLog, effectiveDislikes)
      if (option) accepted[slot]!.push(option)
    }
  }

  const shortfalls = activeSlots
    .map(slot => ({ slot, requested: poolSize, filled: accepted[slot]?.length ?? 0 }))
    .filter(s => s.filled < s.requested)

  if (shortfalls.length > 0) {
    console.warn('generateMealPools: some slots did not reach target pool size', shortfalls, rejectionLog)
  }

  await persistPools(params.profileId, accepted)

  return { accepted, rejectionLog, shortfalls }
}

/** Replaces a profile's stored pool for each touched slot with the newly accepted options. */
async function persistPools(profileId: string, accepted: Partial<Record<MealSlotName, PoolOption[]>>): Promise<void> {
  for (const [slot, options] of Object.entries(accepted) as [MealSlotName, PoolOption[]][]) {
    if (options.length === 0) continue

    await supabase.from('meal_plan_slots').delete().eq('profile_id', profileId).eq('slot', slot)

    const rows = options.map((opt, i) => ({
      profile_id: profileId,
      slot,
      pool_index: i,
      name: opt.name,
      ingredients: opt.ingredients,
      macros: { kcal: opt.macros.calories, protein: opt.macros.protein, carbs: opt.macros.carbs, fat: opt.macros.fat },
      tags: opt.tags,
    }))
    const { error } = await supabase.from('meal_plan_slots').insert(rows)
    if (error) console.error(`Failed to persist pool for slot ${slot}:`, error)
  }
}

// ---------------------------------------------------------------------------
// DAY ASSEMBLY (M1 Part 4) — pick one option per slot that hits the day's
// totals, not just each slot's own budget in isolation. Slot budgets are
// derived from a fixed ratio split, so a pool option that's individually
// within its slot's ±7% tolerance can still combine with others into a day
// that's off — this is the actual daily-total gate, at the tighter ±5%
// calories / >=95% protein tolerance the day as a whole must meet.
// ---------------------------------------------------------------------------

export const DAY_CALORIE_TOLERANCE = 0.05
export const DAY_PROTEIN_FLOOR_RATIO = 0.95

export interface AssembledDay {
  /** One chosen option per active slot. */
  chosen: Partial<Record<MealSlotName, PoolOption>>
  totals: MacroTargets
  withinTolerance: boolean
  /** The full pools passed in, so the UI can offer swaps against every alternative, not just the chosen option. */
  alternatives: Partial<Record<MealSlotName, PoolOption[]>>
}

function sumOptionMacros(options: PoolOption[]): MacroTargets {
  return options.reduce(
    (acc, o) => ({
      calories: acc.calories + o.macros.calories,
      protein: acc.protein + o.macros.protein,
      carbs: acc.carbs + o.macros.carbs,
      fat: acc.fat + o.macros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function dayWithinTolerance(totals: MacroTargets, targets: MacroTargets): boolean {
  if (targets.calories <= 0) return true
  const calOk = Math.abs(totals.calories - targets.calories) / targets.calories <= DAY_CALORIE_TOLERANCE
  const proteinOk = targets.protein <= 0 || totals.protein >= targets.protein * DAY_PROTEIN_FLOOR_RATIO
  return calOk && proteinOk
}

/**
 * Picks one option per active slot from `pools` to land the day's totals
 * within ±5% calories and >=95% protein of `targets`. Pools are small (a few
 * options per slot), so this is a full cartesian search over every
 * combination rather than a heuristic — cheap and exact. Among combinations
 * that hit tolerance, and as a tiebreak among all combinations otherwise,
 * prefers ones that don't repeat a name in `recentNames` (best-effort day-to-
 * day variety; a slot whose entire pool was used recently can still repeat —
 * this is a preference, not a hard constraint the pool must satisfy).
 *
 * If NO combination reaches tolerance, applies one bounded proportional
 * scale to the day's single largest-calorie slot (closing exactly the gap
 * the OTHER chosen slots leave) rather than shipping an out-of-tolerance day
 * or perturbing every slot's choice. If even that scale would be absurd
 * (>2.5x/<0.4x), the closest combination ships as-is with withinTolerance:false
 * — an honest miss, not a forced number.
 */
export function assembleDay(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  targets: MacroTargets,
  recentNames: Partial<Record<MealSlotName, string[]>> = {},
): AssembledDay {
  const slots = (Object.keys(pools) as MealSlotName[]).filter(s => (pools[s]?.length ?? 0) > 0)

  if (slots.length === 0) {
    return { chosen: {}, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, withinTolerance: false, alternatives: pools }
  }

  type BestCombo = { combo: Partial<Record<MealSlotName, PoolOption>>; totals: MacroTargets; score: number }
  // Held in a wrapper object (not a bare `let`) so TS's control-flow narrowing
  // doesn't get confused by the closure below mutating it across calls.
  const state: { best: BestCombo | null } = { best: null }

  function search(index: number, combo: Partial<Record<MealSlotName, PoolOption>>): void {
    if (index === slots.length) {
      const chosenOptions = slots.map(s => combo[s]!)
      const totals = sumOptionMacros(chosenOptions)
      const calDiff = targets.calories > 0 ? Math.abs(totals.calories - targets.calories) / targets.calories : 0
      const proteinDeficit = Math.max(0, targets.protein - totals.protein)
      const repeatsAny = slots.some(s => recentNames[s]?.includes(combo[s]!.name))
      // Cuisine coherence (meal-realism round): each slot's pool already
      // caps at one exotic option, but nothing previously stopped a day from
      // picking THAT exotic option in every slot at once. Soft tiebreak only
      // — a day with 2+ exotic picks is a mild penalty, not excluded, since
      // calorie/protein fit always wins first.
      const exoticSlots = slots.filter(s => isExoticOption(combo[s]!)).length
      const exoticPenalty = exoticSlots > 1 ? (exoticSlots - 1) * 0.005 : 0
      // Lower score wins: calorie closeness dominates, protein shortfall is a
      // smaller nudge (already gated at the pipeline level, rarely large
      // here), and a same-as-recent combo or multi-exotic day is only a mild
      // tiebreak penalty — variety/coherence are preferences, never worth
      // shipping a worse-fitting day for.
      const score = calDiff + proteinDeficit * 0.002 + (repeatsAny ? 0.01 : 0) + exoticPenalty
      if (!state.best || score < state.best.score) state.best = { combo: { ...combo }, totals, score }
      return
    }
    for (const option of pools[slots[index]]!) {
      combo[slots[index]] = option
      search(index + 1, combo)
    }
  }
  search(0, {})

  if (!state.best) {
    return { chosen: {}, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, withinTolerance: false, alternatives: pools }
  }

  let chosen = state.best.combo
  let totals = state.best.totals
  let withinTolerance = dayWithinTolerance(totals, targets)

  if (!withinTolerance) {
    const entries = Object.entries(chosen) as [MealSlotName, PoolOption][]
    const [largestSlot, largestOption] = entries.reduce((a, b) => (b[1].macros.calories > a[1].macros.calories ? b : a))

    const othersTotal = sumOptionMacros(entries.filter(([s]) => s !== largestSlot).map(([, o]) => o))
    const neededForLargest: Macros100g = {
      kcal: Math.max(0, targets.calories - othersTotal.calories),
      protein: Math.max(0, targets.protein - othersTotal.protein),
      carbs: Math.max(0, targets.carbs - othersTotal.carbs),
      fat: Math.max(0, targets.fat - othersTotal.fat),
    }

    const scaleResult = scaleToTarget(
      largestOption.ingredients,
      { kcal: largestOption.macros.calories, protein: largestOption.macros.protein, carbs: largestOption.macros.carbs, fat: largestOption.macros.fat },
      neededForLargest,
    )

    if (!scaleResult.rejectedReason) {
      const recomputed = computeMealMacros(scaleResult.ingredients)
      const adjustedOption: PoolOption = { ...largestOption, ingredients: scaleResult.ingredients, macros: macrosToTargets(recomputed) }
      chosen = { ...chosen, [largestSlot]: adjustedOption }
      totals = sumOptionMacros(Object.values(chosen) as PoolOption[])
      withinTolerance = dayWithinTolerance(totals, targets)
    }
  }

  return { chosen, totals, withinTolerance, alternatives: pools }
}

/**
 * Adapts today's assembled picks into the legacy MealPlanDay[] shape the
 * chat context and its offline canned-response fallback (chat-assistant.ts)
 * already consume — keeps those two modules untouched by the M1 pool-model
 * rewrite rather than rippling the shape change through them too.
 */
export function chosenToMealPlanDays(chosen: Partial<Record<MealSlotName, PoolOption>>): import('./types').MealPlanDay[] {
  const SLOT_ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
  return SLOT_ORDER.filter(s => chosen[s]).map(slot => {
    const option = chosen[slot]!
    return {
      meal: slot.charAt(0).toUpperCase() + slot.slice(1),
      items: [{
        name: option.name,
        calories: Math.round(option.macros.calories),
        protein: Math.round(option.macros.protein),
        carbs: Math.round(option.macros.carbs),
        fat: Math.round(option.macros.fat),
        portion_size: option.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`).join(', '),
        prep: '',
        substitution: '',
        ingredients: option.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`),
        // Unlike M0's ban on this field (the old Edamam-verification claim
        // was fictional), true here is honest: this macro figure passed the
        // real food-db + diet-rules + portion-scaler pipeline. This adapter
        // output is chat-context-only, never persisted or shown as a badge.
        is_verified: true,
      }],
    }
  })
}
