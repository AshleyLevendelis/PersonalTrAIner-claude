import type { RawProposal } from './meal-generation'
import type { MealSlotName } from './meal-store'
import type { CookingTimePreference } from './types'
import { containsPhrase } from './meal-ingredients'
import { parseIngredientLine, withQuantity, scaleToTarget, meetsProteinFloor, isWithinCalorieTolerance } from './portion-scaler'
import { computeMealMacros } from './food-db'
import type { MacroTargets } from './types'

// ---------------------------------------------------------------------------
// CHOOSING FROM THE MEAL LIBRARY (30 Sep 2026; docs/plans/meal-library.md).
//
// The library (meal-library-data.ts) holds original dishes and NO macros. This
// file decides which of them to OFFER a person asking for more, and nothing
// else: every dish it returns still goes through verifyProposal for that
// person (diet, dislikes, the food database, the slot's budget), exactly as a
// dish from the meal writer does. A chooser that could skip that would make
// the library a second, weaker route into the plan, which is the failure the
// whole pipeline exists to prevent ("one pipeline, one place to be wrong").
//
// PURE AND DETERMINISTIC. The same library and the same wants give the same
// dishes in the same order. Variety between one ask and the next comes from
// the pool she already has (a dish in it is never offered again) and from a
// rotation number that breaks ties differently each time, never from
// Math.random, so a gate can pin the behaviour and a bug can be reproduced.
// ---------------------------------------------------------------------------

export interface LibraryWants {
  slot: MealSlotName
  /** The dishes she already has in this meal: never offered again, and their cuisines are spread away from. */
  haveNames: readonly string[]
  haveCuisines: readonly string[]
  /** Cuisines a pool may hold only one of (the exotic cap); once she has one, or one is chosen, the rest sink. */
  exoticCuisines?: ReadonlySet<string>
  /** Onboarding's short labels ("Italian", "Thai"), matched inside the cuisine's full name the way the meal writer matches them. */
  favoriteCuisines?: readonly string[]
  cookingTime?: CookingTimePreference
  /** Foods she has said she likes. A hearted MEAL is not used: it names a dish, not an ingredient, and steering on it would be a guess. */
  likedFoods?: readonly string[]
  /** Changes between asks so ties break differently; the number of dishes she already has is a good one. */
  rotation?: number
  /** The meal's own budget. When given, each dish is first re-portioned to it (fitDishToBudget) and the ones that fit best rise. */
  budget?: MacroTargets
  /** Cap on how many are handed back. Left off, every dish for the meal is ranked and returned: the caller stops once it has enough, and a cap would cut before its diet and dislike checks had seen the dishes behind it. */
  limit?: number
}

// ---------------------------------------------------------------------------
// FITTING A DISH TO THE PERSON'S MEAL (30 Sep 2026).
//
// MEASURED BEFORE THIS EXISTED, and it is the reason it does: the library's
// first 188 dishes were written protein-dense, and verifyProposal only asks for
// the protein FLOOR, so they were all accepted and almost none could be served.
// Against six real targets a typical dish carried 1.2 to 2.1 times the meal's
// protein, while a day is only on target at 0.95 to 1.15 times
// (DAY_PROTEIN_UPPER_RATIO), so the day search could not use them: a top-up
// reported "added 6 new meals" and the week never showed one. That is the
// "seven dishes of which two fit is not seven options" trap, one layer earlier.
//
// A person's meal has a SHAPE (how much protein, carbs and fat a calorie
// carries) and that shape is wide: 5.3 to 7.9 g of protein per 100 kcal across
// the targets measured. One fixed recipe cannot be right for all of them, and a
// coach does not hand everybody the same plate; they move the rice and the
// chicken. So before a dish is offered, its PROTEIN foods and its CARB foods
// are re-portioned, within ranges a cook would call the same dish, to put its
// macros as near the meal's own budget as they can go. Vegetables, fats, sauces
// and every counted item (eggs, slices) stay as written. verifyProposal then
// scales the whole dish to the calorie budget and applies every rule, as ever.
// ---------------------------------------------------------------------------

const PROTEIN_FACTORS = Array.from({ length: 17 }, (_, i) => Math.round((0.55 + i * 0.05) * 100) / 100)
const CARB_FACTORS = Array.from({ length: 16 }, (_, i) => Math.round((0.5 + i * 0.1) * 100) / 100)
/** Aim a little over the protein target, so the floor still holds after amounts are rounded. */
const PROTEIN_AIM = 1.08

