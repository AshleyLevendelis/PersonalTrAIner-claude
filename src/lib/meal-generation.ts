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
import { containsPhrase } from './meal-ingredients'
import { parseIngredientLines, scaleToTarget, isWithinCalorieTolerance, meetsProteinFloor } from './portion-scaler'
import type { MacroTargets, CookingTimePreference, BreakfastStyle } from './types'
import { getPools, USER_REQUESTED_TAG, type MealSlotName } from './meal-store'

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
 * 4-meal profiles already have a snack slot in their base ratios, so an
 * explicit "no snacks" there does the symmetric thing — removes it and gives
 * its share back to the other slots, rather than being silently ignored.
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
  } else if (includeSnacks === false && ratios.snack != null) {
    // Only mealsPerDay=4 reaches here (2/3 never carry a base snack slot, so
    // this branch is a no-op for them either way). A profile that explicitly
    // declined snacks was still getting BASE_RATIOS[4]'s hardcoded 15% snack
    // — measured live, not theoretical. Redistribute it proportionally
    // across the remaining slots, the mirror image of the add path above.
    const snackShare = ratios.snack
    const nonSnackEntries = (Object.entries(ratios) as [MealSlotName, number][]).filter(([slot]) => slot !== 'snack')
    const nonSnackTotal = nonSnackEntries.reduce((sum, [, r]) => sum + r, 0)
    const redistributed: Partial<Record<MealSlotName, number>> = {}
    for (const [slot, r] of nonSnackEntries) {
      redistributed[slot] = r + (r / nonSnackTotal) * snackShare
    }
    ratios = redistributed
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
  profileId: string,
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
    // Surfacing round — this used to swallow EVERY failure (non-ok HTTP,
    // network exception, abort/timeout, malformed body) into a bare `[]`,
    // which made "the AI genuinely proposed nothing" and "the call never
    // happened" indistinguishable to every caller above this function. Now
    // only a genuinely empty/malformed `meals` array resolves to `[]` — that
    // IS a completed call, just one with nothing usable in it. Everything
    // else throws, so generateMealPools' generatorReached flag means what it
    // says: at least one round's call actually completed.
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Keys the per-caller side of the spend cap (audit §1.3). Without it
        // every request from every user counts against one shared IP bucket,
        // which would throttle a household or an office off one person's use.
        profile_id: profileId,
        slots,
        dietary_preferences: dietaryPreferences,
        cooking_time_preference: cookingTimePreference,
        favorite_cuisines: favoriteCuisines,
        disliked_foods: dislikedFoods,
        breakfast_style: breakfastStyle,
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`generate-meals responded ${response.status}`)
    const data = await response.json()
    return Array.isArray(data.meals) ? data.meals : []
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
  /**
   * Surfacing round — mirrors rejectLog's shared-mutable-array idiom rather
   * than widening the return type, since there's a single call site. A Set
   * because every proposal in every round hits the identical unrecognised
   * value(s) for as long as the profile stays broken — generateMealPools
   * dedupes for free by using one Set across the whole run.
   */
  unrecognisedOut?: Set<string>,
  /**
   * CUSTOM-MEAL MODE — the user's own stated portions are facts, not
   * suggestions (Ashley, 1 Sep 2026: the app should ask how much of each
   * food she's having and calculate, not decide for her). keepPortions
   * skips exactly two stages: scaleToTarget, and the slot-budget calorie/
   * protein bands — the day-level rebalance in assembleDay (pinned slots)
   * is what fits the rest of the day around this meal instead.
   *
   * WHAT IT NEVER SKIPS, and the reason the mode lives INSIDE this function
   * rather than beside it: ingredient resolution, the coverage floor, the
   * dislike filter and validateMealAgainstDiet. A parallel "custom" path
   * with its own subset of the checks is how the almond butter got through
   * the swap path — one pipeline, one place to be wrong.
   *
   * checkSlotAppropriate is also skipped in this mode: it polices what the
   * GENERATOR proposes for a slot, and the user's own usual breakfast is
   * not the generator's business.
   */
  keepPortions = false,
): PoolOption | null {
  const parsed = parseIngredientLines(proposal.ingredients)
  if (parsed.length === 0) {
    rejectLog.push(`[${slot}] "${proposal.name}": no ingredients parsed`)
    return null
  }

  const slotIssue = keepPortions ? null : checkSlotAppropriate(proposal.name, proposal.prep, slot, parsed.length)
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
    // ONE matcher, shared with the coach's reader and the swap path.
    // This was its own inline `n.includes(food)` — a third copy of the rule,
    // and the one that decided what got GENERATED. When containsPhrase
    // learned plurals and category words (audit §2.3) this copy would not
    // have, so "no dairy" would have kept cheese out of a swap and let it
    // straight into a freshly generated pool. Two copies of a filter is how
    // the almond butter got through; three would have been worse.
    const names = parsed.map(l => l.name)
    const hit = dislikedFoods.find(food => food.trim() && containsPhrase(proposal.name, names, food))
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
    // An unrecognised restriction is a DATA problem, not a bad proposal —
    // every meal will fail identically until the value is fixed, so it gets
    // its own message rather than being buried in a per-meal violation list
    // that reads like generation just kept getting unlucky.
    if (dietResult.unrecognisedPreferences.length > 0) {
      rejectLog.push(`[${slot}] unrecognised dietary restriction(s): ${dietResult.unrecognisedPreferences.join(', ')} — nothing can be generated until these are corrected in Profile.`)
      for (const p of dietResult.unrecognisedPreferences) unrecognisedOut?.add(p)
      return null
    }
    rejectLog.push(`[${slot}] "${proposal.name}": diet violation(s) — ${dietResult.violations.map(v => v.reason).join('; ')}`)
    return null
  }

  if (keepPortions) {
    // As stated, exactly. The macros are computeMealMacros' answer for the
    // user's own quantities — 3 eggs stay 3 eggs whatever the slot budget
    // says. No post-scale re-checks either: nothing was scaled.
    return {
      slot,
      name: proposal.name,
      ingredients: parsed,
      macros: macrosToTargets(computed),
      tags: [proposal.cuisine, 'own recipe'].filter(Boolean),
    }
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
  // A per-meal protein ceiling was tried here and reverted: an earlier round
  // of the generate-meals prompt steered every proposal to MAXIMISE protein
  // density, so a same-ratio ceiling rejected the large majority of
  // proposals and collapsed pool sizes app-wide (confirmed live: 86 -> 52
  // accepted options, pool_size failures 2 -> 23). The macro-accuracy round
  // reframed that prompt guidance around hitting the stated target rather
  // than maximising it (see macroTargetGuidance in generate-meals/index.ts),
  // which reduces the root cause without needing a per-meal gate here — the
  // day-level band in assembleDay (DAY_PROTEIN_UPPER_RATIO) is still the
  // actual backstop against whatever overshoot gets through.

  const prepBand = /\b(1[0-5]|[1-9])\s*(min|minute)/i.test(proposal.prep) ? 'quick' : proposal.prep.length > 0 ? 'standard' : 'unspecified'

  return {
    slot,
    name: proposal.name,
    ingredients: scaled.ingredients,
    macros: macrosToTargets(finalComputed),
    // Fixed order: [cuisine, prepBand]. This array is rendered directly as
    // chips in MealPlan.tsx (fix 4.5, ux-sweep) — keyProtein's raw
    // ingredient name and a literal 'slot_appropriate' marker used to be
    // appended here too, with nothing anywhere actually reading either one
    // back out (confirmed: no tags[2]/tags[3] consumer exists), so they
    // existed purely to leak into the UI as meaningless chips. Every option
    // reaching here already passed checkSlotAppropriate above regardless.
    tags: [proposal.cuisine, prepBand].filter(Boolean),
  }
}

