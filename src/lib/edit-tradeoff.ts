import type { MesocycleWeek, UserProfile, WorkoutDay, FitnessGoal } from './types'
import { EXERCISE_DATABASE, type ExerciseEntry } from './exercise-db'
import { scorePlan, ONE_RULE, DIMENSION_KEYS, type DimensionKey } from './quality-score'

// ---------------------------------------------------------------------------
// WHAT A CHANGE COSTS YOUR GOAL — the sentence, and how firm to be about it.
//
// Ashley, 14 Sep 2026: "If we just allow users to make any change they want
// without advising them, they will end up with a plan that doesn't help them
// meet their goal." Then, on the one open question in the proposal: "You
// decide what you think is best and then tell me what you decided and why."
//
// THE DECISION, taken by the session on that delegation and recorded in
// CLAUDE.md and docs/how-the-app-talks-about-a-change.md:
//
//   Tier 0  free              — do it, say nothing
//   Tier 1  costs something   — one sentence in the GOAL's own terms, plus
//                               the cheaper route, one tap as now
//   Tier 2  against the goal  — a QUESTION with chips before any card; one
//                               chip is always "do it anyway", so the change
//                               is exactly one tap further away, never blocked
//   Tier 3  unsafe            — refused. NOT THIS MODULE'S JOB and deliberately
//                               so: it already lives in the builders (three
//                               exercises minimum, allergens, dislikes, absurd
//                               portions) and moving it here would give one
//                               rule two homes.
//
// WHY NOT REFUSE MORE. Every reason is Ashley's own: you asked, so you get it;
// a refusal teaches people to stop asking, and the person who stops asking
// stops using the app; and the person knows things the app cannot — the
// machine is broken, the kids are ill.
//
// PURE, AND THAT IS LOAD-BEARING. No I/O, no clock, no model. The sentence a
// person reads is composed HERE from the trial, not written by Gemini, which
// is what lets both surfaces say the same thing and lets the coach exam grade
// it. See `docs/how-the-app-talks-about-a-change.md` §6.
// ---------------------------------------------------------------------------

export type EditTier = 0 | 1 | 2

/** Every in-place edit path that can reach a confirm card. */
export type EditKind =
  | 'swap' | 'remove' | 'add' | 'reorder' | 'ban'
  | 'volume_lighter' | 'volume_heavier' | 'shorten' | 'session_move'

export interface TradeoffAlternative {
  label: string
  note: string
  /** What tapping it asks for, in the user's words — so one list serves the card and the screen. */
  prompt: string
}

export interface Tradeoff {
  tier: EditTier
  /**
   * What it costs, in the goal's own terms. One sentence. Null at tier 0.
   * Rendered `warn` on the card at tier 1, and inside the question at tier 2.
   */
  cost: string | null
  /** The cheaper route. Empty when there genuinely isn't one. */
  alternatives: TradeoffAlternative[]
  /**
   * TIER 2 ONLY. The question the coach asks BEFORE a card exists. Null at
   * every other tier. The caller is responsible for offering "do it anyway"
   * alongside — see DO_IT_ANYWAY.
   */
  question: string | null
  /**
   * Why this tier, for the log and the gate. NEVER SHOWN. A reason string on
   * screen is the app explaining its own internals in front of someone.
   */
  reason: string
}

/**
 * The chip that must accompany every tier-2 question. Exported rather than
 * written out at each call site, because "the change is exactly one tap
 * further away, never blocked" is the whole of the decision and a call site
 * that forgot this chip would quietly turn an ask into a block.
 */
export const DO_IT_ANYWAY = 'Do it anyway'

// ---------------------------------------------------------------------------
// MUSCLE GROUPS — the words a person uses, not the catalogue's anatomy.
//
// `primary_muscles` is written for accuracy and says 'quadriceps' in one entry
// and 'quads' in another, 'biceps' and 'biceps brachii', 'anterior deltoid'
// and 'shoulders'. Summing those raw would report two different muscles that
// are one muscle. This maps them onto the ten groups people actually name.
// Anything unmapped is ignored rather than guessed at: 'cardiovascular system'
// is not a muscle group someone counts sets for.
// ---------------------------------------------------------------------------
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core'

