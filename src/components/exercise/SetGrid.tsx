// ---------------------------------------------------------------------------
// Replaces ExercisePlan.tsx's inline SetLogger (LAYOUT-DESIGN.md §3.3/§7.1
// P2). Same row semantics and the same local-first save contract, but data
// now comes entirely from useActiveSession: existingLogs from
// hook.setsFor(exerciseId) (never a todayLogs prop filtered locally),
// ghosts from hook.ghosts/loadGhosts (the one fetcher app-wide — F1), saves
// through hook.logSet so the hook's `logs` stay the single source of truth
// instead of a parent-level onLogSaved splice.
//
// Row numbering uses session-derive's gap-preserving computeSetRowNumbers
// instead of a flat extraSets counter — "Remove this set" doesn't ship
// until P3's active mode, so extraSetNumbers only ever grows here, but the
// contract already matches what P3 needs.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Dumbbell, Plus, Trophy, Trash2 } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { prescriptionUnit } from '@/lib/set-log-store'
import { computeSetRowNumbers, nextExtraSetNumber, filterWarmupSets, filterDropSets, rowKey, setLabel, setLabelLong, type SetRef } from '@/lib/session-derive'
import { lastTime, loggedSetReading } from '@/lib/coach-voice'
import { checkForPR, getTopPRSet, toSessionSets, type PRResult } from '@/lib/pr-engine'
import { getExerciseEntry } from '@/lib/exercise-db'
import { isExternallyLoaded, loadingMode, roundToPlate, plateStepKg, takesPlateCalculator } from '@/lib/load-prescription'
import { checkLoggedSetWeight, MAX_LOGGABLE_SET_KG } from '@/lib/set-plausibility'
import type { UserProfile } from '@/lib/types'

// REPLACED 8 Sep 2026 by set-plausibility.ts's MAX_LOGGABLE_SET_KG. The old
// constant here was 9999.99 — the width of the database column, not a claim
// about lifting — so 500kg on a 24kg dumbbell passed it without comment.
const MAX_REPS = 999