export interface GenerateMealPoolsResult {
  accepted: Partial<Record<MealSlotName, PoolOption[]>>
  rejectionLog: string[]
  shortfalls: { slot: MealSlotName; requested: number; filled: number }[]
  /** Surfacing round — every DietValidationResult.unrecognisedPreferences value seen across the whole run, deduped, sorted. Empty when nothing was unrecognised. */
  unrecognisedPreferences: string[]
  /**
   * True the moment any round's generate-meals call completes (with or
   * without usable meals in the response) — false only if every round's call
   * threw. This is what lets a caller tell "the generator ran, and honestly
   * couldn't fit your targets" (deterministic — retrying won't help, loosen
   * something) apart from "the generator was unreachable" (transient —
   * retrying might help). Before this, both collapsed into the same silent
   * `[]`.
   */
  generatorReached: boolean
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
  /**
   * ADD to the slot's existing pool instead of replacing it — the "you've seen
   * them all, want me to find some new ones?" path. The default (false) is a
   * regenerate: persistPools deletes the slot's rows first, which is right
   * when the user asked for a fresh set and catastrophic when they asked for
   * MORE. With this set, the existing options are loaded up front so the
   * duplicate-name and cuisine-coherence checks see them too — otherwise
   * "find me something new" could return the four meals already sitting there.
   */
  appendToExisting?: boolean
}): Promise<GenerateMealPoolsResult> {
  const poolSize = params.poolSize ?? DEFAULT_POOL_SIZE
  const budgets = computeSlotBudgets(params.targets, params.mealsPerDay, params.includeSnacks)
  const activeSlots = (Object.keys(budgets) as MealSlotName[]).filter(
    s => !params.onlySlots || params.onlySlots.includes(s)
  )

  // What they already have, when appending. Never written back — only used to
  // stop the generator handing them the same meals again.
  const existingBySlot: Partial<Record<MealSlotName, PoolOption[]>> = params.appendToExisting
    ? await getPools(params.profileId)
    : {}

  const accepted: Partial<Record<MealSlotName, PoolOption[]>> = {}
  const rejectionLog: string[] = []
  const unrecognisedPreferences = new Set<string>()
  let generatorReached = false
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

    // Surfacing round — requestProposals now throws on a genuine infra
    // failure instead of silently resolving to []. Caught HERE (not left to
    // propagate out of generateMealPools) so one bad round doesn't lose
    // whatever earlier rounds already accepted — MAX_GENERATION_ROUNDS
    // already exists to smooth over exactly this kind of transient blip.
    let proposals: RawProposal[] = []
    try {
      proposals = await requestProposals(
        requestCounts,
        budgets,
        params.dietaryPreferences,
        params.cookingTimePreference,
        params.favoriteCuisines ?? [],
        params.dislikedFoods ?? [],
        params.breakfastStyle,
        params.profileId,
      )
      generatorReached = true
    } catch (err) {
      rejectionLog.push(`[round ${round + 1}] generate-meals call failed: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    for (const proposal of proposals) {
      const slot = proposal.slot as MealSlotName
      if (!activeSlots.includes(slot)) continue
      if ((accepted[slot]?.length ?? 0) >= poolSize) continue

      const budget = budgets[slot]
      if (!budget) continue

      const existing = existingBySlot[slot] ?? []
      const isExoticProposal = EXOTIC_CUISINES.has(proposal.cuisine)
      const poolAlreadyHasExotic = (accepted[slot]?.some(isExoticOption) ?? false) || existing.some(isExoticOption)
      if (isExoticProposal && poolAlreadyHasExotic) {
        rejectionLog.push(`[${slot}] "${proposal.name}": pool already has an exotic-cuisine option — cuisine coherence cap (${proposal.cuisine})`)
        continue
      }

      // Fix 4.3 (ux-sweep) — nothing here checked for a same-named proposal
      // already in the pool, so a proposal round could (and did, live) add
      // "Greek Yoghurt Pancakes" twice at slightly different kcal, which
      // then broke the swap UI downstream: its by-name filter for "options
      // other than the chosen one" only strips ONE reading of a duplicate
      // name, so the other duplicate survived as an "option" that was
      // actually just the meal already showing, with a stale delta against
      // itself, and the "N options" count coming out of the same list —
      // wrong in lockstep with it. Rejecting the duplicate at its actual
      // source keeps that whole downstream chain honest without needing to
      // special-case it again at render time.
      const normalizedName = proposal.name.trim().toLowerCase()
      if (accepted[slot]?.some(o => o.name.trim().toLowerCase() === normalizedName)
        || existing.some(o => o.name.trim().toLowerCase() === normalizedName)) {
        rejectionLog.push(`[${slot}] "${proposal.name}": duplicate name already in this slot's pool`)
        continue
      }

      const slotTimingDislikes = (params.timingRules ?? [])
        .filter(r => r.anchor === 'slot' && r.slot === slot)
        .map(r => r.subject)
      const effectiveDislikes = [...(params.dislikedFoods ?? []), ...slotTimingDislikes]
      const option = verifyProposal(proposal, slot, budget, params.dietaryPreferences, rejectionLog, effectiveDislikes, unrecognisedPreferences)
      if (option) accepted[slot]!.push(option)
    }
  }

  const shortfalls = activeSlots
    .map(slot => ({ slot, requested: poolSize, filled: accepted[slot]?.length ?? 0 }))
    .filter(s => s.filled < s.requested)

  if (shortfalls.length > 0) {
    console.warn('generateMealPools: some slots did not reach target pool size', shortfalls, rejectionLog)
  }

  if (params.appendToExisting) await appendPools(params.profileId, accepted, existingBySlot)
  else await persistPools(params.profileId, accepted)

  return { accepted, rejectionLog, shortfalls, unrecognisedPreferences: [...unrecognisedPreferences].sort(), generatorReached }
}

