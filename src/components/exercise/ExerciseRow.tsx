import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRightLeft, Ban, MoreVertical, ChevronDown } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { formatRampSets } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import { CalibrationCue } from './CalibrationCue'
import { SetGrid, type SetGridProps } from './SetGrid'
import type { Exercise, ExerciseSetLog } from '@/lib/types'

// ---------------------------------------------------------------------------
// The repeated unit for the today view's exercise list (LAYOUT-DESIGN.md
// §1.6): name + count badge, ramp strip (safety-critical, never
// collapsible), load chip + provenance, an optional calibration cue, then
// the set grid. Collapsed by default (controlled from TodayPanel's
// ExerciseList, which knows the whole day's completion state and picks the
// first incomplete exercise to auto-expand — a single row can't know that
// on its own). Swap/ban now live behind the row's `⋯` overflow menu
// (LAYOUT-DESIGN.md §4.1) instead of two always-visible icons.
// ---------------------------------------------------------------------------

/** "30kg × 11, 11, 10" for a flat-weight exercise; groups consecutive
 * same-weight sets (ramps) into "25kg × 12 · 30kg × 8"-style segments;
 * "Bodyweight × 11, 11, 10" when nothing was loaded. */
function formatCompletedSummary(sets: ExerciseSetLog[]): string {
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number)
  if (ordered.every(s => s.is_bodyweight)) {
    return `Bodyweight × ${ordered.map(s => s.reps_completed).join(', ')}`
  }
  const groups: { weight: number; reps: number[] }[] = []
  for (const s of ordered) {
    const last = groups[groups.length - 1]
    if (last && last.weight === s.weight_kg) last.reps.push(s.reps_completed)
    else groups.push({ weight: s.weight_kg, reps: [s.reps_completed] })
  }
  return groups.map(g => `${g.weight}kg × ${g.reps.join(', ')}`).join(' · ')
}

export interface ExerciseRowProps {
  ex: Exercise
  dayName: string
  supersetLabel?: string
  loadSource: LoadSource | undefined
  progressionNote?: { note: string; didProgress: boolean }
  showCalibrationCue?: boolean
  onOpenPlateCalc: (weightKg: number) => void
  onSwap: () => void
  onBan: () => void | Promise<void>
  banBusy: boolean
  onSetCompleted?: SetGridProps['onSetCompleted']
  onFirstEverLog?: SetGridProps['onFirstEverLog']
  expanded: boolean
  onToggleExpanded: () => void
}