/** Keeps the row a lifter is actively editing above the soft keyboard (LAYOUT-DESIGN.md §7.6) — scrollIntoView on focus, not on every keystroke. */
function scrollRowIntoView(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

interface SetInputState {
  weight: string
  reps: string
  isBodyweight: boolean
}

export interface SetGridProps {
  exerciseName: string
  /** Stable logging identity (C0) — plan-attached id, or the slug of a custom exercise's name. */
  exerciseId: string
  totalSets: number
  prescribedReps?: string
  /** Drives the logging column's label — a distance carry logs meters, a hold logs seconds, an interval logs work seconds, never a generic "Reps". */
  prescriptionType?: string
  restTime?: string
  /**
   * True when this grid is rendered inside a superset, which already owns a
   * rail of its own.
   *
   * A RAIL MEANS GROUPING AND NEVER MEANING (Ashley's handoff, 19 Sep 2026),
   * so the phase rails are DROPPED here rather than nested — two rails side by
   * side would both be claiming to say what belongs with what. The ramp is
   * still marked, by the violet row label and the violet save button, because
   * that is colour doing its own job: saying what a set counts as.
   */
  insideSuperset?: boolean
  tier?: string
  suggestedLoadKg?: number | null
  /**
   * The prescribed build-up, resolved to kg by the ONE place that does that
   * (`formatRampSets`) and passed down rather than re-derived here. It
   * re-derives per render off the CURRENT suggested_load_kg, which is exactly
   * why a warm-up row must never take a ghost from last week.
   */
  rampSets?: { setNumber: number; kg?: number; reps: number }[]
  /** 'kg' | 'bodyweight' | 'stale' — a stale ramp names an exercise this row is no longer for, so it prescribes nothing. */
  rampKind?: 'kg' | 'bodyweight' | 'stale'
  /**
   * The unit the weight column is in — "kg per hand" for a dumbbell pair,
   * "kg (single side)" for a one-sided lift, plain "kg" otherwise.
   *
   * Passed DOWN from the plan's own formatted string rather than re-derived
   * here from the exercise name. Three copies of the per-side rule is what
   * produced the original single-implement bug; this component already has
   * two numbers it must not disagree with (the prescription above it and the
   * value it stores), and a third derivation is where they would diverge.
   *
   * It matters more here than anywhere else on the screen: the column is not
   * just telling someone a number, it is asking them for one. An unlabelled
   * "14" invites a log of 28 from anyone who loaded two 14s and read the
   * prescription as a total — and the set logs carry no unit of their own to
   * catch it with.
   */
  loadUnitLabel?: string
  /** Per-set breakdown (ramping or straight) — indexed by set number - 1. Falls back to suggestedLoadKg for any set beyond this array. */
  perSetLoadKg?: (number | null)[]
  /** Flips the weight input's helper copy from "here's the default" to "log what you actually lifted." */
  loadIsEstimate?: boolean
  /**
   * Week one, nothing verified: the week is a SEARCH for the weight, and the
   * grid has to look like one. Set 1 keeps its pre-fill — the printed number
   * IS the instruction for the probe. Sets 2 and beyond have NO default: an
   * untouched box refuses instead of logging the guess, and once the
   * previous set is logged a row of chips (same / +5% / +10%) offers the next
   * weight off what was actually lifted. Ashley, 10 Sep 2026, after training
   * on the old version: the weights were too light, and a tick on an
   * untouched box had been quietly logging the guess as her working weight.
   */
  calibration?: boolean
  /**
   * Needed only to judge a typed weight against what this trainee can
   * actually load — see set-plausibility.ts.
   *
   * The PROFILE goes down rather than a pre-computed ceiling, which is the
   * opposite of loadUnitLabel's rule above, and deliberately: the two SetGrid
   * parents (the plan rows and Additional Work) would each have to derive the
   * ceiling, and two copies of that derivation is the exact shape this file's
   * other doc comment warns about. One copy lives in set-plausibility.ts and
   * both parents hand it the same input.
   *
   * Absent means the check falls back to its absolute bound alone. That is
   * the honest degradation: with no profile the app knows nothing about what
   * this person owns.
   */
  profile?: UserProfile | null
  onSetCompleted?: (exerciseName: string, setNumber: number, weight: number, reps: number, rest: string, sets: number, prescribedReps: string, tier?: string) => void
  onOpenPlateCalc?: (weight: number) => void
  // REMOVED 5 Sep 2026: onFirstEverLog. It was declared here, forwarded by
  // ExerciseRow, and fired on the right condition — and no parent anywhere in
  // the app ever passed one, so the "one-time celebration" its doc comment
  // described has never happened once. Deleting the chain rather than
  // inventing the celebration: what that moment should actually show a
  // trainee is a product decision, not a wiring gap to paper over.
}

export function SetGrid({
  exerciseName,
  exerciseId,
  totalSets,
  prescribedReps,
  prescriptionType,
  restTime,
  insideSuperset,
  tier,
  suggestedLoadKg,
  loadUnitLabel,
  perSetLoadKg,
  loadIsEstimate,
  rampSets,
  rampKind,
  calibration = false,
  profile,
  onSetCompleted,
  onOpenPlateCalc,
}: SetGridProps) {
  const {
    profileId, date: today, dayName, liveWeek, logs, setsFor, ghosts, loadGhosts, logSet, deleteSet, refresh,
    setDraft, saveSetDraft, clearSetDrafts, extraSetsFor, setExtraSets,
  } = useActiveSession()

  useEffect(() => {
    loadGhosts(exerciseId)
  }, [loadGhosts, exerciseId])

  // Cleanup round, defect 4: the BW toggle only makes sense on a movement
  // that's actually plausible bodyweight — a loaded barbell/dumbbell
  // compound with a prescribed working weight has nowhere for "bodyweight"
  // to mean anything. Keyed off !isExternallyLoaded (the same function
  // load-prescription.ts and warmup.ts use for this exact distinction),
  // NOT a raw `equipment.includes('bodyweight')` check — an apparatus-using
  // bodyweight movement like Pull-Ups (equipment: ['pull-up bar']) has no
  // literal 'bodyweight' tag but is still bodyweight-or-weighted in
  // practice, and hiding the toggle there would be wrong in the other
  // direction. Unresolved/custom exercises (off-plan chat logs) fall back
  // to showing the toggle — better an occasional unnecessary button than
  // hiding it for a movement we simply don't have catalog data for.
  const catalogEntry = getExerciseEntry(exerciseName)
  const isBodyweightCapable = catalogEntry ? !isExternallyLoaded(catalogEntry) : true
  const catalogEntryIsLoaded = catalogEntry ? isExternallyLoaded(catalogEntry) : false

  // THE CALIBRATION SEARCH ONLY APPLIES WHERE THERE IS A WEIGHT TO SEARCH
  // FOR. Every rule below — no default on sets 2+, a refused tick on an
  // empty box, the next-weight chips — exists because week one's number is a
  // guess that must be replaced by a real one. On a push-up there is no
  // guess and nothing to type, and asking for one turns a bodyweight set
  // into a box that cannot be ticked. Caught in the browser, 10 Sep 2026:
  // Scapular Push-Ups sitting above the bench press with "type it" in its
  // weight column. Same test the plan re-anchor uses for what counts as
  // evidence (calibration-anchor.ts), so the screen and the engine agree on
  // which lifts this week is about.
  const calibrationProbe = calibration && suggestedLoadKg != null && !!catalogEntry && isExternallyLoaded(catalogEntry)
  // On the four lifts you can hang weight from (accepts_added_load — pull-ups,
  // chin-ups, dips), the weight box means ADDED weight, not the weight of the
  // thing being lifted. Typing 15 here used to write weight_kg 15 with
  // is_bodyweight false — "this pull-up weighed 15kg" — a row indistinguishable
  // from an ordinary 15kg lift. Same field, different question, which is why
  // the value goes to its own column rather than being reinterpreted.
  const takesAddedLoad = catalogEntry?.accepts_added_load === true

  /**
   * WHAT A DROP DROPS TO — a quarter off the row above, snapped to what can
   * actually be loaded.
   *
   * 25% is the middle of the 20-30% a drop set conventionally takes off, and
   * it is a STARTING NUMBER in a box, never a prescription: nothing in the
   * plan asked for this set, so the app's job is to save typing, not to tell
   * anyone how heavy to go.
   *
   * FORCED AT LEAST ONE STEP BELOW THE BASE, which is the calibration
   * ladder's rule in the other direction and for the same measured reason: on
   * a 20kg dumbbell with a 2kg step, 25% rounds straight back to 20 and the
   * "drop" offers the weight just lifted. Never below one step, so it can
   * never offer 0 on a lift that needs a weight.
   */
  const dropWeightFrom = (baseKg: number): number => {
    const mode = catalogEntry ? loadingMode(catalogEntry) : 'stack'
    const step = plateStepKg(mode)
    const snapped = roundToPlate(baseKg * 0.75, mode)
    return Math.max(step, Math.min(snapped, baseKg - step))
  }
  /** The row a drop steps down FROM: the drop above it where there is one, the parent set otherwise. */
  const rowAboveDrop = (ref: SetRef) => ((ref.dropIndex ?? 0) > 1
    ? dropLogs.find(l => l.set_number === ref.setNumber && (l.drop_index ?? 0) === (ref.dropIndex ?? 0) - 1)
    : existingLogs.find(l => l.set_number === ref.setNumber))

  const existingLogs = setsFor(exerciseId, exerciseName)
  const ghostValues = ghosts(exerciseId)
  const loggedSetNumbers = existingLogs.map(l => l.set_number)

  // Audit §6.3 — extra rows and typed values both lived in component state
  // only, so a reload (or the browser discarding a backgrounded tab, which
  // is what a locked phone eventually becomes) threw them away mid-session.
  // They live in the session record now, alongside the rest timer and the
  // off-plan declarations, and are cleared per exercise as each set is
  // logged.
  const extraSetNumbers = extraSetsFor(exerciseId)

  // ---------------------------------------------------------------------
  // TWO BLOCKS, ONE GRID — Ashley's ruling, 17 Sep 2026: "a box for every
  // set, labelled". The build-up rows sit above the working rows in the same
  // column layout, so the weight column reads 20 / 47.5 / 66.5 / 95 / 95 / 95
  // straight down as one build. Two separate tables would read as two
  // exercises.
  //
  // A ROW IS A KIND AND A NUMBER. Warm-up 1 and working 1 are different rows
  // everywhere it matters (the database's unique constraint, the offline
  // queue's natural key, the session dedupe), so every piece of state below
  // is keyed on the PAIR. Keyed on the bare number — which is what this
  // component did until today — a value typed into warm-up 2 would appear in
  // working 2, and the armed delete on one would fire on the other.
  // ---------------------------------------------------------------------
  const warmupLogs = filterWarmupSets(logs, exerciseId, exerciseName)
  const loggedWarmupNumbers = warmupLogs.map(l => l.set_number)
  const prescribedWarmupNumbers = (rampSets ?? []).map(r => r.setNumber)
  const extraWarmupNumbers = extraSetsFor(`${exerciseId}#warmup`)
  const warmupRowNumbers = Array.from(new Set([...prescribedWarmupNumbers, ...loggedWarmupNumbers, ...extraWarmupNumbers])).sort((a, b) => a - b)
  const workingRowNumbers = computeSetRowNumbers(totalSets, loggedSetNumbers, extraSetNumbers)

  // -------------------------------------------------------------------
  // DROPS — a continuation of the set above, not a set of its own.
  //
  // MEASURED BEFORE BUILDING, and it changes what this is: NOTHING IN THE
  // PLAN PRESCRIBES A DROP. `Exercise` has no field for one and the
  // generator emits none, so the handoff's "pre-drawn when prescribed"
  // branch has nothing to draw from — every drop row on this screen is one
  // the lifter asked for. Adding a prescription field is a data-model
  // change beyond what was scoped, so it is named rather than assumed.
  //
  // A drawn-but-unlogged drop lives in the SAME durable extras record the
  // warm-up rows use, namespaced per parent set — no new persistence
  // concept, and a reload between sets still finds the row on screen.
  // -------------------------------------------------------------------
  const dropLogs = filterDropSets(logs, exerciseId, exerciseName)
  const dropExtrasKey = (setNumber: number) => `${exerciseId}#drop${setNumber}`
  const dropIndicesFor = (setNumber: number): number[] => Array.from(new Set([
    ...dropLogs.filter(l => l.set_number === setNumber).map(l => l.drop_index ?? 0),
    ...extraSetsFor(dropExtrasKey(setNumber)),
  ])).sort((a, b) => a - b)

  const rowRefs: SetRef[] = [
    ...warmupRowNumbers.map(n => ({ kind: 'warmup' as const, setNumber: n })),
    // INTERLEAVED, NOT GROUPED AT THE END. The card has to read 3, 3·1, 3·2,
    // 4 — the order the work was done in. A drops block underneath would be
    // a second table again, the thing the two-groups layout exists to avoid.
    ...workingRowNumbers.flatMap(n => [
      { kind: 'working' as const, setNumber: n },
      ...dropIndicesFor(n).map(d => ({ kind: 'working' as const, setNumber: n, dropIndex: d })),
    ]),
  ]
  const isWarm = (ref: SetRef) => ref.kind === 'warmup'
  const isDrop = (ref: SetRef) => (ref.dropIndex ?? 0) > 0
  /** The last logged working set, and the last ROW belonging to it — where the one "add a drop" link sits. */
  const lastLoggedSetNumber = loggedSetNumbers.length ? Math.max(...loggedSetNumbers) : null
  const lastRowIndexOfLastLoggedSet = lastLoggedSetNumber == null
    ? -1
    : rowRefs.reduce((last, r, i) => (r.kind === 'working' && r.setNumber === lastLoggedSetNumber ? i : last), -1)
  // "+ Add warm-up" wherever a build-up makes sense — any externally loaded
  // lift, not only the ones the generator chose to ramp. `needsRampUp` skips
  // tier-2 lifts under 60kg, and those are exactly the rows Ashley filled with
  // her 14/18/20kg build-up on the dumbbell rows. Offering it only where a
  // ramp was prescribed would fix the deadlift and leave the thing she
  // actually reported.
  const showWarmupControls = catalogEntryIsLoaded
  /** The exercise id a row's DRAFT is filed under. Namespaced for warm-ups so logging working set 1 cannot sweep away a typed-but-unsaved warm-up 3 (clearSetDrafts matches on the id prefix). */
  const draftIdFor = (ref: SetRef) => (
    isWarm(ref) ? `${exerciseId}#warmup` : isDrop(ref) ? `${exerciseId}#drop${ref.dropIndex}` : exerciseId
  )
  /**
   * The stored row this ref names, or undefined.
   *
   * ONE RESOLVER FOR ALL THREE KINDS, replacing a pair of helpers that handed
   * back a LIST for the caller to search by set number. That shape cannot
   * express a drop — 3 and 3·1 share a set number — and the two call sites
   * would each have had to remember the second coordinate.
   */
  const loggedRowFor = (ref: SetRef) => (
    isWarm(ref)
      ? warmupLogs.find(l => l.set_number === ref.setNumber)
      : isDrop(ref)
        ? dropLogs.find(l => l.set_number === ref.setNumber && (l.drop_index ?? 0) === ref.dropIndex)
        : existingLogs.find(l => l.set_number === ref.setNumber)
  )

  const [inputs, setInputs] = useState<Record<string, SetInputState>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  /**
   * A weight past what the app believes this trainee can load, said out loud
   * on the row. Separate state from rowErrors because it is a different
   * sentence with a different consequence: an error means the set was NOT
   * logged, a warning means it will be if they mean it. Rendering both in the
   * same destructive red would make "we refused this" and "are you sure?"
   * look identical.
   */
  const [rowWarnings, setRowWarnings] = useState<Record<string, string>>({})
  /**
   * The row whose warning has been read and whose next tap logs anyway —
   * Ashley's ruling, 8 Sep 2026: "warn, second tap logs it."
   *
   * NO TIMEOUT, unlike the armed delete below, and the difference is what the
   * second tap costs. An armed delete left lying around destroys a real row,
   * so it disarms itself after three seconds. An armed "log it anyway" only
   * stores the number they already typed — and the warning sentence on screen
   * says in as many words that tapping again will do that. A timer would make
   * the visible instruction quietly untrue while it was still on screen.
   * Disarmed by editing the weight instead: a new number is a new decision.
   */
  const [confirmWeightSet, setConfirmWeightSet] = useState<string | null>(null)
  const [prBadgeSet, setPrBadgeSet] = useState<{ rowKey: string; result: PRResult } | null>(null)
  const [animatingPr, setAnimatingPr] = useState(false)
  /** Armed-then-confirm delete, tap-tap within 3s — no window.confirm (themed-app clash, PWA-suppressible per the UX sweep's Clear-chat finding), but a saved set is still a real row to lose, so a bare single tap doesn't do it. */
  const [confirmDeleteSet, setConfirmDeleteSet] = useState<string | null>(null)

  const inputFor = (ref: SetRef): SetInputState => {
    const k = rowKey(ref)
    if (inputs[k]) return inputs[k]
    const existing = loggedRowFor(ref)
    if (existing) {
      return { weight: String(existing.weight_kg), reps: String(existing.reps_completed), isBodyweight: existing.is_bodyweight }
    }
    // A value typed before a reload — the record outlives this component.
    // Checked AFTER a real logged set, which is always the truth if one
    // exists, and before the empty default.
    const draft = setDraft(draftIdFor(ref), ref.setNumber)
    if (draft) return draft
    return { weight: '', reps: '', isBodyweight: false }
  }

  /**
   * Last week's numbers, for a one-tap repeat. WORKING ROWS ONLY, and the
   * exclusion is load-bearing: `loadGhosts` fills from getLastSessionSets,
   * which filters warm-ups out, so a warm-up box offered a ghost would be
   * offered last week's WORKING weight — a blank tap on warm-up 1 would log
   * 95kg as a build-up. A build-up's number comes from the prescription and
   * nowhere else.
   */
  // AND NOT ON A DROP EITHER, for a second reason on top of the one above: a
  // ghost is keyed on the set NUMBER alone, so every drop of set 3 would be
  // offered set 3's weight from last week — the full working load, which is
  // the one number a drop is definitely not.
  const ghostFor = (ref: SetRef) => (isWarm(ref) || isDrop(ref) ? undefined : ghostValues.find(g => g.set_number === ref.setNumber))
  const updateInput = (ref: SetRef, field: 'weight' | 'reps', value: string) => {
    const setNumber = ref.setNumber
    const k = rowKey(ref)
    const next = { ...inputFor(ref), [field]: value }
    setInputs(prev => ({ ...prev, [k]: next }))
    saveSetDraft(draftIdFor(ref), setNumber, next)
    if (rowErrors[k]) setRowErrors(prev => { const n = { ...prev }; delete n[k]; return n })
    if (field === 'weight') {
      if (rowWarnings[k]) setRowWarnings(prev => { const n = { ...prev }; delete n[k]; return n })
      if (confirmWeightSet === k) setConfirmWeightSet(null)
    }
  }

  const toggleBodyweight = (ref: SetRef) => {
    const k = rowKey(ref)
    const current = inputFor(ref)
    const next = { ...current, isBodyweight: !current.isBodyweight, weight: '' }
    setInputs(prev => ({ ...prev, [k]: next }))
    saveSetDraft(draftIdFor(ref), ref.setNumber, next)
    // The weight this was warning about is gone, so the warning must go with
    // it — same rule as editing the number.
    if (rowWarnings[k]) setRowWarnings(prev => { const n = { ...prev }; delete n[k]; return n })
    if (confirmWeightSet === k) setConfirmWeightSet(null)
  }

  const defaultWeightFor = (ref: SetRef): string => {
    const setNumber = ref.setNumber
    // A BUILD-UP ROW'S NUMBER COMES FROM THE PRESCRIPTION AND NOWHERE ELSE.
    // Not from the working weight, not from a ghost — the app told her to
    // pull 47.5, so leaving the box blank must log 47.5. A ramp that no longer
    // names this exercise ('stale') prescribes nothing and asks her to type it
    // rather than inventing a number.
    if (isWarm(ref)) {
      if (rampKind === 'bodyweight') return '0'
      const step = (rampSets ?? []).find(r => r.setNumber === setNumber)
      return step?.kg != null ? String(step.kg) : ''
    }
    // A DROP'S NUMBER COMES FROM WHAT WAS JUST LIFTED, not from the
    // prescription — the prescription describes the working set, and a drop
    // is the thing that happens after it. Blank until the row above is
    // actually logged: there is no honest number to offer before then, and a
    // blank box refuses the tick rather than inventing one.
    if (isDrop(ref)) {
      const above = rowAboveDrop(ref)
      if (!above || above.is_bodyweight || !(Number(above.weight_kg) > 0)) return ''
      return String(dropWeightFrom(Number(above.weight_kg)))
    }
    // CALIBRATION, SETS 2+: NO DEFAULT. This is the one deliberate exception
    // to "a blank box logs the prescribed number". In week one the prescribed
    // number is a guess by construction (half the estimate), and the whole
    // week exists to replace it — so a default here is the guess writing
    // itself into the ledger three times. Set 1 keeps its default: the probe
    // IS the number, and one tap is right when the guess is right.
    if (calibrationProbe && setNumber > 1) return ''
    const perSet = perSetLoadKg?.[setNumber - 1]
    if (perSet != null) return String(perSet)
    if (suggestedLoadKg != null) return String(suggestedLoadKg)
    // NEVER INVENT 0 FOR A MOVEMENT THAT NEEDS A WEIGHT. Ashley, 18 Sep 2026:
    // her kettlebell swings offered a faint 0, and a blank tap would have
    // logged 0kg against a bell she had actually loaded to 24. A default is a
    // prescription, and `load-prescription.ts:12` forbids the app inventing
    // one. Zero stays where it is the honest record — a movement carrying no
    // external load, where 0kg x 12 is exactly what happened.
    return catalogEntryIsLoaded ? '' : '0'
  }
  /** What the empty box SHOWS — the default where one exists, a prompt where it does not. */
  const weightPlaceholderFor = (ref: SetRef): string => {
    const d = defaultWeightFor(ref)
    return d === '' ? 'type it' : d
  }

  /**
   * What a blank reps box logs — the BOTTOM of the prescribed range.
   *
   * The weight column has had a prescribed fallback for a while; reps did
   * not, and the asymmetry only ever bit on the ONE session where it is
   * guaranteed to bite. Ghost values come from last week, so week 1 has
   * none — and the app tour, which runs immediately after onboarding and
   * therefore only ever on week 1, says in as many words: "Leave the fields
   * blank and I'll take the prescribed numbers." Tapping the ✓ exactly as
   * instructed answered "Enter reps to log this set", and the reps box was
   * suggesting "0" — the single value handleSaveSet refuses. Found by
   * driving the real tour against the real screens (verify:tour-real).
   *
   * BOTTOM of the range, not the top, on Ashley's ruling: the app must never
   * record more work than someone actually did. The number feeds the
   * progression engine, so erring high would hand them heavier weights next
   * week off the back of a set it invented.
   *
   * First integer, which is the bottom for every shape the generator emits —
   * "9-11" -> 9, "8" -> 8, "33-48s" -> 33, "40m" -> 40 (time and distance
   * prescriptions log in their own unit through this same column).
   *
   * Empty when there is no number to take. That is deliberate: the
   * "reps <= 0 never logs a completed set" guard below still has to fire for
   * a prescription that genuinely carries no target, which is the gap it was
   * written to close.
   */
  const defaultRepsFor = (ref: SetRef): string => {
    // The build-up's own prescribed reps (10 at the empty bar, 2 at 85%), not
    // the working range — a warm-up defaulting to the working reps would log
    // eight reps at 85% as a warm-up and read as a session she never did.
    if (isWarm(ref)) {
      const step = (rampSets ?? []).find(r => r.setNumber === ref.setNumber)
      return step ? String(step.reps) : ''
    }
    // BLANK ON A DROP, and deliberately so. The working range describes the
    // working set; a drop is taken to whatever came out, so defaulting to the
    // bottom of that range would record reps nobody did — the exact harm the
    // rule above this one exists to prevent, from the other side. With no
    // fallback the save refuses until a real number is typed.
    if (isDrop(ref)) return ''
    return /\d+/.exec(prescribedReps ?? '')?.[0] ?? ''
  }

  const handleSaveSet = (ref: SetRef) => {
    if (!profileId) return
    const setNumber = ref.setNumber
    const k = rowKey(ref)
    const warm = isWarm(ref)
    // A DROP IS WORKING VOLUME AND NOTHING ELSE — Ashley's ruling, 19 Sep
    // 2026, and the CSCS reading recorded with it. It counts toward the work
    // done; it is not a personal best (performed already fatigued, with no
    // rest, as the easier half of one effort) and it never re-anchors next
    // week's weight, which would drop the prescription every time somebody
    // trained harder. Each of those three is switched off below, at the call
    // site, because two of them take loose values and cannot see the row.
    const drop = isDrop(ref)
    const input = inputFor(ref)
    const ghost = ghostFor(ref)

    // Reps: typed -> ghost (repeat-last-week's tap-the-check convenience) ->
    // the PRESCRIBED bottom of the range -> reject with a visible row error.
    // Reps of 0 (or nothing to fall back on) is never a valid "completed"
    // signal, no matter what weight is present — closes the gap where a
    // weight-only tap silently committed "0 reps" as a done set (it fed the
    // dot ladder, progress bar, and progression engine a set that never
    // happened), and the gap where an empty-reps tap did nothing with zero
    // feedback. The prescribed step is NEW and does not reopen either: it
    // supplies a real target where one exists, and falls through to the same
    // refusal where one does not. See defaultRepsFor.
    const repsStr = input.reps || (ghost ? String(ghost.reps_completed) : defaultRepsFor(ref))
    const reps = repsStr ? parseInt(repsStr, 10) : NaN
    if (!Number.isFinite(reps) || reps <= 0) {
      setRowErrors(prev => ({ ...prev, [k]: 'Enter reps to log this set' }))
      return
    }
    if (reps > MAX_REPS) {
      setRowErrors(prev => ({ ...prev, [k]: `Reps must be a whole number from 1 to ${MAX_REPS}` }))
      return
    }

    // CALIBRATION, SETS 2+: AN EMPTY BOX IS REFUSED, NOT FILLED. Placed
    // before the bodyweight resolution below, because on a bodyweight-capable
    // lift an empty weight would otherwise resolve to "bodyweight" and be
    // logged as a set she never did. The message names the probe so the
    // refusal reads as the design, not a fault.
    if (calibrationProbe && !warm && !drop && setNumber > 1 && !input.isBodyweight && !input.weight.trim() && !ghost) {
      setRowErrors(prev => ({ ...prev, [k]: 'Type the weight you lifted — set 1 was the probe' }))
      return
    }

    // Weight: bodyweight is always 0. Otherwise typed -> ghost (repeat last
    // week) -> this row's own prescribed default (the exact number already
    // shown as the input's placeholder — leaving it blank must log what the
    // placeholder promised, never silently 0). A blank weight with no ghost
    // used to fall through to weight_kg=0, which downstream code flags as
    // malformed and drops from every summary/history view without telling
    // the user their tap didn't actually count.
    const weight = input.isBodyweight
      ? 0
      : parseFloat(input.weight || (ghost ? String(ghost.weight_kg) : defaultWeightFor(ref))) || 0
    // A 0kg save without the BW flag produces exactly the "malformed
    // zero-weight" row every summary/history reader silently filters out —
    // the tap would look successful (rest timer starts) but the set vanishes.
    // On a bodyweight-capable movement (whose default load IS '0'), 0kg can
    // only mean bodyweight, so save it as one; on an externally-loaded lift,
    // refuse with a visible error instead of losing the set.
    const isBodyweight = input.isBodyweight || (weight === 0 && isBodyweightCapable)
    if (weight === 0 && !isBodyweight) {
      setRowErrors(prev => ({ ...prev, [k]: 'Enter the weight you lifted' }))
      return
    }

    // IS THIS A WEIGHT SHE ACTUALLY LIFTED?
    //
    // Ashley, 8 Sep 2026, choosing between four options: warn, and let a
    // second tap log it. So this is two rules, not one — see
    // set-plausibility.ts for both, and for why the warning is narrow.
    //
    // Placed AFTER the bodyweight resolution above so the number judged is
    // the one that would be stored, and skipped entirely for a bodyweight
    // row, which has no weight to be wrong about. The store applies the
    // absolute bound again on its own (saveSet), so a caller that never
    // reaches this screen is still covered; this half exists because only the
    // screen can ask "did you mean that?" and wait for the answer.
    if (!isBodyweight) {
      const plausibility = checkLoggedSetWeight({ weightKg: weight, entry: catalogEntry, profile })
      if (plausibility.verdict === 'impossible') {
        setRowErrors(prev => ({ ...prev, [k]: plausibility.message }))
        return
      }
      if (plausibility.verdict === 'above_ceiling' && confirmWeightSet !== k) {
        setRowWarnings(prev => ({ ...prev, [k]: `${plausibility.message} Tap ✓ again to log it anyway.` }))
        // Never both at once: red says the set was refused, amber says it is
        // waiting on her. A row showing the two together is telling her two
        // different things about the same tap.
        if (rowErrors[k]) setRowErrors(prev => { const next = { ...prev }; delete next[k]; return next })
        setConfirmWeightSet(k)
        return
      }
    }
    setConfirmWeightSet(null)
    if (rowWarnings[k]) {
      setRowWarnings(prev => { const next = { ...prev }; delete next[k]; return next })
    }

    // A weighted pull-up is bodyweight PLUS a belt: the base is always
    // bodyweight, and the typed figure is what was added. Splitting it here
    // rather than downstream keeps every existing reader
    // (isMalformedZeroWeight, maxWorkingWeight, ghosts, the PR cache) seeing
    // exactly the row shape it has always seen.
    const addedLoadKg = takesAddedLoad && weight > 0 ? weight : null
    const storedWeightKg = addedLoadKg != null ? 0 : weight
    const storedIsBodyweight = addedLoadKg != null ? true : isBodyweight
    // ON THE ROW KEY, NOT THE BARE NUMBER. Both of these were left behind when
    // rows became a kind AND a number, and neither the compiler nor a source
    // gate could see it: rowErrors and inputs are string-keyed records, so a
    // number indexes them happily and writes "2" beside "w2" and "s2". The
    // error cleared a key nothing reads, and the just-logged values were
    // filed where inputFor() never looks.
    if (rowErrors[k]) {
      setRowErrors(prev => { const next = { ...prev }; delete next[k]; return next })
    }

    setInputs(prev => ({ ...prev, [k]: { weight: isBodyweight ? '' : String(weight), reps: String(reps), isBodyweight } }))


    // Local-first: the set is persisted (and the check turns green) the
    // moment this returns — even in airplane mode.
    logSet({
      userId: profileId,
      date: today,
      weekNumber: liveWeek,
      day: dayName,
      exerciseId,
      exerciseName,
      setNumber,
      weightKg: storedWeightKg,
      repsCompleted: reps,
      unit: prescriptionUnit(prescriptionType),
      isBodyweight: storedIsBodyweight,
      addedLoadKg,
      // THE WHOLE POINT. The column, the natural key and twelve readers have
      // been waiting for this since the day they were written; nothing in the
      // app had ever been able to set it, so every build-up she logged was
      // filed as a working set and froze her weight.
      isWarmup: warm,
      // 0 for a set, 1+ for its drops. Part of the store's natural key and
      // the database's unique constraint, so a drop that arrives without it
      // does not sit beside its parent — it overwrites it.
      dropIndex: ref.dropIndex ?? 0,
    })

    // The typed value has become a real row. Leaving the draft behind would
    // resurrect it over the logged set on the next reload — inputFor checks
    // logged sets first, so it would not overwrite anything, but a stale
    // draft on a later set number would reappear as if freshly typed.
    clearSetDrafts(draftIdFor(ref))

    // Both PR paths read the STORED row, deliberately: checkForPR here and
    // getTopPRSet below must agree, and passing the raw typed figure to one
    // and the stored 0 to the other would make the badge and the check
    // disagree inside one function.
    //
    // THE COMMENT THAT STOOD HERE CLAIMED a weighted pull-up kept "exactly
    // today's behaviour (bodyweight, PR by reps)". There was no PR by reps —
    // checkForPR opened with `if (weight <= 0) return null`, so a bodyweight
    // set produced nothing at all. The comment described a design choice and
    // the code did nothing, and reading the comment was enough to stop
    // anyone checking. Both are real now, and which one applies is decided
    // by prMetricFor rather than restated here.
    // A BUILD-UP SET IS NOT A PERSONAL BEST, and the check has to be HERE as
    // well as in toSessionSets: checkForPR takes loose values, not a row, so
    // the structural filter downstream cannot see this call. Without it a
    // 20kg opener on a new exercise fires the trophy and the two-second
    // animation, and the DB-derived cache then quietly drops it on the next
    // refresh — a flicker, which is harder to notice and harder to report
    // than a wrong record that stays put.
    const pr = warm || drop ? null : checkForPR(profileId, exerciseName, {
      weightKg: storedWeightKg,
      reps,
      isBodyweight: storedIsBodyweight,
      addedLoadKg,
    })
    if (pr) {
      setAnimatingPr(true)
      setTimeout(() => setAnimatingPr(false), 2000)
    }
    // Re-evaluate against the updated log set (existingLogs will include
    // this save on the next render via setsFor; use the just-saved value
    // for this row so the PR badge doesn't lag a render).
    const projectedLogs = warm || drop ? existingLogs : [
      ...existingLogs.filter(l => l.set_number !== setNumber),
      { user_id: profileId, date: today, exercise_name: exerciseName, exercise_id: exerciseId, set_number: setNumber, weight_kg: storedWeightKg, reps_completed: reps, is_bodyweight: storedIsBodyweight, added_load_kg: addedLoadKg },
    ]
    const topPR = warm || drop ? null : getTopPRSet(profileId, exerciseName, toSessionSets(projectedLogs))
    setPrBadgeSet(topPR ? { rowKey: rowKey({ kind: 'working', setNumber: topPR.setNumber }), result: topPR.result } : null)

    // THE REST TIMER AND THE SAME-SESSION TOAST BELONG TO WORKING SETS. A
    // build-up is followed by the next build-up, not by two minutes; and the
    // "you earned a bump" check reads today's working sets, which a warm-up
    // is not one of.
    // AND NO REST TIMER AFTER A DROP — "drop · no rest" is what the header
    // says, and starting a two-minute clock would contradict the screen.
    if (!warm && !drop && onSetCompleted && prescribedReps) {
      onSetCompleted(exerciseName, setNumber, weight, reps, restTime || '60s', totalSets, prescribedReps, tier)
    }
  }

  const handleDeleteSet = (ref: SetRef) => {
    if (!profileId) return
    const k = rowKey(ref)
    if (confirmDeleteSet !== k) {
      setConfirmDeleteSet(k)
      setTimeout(() => setConfirmDeleteSet(prev => (prev === k ? null : prev)), 3000)
      return
    }
    setConfirmDeleteSet(null)
    // THE ROW'S OWN KIND. Warm-up 2 and working 2 are different rows in the
    // store's natural key, so deleting one with the other's kind tombstones
    // the wrong set — which is what every caller of this function did until
    // the parameter was made required.
    deleteSet({ userId: profileId, date: today, exerciseId, setNumber: ref.setNumber, isWarmup: isWarm(ref), dropIndex: ref.dropIndex ?? 0 })
    // deleteSet is the raw store function — refresh() is what makes the row
    // (and every other surface reading activeSession.logs) actually update.
    refresh()
    setInputs(prev => { const next = { ...prev }; delete next[k]; return next })
    if (prBadgeSet?.rowKey === k) setPrBadgeSet(null)
  }

  /** '+ Add warm-up' — an extra build-up step beyond the prescribed ones. */
  const handleAddWarmupSet = () => {
    const next = (warmupRowNumbers.length > 0 ? Math.max(...warmupRowNumbers) : 0) + 1
    setExtraSets(`${exerciseId}#warmup`, [...extraWarmupNumbers, next])
  }

  /**
   * "+ Add a drop" — one more continuation row under the set just logged.
   *
   * Never pre-drawn, because nothing prescribed it (see the derivation
   * above). The row appears only where somebody asked for it, which also
   * means the grid never shows an empty drop box to a person who does not
   * use them.
   */
  const handleAddDrop = (setNumber: number) => {
    const drawn = extraSetsFor(dropExtrasKey(setNumber))
    const existing = dropIndicesFor(setNumber)
    const next = (existing.length ? Math.max(...existing) : 0) + 1
    setExtraSets(dropExtrasKey(setNumber), [...drawn, next])
  }

  const handleAddExtraSet = () => {
    const next = nextExtraSetNumber(totalSets, loggedSetNumbers, extraSetNumbers)
    setExtraSets(exerciseId, [...extraSetNumbers, next])
  }

  const logColumnLabel = prescriptionType
    ? getRepsColumnLabel(prescribedReps ?? '', prescriptionType)
    : 'Reps'

  return (
    <div className="pb-3 pt-1 space-y-1">
      <div className="grid grid-cols-[auto_minmax(6rem,1fr)_auto_auto_auto_1fr_auto] gap-1.5 items-center text-xs text-muted-foreground font-medium px-1">
        <span className="w-7">#</span>
        <span>
          {loadIsEstimate ? 'Log weight' : 'Weight'}
          {loadUnitLabel && loadUnitLabel !== 'kg' && (
            <span className="text-muted-foreground/70"> · {loadUnitLabel.replace(/^kg\s*/, '')}</span>
          )}
        </span>
        <span className="w-7"></span>
        <span className="w-7"></span>
        <span className="w-8"></span>
        <span>{logColumnLabel}</span>
        <span className="w-8"></span>
      </div>
      {rowRefs.map((ref, rowIndex) => {
        const setNumber = ref.setNumber
        const k = rowKey(ref)
        const warm = isWarm(ref)
        const drop = isDrop(ref)
        const isSaved = !!loggedRowFor(ref)
        const input = inputFor(ref)
        const isBW = input.isBodyweight
        const isPRSet = prBadgeSet?.rowKey === k
        const ghost = ghostFor(ref)
        // The caption sits above the FIRST row of each block rather than
        // wrapping them, so both blocks stay inside one grid and the weight
        // column runs unbroken down the card.
        // THE GROUP HEADER, not a caption — Ashley's handoff, 19 Sep 2026.
        // Two halves: what the group IS on the left, what it COSTS on the
        // right. The right half is why the row label could shorten from
        // "Warm-up 1" to "R1" without losing anything: "not counted" now says
        // on the group what the long label used to say on every row.
        //
        // It sits above the first row of each block rather than wrapping it,
        // so both blocks stay inside one grid and the weight column runs
        // unbroken down the card — the layout half of her 17 Sep ruling.
        const railed = !insideSuperset
        const startsWorking = warm === false && !drop && rowIndex > 0 && rowRefs[rowIndex - 1].kind === 'warmup'
        const groupHead = rowIndex === 0 && warm
          ? { left: 'Ramp up', right: 'not counted' }
          : startsWorking
            ? { left: `Working sets · ${totalSets} × ${prescribedReps ?? ''}`.trim().replace(/ ×\s*$/, ''), right: restTime ? `saved · rest ${restTime}` : 'saved' }
            : null
        // THE DROP HEADER, above the FIRST drop of a set only — a second one
        // between 3·1 and 3·2 would be announcing the same thing twice about
        // one continuous effort. "No rest" is not decoration: it is the whole
        // difference between a drop and another set, and this row is the only
        // place on the card where the rest figure in the working header above
        // does not apply.
        const startsDrops = drop && rowIndex > 0 && !isDrop(rowRefs[rowIndex - 1])
        // The one "add a drop" link: under the last row of the last logged
        // set, and only once that row is actually saved. Offering it under an
        // empty box would be asking for a continuation of a set that has not
        // happened.
        const showAddDrop = rowIndex === lastRowIndexOfLastLoggedSet && isSaved
        const padClass = railed
          ? (drop ? 'pl-5 pr-1' : 'pl-2 pr-1')
          : (drop ? 'pl-4 pr-1 rounded-l-[8px]' : 'px-1 rounded-l-[8px]')

        return (
          <React.Fragment key={k}>
          {startsDrops && (
            <div className="flex items-baseline gap-2 pl-5 pr-1 pt-1" data-testid="drop-caption">
              <span className="text-[0.625rem] uppercase tracking-[.12em] whitespace-nowrap text-primary-text">
                Drop · no rest
              </span>
            </div>
          )}
          {groupHead && (
            <div
              className={`flex items-baseline justify-between gap-2 pl-2.5 pr-1 ${rowIndex === 0 ? '' : 'pt-3'}`}
              data-testid={warm ? 'warmup-caption' : 'working-caption'}
            >
              <span className={`text-[0.625rem] uppercase tracking-[.12em] whitespace-nowrap ${warm ? 'text-[color:var(--ramp-label)]' : 'text-primary-text'}`}>
                {groupHead.left}
              </span>
              <span className="text-[0.625rem] text-muted-foreground whitespace-nowrap">{groupHead.right}</span>
            </div>
          )}
          <div
            data-testid={warm ? 'warmup-row' : drop ? 'drop-row' : 'working-row'}
            // A RAIL MEANS GROUPING, A COLOUR MEANS WHAT A SET COUNTS AS —
            // the rule the whole handoff rests on. The rail is drawn per row
            // rather than as a wrapper because both groups share one grid, so
            // wrapping either would break the weight column that runs down
            // the card. Adjacent rows with no gap read as one continuous bar.
            //
            // INSIDE A SUPERSET IT IS DROPPED: that rail already means
            // grouping, and two rails would fight. There the ramp is signalled
            // by the violet label and save button alone.
            //
            // A DROP KEEPS THE WORKING RAIL, and that follows from her rule
            // rather than from taste: the rail says what belongs with what,
            // and a drop belongs with the working sets. Its own subordination
            // is carried by the indent and the tether below — position, not
            // colour, because colour here already means "this counts as
            // working volume", which a drop does.
            style={railed ? { borderLeft: `2px solid ${warm ? 'var(--ramp-rail)' : 'color-mix(in srgb, var(--primary) 55%, transparent)'}` } : undefined}
            className={`grid grid-cols-[auto_minmax(6rem,1fr)_auto_auto_auto_1fr_auto] gap-1.5 items-center rounded-r-[8px] py-0.5 transition-colors ${drop ? 'relative' : ''} ${padClass} ${
              isSaved ? (warm ? 'bg-[color:var(--ramp)]/10' : 'bg-primary/10') : ''
            }`}
          >
            {/* The tether — an elbow from the row above into this one, so a
                drop reads as hanging off its set rather than sitting beside
                it. Decorative and hidden from a screen reader, which gets the
                same fact from the row's spoken name ("Set 3, drop 1"). */}
            {drop && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-1.5 top-0 h-1/2 w-[9px] rounded-bl-[6px] border-b-2 border-l-2"
                style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}
              />
            )}
            {/* THE KIND IS IN THE LABEL, NOT ONLY IN THE DATA. A caption
                scrolls off the top of a phone; the row prefix does not. W1
                or 1, and no third case. */}
            {/* R1 on screen, "Warm-up 1" out loud — see setLabel/setLabelLong.
                The violet says what the row COUNTS AS and is the only colour
                carrying that meaning; the rail beside it only says these rows
                belong together. */}
            <span className={`w-7 font-mono text-xs font-medium text-center ${warm ? 'text-[color:var(--ramp-label)]' : (isSaved ? 'text-primary-text' : 'text-muted-foreground')}`}>
              {setLabel(ref)}
            </span>
            {/* `max` is a hint the browser does not enforce (see
                saveCardioLog's comment on the same trap) — the rule is
                checkLoggedSetWeight in handleSaveSet, and the absolute half
                of it again in the store. */}
              {/* h-11 is 44px, the comfortable tap minimum. These two are
                  used mid-workout and at 28px were the smallest real targets
                  in the app. A text field cannot carry the invisible hit-slop
                  the buttons use — there is no ::after on an <input> — so the
                  only honest fix is real height. Ashley chose it on 9 Sep
                  2026 from three options, having seen the before and after:
                  the page grows about 60px and the boxes stop being missable. */}
            <Input
              id={`setgrid-weight-${exerciseId}-${k}`}
              type="number"
              min="0"
              max={MAX_LOGGABLE_SET_KG}
              step="0.5"
              placeholder={isBW ? 'BW' : (ghost ? String(ghost.weight_kg) : weightPlaceholderFor(ref))}
              value={isBW ? '' : input.weight}
              onChange={e => updateInput(ref, 'weight', e.target.value)}
              onFocus={scrollRowIntoView}
              className={`h-11 border-0 bg-[color:var(--surface-raised)] text-sm shadow-none ${isSaved ? 'text-primary-text' : ''} ${isBW ? 'text-muted-foreground' : ''} ${rowErrors[k] ? 'ring-1 ring-destructive' : rowWarnings[k] ? 'ring-1 ring-amber-500' : ''}`}
              disabled={isBW}
            />
            {/* The `?.` used to make this button silently inert wherever the
                prop was absent, which is how Additional Work came to have a
                dead one. The handler is threaded there now — and the button
                only renders where one exists, so the same gap cannot draw a
                dead control again. */}
            {/* AND NOT ON A CABLE, since 19 Sep 2026. The pin IS the weight
                there, so a button offering to work out the plates describes a
                machine that is not in front of her — see
                takesPlateCalculator, which has the measurement for why this
                is cable rather than every stack. */}
            {onOpenPlateCalc && takesPlateCalculator(catalogEntry) && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={() => onOpenPlateCalc(parseFloat(input.weight || (ghost ? String(ghost.weight_kg) : '0')) || 0)}
                disabled={isBW}
                aria-label="Plate calculator"
              >
                <Dumbbell className="size-3.5" />
              </Button>
            )}
            {isBodyweightCapable && (
              <Button
                variant={isBW ? 'default' : 'outline'}
                size="sm"
                className="h-7 w-7 text-[0.625rem] font-bold px-0"
                onClick={() => toggleBodyweight(ref)}
                aria-label="Toggle bodyweight"
              >
                BW
              </Button>
            )}
            <Input
              type="number"
              min="0"
              max={MAX_REPS}
              step="1"
              /* Never '0' as a fallback: that suggested the exact value the
                 save refuses, on the one session where the fallback applies. */
              placeholder={ghost ? String(ghost.reps_completed) : defaultRepsFor(ref)}
              value={input.reps}
              onChange={e => updateInput(ref, 'reps', e.target.value)}
              onFocus={scrollRowIntoView}
              className={`h-11 border-0 bg-[color:var(--surface-raised)] text-sm shadow-none ${isSaved ? 'text-primary-text' : ''} ${rowErrors[k] ? 'ring-1 ring-destructive' : ''}`}
            />
            <div className="flex items-center gap-1">
              {isPRSet && prBadgeSet?.result && (
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[0.625rem] font-medium bg-primary/15 text-primary-text glow-mint whitespace-nowrap ${animatingPr ? 'animate-pulse scale-110' : ''} transition-transform`}>
                  <Trophy className="size-2.5" />
                  PR
                </span>
              )}
              {/* 3b: the outstanding set's save control is the lit mint square —
                  the one thing on the row asking to be tapped. Once saved it
                  recedes to a quiet mint tick. */}
              {/* data-tour ONLY while the row is still open, and that is the
                  whole mechanism behind the tour's set stop rather than a
                  detail. The tour waits for this element to DISAPPEAR, which
                  happens precisely when saveSet returns and isSaved flips —
                  so a save that fails validation leaves the row open, leaves
                  this attribute in place, and correctly leaves the tour
                  waiting instead of congratulating the user for a set that
                  was never logged. See AppTour.tsx's measure loop. */}
              <Button
                data-tour={isSaved ? undefined : 'setrow'}
                variant="ghost"
                size="icon"
                className={`size-7 shrink-0 ${isSaved ? (warm ? 'text-[color:var(--ramp-label)]' : 'text-primary-text') : 'glow-pulse'}`}
                style={isSaved ? undefined : {
                  background: warm ? 'var(--ramp-button)' : 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))',
                  color: warm ? 'var(--ramp-on)' : 'var(--primary-foreground)',
                }}
                onClick={() => handleSaveSet(ref)}
                // THE KIND IS IN THE SPOKEN LABEL TOO. Warm-up 2 and working
                // set 2 both read "Save set 2" until 17 Sep 2026, so a screen
                // reader — and every driver — could not tell the two tick
                // buttons apart. setLabelLong was imported for this and never
                // wired, which is the declared-but-not-rendered shape again.
                aria-label={isSaved ? `${setLabelLong(ref)} saved` : `Save ${setLabelLong(ref).toLowerCase()}`}
              >
                <Check className="size-3.5" />
              </Button>
            </div>
          </div>
          {/* THE RECEIPT NAMES THE ROW IT IS FOR. It read the WORKING logs by
              set number and printed "Set 3", so two things were wrong at once:
              a drop showed its PARENT's numbers under it, and a saved ramp row
              showed the working set of the same number — R2's receipt reading
              out working set 2. A logged ramp row now gets its own receipt and
              its own delete, which it had neither of before. Both halves are
              the standing rule ("two rows must not share one spoken name")
              meeting the rows this screen has gained since it was written. */}
          {isSaved && (() => {
            const logged = loggedRowFor(ref)
            if (!logged) return null
            const armed = confirmDeleteSet === k
            return (
              <div className={`flex items-center justify-between gap-2 -mt-0.5 ${drop ? 'pl-5 pr-1' : 'px-1'}`}>
                <p className="text-[0.625rem] text-primary-text">
                  {setLabelLong(ref)}: {logged.is_bodyweight
                    ? `${logged.reps_completed} reps · Bodyweight`
                    : `${logged.reps_completed} reps @ ${logged.weight_kg}kg`} ✓
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteSet(ref)}
                  className={`flex shrink-0 items-center gap-1 text-[0.625rem] ${armed ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                  aria-label={armed ? `Confirm delete ${setLabelLong(ref).toLowerCase()}` : `Delete ${setLabelLong(ref).toLowerCase()}`}
                >
                  <Trash2 className="size-2.5" />
                  {armed ? 'Tap to confirm' : 'Delete'}
                </button>
              </div>
            )
          })()}
          {/* "+ ADD A DROP" — one link, under the last row of the last logged
              set. The handoff labelled it "−25%"; it says the KILOS it will
              put in the box instead, which is the same deviation the
              calibration chips two blocks down already make and for the
              measured reason recorded there: a percentage that snaps to a
              plate step names a weight the app will not actually offer. At a
              27.5kg base, "−25%" lands on 20kg, which is −27%. The number on
              the control is the number in the box. */}
          {showAddDrop && (() => {
            const above = loggedRowFor(ref)
            const target = above && !above.is_bodyweight && Number(above.weight_kg) > 0
              ? dropWeightFrom(Number(above.weight_kg))
              : null
            return (
              <button
                type="button"
                data-testid="add-drop"
                onClick={() => handleAddDrop(setNumber)}
                className="hit-slop-44 flex items-center gap-1 text-[0.6875rem] text-primary-text pl-[34px] -mt-0.5"
                aria-label={target != null
                  ? `Add a drop after set ${setNumber}, starting at ${target}kg`
                  : `Add a drop after set ${setNumber}`}
              >
                <Plus className="size-3" />
                {target != null ? `Add a drop · ${target}kg` : 'Add a drop'}
              </button>
            )
          })()}
          {/* THE NEXT WEIGHT, OFF THE LAST ONE LIFTED. Only in calibration
              week, only on an unlogged set whose predecessor is logged, and
              only ever as a suggestion the box does not adopt by itself.
              Computed from the previous LOGGED set, never from the
              prescription — the prescription is the thing being replaced.

              LABELLED IN KILOS, NOT PERCENT — a deviation from the plan,
              which said `+5%` / `+10%`. Measured in the browser at 27.5kg on
              a barbell: 5% and 10% both snap to 30kg, so the ladder collapsed
              to a single rung AND the chip labelled "+5%" named a weight that
              was really +9%. Percentages are the coaching intent (the cue
              says "go up 5-10%"); what she can actually put on the bar is a
              plate step. So the targets stay 5% and 10%, each is snapped to
              the implement's real step, each is forced at least one step
              above the one before it, and the chip says the kilos it adds —
              which is true at every weight. */}
          {/* NOT ON A BUILD-UP ROW. The chips climb off the PREVIOUS WORKING
              set, so on warm-up 2 they would offer a next weight derived from
              working set 1 — a ladder built from the wrong lift entirely. A
              build-up step already has its number from the prescription. */}
          {calibrationProbe && !warm && !drop && setNumber > 1 && !isSaved && (() => {
            const prev = existingLogs.find(l => l.set_number === setNumber - 1)
            if (!prev || prev.is_bodyweight || !(Number(prev.weight_kg) > 0)) return null
            const mode = catalogEntry ? loadingMode(catalogEntry) : 'stack'
            const step = plateStepKg(mode)
            const base = Number(prev.weight_kg)
            const rungs: number[] = []
            for (const target of [base * 1.05, base * 1.10]) {
              const floor = (rungs[rungs.length - 1] ?? base) + step
              rungs.push(Math.max(roundToPlate(target, mode), floor))
            }
            const opts = [base, ...rungs].map(kg => ({
              kg,
              // Trailing .0 trimmed: "+5", not "+5.0", and "+2.5" intact.
              label: kg === base ? 'same' : `+${Number((kg - base).toFixed(2))}`,
            }))
            return (
              <div className="flex items-center gap-1 flex-wrap px-1 -mt-0.5" data-testid="calibration-cascade">
                <span className="text-[0.625rem] text-muted-foreground">After {base}kg:</span>
                {opts.map(o => (
                  <button
                    key={o.label}
                    type="button"
                    className="hit-slop-44 rounded border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[0.625rem] text-primary-text"
                    onClick={() => updateInput(ref, 'weight', String(o.kg))}
                    aria-label={`Set ${setNumber} at ${o.kg}kg (${o.kg === base ? 'same as set ' + (setNumber - 1) : o.label.slice(1) + 'kg more'})`}
                  >
                    {o.label} · {o.kg}
                  </button>
                ))}
              </div>
            )
          })()}
          {rowErrors[k] && (
            <p className="text-[0.625rem] text-destructive px-1 -mt-0.5">{rowErrors[k]}</p>
          )}
          {/* Amber, not red: nothing has been refused here and nothing has
              gone wrong — the app has noticed something and is asking. Same
              tone the plate calculator uses for "you may not own these
              plates." */}
          {rowWarnings[k] && (
            <p className="text-[0.625rem] text-amber-600 dark:text-amber-400 px-1 -mt-0.5" data-testid="weight-warning">
              {rowWarnings[k]}
            </p>
          )}
          {/* WHOSE NUMBERS ARE THOSE. Ashley read her own last session — 9,
              11, 11 — as a prescription, because the faint figures in the
              boxes are her history wherever she has any and the app's
              suggestion wherever she has none, drawn identically. Her ruling,
              18 Sep 2026, from three options: mark them, leave them in the
              boxes. Only where a ghost is actually driving the placeholder,
              and never once the row is saved — then the boxes hold today's
              real numbers and the marker would be describing nothing. */}
          {ghost && !isSaved && (
            <p className="text-[0.625rem] text-muted-foreground/80 px-1 -mt-0.5 text-right" data-testid="last-time">
              {lastTime(loggedSetReading(ghost))}
            </p>
          )}
          </React.Fragment>
        )
      })}
      {/* ONE "Add Set", NOT TWO. The build-up gets its own control because it
          is a different question — a fourth ramp step is not a fourth working
          set — but a second generic "Add Set" between the blocks would be the
          exact thing Ashley's ruling is against: a button offering to record
          work the app itself asked for. */}
      {/* VIOLET, NOT AMBER, SINCE 19 Sep 2026 — this button adds a RAMP row, so
          it wears the ramp colour like everything else that means "ramp". The
          amber it used to wear is the app's caution colour and meant nothing
          here; the only amber left on this screen is the weight warning below,
          which genuinely is a caution and would be a lie in violet. */}
      {showWarmupControls && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-[color:var(--ramp-label)] h-6 mt-0.5"
          onClick={handleAddWarmupSet}
          data-testid="add-warmup-set"
        >
          <Plus className="size-3 mr-1" />
          Add warm-up
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground h-6 mt-0.5"
        onClick={handleAddExtraSet}
      >
        <Plus className="size-3 mr-1" />
        Add Set
      </Button>
    </div>
  )
}

