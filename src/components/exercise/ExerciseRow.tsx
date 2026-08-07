import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRightLeft, Ban, History, MoreVertical, ChevronDown } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { formatRampSets, formatCompletedSummary } from '@/lib/session-derive'
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

  // Collapsed rows hide loads entirely (turn 5) — a per-set dot ladder
  // stands in for "{sets}×{reps} + LoadChip", mint-filled+glowing for each
  // logged set index, muted otherwise.
  const dotLadder = (
    <div className="flex items-center gap-1 shrink-0">
      {Array.from({ length: ex.sets }, (_, i) => {
        const done = loggedSets.some(s => s.set_number === i + 1)
        return (
          <span
            key={i}
            aria-hidden
            className={`size-[6px] rounded-full ${done ? 'bg-primary glow-dot' : 'bg-muted-foreground/30'}`}
          />
        )
      })}
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
        {/* Collapsed: turn 5 hides loads on collapsed rows in favor of a
            set-completion dot ladder — the row itself is the affordance. */}
        {!expanded && dotLadder}
        {expanded && <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {ex.suggested_load_kg != null && (
                <div className="flex items-end gap-2 mb-1">
                  <span className="tabular-mono text-[54px] font-bold leading-none -tracking-[0.02em]">
                    {ex.suggested_load_kg}
                  </span>
                  <span className="text-xs text-text-tertiary pb-1.5">kg × {ex.reps}</span>
                </div>
              )}
              <LoadChip
                ex={ex}
                source={loadSource}
                explained={explainedLoadChip}
                onToggleExplain={() => setExplainedLoadChip(v => !v)}
                progressionNote={progressionNote}
              />
              {completedSets === 0 && ramp && <RampStrip ramp={ramp} />}
              {showCalibrationCue && <CalibrationCue hasLoad={ex.suggested_load_kg != null} />}
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
