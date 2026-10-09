// ---------------------------------------------------------------------------
// Gate: THE KIT YOU ACTUALLY HAVE. (docs/plans/kit-list.md; test log H1-H3.)
//
// Ashley, 9 Oct 2026: "Remember what they say": keep the four choices; also
// remember specifics people say ("I've got dumbbells and a bench", "I don't
// own bands"). Nobody's plan changes unless they say something.
//
// WRITTEN BEFORE THE BUILD AND SEEN RED. What it holds:
//   1. the list resolves the way the plan says (order, the three kinds of
//      statement, the derived tier, the small extras);
//   2. a profile with NO kit rows generates byte-identical plans (seeded) —
//      absent, empty, and compiled from facts that are not kit rows;
//   3. for each kit in a small grid, nothing generated, swapped, added,
//      rebuilt, injury-substituted or put in a warm-up needs an implement
//      outside the kit — by this gate's OWN table and by the constraint
//      audit's independent copy;
//   4. the tester's profile with {dumbbells, flat bench};
//   5. ceilings: never the answer, or the question, for an implement the
//      person has said they do not have;
//   6. the warning wording; a travel tier describes somewhere else;
//   7. the doors' one function (record -> trial -> apply), against a stand-in
//      database, never touching a trained day;
//   8. source properties: one reader of the tier, one place the profile is
//      given its kit, an audit that shares no code with the engine.
//
// THE CHECK COUNT IS THE SAME EVERY RUN. A handle the engine does not export
// yet is a FAIL on its own line, and everything that depends on it fails on
// its own line too — never a skipped section. ONE EXIT, at the bottom.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as planModule from '../src/lib/exercise-plan'
import {
  generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool, getExerciseCompatibilityWarnings,
} from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, getMovementFamily, type ExerciseEntry } from '../src/lib/exercise-db'
import { scorePlan } from '../src/lib/quality-score'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { dayAnchorExercise } from '../src/lib/session-derive'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { getAdditionCandidates } from '../src/lib/exercise-add-candidates'
import { rebuildDayAroundMainLift } from '../src/lib/session-rebuild'
import * as adaptations from '../src/lib/plan-adaptations'
import { substituteForInjury, substituteForEquipment, rebuildAgainstProfile, untrainedPlanContext } from '../src/lib/plan-adaptations'
import { planDaysInWindow } from '../src/lib/plan-guard'
import * as constraintsModule from '../src/lib/effective-constraints'
import * as loadModule from '../src/lib/load-prescription'
import { ceilingToAskFor } from '../src/lib/load-ceiling-prompt'
import * as compiler from '../src/lib/fact-compiler'
import * as auditModule from '../src/lib/dev-constraint-audit'
import { setSupabaseClient } from '../src/lib/supabase'
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

// ---- handles the build introduces. Absent = failing checks, not a crash. ----
type Mode = 'has' | 'hasnt' | 'only'
type Statement = { mode: Mode; items: string[] }
type Resolved = { items: ReadonlySet<string>; exhaustive: boolean; baseTier: EquipmentAccess; tier: EquipmentAccess }
type KitProfile = UserProfile & { kit_statements?: Statement[] }
interface KitListModule {
  KIT_ITEMS?: readonly string[]
  KIT_ITEM_EQUIPMENT?: Record<string, readonly string[]>
  resolveKit?: (tier: EquipmentAccess, statements: Statement[] | undefined) => Resolved | null
  kitOf?: (profile: KitProfile) => Resolved | null
  equipmentTierFor?: (profile: KitProfile) => EquipmentAccess | undefined
  ownsKitItem?: (profile: KitProfile, item: string) => boolean | null
  profileWithKit?: <P extends UserProfile>(profile: P, statements: Statement[]) => P
  travelProfile?: <P extends UserProfile>(profile: P, tier: EquipmentAccess) => P
  kitStatementFact?: (statement: Statement, from: { source: 'chat' | 'manual' | 'onboarding'; rawPhrase: string }) => Record<string, unknown>
  describeKitStatement?: (statement: Statement) => string
}
const kit: KitListModule = await import('../src/lib/kit-list').then(m => m as KitListModule).catch(() => ({}))
interface KitChangeModule {
  planKitChange?: (params: Record<string, unknown>) => Promise<KitChangePlan>
  recordKitStatement?: (params: Record<string, unknown>) => Promise<KitChangePlan & { saved: boolean; message: string | null }>
}
interface KitChangePlan {
  mesocycle: MesocycleWeek[]
  touchedSlots: { weekNumber: number; dayName: string; before: string; after: string | null }[]
  mode: string
  kitBefore: string[]
  kitAfter: string[]
  summary: string[]
}
const kitChange: KitChangeModule = await import('../src/lib/kit-change').then(m => m as KitChangeModule).catch(() => ({}))

const allowedEquipmentFor = (planModule as Record<string, unknown>).allowedEquipmentFor as
  ((profile: KitProfile) => { has(eq: string): boolean } | null) | undefined
const isEquipmentAllowed = planModule.isEquipmentAllowed as unknown as (entry: ExerciseEntry, who: EquipmentAccess | KitProfile) => boolean
const compileKitStatements = (compiler as Record<string, unknown>).compileKitStatements as ((facts: UserFactRow[]) => Statement[]) | undefined
const auditEquipmentViolations = (auditModule as Record<string, unknown>).auditEquipmentViolations as
  ((profile: KitProfile, names: string[]) => { exercise: string; missing: string[] }[]) | undefined
const substituteForKit = (adaptations as Record<string, unknown>).substituteForKit as
  ((params: Record<string, unknown>) => Promise<{ mesocycle: MesocycleWeek[]; touchedSlots: { before: string; after: string | null }[] }>) | undefined
const constraintProfile = constraintsModule.constraintProfile as unknown as (profile: KitProfile, c: { temporaryInjuries: string[]; temporaryEquipment: EquipmentAccess | null }) => KitProfile
const prescribeLoad = loadModule.prescribeLoad as unknown as (entry: ExerciseEntry, profile: UserProfile, options: Record<string, unknown>) => { starting_weight_kg: number | null } | null
const statedCeilingKg = loadModule.statedCeilingKg as unknown as (entry: ExerciseEntry, profile: KitProfile) => number | null
const ceilingKindsFor = loadModule.ceilingKindsFor as unknown as (entry: ExerciseEntry, profile?: KitProfile) => string[]

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
const withKit = (profile: UserProfile, statements: Statement[]): KitProfile =>
  kit.profileWithKit ? kit.profileWithKit(profile, statements) as KitProfile : profile
const allNames = (meso: MesocycleWeek[]) => [...new Set(meso.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))]

// A FIXED MONDAY, never the machine's calendar: every path below is handed its
// calendar (the trial takes a context), so the gate gives the same answer on
// any day it is run. The plan was made that morning, so week 1's Monday IS
// today — the day the trained-day guard below protects.
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

const fact = (over: Partial<UserFactRow>): UserFactRow => ({
  id: `f-${Math.random()}`, profile_id: 'p-kit', kind: 'hard_constraint', status: 'active', source: 'chat',
  source_message_id: null, raw_phrase: '', display_text: '', supersedes_id: null, polarity: null, hardness: null,
  resolved_refs: null, timing_subject: null, timing_relation: null, timing_anchor: null, timing_slot: null,
  constraint_kind: 'equipment', weekday: null, client_id: null, created_at: '2026-10-09T10:00:00Z', retired_at: null,
  ...over,
})