/** What the fit must leave room for: the scaler rounds every line, and a count (an egg, a slice) rounds to a whole one. */
const FIT_PROTEIN_MARGIN = 1.01
/** Half of verifyProposal's 7%: a fitted dish must land comfortably inside it, not on the edge. */
const FIT_CALORIE_TOLERANCE = 0.035
/** Candidates proved through the scaler's real code, best first. The first that holds is used. */
const FIT_PROVED = 8

export function fitDishToBudget(dish: RawProposal, budget: MacroTargets): { dish: RawProposal; loss: number } {
  const parsed = dish.ingredients.map(parseIngredientLine)
  const m = computeMealMacros(parsed)
  const fixed = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const prot = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const carb = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const role: ('P' | 'C' | 'F')[] = []
  m.lines.forEach((l, i) => {
    const unit = l.input.unit.toLowerCase()
    const scalable = l.entry !== null && l.macros !== null && (unit === 'g' || unit === 'ml')
    let r: 'P' | 'C' | 'F' = 'F'
    if (scalable) {
      const cat = l.entry!.category
      if (cat === 'protein' || (cat === 'dairy' && l.entry!.per100g.protein >= 8)) r = 'P'
      else if (cat === 'carb') r = 'C'
    }
    role[i] = r
    const into = r === 'P' ? prot : r === 'C' ? carb : fixed
    if (l.macros) { into.kcal += l.macros.kcal; into.protein += l.macros.protein; into.carbs += l.macros.carbs; into.fat += l.macros.fat }
  })
  const hasP = role.includes('P')
  const hasC = role.includes('C')
  if (budget.calories <= 0) return { dish, loss: Infinity }

  // 1. Every (protein factor, carb factor) pair, priced on a straight-line model of the dish.
  const tried: { a: number; b: number; loss: number }[] = []
  for (const a of hasP ? PROTEIN_FACTORS : [1]) {
    for (const b of hasC ? CARB_FACTORS : [1]) {
      const kcal = fixed.kcal + a * prot.kcal + b * carb.kcal
      if (kcal <= 0) continue
      // How far the dish is scaled is priced (the last term) and bounded by the scaler's own 0.4-2.5 in the proof below. A separate band here was measured: it moved 2 of 752 cases.
      const k = budget.calories / kcal
      const p = (k * (fixed.protein + a * prot.protein + b * carb.protein)) / Math.max(1, budget.protein)
      // The protein floor is not a preference. Below it the dish is refused, so no amount of a better carb or fat shape buys it back.
      if (p < FIT_PROTEIN_MARGIN) continue
      const c = (k * (fixed.carbs + a * prot.carbs + b * carb.carbs)) / Math.max(1, budget.carbs)
      const f = (k * (fixed.fat + a * prot.fat + b * carb.fat)) / Math.max(1, budget.fat)
      // Protein counts most: it is the ratio the day search is strictest about.
      const loss = 3 * (p - PROTEIN_AIM) ** 2 + (c - 1) ** 2 + (f - 1) ** 2 + 0.02 * ((a - 1) ** 2 + (b - 1) ** 2) + 0.05 * (k - 1) ** 2
      tried.push({ a, b, loss })
    }
  }
  tried.sort((x, y) => x.loss - y.loss)

  // 2. The best few are proved through the scaler's own functions: rounding (whole grams, whole eggs) moves protein by more than the model can see.
  const target = { kcal: budget.calories, protein: budget.protein, carbs: budget.carbs, fat: budget.fat }
  for (const cand of tried.slice(0, FIT_PROVED)) {
    const lines = cand.a === 1 && cand.b === 1 ? dish.ingredients : dish.ingredients.map((text, i) => {
      const factor = role[i] === 'P' ? cand.a : role[i] === 'C' ? cand.b : 1
      if (factor === 1) return text
      return withQuantity(text, Math.max(5, Math.round(parsed[i].quantity * factor))) ?? text
    })
    const fittedParsed = lines.map(parseIngredientLine)
    const fm = computeMealMacros(fittedParsed)
    const scaled = scaleToTarget(fittedParsed, { kcal: fm.kcal, protein: fm.protein, carbs: fm.carbs, fat: fm.fat }, target)
    if (scaled.rejectedReason) continue
    const after = computeMealMacros(scaled.ingredients)
    if (after.coverage < 1 || !meetsProteinFloor(after.protein, budget.protein * FIT_PROTEIN_MARGIN) || !isWithinCalorieTolerance(after.kcal, budget.calories, FIT_CALORIE_TOLERANCE)) continue
    return { dish: lines === dish.ingredients ? dish : { ...dish, ingredients: lines }, loss: cand.loss }
  }
  // Nothing held. Hand the dish back as written with the worst mark: verifyProposal still decides, and the chooser puts it last.
  return { dish, loss: Infinity }
}