/**
 * Adds newly accepted options ON TOP of what the slot already holds, at the
 * next pool_index. The counterpart to persistPools, and deliberately a
 * separate function rather than a flag inside it: the difference between the
 * two is a DELETE, and a flag that decides whether a user's meals survive is
 * one misread argument away from wiping them.
 */
async function appendPools(
  profileId: string,
  accepted: Partial<Record<MealSlotName, PoolOption[]>>,
  existing: Partial<Record<MealSlotName, PoolOption[]>>,
): Promise<void> {
  for (const [slot, options] of Object.entries(accepted) as [MealSlotName, PoolOption[]][]) {
    if (options.length === 0) continue
    const base = existing[slot]?.length ?? 0
    const rows = options.map((opt, i) => ({
      profile_id: profileId,
      slot,
      pool_index: base + i,
      name: opt.name,
      ingredients: opt.ingredients,
      macros: { kcal: opt.macros.calories, protein: opt.macros.protein, carbs: opt.macros.carbs, fat: opt.macros.fat },
      tags: opt.tags,
    }))
    const { error } = await supabase.from('meal_plan_slots').insert(rows)
    if (error) console.error(`Failed to append pool options for slot ${slot}:`, error)
  }
}

/** Replaces a profile's stored pool for each touched slot with the newly accepted options. */
async function persistPools(profileId: string, accepted: Partial<Record<MealSlotName, PoolOption[]>>): Promise<void> {
  for (const [slot, options] of Object.entries(accepted) as [MealSlotName, PoolOption[]][]) {
    if (options.length === 0) continue

    // MEALS THE USER ASKED FOR SURVIVE THE DELETE. Read them out before
    // wiping the slot and re-insert them after the new options.
    //
    // Ashley, 3 Sep 2026: she asked the coach for steak, it was added, then
    // "Regenerate all" replaced the whole pool and the steak was gone. Her
    // ruling: regeneration replaces what the APP suggested, not what she
    // asked for by name. This is the one place the delete happens, so fixing
    // it here means regenerate-all and regenerate-one-slot both honour that
    // — rather than one button keeping her meals and the other not.
    // Filtered in JS rather than with a .contains() array predicate. The
    // first cut used .contains('tags', [...]) — correct against Postgres, but
    // the test harness's Supabase mock has no such method, so every meal gate
    // crashed and the quality sweep produced empty pools. A predicate the
    // suite cannot execute is one the suite cannot check; reading the slot's
    // rows and filtering here needs nothing beyond .select().eq(), which
    // every path already relies on.
    const { data: keepRows } = await supabase
      .from('meal_plan_slots')
      .select('name, ingredients, macros, tags')
      .eq('profile_id', profileId)
      .eq('slot', slot)
    const keep = (keepRows ?? []).filter(
      (row: { tags?: string[] | null }) => (row.tags ?? []).includes(USER_REQUESTED_TAG),
    )

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
    // Appended AFTER the fresh options, keeping pool_index contiguous. Their
    // macros are re-inserted exactly as stored — a meal she chose is not
    // re-costed or re-portioned behind her back.
    const keptRows = keep.map((row, i) => ({
      profile_id: profileId,
      slot,
      pool_index: options.length + i,
      name: row.name,
      ingredients: row.ingredients,
      macros: row.macros,
      tags: row.tags,
    }))
    const { error } = await supabase.from('meal_plan_slots').insert([...rows, ...keptRows])
    if (error) console.error(`Failed to persist pool for slot ${slot}:`, error)
  }
}