/**
 * WHAT THE SECOND COLUMN IS COUNTING — AND IN WHAT.
 *
 * Ashley, 18 Sep 2026, on her suitcase carry: *"says distance 40 but it's not
 * clear if that's feet meters etc."* The header said "Distance", the box said
 * 40, and the unit was sitting in the prescription the whole time ("3x40m")
 * and was thrown away on the way to the screen.
 *
 * This is the standing rule one column across: a number never reaches a screen
 * without its unit. `Reps` is the one label that needs none, because the unit
 * IS the word.
 */
export function getRepsColumnLabel(reps: string, prescriptionType?: string): string {
  const kind = ((): string => {
    switch (prescriptionType) {
      case 'time': return 'Hold'
      case 'distance_load': return 'Distance'
      case 'intervals': return 'Work'
      case 'steady_state': return 'Duration'
      case 'reps': return 'Reps'
    }
    if (reps.includes('min')) return 'Duration'
    if (reps.endsWith('s')) return 'Time'
    if (reps.endsWith('m')) return 'Distance'
    return 'Reps'
  })()
  if (kind === 'Reps') return kind
  const unit = unitOfPrescription(reps)
  return unit ? `${kind} \u00b7 ${unit}` : kind
}

/**
 * The unit the prescription itself is written in, read off the string rather
 * than guessed from the kind — "40m" is metres, "45s" seconds, "3min" minutes.
 * Returns null when the prescription carries no unit, so the caller shows the
 * bare kind rather than a made-up one.
 */
function unitOfPrescription(reps: string): string | null {
  const m = /([0-9])\s*(min|m|s|km|mi|ft|yd)\b/i.exec(reps.trim())
  return m ? m[2].toLowerCase() : null
}
