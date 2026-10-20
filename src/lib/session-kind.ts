import type { Exercise, MesocycleWeek, TrainingStyle, UserProfile, WorkoutDay } from './types'
import { EXERCISE_DATABASE, getVolumeRole, type ExerciseEntry, type MechanicsTier, type MovementPattern } from './exercise-db'
import {
  getConstrainedPool, getFlaggedJoints, isEquipmentAllowed, allowedEquipmentFor, orderCandidates, clampToVolumeRole, getRoleSetCeiling,
  setRandomSource, resetRandomSource, STYLE_CONFIGS, POOL_WIDE_IMPLEMENT_TIERS,
} from './exercise-plan'
import { buildReplacementSlot, isMainLiftSlot } from './mesocycle-edit'
import { settleWeek, rebuildWarmup } from './settle-week'
import { getGoalPolicy, RECOVERY_SET_MULTIPLIER, MAIN_LIFT_REST_FLOOR_SECONDS } from './goal-policies'
import { effectiveRecoveryCapacity } from './concurrent-activity'
import { getExperienceConfig } from './experience-config'
import { PHASE_CONFIGS } from './periodization'
import { isExternallyLoaded } from './load-prescription'
import { equipmentTierFor } from './kit-list'
import { estimateDaySeconds, getDurationBudgetSeconds, getSessionMaximumSeconds } from './session-duration'
import { seededRngFromKey } from './seeded-random'
import { resolveExerciseName } from './set-parse'
import { ask, SCOPE } from './coach-voice'
import { SESSION_KINDS, kindTodayOf, plural, nextTimeDue, type SessionKind, type KindTodayMarker } from './session-kind-marker'
export { SESSION_KINDS, sessionKindsFor, sessionKindFrom, kindTodayOf, describeKindToday, type SessionKind, type SessionKindOption, type KindTodayMarker } from './session-kind-marker'

// ---------------------------------------------------------------------------
// A DIFFERENT KIND OF SESSION TODAY — cardio, functional, or another style.
//
// Ashley, live test 19 Oct 2026: "if I cant do weights today I should easily
// be able to say something like 'lets do a cardio workout today' to change the
// entire day or 'give me a functional workout today that includes sled push,
// box jumps and other similar style exercises'."
//
// HER RULING, 20 Oct 2026: "Drop it, today only." The WHOLE day is replaced,
// main lift included, for today only, and the main lift comes back the next
// time it is due. Her 16 Sep "keep the main lift and rebuild around it" still
// holds for a different session of the SAME kind — that is session-rebuild.ts,
// untouched by this file.
//
// COMPOSED, NOT REGENERATED, and that is measured rather than preferred
// (docs/plans/a-different-kind-of-session-today.md): one full-body day
// generated with training_style 'functional' is a lifting session, and the
// generator's own "Conditioning & Core" day held ONE cardio exercise in seven
// once the week's top-up and balance passes had filled it. So the session is
// put together here from generation's own parts — the constrained pool, the
// ranker, the style's own set/rep/rest tables, the replacement pricer and the
// shared settling tail — and none of those is reimplemented.
//
// ONE BUILDER, TWO SURFACES (the meal-refit pattern). The day menu and the
// coach both plan through planSessionKindToday, word the offer through
// buildSessionKindTodayProposal, write through confirmSessionKindToday and
// put it back through undoSessionKindToday. Neither surface can offer, say or
// write something the other would not.
// ---------------------------------------------------------------------------

/** What she asked for by name, and what became of it. */
export interface AskedMove {
  said: string
  /** In the session as `name`. */
  included?: string
  /** Not possible, in her terms. */
  reason?: string
}

export interface SessionKindOffer {
  kind: SessionKind
  label: string
  weekNumber: number
  dayName: string
  /** What the live day must still be for this offer to be written. */
  baseSignature: string
  /** The week to write: today's new session, settled, with its marker. */
  week: MesocycleWeek
  session: Exercise[]
  minutes: number
  /** Over the length she set, because of what she asked for by name. */
  overLength: boolean
  plannedFocus: string
  droppedMainLift: { name: string; backOn: string | null } | null
  asked: AskedMove[]
}

export type SessionKindPlan = { ok: true; offer: SessionKindOffer } | { ok: false; refusal: string }

export interface PlanSessionKindParams {
  mesocycle: MesocycleWeek[]
  /** The POOL profile (App's constraintProfile), so a running ease-off is honoured. */
  profile: UserProfile
  weekNumber: number
  /** The plan row's day name (editTarget's planDayName). */
  dayName: string
  kind: SessionKind
  /** Moves she named, in her words. */
  moves?: string[]
  /** The compiled exclusion list — bans and dislikes. */
  exclusions: string[]
  /** Working sets already logged today. A started session is never redrawn. */
  loggedSets: number
}