// ---------------------------------------------------------------------------
// DAY ASSEMBLY (M1 Part 4) — pick one option per slot that hits the day's
// totals, not just each slot's own budget in isolation. Slot budgets are
// derived from a fixed ratio split, so a pool option that's individually
// within its slot's ±7% tolerance can still combine with others into a day
// that's off — this is the actual daily-total gate, at the tighter per-macro
// bands below the day as a whole must meet.
//
// Macro-accuracy round: assembleDay used to be calorie-aware with protein as
// a one-sided FLOOR (never penalised for overshooting) — the QA sweep found
// this let assembled days land up to ~1.7x over target protein while
// calories still looked fine, because nothing in the selection score or the
// repair-scale gate ever pushed back on going too high, only too low. It's
// now macro-aware across all four numbers: calories keep the tightest band
// (the headline number), protein gets a real two-sided band, carbs/fat get
// looser bands (they're the numbers meant to flex first — see the generation
// prompt's own "hit all three macros" framing). If no combination reaches
// every band, the closest combination ships as an honest miss
// (withinTolerance: false) rather than silently accepting a wild overshoot.
// ---------------------------------------------------------------------------
export const DAY_CALORIE_TOLERANCE = 0.05
export const DAY_PROTEIN_LOWER_RATIO = 0.95
export const DAY_PROTEIN_UPPER_RATIO = 1.15
export const DAY_CARB_TOLERANCE = 0.25
export const DAY_FAT_TOLERANCE = 0.25
/** @deprecated kept as an alias so any external reader of the old name still resolves — use DAY_PROTEIN_LOWER_RATIO. */
export const DAY_PROTEIN_FLOOR_RATIO = DAY_PROTEIN_LOWER_RATIO