const MUSCLE_GROUP: Record<string, MuscleGroup> = {
  'chest': 'chest', 'upper chest': 'chest', 'lower chest': 'chest', 'pectorals': 'chest',
  'lats': 'back', 'rhomboids': 'back', 'mid traps': 'back', 'traps': 'back', 'teres major': 'back',
  'upper back': 'back', 'erectors': 'back', 'spinal erectors': 'back', 'lower back': 'back',
  'anterior deltoid': 'shoulders', 'lateral deltoid': 'shoulders', 'rear deltoid': 'shoulders',
  'posterior deltoid': 'shoulders', 'shoulders': 'shoulders', 'deltoids': 'shoulders', 'rotator cuff': 'shoulders',
  'biceps': 'biceps', 'biceps brachii': 'biceps', 'brachialis': 'biceps', 'forearms': 'biceps',
  'triceps': 'triceps',
  'quadriceps': 'quads', 'quads': 'quads',
  'hamstrings': 'hamstrings',
  'glutes': 'glutes', 'glute medius': 'glutes', 'hip flexors': 'glutes', 'adductors': 'glutes', 'abductors': 'glutes',
  'calves': 'calves', 'soleus': 'calves',
  'core': 'core', 'obliques': 'core', 'transverse abdominis': 'core', 'abs': 'core', 'rectus abdominis': 'core',
}

/** How a group is named mid-sentence. */
const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: 'chest', back: 'back', shoulders: 'shoulders', biceps: 'biceps', triceps: 'triceps',
  quads: 'quads', hamstrings: 'hamstrings', glutes: 'glutes', calves: 'calves', core: 'core',
}

const entryFor = (name: string): ExerciseEntry | undefined =>
  EXERCISE_DATABASE.find(e => e.name.toLowerCase() === name.toLowerCase())

/**
 * Working sets per muscle group across ONE week.
 *
 * A set counts once for every group its exercise names as primary, which is
 * the ordinary way sets-per-muscle is counted and deliberately generous — a
 * bench press counts toward chest, shoulders and triceps. That over-counts in
 * absolute terms, which is exactly why nothing here compares against an
 * absolute target: see `muscleVolumeChange` below.
 */
export function weeklySetsByMuscle(week: MesocycleWeek | undefined): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {}
  if (!week) return out
  for (const day of week.days) {
    for (const ex of day.exercises) {
      // A primer is preparation, not training volume — counting warm-up work
      // toward "sets that grow a muscle" would inflate every group.
      if (ex.tier === 'tier_0_primer') continue
      const entry = entryFor(ex.name)
      if (!entry) continue
      const groups = new Set<MuscleGroup>()
      for (const m of entry.primary_muscles) {
        const g = MUSCLE_GROUP[m.trim().toLowerCase()]
        if (g) groups.add(g)
      }
      for (const g of groups) out[g] = (out[g] ?? 0) + (ex.sets ?? 0)
    }
  }
  return out
}

/**
 * NO INVENTED TARGET. The first draft of this compared against a literature
 * number — "under the 10 sets that keeps a muscle growing" — and that was the
 * wrong instinct twice over: the app has no such constant anywhere else, and
 * the counting above is generous enough that an absolute would fire wrongly.
 *
 * The honest comparison is the person's OWN plan. It was built to deliver a
 * certain amount of work for each muscle this week; an edit that takes a third
 * of that away is a real cost whatever the absolute number happens to be, and
 * it is a cost the app can state without claiming knowledge it does not have.
 */
const MATERIAL_VOLUME_SHIFT = 0.25

export interface MuscleVolumeChange {
  group: MuscleGroup
  before: number
  after: number
  direction: 'down' | 'up'
  /** Share of the original, e.g. 0.36 for a 36% move. */
  fraction: number
}

