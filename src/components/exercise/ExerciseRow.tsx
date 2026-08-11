import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Ban, History, MoreVertical, ChevronDown } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { formatRampSets, formatCompletedSummary } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, loadSourceLabel, type LoadSource } from './LoadChip'
import { AssistanceChip } from './AssistanceChip'
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
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
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
  onOpenHistory,
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
        className={`truncate ${expanded ? 'text-[19px] font-semibold' : 'text-[15.5px] font-medium'} ${
          allSetsLogged ? 'line-through text-muted-foreground' : ''
        } ${!expanded && loadSource === 'estimate' ? 'border-b border-dotted border-muted-foreground/50' : ''}`}
      >
        {ex.name}
      </span>
    </div>
  )

  // Tab-restructure handoff — collapsed rows go back to a mono
  // "{sets}×{reps} · {load}kg" summary + chevron, matching the meal-slot
  // idiom (MealPlan's collapsed row: kcal text + chevron) instead of turn
  // 5's dot ladder.
  const collapsedSummary = allSetsLogged ? (
    <span className="tabular-mono text-xs text-primary glow-mint">✓ {formatCompletedSummary(loggedSets)}</span>
  ) : (
    <span className="tabular-mono text-xs text-muted-foreground">
      {ex.sets}×{ex.reps}
      {ex.suggested_load_kg != null ? ` · ${ex.suggested_load_kg}kg` : ''}
      {ex.suggested_assistance_kg != null ? ` · ${ex.assistance_ready_to_graduate ? 'no assist' : `${ex.suggested_assistance_kg}kg assist`}` : ''}
    </span>
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
          style={{ background: 'linear-gradient(90deg, rgba(var(--glow-rgb),0), rgba(var(--glow-rgb),.9), rgba(var(--glow-rgb),0))' }}
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
          {expanded && completedSets > 0 && !allSetsLogged && (
            <span className="font-mono text-[10px] text-muted-foreground">{completedSets}/{ex.sets} sets</span>
          )}
        </div>
        {!expanded && (
          <span className="flex shrink-0 items-center gap-1">
            {collapsedSummary}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        )}
      </div>

      {expanded && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {ex.suggested_load_kg != null && (
                <div className="flex items-end gap-2">
                  <span className="tabular-mono ds-num-lg leading-none">{ex.suggested_load_kg}</span>
                  <span className="text-xs text-text-tertiary pb-0.5">kg</span>
                </div>
              )}
              {ex.suggested_assistance_kg != null && (
                <div className="flex items-end gap-2">
                  <span className="tabular-mono ds-num-lg leading-none">{ex.suggested_assistance_kg}</span>
                  <span className="text-xs text-text-tertiary pb-0.5">kg assist</span>
                </div>
              )}
              {ex.suggested_load_kg != null && loadSourceLabel(loadSource) && (
                <p className="text-[10px] uppercase tracking-[.1em] text-muted-foreground">{loadSourceLabel(loadSource)}</p>
              )}
              <div className="mt-1.5">
                {ex.suggested_assistance_kg != null ? (
                  <AssistanceChip ex={ex} />
                ) : (
                  <LoadChip
                    ex={ex}
                    source={loadSource}
                    explained={explainedLoadChip}
                    onToggleExplain={() => setExplainedLoadChip(v => !v)}
                    progressionNote={progressionNote}
                  />
                )}
              </div>
              {completedSets === 0 && ramp && <RampStrip ramp={ramp} />}
              {showCalibrationCue && <CalibrationCue hasLoad={ex.suggested_load_kg != null} />}
              <p className="mt-2 text-xs text-text-tertiary">
                {ex.sets} working sets · {completedSets} logged
              </p>
              <div className="mt-1.5 flex items-center gap-3.5">
                <button type="button" className="text-xs font-semibold text-primary" onClick={onSwap}>
                  Swap exercise
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground"
                  onClick={() => onOpenPlateCalc(ex.suggested_load_kg ?? 0)}
                >
                  Plate calculator
                </button>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Exercise options">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onOpenHistory && (
                  <DropdownMenuItem onClick={() => onOpenHistory(exerciseId, ex.name)}>
                    <History className="size-3.5" />
                    History
                  </DropdownMenuItem>
                )}
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
