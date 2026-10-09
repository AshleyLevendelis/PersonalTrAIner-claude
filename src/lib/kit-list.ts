// ---------------------------------------------------------------------------
// THE KIT SOMEBODY ACTUALLY HAS. docs/plans/kit-list.md; test log H1-H3.
//
// Ashley, 9 Oct 2026, from three options ("How should someone tell the app
// what kit they have?"): "Remember what they say" — keep the four choices;
// also remember specifics people say in setup or to the coach ("I've got
// dumbbells and a bench", "I don't own bands"), and show them as ticks in
// Profile. No new setup question. Nobody's plan changes unless they say
// something. It revisits her 9 Sep "fix the words" choice; her reason then
// (narrowing the tier sets would change everyone's plans) does not arise,
// because the tier sets are not touched.
//
// WHAT THIS FILE IS: the closed list of nine things a person can say they
// have, the three kinds of statement, and how statements resolve on top of the
// tier the person picked. PURE: no I/O, no catalogue, no engine import — so
// the load prescription, the warm-up and the engine can all read it without a
// cycle. The catalogue strings each tier allows stay in exercise-plan.ts
// (`EQUIPMENT_SETS`); `allowedEquipmentFor` there is the one place the two
// meet.
//
// WITH NO STATEMENTS NOTHING HERE DOES ANYTHING. Every function returns the
// tier's own answer (or null, "no list"), and `profileWithKit` hands back the
// very object it was given. `test:kit-list` holds that a profile with no kit
// rows generates byte-identical plans.
// ---------------------------------------------------------------------------

import type { EquipmentAccess, UserProfile } from './types'

export const KIT_ITEMS = [
  'dumbbells', 'bench', 'incline_bench', 'barbell', 'squat_rack', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag',
] as const
export type KitItem = typeof KIT_ITEMS[number]

/** The catalogue's equipment strings each item unlocks. `bodyweight` needs nothing and is always allowed. */
export const KIT_ITEM_EQUIPMENT: Record<KitItem, readonly string[]> = {
  // Two strings on purpose: 'dumbbells' is a pair, 'dumbbell' one held
  // centrally (load-prescription's loadingMode reads the difference).
  dumbbells: ['dumbbells', 'dumbbell'],
  bench: ['bench'],
  incline_bench: ['incline bench'],
  barbell: ['barbell', 'EZ bar', 'trap bar', 't-bar'],
  squat_rack: ['squat rack'],
  kettlebell: ['kettlebell'],
  bands: ['resistance band'],
  pull_up_bar: ['pull-up bar'],
  weighted_bag: ['weighted backpack'],
}

/** What the person sees, in the middle of a sentence (read through `kitInWords` and `describeKitStatement`). */
const KIT_ITEM_WORDS: Record<KitItem, string> = {
  dumbbells: 'dumbbells',
  bench: 'a flat bench',
  incline_bench: 'an adjustable bench',
  barbell: 'a barbell and plates',
  squat_rack: 'a squat rack',
  kettlebell: 'a kettlebell',
  bands: 'resistance bands',
  pull_up_bar: 'a pull-up bar',
  weighted_bag: 'a weighted bag',
}

/** The same nine as a tick-list reads them (Profile). */
export const KIT_ITEM_LABELS: Record<KitItem, string> = {
  dumbbells: 'Dumbbells',
  bench: 'Flat bench',
  incline_bench: 'Adjustable / incline bench',
  barbell: 'Barbell and plates',
  squat_rack: 'Squat rack',
  kettlebell: 'Kettlebell',
  bands: 'Resistance bands',
  pull_up_bar: 'Pull-up bar',
  weighted_bag: 'Weighted bag',
}

const EQUIPMENT_TO_ITEM = new Map<string, KitItem>(
  KIT_ITEMS.flatMap(item => KIT_ITEM_EQUIPMENT[item].map(eq => [eq, item] as [string, KitItem])),
)

/** The item a catalogue equipment string belongs to, or null for anything not on the list (a cable stack, a box). */
function kitItemForEquipment(equipment: string): KitItem | null {
  return EQUIPMENT_TO_ITEM.get(equipment) ?? null
}

export function isKitItem(value: unknown): value is KitItem {
  return typeof value === 'string' && (KIT_ITEMS as readonly string[]).includes(value)
}

/**
 * The items each of the four choices assumes — what a tick-list shows before
 * the person has said anything. Derived by hand from `EQUIPMENT_SETS`
 * (exercise-plan.ts) and held to it by `test:kit-list`: an item is listed here
 * exactly when every string it unlocks is in that tier's set.
 */