/** The biggest material move in weekly sets for one muscle group, or null. */
export function muscleVolumeChange(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
): MuscleVolumeChange | null {
  const b = weeklySetsByMuscle(before)
  const a = weeklySetsByMuscle(after)
  const groups = new Set<MuscleGroup>([...Object.keys(b), ...Object.keys(a)] as MuscleGroup[])
  let worst: MuscleVolumeChange | null = null
  for (const group of groups) {
    const bn = b[group] ?? 0
    const an = a[group] ?? 0
    if (bn === 0) continue
    const delta = an - bn
    if (delta === 0) continue
    const fraction = Math.abs(delta) / bn
    if (fraction < MATERIAL_VOLUME_SHIFT) continue
    const change: MuscleVolumeChange = {
      group, before: bn, after: an, direction: delta < 0 ? 'down' : 'up', fraction,
    }
    if (!worst || fraction > worst.fraction) worst = change
  }
  return worst
}

// ---------------------------------------------------------------------------
// WHERE THEY ARE — the facts the tier rules read.
// ---------------------------------------------------------------------------

/** The phases where the barbell lift itself is the point, so a substitution costs specificity. */
const STRENGTH_PHASES = ['Maximal Strength', 'Power & Expression']
/** The phases whose whole job is accumulating work, so a standing volume cut fights them. */
const ACCUMULATION_PHASES = ['Hypertrophy', 'Metabolic Conditioning', 'Consolidation']

export const isStrengthPhase = (week: MesocycleWeek | undefined): boolean =>
  !!week?.phase_label && STRENGTH_PHASES.includes(week.phase_label)

export const isAccumulationPhase = (week: MesocycleWeek | undefined): boolean =>
  !!week?.phase_label && ACCUMULATION_PHASES.includes(week.phase_label)

/**
 * The starting-out plan gets NO cost lines at all — Ashley's own ordering:
 * consistency beats every other consideration there, and the cost of any edit
 * is small next to not turning up. Read from the profile's start preference
 * rather than from the plan's shape, because that is where the answer lives.
 */
export const isStartingOut = (profile: UserProfile): boolean =>
  profile.start_preference === 'move_more'

// ---------------------------------------------------------------------------
// THE GOAL'S OWN TERMS
// ---------------------------------------------------------------------------

/** What this person is training for, said the way they would say it. */
const GOAL_NOUN: Record<FitnessGoal, string> = {
  hypertrophy: 'building muscle',
  fat_loss: 'losing fat while keeping muscle',
  functional: 'getting stronger and moving well',
  conditioning: 'your conditioning',
}

/** Why a muscle losing work matters, per goal. One clause, never a paragraph. */
function whyVolumeMatters(goal: FitnessGoal, group: MuscleGroup): string {
  const g = GROUP_LABEL[group]
  switch (goal) {
    case 'hypertrophy': return `${g} grows from the work you do for it`
    case 'fat_loss': return `that work is what keeps ${g} on you while you're eating less`
    case 'functional': return `${g} carries a lot of what you're training for`
    case 'conditioning': return `it's work your week is built around`
  }
}

// ---------------------------------------------------------------------------
// THE SCORE, AS WORDS
// ---------------------------------------------------------------------------

/** What each dimension means to a person. The score itself is never shown — Ashley's ruling, 13 Sep 2026. */
const DIMENSION_IN_WORDS: Record<DimensionKey, string> = {
  timeFit: 'the session stops fitting the time you set aside',
  structure: 'the session loses its shape — the order and the set counts stop lining up',
  progression: 'the week stops building on the one before it',
  selection: 'the week stops covering everything it should',
  goalAlignment: `it pulls the plan away from what you're training for`,
  primerFit: 'the warm-up stops matching the work',
}

export interface ScoreDrop {
  dimension: DimensionKey
  /** How far it fell, in the scorer's own unit (0.4 = one rule newly violated). */
  lost: number
}

/**
 * Which dimension the edit hurt most, if any hurt materially.
 *
 * DELTAS ONLY, NEVER AN ABSOLUTE. `skipComparisons` changes goalAlignment's
 * denominator, so a score computed this way cannot be held against
 * test:quality's 7.2 floor — see ScoreOptions' own note. Comparing a before
 * against an after computed the same way is sound; quoting either number is
 * not, and nothing here does.
 */
