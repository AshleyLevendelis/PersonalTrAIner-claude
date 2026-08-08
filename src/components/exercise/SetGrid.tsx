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
import { computeSetRowNumbers, nextExtraSetNumber } from '@/lib/session-derive'
import { checkForPR, getTopPRSet, type PRResult } from '@/lib/pr-engine'
import { getExerciseEntry } from '@/lib/exercise-db'
import { isExternallyLoaded } from '@/lib/load-prescription'
import type { ExerciseSetLog } from '@/lib/types'

const MAX_WEIGHT_KG = 9999.99
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
  tier?: string
  suggestedLoadKg?: number | null
  /** Per-set breakdown (ramping or straight) — indexed by set number - 1. Falls back to suggestedLoadKg for any set beyond this array. */
  perSetLoadKg?: (number | null)[]
  /** Flips the weight input's helper copy from "here's the default" to "log what you actually lifted." */
  loadIsEstimate?: boolean
  onSetCompleted?: (exerciseName: string, setNumber: number, weight: number, reps: number, rest: string, sets: number, prescribedReps: string, tier?: string) => void
  onOpenPlateCalc?: (weight: number) => void
  /** Fired once, the first time ANY set is saved for an exercise with no prior logged history at all — the parent dedupes to a session-local one-time celebration. */
  onFirstEverLog?: (exerciseName: string) => void
}

function toSessionSets(logs: ExerciseSetLog[]): { setNumber: number; weight: number; reps: number }[] {
  return logs
    .filter(l => l.weight_kg > 0 && l.reps_completed > 0)
    .map(l => ({ setNumber: l.set_number, weight: l.weight_kg, reps: l.reps_completed }))
}

