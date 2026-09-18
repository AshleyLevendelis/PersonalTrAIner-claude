import type { MesocycleWeek, Exercise, UserProfile } from './types'
import { getSmartReplacements, type ExerciseEntry, getExerciseEntry} from './exercise-db'
import { getConstrainedPool, getFlaggedJoints, mapMovementPattern, mapTier, deriveFatigueCost, fixedUnitPrescription, bestEquipmentRank, isEquipmentQualityExempt, EQUIPMENT_QUALITY_TIERS } from './exercise-plan'
import { prescribeLoad, type LoadPrescription, isExternallyLoaded} from './load-prescription'
// Dynamically imported inside recomputeLoad(), not statically here — importing
// progression-engine.ts pulls in supabase.ts, which reads import.meta.env at
// module-evaluation time. That's fine in the real (Vite) app, but it means
// any plain-Node/tsx script touching this module (audits, verification
// scripts with no Supabase env) would crash on import alone, even when the
// history lookup is never actually reached (e.g. no profile.id).

// ---------------------------------------------------------------------------
// Rebuilt swap/ban (Part 7)
// ---------------------------------------------------------------------------
// The old implementation mutated `exercisePlan` while the UI renders from
// `mesocycle` — swap/ban had no visible effect at all in the normal case.
// Candidates came from the raw EXERCISE_DATABASE (no equipment/injury/skill
// filtering), and the substitute inherited the outgoing exercise's load
// wholesale instead of getting a fresh prescription. This module is the
// single source of truth for both operations, targeting `mesocycle`
// directly; App.tsx persists the returned array via
// saveMesocycleWeek/saveMesocycle (src/lib/mesocycle-persistence.ts).

export type SwapScope = 'today' | 'permanent'

/**
 * A ranked swap option. `offStyle` is true when the exercise survives every
 * constraint EXCEPT the trainee's training style — shown, below the ones that
 * match, per Ashley's 18 Sep 2026 ruling. It is a fact about the option, not a
 * sentence: the words belong to the screen and live in the phrasebook.
 */
export type ReplacementCandidate = { exercise: ExerciseEntry; note: string; offStyle: boolean }

/** Constraint-filtered, ranked candidates for swapping OUT `exerciseName` — the same pool equipment/injury/style/skill filtering that generation itself uses. */
/**
 * @param soft  Soft exercise likes/dislikes — a LEAN, not a ban. Liked
 *   movements float toward the top of the swap list, disliked ones sink; the
 *   set of candidates is identical either way. This is the only place they
 *   are allowed to act: VISION-ARCHITECTURE.md §1.2 scopes soft exercise
 *   preferences to `getReplacementCandidates` and explicitly leaves rotation
 *   unaffected, and the doc records why (threading a ranker into
 *   `rotateVariation` means changing two exported signatures, generateMesocycle's
 *   parameter list, and the audit's independent copies).
 *
 *   compileSoftExercisePreferences existed for this and had ZERO call sites —
 *   its own comment said "scoped to swap-candidate ranking only
 *   (mesocycle-edit.getReplacementCandidates)", describing a wiring that was
 *   never done. Optional so the callers with no memory to hand (the audit,
 *   plan-adaptations' internal sweeps) keep their existing behaviour exactly.
 */