export function scoreDrop(
  profile: UserProfile,
  before: MesocycleWeek[],
  after: MesocycleWeek[],
): ScoreDrop | null {
  const key = `tradeoff:${profile.id ?? 'anon'}`
  const b = scorePlan(profile, before, key, { skipComparisons: true })
  const a = scorePlan(profile, after, key, { skipComparisons: true })
  let worst: ScoreDrop | null = null
  for (const dimension of DIMENSION_KEYS) {
    const lost = b.dimensions[dimension].points - a.dimensions[dimension].points
    // ONE_RULE is the scorer's own penalty for a distinct rule newly broken.
    // Anything under it is rounding, not a finding.
    if (lost < ONE_RULE - 1e-9) continue
    if (!worst || lost > worst.lost) worst = { dimension, lost }
  }
  return worst
}

// ---------------------------------------------------------------------------
// THE PINNED TIER-2 LIST
//
// Seven cases, written down rather than left to the scorer, because these are
// the ones a coach would stop on and the scorer cannot see all of them. Each
// carries the question it asks. Anything NOT here and not a score drop is
// tier 1 at most — that is what stops "ask first" spreading into nagging.
// ---------------------------------------------------------------------------

export interface EditContext {
  profile: UserProfile
  /** The live plan before the edit. */
  before: MesocycleWeek[]
  /** The trial — the same call confirm makes. */
  after: MesocycleWeek[]
  weekNumber: number
  dayName: string
  kind: EditKind
  /** 'today' touches this week only; 'permanent'/'ongoing' reaches the rest of the block. */
  scope: 'today' | 'permanent'
  /** The exercise being swapped, removed, added or banned, where there is one. */
  exerciseName?: string
  /** The replacement, on a swap. */
  newExerciseName?: string
  /**
   * How many times this same weekday has already been shortened this block,
   * and how many protein removals this week — counts the CALLER owns, because
   * they need history this pure module must not fetch. Absent means zero.
   */
  priorShorteningsThisBlock?: number
}

const weekOf = (meso: MesocycleWeek[], n: number) => meso.find(w => w.week_number === n)
const dayOf = (week: MesocycleWeek | undefined, name: string): WorkoutDay | undefined =>
  week?.days.find(d => d.day === name)

const isMainLift = (week: MesocycleWeek | undefined, dayName: string, exerciseName: string): boolean => {
  const ex = dayOf(week, dayName)?.exercises.find(e => e.name.toLowerCase() === exerciseName.toLowerCase())
  return ex?.tier === 'tier_1_primary'
}

/** True when the named exercise is loaded by a barbell — the thing a machine cannot carry over to. */
const isBarbell = (name: string | undefined): boolean => {
  if (!name) return false
  const entry = entryFor(name)
  return !!entry?.equipment.some(e => e.toLowerCase().includes('barbell'))
}

/** True when the named exercise is a fixed-path machine — no stabilising, so the carry-over argument applies. */
const isMachine = (name: string | undefined): boolean => {
  if (!name) return false
  const entry = entryFor(name)
  return !!entry?.equipment.some(e => /machine|cable|smith/i.test(e))
}

// ---------------------------------------------------------------------------
// THE ANSWER
// ---------------------------------------------------------------------------

const free = (reason: string): Tradeoff => ({ tier: 0, cost: null, alternatives: [], question: null, reason })

/**
 * What this change costs, and how firm to be about it.
 *
 * Called with a TRIAL — the same edit confirm will make, already run. It reads
 * and never writes, and the caller throws the trial away.
 */