// ---------------------------------------------------------------------------
// THE SESSIONS — the CSCS call, recorded in BACKLOG with its basis.
//
// Each block is one place in the session: which movements may fill it, which
// tiers in order of preference, and the job it does (used to name a stand-in
// for a move the catalogue does not have). `order` is where it sits in the
// session; `priority` is what a short session keeps first. Power before
// strength before conditioning (NSCA programme design); a short session sheds
// accessories and the finisher before the big patterns.
// ---------------------------------------------------------------------------

interface Block {
  id: string
  patterns: MovementPattern[]
  groups?: string[]
  tiers: MechanicsTier[]
  /** Lower ranks ahead within the block (after tier). */
  rank?: (e: ExerciseEntry) => number
  job: string
}

const T1: MechanicsTier = 'tier1_compound'
const T2: MechanicsTier = 'tier2_compound'
const T3: MechanicsTier = 'tier3_isolation'

/** The cardio machines, the same closed set fixedUnitPrescription prices as machine intervals, plus the elliptical. */
const CARDIO_MACHINES = ['treadmill', 'stationary bike', 'rowing machine', 'elliptical machine']
const isMachine = (e: ExerciseEntry) => e.equipment.some(q => CARDIO_MACHINES.includes(q))
// A MACHINE FIRST where her kit has one: the steadier, lower-impact way to hold
// a heart rate for minutes at a time. Then the gentler bodyweight pieces.
const CONDITIONING_BLOCK = (id: string): Block => ({
  id, patterns: ['cardio'], tiers: ['cardio'], job: 'the conditioning',
  rank: e => (isMachine(e) ? 0 : 1) * 10 + ({ low: 0, moderate: 1, high: 2 } as const)[e.joint_stress],
})
/** The nearest real thing to a sled: loaded locomotion and bracing, the heaviest first. */
const CARRY_RANK = ["Farmer's Walk", 'Suitcase Carry', 'Trap Bar Carry', 'Loaded Backpack Walk']
const CORE_BLOCK: Block = { id: 'core', patterns: ['core'], tiers: [T3, T2], job: 'the trunk work' }

const RECIPES: Record<SessionKind, { order: Block[]; priority: string[]; minWorking: number }> = {
  cardio: {
    order: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(CONDITIONING_BLOCK).concat(CORE_BLOCK),
    priority: ['c1', 'c2', 'core', 'c3', 'c4', 'c5', 'c6'],
    minWorking: 2,
  },
  functional: {
    order: [
      { id: 'prep', patterns: [], groups: ['explosive_lower', 'explosive_upper', 'swing'], tiers: ['primer'], job: 'the explosive work' },
      { id: 'hinge', patterns: ['hip_hinge'], tiers: [T2, T1], rank: e => (/swing|clean|snatch/i.test(e.name) ? 0 : 1), job: 'the hip drive' },
      { id: 'squat', patterns: ['knee_dominant', 'single_leg'], tiers: [T1, T2], job: 'the leg work' },
      { id: 'push', patterns: ['horizontal_push', 'vertical_push'], tiers: [T2, T1], job: 'the pushing' },
      { id: 'pull', patterns: ['horizontal_pull', 'vertical_pull'], tiers: [T2, T1], job: 'the pulling' },
      { id: 'carry', patterns: ['carry'], tiers: [T2, T3], rank: e => (CARRY_RANK.indexOf(e.name) + 1 || 10) + (e.prescription_type === 'distance_load' ? 0 : 20), job: 'the loaded carrying' },
      CONDITIONING_BLOCK('finisher'),
      CORE_BLOCK,
    ],
    priority: ['prep', 'hinge', 'squat', 'push', 'pull', 'finisher', 'carry', 'core'],
    minWorking: 3,
  },
  bodybuilding: {
    order: [
      { id: 'squat', patterns: ['knee_dominant'], tiers: [T1, T2], job: 'the leg work' },
      { id: 'push', patterns: ['horizontal_push'], tiers: [T2, T1], job: 'the pushing' },
      { id: 'pull', patterns: ['horizontal_pull', 'vertical_pull'], tiers: [T2, T1], job: 'the pulling' },
      { id: 'hinge', patterns: ['hip_hinge'], tiers: [T2, T1], job: 'the hip drive' },
      { id: 'shoulder', patterns: ['isolation_shoulder', 'vertical_push'], tiers: [T3, T2], job: 'the shoulder work' },
      { id: 'arm1', patterns: ['isolation_bicep'], tiers: [T3], job: 'the arm work' },
      { id: 'arm2', patterns: ['isolation_tricep'], tiers: [T3], job: 'the arm work' },
      CORE_BLOCK,
    ],
    priority: ['squat', 'push', 'pull', 'hinge', 'shoulder', 'arm1', 'arm2', 'core'],
    minWorking: 3,
  },
  hybrid: {
    order: [
      { id: 'main', patterns: ['knee_dominant', 'hip_hinge'], tiers: [T1, T2], job: 'the leg work' },
      { id: 'push', patterns: ['horizontal_push', 'vertical_push'], tiers: [T2, T1], job: 'the pushing' },
      { id: 'pull', patterns: ['horizontal_pull', 'vertical_pull'], tiers: [T2, T1], job: 'the pulling' },
      { id: 'single', patterns: ['single_leg'], tiers: [T2], job: 'the single-leg work' },
      CORE_BLOCK,
      CONDITIONING_BLOCK('finisher'),
    ],
    priority: ['main', 'push', 'pull', 'finisher', 'single', 'core'],
    minWorking: 3,
  },
}