export interface AssembledDay {
  /** One chosen option per active slot. */
  chosen: Partial<Record<MealSlotName, PoolOption>>
  totals: MacroTargets
  withinTolerance: boolean
  /** The full pools passed in, so the UI can offer swaps against every alternative, not just the chosen option. */
  alternatives: Partial<Record<MealSlotName, PoolOption[]>>
  /** Requested slots (a key in `pools`) whose pool came back empty — generation
   * produced zero valid options. These are NEVER silently folded into another
   * slot's portions; the UI must render an honest "couldn't generate this
   * meal" state with a retry, not a plausible-looking day quietly missing a
   * meal's worth of food. */
  missingSlots: MealSlotName[]
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

function relDiff(actual: number, target: number): number {
  return target > 0 ? Math.abs(actual - target) / target : 0
}

function dayWithinTolerance(totals: MacroTargets, targets: MacroTargets): boolean {
  if (targets.calories <= 0) return true
  const calOk = relDiff(totals.calories, targets.calories) <= DAY_CALORIE_TOLERANCE
  const proteinOk = targets.protein <= 0 || (totals.protein >= targets.protein * DAY_PROTEIN_LOWER_RATIO && totals.protein <= targets.protein * DAY_PROTEIN_UPPER_RATIO)
  const carbOk = relDiff(totals.carbs, targets.carbs) <= DAY_CARB_TOLERANCE
  const fatOk = relDiff(totals.fat, targets.fat) <= DAY_FAT_TOLERANCE
  return calOk && proteinOk && carbOk && fatOk
}

/**
 * Weighted relative distance across all four macros — lower is better fit.
 * Calories dominate (the headline number, tightest band), protein is
 * weighted second (the macro users actually track), carbs/fat matter least
 * (loosest bands, meant to flex). Symmetric in both directions: overshooting
 * protein costs the same as undershooting it by the same ratio — the old
 * scoring only penalised a shortfall (`Math.max(0, target - actual)`), which
 * is exactly why nothing ever pushed back on the QA sweep's ~1.7x overshoot.
 */
function macroDistanceScore(totals: MacroTargets, targets: MacroTargets): number {
  return relDiff(totals.calories, targets.calories) * 1.0
    + relDiff(totals.protein, targets.protein) * 0.6
    + relDiff(totals.carbs, targets.carbs) * 0.25
    + relDiff(totals.fat, targets.fat) * 0.25
}

/**
 * How much a day that works in nothing the user has said they LIKE is
 * penalised. Same magnitude as the day-to-day repeat penalty above it, and
 * for the same reason: a soft preference is a tiebreak between days that fit
 * equally well, never a reason to ship a worse-fitting day. A 5% calorie miss
 * already scores 0.05, five times this — so macro fit always wins.
 */
export const SOFT_FOOD_MISS_PENALTY = 0.01

/**
 * Does this dish involve something they said they liked?
 *
 * Matches the option's NAME as well as its ingredients, which is deliberately
 * WIDER than the hard dislike filter in verifyProposal (ingredients only), and
 * the asymmetry is the point: a soft like is a nudge where a false positive
 * costs nothing, while a hard dislike is a filter where a false positive takes
 * food off someone's plate that they would happily have eaten. A like is also
 * far more likely to name a dish than an ingredient — "I love a curry",
 * "porridge is my go-to" — and a preference that can never match anything is
 * worse than not collecting it.
 */
function optionMatchesLikedFood(option: PoolOption, liked: string[]): boolean {
  if (liked.length === 0) return false
  const name = option.name.toLowerCase()
  const ingredientNames = option.ingredients.map(i => i.name.toLowerCase())
  return liked.some(food => {
    const f = food.trim().toLowerCase()
    return f.length > 0 && (name.includes(f) || ingredientNames.some(n => n.includes(f)))
  })
}

/**
 * Picks one option per active slot from `pools` to best match the day's
 * targets across all four macros: calories within ±5%, protein within
 * −5%/+15% (a real two-sided band, not a one-sided floor), carbs and fat
 * within a looser ±25% each (see dayWithinTolerance/macroDistanceScore).
 * Pools are small (a few options per slot), so this is a full cartesian
 * search over every combination rather than a heuristic — cheap and exact.
 * Among combinations that hit every band, and as a tiebreak among all
 * combinations otherwise, prefers ones that don't repeat a name in
 * `recentNames` (best-effort day-to-day variety; a slot whose entire pool was
 * used recently can still repeat — this is a preference, not a hard
 * constraint the pool must satisfy).
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
  /**
   * Soft food LIKES (compileSoftFoodPreferences) — a tiebreak, nothing more.
   * VISION-ARCHITECTURE.md §1.2 always named this as the consumer; until now
   * the compiler had zero call sites, so "I love salmon" was recorded, shown
   * back in the memory screen, and read by nothing. Hard dislikes are a
   * different channel entirely (verifyProposal's dislikedFoods filter) and are
   * unaffected by this.
   */
  softLikedFoods: string[] = [],
  /**
   * PINNED SLOTS — the "plan the rest of my meals" half (Ashley, 1 Sep
   * 2026). A pinned slot's option is the only candidate for that slot, so
   * the cartesian search below optimises the FREE slots to land the whole
   * day inside the same tolerance bands — the pin's macros count toward the
   * day like any other meal, they just aren't negotiable.
   *
   * Until this existed, a manual pick was overlaid AFTER assembly
   * (App.tsx), so the other slots were chosen as if the swap had never
   * happened and the day's totals quietly drifted. That applied to every
   * manual swap, not just custom meals — one model now, not two.
   *
   * The repair-scale below must never touch a pinned slot: a custom meal's
   * quantities are the user's own stated facts, and "we adjusted your
   * breakfast" is exactly what this feature promises not to do.
   */
  pinned: Partial<Record<MealSlotName, PoolOption>> = {},
): AssembledDay {
  const requestedSlots = Object.keys(pools) as MealSlotName[]
  const slots = requestedSlots.filter(s => (pools[s]?.length ?? 0) > 0 || pinned[s] != null)
  const missingSlots = requestedSlots.filter(s => (pools[s]?.length ?? 0) === 0 && pinned[s] == null)

  if (slots.length === 0) {
    return { chosen: {}, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, withinTolerance: false, alternatives: pools, missingSlots }
  }

  type BestCombo = { combo: Partial<Record<MealSlotName, PoolOption>>; totals: MacroTargets; score: number }
  // Held in a wrapper object (not a bare `let`) so TS's control-flow narrowing
  // doesn't get confused by the closure below mutating it across calls.
  const state: { best: BestCombo | null } = { best: null }

  function search(index: number, combo: Partial<Record<MealSlotName, PoolOption>>): void {
    if (index === slots.length) {
      const chosenOptions = slots.map(s => combo[s]!)
      const totals = sumOptionMacros(chosenOptions)
      const repeatsAny = slots.some(s => recentNames[s]?.includes(combo[s]!.name))
      // Cuisine coherence (meal-realism round): each slot's pool already
      // caps at one exotic option, but nothing previously stopped a day from
      // picking THAT exotic option in every slot at once. Soft tiebreak only
      // — a day with 2+ exotic picks is a mild penalty, not excluded, since
      // calorie/protein fit always wins first.
      const exoticSlots = slots.filter(s => isExoticOption(combo[s]!)).length
      const exoticPenalty = exoticSlots > 1 ? (exoticSlots - 1) * 0.005 : 0
      // Lower score wins: macroDistanceScore weighs all four macros
      // (calories dominant, protein second, carbs/fat loosest), and a
      // same-as-recent combo or multi-exotic day is only a mild tiebreak
      // penalty — variety/coherence are preferences, never worth shipping a
      // worse-fitting day for.
      // At least ONE liked thing in the day, not as many as possible: someone
      // who says they love salmon wants salmon once, not at every meal.
      const missesEveryLikedFood = softLikedFoods.length > 0
        && !slots.some(s => optionMatchesLikedFood(combo[s]!, softLikedFoods))
      const score = macroDistanceScore(totals, targets) + (repeatsAny ? 0.01 : 0) + exoticPenalty
        + (missesEveryLikedFood ? SOFT_FOOD_MISS_PENALTY : 0)
      if (!state.best || score < state.best.score) state.best = { combo: { ...combo }, totals, score }
      return
    }
    const slot = slots[index]
    const candidates = pinned[slot] != null ? [pinned[slot]!] : pools[slot]!
    for (const option of candidates) {
      combo[slot] = option
      search(index + 1, combo)
    }
  }
  search(0, {})

  if (!state.best) {
    return { chosen: {}, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, withinTolerance: false, alternatives: pools, missingSlots }
  }

  let chosen = state.best.combo
  let totals = state.best.totals
  let withinTolerance = dayWithinTolerance(totals, targets)

  // The repair scale below only ever redistributes calories AMONG slots that
  // actually have real options — it must never run when a slot is missing
  // entirely, or it silently folds that slot's whole calorie (and implicitly
  // protein) budget into whatever dish happens to be largest, which is
  // exactly the "day quietly short a meal but reads as fine" bug this
  // function must not produce. A missing slot always ships as an honest
  // out-of-tolerance day instead.
  if (!withinTolerance && missingSlots.length === 0) {
    const entries = Object.entries(chosen) as [MealSlotName, PoolOption][]
    // Only unpinned slots are candidates for repair — see pinned's doc
    // comment. A day that misses tolerance with every free slot already
    // optimal ships as the honest miss rather than editing the user's meal.
    const repairable = entries.filter(([s]) => pinned[s] == null)
    if (repairable.length === 0) {
      return { chosen, totals, withinTolerance, alternatives: pools, missingSlots }
    }
    const [largestSlot, largestOption] = repairable.reduce((a, b) => (b[1].macros.calories > a[1].macros.calories ? b : a))

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
      const candidateChosen = { ...chosen, [largestSlot]: adjustedOption }
      const candidateTotals = sumOptionMacros(Object.values(candidateChosen) as PoolOption[])
      // scaleToTarget is calorie-only — it has no way to bound protein, carbs
      // or fat individually, so scaling one dish up to also cover a shortfall
      // elsewhere can land well past target on any of them. Accept the
      // repair only if it lands the day fully within every band, OR — when it
      // doesn't quite clear every band — if it's a strictly closer fit than
      // the unrepaired combo AND still respects the protein upper rail (never
      // trade a calorie fix for a protein blowout, the QA sweep's original
      // ~1.7x-overshoot failure mode). Otherwise the unrepaired combo ships
      // as the honest miss.
      const candidateWithinTolerance = dayWithinTolerance(candidateTotals, targets)
      const proteinRatio = targets.protein > 0 ? candidateTotals.protein / targets.protein : 1
      const isCloser = macroDistanceScore(candidateTotals, targets) < macroDistanceScore(totals, targets)
      if (candidateWithinTolerance || (isCloser && proteinRatio <= DAY_PROTEIN_UPPER_RATIO)) {
        chosen = candidateChosen
        totals = candidateTotals
        withinTolerance = candidateWithinTolerance
      }
    }
  }

  return { chosen, totals, withinTolerance, alternatives: pools, missingSlots }
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