export function assessEdit(ctx: EditContext): Tradeoff {
  const { profile, before, after, weekNumber, dayName, kind, scope, exerciseName, newExerciseName } = ctx
  const goal = (profile.fitness_goal ?? 'hypertrophy') as FitnessGoal

  // NOTHING IS EVER CHARGED TO SOMEONE STARTING OUT. First, before any other
  // rule, so no later branch can sneak a cost line onto their card.
  if (isStartingOut(profile)) return free('starting out — consistency beats every other consideration')

  const beforeWeek = weekOf(before, weekNumber)
  const afterWeek = weekOf(after, weekNumber)

  // A DELOAD MADE LIGHTER IS THE PLAN WORKING. Never charged for, and checked
  // before the pinned list so the "added to a deload" case below cannot catch
  // a reduction by accident.
  if (beforeWeek?.is_deload && (kind === 'volume_lighter' || kind === 'shorten' || kind === 'remove')) {
    return free('making a deload lighter is the deload doing its job')
  }

  const volume = muscleVolumeChange(beforeWeek, afterWeek)
  const drop = scoreDrop(profile, before, after)

  // --- TIER 2: the seven pinned cases ------------------------------------
  //
  // Each returns its own question. The caller adds DO_IT_ANYWAY.

  // 1. A standing volume cut during the phase whose point is accumulating work.
  if (kind === 'volume_lighter' && scope === 'permanent' && isAccumulationPhase(beforeWeek)) {
    return {
      tier: 2,
      cost: `This block is the one that builds ${goal === 'fat_loss' ? 'the muscle you\'re protecting' : 'the work'} up, and an ongoing cut reaches its heaviest weeks too.`,
      alternatives: [
        { label: 'Just today', note: 'back to normal next week', prompt: 'make today lighter, just today' },
      ],
      question: `Happy to take it down — is this a today thing, or is every week too much at the moment?`,
      reason: 'ongoing volume cut during an accumulation phase',
    }
  }

  // 2 and 3. Losing a main lift in a strength phase — by removal, ban, or a
  // swap onto a machine. The lift IS the block.
  if (isStrengthPhase(beforeWeek) && exerciseName && isMainLift(beforeWeek, dayName, exerciseName)) {
    if (kind === 'remove' || kind === 'ban') {
      return {
        tier: 2,
        cost: `${exerciseName} is the lift this block is built around — the rest of ${dayName} is arranged to support it.`,
        alternatives: [
          { label: 'Swap it instead', note: 'keeps the slot and the progression', prompt: `swap ${exerciseName} for something similar` },
          { label: 'Just today', note: 'back next week', prompt: `drop ${exerciseName} today only` },
        ],
        question: `${exerciseName} is what this block is built around. What's going on with it — is it the exercise itself, or something else?`,
        reason: 'removing or banning a main lift during a strength phase',
      }
    }
    if (kind === 'swap' && scope === 'permanent' && isBarbell(exerciseName) && isMachine(newExerciseName)) {
      return {
        tier: 2,
        cost: `A machine builds the muscle but won't carry over to your ${exerciseName.toLowerCase()} the way a free-weight version does, and that carry-over is what this block is for.`,
        alternatives: [
          { label: 'Just today', note: 'the barbell version is back next week', prompt: `swap ${exerciseName} for ${newExerciseName} today only` },
        ],
        question: `I can do that. For the rest of the block, or just today? A machine won't carry over to your ${exerciseName.toLowerCase()} the way the free-weight version does.`,
        reason: 'barbell main lift swapped to a machine for the block, during a strength phase',
      }
    }
  }

  // 4. Adding work to a recovery week.
  if (beforeWeek?.is_deload && (kind === 'add' || kind === 'volume_heavier')) {
    return {
      tier: 2,
      cost: `This is your recovery week — it's deliberately lighter so the next block starts fresh.`,
      alternatives: [
        { label: 'Next week instead', note: 'when the load comes back up', prompt: 'add it next week instead' },
      ],
      question: `That's your deload week — it's light on purpose so you come back stronger. Still want it in, or shall I put it in next week?`,
      reason: 'adding work to a deload week',
    }
  }

  // 5. The third time the same weekday has been shortened this block. Not a
  // one-off any more; it is a session-length setting that is wrong.
  if (kind === 'shorten' && (ctx.priorShorteningsThisBlock ?? 0) >= 2) {
    return {
      tier: 2,
      cost: `That's the third ${dayName} you've had to cut short this block.`,
      alternatives: [
        { label: 'Just today', note: 'nothing else changes', prompt: `shorten ${dayName} today only` },
      ],
      question: `That's three ${dayName}s running. Shall I make ${dayName} a shorter session for good, so it fits without cutting?`,
      reason: 'third shortening of the same weekday in a block',
    }
  }

  // 6. A main lift moved behind the work it is supposed to come before,
  // during a strength phase.
  if (kind === 'reorder' && isStrengthPhase(beforeWeek) && exerciseName && isMainLift(beforeWeek, dayName, exerciseName)) {
    const afterDay = dayOf(afterWeek, dayName)
    const idx = afterDay?.exercises.findIndex(e => e.name.toLowerCase() === exerciseName.toLowerCase()) ?? -1
    const total = afterDay?.exercises.length ?? 0
    if (idx >= 0 && total > 1 && idx > total / 2) {
      return {
        tier: 2,
        cost: `You'll come to ${exerciseName} tired, and this block is built on that lift being fresh.`,
        alternatives: [
          { label: 'Leave the order', note: 'main lift stays first', prompt: `leave ${dayName} in its current order` },
        ],
        question: `I can move it — you'll be hitting ${exerciseName} tired, so don't chase your usual numbers. Still want it later in the session?`,
        reason: 'main lift moved into the back half of a strength-phase session',
      }
    }
  }

  // 7. A big, lasting loss of work for one muscle. The scorer cannot see this
  // — it has no per-muscle rule — which is exactly why it is pinned.
  if (volume && volume.direction === 'down' && volume.fraction >= 0.4 && scope === 'permanent') {
    const g = GROUP_LABEL[volume.group]
    return {
      tier: 2,
      cost: `That takes your ${g} from ${volume.before} sets a week to ${volume.after}, for the rest of the block — ${whyVolumeMatters(goal, volume.group)}.`,
      alternatives: [
        { label: 'Just today', note: 'next week is unchanged', prompt: `${kind === 'remove' ? 'drop' : 'change'} it for today only` },
        { label: 'Put something else there', note: `keeps the ${g} work`, prompt: `replace it with something else for ${g}` },
      ],
      question: `That would take your ${g} from ${volume.before} sets a week down to ${volume.after} for the rest of the block. Just today, or is there something about it you want gone for good?`,
      reason: `lasting ${Math.round(volume.fraction * 100)}% drop in weekly ${volume.group} sets`,
    }
  }

  // --- TIER 1: it costs something, and the card says so -------------------

  if (volume && volume.direction === 'down') {
    const g = GROUP_LABEL[volume.group]
    return {
      tier: 1,
      cost: `Your ${g} goes from ${volume.before} sets this week to ${volume.after} — ${whyVolumeMatters(goal, volume.group)}.`,
      alternatives: scope === 'permanent'
        ? [{ label: 'Just today', note: 'next week is unchanged', prompt: 'do it for today only' }]
        : [],
      question: null,
      reason: `${Math.round(volume.fraction * 100)}% drop in weekly ${volume.group} sets`,
    }
  }

  if (volume && volume.direction === 'up' && volume.fraction >= 0.4) {
    const g = GROUP_LABEL[volume.group]
    return {
      tier: 1,
      // UP is a cost too, and saying so is the honest half of "add it and say
      // the session is longer". More is not free; it is recovery you spend.
      cost: `Your ${g} goes from ${volume.before} sets this week to ${volume.after} — past the point where more does more, for most people.`,
      alternatives: [
        { label: 'Swap one out instead', note: `keeps the ${g} work where it was`, prompt: `swap something out for it instead of adding` },
      ],
      question: null,
      reason: `${Math.round(volume.fraction * 100)}% rise in weekly ${volume.group} sets`,
    }
  }

  if (drop) {
    return {
      tier: 1,
      cost: `Worth knowing: ${DIMENSION_IN_WORDS[drop.dimension]}.`,
      alternatives: scope === 'permanent'
        ? [{ label: 'Just today', note: 'next week is unchanged', prompt: 'do it for today only' }]
        : [],
      question: null,
      reason: `score drop on ${drop.dimension} (${drop.lost.toFixed(1)})`,
    }
  }

  return free(`no material change to weekly volume or plan quality (${GOAL_NOUN[goal]})`)
}