/**
 * MOVES PEOPLE ASK FOR THAT THE CATALOGUE DOES NOT HAVE, and the block whose
 * job they do. A stand-in is named only when the session really holds that
 * block — "Farmer's Walk does the loaded carrying" is true; "something else
 * covers it" would not be.
 */
const NOT_IN_CATALOGUE: { re: RegExp; block: string }[] = [
  { re: /\b(sled|prowler)\b/i, block: 'carry' },
  { re: /\bsandbag\b/i, block: 'carry' },
  { re: /\b(tyre|tire)\b/i, block: 'hinge' },
  { re: /\b(ski\s*erg|air\s*bike|assault\s*bike|echo\s*bike)\b/i, block: 'finisher' },
]

const HIGH_IMPACT_LIMIT = 1
/** One substitution group fills at most two cardio blocks: shadow boxing and high knees are both "conditioning", and both are worth a block. */
const GROUP_LIMIT = 2


function blockAccepts(b: Block, e: ExerciseEntry): boolean {
  if (!b.tiers.includes(e.mechanics_tier)) return false
  return b.patterns.includes(e.movement_pattern) || (b.groups ?? []).includes(e.substitution_group ?? '')
}

const namesOf = (day: WorkoutDay) => day.exercises.map(e => e.name)
const signatureOf = (day: WorkoutDay, kind: SessionKind | null) =>
  JSON.stringify({ planned: namesOf(kindTodayOf(day)?.planned ?? day), kind: kindTodayOf(day)?.kind ?? kind ?? null })

/** "Box Jumps need a plyo box" — the kit word with an article where one reads right. */
function kitWords(items: string[]): string {
  const said = items.map(i => (/s$/.test(i) ? i : `a ${i}`))
  return said.length <= 1 ? (said[0] ?? 'kit') : `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`
}

/**
 * PLAN TODAY'S SESSION IN ANOTHER KIND. Nothing is written: this is the trial
 * both surfaces show before the tap.
 */
