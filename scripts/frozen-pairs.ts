// ---------------------------------------------------------------------------
// THE FROZEN-WEEK RULE — one definition, imported by every script that asks
// "did this week repeat the last one?".
//
// Lifted out of measure-frozen-exercises.ts on 19 Sep 2026, unchanged, when a
// second measurement (the progression-lever audit) needed the same rule AND
// needed to see the two Exercise objects rather than a projection of them.
//
// EXTRACTED RATHER THAN COPIED, for the reason quality-grid.ts gives about the
// grid: a copy is how two measurements of one question end up with different
// guards and disagree without either being able to say why. That has already
// happened here once — a fresh pattern-coverage script reported a defect forty
// times larger than the scorer's, and the whole gap was one guard the copy did
// not have.
//
// The rule itself is quality-score.ts's `frozen_week`, mirrored: consecutive
// non-deload weeks WITHIN a block, same day, same slot index, same exercise
// name; load unchanged (null counts as unchanged against null) and reps
// unchanged; primers and steady-state cardio exempt. Every sweep that uses
// this should keep measure-frozen-exercises.ts's periodic cross-check against
// scorePlan, which is what proves the mirror has not drifted from the gate.
//
// WHAT THE RULE DOES NOT LOOK AT is the whole subject of the lever audit:
// sets, tempo, RPE, rest, added load and machine assistance can all move while
// load and reps sit still, and this rule calls that a frozen week.
// ---------------------------------------------------------------------------
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { categorize, isExternallyLoaded } from '../src/lib/load-prescription'
import type { MesocycleWeek, Exercise } from '../src/lib/types'

/** One slot, seen in two consecutive weeks of the same block. */
export interface SlotPair {
  day: string
  weekA: number
  weekB: number
  exA: Exercise
  exB: Exercise
}

export interface FrozenSweep {
  /**
   * Every slot pair the rule CONSIDERED. The denominator a RATE needs, and
   * deliberately returned beside the frozen ones so no caller has to
   * re-derive it with its own idea of what counts — the share of PLANS
   * carrying one frozen pair anywhere and the share of week-to-week SLOTS
   * that are frozen are two very different numbers, and quoting the first as
   * though it were the second is the mistake this whole audit started from.
   */
  considered: SlotPair[]
  frozen: SlotPair[]
}

/**
 * The rule, over one mesocycle.
 *
 * Kept structurally identical to quality-score.ts's loop — same block range,
 * same in-block pairing, same exemptions, same null-load handling — because
 * the periodic scorePlan cross-check is only meaningful while it is.
 */
export function sweepFrozen(mesocycle: MesocycleWeek[]): FrozenSweep {
  const considered: SlotPair[] = []
  const frozen: SlotPair[] = []
  for (let block = 1; block <= 4; block++) {
    const blockWeeks = mesocycle
      .filter(w => w.block_number === block)
      .sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
    const pairs: [MesocycleWeek | undefined, MesocycleWeek | undefined][] = [
      [blockWeeks[0], blockWeeks[1]], [blockWeeks[1], blockWeeks[2]],
    ]
    for (const [wa, wb] of pairs) {
      if (!wa || !wb || wa.is_deload || wb.is_deload) continue
      for (const dayA of wa.days) {
        const dayB = wb.days.find(d => d.day === dayA.day)
        if (!dayB) continue
        dayA.exercises.forEach((exA: Exercise, i: number) => {
          const exB = dayB.exercises[i]
          if (!exB || exB.name !== exA.name) return
          if (exA.tier === 'tier_0_primer' || exA.prescription_type === 'steady_state') return
          const slot: SlotPair = { day: dayA.day, weekA: wa.week_number, weekB: wb.week_number, exA, exB }
          considered.push(slot)
          const loadFrozen = exA.suggested_load_kg == null
            ? exB.suggested_load_kg == null
            : exA.suggested_load_kg === exB.suggested_load_kg
          if (loadFrozen && exA.reps === exB.reps) frozen.push(slot)
        })
      }
    }
  }
  return { considered, frozen }
}

export interface FrozenPair {
  name: string; reps: string; kg: number | null
  weekA: number; weekB: number
  hold?: string; bump?: string
}

/** The projection measure-frozen-exercises.ts reports on. */
export function frozenPairs(mesocycle: MesocycleWeek[]): FrozenPair[] {
  return sweepFrozen(mesocycle).frozen.map(({ exA, exB, weekA, weekB }) => ({
    name: exA.name, reps: exA.reps, kg: exA.suggested_load_kg ?? null,
    weekA, weekB, hold: exB.load_hold, bump: exB.rep_bump,
  }))
}

// The loaded class is split by what the generator itself recorded on week B
// (Exercise.load_hold / rep_bump) — `loaded:<hold>/<bump>`. A bar held at the
// standards ceiling with the rep bump at its cap is held BY DESIGN; one where
// no permitted bump can change the rep range is a floor decision (Ashley's);
// a band decline is a safety refusal; 'matched' is the one-target/one-weight
// per-lift rules pinning a slot to its sibling; a carry at its distance cap
// is its own thing.
export type Cause = string
const byName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
export function causeOf(p: FrozenPair): Cause {
  const entry = byName.get(p.name)
  if (!entry) return 'unknown_exercise'
  if (p.kg != null) {
    if (entry.movement_pattern === 'carry') return 'loaded_carry'
    return `loaded:${p.hold ?? 'nohold'}/${p.bump ?? '-'}`
  }
  if (isExternallyLoaded(entry) && categorize(entry) == null) return 'tagged_loaded_no_kg'
  return 'bodyweight_no_kg'
}