// ---------------------------------------------------------------------------
// PUTTING IT ON A CARD, AND ASKING BEFORE ONE EXISTS
//
// STRUCTURALLY TYPED ON PURPOSE. The real diff type lives in
// pending-actions-store.ts, which imports supabase.ts, which reads
// import.meta.env at module-evaluation time — so importing it here would make
// this module unloadable in a plain-node gate, and this module's whole value
// is that a gate can run it. The shape below is the part of ProposalDiff these
// functions touch; TypeScript checks the real one against it at the call site.
// ---------------------------------------------------------------------------

export interface TradeoffCardFields {
  implications?: { severity: 'info' | 'warn'; text: string }[]
  alternatives?: TradeoffAlternative[]
}

/**
 * The tier-1 sentence, on the card, in the same amber the balance cost uses.
 *
 * APPENDED, NEVER REPLACING. The card's existing implications are what the
 * app DID — the balancing it ran, the load it will recompute. This is what it
 * COST. Both are true and a person needs both, so the cost joins the list
 * rather than standing in for it.
 */
export function applyTradeoff<T extends TradeoffCardFields>(diff: T, t: Tradeoff): T {
  if (t.tier === 0 || !t.cost) return diff
  return {
    ...diff,
    implications: [...(diff.implications ?? []), { severity: 'warn' as const, text: t.cost }],
    // The existing alternatives win their places: a meal removal's verified
    // swaps are specific to the food that left, and this must not push them
    // off the card.
    alternatives: [...(diff.alternatives ?? []), ...t.alternatives],
  }
}

