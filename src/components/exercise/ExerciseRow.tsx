import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowDown, ArrowRightLeft, ArrowUp, Ban, BookOpen, History, Info, MoreVertical, Trash2 } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseEntry, getExerciseId } from '@/lib/exercise-db'
import { formatRampSets, formatCompletedSummary, setProgress } from '@/lib/session-derive'
import { LoadChip, TempoChip, loadSourceLabel, type LoadSource } from './LoadChip'
import { ExerciseLine, StatusCircle } from './ExerciseLine'
import { isExternallyLoaded, isUnverifiedLoadSource, splitLoadDisplay, unloadedLoadLabel } from '@/lib/load-prescription'
import { AssistanceChip } from './AssistanceChip'
import { AddedLoadChip } from './AddedLoadChip'
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
  /**
   * Week 1 with nothing verified yet.
   *
   * SEPARATE FROM showCalibrationCue, which is true for exactly ONE row per
   * session (the anchor session-derive picks). The chip's wording has to be
   * the same on every row of the week or the session reads as if some lifts
   * were prescribed and others estimated.
   */
  isCalibrationWeek?: boolean
  /** The first session back after a break, with eased weights: the boxes ignore last time's numbers (layoff.ts). */
  easedForBreak?: boolean
  onOpenPlateCalc: (weightKg: number) => void
  onSwap: () => void
  onBan: () => void | Promise<void>
  banBusy: boolean
  onSetCompleted?: SetGridProps['onSetCompleted']
  expanded: boolean
  onToggleExpanded: () => void
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  /** Opens the technique panel — see ExerciseDetailDialog. */
  onOpenDetail?: (exerciseName: string) => void
  /** Take this one out of the session — opens the drop-or-swap sheet (Ashley's ruling, 11 Sep 2026). */
  onRemove?: () => void
  /** Reorder within the session. Disabled at the ends, where there is nowhere to go. */
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  /** Passed straight through to SetGrid, which needs it to judge a typed weight — see set-plausibility.ts. */
  profile?: SetGridProps['profile']
  /** Its place in today's session, printed "01" on the collapsed line (design handoff 2c). */
  index?: number
  /** "Main lift", "Primer", "Finisher", "Accessory" — the open card's eyebrow and the collapsed line's (2a). */
  sectionLabel?: string
  /** The first exercise with sets still to do: the open card says "now" and its circle glows. */
  isCurrent?: boolean
}