// ===========================================================================
async function main() {
  // -------------------------------------------------------------------------
  say('\n0. The handles the doors will call exist')
  check('kit-list exports the closed list of nine and what each unlocks', Array.isArray(kit.KIT_ITEMS) && kit.KIT_ITEMS.length === 9 && !!kit.KIT_ITEM_EQUIPMENT, kit.KIT_ITEMS)
  check('kit-list exports resolveKit, kitOf, equipmentTierFor, ownsKitItem, profileWithKit, travelProfile',
    [kit.resolveKit, kit.kitOf, kit.equipmentTierFor, kit.ownsKitItem, kit.profileWithKit, kit.travelProfile].every(f => typeof f === 'function'))
  check('kit-list exports the one fact shape the doors write, and its words', typeof kit.kitStatementFact === 'function' && typeof kit.describeKitStatement === 'function')
  check('the engine exports allowedEquipmentFor(profile)', typeof allowedEquipmentFor === 'function')
  check('the fact compiler exports compileKitStatements', typeof compileKitStatements === 'function')
  check('the audit exports its own independent checker', typeof auditEquipmentViolations === 'function')
  check('the doors have one function: planKitChange (trial) and recordKitStatement (trial then apply)',
    typeof kitChange.planKitChange === 'function' && typeof kitChange.recordKitStatement === 'function')

  // -------------------------------------------------------------------------
  say('\n1. The list resolves the way the plan says')
  const resolve = (tier: EquipmentAccess, statements: Statement[]) => kit.resolveKit?.(tier, statements) ?? null
  const items = (r: Resolved | null) => (r ? [...r.items].sort() : null)
  check('the engine\'s nine are this gate\'s nine, string for string',
    !!kit.KIT_ITEM_EQUIPMENT && Object.keys(OWN_ITEM_STRINGS).every(k => JSON.stringify([...(kit.KIT_ITEM_EQUIPMENT![k] ?? [])].sort()) === JSON.stringify([...OWN_ITEM_STRINGS[k]].sort()))
    && Object.keys(kit.KIT_ITEM_EQUIPMENT).length === 9, kit.KIT_ITEM_EQUIPMENT)
  check('no statements means no kit list at all (the tier decides)', kit.resolveKit !== undefined && resolve('minimalist', []) === null && kit.resolveKit('minimalist', undefined) === null)
  check('"I don\'t own bands" on Minimalist removes bands and nothing else',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'hasnt', items: ['bands'] }]))) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']),
    items(resolve('minimalist', [{ mode: 'hasnt', items: ['bands'] }])))
  check('"I\'ve got a bench too" on Minimalist adds the bench',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'has', items: ['bench'] }]))) === JSON.stringify(['bands', 'bench', 'dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']),
    items(resolve('minimalist', [{ mode: 'has', items: ['bench'] }])))
  check('"I only have dumbbells and a flat bench" is exactly that',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'only', items: ['dumbbells', 'bench'] }]))) === JSON.stringify(['bench', 'dumbbells'])
    && resolve('minimalist', [{ mode: 'only', items: ['dumbbells', 'bench'] }])?.exhaustive === true)
  check('statements apply in the order they were said: a later one wins',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'hasnt', items: ['bands'] }, { mode: 'has', items: ['bands'] }]))) === JSON.stringify(['bands', 'dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag'])
    && JSON.stringify(items(resolve('minimalist', [{ mode: 'has', items: ['bands'] }, { mode: 'hasnt', items: ['bands'] }]))) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']))
  check('...and a remark after a list adds to the list rather than undoing it',
    JSON.stringify(items(resolve('minimalist', [{ mode: 'only', items: ['dumbbells'] }, { mode: 'has', items: ['pull_up_bar'] }]))) === JSON.stringify(['dumbbells', 'pull_up_bar'])
    && resolve('minimalist', [{ mode: 'only', items: ['dumbbells'] }, { mode: 'has', items: ['pull_up_bar'] }])?.exhaustive === true)
  check('an item that is not one of the nine is ignored, and a statement of nothing but those is no statement',
    resolve('minimalist', [{ mode: 'hasnt', items: ['treadmill'] }]) === null
    && JSON.stringify(items(resolve('minimalist', [{ mode: 'hasnt', items: ['treadmill', 'bands'] }]))) === JSON.stringify(['dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag']))
  // The derived tier.
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
    !!kit.profileWithKit && !!kit.equipmentTierFor
    && withKit(samProfile({ equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }]).equipment_access === 'home_gym'
    && kit.equipmentTierFor(withKit(samProfile({ equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }])) === 'minimalist'
    && kit.equipmentTierFor(samProfile({ equipment_access: 'home_gym' }) as KitProfile) === 'home_gym')
  check('profileWithKit with no statements hands back the very same object', !!kit.profileWithKit && (() => { const p = samProfile(); return kit.profileWithKit!(p, []) === p })())
  // The small extras.
  const allows = (profile: KitProfile, eq: string) => { const a = allowedEquipmentFor?.(profile); return a === undefined ? null : a === null ? true : a.has(eq) }
  const home = samProfile({ equipment_access: 'home_gym' })
  check('"I don\'t own bands" on Home gym says nothing about the box, the dip bars or the ab wheel',
    ['plyo box', 'dip bars', 'ab wheel', 'medicine ball', 'jump rope', 'barbell', 'bench'].every(eq => allows(withKit(home, [{ mode: 'hasnt', items: ['bands'] }]), eq) === true)
    && allows(withKit(home, [{ mode: 'hasnt', items: ['bands'] }]), 'resistance band') === false)
  check('a list given as the whole kit leaves the small extras out',
    ['plyo box', 'dip bars', 'ab wheel', 'medicine ball', 'jump rope', 'kettlebell', 'resistance band', 'weighted backpack', 'pull-up bar'].every(eq => allows(withKit(home, [{ mode: 'only', items: ['dumbbells', 'bench'] }]), eq) === false)
    && ['dumbbells', 'dumbbell', 'bench', 'bodyweight'].every(eq => allows(withKit(home, [{ mode: 'only', items: ['dumbbells', 'bench'] }]), eq) === true))
  check('a full gym less bands keeps the machines and the cables',
    ['cable machine', 'machine', 'leg press machine', 'barbell', 'kettlebell'].every(eq => allows(withKit(samProfile({ equipment_access: 'full_gym' }), [{ mode: 'hasnt', items: ['bands'] }]), eq) === true)
    && allows(withKit(samProfile({ equipment_access: 'full_gym' }), [{ mode: 'hasnt', items: ['bands'] }]), 'resistance band') === false)
  check('...and a list given by a full-gym member is only the list',
    allows(withKit(samProfile({ equipment_access: 'full_gym' }), [{ mode: 'only', items: ['dumbbells'] }]), 'cable machine') === false)
  check('no kit list: allowedEquipmentFor is the tier\'s own answer (everything at a full gym)',
    allowedEquipmentFor !== undefined && allowedEquipmentFor(samProfile({ equipment_access: 'full_gym' }) as KitProfile) === null
    && allows(samProfile() as KitProfile, 'resistance band') === true && allows(samProfile() as KitProfile, 'bench') === false)
  // Facts.
  const rows: UserFactRow[] = [
    fact({ polarity: 'like', hardness: 'hard', resolved_refs: ['dumbbells', 'bench'], created_at: '2026-10-09T10:00:00Z' }),
    fact({ polarity: 'dislike', resolved_refs: ['bands'], created_at: '2026-10-09T11:00:00Z' }),
    fact({ polarity: 'like', resolved_refs: ['pull_up_bar'], created_at: '2026-10-09T12:00:00Z' }),
  ]
  const compiled = compileKitStatements?.(rows) ?? null
  check('facts compile to statements: like+hard = only, dislike = hasn\'t, like = has, oldest first',
    JSON.stringify(compiled) === JSON.stringify([
      { mode: 'only', items: ['dumbbells', 'bench'] }, { mode: 'hasnt', items: ['bands'] }, { mode: 'has', items: ['pull_up_bar'] },
    ]), compiled)
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
    compileKitStatements !== undefined && compileKitStatements(notKit).length === 0, compileKitStatements?.(notKit))
  const written = kit.kitStatementFact?.({ mode: 'only', items: ['dumbbells', 'bench'] }, { source: 'chat', rawPhrase: 'I only have dumbbells and a flat bench' }) ?? {}
  check('the one fact shape the doors write is a row the schema already accepts',
    written.kind === 'hard_constraint' && written.constraintKind === 'equipment' && written.polarity === 'like' && written.hardness === 'hard'
    && JSON.stringify(written.resolvedRefs) === JSON.stringify(['dumbbells', 'bench']) && written.source === 'chat'
    && written.rawPhrase === 'I only have dumbbells and a flat bench' && typeof written.displayText === 'string' && (written.displayText as string).length > 0, written)
  const roundTrip = (s: Statement) => {
    const w = kit.kitStatementFact?.(s, { source: 'manual', rawPhrase: 'x' })
    if (!w || !compileKitStatements) return null
    return compileKitStatements([fact({ polarity: w.polarity as never, hardness: (w.hardness ?? null) as never, resolved_refs: w.resolvedRefs as string[] })])[0] ?? null
  }
  check('what a door writes is what the compiler reads back, for all three kinds',
    (['has', 'hasnt', 'only'] as Mode[]).every(mode => JSON.stringify(roundTrip({ mode, items: ['kettlebell', 'bands'] })) === JSON.stringify({ mode, items: ['kettlebell', 'bands'] })),
    (['has', 'hasnt', 'only'] as Mode[]).map(mode => roundTrip({ mode, items: ['kettlebell', 'bands'] })))
  const words = (s: Statement) => kit.describeKitStatement?.(s) ?? ''
  check('the words Profile will show name the things, plainly',
    words({ mode: 'hasnt', items: ['bands'] }) === 'Kit: no resistance bands'
    && words({ mode: 'has', items: ['bench', 'dumbbells'] }) === 'Kit: has a flat bench and dumbbells'
    && words({ mode: 'only', items: ['dumbbells', 'bench'] }) === 'Kit: only dumbbells and a flat bench',
    [words({ mode: 'hasnt', items: ['bands'] }), words({ mode: 'has', items: ['bench', 'dumbbells'] }), words({ mode: 'only', items: ['dumbbells', 'bench'] })])

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
  const fromUnrelatedFacts = compileKitStatements ? compileKitStatements(notKit) : null
  let identical = 0
  const differing: string[] = []
  for (const c of identityCases) {
    const plain = hash(generate(c.profile, c.seed))
    const empty = hash(generate({ ...c.profile, kit_statements: [] } as never, c.seed))
    const hydrated = fromUnrelatedFacts && kit.profileWithKit ? hash(generate(kit.profileWithKit(c.profile, fromUnrelatedFacts), c.seed)) : 'no-handle'
    if (plain === empty && plain === hydrated) identical++; else differing.push(c.label)
  }
  check(`absent, empty and "facts that are not kit rows" generate the same plan, byte for byte (${identityCases.length} seeded plans)`, identical === identityCases.length, differing)
  const samKitted = withKit(samProfile(), [{ mode: 'only', items: ['dumbbells', 'bench'] }])
  check('...and the comparison can see a difference: the same seed with a kit list is a different plan',
    hash(generate(samProfile(), 'sam:2')) !== hash(generate(samKitted, 'sam:2')))
  check('the pool is the same set of exercises with no kit rows',
    JSON.stringify(getConstrainedPool(samProfile(), []).map(e => e.name)) === JSON.stringify(getConstrainedPool({ ...samProfile(), kit_statements: [] } as never, []).map(e => e.name)))

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
    const bad = { generated: [] as string[], warmup: [] as string[], swapped: [] as string[], added: [] as string[], rebuilt: [] as string[], session: [] as string[], injury: [] as string[], audit: [] as string[], pool: [] as string[] }
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
      bad.audit.push(...(auditEquipmentViolations ? auditEquipmentViolations(profile, allNames(meso)).map(v => tag(`${v.exercise} needs ${v.missing.join('+')}`)) : [tag('no audit checker')]))
      // SWAPPED: every alternative offered for every exercise in week 1.
      const week1 = meso[0]
      for (const name of new Set(week1.days.flatMap(d => d.exercises.map(e => e.name)))) {
        for (const cand of quiet(() => getReplacementCandidates(name, profile, []))) {
          swapsSeen++
          const m = outside(cand.exercise.name, k.allowed)
          if (m.length) bad.swapped.push(tag(`${name} -> ${cand.exercise.name} needs ${m.join('+')}`))
        }
      }
      // ADDED: what "add an exercise" suggests for each day of week 1.
      for (const d of week1.days) for (const cand of quiet(() => getAdditionCandidates(d, profile, [], 50))) {
        addsSeen++
        const m = outside(cand.exercise.name, k.allowed)
        if (m.length) bad.added.push(tag(`${d.day} + ${cand.exercise.name} needs ${m.join('+')}`))
      }
      // REBUILT: the rest of the plan regenerated against the profile.
      const rebuilt = await hush(() => rebuildAgainstProfile(profile, [], meso, undefined, context, `rebuild:${seed}`))
      for (const n of allNames(rebuilt)) { const m = outside(n, k.allowed); if (m.length) bad.rebuilt.push(tag(`${n} needs ${m.join('+')}`)) }
      // ...and one session rebuilt around its main lift.
      const firstDay = week1.days.find(d => d.exercises.length > 1)
      if (firstDay) {
        const session = await hush(() => rebuildDayAroundMainLift({ mesocycle: meso, profile, weekNumber: 1, dayName: firstDay.day, exclusions: [] } as never))
        for (const r of (session as unknown as { replaced: { to?: string; after?: string; name?: string }[] }).replaced ?? []) {
          const n = r.to ?? r.after ?? r.name
          if (!n) continue
          sessionSwaps++
          const m = outside(n, k.allowed)
          if (m.length) bad.session.push(tag(`${firstDay.day} session rebuild brought ${n}, needs ${m.join('+')}`))
        }
      }
      // INJURY-SUBSTITUTED: ease the knees (or, where knees are already flagged, the shoulders) off for the whole plan.
      const area = (c.injuries ?? []).includes('knees') ? 'shoulders' : 'knees'
      const eased = await hush(() => substituteForInjury({ mesocycle: meso, profile, injuryCode: area, targetDays: planDaysInWindow(meso, calendar), exclusions: [], context }))
      for (const s of eased.touchedSlots) {
        if (!s.after) continue
        injurySwaps++
        const m = outside(s.after, k.allowed)
        if (m.length) bad.injury.push(tag(`${area}: ${s.before} -> ${s.after} needs ${m.join('+')}`))
      }
    }
    say(`   [${k.label}] ${plans} plans, ${slots} slots, ${swapsSeen} swap options, ${addsSeen} add options, ${injurySwaps} injury substitutes, ${sessionSwaps} session-rebuild picks`)
    check(`[${k.label}] the pool holds nothing outside the kit`, bad.pool.length === 0, bad.pool.slice(0, 4))
    check(`[${k.label}] no generated slot, in any of 16 weeks, needs an implement outside the kit`, slots > 200 && bad.generated.length === 0, bad.generated.slice(0, 4))
    check(`[${k.label}] no warm-up drill does`, bad.warmup.length === 0, bad.warmup.slice(0, 4))
    check(`[${k.label}] the audit's independent copy agrees`, bad.audit.length === 0, bad.audit.slice(0, 4))
    check(`[${k.label}] no swap option does`, swapsSeen > 20 && bad.swapped.length === 0, bad.swapped.slice(0, 4))
    check(`[${k.label}] no "add an exercise" suggestion does`, addsSeen > 10 && bad.added.length === 0, bad.added.slice(0, 4))
    check(`[${k.label}] no rebuilt week does`, bad.rebuilt.length === 0, bad.rebuilt.slice(0, 4))
    check(`[${k.label}] no session rebuild does`, bad.session.length === 0, bad.session.slice(0, 4))
    check(`[${k.label}] no injury substitute does`, bad.injury.length === 0, bad.injury.slice(0, 4))
  }
  // The detectors are not blind: on the TIER alone, the tester's plan needs kit he does not have.
  const samTierPlan = generate(samProfile(), 'sam:2')
  const samKit = (eq: string) => ownAllowed(['dumbbells', 'bench']).has(eq)
  const tierViolations = allNames(samTierPlan).filter(n => outside(n, samKit).length > 0)
  check('the detector is not blind: on the tier alone the tester\'s plan needs kit he does not have', tierViolations.length >= 3, tierViolations)
  check('...and the audit\'s copy sees the same on a kit profile handed the tier plan',
    !!auditEquipmentViolations && auditEquipmentViolations(samKitted, allNames(samTierPlan)).length >= 3,
    auditEquipmentViolations?.(samKitted, allNames(samTierPlan)).length)
  check('...and its warm-up detector fires on a band drill', warmupOutside({ day: 'Monday', focus: 'x', exercises: [], warmup: { mobility: [{ name: 'Band Pull-Aparts' }, { name: 'Shoulder Dislocates (broomstick or band)' }] } } as never, samKit).length === 1)
  const drillsNeedingKit = (readFileSync('src/lib/warmup.ts', 'utf8').match(/needs_equipment: \['[^\]]+\]/g) ?? []).length
  check('the gate\'s table of warm-up drills that need kit is the whole of the source\'s', drillsNeedingKit === Object.keys(WARMUP_DRILL_KIT).length, drillsNeedingKit)
  // On the tier alone a Minimalist warm-up reaches for the band; with bands ruled out it must not.
  const tierWarmups = new Set(samTierPlan.flatMap(w => w.days.flatMap(d => warmupNames(d))))
  const noBandWarmups = new Set(generate(withKit(samProfile(), [{ mode: 'hasnt', items: ['bands'] }]), 'sam:2').flatMap(w => w.days.flatMap(d => warmupNames(d))))
  const withBandsWarmups = new Set(generate(withKit(samProfile(), [{ mode: 'only', items: ['dumbbells', 'bench', 'bands'] }]), 'sam:2').flatMap(w => w.days.flatMap(d => warmupNames(d))))
  check('the warm-up reads the list: Band Pull-Aparts on the tier, gone once he says "no bands"', tierWarmups.has('Band Pull-Aparts') && !noBandWarmups.has('Band Pull-Aparts'), { tier: tierWarmups.has('Band Pull-Aparts'), noBands: noBandWarmups.has('Band Pull-Aparts') })
  check('...and still there for a list that includes bands (the list decides, it does not just remove)', withBandsWarmups.has('Band Pull-Aparts'))

  // -------------------------------------------------------------------------
  say('\n4. The tester: Minimalist, shoulder flag, {dumbbells, flat bench}')
  const samPlan = generate(samKitted, 'sam:2')
  const backDay = samPlan[0].days.find(d => d.focus === 'Back & Biceps')
  // The day's main lift: its tier-1 where it has one, else the movement the screen labels "Main lift".
  const anchor = backDay
    ? (backDay.exercises.find(e => getExerciseEntry(e.name)?.mechanics_tier === 'tier1_compound') ?? dayAnchorExercise(backDay.exercises) ?? null)
    : null
  check('Back & Biceps exists and its main lift is Dumbbell Rows', anchor?.name === 'Dumbbell Rows', { focus: samPlan[0].days.map(d => d.focus), anchor: anchor?.name, day: backDay?.exercises.map(e => e.name) })
  const banned = (n: string) => /\bband(ed)?\b|backpack|kettlebell/i.test(n) || outside(n, samKit).length > 0
  const badOn = (meso: MesocycleWeek[]) => meso.flatMap(w => w.days.flatMap(d => [
    ...d.exercises.map(e => e.name).filter(banned),
    ...warmupOutside(d, samKit),
  ].map(n => `wk${w.week_number} ${d.day} ${n}`)))
  const samBad = badOn(samPlan)
  check('no band, bag or kettlebell movement in any of 16 weeks, warm-ups included', samBad.length === 0, samBad.slice(0, 6))
  check('...where the tier-only plan has them, in the sessions and in the warm-ups (so the zero is real)',
    badOn(samTierPlan).length >= 3 && samTierPlan.some(w => w.days.some(d => warmupOutside(d, samKit).length > 0)))
  const kneeEase = await hush(() => substituteForInjury({ mesocycle: samPlan, profile: samKitted, injuryCode: 'knees', targetDays: planDaysInWindow(samPlan, calendar, 14), exclusions: [], context }))
  check('the knee adaptation finds substitutes, and none is a band, bag or kettlebell movement',
    kneeEase.touchedSlots.length >= 2 && kneeEase.touchedSlots.every(s => !s.after || !banned(s.after)), kneeEase.touchedSlots.map(s => `${s.before} -> ${s.after}`))
  const kneeTier = await hush(() => substituteForInjury({ mesocycle: samTierPlan, profile: samProfile(), injuryCode: 'knees', targetDays: planDaysInWindow(samTierPlan, calendar, 14), exclusions: [], context }))
  check('...where on the tier alone it reaches for one (the tester\'s Spanish Squat and kettlebell swing)', kneeTier.touchedSlots.some(s => !!s.after && banned(s.after)), kneeTier.touchedSlots.map(s => `${s.before} -> ${s.after}`))
  // The travel card: "away next week, hotel room, no equipment".
  const travel = await hush(() => substituteForEquipment({ mesocycle: samPlan, profile: samKitted, equipmentTier: 'bodyweight', targetDays: planDaysInWindow(samPlan, calendar, 7), exclusions: [], context }))
  check('the travel card changes the loaded slots, and puts no band, bag or kettlebell movement in',
    travel.touchedSlots.length >= 2 && travel.touchedSlots.every(s => !s.after || !/\bband(ed)?\b|backpack|kettlebell/i.test(s.after)), travel.touchedSlots.map(s => `${s.before} -> ${s.after}`))
  check('...and nothing it brings in needs his dumbbells or bench either: they are at home',
    travel.touchedSlots.every(s => !s.after || outside(s.after, eq => eq === 'bodyweight' || eq === 'pull-up bar').length === 0), travel.touchedSlots.map(s => `${s.before} -> ${s.after}`))

  // -------------------------------------------------------------------------
  say('\n5. Ceilings: never the answer or the question for an implement they do not have')
  const goblet = getExerciseEntry('Goblet Squats')!
  const swing = getExerciseEntry('Kettlebell Swing (Heavy)')!
  const backpackRow = getExerciseEntry('Backpack Row')!
  const both = samProfile({ max_dumbbell_kg: 20, max_single_implement_kg: 32 } as never)
  check('no kit list: a dumbbell-or-kettlebell lift is capped by the heavier stated one, as before', statedCeilingKg(goblet, both as KitProfile) === 32)
  check('said "no kettlebell": the same lift uses the dumbbell ceiling, whatever kettlebell number is on file',
    statedCeilingKg(goblet, withKit(both, [{ mode: 'hasnt', items: ['kettlebell'] }])) === 20
    && statedCeilingKg(goblet, withKit(both, [{ mode: 'only', items: ['dumbbells', 'bench'] }])) === 20)
  check('said "no dumbbells": it uses the kettlebell ceiling', statedCeilingKg(goblet, withKit(both, [{ mode: 'hasnt', items: ['dumbbells'] }])) === 32)
  check('the kinds the clamp reads and the kinds the question reads are the same function, kit included',
    JSON.stringify(ceilingKindsFor(goblet, withKit(both, [{ mode: 'hasnt', items: ['kettlebell'] }]))) === JSON.stringify(['dumbbell'])
    && JSON.stringify(ceilingKindsFor(goblet)) === JSON.stringify(['dumbbell', 'single_implement'])
    && JSON.stringify(ceilingKindsFor(swing, withKit(both, [{ mode: 'hasnt', items: ['kettlebell'] }]))) === JSON.stringify([]))
  const dayOf = (...names: string[]) => ({ day: 'Monday', focus: 'x', exercises: names.map(name => ({ id: name, name, sets: 3, reps: '8-10', rest: '60s', substitution: '' })) }) as unknown as WorkoutDay
  const unstated = samProfile({ max_dumbbell_kg: undefined } as never)
  check('no kit list: a kettlebell lift raises the kettlebell question, a bag lift the bag question (unchanged)',
    ceilingToAskFor(unstated, dayOf('Kettlebell Swing (Heavy)')) === 'single_implement' && ceilingToAskFor(unstated, dayOf('Backpack Row')) === 'improvised')
  check('said "no kettlebell": never asked "What is your heaviest kettlebell?"',
    ceilingToAskFor(withKit(unstated, [{ mode: 'hasnt', items: ['kettlebell'] }]), dayOf('Kettlebell Swing (Heavy)', 'Goblet Squats')) === 'dumbbell'
    && ceilingToAskFor(withKit(unstated, [{ mode: 'hasnt', items: ['kettlebell'] }]), dayOf('Kettlebell Swing (Heavy)')) === null)
  check('said "no bag": never asked what the bag holds',
    ceilingToAskFor(withKit(unstated, [{ mode: 'hasnt', items: ['weighted_bag'] }]), dayOf('Backpack Row')) === null
    && statedCeilingKg(backpackRow, withKit(samProfile({ max_improvised_kg: 15 } as never), [{ mode: 'hasnt', items: ['weighted_bag'] }])) === null)
  check('a list that makes a full-gym member a home trainee starts the asking; a full gym less bands is still never asked',
    ceilingToAskFor(withKit(samProfile({ equipment_access: 'full_gym', max_dumbbell_kg: undefined } as never), [{ mode: 'only', items: ['dumbbells'] }]), dayOf('Dumbbell Curls')) === 'dumbbell'
    && ceilingToAskFor(withKit(samProfile({ equipment_access: 'full_gym', max_dumbbell_kg: undefined } as never), [{ mode: 'hasnt', items: ['bands'] }]), dayOf('Dumbbell Curls')) === null)

  // -------------------------------------------------------------------------
  say('\n6. The warning says what they said; a travel tier describes somewhere else')
  const benchPress = getExerciseEntry('Dumbbell Bench Press')!
  const tBar = getExerciseEntry('T-Bar Rows')!
  const warn = (e: ExerciseEntry, p: UserProfile) => getExerciseCompatibilityWarnings(e, p, [])
  check('no kit list: the tier wording is unchanged', JSON.stringify(warn(benchPress, samProfile({ injuries: [] }))) === JSON.stringify(['Needs bench — outside your minimalist equipment.']), warn(benchPress, samProfile({ injuries: [] })))
  check('with a kit list: "you\'ve said you don\'t have one"',
    JSON.stringify(warn(benchPress, withKit(samProfile({ injuries: [] }), [{ mode: 'only', items: ['dumbbells'] }]))) === JSON.stringify(["Needs bench — you've said you don't have one."]),
    warn(benchPress, withKit(samProfile({ injuries: [] }), [{ mode: 'only', items: ['dumbbells'] }])))
  check('...and for an either-or lift with neither, it names both with "or"',
    JSON.stringify(warn(tBar, withKit(samProfile({ injuries: [], equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }]))) === JSON.stringify(["Needs t-bar or barbell — you've said you don't have one."]),
    warn(tBar, withKit(samProfile({ injuries: [], equipment_access: 'home_gym' }), [{ mode: 'hasnt', items: ['barbell'] }])))
  check('...and no warning at all for something the list added', warn(benchPress, withKit(samProfile({ injuries: [] }), [{ mode: 'has', items: ['bench'] }])).length === 0)
  const away = constraintProfile(samKitted, { temporaryInjuries: [], temporaryEquipment: 'home_gym' })
  check('a travel tier uses that tier\'s plain set: a barbell lift he does not own is allowed there',
    isEquipmentAllowed(getExerciseEntry('Barbell Rows')!, away) === true && isEquipmentAllowed(getExerciseEntry('Barbell Rows')!, samKitted) === false)
  check('...but a bag or bands he has said he does not have do not appear there either',
    isEquipmentAllowed(getExerciseEntry('Backpack Row')!, away) === false && isEquipmentAllowed(getExerciseEntry('Band Tricep Kickback')!, away) === false
    && isEquipmentAllowed(getExerciseEntry('Kettlebell Swing (Heavy)')!, away) === true)
  check('with no kit list a travel tier is exactly the tier (unchanged)',
    isEquipmentAllowed(getExerciseEntry('Backpack Row')!, constraintProfile(samProfile() as KitProfile, { temporaryInjuries: [], temporaryEquipment: 'bodyweight' })) === true
    && constraintProfile(samProfile() as KitProfile, { temporaryInjuries: [], temporaryEquipment: 'bodyweight' }).kit_statements === undefined)
  check('no temporary change: the profile comes back as it was, kit and all', constraintProfile(samKitted, { temporaryInjuries: [], temporaryEquipment: null }) === samKitted)
  check('a temporary injury keeps the kit list', JSON.stringify(constraintProfile(samKitted, { temporaryInjuries: ['knees'], temporaryEquipment: null }).kit_statements) === JSON.stringify(samKitted.kit_statements) && samKitted.kit_statements !== undefined)

  // -------------------------------------------------------------------------
  say('\n7. The doors\' one function: record -> trial -> what changes -> apply')
  // A stand-in database that records what it was ASKED (a fake that ignores
  // its arguments cannot see a missing write).
  const calls: { table: string; op: string; payload: unknown }[] = []
  const tableProxy = (table: string): unknown => {
    const chain: unknown = new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: table === 'user_facts' ? { id: 'fact-1' } : [], error: null })
        return (...args: unknown[]) => {
          if (['insert', 'upsert', 'update', 'delete'].includes(String(prop))) calls.push({ table, op: String(prop), payload: args[0] })
          return chain
        }
      },
    })
    return chain
  }
  setSupabaseClient({ from: (table: string) => tableProxy(table), rpc: () => tableProxy('rpc') } as never)

  const tierPlan = generate(samProfile(), 'sam:2')
  const statement: Statement = { mode: 'only', items: ['dumbbells', 'bench'] }
  // ONE DAY IS ALREADY TRAINED: a week-1 day that holds kit he does not have,
  // so the guard has something to protect (a guard on a day nothing would
  // touch proves nothing).
  const TRAINED = tierPlan[0].days.find(d => d.exercises.some(e => outside(e.name, samKit).length > 0))?.day ?? '(no week-1 day needs kit he lacks)'
  const trainedDay = (weekNumber: number, dayName: string) => weekNumber === 1 && dayName === TRAINED
  const guarded = { ...context, isProtected: trainedDay }
  const params = { profile: samProfile(), mesocycle: tierPlan, planCreatedAt: TODAY.toISOString(), statement, exclusions: [], source: 'chat', rawPhrase: 'I only have dumbbells and a flat bench', context: guarded }
  type Trial = KitChangePlan & { changedDays: { weekNumber: number; dayName: string; date: string; before: string[]; after: string[] }[]; conflicts: number; refusal: string | null; rebuildRecommended: boolean }
  const trial = (kitChange.planKitChange ? await hush(() => kitChange.planKitChange!(params)) : null) as Trial | null
  check('the trial writes nothing', trial !== null && calls.length === 0, calls.map(c => `${c.table}.${c.op}`))
  check('the trial says what the kit was and what it becomes',
    JSON.stringify([...(trial?.kitBefore ?? [])].sort()) === JSON.stringify(['bands', 'dumbbells', 'kettlebell', 'pull_up_bar', 'weighted_bag'])
    && JSON.stringify([...(trial?.kitAfter ?? [])].sort()) === JSON.stringify(['bench', 'dumbbells']), { before: trial?.kitBefore, after: trial?.kitAfter })
  const changed = trial?.changedDays ?? []
  say(`   the tester's list: mode ${trial?.mode}, ${trial?.conflicts} slots needed kit he does not have, ${changed.length} days change`)
  check('it counts the slots that need kit he does not have, and names every day that changes with what it held and will hold',
    (trial?.conflicts ?? 0) >= 3 && changed.length >= 3 && changed.every(d => d.before.length > 0 && d.after.length > 0 && JSON.stringify(d.before) !== JSON.stringify(d.after)),
    { mode: trial?.mode, conflicts: trial?.conflicts, days: changed.length })
  check('every changed day carries its date, in date order, none before today',
    changed.length >= 3 && changed.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= calendar.today)
    && changed.every((d, i) => i === 0 || changed[i - 1].date <= d.date), changed.slice(0, 3).map(d => d.date))
  check('nothing it puts on any changed day needs kit he does not have', changed.length >= 3 && changed.every(d => d.after.every(n => outside(n, samKit).length === 0)),
    changed.flatMap(d => d.after.filter(n => outside(n, samKit).length > 0)).slice(0, 5))
  check('a trained day is never touched (the day guard)', changed.length >= 3 && changed.every(d => !(d.weekNumber === 1 && d.dayName === TRAINED))
    && trial?.mesocycle[0].days.find(d => d.day === TRAINED) === tierPlan[0].days.find(d => d.day === TRAINED)
    // ...and the guard was doing something: that Monday holds kit he does not have.
    && (tierPlan[0].days.find(d => d.day === TRAINED)?.exercises.some(e => outside(e.name, samKit).length > 0) ?? false))
  const trialNames = trial ? trial.mesocycle.flatMap(w => w.days.filter(d => !(w.week_number === 1 && d.day === TRAINED)).flatMap(d => d.exercises.map(e => e.name))) : ['(no trial)']
  check('from today to the end of the plan, nothing left needs kit he does not have', trialNames.every(n => outside(n, samKit).length === 0), [...new Set(trialNames.filter(n => outside(n, samKit).length > 0))])
  check('the summary a card can print has a line for the kit and a line for the plan',
    (trial?.summary ?? []).length === 2 && trial?.summary[0] === 'Your kit: dumbbells and a flat bench.' && /already done stay as they are/.test(trial?.summary[1] ?? ''), trial?.summary)
  const again = (kitChange.planKitChange ? await hush(() => kitChange.planKitChange!(params)) : null) as Trial | null
  check('asked twice, the trial gives the same plan (what the card shows is what confirm applies)',
    trial !== null && again !== null && hash(trial.mesocycle) === hash(again.mesocycle))

  const applied = (kitChange.recordKitStatement ? await hush(() => kitChange.recordKitStatement!(params)) : null) as (Trial & { saved: boolean; message: string | null }) | null
  const factWrites = calls.filter(c => c.table === 'user_facts' && c.op === 'insert')
  const weekWrites = calls.filter(c => c.table === 'mesocycle_weeks' && c.op === 'upsert')
  const row = (factWrites[0]?.payload ?? {}) as Record<string, unknown>
  check('applying writes ONE fact row, in the shape the compiler reads',
    applied?.saved === true && factWrites.length === 1 && row.kind === 'hard_constraint' && row.constraint_kind === 'equipment' && row.polarity === 'like' && row.hardness === 'hard'
    && JSON.stringify(row.resolved_refs) === JSON.stringify(['dumbbells', 'bench']) && row.source === 'chat' && row.profile_id === 'p-kit', { saved: applied?.saved, row })
  const changedWeekCount = new Set(changed.map(d => d.weekNumber)).size
  check('...and saves exactly the weeks that changed', weekWrites.length === changedWeekCount && changedWeekCount >= 1, { weekWrites: weekWrites.length, changedWeekCount })
  check('the plan is saved before the statement (a retry after half a save cannot double up)',
    calls.length >= 2 && calls.findIndex(c => c.table === 'user_facts') === calls.length - 1, calls.map(c => c.table))
  check('never a write to the profile row: the tier the person picked stays', calls.every(c => c.table !== 'fitness_profiles'), calls.filter(c => c.table === 'fitness_profiles'))
  check('what it returns is what the trial showed', applied !== null && trial !== null && hash(applied.mesocycle) === hash(trial.mesocycle)
    && JSON.stringify(applied.changedDays) === JSON.stringify(trial.changedDays) && changed.length >= 3)

  // SLOT BY SLOT: "I don't own bands" on the same plan, whose prep work reaches for them.
  calls.length = 0
  const bagParams = { ...params, statement: { mode: 'hasnt', items: ['bands'] } as Statement, rawPhrase: "I don't own bands", mode: 'substitute' }
  const bagTrial = (kitChange.planKitChange ? await hush(() => kitChange.planKitChange!(bagParams)) : null) as Trial | null
  const noBag = (eq: string) => eq !== 'resistance band'
  const touched = bagTrial?.touchedSlots ?? []
  check('slot by slot: every row is a slot that needed a band, and what replaces it does not',
    bagTrial?.mode === 'substitute' && touched.length >= 2 && touched.every(s => outside(s.before, noBag).length > 0 && (!s.after || outside(s.after, noBag).length === 0)),
    { mode: bagTrial?.mode, rows: touched.slice(0, 4).map(s => `${s.before} -> ${s.after}`) })
  check('...in the order a card prints them, and never on the trained day',
    touched.length >= 2 && touched.every(s => !(s.weekNumber === 1 && s.dayName === TRAINED))
    && touched.every((s, i) => i === 0 || touched[i - 1].weekNumber <= s.weekNumber))
  check('...and the plan line counts those slots', /^\d+ exercises? on your plan changes? from /.test(bagTrial?.summary[1] ?? '') && (bagTrial?.summary[1] ?? '').startsWith(`${touched.length} `), bagTrial?.summary)
  // The pure core, for the coach's card builder.
  const bagProfile = withKit(samProfile(), [{ mode: 'hasnt', items: ['bands'] }])
  const pure = substituteForKit ? await hush(() => substituteForKit({ mesocycle: tierPlan, profile: bagProfile, targetDays: planDaysInWindow(tierPlan, calendar), exclusions: [], context: guarded })) : null
  check('the pure substitution the card builder calls gives the same rows as the trial', pure !== null && touched.length >= 2 && JSON.stringify(pure.touchedSlots.map(s => [s.before, s.after])) === JSON.stringify(touched.map(s => [s.before, s.after])))
  check('a door may ask for the rebuild outright, and gets one', await (async () => {
    const forced = (kitChange.planKitChange ? await hush(() => kitChange.planKitChange!({ ...bagParams, mode: 'rebuild' })) : null) as Trial | null
    return forced?.mode === 'rebuild' && forced.touchedSlots.length === 0 && forced.changedDays.length >= 3
      && forced.mesocycle.flatMap(w => w.days.filter(d => !(w.week_number === 1 && d.day === TRAINED)).flatMap(d => d.exercises.map(e => e.name))).every(n => outside(n, noBag).length === 0)
      && forced.mesocycle[0].days.find(d => d.day === TRAINED) === tierPlan[0].days.find(d => d.day === TRAINED)
  })())
  check('nothing was written by any of those trials', calls.length === 0, calls.map(c => `${c.table}.${c.op}`))

  // A statement that conflicts with nothing still gets recorded: it protects the next plan.
  calls.length = 0
  const quietOne = kitChange.recordKitStatement ? await hush(() => kitChange.recordKitStatement!({ ...params, mesocycle: samPlan, profile: samKitted, statement: { mode: 'hasnt', items: ['kettlebell'] }, rawPhrase: 'no kettlebell' })) : null
  check('a statement nothing on the plan conflicts with is still remembered, changes no week, and says so',
    quietOne?.saved === true && quietOne.touchedSlots.length === 0 && calls.filter(c => c.table === 'user_facts').length === 1 && calls.filter(c => c.table === 'mesocycle_weeks').length === 0
    && /nothing|already/i.test((quietOne.summary ?? []).join(' ')), { saved: quietOne?.saved, touched: quietOne?.touchedSlots.length, calls: calls.map(c => `${c.table}.${c.op}`), summary: quietOne?.summary })
  // A statement naming nothing from the list is refused, loudly, and writes nothing.
  calls.length = 0
  const refused = kitChange.recordKitStatement ? await hush(() => kitChange.recordKitStatement!({ ...params, statement: { mode: 'hasnt', items: ['treadmill'] } })) : null
  check('a statement naming nothing from the nine is refused and writes nothing', refused?.saved === false && typeof refused.message === 'string' && refused.message.length > 0 && calls.length === 0, { refused, calls })
  // A failed save says so.
  setSupabaseClient({ from: () => new Proxy(function () {}, { get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'offline' } }) : () => (new Proxy(function () {}, { get: (_t2, p2) => (p2 === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'offline' } }) : () => ({ then: (r: (v: unknown) => void) => r({ data: null, error: { message: 'offline' } }) })) }))) }) } as never)
  const failed = kitChange.recordKitStatement ? await hush(() => kitChange.recordKitStatement!(params).catch(() => ({ saved: 'threw' }) as never)) : null
  check('a save that fails says it did not save (never a silent success, never a throw)', failed?.saved === false && /didn.t save|not saved|try again/i.test(String(failed.message)), failed && { saved: failed.saved, message: failed.message })

  // -------------------------------------------------------------------------
  say('\n8. One reader of the tier, one place the kit is attached, an audit that shares no code')
  const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n'"`]*$/gm, '$1')
  const read = (path: string) => { try { return strip(readFileSync(path, 'utf8')) } catch { return '' } }
  const ENGINE = ['exercise-plan.ts', 'mesocycle-edit.ts', 'exercise-add-candidates.ts', 'quality-score.ts', 'load-prescription.ts', 'load-ceiling-prompt.ts', 'warmup.ts', 'session-rebuild.ts', 'plan-adaptations.ts', 'settle-week.ts', 'periodization.ts']
  // Reading the stored tier directly is how an engine path ignores the list.
  // `equipment_access:` (writing a clone's key) is not a read.
  const directReads = ENGINE.flatMap(f => (read(`src/lib/${f}`).match(/[\w.?]*\.equipment_access\b(?!\s*:)[^\n]*/g) ?? []).map(m => `${f}: ${m.slice(0, 80)}`))
  check('no engine file reads the stored tier directly; they ask equipmentTierFor / allowedEquipmentFor', directReads.length === 0, directReads)
  check('...and the detector sees one when it is there', ('const t = profile.equipment_access || "full_gym"'.match(/[\w.?]*\.equipment_access\b(?!\s*:)[^\n]*/g) ?? []).length === 1
    && ('const c = { ...p, equipment_access: tier }'.match(/[\w.?]*\.equipment_access\b(?!\s*:)[^\n]*/g) ?? []).length === 0)
  const plan = read('src/lib/exercise-plan.ts')
  check('isEquipmentAllowed and the equipment stage both go through allowedEquipmentFor(',
    /export function isEquipmentAllowed\([^)]*\)[^{]*\{[\s\S]{0,200}?allowedEquipmentFor\(/.test(plan) && /function stageEquipmentFilter\([\s\S]{0,400}?allowedEquipmentFor\(/.test(plan))
  const warm = read('src/lib/warmup.ts')
  check('the warm-up\'s tier map is read through the kit list\'s answer', /kitOf\(|ownsKitItem\(|warmupKitFor\(/.test(warm) && /from '\.\/kit-list'/.test(warm))
  const audit = read('src/lib/dev-constraint-audit.ts')
  check('the audit\'s copy imports nothing from the kit list or the engine\'s allowance', !/from '\.\/kit-list'/.test(audit) && !/allowedEquipmentFor|isEquipmentAllowed/.test(audit) && /kit_statements/.test(audit))
  const app = read('src/App.tsx')
  check('App attaches the kit in one derivation: the profile every tab receives is the stored one plus the compiled statements',
    /const profile = useMemo\(\s*\(\) => \(?storedProfile \? profileWithKit\(storedProfile, compileKitStatements\(memoryFacts\)\)/.test(app)
    && /const \[storedProfile, setProfile\] = useState<UserProfile \| null>\(null\)/.test(app))
  check('...and the cold-load chain compiles it with the same two functions from its own read',
    (app.match(/profileWithKit\(/g) ?? []).length === 2 && (app.match(/compileKitStatements\(/g) ?? []).length === 2)
  const eff = read('src/lib/effective-constraints.ts')
  check('a travel tier is laid over the profile through travelProfile(', /travelProfile\(/.test(eff))
  const adapt = read('src/lib/plan-adaptations.ts')
  check('...and so is the travel card\'s own substitution', /export async function substituteForEquipment[\s\S]{0,600}?travelProfile\(/.test(adapt))

  // -------------------------------------------------------------------------
  say('\n9. The dumbbell pack, and improvised kit beside better kit')
  // 9a. The seven entries, with the joint tags AS REVIEWED (docs/plans/kit-list.md).
  // `contra` is what a flag on that joint removes; an explicit [] means
  // "takes part, kept on purpose" and is not the same as absent.
  const PACK: { name: string; kit: string[]; contra: string[]; family: string; group: string }[] = [
    { name: 'Bent-Over Dumbbell Row', kit: ['dumbbells'], contra: ['lower_back_axial'], family: 'row', group: 'row' },
    { name: 'Dumbbell Tricep Kickback', kit: ['dumbbells'], contra: ['elbow'], family: 'tricep_kickback', group: 'tricep_extension' },
    { name: 'Cable Tricep Kickback', kit: ['cable machine'], contra: [], family: 'tricep_kickback', group: 'tricep_extension' },
    { name: 'Lying Dumbbell Tricep Extension', kit: ['dumbbells', 'bench'], contra: ['elbow', 'shoulder'], family: 'tricep_extension', group: 'tricep_extension' },
    { name: 'Close-Grip Dumbbell Press', kit: ['dumbbells', 'bench'], contra: ['elbow'], family: 'neutral_grip_press', group: 'bench_press' },
    { name: 'Dumbbell Hip Thrust', kit: ['dumbbell', 'bench'], contra: [], family: 'hip_thrust', group: 'hip_thrust' },
    { name: 'Dumbbell Reverse Lunge', kit: ['dumbbells'], contra: ['ankle', 'hip', 'knee'], family: 'single_leg', group: 'single_leg' },
  ]
  const packProblems = PACK.flatMap(p => {
    const e = getExerciseEntry(p.name)
    if (!e) return [`${p.name}: not in the catalogue`]
    const out: string[] = []
    if (JSON.stringify(e.equipment) !== JSON.stringify(p.kit) || e.equipment_alternatives) out.push(`${p.name}: kit ${JSON.stringify(e.equipment)}`)
    // REVIEWED means WRITTEN: the field is present on the entry, not left to fall back to loads_joints.
    if (e.contraindicated_joints === undefined) out.push(`${p.name}: contraindicated_joints left to default`)
    else if (JSON.stringify([...e.contraindicated_joints].sort()) !== JSON.stringify([...p.contra].sort())) out.push(`${p.name}: contra ${JSON.stringify(e.contraindicated_joints)}`)
    if (getMovementFamily(e) !== p.family) out.push(`${p.name}: family ${getMovementFamily(e)}`)
    if (e.substitution_group !== p.group) out.push(`${p.name}: group ${e.substitution_group}`)
    if (e.retired) out.push(`${p.name}: retired`)
    return out
  })
  check('the seven entries exist, need the kit the plan says, sit in their families, and every joint tag is written out as reviewed', packProblems.length === 0, packProblems)
  const flaggedPool = (injury: string, statements: Statement[]) => getConstrainedPool(withKit(samProfile({ injuries: [injury] }), statements), []).map(e => e.name)
  const dbBench: Statement[] = [{ mode: 'only', items: ['dumbbells', 'bench'] }]
  check('a flagged shoulder with dumbbells and a bench keeps a triceps movement and two kinds of press; it loses the lying extension',
    flaggedPool('shoulders', dbBench).includes('Dumbbell Tricep Kickback') && flaggedPool('shoulders', dbBench).includes('Close-Grip Dumbbell Press')
    && flaggedPool('shoulders', dbBench).includes('Dumbbell Floor Press') && !flaggedPool('shoulders', dbBench).includes('Lying Dumbbell Tricep Extension'))
  check('a flagged elbow loses the dumbbell kickback, the lying extension and the close-grip press',
    ['Dumbbell Tricep Kickback', 'Lying Dumbbell Tricep Extension', 'Close-Grip Dumbbell Press'].every(n => !flaggedPool('elbows', dbBench).includes(n)))
  check('a flagged lower back loses the bent-over row and keeps the bench-supported one and the hip thrust',
    !flaggedPool('lower_back', dbBench).includes('Bent-Over Dumbbell Row') && flaggedPool('lower_back', dbBench).includes('Dumbbell Rows') && flaggedPool('lower_back', dbBench).includes('Dumbbell Hip Thrust'))
  check('a flagged knee loses the reverse lunge', !flaggedPool('knees', dbBench).includes('Dumbbell Reverse Lunge') && flaggedPool('shoulders', dbBench).includes('Dumbbell Reverse Lunge'))
  check('dumbbells and NO bench now has a loaded row (the catalogue\'s only dumbbell row needed one)',
    getConstrainedPool(withKit(samProfile({ injuries: [] }), [{ mode: 'only', items: ['dumbbells'] }]), []).filter(e => e.substitution_group === 'row' && e.equipment.includes('dumbbells')).map(e => e.name).join() === 'Bent-Over Dumbbell Row')
  // 9b. A kickback is not half a pushdown.
  const gym = samProfile({ equipment_access: 'full_gym', injuries: [], max_dumbbell_kg: undefined } as never)
  const kg = (name: string) => prescribeLoad(getExerciseEntry(name)!, gym, { repRangeLabel: '10-12', targetRpeLabel: 'RPE 8' })?.starting_weight_kg ?? null
  const pushdown = kg('Tricep Pushdowns'), dbKick = kg('Dumbbell Tricep Kickback'), cableKick = kg('Cable Tricep Kickback'), lying = kg('Lying Dumbbell Tricep Extension'), overhead = kg('Overhead Tricep Extension')
  say(`   82kg intermediate, 10-12 reps: pushdown ${pushdown}kg, dumbbell kickback ${dbKick}kg per hand, cable kickback ${cableKick}kg a side, lying extension ${lying}kg per hand, overhead ${overhead}kg`)
  check('a dumbbell kickback is priced well under half a pushdown per hand, and above nothing',
    pushdown !== null && dbKick !== null && dbKick > 0 && dbKick <= 0.7 * (pushdown / 2) + 1 && dbKick < pushdown / 2, { pushdown, dbKick })
  check('...so is the cable one, a side', pushdown !== null && cableKick !== null && cableKick > 0 && cableKick < pushdown / 2, { pushdown, cableKick })
  check('...and the factor has not spread: the lying extension is half a pushdown per hand, heavier than the kickback',
    pushdown !== null && lying !== null && dbKick !== null && lying > dbKick && Math.abs(lying - pushdown / 2) <= 1, { pushdown, lying, dbKick })
  check('...nor moved the overhead extension off its own factor', overhead !== null && pushdown !== null && overhead < pushdown && overhead > (dbKick ?? 99), { overhead, pushdown, dbKick })

  // 9c-e. A seeded sample across the three tiers with kit, all 16 weeks.
  const sample: { c: Combination; profile: UserProfile; meso: MesocycleWeek[] }[] = []
  for (const equipment of ['full_gym', 'home_gym', 'minimalist'] as EquipmentAccess[])
    for (const g of [
      { style: 'bodybuilding', injuries: [], duration: '60-90' }, { style: 'bodybuilding', injuries: ['shoulders'], duration: '45-60' },
      { style: 'bodybuilding', injuries: [], duration: '90+', experience: 'advanced' }, { style: 'hybrid', injuries: [], duration: '45-60' },
      { style: 'functional', injuries: ['knees'], duration: '60-90', goal: 'functional' }, { style: 'combat', injuries: [], duration: '30-45', goal: 'conditioning' },
    ] as Partial<Combination>[]) {
      const c = combo({ ...g, equipment })
      const profile = buildProfile(c)
      sample.push({ c, profile, meso: generate(profile, comboKey(c)) })
    }
  const isImprovised = (e: ExerciseEntry) => e.equipment.some(q => q === 'resistance band' || q === 'weighted backpack')
  const REAL = new Set(['barbell', 'EZ bar', 'trap bar', 't-bar', 'dumbbells', 'dumbbell', 'kettlebell', 'cable machine', 'machine'])
  /** The gate's own reading of "they own a properly loading equivalent": same group and tier, a real loadable implement, in THEIR pool. Rehab and trunk work are exempt (her ruling). */
  const improvisedBesideBetter = (profile: UserProfile, meso: MesocycleWeek[]): string[] => {
    const pool = getConstrainedPool(profile, [])
    const out: string[] = []
    for (const w of meso) for (const d of w.days) for (const ex of d.exercises) {
      const e = getExerciseEntry(ex.name)
      if (!e || e.mechanics_tier === 'primer' || !isImprovised(e) || e.equipment.some(q => REAL.has(q))) continue
      if (e.movement_pattern === 'core' || (e.indicated_joints?.length ?? 0) > 0) continue
      const peer = pool.find(o => o.substitution_group === e.substitution_group && o.mechanics_tier === e.mechanics_tier && o.equipment.some(q => REAL.has(q)))
      if (peer) out.push(`wk${w.week_number} ${d.day} ${e.name} (owns ${peer.name})`)
    }
    return out
  }
  const beside = sample.flatMap(x => improvisedBesideBetter(x.profile, x.meso).map(v => `${comboKey(x.c)} :: ${v}`))
  check(`no day in ${sample.length} seeded plans (16 weeks each) holds a band or bag movement the person owns a properly loading equivalent of`, sample.length === 18 && beside.length === 0, beside.slice(0, 5))
  const scorerSays = sample.filter(x => quiet(() => scorePlan(x.profile, x.meso, comboKey(x.c), { skipComparisons: true } as never)).dimensions.selection.deductions.some(dd => dd.rule === 'worse_implement_than_available'))
  check('...and the quality scorer\'s own rule (worse_implement_than_available) fires on none of them', scorerSays.length === 0, scorerSays.map(x => comboKey(x.c)))
  // The detector, proven on a plan that does hold one.
  const planted = sample[0]
  const plantedMeso: MesocycleWeek[] = planted.meso.map((w, wi) => wi !== 0 ? w : { ...w, days: w.days.map((d, di) => di !== 0 ? d : { ...d, exercises: [...d.exercises, { ...d.exercises[d.exercises.length - 1], id: 'planted', name: 'Band Tricep Kickback' }] }) })
  check('...and both detectors see a planted Band Tricep Kickback in a full gym',
    improvisedBesideBetter(planted.profile, plantedMeso).length === 1
    && quiet(() => scorePlan(planted.profile, plantedMeso, comboKey(planted.c), { skipComparisons: true } as never)).dimensions.selection.deductions.some(dd => dd.rule === 'worse_implement_than_available'))
  const working = (d: WorkoutDay) => d.exercises.map(ex => getExerciseEntry(ex.name)).filter((e): e is ExerciseEntry => !!e && e.mechanics_tier !== 'primer')
  const threeOfAFamily: string[] = [], rowBesidePress: string[] = []
  let shouldersWithPress = 0, daysSeen = 0, twoOfAFamily = 0
  for (const x of sample) for (const d of x.meso[0].days) {
    const w = working(d)
    if (w.length === 0) continue
    daysSeen++
    const byFamily = new Map<string, number>()
    for (const e of w) byFamily.set(getMovementFamily(e), (byFamily.get(getMovementFamily(e)) ?? 0) + 1)
    for (const [family, n] of byFamily) { if (n >= 3) threeOfAFamily.push(`${comboKey(x.c)} ${d.day}: ${n} x ${family}`); if (n === 2) twoOfAFamily++ }
    if (d.focus === 'Shoulders & Abs' && w.some(e => e.movement_pattern === 'vertical_push')) {
      shouldersWithPress++
      if (w.some(e => e.substitution_group === 'row')) rowBesidePress.push(`${comboKey(x.c)} ${d.day}: ${w.map(e => e.name).join(', ')}`)
    }
  }
  check(`no day holds three movements of one family (${daysSeen} days; ${twoOfAFamily} hold two, which is allowed)`, daysSeen > 40 && threeOfAFamily.length === 0, threeOfAFamily.slice(0, 4))
  check(`a Shoulders day that has its press does not borrow a row (${shouldersWithPress} such days)`, shouldersWithPress >= 4 && rowBesidePress.length === 0, rowBesidePress.slice(0, 3))
  const samSaturday = generate(samProfile(), 'sam:2')[0].days.find(d => d.focus === 'Shoulders & Abs')
  check('...and one whose press a flag took away still does (the row stands in for it)', !!samSaturday && working(samSaturday).some(e => e.substitution_group === 'row') && !working(samSaturday).some(e => e.movement_pattern === 'vertical_push'), samSaturday?.exercises.map(e => e.name))
  const samChest = generate(samProfile(), 'sam:2')[0].days.find(d => d.focus === 'Chest & Triceps')
  check('the tester on his tier alone: the chest day\'s triceps work is the dumbbell kickback, and no band movement stands beside it',
    !!samChest && working(samChest).some(e => e.name === 'Dumbbell Tricep Kickback') && !working(samChest).some(e => e.movement_pattern === 'isolation_tricep' && isImprovised(e)), samChest?.exercises.map(e => e.name))
  // Someone whose ONLY option is a band keeps it.
  const bandsOnly = withKit(buildProfile(combo({ equipment: 'minimalist', style: 'bodybuilding', duration: '60-90' })), [{ mode: 'only', items: ['bands'] }])
  const bandsPlan = generate(bandsOnly, 'bands-only')
  check('someone whose only kit is bands is still given band work (there is no better tool to prefer)',
    bandsPlan[0].days.flatMap(d => working(d)).filter(isImprovised).length >= 3 && improvisedBesideBetter(bandsOnly, bandsPlan).length === 0,
    bandsPlan[0].days.flatMap(d => working(d)).filter(isImprovised).map(e => e.name))

  say(`\n${ran} checks ran, ${failures} failed`)
}

await main().catch(err => { failures++; console.error('  FAIL: the gate crashed —', err) })
// THE ONE EXIT.
process.exit(failures > 0 ? 1 : 0)