/**
 * The tier-2 question, as a chat turn — with the chips the existing
 * `[QUICK_REPLIES: ...]` pipeline already extracts.
 *
 * NO NEW PLUMBING, and that is deliberate: the coach has rendered chips from
 * this tag since the equipment question, so a tier-2 ask arrives through the
 * path that is already proven rather than a second one written for it.
 *
 * DO_IT_ANYWAY IS ALWAYS LAST AND ALWAYS PRESENT. It is the whole of the
 * decision — the change is one tap further away, never blocked — so it is
 * added here rather than left to each call site to remember.
 */
export function askText(t: Tradeoff): string {
  if (t.tier !== 2 || !t.question) return ''
  const chips = [...t.alternatives.map(a => a.label), DO_IT_ANYWAY]
    .slice(0, 4)
    .map(c => `"${c}"`)
    .join(' | ')
  return `${t.question}\n[QUICK_REPLIES: ${chips}]`
}

/** Identifies the thing being asked about, so the ask happens once per block per thing. */
export function askKey(ctx: Pick<EditContext, 'kind' | 'dayName' | 'exerciseName'>, blockNumber: number): string {
  return `${blockNumber}:${ctx.kind}:${(ctx.exerciseName ?? ctx.dayName).toLowerCase()}`
}

export interface AskGuards {
  /** Keys already asked about this block. */
  alreadyAsked: ReadonlySet<string>
  /** True while a session is actually running — no coaching questions between sets. */
  sessionRunning: boolean
}

/**
 * Whether to ASK, or to fall through to a normal card.
 *
 * The three guards that stop "ask first" becoming nagging, all from the
 * recorded decision. Separated from `assessEdit` because they need state a
 * pure assessment must not carry: what has been asked, and whether someone is
 * mid-set right now.
 *
 * TAKES THE KEY, NOT THE CONTEXT. The first version took an EditContext and
 * recomputed `askKey` from it — so a caller that already had the key had to
 * either pass the whole context a second time or fake one, and I wrote exactly
 * that fake at the first call site. A function that is awkward to call
 * correctly gets called incorrectly.
 */
export function shouldAsk(t: Tradeoff, key: string, scope: EditContext['scope'], guards: AskGuards): boolean {
  if (t.tier !== 2 || !t.question) return false
  // NEVER BETWEEN SETS. A today-scoped change made during a live session is a
  // person standing in a gym solving a problem now.
  if (guards.sessionRunning && scope === 'today') return false
  // ONCE PER BLOCK, PER THING. The second time, they get a plain card: say it
  // once, then trust them.
  return !guards.alreadyAsked.has(key)
}

/**
 * A tier-2 that is NOT being asked (guarded out above) must not go silent —
 * it still cost something. This is what the card carries instead.
 */
export function downgradeToCard(t: Tradeoff): Tradeoff {
  return t.tier === 2 ? { ...t, tier: 1, question: null, reason: `${t.reason} (asked already, or mid-session)` } : t
}