const QUICK = /\b(1[0-5]|[1-9])\s*(min|minute)/i

/** A stable 0-1 from a name and a number. FNV-1a, then a murmur-style finish so nearby inputs do not stay nearby. */
function rotationHash(name: string, rotation: number): number {
  let h = 2166136261 ^ rotation
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const norm = (s: string) => s.trim().toLowerCase()

function cuisineIsFavourite(cuisine: string, favourites: readonly string[]): boolean {
  const c = norm(cuisine)
  return favourites.some(f => norm(f).length > 0 && c.includes(norm(f)))
}

/**
 * The dishes to try for one meal, best first. Steering, in order of weight:
 * a cuisine she named (+4), a food she likes in the dish (+2 each, at most
 * +4), a cuisine her pool does not have yet (+2, re-asked after each pick so
 * the five chosen are not five of one cuisine), and the cooking time she said
 * (quick: +2 for a dish ready in fifteen minutes or under; loves cooking: +1
 * for one that is not). A second exotic cuisine is pushed to the back (-6).
 */
export function chooseFromLibrary(library: readonly RawProposal[], wants: LibraryWants): RawProposal[] {
  const have = new Set(wants.haveNames.map(norm))
  const pool = library.filter(d => d.slot === wants.slot && !have.has(norm(d.name)))
  const limit = wants.limit ?? pool.length
  const rotation = wants.rotation ?? 0
  const exotic = wants.exoticCuisines
  const seen = new Set(wants.haveCuisines.map(norm))
  let exoticTaken = (exotic ? wants.haveCuisines.some(c => exotic.has(c)) : false)

  const fixed = new Map<RawProposal, number>()
  const fitted = new Map<RawProposal, RawProposal>()
  for (const d of pool) {
    let score = 0
    if (wants.budget) {
      // A dish that cannot be brought near the meal's shape is pushed to the back,
      // not dropped: verifyProposal, asked next, has the last word either way.
      const f = fitDishToBudget(d, wants.budget)
      fitted.set(d, f.dish)
      score -= Number.isFinite(f.loss) ? Math.min(8, f.loss * 20) : 8
    }
    if (wants.favoriteCuisines && cuisineIsFavourite(d.cuisine, wants.favoriteCuisines)) score += 4
    if (wants.likedFoods && wants.likedFoods.length > 0) {
      const names = d.ingredients.map(line => parseIngredientLine(line).name)
      const hits = wants.likedFoods.filter(f => containsPhrase(d.name, names, f)).length
      score += Math.min(4, hits * 2)
    }
    const quick = QUICK.test(d.prep)
    if (wants.cookingTime === 'quick' && quick) score += 2
    if (wants.cookingTime === 'loves_cooking' && !quick) score += 1
    fixed.set(d, score)
  }

  const remaining = [...pool]
  const chosen: RawProposal[] = []
  while (chosen.length < limit && remaining.length > 0) {
    let best = -1
    let bestScore = -Infinity
    let bestTie = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = remaining[i]
      let score = fixed.get(d) ?? 0
      if (!seen.has(norm(d.cuisine))) score += 2
      if (exotic && exotic.has(d.cuisine) && exoticTaken) score -= 6
      const tie = rotationHash(d.name, rotation)
      if (score > bestScore || (score === bestScore && tie < bestTie)) {
        best = i
        bestScore = score
        bestTie = tie
      }
    }
    const pick = remaining.splice(best, 1)[0]
    chosen.push(fitted.get(pick) ?? pick)
    seen.add(norm(pick.cuisine))
    if (exotic && exotic.has(pick.cuisine)) exoticTaken = true
  }
  return chosen
}

/** The data, fetched when first wanted: it is the larger half of the library and nothing paints with it. */
let loaded: Promise<readonly RawProposal[]> | null = null
export function loadMealLibrary(): Promise<readonly RawProposal[]> {
  if (!loaded) {
    loaded = import('./meal-library-data').then(m => m.MEAL_LIBRARY).catch(err => {
      loaded = null
      throw err
    })
  }
  return loaded
}