export async function planSessionKindToday(p: PlanSessionKindParams): Promise<SessionKindPlan> {
  const { mesocycle, profile, weekNumber, dayName, kind } = p
  const option = SESSION_KINDS.find(k => k.kind === kind)
  if (!option) return { ok: false, refusal: "I can't build that kind of session." }
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const live = week?.days.find(d => d.day === dayName)
  if (!week || !live) return { ok: false, refusal: "I couldn't find today on your plan." }

  // THE PLANNED DAY IS THE BASE, ALWAYS. A second request on a day already
  // swapped ("actually, make it functional") starts from what was planned, so
  // the main lift, the Undo and the offer all mean the session she was given.
  const marker = kindTodayOf(live)
  const planned = marker?.planned ?? live
  if (planned.exercises.length === 0) {
    return { ok: false, refusal: `There's no session on ${dayName} to swap — it's a ${planned.plannedActivity ? 'planned activity' : 'rest'} day.` }
  }
  if (p.loggedSets > 0) {
    return { ok: false, refusal: "You've already logged sets in today's session, so I'll leave it as it is — a session you've started isn't one to redraw underneath you." }
  }
  if (marker?.kind === kind) return { ok: false, refusal: `Today is already a ${option.label.toLowerCase()} session.` }
  if (option.style && option.style === (profile.training_style || 'hybrid')) {
    return { ok: false, refusal: `${option.label} is already how you train. For a different session of the same kind, "Give me a different session" rebuilds it and keeps your main lift.` }
  }

  const style: TrainingStyle = option.style ?? (profile.training_style || 'hybrid')
  const styleProfile: UserProfile = { ...profile, training_style: style }
  const exclusions = p.exclusions
  // THE POOL IS HERS: kit, injuries (the pool profile carries any running
  // ease-off), avoids and skill all remove. Only the style stage changes, to
  // the kind's own; cardio is not a style, so its pool skips that stage.
  const pool = getConstrainedPool(styleProfile, exclusions, { skipStyle: option.style == null })
  // A move she NAMES may be off-style — "you asked for it, you get it" — but
  // never off-kit, off-injury, avoided or beyond her level.
  const namedPool = getConstrainedPool(styleProfile, exclusions, { skipStyle: true })
  const plannedMain = planned.exercises.find(isMainLiftSlot)?.name ?? null
  const recipe = RECIPES[kind]

  // NAMED MOVES FIRST: each one resolved the way a logged set's name is, and
  // either placed in the block of its own job or said to be impossible.
  const asked: AskedMove[] = []
  const claimed = new Map<string, ExerciseEntry>()
  const extras: ExerciseEntry[] = []
  const standIns: { said: string; block: string }[] = []
  /** A move her KIT lacks, by the entry it resolved to, so its stand-in can be named once the session exists. */
  const lacking = new Map<AskedMove, ExerciseEntry>()
  for (const raw of p.moves ?? []) {
    const said = String(raw).trim()
    if (!said) continue
    const r = resolveExerciseName(said, [])
    if (r.resolution !== 'resolved') {
      if (r.resolution === 'ambiguous') { asked.push({ said, reason: `I wasn't sure which ${said} you meant, so I left it out.` }); continue }
      const job = NOT_IN_CATALOGUE.find(n => n.re.test(said))
      if (job) standIns.push({ said, block: job.block })
      else asked.push({ said, reason: `There's no ${said} in the app's exercise list, so it isn't in today's session.` })
      continue
    }
    const entry = EXERCISE_DATABASE.find(e => e.name === r.exerciseName)
    if (!entry) { asked.push({ said, reason: `There's no ${said} in the app's exercise list, so it isn't in today's session.` }); continue }
    if (!namedPool.some(e => e.name === entry.name)) {
      if (exclusions.some(x => x.toLowerCase() === entry.name.toLowerCase())) {
        asked.push({ said, reason: `${entry.name} ${plural(entry.name) ? 'are' : 'is'} on your exercises to avoid, so I've left ${plural(entry.name) ? 'them' : 'it'} out.` })
      } else if (!isEquipmentAllowed(entry, profile)) {
        const allow = allowedEquipmentFor(profile)
        const missing = allow ? entry.equipment.filter(eq => !allow.has(eq)) : entry.equipment
        const move: AskedMove = { said, reason: `${entry.name} ${plural(entry.name) ? 'need' : 'needs'} ${kitWords(missing)}, which ${missing.length > 1 || plural(missing[0] ?? '') ? "aren't" : "isn't"} in your kit` }
        asked.push(move)
        lacking.set(move, entry)
      } else if (getConstrainedPool({ ...styleProfile, injuries: [] }, exclusions, { skipStyle: true }).some(e => e.name === entry.name)) {
        asked.push({ said, reason: `${entry.name} ${plural(entry.name) ? 'are' : 'is'} kept out by the injury on your profile, so I've left ${plural(entry.name) ? 'them' : 'it'} out.` })
      } else {
        asked.push({ said, reason: `${entry.name} ${plural(entry.name) ? 'are' : 'is'} above the level your plan is set at, so I've left ${plural(entry.name) ? 'them' : 'it'} out.` })
      }
      continue
    }
    const home = recipe.order.find(b => !claimed.has(b.id) && blockAccepts(b, entry))
    if (home) claimed.set(home.id, entry)
    else if (!extras.some(e => e.name === entry.name)) extras.push(entry)
    asked.push({ said, included: entry.name })
  }

  // RANKED BY THE APP'S OWN RANKER, seeded so the trial and the confirm are the
  // same session and so a gate gives the same answer on a Tuesday. The rest of
  // this week counts as already used, and so does today's planned session: a
  // different kind of day should not hand her tomorrow's work, or today's.
  const weekly = new Map<string, number>()
  for (const d of week.days) {
    const src = d.day === dayName ? planned : d
    for (const e of src.exercises) weekly.set(e.name, (weekly.get(e.name) ?? 0) + 1)
  }
  const flagged = getFlaggedJoints(profile.injuries ?? [])
  const tier = equipmentTierFor(profile) || 'full_gym'
  const policy = getGoalPolicy(profile.fitness_goal || 'hypertrophy')
  // A MOVE HER KIT LACKS IS STOOD IN FOR BY ITS OWN KIND where the pool has
  // one: no box means broad jumps for box jumps, not a press-up.
  const wantGroup = new Map<string, string>()
  for (const entry of lacking.values()) {
    const block = recipe.order.find(b => b.patterns.includes(entry.movement_pattern) || (b.groups ?? []).includes(entry.substitution_group ?? ''))
    if (block && !wantGroup.has(block.id) && entry.substitution_group) wantGroup.set(block.id, entry.substitution_group)
  }
  const picks = new Map<string, ExerciseEntry>()
  const taken = new Set<string>([...claimed.values(), ...extras].map(e => e.name))
  if (plannedMain) taken.add(plannedMain)
  let highImpact = [...claimed.values(), ...extras].filter(e => e.joint_stress === 'high' && e.mechanics_tier === 'cardio').length
  let mainTaken = [...claimed.values(), ...extras].some(e => e.mechanics_tier === T1)
  const usedGroups = new Map<string, number>()
  const useGroup = (e: ExerciseEntry) => { const g = e.substitution_group ?? e.name; usedGroups.set(g, (usedGroups.get(g) ?? 0) + 1) }
  for (const e of [...claimed.values(), ...extras]) if (e.mechanics_tier === 'cardio') useGroup(e)

  setRandomSource(seededRngFromKey(`session-kind|${profile.id ?? 'anon'}|${weekNumber}|${dayName}|${kind}`))
  try {
    for (const b of recipe.order) {
      const named = claimed.get(b.id)
      if (named) { picks.set(b.id, named); continue }
      let candidates = pool.filter(e => blockAccepts(b, e) && !taken.has(e.name))
      if (b.tiers.includes('cardio')) {
        candidates = candidates.filter(e => (usedGroups.get(e.substitution_group ?? e.name) ?? 0) < GROUP_LIMIT)
        if (highImpact >= HIGH_IMPACT_LIMIT) candidates = candidates.filter(e => e.joint_stress !== 'high')
      }
      // ONE MAIN LIFT. A second tier-1 compound is only taken where nothing
      // else can fill the block.
      if (mainTaken && candidates.some(e => e.mechanics_tier !== T1)) candidates = candidates.filter(e => e.mechanics_tier !== T1)
      // A STAND-IN OF ITS OWN KIND first, where the pool has one.
      const wanted = wantGroup.get(b.id)
      if (wanted && candidates.some(e => e.substitution_group === wanted)) candidates = candidates.filter(e => e.substitution_group === wanted)
      // NOT THE REST OF THIS WEEK'S WORK, where anything else fills the block:
      // a one-off day should not hand her tomorrow's session early, and one
      // lift on two days would have to share one weight.
      if (candidates.some(e => !weekly.has(e.name))) candidates = candidates.filter(e => !weekly.has(e.name))
      if (candidates.length === 0) continue
      const ranked = orderCandidates(candidates, policy, profile.training_experience || 'novice', {
        trackPatterns: b.patterns.length > 0 ? b.patterns : ['activation'],
        selectedSoFar: [...picks.values()],
        weeklyAppearanceCount: weekly,
        flaggedJoints: flagged,
        equipmentAccess: tier,
        trainingStyle: option.style ?? undefined,
        implementPeerPool: POOL_WIDE_IMPLEMENT_TIERS.has(tier) ? pool : undefined,
      }).map(s => s.e)
      // Tier first; then, for strength work where her kit has weights, a lift
      // that carries one (her 10 Sep rule: weight wins, a loaded lift is not
      // traded for a bodyweight one by default); then the block's own order
      // (machines first for cardio, swings for the hinge, the heaviest carry);
      // then the app's ranker.
      const weighted = tier !== 'bodyweight' && b.tiers.some(t => t === T1 || t === T2) && b.id !== 'core'
      const ordered = ranked
        .map((e, i) => ({ e, i }))
        .sort((x, y) =>
          (b.tiers.indexOf(x.e.mechanics_tier) - b.tiers.indexOf(y.e.mechanics_tier))
          || (weighted ? Number(isExternallyLoaded(y.e)) - Number(isExternallyLoaded(x.e)) : 0)
          || ((b.rank?.(x.e) ?? 0) - (b.rank?.(y.e) ?? 0))
          || x.i - y.i)
        .map(x => x.e)
      const pick = ordered[0]
      picks.set(b.id, pick)
      taken.add(pick.name)
      if (pick.mechanics_tier === T1) mainTaken = true
      if (pick.mechanics_tier === 'cardio') {
        useGroup(pick)
        if (pick.joint_stress === 'high') highImpact++
      }
    }
  } finally {
    resetRandomSource()
  }

  // THE STAND-IN FOR A MOVE SHE ASKED FOR IS KEPT like the move itself would
  // have been: what she named is never sized out, and neither is what is
  // doing its job.
  const blockForJob = (entry: ExerciseEntry) =>
    // Judged on pattern alone: the move never reached the pool, so its tier is
    // no guide to where it would sit.
    recipe.order.find(b => b.patterns.includes(entry.movement_pattern) || (b.groups ?? []).includes(entry.substitution_group ?? ''))
  const standInBlocks = new Set<string>()
  for (const entry of lacking.values()) { const b = blockForJob(entry); if (b) standInBlocks.add(b.id) }
  for (const st of standIns) standInBlocks.add(st.block)

  // PRICED THE WAY GENERATION PRICES THIS STYLE AND PHASE.
  const exp = getExperienceConfig(profile.training_experience)
  const phase = Object.values(PHASE_CONFIGS).find(c => c.label === week.phase_label?.trim())
  const isLong = (profile.session_duration_preference || '45-60') === '90+'
  const recovery = RECOVERY_SET_MULTIPLIER[effectiveRecoveryCapacity(profile)]
  const intensity = planned.exercises.find(e => e.tier !== 'tier_0_primer' && e.intensity)?.intensity ?? exp.target_rpe
  const styleConfig = STYLE_CONFIGS[style]
  const deload = !!week.is_deload
  const halve = (n: number) => Math.max(2, Math.round(n * 0.5))

  const price = async (entry: ExerciseEntry): Promise<Exercise> => {
    const isPrimer = entry.mechanics_tier === 'primer'
    const tierKey = entry.mechanics_tier === T1 ? 'tier1' : entry.mechanics_tier === T2 ? 'tier2' : 'tier3'
    let sets = 2
    let rest = 30
    if (!isPrimer) {
      const base = styleConfig.setRange[tierKey] * exp.sets_multiplier * policy.setVolumeMultiplier * recovery
      sets = deload ? halve(base) : clampToVolumeRole(Math.max(2, Math.round(base * (phase?.sets_multiplier ?? 1))), getVolumeRole(entry), isLong)
      rest = Math.max(20, Math.round(styleConfig.restSeconds[tierKey] * policy.restSecondsMultiplier[tierKey])) + (phase?.rest_adjust_seconds ?? 0)
      // REST IS NEVER CUT TO FIT (her 18 Sep "protect the rest, do less"), and
      // a main lift keeps the floor generation gives it.
      if (entry.mechanics_tier === T1) rest = Math.max(rest, isExternallyLoaded(entry) ? (policy.minLoadedMainLiftRestSeconds ?? MAIN_LIFT_REST_FLOOR_SECONDS) : MAIN_LIFT_REST_FLOOR_SECONDS)
      rest = Math.max(rest, 20)
    }
    // The template says 'reps' so a hold, carry or interval coming into it
    // takes its own canonical units (replacementProgramming), and a rep lift
    // takes its own bracket for this style and phase.
    const template: Exercise = { name: entry.name, sets, reps: '8-12', rest: `${rest}s`, substitution: '', intensity, prescription_type: 'reps' }
    const ex = await buildReplacementSlot(template, entry, styleProfile, week, false)
    if (entry.prescription_type === 'intervals') ex.sets = deload ? halve(Math.max(2, Math.round(6 * exp.sets_multiplier))) : Math.max(2, Math.round(6 * exp.sets_multiplier))
    else if (deload && entry.prescription_type !== 'reps' && entry.prescription_type !== 'steady_state') ex.sets = halve(ex.sets)
    return ex
  }

  const order = [...recipe.order.map(b => b.id), 'extra']
  const pricedBlocks: { id: string; ex: Exercise; required: boolean }[] = []
  for (const b of recipe.order) {
    const e = picks.get(b.id)
    if (e) pricedBlocks.push({ id: b.id, ex: await price(e), required: claimed.has(b.id) || standInBlocks.has(b.id) })
  }
  for (const e of extras) pricedBlocks.push({ id: 'extra', ex: await price(e), required: true })

  // SIZED TO HER SESSION LENGTH: blocks in priority order while the day, with
  // its own warm-up, fits the length she set. What she named is never sized out.
  const target = getDurationBudgetSeconds(profile.session_duration_preference || '45-60')
  const ceiling = getSessionMaximumSeconds(profile.session_duration_preference || '45-60')
  const dayOf = (list: typeof pricedBlocks): WorkoutDay => rebuildWarmup({
    day: dayName,
    focus: `${option.label} session`,
    exercises: [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(x => ({ ...x.ex })),
  }, profile)
  const working = (list: typeof pricedBlocks) => list.filter(x => x.ex.tier !== 'tier_0_primer').length
  let chosen = pricedBlocks.filter(x => x.required)
  for (const id of [...recipe.priority]) {
    const block = pricedBlocks.find(x => x.id === id && !x.required)
    if (!block) continue
    const trial = [...chosen, block]
    const secs = estimateDaySeconds(dayOf(trial))
    if (secs <= target || (working(chosen) < recipe.minWorking && secs <= ceiling)) chosen = trial
  }
  // WHAT TOOK THE JOB OF A MOVE SHE ASKED FOR, named only from the session as
  // it now stands — never a block the sizing left out.
  const inSession = new Map(chosen.map(x => [x.id, x.ex.name]))
  for (const [a, entry] of lacking) {
    const block = blockForJob(entry)
    const stand = block ? inSession.get(block.id) : undefined
    a.reason = stand ? `${a.reason}, so ${stand} ${plural(stand) ? 'take' : 'takes'} ${plural(entry.name) ? 'their' : 'its'} place.` : `${a.reason}, so I've left ${plural(entry.name) ? 'them' : 'it'} out.`
  }
  for (const st of standIns) {
    const block = recipe.order.find(b => b.id === st.block)
    const stand = block ? inSession.get(block.id) : undefined
    asked.push({
      said: st.said,
      reason: stand && block
        ? `There's no ${st.said} in the app's exercise list, so ${stand} ${plural(stand) ? 'do' : 'does'} ${block.job}.`
        : `There's no ${st.said} in the app's exercise list, so it isn't in today's session.`,
    })
  }
  if (working(chosen) < 2) {
    return { ok: false, refusal: `I can't build a ${option.label.toLowerCase()} session from what your kit, injuries and exercises to avoid leave, so ${dayName} stays as planned.` }
  }
  // THE TIME LEFT GOES ON WORK, the way generation's own duration top-up does
  // it: a round more of each interval block for cardio (up to the conditioning
  // ceiling, 8, or 10 on a 90-minute session), a set more of each lift for the
  // others (up to its role's ceiling), in priority order. Never on a deload,
  // whose whole point is less. Rest is never the thing that gives.
  if (!deload) {
    const lifts = kind !== 'cardio'
    const capOf = (ex: Exercise): number => {
      if (ex.prescription_type === 'intervals') return lifts ? ex.sets : (isLong ? 10 : 8)
      if (!lifts || ex.tier === 'tier_0_primer' || ex.prescription_type === 'steady_state') return ex.sets
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      const role = entry ? getVolumeRole(entry) : null
      return role ? getRoleSetCeiling(role, isLong) : ex.sets
    }
    const byPriority = [...chosen].sort((a, b) => recipe.priority.indexOf(a.id) - recipe.priority.indexOf(b.id))
    let grew = true
    while (grew) {
      grew = false
      for (const x of byPriority) {
        if (x.ex.sets >= capOf(x.ex)) continue
        x.ex = { ...x.ex, sets: x.ex.sets + 1 }
        if (estimateDaySeconds(dayOf(chosen)) > target) { x.ex = { ...x.ex, sets: x.ex.sets - 1 }; continue }
        grew = true
      }
    }
  }

  // THE SHARED TAIL (rule 3), on the person's own profile: set hierarchy, one
  // weight per lift, load coherence and a warm-up built from what the day now
  // holds — and only TODAY takes its result.
  //
  // THE WEEK'S OTHER DAYS ARE NOT REBALANCED AROUND A ONE-OFF, decided as a
  // CSCS coach and measured first: run as an ordinary edit, the week balance
  // pass answered a cardio Monday by cutting Friday's presses from 4 sets to 2
  // and Wednesday's from 3 to 2 — work she can still do, taken away to square
  // a push:pull ratio over a week that has simply lost one session. A missed
  // day and an activity swap leave the rest of the week alone for the same
  // reason, and so does this: the planned week resumes tomorrow as written.
  const fresh: WorkoutDay = {
    day: dayName,
    focus: `${option.label} session`,
    exercises: dayOf(chosen).exercises,
    ...(planned.is_scheduled != null ? { is_scheduled: planned.is_scheduled } : {}),
  }
  const unmarked = { ...planned }
  delete unmarked.kind_today
  const settled = settleWeek({ ...week, days: week.days.map(d => (d.day === dayName ? fresh : d)) }, dayName, profile)
  const today = settled.week.days.find(d => d.day === dayName)!
  const markerOut: KindTodayMarker = { kind, label: option.label, planned: unmarked, droppedMainLift: plannedMain }
  const finalWeek: MesocycleWeek = {
    ...week,
    days: week.days.map(d => (d.day === dayName ? { ...today, kind_today: markerOut } : d)),
  }
  const seconds = estimateDaySeconds(today)

  return {
    ok: true,
    offer: {
      kind,
      label: option.label,
      weekNumber,
      dayName,
      baseSignature: signatureOf(live, null),
      week: finalWeek,
      session: today.exercises,
      minutes: Math.round(seconds / 60),
      overLength: seconds > ceiling,
      plannedFocus: planned.focus,
      droppedMainLift: plannedMain ? { name: plannedMain, backOn: nextTimeDue(mesocycle, weekNumber, dayName, plannedMain) } : null,
      asked,
    },
  }
}

/**
 * WRITE THE OFFER — exactly the week the offer showed, and only if today is
 * still the day it was built from. A day changed since (an exercise swapped,
 * another kind already applied) is refused rather than overwritten.
 */
export function confirmSessionKindToday(
  mesocycle: MesocycleWeek[],
  offer: SessionKindOffer,
): { ok: true; mesocycle: MesocycleWeek[] } | { ok: false; refusal: string } {
  const live = mesocycle.find(w => w.week_number === offer.weekNumber)?.days.find(d => d.day === offer.dayName)
  if (!live || signatureOf(live, null) !== offer.baseSignature) {
    return { ok: false, refusal: "Today's session has changed since I put that together, so nothing was changed. Ask again and I'll build it from what's there now." }
  }
  return { ok: true, mesocycle: mesocycle.map(w => (w.week_number === offer.weekNumber ? offer.week : w)) }
}

/**
 * PUT THE PLANNED SESSION BACK — the day exactly as planned, and any other day
 * the balance pass touched, if it still holds what this wrote. Refused once
 * working sets are logged against the new session: those sets are history and
 * the plan they were done against stays.
 */
export function undoSessionKindToday(
  mesocycle: MesocycleWeek[],
  weekNumber: number,
  dayName: string,
  loggedSets: number,
): { ok: true; mesocycle: MesocycleWeek[]; restored: string } | { ok: false; refusal: string } {
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const marker = kindTodayOf(day)
  if (!week || !day || !marker) return { ok: false, refusal: "Today is the session that was planned, so there's nothing to put back." }
  if (loggedSets > 0) return { ok: false, refusal: `You've logged sets in today's ${marker.label.toLowerCase()} session, so it stays — ${dayName} is back to normal next week.` }
  const restoredWeek: MesocycleWeek = { ...week, days: week.days.map(d => (d.day === dayName ? marker.planned : d)) }
  return { ok: true, mesocycle: mesocycle.map(w => (w.week_number === weekNumber ? restoredWeek : w)), restored: marker.planned.focus }
}

/** One exercise as its name and its dose — the card's row and the sheet's line. */
function sessionItem(ex: Exercise): { name: string; dose: string } {
  const load = ex.suggested_load && !/^(bodyweight|light)$/i.test(ex.suggested_load.trim()) ? ` · ${ex.suggested_load}` : ''
  if (ex.tier === 'tier_0_primer') return { name: ex.name, dose: `${ex.sets} × ${ex.reps}, light, to get going` }
  if (ex.prescription_type === 'intervals') return { name: ex.name, dose: `${ex.sets} rounds, ${ex.reps} on, ${ex.rest} off` }
  if (ex.prescription_type === 'steady_state') return { name: ex.name, dose: `${Math.round((parseInt(ex.reps, 10) || 0) / 60)} min steady` }
  return { name: ex.name, dose: `${ex.sets} × ${ex.reps}${load}` }
}

/**
 * THE OFFER IN WORDS — the one place both surfaces get them from, so the card
 * and the sheet cannot say different things about the same session.
 *
 * `when` is the day as the person sees it ("today" on the screen, the weekday
 * in the chat). Every note is a full sentence that starts like one.
 */
export function buildSessionKindTodayProposal(offer: SessionKindOffer, when: string): { lead: string; items: { name: string; dose: string }[]; lines: string[]; notes: string[] } {
  const lead = ask(`make ${when} a ${offer.label.toLowerCase()} session instead of ${offer.plannedFocus}`)
  const items = offer.session.map(sessionItem)
  const lines = items.map(i => `${i.name} — ${i.dose}`)
  const notes: string[] = []
  for (const a of offer.asked) {
    if (a.included) continue
    if (a.reason) notes.push(a.reason)
  }
  if (offer.droppedMainLift) {
    notes.push(offer.droppedMainLift.backOn
      ? `${offer.droppedMainLift.name} ${plural(offer.droppedMainLift.name) ? 'are' : 'is'} out today and back ${offer.droppedMainLift.backOn}, as planned. Missing ${plural(offer.droppedMainLift.name) ? 'them' : 'it'} today doesn't change the weight.`
      : `${offer.droppedMainLift.name} ${plural(offer.droppedMainLift.name) ? 'are' : 'is'} out today. Missing ${plural(offer.droppedMainLift.name) ? 'them' : 'it'} today doesn't change the weight.`)
  }
  notes.push(offer.overLength
    ? `About ${offer.minutes} minutes, which is longer than your usual because of what you asked for.`
    : `About ${offer.minutes} minutes.`)
  notes.push(SCOPE.today(offer.dayName))
  return { lead, items, lines, notes }
}