export function ExerciseRow({
  ex,
  dayName,
  supersetLabel,
  loadSource,
  progressionNote,
  showCalibrationCue,
  isCalibrationWeek,
  easedForBreak = false,
  onOpenPlateCalc,
  onSwap,
  onBan,
  banBusy,
  onSetCompleted,
  expanded,
  onToggleExpanded,
  onOpenHistory,
  onOpenDetail,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  profile,
  index,
  sectionLabel,
  isCurrent = false,
}: ExerciseRowProps) {
  const { logs, setsFor, requestedSetFocus, clearSetFocusRequest, date } = useActiveSession()
  const exerciseId = ex.id ?? getExerciseId(ex.name)
  const loggedSets = setsFor(exerciseId, ex.name)
  const completedSets = loggedSets.length
  const allSetsLogged = completedSets >= ex.sets
  // ONE DERIVATION, READ TWICE — the track here and the group headers in
  // SetGrid. Counting in both places is how two parts of one card end up
  // disagreeing about how far through the lifter is.
  const ramp = formatRampSets(ex)
  const rampProgress = setProgress(
    logs, exerciseId, ex.name,
    ramp && ramp.kind !== 'stale' ? ramp.sets.length : 0,
    ex.sets,
  )
  // DOES THIS MOVEMENT CARRY EXTERNAL LOAD AT ALL — the same predicate
  // SetGrid already uses for its weight column, read from the catalogue rather
  // than inferred from a null weight, because "no number yet" and "no number
  // ever" are different things and only one of them is worth saying.
  const catalogEntry = getExerciseEntry(ex.name)
  const carriesExternalLoad = catalogEntry ? isExternallyLoaded(catalogEntry) : true
  const hasLoadStatement = ex.suggested_load_kg != null || ex.suggested_assistance_kg != null || ex.suggested_added_load_kg != null
  // "Bodyweight" or "Band" — the word this movement's own equipment earns.
  const unloadedLabel = catalogEntry && !hasLoadStatement ? unloadedLoadLabel(catalogEntry) : null
  const [explainedLoadChip, setExplainedLoadChip] = useState(false)
  const [explainedPick, setExplainedPick] = useState(false)

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

  // "Is this number still a guess?" — true for both unverified states.
  // undefined is excluded deliberately: that means bodyweight, where there is
  // no load to be unsure about (isUnverifiedLoadSource treats undefined as
  // unverified for legacy JSONB rows, which is the opposite of what a
  // bodyweight row means here).
  const loadIsUnverified = loadSource != null && isUnverifiedLoadSource(loadSource)



  // THE RAMP'S FOLD, remembered per exercise for the session (2a): her own
  // choice, once she has made one (the grid opens it while a build-up row is
  // still to do). Kept outside the component, because the Exercise tab is not
  // kept mounted across a trip to Home.
  const rampKey = `${date}:${exerciseId}`
  const [rampChoice, setRampChoice] = useState<boolean | undefined>(() => rampFoldChoice.get(rampKey))
  useEffect(() => { setRampChoice(rampFoldChoice.get(rampKey)) }, [rampKey])
  const toggleRamp = (open: boolean) => { rampFoldChoice.set(rampKey, open); setRampChoice(open) }

  const menu = (
    <ExerciseMenu
      ex={ex}
      onOpenDetail={onOpenDetail}
      onOpenHistory={onOpenHistory ? () => onOpenHistory(exerciseId, ex.name) : undefined}
      onSwap={onSwap}
      onMove={onMove}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onRemove={onRemove}
      onBan={onBan}
      banBusy={banBusy}
    />
  )

  // THE LOAD, IN THE PLAN'S OWN UNIT ("72.5 kg", "14 kg per hand"): the string
  // formatLoad wrote, split rather than re-derived, so a per-hand number never
  // reads as a total. Bodyweight says so rather than saying nothing.
  const loadParts = ex.suggested_load ? splitLoadDisplay(ex.suggested_load) : null
  const loadText = ex.suggested_load_kg != null
    ? `${loadParts?.value ?? ex.suggested_load_kg} ${loadParts?.unit ?? 'kg'}`
    : ex.suggested_assistance_kg != null ? `${ex.suggested_assistance_kg} kg assist`
    : ex.suggested_added_load_kg != null ? `+${ex.suggested_added_load_kg} kg` : null

  if (!expanded) {
    // Collapsed: the shared line (also the peek's), a status circle, and the
    // same ⋮ as the open card — every change to an exercise lives in it (her
    // 14 Sep ruling), so it is on every row, not only the open one.
    return (
      <div data-exercise-name={ex.name} className={allSetsLogged ? 'opacity-80' : undefined}>
        <ExerciseLine
          ex={ex}
          supersetLabel={supersetLabel}
          loadSource={loadSource}
          expanded={false}
          onToggleExpanded={onToggleExpanded}
          allSetsLogged={allSetsLogged}
          loggedSummary={formatCompletedSummary(loggedSets)}
          index={index}
          // WORKING sets, the same count as the track: a ramp set logged is
          // not a set of the exercise done.
          setsDone={rampProgress.workingDone}
          progressing={progressionNote?.didProgress}
          eyebrow={sectionLabel && sectionLabel !== 'Accessory' ? sectionLabel : undefined}
          trailing={menu}
        />
      </div>
    )
  }

  // THE OPEN CARD (tab polish, Exercise 2a, 31 Oct 2026): a mint-edged card,
  // its header saying what the lift is and what is prescribed, one continuous
  // track (violet build-up, a gap, mint work), the folded ramp, the sets, and
  // "+ Add set". overflow-CLIP, not hidden (L27): a clipped box cannot be
  // scrolled sideways by the ⋮'s 44px tap area.
  const eyebrow = sectionLabel && sectionLabel !== 'Accessory' ? sectionLabel : null
  const state = allSetsLogged ? 'done' : isCurrent ? 'now' : null
  return (
    <div
      data-exercise-name={ex.name}
      data-exercise-open
      className="relative overflow-clip rounded-[20px] px-3 pb-2 pt-3.5"
      style={{ background: 'var(--surface-raised)', border: '1px solid rgba(var(--glow-rgb), .22)' }}
    >
      <div className="flex items-start gap-2.5">
        <StatusCircle done={completedSets} sets={ex.sets} current={isCurrent} />
        <div className="min-w-0 flex-1">
          {(eyebrow || state) && (
            <p className="text-[0.625rem] font-semibold uppercase tracking-[.12em] text-primary-text" data-testid="exercise-eyebrow">
              {[eyebrow, state].filter(Boolean).join(' · ')}
            </p>
          )}
          <ExerciseLine
            ex={ex}
            supersetLabel={supersetLabel}
            loadSource={loadSource}
            expanded
            onToggleExpanded={onToggleExpanded}
            allSetsLogged={allSetsLogged}
          />
          {/* WHAT IS PRESCRIBED, ONE MONO LINE: sets × reps · load · rest. Rest
              as visible TEXT, not only a prop into the grid (one-day-one-look
              §4b): it is what she reads before she has trained. */}
          <p className="mt-0.5 font-mono text-[0.75rem] text-muted-foreground" data-testid="exercise-meta">
            {ex.sets} × {ex.reps}
            {loadText && <> · <span data-testid="exercise-load">{loadText}</span></>}
            {unloadedLabel && <> · <span data-testid="bodyweight-load">{unloadedLabel}</span></>}
            {ex.rest && <> · rest <span className="tabular-mono">{ex.rest === 'alternate' ? 'alternate — no rest between' : ex.rest}</span></>}
          </p>
        </div>
        <div className="-mr-1 shrink-0">{menu}</div>
      </div>

      {/* ONE CONTINUOUS TRACK, RAMP THEN WORKING. Violet is the build-up, mint
          the work, the gap between them the only separator needed. The
          counts are said for a screen reader; the segments say them to the eye. */}
      {(rampProgress.rampTotal > 0 || rampProgress.workingTotal > 0) && (
        <div className="mt-3" data-testid="set-progress-track">
          <div className="flex items-center gap-[3px]" aria-hidden>
            {Array.from({ length: rampProgress.rampTotal }, (_, i) => (
              <span key={`r${i}`} className="h-1 flex-1 rounded-[2px]"
                style={{ background: i < rampProgress.rampDone ? 'var(--ramp-track-done)' : 'var(--ramp-track-pending)' }} />
            ))}
            {rampProgress.rampTotal > 0 && rampProgress.workingTotal > 0 && <span className="w-[4px] shrink-0" />}
            {Array.from({ length: rampProgress.workingTotal }, (_, i) => (
              <span key={`w${i}`} className="h-1 flex-1 rounded-[2px]"
                style={{ background: i < rampProgress.workingDone ? 'var(--working-track-done)' : 'var(--working-track-pending)' }} />
            ))}
          </div>
          <span className="sr-only">
            {rampProgress.rampTotal > 0 && <span data-testid="ramp-counter">Ramp {rampProgress.rampDone}/{rampProgress.rampTotal} </span>}
            <span data-testid="working-counter">Working {rampProgress.workingDone}/{rampProgress.workingTotal}</span>
          </span>
        </div>
      )}

      {/* WHY THIS NUMBER, AND WHERE IT CAME FROM — the chips that explain the
          load (start here / from your last session / per side), the tempo,
          the calibration cue and "why this exercise". Kept, quiet, under the
          track: the design draws none, and none of them may be lost. */}
      <div className="mt-2 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {ex.suggested_load_kg != null && loadSourceLabel(loadSource, isCalibrationWeek) && (
            <span className="text-[0.625rem] uppercase tracking-[.1em] text-muted-foreground">{loadSourceLabel(loadSource, isCalibrationWeek)}</span>
          )}
          <TempoChip ex={ex} />
          {ex.suggested_added_load_kg != null ? (
            <AddedLoadChip ex={ex} />
          ) : ex.suggested_assistance_kg != null ? (
            <AssistanceChip ex={ex} />
          ) : (
            <LoadChip
              ex={ex}
              source={loadSource}
              explained={explainedLoadChip}
              onToggleExplain={() => setExplainedLoadChip(v => !v)}
              progressionNote={progressionNote}
              calibration={isCalibrationWeek}
            />
          )}
        </div>
        {showCalibrationCue && <CalibrationCue hasLoad={ex.suggested_load_kg != null} atStatedLimit={ex.load_hold === 'stated_limit'} />}
        {ex.selection_note && (
          <div>
            <button
              type="button"
              onClick={() => setExplainedPick(v => !v)}
              aria-label="Why this exercise"
              className="inline-flex items-center gap-1 text-muted-foreground/60 hover:text-muted-foreground"
            >
              <Info className="size-2.5" />
              <span className="text-[0.5625rem] italic">why this exercise</span>
            </button>
            {explainedPick && (
              <p className="mt-0.5 text-[0.625rem] text-muted-foreground/80 italic max-w-xs">{ex.selection_note}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-1">
        <SetGrid
          exerciseName={ex.name}
          exerciseId={exerciseId}
          totalSets={ex.sets}
          prescribedReps={ex.reps}
          prescriptionType={ex.prescription_type}
          restTime={ex.rest}
          insideSuperset={!!supersetLabel}
          tier={ex.tier}
          suggestedLoadKg={ex.suggested_load_kg}
          loadUnitLabel={loadParts?.unit}
          perSetLoadKg={ex.per_set_load?.map(s => s.load_kg)}
          loadIsEstimate={loadIsUnverified}
          // Derived ONCE, above, and passed down: formatRampSets is the one
          // place percentages become kilos.
          rampSets={ramp && ramp.kind !== 'stale' ? ramp.sets.map(r => ({ setNumber: r.setNumber, kg: 'kg' in r ? r.kg : undefined, reps: r.reps })) : undefined}
          rampKind={ramp?.kind}
          calibration={isCalibrationWeek}
          ignoreLastTime={easedForBreak}
          profile={profile}
          // THE PLATE BUTTON LIVES IN EACH WEIGHT BOX (2a), and only on a
          // movement with plates: the "Plate calculator" link left the footer.
          onOpenPlateCalc={(carriesExternalLoad || hasLoadStatement) ? onOpenPlateCalc : undefined}
          onSetCompleted={onSetCompleted}
          rampOpen={rampChoice}
          onToggleRamp={toggleRamp}
        />
      </div>
    </div>
  )
}

/** Which exercises had their ramp folded or opened by hand, this session. */
const rampFoldChoice = new Map<string, boolean>()

/**
 * EVERY CHANGE TO AN EXERCISE LIVES IN ONE MENU — Ashley's ruling, 14 Sep
 * 2026, from three options: all of them behind the ⋮, over making them all
 * inline and over keeping Swap in both places. Runs cheap to expensive: swap
 * keeps the slot, moving keeps everything, taking out loses the slot today,
 * and the ban rewrites every week — so only the ban is styled destructive.
 * "How to do it" leads: mid-set, "how does this go?" is the commoner question.
 */
function ExerciseMenu({ ex, onOpenDetail, onOpenHistory, onSwap, onMove, canMoveUp, canMoveDown, onRemove, onBan, banBusy }: {
  ex: Exercise
  onOpenDetail?: (exerciseName: string) => void
  onOpenHistory?: () => void
  onSwap: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onRemove?: () => void
  onBan: () => void | Promise<void>
  banBusy: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="hit-slop-44 size-7 shrink-0" aria-label="Exercise options">
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onOpenDetail && (
          <DropdownMenuItem onClick={() => onOpenDetail(ex.name)}>
            <BookOpen className="size-3.5" />
            How to do it
          </DropdownMenuItem>
        )}
        {onOpenHistory && (
          <DropdownMenuItem onClick={onOpenHistory}>
            <History className="size-3.5" />
            History
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onSwap} data-testid="swap-exercise">
          <ArrowRightLeft className="size-3.5" />
          Swap exercise
        </DropdownMenuItem>
        {onMove && (
          <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)} data-testid="move-up">
            <ArrowUp className="size-3.5" />
            Move earlier
          </DropdownMenuItem>
        )}
        {onMove && (
          <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)} data-testid="move-down">
            <ArrowDown className="size-3.5" />
            Move later
          </DropdownMenuItem>
        )}
        {onRemove && (
          <DropdownMenuItem onClick={onRemove} data-testid="remove-exercise">
            <Trash2 className="size-3.5" />
            Take out of this session
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" disabled={banBusy} onClick={onBan} data-testid="ban-exercise">
          <Ban className="size-3.5" />
          {banBusy ? 'Banning…' : 'Ban exercise'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
