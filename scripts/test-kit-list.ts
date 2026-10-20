// ---------------------------------------------------------------------------
// Gate: THE KIT YOU ACTUALLY HAVE. (docs/plans/kit-list.md; test log H1-H3.)
//
// Ashley, 9 Oct 2026: "Remember what they say": keep the four choices; also
// remember specifics people say ("I've got dumbbells and a bench", "I don't
// own bands"), shown as ticks on Profile. Nobody's plan changes unless they
// say something. "Build it", 11 Oct 2026.
//
// What it holds:
//   1. the list resolves the way the plan says (order, the three kinds of
//      statement, the derived tier, the small extras, ticks, redundancy);
//   2. a profile with NO kit rows generates byte-identical plans (seeded) —
//      absent, empty, and compiled from facts that are not kit rows;
//   3. for each kit in a small grid, nothing generated, swapped, added,
//      rebuilt, injury-substituted or put in a warm-up needs an implement
//      outside the kit, by this gate's OWN table;
//   4. the tester's profile with {dumbbells, flat bench};
//   5. ceilings: never the answer, or the question, for an implement the
//      person has said they do not have;
//   6. the warning wording; a travel tier describes somewhere else;
//   7. the doors' one function (trial -> what changes -> apply), against a
//      stand-in database that records what it was ASKED, never touching a
//      trained day;
//   8. source properties: one reader of the tier, one place the profile is
//      given its kit, both doors on the one controller.
//
// Started from the lead branch's gate (wip/k3-kit-list), which was written
// before its build and never run; the dumbbell-pack section is not here
// because the pack is not in this build.
//
// THE CHECK COUNT IS THE SAME EVERY RUN, and ONE EXIT, at the bottom.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool, getExerciseCompatibilityWarnings,
  allowedEquipmentFor, isEquipmentAllowed,
} from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, type ExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { warmupDrillsNeedingMissingKit } from '../src/lib/warmup'
import { dayAnchorExercise } from '../src/lib/session-derive'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { getAdditionCandidates } from '../src/lib/exercise-add-candidates'
import { rebuildDayAroundMainLift } from '../src/lib/session-rebuild'
import { substituteForInjury, substituteForEquipment, substituteForKit, rebuildAgainstProfile, untrainedPlanContext } from '../src/lib/plan-adaptations'
import { planDaysInWindow } from '../src/lib/plan-guard'
import { constraintProfile } from '../src/lib/effective-constraints'
import { statedCeilingKg, ceilingKindsFor } from '../src/lib/load-prescription'
import { ceilingToAskFor } from '../src/lib/load-ceiling-prompt'
import { compileKitStatements, kitFactsIn } from '../src/lib/fact-compiler'
import {
  KIT_ITEMS, KIT_ITEM_EQUIPMENT, resolveKit, equipmentTierFor, profileWithKit, kitStatementFact,
  describeKitStatement, kitItemsFor, statementsForTicks, supersededStatementIndexes, TIER_KIT_ITEMS,
  kitStatementInUserWords, parseKitSlot, type KitStatement, type KitItem,
} from '../src/lib/kit-list'
import { planKitChange, recordKitStatement, clearKitStatements } from '../src/lib/kit-change'
import { setSupabaseClient } from '../src/lib/supabase'
import { assembleProfile, initialSlotValues, openSlotsInOrder, NEVER_BLOCKING_SLOTS } from '../src/lib/onboarding-slots'
import { buildProfile, comboKey, type Combination } from './quality-grid'
import type { UserProfile, MesocycleWeek, WorkoutDay, EquipmentAccess } from '../src/lib/types'
import type { UserFactRow } from '../src/lib/memory-store'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`) }
}

const say = console.log
const quiet = <T>(fn: () => T): T => {
  const log = console.log, warn = console.warn
  console.log = () => {}; console.warn = () => {}
  try { return fn() } finally { console.log = log; console.warn = warn }
}
const hush = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log, warn = console.warn, err = console.error
  console.log = () => {}; console.warn = () => {}; console.error = () => {}
  try { return await fn() } finally { console.log = log; console.warn = warn; console.error = err }
}

type Statement = KitStatement

// ---- the gate's OWN table of what each thing a person can say unlocks. Not
// read from the engine: a change that emptied the engine's table cannot make
// this gate agree with it. ----
const OWN_ITEM_STRINGS: Record<string, string[]> = {
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
/** An exhaustive kit: exactly these strings and the body. */
const ownAllowed = (items: string[]) => new Set(['bodyweight', ...items.flatMap(i => OWN_ITEM_STRINGS[i] ?? [])])
/** What a named exercise needs that `allowed` does not hold. Empty = fine. */
const outside = (name: string, allowed: (eq: string) => boolean): string[] => {
  const entry = EXERCISE_DATABASE.find(e => e.name === name)
  if (!entry) return [`(unknown exercise ${name})`]
  const missing = entry.equipment.filter(eq => !allowed(eq))
  if (entry.equipment_alternatives) return missing.length === entry.equipment.length ? missing : []
  return missing
}
/** Every name a day's warm-up block prints (general, mobility, ramps). */
const warmupNames = (day: WorkoutDay): string[] => {
  const w = (day as unknown as { warmup?: Record<string, unknown> }).warmup
  if (!w) return []
  const out: string[] = []
  for (const value of Object.values(w)) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const rec = item as { name?: string }
      if (rec.name) out.push(rec.name)
    }
  }
  return out
}
/**
 * The gate's OWN table of warm-up drills that need kit (drills are not
 * catalogue entries). Held to the source below: if warmup.ts gains a third
 * drill that needs something, the count check fails until it is listed here.
 */
const WARMUP_DRILL_KIT: Record<string, string> = { 'Band Pull-Aparts': 'resistance band', 'Dead Hang': 'pull-up bar' }
const warmupOutside = (day: WorkoutDay, allowed: (eq: string) => boolean): string[] =>
  warmupNames(day).flatMap(n => {
    const needs = WARMUP_DRILL_KIT[n] ?? (/^band /i.test(n) ? 'resistance band' : null)
    return needs && !allowed(needs) ? [`${n} (${needs})`] : []
  })

const hash = (meso: MesocycleWeek[]) => createHash('sha1').update(JSON.stringify(meso)).digest('hex')
const generate = (profile: UserProfile, seed: string): MesocycleWeek[] => {
  setRandomSource(seededRngFromKey(seed))
  try { return quiet(() => generateMesocycle(profile)) } finally { resetRandomSource() }
}
const withKit = (profile: UserProfile, statements: Statement[]): UserProfile => profileWithKit(profile, statements)
const allNames = (meso: MesocycleWeek[]) => [...new Set(meso.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))]

// A FIXED MONDAY, never the machine's calendar: every path below is handed its
// calendar (the trial takes a context), so the gate gives the same answer on
// any day it is run.
const TODAY = new Date(2026, 9, 5)
const samProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'p-kit', age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'fat_loss', preferred_time: 'evening', bmr: 1800, tdee: 2600,
  equipment_access: 'minimalist', injuries: ['shoulders'], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation',
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', max_dumbbell_kg: 24,
  created_at: TODAY.toISOString(), ...over,
}) as unknown as UserProfile

const combo = (c: Partial<Combination>): Combination => ({
  equipment: 'minimalist', injuries: [], duration: '45-60', style: 'bodybuilding', experience: 'intermediate',
  goal: 'hypertrophy', recovery: 'moderate', conditioningPref: 'tolerate', ...c,
} as Combination)

let factSeq = 0
const fact = (over: Partial<UserFactRow>): UserFactRow => ({
  id: `f-${++factSeq}`, profile_id: 'p-kit', kind: 'hard_constraint', status: 'active', source: 'chat',
  source_message_id: null, raw_phrase: '', display_text: '', supersedes_id: null, polarity: null, hardness: null,
  resolved_refs: null, timing_subject: null, timing_relation: null, timing_anchor: null, timing_slot: null,
  constraint_kind: 'equipment', weekday: null, client_id: null, created_at: '2026-10-09T10:00:00Z', retired_at: null,
  ...over,
})

// ===========================================================================
async function main() {
  // -------------------------------------------------------------------------
  say('\n1. The list resolves the way the plan says')
  const resolve = (tier: EquipmentAccess, statements: Statement[]) => resolveKit(tier, statements)
  const items = (r: ReturnType<typeof resolveKit>) => (r ? [...r.items].sort() : null)
  check('the engine\'s nine are this gate\'s nine, string for string',
    Object.keys(OWN_ITEM_STRINGS).every(k => JSON.stringify([...(KIT_ITEM_EQUIPMENT[k as KitItem] ?? [])].sort()) === JSON.stringify([...OWN_ITEM_STRINGS[k]].sort()))
    && Object.keys(KIT_ITEM_EQUIPMENT).length === 9 && KIT_ITEMS.length === 9, KIT_ITEM_EQUIPMENT)
  check('each choice assumes exactly the items whose every string its own set allows',
    (['home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]).every(tier => {
      const own = new Set(KIT_ITEMS.filter(i => KIT_ITEM_EQUIPMENT[i].filter(eq => eq !== 't-bar').every(eq => isEquipmentAllowed({ equipment: [eq] } as ExerciseEntry, tier))))
      return JSON.stringify([...TIER_KIT_ITEMS[tier]].sort()) === JSON.stringify([...own].sort())
    }) && TIER_KIT_ITEMS.full_gym.length === 9, TIER_KIT_ITEMS)
  check('no statements means no kit list at all (the tier decides)', resolve('minimalist', []) === null && resolveKit('minimalist', undefined) === null)
  check('"I don\'t own bands" on Minimalist removes bands and nothing else',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'hasnt', items: ['bands'] }]))) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']))
  check('"I\'ve got a bench too" on Minimalist adds the bench',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'has', items: ['bench'] }]))) === JSON.stringify(['bands', 'bench', 'dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']))
  check('"I only have dumbbells and a flat bench" is exactly that, and the whole kit',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'only', items: ['dumbbells', 'bench'] }]))) === JSON.stringify(['bench', 'dumbbells'])
    && resolve('minimalist', [{ mode: 'only', items: ['dumbbells', 'bench'] }])?.exhaustive === true)
  check('statements apply in the order they were said: a later one wins',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'hasnt', items: ['bands'] }, { mode: 'has', items: ['bands'] }]))) === JSON.stringify(['bands', 'dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag'])
    && JSON.stringify(items(resolve('minimalist', [{ mode: 'has', items: ['bands'] }, { mode: 'hasnt', items: ['bands'] }]))) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']))
  check('...and a remark after a list adds to the list rather than undoing it',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'only', items: ['dumbbells'] }, { mode: 'has', items: ['pull_up_bar'] }]))) === JSON.stringify(['dumbbells', 'pull_up_bar'])
    && resolve('minimalist', [{ mode: 'only', items: ['dumbbells'] }, { mode: 'has', items: ['pull_up_bar'] }])?.exhaustive === true)
  check('an item that is not one of the nine is ignored, and a statement of nothing but those is no statement',
    resolve('minimalist', [{ mode: 'hasnt', items: ['treadmill' as KitItem] }]) === null
    && JSON.stringify(items(resolve('minimalist', [{ mode: 'hasnt', items: ['treadmill' as KitItem, 'bands'] }]))) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']))
  const tierOf = (tier: EquipmentAccess, statements: Statement[]) => resolve(tier, statements)?.tier
  check('derived tier: a full gym less bands is still a full gym', tierOf('full_gym', [{ mode: 'hasnt', items: ['bands'] }]) === 'full_gym')
  check('derived tier: a barbell makes a home gym', tierOf('minimalist', [{ mode: 'has', items: ['barbell'] }]) === 'home_gym')
  check('derived tier: dumbbells, a kettlebell or bands make Minimalist',
    tierOf('home_gym', [{ mode: 'hasnt', items: ['barbell'] }]) === 'minimalist'
    && tierOf('bodyweight', [{ mode: 'has', items: ['kettlebell'] }]) === 'minimalist'
    && tierOf('full_gym', [{ mode: 'only', items: ['bands'] }]) === 'minimalist')
  check('derived tier: nothing to load is bodyweight', tierOf('minimalist', [{ mode: 'only', items: ['pull_up_bar'] }]) === 'bodyweight'
    && tierOf('minimalist', [{ mode: 'hasnt', items: ['dumbbells', 'kettlebell', 'bands'] }]) === 'bodyweight')
  check('the hydrated profile keeps the tier the person picked, and says the derived one when asked',
    withKit(samProfile({ equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }]).equipment_access === 'home_gym'
    && equipmentTierFor(withKit(samProfile({ equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }])) === 'minimalist'
    && equipmentTierFor(samProfile({ equipment_access: 'home_gym' })) === 'home_gym')
  check('profileWithKit with no statements hands back the very same object', (() => { const p = samProfile(); return profileWithKit(p, []) === p })())
  const allows = (profile: UserProfile, eq: string) => { const a = allowedEquipmentFor(profile); return a === null ? true : a.has(eq) }
  const home = samProfile({ equipment_access: 'home_gym' })
  check('"I don\'t own bands" on Home gym says nothing about the box, the dip bars or the ab wheel',
    ['plyo box', 'dip bars', 'ab wheel', 'medicine ball', 'jump rope', 'barbell', 'bench'].every(eq => allows(withKit(home, [{ mode: 'hasnt', items: ['bands'] }]), eq))
    && !allows(withKit(home, [{ mode: 'hasnt', items: ['bands'] }]), 'resistance band'))
  check('a list given as the whole kit leaves the small extras out',
    ['plyo box', 'dip bars', 'ab wheel', 'medicine ball', 'jump rope', 'kettlebell', 'resistance band', 'weighted backpack', 'pull-up bar'].every(eq => !allows(withKit(home, [{ mode: 'only', items: ['dumbbells', 'bench'] }]), eq))
    && ['dumbbells', 'dumbbell', 'bench', 'bodyweight'].every(eq => allows(withKit(home, [{ mode: 'only', items: ['dumbbells', 'bench'] }]), eq)))
  check('a full gym less bands keeps the machines and the cables',
    ['cable machine', 'machine', 'leg press machine', 'barbell', 'kettlebell'].every(eq => allows(withKit(samProfile({ equipment_access: 'full_gym' }), [{ mode: 'hasnt', items: ['bands'] }]), eq))
    && !allows(withKit(samProfile({ equipment_access: 'full_gym' }), [{ mode: 'hasnt', items: ['bands'] }]), 'resistance band'))
  check('...and a list given by a full-gym member is only the list',
    !allows(withKit(samProfile({ equipment_access: 'full_gym' }), [{ mode: 'only', items: ['dumbbells'] }]), 'cable machine'))
  check('no kit list: allowedEquipmentFor is the tier\'s own answer (everything at a full gym)',
    allowedEquipmentFor(samProfile({ equipment_access: 'full_gym' })) === null
    && allows(samProfile(), 'resistance band') && !allows(samProfile(), 'bench'))
  // Facts.
  const rows: UserFactRow[] = [
    fact({ polarity: 'like', hardness: 'hard', resolved_refs: ['dumbbells', 'bench'], created_at: '2026-10-09T10:00:00Z' }),
    fact({ polarity: 'dislike', resolved_refs: ['bands'], created_at: '2026-10-09T11:00:00Z' }),
    fact({ polarity: 'like', resolved_refs: ['pull_up_bar'], created_at: '2026-10-09T12:00:00Z' }),
  ]
  check('facts compile to statements: like+hard = only, dislike = hasn\'t, like = has, oldest first',
    JSON.stringify(compileKitStatements(rows)) === JSON.stringify([
      { mode: 'only', items: ['dumbbells', 'bench'] }, { mode: 'hasnt', items: ['bands'] }, { mode: 'has', items: ['pull_up_bar'] },
    ]), compileKitStatements(rows))
  const notKit: UserFactRow[] = [
    // What the coach's record_fact writes today: free text, nothing resolved.
    fact({ display_text: 'Only has dumbbells at home', raw_phrase: 'I only have dumbbells', resolved_refs: null }),
    fact({ constraint_kind: 'availability', weekday: 'Monday', polarity: null }),
    fact({ kind: 'exercise_preference', constraint_kind: null, polarity: 'dislike', hardness: 'hard', resolved_refs: ['Burpees'] }),
    fact({ kind: 'food_preference', constraint_kind: null, polarity: 'like', hardness: 'hard', resolved_refs: ['dumbbells'] }),
    fact({ polarity: 'dislike', resolved_refs: ['Band Tricep Kickback'] }),
    fact({ polarity: null, resolved_refs: ['bands'] }),
  ]
  check('a free-text equipment fact, another kind of fact, an exercise name and a row with no polarity are not kit statements',
    compileKitStatements(notKit).length === 0 && kitFactsIn(notKit).length === 0, compileKitStatements(notKit))
  const written = kitStatementFact({ mode: 'only', items: ['dumbbells', 'bench'] }, { source: 'chat', rawPhrase: 'I only have dumbbells and a flat bench' })
  check('the one fact shape the doors write is a row the schema already accepts',
    written.kind === 'hard_constraint' && written.constraintKind === 'equipment' && written.polarity === 'like' && written.hardness === 'hard'
    && JSON.stringify(written.resolvedRefs) === JSON.stringify(['dumbbells', 'bench']) && written.source === 'chat'
    && written.rawPhrase === 'I only have dumbbells and a flat bench' && written.displayText.length > 0, written)
  const roundTrip = (s: Statement) => {
    const w = kitStatementFact(s, { source: 'manual', rawPhrase: 'x' })
    return compileKitStatements([fact({ polarity: w.polarity, hardness: (w.hardness ?? null), resolved_refs: w.resolvedRefs })])[0] ?? null
  }
  check('what a door writes is what the compiler reads back, for all three kinds',
    (['has', 'hasnt', 'only'] as const).every(mode => JSON.stringify(roundTrip({ mode, items: ['kettlebell', 'bands'] })) === JSON.stringify({ mode, items: ['kettlebell', 'bands'] })))
  check('the words "Things it remembers" shows name the things, plainly',
    describeKitStatement({ mode: 'hasnt', items: ['bands'] }) === 'Kit: no resistance bands'
    && describeKitStatement({ mode: 'has', items: ['bench', 'dumbbells'] }) === 'Kit: has a flat bench and dumbbells'
    && describeKitStatement({ mode: 'only', items: ['dumbbells', 'bench'] }) === 'Kit: only dumbbells and a flat bench',
    [describeKitStatement({ mode: 'hasnt', items: ['bands'] }), describeKitStatement({ mode: 'has', items: ['bench', 'dumbbells'] })])
  // Ticks.
  check('the ticks show the choice\'s assumption with nothing said, and the list once something is',
    JSON.stringify(kitItemsFor(samProfile())) === JSON.stringify(['dumbbells', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag'])
    && JSON.stringify(kitItemsFor(withKit(samProfile(), [{ mode: 'only', items: ['bench', 'dumbbells'] }]))) === JSON.stringify(['dumbbells', 'bench'])
    && kitItemsFor(samProfile({ equipment_access: 'full_gym' })).length === 9)
  check('a changed tick-list is one has and one hasn\'t, never an only; nothing changed is nothing',
    JSON.stringify(statementsForTicks(['dumbbells', 'bands'], ['dumbbells', 'bench'])) === JSON.stringify([{ mode: 'has', items: ['bench'] }, { mode: 'hasnt', items: ['bands'] }])
    && statementsForTicks(['dumbbells'], ['dumbbells']).length === 0
    && JSON.stringify(statementsForTicks(['dumbbells'], [])) === JSON.stringify([{ mode: 'hasnt', items: ['dumbbells'] }]))
  // Redundancy: retiring what supersededStatementIndexes names never changes the kit.
  const histories: Statement[][] = [
    [{ mode: 'hasnt', items: ['bands'] }],
    [{ mode: 'hasnt', items: ['bands', 'kettlebell'] }],
    [{ mode: 'only', items: ['dumbbells', 'bench'] }, { mode: 'has', items: ['bands'] }],
    [{ mode: 'has', items: ['bench'] }, { mode: 'hasnt', items: ['weighted_bag'] }],
  ]
  const later: Statement[][] = [[{ mode: 'has', items: ['bands'] }], [{ mode: 'hasnt', items: ['bands'] }], [{ mode: 'has', items: ['bench', 'kettlebell'] }, { mode: 'hasnt', items: ['bands', 'weighted_bag'] }]]
  let invariantCases = 0, retiredSomething = 0
  const broken: string[] = []
  for (const tier of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]) for (const h of histories) for (const l of later) {
    invariantCases++
    const idx = supersededStatementIndexes(h, l)
    if (idx.length > 0) retiredSomething++
    const kept = h.filter((_, i) => !idx.includes(i))
    const a = resolveKit(tier, [...h, ...l]), b = resolveKit(tier, [...kept, ...l])
    if (JSON.stringify([...(a?.items ?? [])].sort()) !== JSON.stringify([...(b?.items ?? [])].sort()) || a?.exhaustive !== b?.exhaustive || a?.tier !== b?.tier) broken.push(`${tier} ${JSON.stringify(h)} + ${JSON.stringify(l)}`)
  }
  check(`retiring the rows a new statement makes redundant never changes the kit (${invariantCases} cases, ${retiredSomething} retire something)`, broken.length === 0 && retiredSomething >= 10, broken.slice(0, 3))
  check('an "only" is never retired as redundant, and a row naming something new is kept',
    supersededStatementIndexes([{ mode: 'only', items: ['bands'] }], [{ mode: 'hasnt', items: ['bands'] }]).length === 0
    && supersededStatementIndexes([{ mode: 'hasnt', items: ['bands', 'kettlebell'] }], [{ mode: 'has', items: ['bands'] }]).length === 0
    && JSON.stringify(supersededStatementIndexes([{ mode: 'hasnt', items: ['bands'] }], [{ mode: 'has', items: ['bands'] }])) === '[0]')

  // -------------------------------------------------------------------------
  say('\n2. No kit rows: byte-identical plans (seeded)')
  const identityCases: { label: string; profile: UserProfile; seed: string }[] = [
    { label: 'the tester', profile: samProfile(), seed: 'sam:2' },
    ...(['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[]).flatMap(equipment => [
      combo({ equipment, style: 'bodybuilding', injuries: ['shoulders'] }),
      combo({ equipment, style: 'functional', duration: '60-90', goal: 'functional' }),
      combo({ equipment, style: 'combat', duration: '30-45', goal: 'conditioning', injuries: ['knees'] }),
    ]).map(c => ({ label: comboKey(c), profile: buildProfile(c), seed: comboKey(c) })),
  ]
  const fromUnrelatedFacts = compileKitStatements(notKit)
  let identical = 0
  const differing: string[] = []
  for (const c of identityCases) {
    const plain = hash(generate(c.profile, c.seed))
    const empty = hash(generate({ ...c.profile, kit_statements: [] }, c.seed))
    const hydrated = hash(generate(profileWithKit(c.profile, fromUnrelatedFacts), c.seed))
    if (plain === empty && plain === hydrated) identical++; else differing.push(c.label)
  }
  check(`absent, empty and "facts that are not kit rows" generate the same plan, byte for byte (${identityCases.length} seeded plans)`, identical === identityCases.length, differing)
  const samKitted = withKit(samProfile(), [{ mode: 'only', items: ['dumbbells', 'bench'] }])
  check('...and the comparison can see a difference: the same seed with a kit list is a different plan',
    hash(generate(samProfile(), 'sam:2')) !== hash(generate(samKitted, 'sam:2')))
  check('the pool is the same set of exercises with no kit rows',
    JSON.stringify(getConstrainedPool(samProfile(), []).map(e => e.name)) === JSON.stringify(getConstrainedPool({ ...samProfile(), kit_statements: [] }, []).map(e => e.name)))

  // -------------------------------------------------------------------------
  say('\n3. The grid: nothing anywhere needs an implement outside the kit')
  const KITS: { label: string; base: EquipmentAccess; statements: Statement[]; allowed: (eq: string) => boolean }[] = [
    { label: 'dumbbells + bench', base: 'minimalist', statements: [{ mode: 'only', items: ['dumbbells', 'bench'] }], allowed: eq => ownAllowed(['dumbbells', 'bench']).has(eq) },
    { label: 'dumbbells only', base: 'minimalist', statements: [{ mode: 'only', items: ['dumbbells'] }], allowed: eq => ownAllowed(['dumbbells']).has(eq) },
    { label: 'bands only', base: 'minimalist', statements: [{ mode: 'only', items: ['bands'] }], allowed: eq => ownAllowed(['bands']).has(eq) },
    { label: 'dumbbells + bench + pull-up bar', base: 'home_gym', statements: [{ mode: 'only', items: ['dumbbells', 'bench'] }, { mode: 'has', items: ['pull_up_bar'] }], allowed: eq => ownAllowed(['dumbbells', 'bench', 'pull_up_bar']).has(eq) },
    { label: 'full gym less bands', base: 'full_gym', statements: [{ mode: 'hasnt', items: ['bands'] }], allowed: eq => eq !== 'resistance band' },
  ]
  const GRID: Partial<Combination>[] = [
    { style: 'bodybuilding', injuries: [], duration: '45-60' },
    { style: 'bodybuilding', injuries: ['shoulders'], duration: '30-45', goal: 'fat_loss' },
    { style: 'functional', injuries: ['knees'], duration: '60-90', goal: 'functional' },
    { style: 'combat', injuries: [], duration: '45-60', goal: 'conditioning' },
    { style: 'hybrid', injuries: ['lower_back'], duration: '90+', experience: 'novice' },
  ]
  const calendar = { planCreatedAt: TODAY.toISOString(), today: `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`, moves: [] }
  const context = untrainedPlanContext(calendar)

  for (const k of KITS) {
    const bad = { generated: [] as string[], warmup: [] as string[], swapped: [] as string[], added: [] as string[], rebuilt: [] as string[], session: [] as string[], injury: [] as string[], pool: [] as string[] }
    let plans = 0, slots = 0, swapsSeen = 0, addsSeen = 0, injurySwaps = 0, sessionSwaps = 0
    for (const g of GRID) {
      const c = combo({ ...g, equipment: k.base })
      const profile = withKit({ ...buildProfile(c), id: 'p-grid', created_at: TODAY.toISOString() } as UserProfile, k.statements)
      const seed = `kit:${k.label}:${comboKey(c)}`
      const meso = generate(profile, seed)
      plans++
      const tag = (what: string) => `${comboKey(c)} :: ${what}`
      for (const e of getConstrainedPool(profile, [])) { const m = outside(e.name, k.allowed); if (m.length) bad.pool.push(tag(`${e.name} needs ${m.join('+')}`)) }
      for (const w of meso) for (const d of w.days) {
        for (const e of d.exercises) { slots++; const m = outside(e.name, k.allowed); if (m.length) bad.generated.push(tag(`wk${w.week_number} ${d.day} ${e.name} needs ${m.join('+')}`)) }
        bad.warmup.push(...warmupOutside(d, k.allowed).map(x => tag(`wk${w.week_number} ${d.day} warm-up ${x}`)))
      }
      const week1 = meso[0]
      for (const name of new Set(week1.days.flatMap(d => d.exercises.map(e => e.name)))) {
        for (const cand of quiet(() => getReplacementCandidates(name, profile, []))) {
          swapsSeen++
          const m = outside(cand.exercise.name, k.allowed)
          if (m.length) bad.swapped.push(tag(`${name} -> ${cand.exercise.name} needs ${m.join('+')}`))
        }
      }
      for (const d of week1.days) for (const cand of quiet(() => getAdditionCandidates(d, profile, [], 50))) {
        addsSeen++
        const m = outside(cand.exercise.name, k.allowed)
        if (m.length) bad.added.push(tag(`${d.day} + ${cand.exercise.name} needs ${m.join('+')}`))
      }
      const rebuilt = await hush(() => rebuildAgainstProfile(profile, [], meso, undefined, context, `rebuild:${seed}`))
      for (const n of allNames(rebuilt)) { const m = outside(n, k.allowed); if (m.length) bad.rebuilt.push(tag(`${n} needs ${m.join('+')}`)) }
      const firstDay = week1.days.find(d => d.exercises.length > 1)
      if (firstDay) {
        const session = await hush(() => rebuildDayAroundMainLift({ mesocycle: meso, profile, weekNumber: 1, dayName: firstDay.day, exclusions: [] } as never))
        const after = (session as unknown as { mesocycle: MesocycleWeek[] }).mesocycle?.[0]?.days.find(d => d.day === firstDay.day)
        for (const e of after?.exercises ?? []) {
          sessionSwaps++
          const m = outside(e.name, k.allowed)
          if (m.length) bad.session.push(tag(`${firstDay.day} session rebuild holds ${e.name}, needs ${m.join('+')}`))
        }
      }
      const area = (c.injuries ?? []).includes('knees') ? 'shoulders' : 'knees'
      const eased = await hush(() => substituteForInjury({ mesocycle: meso, profile, injuryCode: area, targetDays: planDaysInWindow(meso, calendar), exclusions: [], context }))
      for (const s of eased.touchedSlots) {
        if (!s.after) continue
        injurySwaps++
        const m = outside(s.after, k.allowed)
        if (m.length) bad.injury.push(tag(`${area}: ${s.before} -> ${s.after} needs ${m.join('+')}`))
      }
    }
    say(`   [${k.label}] ${plans} plans, ${slots} slots, ${swapsSeen} swap options, ${addsSeen} add options, ${injurySwaps} injury substitutes, ${sessionSwaps} session-rebuild slots`)
    check(`[${k.label}] the pool holds nothing outside the kit`, bad.pool.length === 0, bad.pool.slice(0, 4))
    check(`[${k.label}] no generated slot, in any week, needs an implement outside the kit`, slots > 200 && bad.generated.length === 0, bad.generated.slice(0, 4))
    check(`[${k.label}] no warm-up drill does`, bad.warmup.length === 0, bad.warmup.slice(0, 4))
    check(`[${k.label}] no swap option does`, swapsSeen > 20 && bad.swapped.length === 0, bad.swapped.slice(0, 4))
    check(`[${k.label}] no "add an exercise" suggestion does`, addsSeen > 10 && bad.added.length === 0, bad.added.slice(0, 4))
    check(`[${k.label}] no rebuilt week does`, bad.rebuilt.length === 0, bad.rebuilt.slice(0, 4))
    check(`[${k.label}] no session rebuild does`, sessionSwaps > 0 && bad.session.length === 0, bad.session.slice(0, 4))
    check(`[${k.label}] no injury substitute does`, bad.injury.length === 0, bad.injury.slice(0, 4))
  }
  // The detectors are not blind: on the TIER alone, the tester's plan needs kit he does not have.
  const samTierPlan = generate(samProfile(), 'sam:2')
  const samKit = (eq: string) => ownAllowed(['dumbbells', 'bench']).has(eq)
  const tierViolations = allNames(samTierPlan).filter(n => outside(n, samKit).length > 0)
  check('the detector is not blind: on the tier alone the tester\'s plan needs kit he does not have', tierViolations.length >= 3, tierViolations)
  check('...and its warm-up detector fires on a band drill', warmupOutside({ day: 'Monday', focus: 'x', exercises: [], warmup: { mobility: [{ name: 'Band Pull-Aparts' }, { name: 'Shoulder Dislocates (broomstick or band)' }] } } as never, samKit).length === 1)
  const drillsNeedingKit = (readFileSync('src/lib/warmup.ts', 'utf8').match(/needs_equipment: \['[^\]]+\]/g) ?? []).length
  check('the gate\'s table of warm-up drills that need kit is the whole of the source\'s', drillsNeedingKit === Object.keys(WARMUP_DRILL_KIT).length, drillsNeedingKit)
  const minimalistNoInjury = samProfile({ injuries: [] })
  const tierWarmups = new Set(generate(minimalistNoInjury, 'sam:3').flatMap(w => w.days.flatMap(d => warmupNames(d))))
  const noBandWarmups = new Set(generate(withKit(minimalistNoInjury, [{ mode: 'hasnt', items: ['bands'] }]), 'sam:3').flatMap(w => w.days.flatMap(d => warmupNames(d))))
  const withBandsWarmups = new Set(generate(withKit(minimalistNoInjury, [{ mode: 'only', items: ['dumbbells', 'bench', 'bands'] }]), 'sam:3').flatMap(w => w.days.flatMap(d => warmupNames(d))))
  check('the warm-up reads the list: Band Pull-Aparts on the tier, gone once he says "no bands"', tierWarmups.has('Band Pull-Aparts') && !noBandWarmups.has('Band Pull-Aparts'), { tier: tierWarmups.has('Band Pull-Aparts'), noBands: noBandWarmups.has('Band Pull-Aparts') })
  check('...and still there for a list that includes bands (the list decides, it does not just remove)', withBandsWarmups.has('Band Pull-Aparts'))
  // The warm-up's own map assumes no bar for a Minimalist. Asked through the
  // function the kit change uses, on a day holding both kit drills.
  const drillDay = { day: 'Monday', focus: 'x', exercises: [], warmup: { general: [], ramp_ups: [], mobility: [{ name: 'Dead Hang' }, { name: 'Band Pull-Aparts' }] } } as unknown as WorkoutDay
  check('a Minimalist is not assumed a bar to hang from; "no bands" does not give him one, "I\'ve got a pull-up bar" does',
    JSON.stringify(warmupDrillsNeedingMissingKit(drillDay, withKit(minimalistNoInjury, [{ mode: 'hasnt', items: ['bands'] }]))) === JSON.stringify(['Dead Hang', 'Band Pull-Aparts'])
    && JSON.stringify(warmupDrillsNeedingMissingKit(drillDay, withKit(minimalistNoInjury, [{ mode: 'has', items: ['pull_up_bar'] }]))) === JSON.stringify([])
    && JSON.stringify(warmupDrillsNeedingMissingKit(drillDay, withKit(samProfile({ equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['bands'] }]))) === JSON.stringify(['Band Pull-Aparts']),
    [warmupDrillsNeedingMissingKit(drillDay, withKit(minimalistNoInjury, [{ mode: 'hasnt', items: ['bands'] }])), warmupDrillsNeedingMissingKit(drillDay, withKit(minimalistNoInjury, [{ mode: 'has', items: ['pull_up_bar'] }]))])

  // -------------------------------------------------------------------------
  say('\n4. The tester: Minimalist, shoulder flag, {dumbbells, flat bench}')
  const samPlan = generate(samKitted, 'sam:2')
  // His week holds the loaded dumbbell row the tier plan never gave him (it
  // gave him a Backpack Row). NOT "his back day leads with it": on this seed
  // it leads Monday's pulling day and Tuesday's back day gets a Towel Row —
  // a cost of a thin honest kit, recorded in BACKLOG, that the dumbbell pack
  // (a separate job) is for.
  const rowDays = samPlan[0].days.filter(d => {
    const lead = d.exercises.find(e => getExerciseEntry(e.name)?.mechanics_tier === 'tier1_compound') ?? dayAnchorExercise(d.exercises)
    return d.exercises.some(e => e.name === 'Dumbbell Rows') && !!lead
  })
  check('his week holds a loaded dumbbell row, where the tier plan held a backpack one',
    rowDays.length >= 1 && samTierPlan[0].days.every(d => !d.exercises.some(e => e.name === 'Dumbbell Rows')) && samTierPlan[0].days.some(d => d.exercises.some(e => e.name === 'Backpack Row')),
    { kit: samPlan[0].days.map(d => `${d.focus}: ${d.exercises.map(e => e.name).join(', ')}`) })
  // ADJUSTMENT KEEPS THE BAR: every kit plan in the grid clears the floor the
  // quality grid holds every generated plan to.
  const floorMisses: string[] = []
  let scored = 0
  for (const k of KITS) for (const g of GRID) {
    const c = combo({ ...g, equipment: k.base })
    const profile = withKit({ ...buildProfile(c), id: 'p-grid', created_at: TODAY.toISOString() } as UserProfile, k.statements)
    const s = quiet(() => scorePlan(profile, generate(profile, `kit:${k.label}:${comboKey(c)}`), comboKey(c)))
    scored++
    if (s.overall < 7.2) floorMisses.push(`${k.label} ${comboKey(c)}: ${s.overall}`)
  }
  check(`every kit plan in the grid clears the 7.2 quality floor (${scored} plans)`, scored === KITS.length * GRID.length && floorMisses.length === 0, floorMisses)
  const banned = (n: string) => /\bband(ed)?\b|backpack|kettlebell/i.test(n) || outside(n, samKit).length > 0
  const badOn = (meso: MesocycleWeek[]) => meso.flatMap(w => w.days.flatMap(d => [
    ...d.exercises.map(e => e.name).filter(banned),
    ...warmupOutside(d, samKit),
  ].map(n => `wk${w.week_number} ${d.day} ${n}`)))
  const samBad = badOn(samPlan)
  check('no band, bag or kettlebell movement in any week, warm-ups included', samBad.length === 0, samBad.slice(0, 6))
  check('...where the tier-only plan has them (so the zero is real)', badOn(samTierPlan).length >= 3)
  const kneeEase = await hush(() => substituteForInjury({ mesocycle: samPlan, profile: samKitted, injuryCode: 'knees', targetDays: planDaysInWindow(samPlan, calendar, 14), exclusions: [], context }))
  check('the knee adaptation finds substitutes, and none is a band, bag or kettlebell movement',
    kneeEase.touchedSlots.length >= 2 && kneeEase.touchedSlots.every(s => !s.after || !banned(s.after)), kneeEase.touchedSlots.map(s => `${s.before} -> ${s.after}`))
  const kneeTier = await hush(() => substituteForInjury({ mesocycle: samTierPlan, profile: samProfile(), injuryCode: 'knees', targetDays: planDaysInWindow(samTierPlan, calendar, 14), exclusions: [], context }))
  check('...where on the tier alone it reaches for one', kneeTier.touchedSlots.some(s => !!s.after && banned(s.after)), kneeTier.touchedSlots.map(s => `${s.before} -> ${s.after}`))
  const travel = await hush(() => substituteForEquipment({ mesocycle: samPlan, profile: samKitted, equipmentTier: 'bodyweight', targetDays: planDaysInWindow(samPlan, calendar, 7), exclusions: [], context }))
  check('the travel card changes the loaded slots, and puts no band or bag movement in (he has neither)',
    travel.touchedSlots.length >= 2 && travel.touchedSlots.every(s => !s.after || !/\bband(ed)?\b|backpack/i.test(s.after)), travel.touchedSlots.map(s => `${s.before} -> ${s.after}`))
  check('...and nothing it brings in needs his dumbbells or bench: they are at home',
    travel.touchedSlots.every(s => !s.after || outside(s.after, eq => eq === 'bodyweight' || eq === 'pull-up bar').length === 0), travel.touchedSlots.map(s => `${s.before} -> ${s.after}`))

  // -------------------------------------------------------------------------
  say('\n5. Ceilings: never the answer or the question for an implement they do not have')
  const goblet = getExerciseEntry('Goblet Squats')!
  const swing = getExerciseEntry('Kettlebell Swing (Heavy)')!
  const backpackRow = getExerciseEntry('Backpack Row')!
  const both = samProfile({ max_dumbbell_kg: 20, max_single_implement_kg: 32 })
  check('no kit list: a dumbbell-or-kettlebell lift is capped by the heavier stated one, as before', statedCeilingKg(goblet, both) === 32)
  check('said "no kettlebell": the same lift uses the dumbbell ceiling, whatever kettlebell number is on file',
    statedCeilingKg(goblet, withKit(both, [{ mode: 'hasnt', items: ['kettlebell'] }])) === 20
    && statedCeilingKg(goblet, withKit(both, [{ mode: 'only', items: ['dumbbells', 'bench'] }])) === 20)
  check('said "no dumbbells": it uses the kettlebell ceiling', statedCeilingKg(goblet, withKit(both, [{ mode: 'hasnt', items: ['dumbbells'] }])) === 32)
  check('the kinds the clamp reads and the kinds the question reads are the same function, kit included',
    JSON.stringify(ceilingKindsFor(goblet, withKit(both, [{ mode: 'hasnt', items: ['kettlebell'] }]))) === JSON.stringify(['dumbbell'])
    && JSON.stringify(ceilingKindsFor(goblet)) === JSON.stringify(['dumbbell', 'single_implement'])
    && JSON.stringify(ceilingKindsFor(goblet, both)) === JSON.stringify(['dumbbell', 'single_implement'])
    && JSON.stringify(ceilingKindsFor(swing, withKit(both, [{ mode: 'hasnt', items: ['kettlebell'] }]))) === JSON.stringify([]))
  const dayOf = (...names: string[]) => ({ day: 'Monday', focus: 'x', exercises: names.map(name => ({ id: name, name, sets: 3, reps: '8-10', rest: '60s', substitution: '' })) }) as unknown as WorkoutDay
  const unstated = samProfile({ max_dumbbell_kg: undefined })
  check('no kit list: a kettlebell lift raises the kettlebell question, a bag lift the bag question (unchanged)',
    ceilingToAskFor(unstated, dayOf('Kettlebell Swing (Heavy)')) === 'single_implement' && ceilingToAskFor(unstated, dayOf('Backpack Row')) === 'improvised')
  check('said "no kettlebell": never asked "What is your heaviest kettlebell?"',
    ceilingToAskFor(withKit(unstated, [{ mode: 'hasnt', items: ['kettlebell'] }]), dayOf('Kettlebell Swing (Heavy)', 'Goblet Squats')) === 'dumbbell'
    && ceilingToAskFor(withKit(unstated, [{ mode: 'hasnt', items: ['kettlebell'] }]), dayOf('Kettlebell Swing (Heavy)')) === null)
  check('said "no bag": never asked what the bag holds',
    ceilingToAskFor(withKit(unstated, [{ mode: 'hasnt', items: ['weighted_bag'] }]), dayOf('Backpack Row')) === null
    && statedCeilingKg(backpackRow, withKit(samProfile({ max_improvised_kg: 15 }), [{ mode: 'hasnt', items: ['weighted_bag'] }])) === null)
  check('a list that makes a full-gym member a home trainee starts the asking; a full gym less bands is still never asked',
    ceilingToAskFor(withKit(samProfile({ equipment_access: 'full_gym', max_dumbbell_kg: undefined }), [{ mode: 'only', items: ['dumbbells'] }]), dayOf('Dumbbell Curls')) === 'dumbbell'
    && ceilingToAskFor(withKit(samProfile({ equipment_access: 'full_gym', max_dumbbell_kg: undefined }), [{ mode: 'hasnt', items: ['bands'] }]), dayOf('Dumbbell Curls')) === null)

  // -------------------------------------------------------------------------
  say('\n6. The warning says what they said; a travel tier describes somewhere else')
  const benchPress = getExerciseEntry('Dumbbell Bench Press')!
  const tBar = getExerciseEntry('T-Bar Rows')!
  const warn = (e: ExerciseEntry, p: UserProfile) => getExerciseCompatibilityWarnings(e, p, [])
  check('no kit list: the tier wording is unchanged', JSON.stringify(warn(benchPress, samProfile({ injuries: [] }))) === JSON.stringify(['Needs bench — outside your minimalist equipment.']), warn(benchPress, samProfile({ injuries: [] })))
  check('with a kit list: the reason is the kit they told me about',
    JSON.stringify(warn(benchPress, withKit(samProfile({ injuries: [] }), [{ mode: 'only', items: ['dumbbells'] }]))) === JSON.stringify(["Needs bench — not in the kit you've told me you have."]),
    warn(benchPress, withKit(samProfile({ injuries: [] }), [{ mode: 'only', items: ['dumbbells'] }])))
  check('...and for an either-or lift with neither, it names both with "or"',
    JSON.stringify(warn(tBar, withKit(samProfile({ injuries: [], equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }]))) === JSON.stringify(["Needs t-bar or barbell — not in the kit you've told me you have."]),
    warn(tBar, withKit(samProfile({ injuries: [], equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }])))
  check('...and no warning at all for something the list added', warn(benchPress, withKit(samProfile({ injuries: [] }), [{ mode: 'has', items: ['bench'] }])).length === 0)
  const away = constraintProfile(samKitted, { temporaryInjuries: [], temporaryEquipment: 'home_gym' })
  check('a travel tier uses that tier\'s plain set: a barbell lift he does not own is allowed there',
    isEquipmentAllowed(getExerciseEntry('Barbell Rows')!, away) && !isEquipmentAllowed(getExerciseEntry('Barbell Rows')!, samKitted))
  check('...but a bag or bands he has said he does not have do not appear there either',
    !isEquipmentAllowed(getExerciseEntry('Backpack Row')!, away) && !isEquipmentAllowed(getExerciseEntry('Band Tricep Kickback')!, away))
  check('with no kit list a travel tier is exactly the tier (unchanged)',
    isEquipmentAllowed(getExerciseEntry('Backpack Row')!, constraintProfile(samProfile(), { temporaryInjuries: [], temporaryEquipment: 'bodyweight' }))
    && constraintProfile(samProfile(), { temporaryInjuries: [], temporaryEquipment: 'bodyweight' }).kit_statements === undefined
    && constraintProfile(samProfile(), { temporaryInjuries: [], temporaryEquipment: 'bodyweight' }).equipment_access === 'bodyweight')
  check('no temporary change: the profile comes back as it was, kit and all', constraintProfile(samKitted, { temporaryInjuries: [], temporaryEquipment: null }) === samKitted)
  check('a temporary injury keeps the kit list', JSON.stringify(constraintProfile(samKitted, { temporaryInjuries: ['knees'], temporaryEquipment: null }).kit_statements) === JSON.stringify(samKitted.kit_statements) && samKitted.kit_statements !== undefined)

  // -------------------------------------------------------------------------
  say('\n7. The doors\' one function: trial -> what changes -> apply')
  // A stand-in database that records what it was ASKED (a fake that ignores
  // its arguments cannot see a missing write).
  const calls: { table: string; op: string; payload: unknown; filter?: unknown }[] = []
  let failWrites = false
  const tableProxy = (table: string): unknown => {
    let last: { table: string; op: string; payload: unknown; filter?: unknown } | null = null
    const chain: unknown = new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(failWrites && last
            ? { data: null, error: { message: 'offline' } }
            : { data: table === 'user_facts' ? { id: `new-${calls.length}` } : [], error: null })
        }
        return (...args: unknown[]) => {
          if (['insert', 'upsert', 'update', 'delete'].includes(String(prop))) { last = { table, op: String(prop), payload: args[0] }; calls.push(last) }
          if (prop === 'eq' && last) last.filter = args
          return chain
        }
      },
    })
    return chain
  }
  setSupabaseClient({ from: (table: string) => tableProxy(table), rpc: () => tableProxy('rpc') } as never)

  const tierPlan = generate(samProfile(), 'sam:2')
  const statements: Statement[] = [{ mode: 'only', items: ['dumbbells', 'bench'] }]
  // ONE DAY IS ALREADY TRAINED: a week-1 day that holds kit he does not have,
  // so the guard has something to protect (a guard on a day nothing would
  // touch proves nothing).
  const TRAINED = tierPlan[0].days.find(d => d.exercises.some(e => outside(e.name, samKit).length > 0))?.day ?? '(no week-1 day needs kit he lacks)'
  const trainedDay = (weekNumber: number, dayName: string) => weekNumber === 1 && dayName === TRAINED
  const guarded = { ...context, isProtected: trainedDay }
  const params = { profile: samProfile(), mesocycle: tierPlan, planCreatedAt: TODAY.toISOString(), statements, exclusions: [], source: 'chat' as const, rawPhrase: 'I only have dumbbells and a flat bench', context: guarded }
  const trial = await hush(() => planKitChange(params))
  check('the trial writes nothing', calls.length === 0, calls.map(c => `${c.table}.${c.op}`))
  check('the trial says what the kit was and what it becomes',
    JSON.stringify([...trial.kitBefore].sort()) === JSON.stringify(['bands', 'dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag'])
    && JSON.stringify([...trial.kitAfter].sort()) === JSON.stringify(['bench', 'dumbbells']), { before: trial.kitBefore, after: trial.kitAfter })
  const changed = trial.changedDays
  say(`   the tester's list: mode ${trial.mode}, ${trial.conflicts} slots needed kit he does not have, ${changed.length} days change, ${trial.warmupsRebuilt} warm-ups re-made`)
  check('it counts the slots that need kit he does not have, and names every day that changes with what it held and will hold',
    trial.conflicts >= 3 && changed.length >= 3 && changed.every(d => d.before.length > 0 && d.after.length > 0 && JSON.stringify(d.before) !== JSON.stringify(d.after)),
    { mode: trial.mode, conflicts: trial.conflicts, days: changed.length })
  check('every changed day carries its date, in date order, none before today',
    changed.length >= 3 && changed.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= calendar.today)
    && changed.every((d, i) => i === 0 || changed[i - 1].date <= d.date), changed.slice(0, 3).map(d => d.date))
  check('nothing it puts on any changed day needs kit he does not have', changed.length >= 3 && changed.every(d => d.after.every(n => outside(n, samKit).length === 0)),
    changed.flatMap(d => d.after.filter(n => outside(n, samKit).length > 0)).slice(0, 5))
  check('a trained day is never touched (the day guard)', changed.length >= 3 && changed.every(d => !(d.weekNumber === 1 && d.dayName === TRAINED))
    && trial.mesocycle[0].days.find(d => d.day === TRAINED) === tierPlan[0].days.find(d => d.day === TRAINED)
    && (tierPlan[0].days.find(d => d.day === TRAINED)?.exercises.some(e => outside(e.name, samKit).length > 0) ?? false))
  const untrainedDays = (m: MesocycleWeek[]) => m.flatMap(w => w.days.filter(d => !(w.week_number === 1 && d.day === TRAINED)))
  const trialNames = untrainedDays(trial.mesocycle).flatMap(d => d.exercises.map(e => e.name))
  check('from today to the end of the plan, nothing left needs kit he does not have', trialNames.every(n => outside(n, samKit).length === 0), [...new Set(trialNames.filter(n => outside(n, samKit).length > 0))])
  const trialWarm = untrainedDays(trial.mesocycle).flatMap(d => warmupOutside(d, samKit))
  check('...warm-ups included', trialWarm.length === 0 && untrainedDays(tierPlan).some(d => warmupOutside(d, samKit).length > 0), trialWarm.slice(0, 3))
  check('the summary a card can print has a line for the kit and a line for the plan',
    trial.summary.length === 2 && trial.summary[0] === 'Your kit: dumbbells and a flat bench.' && /already done stay as they are/.test(trial.summary[1] ?? ''), trial.summary)
  const again = await hush(() => planKitChange(params))
  check('asked twice, the trial gives the same plan (what the card shows is what confirm applies)', hash(trial.mesocycle) === hash(again.mesocycle))

  const applied = await hush(() => recordKitStatement(params))
  const factWrites = calls.filter(c => c.table === 'user_facts' && c.op === 'insert')
  const weekWrites = calls.filter(c => c.table === 'mesocycle_weeks' && c.op === 'upsert')
  const row = (factWrites[0]?.payload ?? {}) as Record<string, unknown>
  check('applying writes ONE fact row, in the shape the compiler reads',
    applied.saved && factWrites.length === 1 && row.kind === 'hard_constraint' && row.constraint_kind === 'equipment' && row.polarity === 'like' && row.hardness === 'hard'
    && JSON.stringify(row.resolved_refs) === JSON.stringify(['dumbbells', 'bench']) && row.source === 'chat' && row.profile_id === 'p-kit', { saved: applied.saved, row })
  const changedWeekCount = new Set(untrainedDays(trial.mesocycle).length ? trial.mesocycle.filter((w, i) => w !== tierPlan[i]).map(w => w.week_number) : []).size
  check('...and saves exactly the weeks that changed', weekWrites.length === changedWeekCount && changedWeekCount >= 1, { weekWrites: weekWrites.length, changedWeekCount })
  check('the plan is saved before the statement (a retry after half a save cannot double up)',
    calls.length >= 2 && calls.findIndex(c => c.table === 'user_facts') === calls.length - 1, calls.map(c => c.table))
  check('never a write to the profile row: the tier the person picked stays', calls.every(c => c.table !== 'fitness_profiles'), calls.filter(c => c.table === 'fitness_profiles'))
  check('what it returns is what the trial showed', hash(applied.mesocycle) === hash(trial.mesocycle) && JSON.stringify(applied.changedDays) === JSON.stringify(trial.changedDays) && changed.length >= 3)

  // A WHOLE-PLAN REBUILD when slot by slot would hollow it out: his shoulder
  // flag already removed most pressing, so the list leaves patterns empty.
  check('his list with a shoulder flag rebuilds the days from today rather than patching them', trial.mode === 'rebuild' && trial.touchedSlots.length === 0, trial.mode)

  // SLOT BY SLOT: "I don't own bands" on an uninjured Minimalist's plan.
  calls.length = 0
  const bandBase = samProfile({ injuries: [] })
  const bandPlan = generate(bandBase, 'sam:3')
  const noBand = (eq: string) => eq !== 'resistance band'
  const BAND_TRAINED = bandPlan[0].days.find(d => d.exercises.some(e => outside(e.name, noBand).length > 0))?.day ?? '(no week-1 day holds a band movement)'
  const bandGuard = { ...context, isProtected: (w: number, d: string) => w === 1 && d === BAND_TRAINED }
  const bandParams = { ...params, profile: bandBase, mesocycle: bandPlan, context: bandGuard, statements: [{ mode: 'hasnt', items: ['bands'] }] as Statement[], rawPhrase: "I don't own bands" }
  const bandTrial = await hush(() => planKitChange(bandParams))
  const touched = bandTrial.touchedSlots
  say(`   "no bands": mode ${bandTrial.mode}, ${touched.length} slots, ${bandTrial.warmupsRebuilt} warm-ups re-made`)
  check('slot by slot: every row is a slot that needed a band, and what replaces it does not',
    bandTrial.mode === 'substitute' && touched.length >= 1 && touched.every(s => outside(s.before, noBand).length > 0 && (!s.after || outside(s.after, noBand).length === 0)),
    { mode: bandTrial.mode, rows: touched.slice(0, 4).map(s => `${s.before} -> ${s.after}`) })
  check('...never on the trained day, which held one', touched.length >= 1 && touched.every(s => !(s.weekNumber === 1 && s.dayName === BAND_TRAINED))
    && bandTrial.mesocycle[0].days.find(d => d.day === BAND_TRAINED) === bandPlan[0].days.find(d => d.day === BAND_TRAINED))
  check('...and the plan line counts those slots', (bandTrial.summary[1] ?? '').startsWith(`${touched.length} exercise`) && / from /.test(bandTrial.summary[1] ?? ''), bandTrial.summary)
  const pure = await hush(() => substituteForKit({ mesocycle: bandPlan, profile: withKit(bandBase, [{ mode: 'hasnt', items: ['bands'] }]), targetDays: planDaysInWindow(bandPlan, calendar), exclusions: [], context: bandGuard }))
  check('the pure substitution gives the same rows as the trial', touched.length >= 1 && JSON.stringify(pure.touchedSlots.map(s => [s.before, s.after])) === JSON.stringify(touched.map(s => [s.before, s.after])))
  // A WARM-UP ALONE: a day whose exercises need no band but whose warm-up
  // asks for one. The fixture chooses the INPUT (a band drill in one warm-up of
  // an otherwise band-free plan); the trial decides what happens to it.
  const bandUntrained = (m: MesocycleWeek[]) => m.flatMap(w => w.days.filter(d => !(w.week_number === 1 && d.day === BAND_TRAINED)))
  const cleanPlan = (await hush(() => planKitChange(bandParams))).mesocycle
  const target = cleanPlan[1].days.find(d => d.exercises.length > 0 && d.exercises.every(e => outside(e.name, noBand).length === 0))
  const seeded: MesocycleWeek[] = cleanPlan.map((w, i) => i !== 1 ? w : {
    ...w,
    days: w.days.map(d => d !== target ? d : { ...d, warmup: { ...(d.warmup ?? { general: [], ramp_ups: [] }), mobility: [{ name: 'Band Pull-Aparts', prescription: '15 reps', purpose: 'x', duration_seconds: 45 }] } as never }),
  })
  const warmTrial = await hush(() => planKitChange({ ...bandParams, profile: withKit(bandBase, [{ mode: 'hasnt', items: ['kettlebell'] }]), mesocycle: seeded, statements: [{ mode: 'hasnt', items: ['bands'] }] }))
  const seededDay = warmTrial.mesocycle[1].days.find(d => d.day === target?.day)
  check('a day whose exercises need no band but whose warm-up does gets its warm-up re-made, and only its warm-up',
    !!target && warmupOutside(seeded[1].days.find(d => d.day === target.day)!, noBand).length === 1
    && warmTrial.warmupsRebuilt >= 1 && !!seededDay && warmupOutside(seededDay, noBand).length === 0
    && JSON.stringify(seededDay.exercises.map(e => e.name)) === JSON.stringify(target.exercises.map(e => e.name))
    && bandUntrained(warmTrial.mesocycle).every(d => warmupOutside(d, noBand).length === 0),
    { target: target?.day, rebuilt: warmTrial.warmupsRebuilt, after: seededDay && warmupNames(seededDay) })
  check('nothing was written by any of those trials', calls.length === 0, calls.map(c => `${c.table}.${c.op}`))

  // Redundant rows on file are retired on save, and only those.
  calls.length = 0
  const onFile = [
    { id: 'old-bands', statement: { mode: 'hasnt', items: ['bands'] } as Statement },
    { id: 'old-bench', statement: { mode: 'has', items: ['bench', 'kettlebell'] } as Statement },
  ]
  const reTick = await hush(() => recordKitStatement({ ...params, profile: withKit(samProfile(), onFile.map(f => f.statement)), statements: [{ mode: 'has', items: ['bands'] }], rawPhrase: 'ticked bands', onFile }))
  const retires = calls.filter(c => c.table === 'user_facts' && c.op === 'update')
  check('re-ticking bands retires the old "no bands" line and keeps the other',
    reTick.saved && JSON.stringify(reTick.retireIds) === JSON.stringify(['old-bands']) && retires.length === 1
    && (retires[0].payload as Record<string, unknown>).status === 'retired' && JSON.stringify(retires[0].filter) === JSON.stringify(['id', 'old-bands']),
    { retireIds: reTick.retireIds, retires })

  // A statement that changes nothing is not saved; one that conflicts with nothing is.
  calls.length = 0
  const already = await hush(() => recordKitStatement({ ...params, statements: [{ mode: 'has', items: ['dumbbells'] }], rawPhrase: "I've got dumbbells" }))
  check('a statement that changes nothing about the kit writes nothing and says so', !already.saved && /already/i.test(String(already.message)) && calls.length === 0, { already: already.message, calls })
  calls.length = 0
  const quietOne = await hush(() => recordKitStatement({ ...params, mesocycle: samPlan, profile: samKitted, statements: [{ mode: 'has', items: ['kettlebell'] }], rawPhrase: 'got a kettlebell' }))
  check('a statement nothing on the plan conflicts with is still remembered, changes no week, and says so',
    quietOne.saved && quietOne.touchedSlots.length === 0 && calls.filter(c => c.table === 'user_facts').length === 1 && calls.filter(c => c.table === 'mesocycle_weeks').length === 0
    && /nothing on your plan/i.test(quietOne.summary.join(' ')), { saved: quietOne.saved, calls: calls.map(c => `${c.table}.${c.op}`), summary: quietOne.summary })
  calls.length = 0
  const refused = await hush(() => recordKitStatement({ ...params, statements: [{ mode: 'hasnt', items: ['treadmill' as KitItem] }] }))
  check('a statement naming nothing from the nine is refused and writes nothing', !refused.saved && !!refused.message && calls.length === 0, { refused: refused.message, calls })
  // A failed save says so.
  calls.length = 0
  failWrites = true
  const failed = await hush(() => recordKitStatement(params).catch(() => ({ saved: 'threw', message: null }) as never))
  failWrites = false
  check('a save that fails says it did not save (never a silent success, never a throw), and hands back the plan it had',
    failed.saved === false && /didn.t save/i.test(String(failed.message)) && failed.mesocycle === tierPlan, { saved: failed.saved, message: failed.message })
  // A new equipment choice clears every kit row.
  calls.length = 0
  const notCleared = await clearKitStatements(onFile)
  check('a new equipment choice retires every kit row on file', notCleared === 0 && calls.filter(c => c.table === 'user_facts' && c.op === 'update').length === 2)

  // -------------------------------------------------------------------------
  say('\n8. One reader of the tier, one place the kit is attached, both doors on one controller')
  const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n'"`]*$/gm, '$1')
  const read = (path: string) => { try { return strip(readFileSync(path, 'utf8')) } catch { return '' } }
  const ENGINE = ['exercise-plan.ts', 'mesocycle-edit.ts', 'exercise-add-candidates.ts', 'quality-score.ts', 'load-prescription.ts', 'load-ceiling-prompt.ts', 'warmup.ts', 'session-rebuild.ts', 'plan-adaptations.ts', 'settle-week.ts', 'periodization.ts']
  // Reading the stored tier directly is how an engine path ignores the list.
  // `equipment_access:` (writing a clone's key) is not a read; the two
  // functions that ARE the answer (allowedEquipmentFor's no-list branch and
  // the trace wording) are named.
  const ALLOWED_READS = [/^\s*if \(!kit\) return EQUIPMENT_SETS\[profile\.equipment_access \|\| 'full_gym'\]/, /has \$\{who\.equipment_access \|\| 'full_gym'\} equipment/, /const tier = profile\.equipment_access \|\| 'full_gym'$/]
  const directReads = ENGINE.flatMap(f => read(`src/lib/${f}`).split('\n')
    .filter(line => /[\w)?]\.equipment_access\b(?!\s*:)/.test(line) && !ALLOWED_READS.some(r => r.test(line)))
    .map(line => `${f}: ${line.trim().slice(0, 90)}`))
  check('no engine file reads the stored tier directly; they ask equipmentTierFor / allowedEquipmentFor', directReads.length === 0, directReads)
  check('...and the detector sees one when it is there',
    /[\w)?]\.equipment_access\b(?!\s*:)/.test('const t = profile.equipment_access || "full_gym"') && !/[\w)?]\.equipment_access\b(?!\s*:)/.test('const c = { ...p, equipment_access: tier }'))
  const plan = read('src/lib/exercise-plan.ts')
  check('isEquipmentAllowed and the equipment stage both go through allowedEquipmentFor(',
    /export function isEquipmentAllowed\([^)]*\)[^{]*\{[\s\S]{0,200}?allowedEquipmentFor\(/.test(plan) && /function stageEquipmentFilter\([\s\S]{0,400}?allowedEquipmentFor\(/.test(plan))
  const app = read('src/App.tsx')
  check('App attaches the kit in one derivation: the profile every tab receives is the stored one plus the compiled statements',
    /const profile = useMemo\(\s*\(\) => \(?storedProfile \? profileWithKit\(storedProfile, compileKitStatements\(memoryFacts\)\)/.test(app)
    && /const \[storedProfile, setProfile\] = useState<UserProfile \| null>\(null\)/.test(app))
  check('...the cold-load chain compiles it with the same two functions from its own read, and sets both together',
    (app.match(/profileWithKit\(/g) ?? []).length === 2 && (app.match(/compileKitStatements\(/g) ?? []).length === 2
    && /setMemoryFacts\(restoredFacts\)\s*\n\s*setProfile\(savedProfile\)/.test(app))
  check('App builds ONE kit controller from kit-change.ts and hands it to Profile',
    /const kitController: KitController \| null =/.test(app) && /makeKitController\(\{/.test(app) && /kit=\{kitController\}/.test(app))
  const profileScreen = read('src/components/ProfileScreen.tsx')
  const ticks = read('src/components/KitTicks.tsx')
  check('Profile\'s Equipment sheet renders the ticks from that controller', /<KitTicks profile=\{profile\} kit=\{kit\} \/>/.test(profileScreen))
  check('...which show the change before saving (kit.plan) and save through the same function (kit.apply)', /kit\.plan\(/.test(ticks) && /kit\.apply\(/.test(ticks))
  check('a new equipment choice clears the list BEFORE the rebuild is offered',
    /if \(equipmentChoiceMoved\) await onEquipmentChoiceChanged\?\.\(\)[\s\S]{0,300}?if \(invalidation\) onPlanInvalidated/.test(profileScreen)
    && /onEquipmentChoiceChanged=\{handleEquipmentChoiceChanged\}/.test(app) && /clearKitStatements\(/.test(app))
  const eff = read('src/lib/effective-constraints.ts')
  check('a travel tier is laid over the profile through travelProfile(', /travelProfile\(/.test(eff))
  const adapt = read('src/lib/plan-adaptations.ts')
  check('...and so is the travel card\'s own substitution', /export async function substituteForEquipment[\s\S]{0,1400}?travelProfile\(/.test(adapt))

  // -------------------------------------------------------------------------
  say('\n9. The coach and setup reach the same function')
  // 9a. THE GUARD, on sentences. Each case is a statement a model might make
  // and the words the person actually typed.
  const said = (mode: KitStatement['mode'], items: KitItem[], text: string) => kitStatementInUserWords({ mode, items }, text)
  const GUARD: [string, boolean, boolean][] = [
    ['I\'ve got dumbbells and a bench', said('only', ['dumbbells', 'bench'], 'I\'ve got dumbbells and a bench'), true],
    ['I don\'t own bands', said('hasnt', ['bands'], 'I don\'t own bands'), true],
    ['no pull-up bar', said('hasnt', ['pull_up_bar'], 'no pull-up bar'), true],
    ['I don\'t have a barbell, just dumbbells -> has dumbbells', said('has', ['dumbbells'], 'I don\'t have a barbell, just dumbbells'), true],
    ['I don\'t have a barbell, just dumbbells -> hasnt barbell', said('hasnt', ['barbell'], 'I don\'t have a barbell, just dumbbells'), true],
    // No comma: only the turning word ends the clause the negation belongs to.
    ['no barbell but I do have dumbbells -> has dumbbells', said('has', ['dumbbells'], 'no barbell but I do have dumbbells'), true],
    ['dumbbells at home -> only dumbbells, kettlebell, bands (invented)', said('only', ['dumbbells', 'kettlebell', 'bands'], 'just some dumbbells at home'), false],
    ['no bench -> has bench (turned round)', said('has', ['bench'], 'dumbbells but no bench'), false],
    ['I\'ve got bands -> hasnt bands (turned round)', said('hasnt', ['bands'], 'I\'ve got bands'), false],
    ['I can bench 80 -> has bench (a lift, not a bench)', said('has', ['bench'], 'I can bench press 80kg'), false],
    ['empty text', said('has', ['bench'], ''), false],
  ]
  const guardWrong = GUARD.filter(([, got, want]) => got !== want).map(([label]) => label)
  check(`the own-words guard keeps what was said and refuses what was not (${GUARD.length} sentences, both directions)`, guardWrong.length === 0, guardWrong)

  // 9b. The coach.
  const chat = read('src/components/ChatAssistant.tsx')
  const fn = read('supabase/functions/chat-gemini/index.ts')
  check('the coach has a propose_kit_change tool that names the nine and the three kinds, and a courier handler',
    /name: "propose_kit_change"/.test(fn) && KIT_ITEMS.every(i => fn.includes(`"${i}"`)) && /enum: \["has", "hasnt", "only"\]/.test(fn)
    && /if \(name === "propose_kit_change"\)[\s\S]{0,700}?kind: "propose_kit_change"/.test(fn))
  const builder = chat.match(/const buildKitChangeProposal = async[\s\S]*?\n {2}\}\n/)?.[0] ?? ''
  check('...whose card is refused unless the kit is in her own words, BEFORE the trial is asked',
    builder.length > 0 && builder.indexOf('kitStatementInUserWords(') > 0 && builder.indexOf('kitStatementInUserWords(') < builder.indexOf('kitController.plan('))
  check('...and the dispatch hands it what she typed, not the model\'s quote',
    /buildKitChangeProposal\(result\.proposal\.rawArgs, userSaid\)/.test(chat))
  check('...priced and confirmed by the controller App hands both doors (never a second copy)',
    /kitController\.plan\(/.test(builder) && /row\.kind === 'propose_kit_change'[\s\S]{0,700}?kitController\.apply\(/.test(chat) && /kitController=\{kitController\}/.test(app) && /kit=\{kitController\}/.test(app))
  check('the coach is told the kit the plan is built from', /kit_said:/.test(chat) && /Their kit: \$\{context\.profile\.kit_said/.test(fn))

  // 9c. Setup.
  const convo = read('src/components/onboarding/ConversationalOnboarding.tsx')
  check('setup records kit only from the person\'s own words (the twin of the ceiling guard)',
    /if \(key === 'kitList'\) \{[\s\S]{0,300}?kitStatementInUserWords\(said, userText\)[\s\S]{0,200}?continue/.test(convo))
  const assembled = assembleProfile({ ...initialSlotValues(), equipment: 'minimalist', kitList: 'only: dumbbells, bench' } as never)
  const assembledNone = assembleProfile({ ...initialSlotValues(), equipment: 'minimalist' } as never)
  check('the kit said in setup is on the profile the first plan is built from; nothing said, nothing attached',
    JSON.stringify(assembled.kit_statements) === JSON.stringify([{ mode: 'only', items: ['dumbbells', 'bench'] }]) && !('kit_statements' in assembledNone))
  check('...and it is remembered after the insert as the same kit row the other doors write',
    /enrichedProfile\.kit_statements[\s\S]{0,400}?createFact\(\{ profileId: data\.id, \.\.\.kitStatementFact\(statement, \{ source: 'onboarding'/.test(app))
  check('the slot reads back what the prompt tells the model to write, and refuses anything else',
    JSON.stringify(parseKitSlot('only: dumbbells, bench')) === JSON.stringify({ mode: 'only', items: ['dumbbells', 'bench'] })
    && JSON.stringify(parseKitSlot('hasnt: pull-up bar')) === JSON.stringify({ mode: 'hasnt', items: ['pull_up_bar'] })
    && parseKitSlot('only: dumbbells, treadmill') === null && parseKitSlot('dumbbells') === null)
  check('NO NEW SETUP QUESTION: the slot never blocks and nothing asks it',
    NEVER_BLOCKING_SLOTS.includes('kitList') && !openSlotsInOrder(new Set(), initialSlotValues()).includes('kitList'))

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) { console.error('test:kit-list FAILED'); process.exit(1) }
  console.log('test:kit-list PASSED')
}

main().catch(err => { console.error(err); console.log(`\n${ran} checks ran, ${failures + 1} failed.`); process.exit(1) })