export function getReplacementCandidates(
  exerciseName: string,
  profile: UserProfile,
  exclusions: string[],
  soft?: { liked: string[]; disliked: string[] },
): ReplacementCandidate[] {
  // TWO POOLS, AND THE STRICT ONE IS WHAT "MATCHES YOUR STYLE" MEANS.
  //
  // Ashley, 18 Sep 2026, standing next to a leg-curl machine on a functional
  // plan: the shortlist was two sliders and a band, because all three machine
  // leg curls are tagged bodybuilding and nothing functional. Measured that
  // day — 31 of the catalogue's 45 machine and cable entries carry no
  // functional tag — so this was never one movement being mislabelled.
  //
  // Her ruling, from three options: SHOW THEM, LOWER DOWN. Options matching
  // her style stay at the top, the rest sit below with a line saying so, and
  // nothing about anyone's PLAN changes. She rejected retagging the machines
  // (which would start prescribing them to every functional trainee) and
  // leaving it (which left the search box as the only route to a machine).
  //
  // MEMBERSHIP OF THE STRICT POOL IS THE TEST, rather than reading
  // `style_tags` here. `stageStyleFilter` is not a tag lookup — it exempts
  // rehab movements for a flagged joint and holds a per-pattern floor — so a
  // local re-implementation would disagree with it exactly the way
  // `getExerciseCompatibilityWarnings`'s hand-rolled equipment test once did.
  const pool = getConstrainedPool(profile, exclusions)
  const wide = getConstrainedPool(profile, exclusions, { skipStyle: true })
  const onStyle = new Set(pool.map(e => e.name))
  // The flagged joints ride along for the NOTE only — getConstrainedPool has
  // already done every bit of filtering. Without them a cross-training
  // suggestion ("a squat, instead of your bench press") arrives unexplained.
  const restingJoints = [...getFlaggedJoints(profile.injuries ?? [])]
  const ranked = getSmartReplacements(exerciseName, wide, profile.training_experience || 'novice', exclusions, restingJoints)

  // IMPROVISED KIT SINKS, IT DOES NOT VANISH. getSmartReplacements ranks on
  // tier, joint stress and muscle overlap and has no equipment term at all, so
  // on 8 Sep 2026 all five lateral raises tied exactly and the order fell out
  // of catalogue position. Reordering here rather than in exercise-db keeps
  // the equipment-quality table in one module and avoids an import cycle.
  //
  // A stable partition, like the soft preferences below and for the same
  // reason: someone whose gym is busy may genuinely want the backpack
  // version, so it stays on the list — just not above the dumbbell one.
  // Scoped to peers IN THIS LIST, so the only option never gets demoted below
  // nothing.
  const equipment = profile.equipment_access
  const demoted = new Set<string>()
  if (equipment && EQUIPMENT_QUALITY_TIERS.has(equipment)) {
    for (const c of ranked) {
      const e = c.exercise
      if (isEquipmentQualityExempt(e) || bestEquipmentRank(e) !== 'low') continue
      if (ranked.some(o =>
        o.exercise.movement_pattern === e.movement_pattern &&
        o.exercise.mechanics_tier === e.mechanics_tier &&
        bestEquipmentRank(o.exercise) === 'high')) {
        demoted.add(e.name)
      }
    }
  }
  const equipmentSorted = demoted.size === 0
    ? ranked
    : ranked
        .map((c, i) => ({ c, i, d: demoted.has(c.exercise.name) ? 1 : 0 }))
        .sort((a, b) => a.d - b.d || a.i - b.i)
        .map(x => x.c)

  // A LOADED LIFT IS NOT REPLACED BY AN UNLOADED ONE, BY DEFAULT.
  //
  // Ashley, 10 Sep 2026, standing in a full gym: swapping her leg curl offered
  // two bodyweight sliders and a resistance band ABOVE the two leg-curl
  // machines, which sat fourth and fifth. She had to scroll past three options
  // that carry no weight at all to reach one that does — and the swap she took
  // came back with no prescribed weight, because there was none to prescribe.
  // getSmartReplacements ranks on tier, joint stress and muscle overlap and has
  // no notion of whether a thing can be loaded.
  //
  // Only applies when the OUTGOING exercise is itself externally loaded:
  // replacing a plank with a slider is not a downgrade. A stable partition
  // like the two around it, never a filter — a busy machine is exactly when
  // someone wants the slider, just not offered ahead of the machine.
  const outgoing = getExerciseEntry(exerciseName)
  const outgoingIsLoaded = outgoing ? isExternallyLoaded(outgoing) : false

  // Stable partition, never a filter: a disliked movement stays offered — it
  // is a lean, and someone who asks for a swap may still want it. Order is
  // preserved within each band so the ranker underneath still decides.
  const bySoftPreference = (list: { exercise: ExerciseEntry; note: string }[]) => {
    if (!soft || (soft.liked.length === 0 && soft.disliked.length === 0)) return list
    const liked = new Set(soft.liked)
    const disliked = new Set(soft.disliked)
    const rank = (name: string) => (liked.has(name) ? 0 : disliked.has(name) ? 2 : 1)
    return list
      .map((c, i) => ({ c, i, r: rank(c.exercise.name) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map(x => x.c)
  }

  // Style sinks an option; it never removes one. Within each band the order
  // everything above produced is preserved exactly.
  const byStyle = (list: { exercise: ExerciseEntry; note: string }[]): ReplacementCandidate[] =>
    list
      .map((c, i) => ({ c, i, s: onStyle.has(c.exercise.name) ? 0 : 1 }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map(x => ({ ...x.c, offStyle: x.s === 1 }))

  // WEIGHT IS THE OUTERMOST KEY, AND THAT IS ASHLEY'S RULING OF 18 Sep 2026,
  // from three options, made to settle a collision between two of her own.
  //
  // Widening the list for style (above) handed her 10 Sep rule the very
  // problem it was written for: a slider that matched her style landed above
  // a machine that did not, so a loaded lift was again offered bodyweight
  // replacements first. Measured — 8 movements in the hybrid catalogue alone,
  // among them the lateral raise and the shrug.
  //
  // Her ruling: WEIGHT ALWAYS WINS. For a lift that carries a number, every
  // loaded alternative comes first whatever its style, each marked; the
  // unloaded ones follow. She rejected keeping style outermost (it re-creates
  // the 10 Sep report with a sentence of explanation attached) and a narrow
  // override that fired only where her style offered nothing loaded (two
  // different orderings depending on the catalogue is not a rule anyone can
  // hold in their head).
  //
  // So the sort keys, outermost first: loaded, then style, then stated likes,
  // then implement quality, then the ranker. Only the first is conditional —
  // replacing a plank with a slider is not a downgrade, so an unloaded
  // outgoing lift has no loaded band at all and style leads.
  const ordered = byStyle(bySoftPreference(equipmentSorted))
  if (!outgoingIsLoaded) return ordered
  return ordered
    .map((c, i) => ({ c, i, u: isExternallyLoaded(c.exercise) ? 0 : 1 }))
    .sort((a, b) => a.u - b.u || a.i - b.i)
    .map(x => x.c)
}

function parseRepsHigh(reps: string): number | null {
  const range = reps.match(/(\d+)\s*-\s*(\d+)/)
  if (range) return parseInt(range[2], 10)
  const single = reps.match(/^(\d+)/)
  return single ? parseInt(single[1], 10) : null
}

/**
 * Fresh load for a swapped-in exercise — never a carry-over of the outgoing
 * exercise's kg/intensity/per-set fields.
 *
 * - Main-lift resets (a new main lift, first week it's touched) get a
 *   conservative first-prescription (isFirstBlock, no logged-history lookup)
 *   with an explicit "new lift" note — the whole point of resetting a main
 *   lift's baseline is to stop trusting a number that belonged to a
 *   different movement.
 * - Everything else prefers logged history on the new exercise itself
 *   (rare immediately after a swap, but real once the trainee has logged a
 *   session on it — e.g. after a previous swap of the same slot) via
 *   getDoubleProgressionRecommendation, falling back to the normal
 *   bodyweight/known-weight estimate when no history exists.
 */
export async function recomputeLoad(
  entry: ExerciseEntry,
  profile: UserProfile,
  intensity: string,
  sets: number,
  reps: string,
  isMainLiftReset: boolean,
): Promise<LoadPrescription> {
  if (isMainLiftReset) {
    const load = prescribeLoad(entry, profile, {
      targetRpeLabel: intensity, isFirstBlock: true, sets, repRangeLabel: reps,
    })
    return { ...load, basis: `New lift — find your working weight this session, then let it ramp from here. ${load.basis}` }
  }

  const repHigh = parseRepsHigh(reps)
  let recommendation = null as Awaited<ReturnType<typeof import('./progression-engine').getDoubleProgressionRecommendation>>
  if (profile.id && repHigh != null) {
    const { getDoubleProgressionRecommendation } = await import('./progression-engine')
    recommendation = await getDoubleProgressionRecommendation(profile.id, entry.name, new Date().toISOString().split('T')[0], repHigh)
  }

  return prescribeLoad(entry, profile, {
    targetRpeLabel: intensity,
    isFirstBlock: false,
    sets,
    repRangeLabel: reps,
    forceStartingWeightKg: recommendation?.weightKg,
  })
}

/**
 * Rebuilds an Exercise slot around a NEW movement — every load/tier/pattern
 * field recomputed, programming (sets/reps/rest) carried over from the slot
 * being replaced.
 *
 * A primer-tier replacement (getSmartReplacements/getReplacementCandidates
 * never exclude primers — a same-tier candidate scores highest, so a swap or
 * ban can land one here same as any other movement) must stay submaximal and
 * un-scaled, exactly like every generation-time construction site already
 * enforces via an isPrimer guard. Without this, `load` (still a real
 * prescribeLoad result computed by the caller for every replacement,
 * regardless of tier) got written straight through — a warm-up movement
 * ending up with a genuine working-weight number while `intensity` was left
 * however the OUTGOING (possibly non-primer) slot had it, e.g. a live report
 * of Kettlebell Swings prescribed 88kg under an "RPE"-less label. `intensity`
 * is the one field this function otherwise never touches (it's carried via
 * the `...slot` spread) — a primer needs it forced, since the outgoing slot
 * may not have been a primer at all.
 */
export function applyReplacement(slot: Exercise, entry: ExerciseEntry, load: LoadPrescription, sessionDurationPreference?: UserProfile['session_duration_preference']): Exercise {
  const isPrimer = entry.mechanics_tier === 'primer'

  // A slot's prescription UNITS belong to the exercise in it, not to whatever
  // was there before. Inheriting them is the same defect class as inheriting
  // a load: swapping Farmer's Walk (distance_load, '40m') for Dumbbell Rows
  // left "40m" on a rep-counted lift, and the reverse left "8-12" on a
  // measured carry. Only re-derived when the TYPE actually changes — a
  // reps->reps swap keeps the block's own rep prescription, which is correct
  // and is what the generator's own rotation path already does.
  const typeChanged = (entry.prescription_type ?? 'reps') !== (slot.prescription_type ?? 'reps')
  // Into a fixed-unit type (hold / carry / intervals): the canonical
  // prescription for that unit, shared with the generator so the two can't
  // drift. Into 'reps' (the one type whose range genuinely depends on
  // style/experience/goal, none of which this pure function has): keep the
  // slot's own range if it IS a rep count, and fall back to a conservative
  // middle range only when the inherited string is in the wrong units
  // entirely (e.g. '40m' left behind by a carry).
  const REPS_FALLBACK = { sets: slot.sets, reps: '8-12', rest: slot.rest }
  const looksLikeRepCount = /^\d+(\s*-\s*\d+)?$/.test(slot.reps)
  const fixedUnits = !typeChanged
    ? null
    : fixedUnitPrescription(entry, sessionDurationPreference) ?? (looksLikeRepCount ? null : REPS_FALLBACK)

  return {
    ...slot,
    id: entry.id,
    name: entry.name,
    substitution: '',
    superset_label: undefined,
    prescription_type: entry.prescription_type,
    ...(fixedUnits ? { sets: fixedUnits.sets, reps: fixedUnits.reps, rest: fixedUnits.rest } : {}),
    intensity: isPrimer ? 'Light — movement prep' : slot.intensity,
    suggested_load: isPrimer ? 'Light' : load.display,
    suggested_load_kg: isPrimer ? null : load.starting_weight_kg,
    per_set_load: isPrimer ? null : load.per_set,
    load_guidance: isPrimer ? 'Stay light and controlled. This is preparation, not a working set.' : load.basis,
    movement_pattern: mapMovementPattern(entry.movement_pattern),
    tier: mapTier(entry.mechanics_tier),
    fatigue_cost: deriveFatigueCost(entry),
    // A ramp block is a per-set kg ladder built for ONE specific lift (see
    // Exercise.ramp_up / warmup.ts). Carrying it across a replacement leaves
    // the OUTGOING exercise's warm-up weights sitting under the incoming
    // one's name — the same wrong-exercise-load leak this function's primer
    // guard was added for. Nothing here can rebuild it (that needs the
    // day-level warmup pass), so it is cleared rather than left wrong; the
    // next generation recomputes it.
    ramp_up: undefined,
    // Assistance is likewise exercise-specific (only an assisted machine has
    // it) and none of this function's callers recompute it. Clearing avoids
    // a stale "-20kg assist" chip surviving onto an unassisted movement.
    suggested_assistance_kg: undefined,
    assistance_ready_to_graduate: undefined,
    // Same reasoning as ramp_up above: `slot.selection_note` (if any)
    // explains why the OUTGOING exercise won its generation-time comparison
    // — nothing true about `entry`, the incoming replacement. A manual swap
    // is deliberately outside "why this exercise"'s scope (see
    // Exercise.selection_note's doc comment), so this must not survive.
    selection_note: undefined,
  }
}

// clearOrphanedSupersetLabels MOVED to settle-week.ts on 13 Sep 2026 and is
// re-exported here so its several importers did not all have to change. It had
// to move: the shared tail calls it, and this file now calls the shared tail,
// which would otherwise be an import cycle between the two.
export { clearOrphanedSupersetLabels } from './settle-week'
import { clearOrphanedSupersetLabels, settleWeek } from './settle-week'

export function isMainLiftSlot(ex: Exercise | undefined): boolean {
  return ex?.tier === 'tier_1_primary'
}

export interface SwapExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  currentWeekNumber: number
  dayName: string
  exIndex: number
  newExercise: ExerciseEntry
  scope: SwapScope
}

/**
 * 'today': patches this one (week, day, slot) only — every other week,
 * including this same day next week, is untouched, so the swap reverts on
 * its own and the original lift's progression baseline (tracked at
 * generation time, independent of this edit) just continues from wherever
 * it last logged.
 *
 * 'permanent': patches the same slot across every remaining week of the
 * CURRENT BLOCK (this week onward, same block_number) — future blocks
 * rotate normally from the original base plan, untouched. Each touched
 * week gets its own fresh, independently recomputed load rather than an
 * attempt to replay the block's baseline+increment ramp retroactively —
 * still real numbers, still never a carry-over from the outgoing exercise,
 * just not a perfect reconstruction of Part 1's ramp for an ad-hoc mid-block
 * edit.
 */
export async function swapExerciseInMesocycle(params: SwapExerciseParams): Promise<MesocycleWeek[]> {
  const { mesocycle, profile, currentWeekNumber, dayName, exIndex, newExercise, scope } = params
  const currentWeek = mesocycle.find(w => w.week_number === currentWeekNumber)
  const currentDay = currentWeek?.days.find(d => d.day === dayName)
  const oldSlot = currentDay?.exercises[exIndex]
  if (!currentWeek || !oldSlot) return mesocycle

  const isMainLift = isMainLiftSlot(oldSlot)
  const targetWeekNumbers = new Set(
    scope === 'today'
      ? [currentWeekNumber]
      : mesocycle
          .filter(w => w.block_number === currentWeek.block_number && w.week_number >= currentWeekNumber)
          .map(w => w.week_number)
  )

  return Promise.all(mesocycle.map(async week => {
    if (!targetWeekNumbers.has(week.week_number)) return week
    const day = week.days.find(d => d.day === dayName)
    const slot = day?.exercises[exIndex]
    if (!day || !slot) return week

    const load = await recomputeLoad(newExercise, profile, slot.intensity || '', slot.sets, slot.reps, isMainLift)
    const replaced = applyReplacement(slot, newExercise, load, profile.session_duration_preference)
    const exercises = clearOrphanedSupersetLabels(
      day.exercises.map((e, i) => (i === exIndex ? replaced : e))
    )
    const days = week.days.map(d => (d.day === dayName ? { ...d, exercises } : d))
    // THE SHARED TAIL, added 13 Sep 2026. A swap used to end here, re-running
    // none of the passes that keep a day sane — and applyReplacement above
    // CLEARS the incoming lift's ramp (see its comment), so the day shipped
    // with a warm-up still preparing for the exercise that just left. BACKLOG's
    // 11 Sep entry named this as the next job and it sat open until now.
    return settleWeek({ ...week, days }, dayName, profile).week
  }))
}

export interface BanExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  bannedName: string
  /** Must already include bannedName — used to keep the replacement pick from re-suggesting anything else the trainee has banned. */
  exclusions: string[]
}

/**
 * Removes `bannedName` everywhere it appears in the persisted mesocycle —
 * every week, every block, not just the current one, since a ban means
 * "never again," not "not for the rest of this block." Each occurrence gets
 * a live constraint-filtered replacement (same pool/ranking as a manual
 * swap, auto-picking the top candidate) with a fresh load. If no valid
 * substitute exists in the pool for that day, the slot is dropped rather
 * than keeping the banned exercise around.
 */
export async function banExerciseFromMesocycle(params: BanExerciseParams): Promise<MesocycleWeek[]> {
  const { mesocycle, profile, bannedName, exclusions } = params
  const lowerBanned = bannedName.toLowerCase()

  return Promise.all(mesocycle.map(async week => {
    // WHICH DAYS THIS WEEK ACTUALLY CHANGED. A ban can land on several days of
    // one week, and the shared tail settles one day at a time, so the names are
    // collected rather than assumed to be a single day.
    const touched: string[] = []
    const days = await Promise.all(week.days.map(async day => {
      const idx = day.exercises.findIndex(e => e.name.toLowerCase() === lowerBanned)
      if (idx === -1) return day
      touched.push(day.day)

      const oldSlot = day.exercises[idx]
      const alreadyUsedInDay = new Set(day.exercises.filter((_, i) => i !== idx).map(e => e.name))
      const candidates = getReplacementCandidates(bannedName, profile, exclusions)
        .filter(c => !alreadyUsedInDay.has(c.exercise.name))

      if (candidates.length === 0) {
        return { ...day, exercises: clearOrphanedSupersetLabels(day.exercises.filter((_, i) => i !== idx)) }
      }

      const replacement = candidates[0].exercise
      const load = await recomputeLoad(replacement, profile, oldSlot.intensity || '', oldSlot.sets, oldSlot.reps, isMainLiftSlot(oldSlot))
      const replaced = applyReplacement(oldSlot, replacement, load, profile.session_duration_preference)
      const exercises = clearOrphanedSupersetLabels(
        day.exercises.map((e, i) => (i === idx ? replaced : e))
      )
      return { ...day, exercises }
    }))
    // Same tail as the swap, and for the same reason: a ban is a swap that
    // happens everywhere. Dropping a slot outright (the no-candidate branch
    // above) makes the warm-up rebuild matter more, not less.
    let settled: MesocycleWeek = { ...week, days }
    for (const dayName of touched) settled = settleWeek(settled, dayName, profile).week
    return settled
  }))
}

/** True if the banned name is truly gone from every week — used by the audit and as a sanity check after a ban completes. */
export function containsExerciseName(mesocycle: MesocycleWeek[], name: string): boolean {
  const lower = name.toLowerCase()
  return mesocycle.some(w => w.days.some(d => d.exercises.some(e => e.name.toLowerCase() === lower)))
}