export const TIER_KIT_ITEMS: Record<EquipmentAccess, readonly KitItem[]> = {
  full_gym: KIT_ITEMS,
  home_gym: KIT_ITEMS,
  minimalist: ['dumbbells', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag'],
  bodyweight: ['pull_up_bar', 'weighted_bag'],
}

/**
 * One thing somebody said about their kit.
 *   has    "I've got a bench too"                — adds the items
 *   hasnt  "I don't own bands"                   — removes them
 *   only   "I only have dumbbells and a bench"   — the kit is exactly these
 * Which sentences are a list (`only`) and which are a remark is the door's
 * call; the difference here is this one field.
 */
export type KitMode = 'has' | 'hasnt' | 'only'
export interface KitStatement {
  mode: KitMode
  items: KitItem[]
}

export interface ResolvedKit {
  /** Which of the nine the person has. */
  items: ReadonlySet<KitItem>
  /**
   * True once a list was given as the WHOLE kit. Then nothing off the list is
   * owned: not the small extras (box, dip bars, ab wheel, medicine ball,
   * skipping rope), not a gym's machines and cables. False after remarks
   * only, where everything they did not mention stays as their tier has it.
   */
  exhaustive: boolean
  /** The tier the person picked — the base the statements were applied to. */
  baseTier: EquipmentAccess
  /**
   * The tier this kit amounts to, for everything in the engine that is about
   * the KIND of trainee (bodyweight phase rules, the implement preference,
   * whether a ceiling is asked). Never written back to the profile.
   */
  tier: EquipmentAccess
}

/** A profile as the engine may be handed it: the stored one, plus what the person has said. */
type KitReader = Pick<UserProfile, 'equipment_access' | 'kit_statements'>

function cleanStatements(statements: readonly KitStatement[] | undefined | null): KitStatement[] {
  if (!statements) return []
  return statements
    .map(s => ({ mode: s.mode, items: (s.items ?? []).filter(isKitItem) }))
    .filter(s => (s.mode === 'has' || s.mode === 'hasnt' || s.mode === 'only') && s.items.length > 0)
}

function deriveTier(baseTier: EquipmentAccess, items: ReadonlySet<KitItem>, exhaustive: boolean): EquipmentAccess {
  // A gym with one thing missing is still a gym.
  if (baseTier === 'full_gym' && !exhaustive) return 'full_gym'
  if (items.has('barbell')) return 'home_gym'
  if (items.has('dumbbells') || items.has('kettlebell') || items.has('bands')) return 'minimalist'
  return 'bodyweight'
}

/**
 * Statements applied IN THE ORDER THEY WERE SAID, on top of the items the
 * person's tier assumes. Null when there is nothing to apply: the tier decides,
 * exactly as it always has.
 */
export function resolveKit(baseTier: EquipmentAccess, statements: readonly KitStatement[] | undefined | null): ResolvedKit | null {
  const said = cleanStatements(statements)
  if (said.length === 0) return null
  const items = new Set<KitItem>(TIER_KIT_ITEMS[baseTier])
  let exhaustive = false
  for (const s of said) {
    if (s.mode === 'only') {
      items.clear()
      for (const i of s.items) items.add(i)
      exhaustive = true
    } else if (s.mode === 'has') {
      for (const i of s.items) items.add(i)
    } else {
      for (const i of s.items) items.delete(i)
    }
  }
  return { items, exhaustive, baseTier, tier: deriveTier(baseTier, items, exhaustive) }
}

// Resolution is asked once per exercise per filter. Keyed on the statements
// array itself (hydration builds it once per change), then on the tier.
const resolved = new WeakMap<object, Map<string, ResolvedKit | null>>()

/** The kit list on this profile, resolved; null when the person has said nothing. */
export function kitOf(profile: KitReader | null | undefined): ResolvedKit | null {
  const statements = profile?.kit_statements
  if (!statements || statements.length === 0) return null
  const baseTier = profile.equipment_access || 'full_gym'
  let byTier = resolved.get(statements)
  if (!byTier) { byTier = new Map(); resolved.set(statements, byTier) }
  if (!byTier.has(baseTier)) byTier.set(baseTier, resolveKit(baseTier, statements))
  return byTier.get(baseTier) ?? null
}

/**
 * THE TIER THE ENGINE SHOULD TREAT THIS PERSON AS. The stored one when they
 * have said nothing (undefined stays undefined: callers keep their own
 * fallback, and an omitted tier still means "this factor is off").
 *
 * Every engine read of the tier goes through here. Reading
 * `profile.equipment_access` directly is how a path ignores the list;
 * `test:kit-list` fails on one.
 */
export function equipmentTierFor(profile: KitReader | null | undefined): EquipmentAccess | undefined {
  return kitOf(profile)?.tier ?? profile?.equipment_access
}

/**
 * Does this person have that item? `null` when they have no kit list — the
 * caller's own tier logic answers, as it did before any of this existed.
 */
export function ownsKitItem(profile: KitReader | null | undefined, item: KitItem): boolean | null {
  const kit = kitOf(profile)
  return kit ? kit.items.has(item) : null
}

/**
 * THE ONE RULE for "may this person be given something that needs `equipment`",
 * once they have a kit list. `tierAllows` is the answer their BASE tier gives
 * for the same string (exercise-plan's EQUIPMENT_SETS).
 *   - one of the nine: they have it or they do not.
 *   - `bodyweight`: always.
 *   - anything else (a cable stack, a box, dip bars): not owned after a list
 *     given as the whole kit; otherwise as the tier has it — they said nothing
 *     about it, and nobody's plan changes unless they say something.
 */
export function kitAllowsEquipment(kit: ResolvedKit, equipment: string, tierAllows: boolean): boolean {
  if (equipment === 'bodyweight') return true
  const item = kitItemForEquipment(equipment)
  if (item) return kit.items.has(item)
  return kit.exhaustive ? false : tierAllows
}

/**
 * The profile with what the person has said attached — the ONE way a kit list
 * gets onto a profile. Never stored: `kit_statements` is not a column, every
 * profile write is a named patch, and this is recomputed from the facts.
 *
 * Returns the SAME object when there is nothing to attach and nothing to
 * clear, so a person who has said nothing gets byte-identical behaviour.
 */
export function profileWithKit<P extends KitReader>(profile: P, statements: readonly KitStatement[] | undefined | null): P {
  const said = cleanStatements(statements)
  if (said.length === 0) {
    if (profile.kit_statements === undefined) return profile
    const { kit_statements: _dropped, ...rest } = profile
    return rest as P
  }
  const current = profile.kit_statements
  if (current && JSON.stringify(current) === JSON.stringify(said)) return profile
  return { ...profile, kit_statements: said }
}

/** Things you bring with you rather than things a place has. */
const PERSONAL_ITEMS: readonly KitItem[] = ['bands', 'weighted_bag']

/**
 * A TRAVEL TIER DESCRIBES SOMEWHERE ELSE, so it uses that tier's plain set and
 * the person's own list is dropped: a hotel gym has a barbell they do not own,
 * and their dumbbells are at home.
 *
 * One thing follows them: bands and a weighted bag are things a person brings,
 * not things a place has. If they have said they do not have them, a week away
 * does not conjure them (the tester's travel card put a Backpack Row on a man
 * with no backpack). With no kit list this is exactly the tier, as before.
 */
export function travelProfile<P extends KitReader>(profile: P, tier: EquipmentAccess): P {
  const kit = kitOf(profile)
  const missing = kit ? PERSONAL_ITEMS.filter(i => !kit.items.has(i)) : []
  const { kit_statements: _own, ...rest } = profile
  return (missing.length > 0
    ? { ...rest, equipment_access: tier, kit_statements: [{ mode: 'hasnt', items: [...missing] }] }
    : { ...rest, equipment_access: tier }) as P
}

function listInWords(items: readonly KitItem[]): string {
  const words = items.map(i => KIT_ITEM_WORDS[i])
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** "dumbbells and a flat bench" — a kit, in a sentence. */
export function kitInWords(items: Iterable<KitItem>): string {
  const have = new Set(items)
  return listInWords(KIT_ITEMS.filter(i => have.has(i)))
}

/** The line a remembered statement shows as. "Kit: no resistance bands". */
export function describeKitStatement(statement: KitStatement): string {
  const items = statement.items.filter(isKitItem)
  if (statement.mode === 'hasnt') {
    // "no a flat bench" is not a sentence: drop the article after "no".
    const bare = items.map(i => KIT_ITEM_WORDS[i].replace(/^an? /, ''))
    const joined = bare.length <= 1 ? (bare[0] ?? '') : `${bare.slice(0, -1).join(', ')} or ${bare[bare.length - 1]}`
    return `Kit: no ${joined}`
  }
  return statement.mode === 'only' ? `Kit: only ${listInWords(items)}` : `Kit: has ${listInWords(items)}`
}

/**
 * THE ONE FACT SHAPE EVERY DOOR WRITES (memory-store's `createFact` input,
 * less the profile id). Existing `user_facts` columns, no migration:
 * `hard_constraint` / `equipment`, the item keys in `resolved_refs`,
 * `polarity` like = has, dislike = hasn't, and like + `hardness: 'hard'` = the
 * list is the whole kit. `compileKitStatements` (fact-compiler.ts) is its
 * reader; `test:kit-list` holds the round trip.
 */
export function kitStatementFact(
  statement: KitStatement,
  from: { source: 'chat' | 'manual' | 'onboarding'; rawPhrase: string },
): {
  kind: 'hard_constraint'
  constraintKind: 'equipment'
  source: 'chat' | 'manual' | 'onboarding'
  rawPhrase: string
  displayText: string
  polarity: 'like' | 'dislike'
  hardness?: 'hard'
  resolvedRefs: string[]
} {
  const items = statement.items.filter(isKitItem)
  return {
    kind: 'hard_constraint',
    constraintKind: 'equipment',
    source: from.source,
    rawPhrase: from.rawPhrase,
    displayText: describeKitStatement({ mode: statement.mode, items }),
    polarity: statement.mode === 'hasnt' ? 'dislike' : 'like',
    ...(statement.mode === 'only' ? { hardness: 'hard' as const } : {}),
    resolvedRefs: [...items],
  }
}