export function SetGrid({
  exerciseName,
  exerciseId,
  totalSets,
  prescribedReps,
  prescriptionType,
  restTime,
  tier,
  suggestedLoadKg,
  perSetLoadKg,
  loadIsEstimate,
  onSetCompleted,
  onOpenPlateCalc,
  onFirstEverLog,
}: SetGridProps) {
  const { profileId, date: today, dayName, liveWeek, setsFor, ghosts, loadGhosts, logSet, deleteSet, refresh } = useActiveSession()

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

  const existingLogs = setsFor(exerciseId, exerciseName)
  const ghostValues = ghosts(exerciseId)
  const loggedSetNumbers = existingLogs.map(l => l.set_number)

  const [extraSetNumbers, setExtraSetNumbers] = useState<number[]>([])
  const rowNumbers = computeSetRowNumbers(totalSets, loggedSetNumbers, extraSetNumbers)

  const [inputs, setInputs] = useState<Record<number, SetInputState>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [prBadgeSet, setPrBadgeSet] = useState<{ setNumber: number; result: PRResult } | null>(null)
  const [animatingPr, setAnimatingPr] = useState(false)
  /** Armed-then-confirm delete, tap-tap within 3s — no window.confirm (themed-app clash, PWA-suppressible per the UX sweep's Clear-chat finding), but a saved set is still a real row to lose, so a bare single tap doesn't do it. */
  const [confirmDeleteSet, setConfirmDeleteSet] = useState<number | null>(null)

  const inputFor = (setNumber: number): SetInputState => {
    if (inputs[setNumber]) return inputs[setNumber]
    const existing = existingLogs.find(l => l.set_number === setNumber)
    if (existing) {
      return { weight: String(existing.weight_kg), reps: String(existing.reps_completed), isBodyweight: existing.is_bodyweight }
    }
    return { weight: '', reps: '', isBodyweight: false }
  }

  const ghostFor = (setNumber: number) => ghostValues.find(g => g.set_number === setNumber)

  const updateInput = (setNumber: number, field: 'weight' | 'reps', value: string) => {
    setInputs(prev => ({ ...prev, [setNumber]: { ...inputFor(setNumber), [field]: value } }))
    if (rowErrors[setNumber]) setRowErrors(prev => { const next = { ...prev }; delete next[setNumber]; return next })
  }

  const toggleBodyweight = (setNumber: number) => {
    setInputs(prev => ({ ...prev, [setNumber]: { ...inputFor(setNumber), isBodyweight: !inputFor(setNumber).isBodyweight, weight: '' } }))
  }

  const defaultWeightFor = (setNumber: number): string => {
    const perSet = perSetLoadKg?.[setNumber - 1]
    if (perSet != null) return String(perSet)
    return suggestedLoadKg != null ? String(suggestedLoadKg) : '0'
  }

  const handleSaveSet = (setNumber: number) => {
    if (!profileId) return
    const input = inputFor(setNumber)
    const ghost = ghostFor(setNumber)

    // Reps: typed -> ghost (repeat-last-week's tap-the-check convenience) ->
    // reject with a visible row error. Reps of 0 (or nothing to fall back
    // on) is never a valid "completed" signal, no matter what weight is
    // present — closes the gap where a weight-only tap silently committed
    // "0 reps" as a done set (it fed the dot ladder, progress bar, and
    // progression engine a set that never happened), and the gap where an
    // empty-reps tap did nothing with zero feedback.
    const repsStr = input.reps || (ghost ? String(ghost.reps_completed) : '')
    const reps = repsStr ? parseInt(repsStr, 10) : NaN
    if (!Number.isFinite(reps) || reps <= 0) {
      setRowErrors(prev => ({ ...prev, [setNumber]: 'Enter reps to log this set' }))
      return
    }
    if (reps > MAX_REPS) {
      setRowErrors(prev => ({ ...prev, [setNumber]: `Reps must be a whole number from 1 to ${MAX_REPS}` }))
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
      : parseFloat(input.weight || (ghost ? String(ghost.weight_kg) : defaultWeightFor(setNumber))) || 0
    if (!input.isBodyweight && (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT_KG)) {
      setRowErrors(prev => ({ ...prev, [setNumber]: `Weight must be between 0 and ${MAX_WEIGHT_KG}kg` }))
      return
    }
    if (rowErrors[setNumber]) {
      setRowErrors(prev => { const next = { ...prev }; delete next[setNumber]; return next })
    }

    setInputs(prev => ({ ...prev, [setNumber]: { weight: input.isBodyweight ? '' : String(weight), reps: String(reps), isBodyweight: input.isBodyweight } }))

    const wasFirstEverLog = ghostValues.length === 0

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
      weightKg: weight,
      repsCompleted: reps,
      unit: prescriptionUnit(prescriptionType),
      isBodyweight: input.isBodyweight,
    })

    if (wasFirstEverLog) onFirstEverLog?.(exerciseName)

    const pr = checkForPR(profileId, exerciseName, weight, reps)
    if (pr) {
      setAnimatingPr(true)
      setTimeout(() => setAnimatingPr(false), 2000)
    }
    // Re-evaluate against the updated log set (existingLogs will include
    // this save on the next render via setsFor; use the just-saved value
    // for this row so the PR badge doesn't lag a render).
    const projectedLogs = [
      ...existingLogs.filter(l => l.set_number !== setNumber),
      { user_id: profileId, date: today, exercise_name: exerciseName, exercise_id: exerciseId, set_number: setNumber, weight_kg: weight, reps_completed: reps, is_bodyweight: input.isBodyweight },
    ]
    const topPR = getTopPRSet(profileId, exerciseName, toSessionSets(projectedLogs))
    setPrBadgeSet(topPR)

    if (onSetCompleted && prescribedReps) {
      onSetCompleted(exerciseName, setNumber, weight, reps, restTime || '60s', totalSets, prescribedReps, tier)
    }
  }

  const handleDeleteSet = (setNumber: number) => {
    if (!profileId) return
    if (confirmDeleteSet !== setNumber) {
      setConfirmDeleteSet(setNumber)
      setTimeout(() => setConfirmDeleteSet(prev => (prev === setNumber ? null : prev)), 3000)
      return
    }
    setConfirmDeleteSet(null)
    deleteSet({ userId: profileId, date: today, exerciseId, setNumber })
    // deleteSet is the raw store function — refresh() is what makes the row
    // (and every other surface reading activeSession.logs) actually update.
    refresh()
    setInputs(prev => { const next = { ...prev }; delete next[setNumber]; return next })
    if (prBadgeSet?.setNumber === setNumber) setPrBadgeSet(null)
  }

  const handleAddExtraSet = () => {
    const next = nextExtraSetNumber(totalSets, loggedSetNumbers, extraSetNumbers)
    setExtraSetNumbers(prev => [...prev, next])
  }

  const logColumnLabel = prescriptionType
    ? getRepsColumnLabel(prescribedReps ?? '', prescriptionType)
    : 'Reps'

  return (
    <div className="pb-3 pt-1 space-y-1">
      <div className="grid grid-cols-[auto_minmax(6rem,1fr)_auto_auto_auto_1fr_auto] gap-1.5 items-center text-xs text-muted-foreground font-medium px-1">
        <span className="w-5">#</span>
        <span>{loadIsEstimate ? 'Log weight' : 'Weight'}</span>
        <span className="w-7"></span>
        <span className="w-7"></span>
        <span className="w-8"></span>
        <span>{logColumnLabel}</span>
        <span className="w-8"></span>
      </div>
      {rowNumbers.map(setNumber => {
        const isSaved = loggedSetNumbers.includes(setNumber)
        const input = inputFor(setNumber)
        const isBW = input.isBodyweight
        const isPRSet = prBadgeSet?.setNumber === setNumber
        const ghost = ghostFor(setNumber)

        return (
          <React.Fragment key={setNumber}>
          <div
            className={`grid grid-cols-[auto_minmax(6rem,1fr)_auto_auto_auto_1fr_auto] gap-1.5 items-center rounded-[8px] px-1 py-0.5 transition-colors ${
              isSaved ? 'bg-primary/10' : ''
            }`}
          >
            <span className={`w-5 text-xs font-medium text-center ${isSaved ? 'text-primary' : 'text-muted-foreground'}`}>
              {setNumber}
            </span>
            <Input
              id={`setgrid-weight-${exerciseId}-${setNumber}`}
              type="number"
              min="0"
              max={MAX_WEIGHT_KG}
              step="0.5"
              placeholder={isBW ? 'BW' : (ghost ? String(ghost.weight_kg) : defaultWeightFor(setNumber))}
              value={isBW ? '' : input.weight}
              onChange={e => updateInput(setNumber, 'weight', e.target.value)}
              onFocus={scrollRowIntoView}
              className={`h-7 border-0 bg-[color:var(--surface-raised)] text-sm shadow-none ${isSaved ? 'text-primary' : ''} ${isBW ? 'text-muted-foreground' : ''} ${rowErrors[setNumber] ? 'ring-1 ring-destructive' : ''}`}
              disabled={isBW}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenPlateCalc?.(parseFloat(input.weight || (ghost ? String(ghost.weight_kg) : '0')) || 0)}
              disabled={isBW}
              aria-label="Plate calculator"
            >
              <Dumbbell className="size-3.5" />
            </Button>
            {isBodyweightCapable && (
              <Button
                variant={isBW ? 'default' : 'outline'}
                size="sm"
                className="h-7 w-7 text-[10px] font-bold px-0"
                onClick={() => toggleBodyweight(setNumber)}
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
              placeholder={ghost ? String(ghost.reps_completed) : '0'}
              value={input.reps}
              onChange={e => updateInput(setNumber, 'reps', e.target.value)}
              onFocus={scrollRowIntoView}
              className={`h-7 border-0 bg-[color:var(--surface-raised)] text-sm shadow-none ${isSaved ? 'text-primary' : ''} ${rowErrors[setNumber] ? 'ring-1 ring-destructive' : ''}`}
            />
            <div className="flex items-center gap-1">
              {isPRSet && prBadgeSet?.result && (
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary glow-mint whitespace-nowrap ${animatingPr ? 'animate-pulse scale-110' : ''} transition-transform`}>
                  <Trophy className="size-2.5" />
                  PR
                </span>
              )}
              {/* 3b: the outstanding set's save control is the lit mint square —
                  the one thing on the row asking to be tapped. Once saved it
                  recedes to a quiet mint tick. */}
              <Button
                variant="ghost"
                size="icon"
                className={`size-7 shrink-0 ${isSaved ? 'text-primary' : 'text-[color:var(--primary-foreground)] glow-pulse'}`}
                style={isSaved ? undefined : { background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' }}
                onClick={() => handleSaveSet(setNumber)}
              >
                <Check className="size-3.5" />
              </Button>
            </div>
          </div>
          {isSaved && (() => {
            const logged = existingLogs.find(l => l.set_number === setNumber)
            if (!logged) return null
            const armed = confirmDeleteSet === setNumber
            return (
              <div className="flex items-center justify-between gap-2 px-1 -mt-0.5">
                <p className="text-[10px] text-primary">
                  Set {setNumber}: {logged.is_bodyweight
                    ? `${logged.reps_completed} reps · Bodyweight`
                    : `${logged.reps_completed} reps @ ${logged.weight_kg}kg`} ✓
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteSet(setNumber)}
                  className={`flex shrink-0 items-center gap-1 text-[10px] ${armed ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                  aria-label={armed ? `Confirm delete set ${setNumber}` : `Delete set ${setNumber}`}
                >
                  <Trash2 className="size-2.5" />
                  {armed ? 'Tap to confirm' : 'Delete'}
                </button>
              </div>
            )
          })()}
          {rowErrors[setNumber] && (
            <p className="text-[10px] text-destructive px-1 -mt-0.5">{rowErrors[setNumber]}</p>
          )}
          </React.Fragment>
        )
      })}
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

function getRepsColumnLabel(reps: string, prescriptionType?: string): string {
  switch (prescriptionType) {
    case 'time': return 'Hold'
    case 'distance_load': return 'Distance'
    case 'intervals': return 'Work'
    case 'reps': return 'Reps'
  }
  if (reps.includes('min')) return 'Duration'
  if (reps.endsWith('s')) return 'Time'
  if (reps.endsWith('m')) return 'Distance'
  return 'Reps'
}