export function ExerciseRow({
  ex,
  dayName,
  supersetLabel,
  loadSource,
  progressionNote,
  showCalibrationCue,
  onOpenPlateCalc,
  onSwap,
  onBan,
  banBusy,
  onSetCompleted,
  onFirstEverLog,
  expanded,
  onToggleExpanded,
}: ExerciseRowProps) {
  const { setsFor, requestedSetFocus, clearSetFocusRequest } = useActiveSession()
  const exerciseId = ex.id ?? getExerciseId(ex.name)
  const loggedSets = setsFor(exerciseId, ex.name)
  const completedSets = loggedSets.length
  const allSetsLogged = completedSets >= ex.sets
  const ramp = formatRampSets(ex)
  const [explainedLoadChip, setExplainedLoadChip] = useState(false)

  // BottomDock's "Start next set" action, from a different subtree, routes
  // through this shared request rather than a prop — force-expand (the same
  // way a manual toggle would) then focus the target set's weight input
  // once it has painted.
  useEffect(() => {
    if (!requestedSetFocus || requestedSetFocus.exerciseName !== ex.name) return
    if (!expanded) {
      onToggleExpanded()
      return
    }
    const id = `setgrid-weight-${exerciseId}-${requestedSetFocus.setNumber}`
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.focus()
      clearSetFocusRequest()
    })
    return () => cancelAnimationFrame(raf)
  }, [requestedSetFocus, expanded, ex.name, exerciseId, onToggleExpanded, clearSetFocusRequest])

  const nameLine = (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {supersetLabel && (
        <span className="shrink-0 font-mono text-[10px] font-semibold text-primary glow-mint">{supersetLabel}</span>
      )}
      <span
        className={`truncate ${expanded ? 'text-[17px] font-semibold' : 'text-[14.5px] font-medium'} ${
          allSetsLogged ? 'line-through text-muted-foreground' : ''
        }`}
      >
        {ex.name}
      </span>
    </div>
  )

  // Density pass 3b "Borderless": the active (expanded) exercise is no longer
  // a bordered card — it separates by a swept mint hairline along its top edge
  // plus its own type scale. Collapsed rows are bare lines on the canvas, so
  // the list reads as a rhythm of names rather than a stack of boxes. That is
  // where the ~10% row-width gain comes from: no border, no card padding.
  return (
    <div
      className={
        expanded
          ? 'relative overflow-hidden rounded-[18px] pt-4 space-y-2.5'
          : `rounded-[10px] space-y-2 ${allSetsLogged ? 'opacity-70' : ''}`
      }
    >
      {expanded && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px glow-sweep"
          style={{ background: 'linear-gradient(90deg, rgba(91,233,194,0), rgba(91,233,194,.9), rgba(91,233,194,0))' }}
        />
      )}
      {/* A plain div, not a <button> — LoadChip renders its own interactive
          "why this weight" button below, and a button can't legally contain
          another button (the browser silently splits/corrupts the DOM when
          it tries, which reads as "nothing ever expands"). role="button" +
          tabIndex + Enter/Space keeps this a real, keyboard-operable control. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
        className="w-full text-left flex items-baseline justify-between gap-2.5 cursor-pointer"
      >
        <div className="min-w-0 flex-1 space-y-1">
          {nameLine}
          {(expanded || allSetsLogged || completedSets > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              {expanded && <span className="text-xs text-text-tertiary">{ex.sets}×{ex.reps}</span>}
              {allSetsLogged ? (
                <span className="text-xs text-primary glow-mint">{formatCompletedSummary(loggedSets)}</span>
              ) : completedSets > 0 ? (
                <span className="font-mono text-[10px] text-muted-foreground">{completedSets}/{ex.sets} sets</span>
              ) : null}
            </div>
          )}
        </div>
        {/* Collapsed: prescription + load ride on the right as one muted line
            (3b), replacing the chevron — the row itself is the affordance. */}
        {!expanded && (
          <div className="flex shrink-0 items-baseline gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">{ex.sets}×{ex.reps}</span>
            <LoadChip
              ex={ex}
              source={loadSource}
              explained={false}
              onToggleExplain={() => {}}
              progressionNote={undefined}
            />
          </div>
        )}
        {expanded && <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <LoadChip
                ex={ex}
                source={loadSource}
                explained={explainedLoadChip}
                onToggleExplain={() => setExplainedLoadChip(v => !v)}
                progressionNote={progressionNote}
              />
              {ramp && <RampStrip ramp={ramp} />}
              {showCalibrationCue && <CalibrationCue hasLoad={ex.suggested_load_kg != null} />}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Exercise options">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSwap}>
                  <ArrowRightLeft className="size-3.5" />
                  Swap exercise
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={banBusy} onClick={onBan}>
                  <Ban className="size-3.5" />
                  {banBusy ? 'Banning…' : 'Ban exercise'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <SetGrid
            exerciseName={ex.name}
            exerciseId={exerciseId}
            totalSets={ex.sets}
            prescribedReps={ex.reps}
            prescriptionType={ex.prescription_type}
            restTime={ex.rest}
            tier={ex.tier}
            suggestedLoadKg={ex.suggested_load_kg}
            perSetLoadKg={ex.per_set_load?.map(s => s.load_kg)}
            loadIsEstimate={loadSource === 'estimate'}
            onOpenPlateCalc={onOpenPlateCalc}
            onSetCompleted={onSetCompleted}
            onFirstEverLog={onFirstEverLog}
          />
        </>
      )}
    </div>
  )
}
