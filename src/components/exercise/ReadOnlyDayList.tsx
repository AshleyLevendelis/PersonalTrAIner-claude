import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRightLeft, BookOpen, Ban, History, Info, MoreVertical } from 'lucide-react'
import { formatRampSets, groupExercises, mainLiftGroupIndex, type ExerciseGroup } from '@/lib/session-derive'
import { getExerciseId } from '@/lib/exercise-db'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import { ExerciseLine, SectionLabel, sectionLabelFor } from './ExerciseLine'
import { SupersetShell } from './SupersetGroup'
import type { Exercise, WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// ONE DAY, READ-ONLY — the list every surface that is NOT today renders
// through. Extracted from PeekPanel on 31 Aug 2026, when Ashley found the
// third surface still wearing the old clothes: "in exercise under see full
// program the app looks completely different to the exercise section."
//
// THIS IS THE SAME LESSON, LEARNED A THIRD TIME. PeekPanel used to render
// raised cards while today rendered hairline-separated lines; that was fixed
// by sharing ExerciseLine, and its header comment promised the two "cannot
// drift apart again". They didn't — but the PROGRAM view never got the fix at
// all, and it was still a <Table> with Exercise / Sets / Reps / Rest columns.
// Sharing the ROW was never enough: the row was the small half. What made the
// screens look like different apps was everything around it — the chrome, the
// section labels, the superset shell, whether a day is a table or a list.
//
// So this component owns the whole day, not a row of it. A fourth surface
// gets it by calling this; there is no longer a version of "render a day"
// that a new screen could reimplement by accident.
//
// READ-ONLY FOR LOGGING, by construction: it never imports SetGrid or the
// session hook's write facade, so no browse surface can grow a set grid
// without that import appearing in a diff. Swap and ban stay available —
// they are plan edits, not session acts — and the confirm dialogs belong to
// the caller, shared with today's rows.
// ---------------------------------------------------------------------------

export interface ReadOnlyDayListProps {
  workout: WorkoutDay
  onSwap: (exIndex: number, exerciseName: string) => void
  onBan: (exerciseName: string) => void | Promise<void>
  /** The same technique panel today's rows open — one dialog, several entry points. */
  onOpenDetail?: (exerciseName: string) => void
  /**
   * Only the program view offers history today. Optional rather than always
   * on, because a menu item that does nothing is worse than an absent one —
   * and the peek panel has no history dialog wired to it.
   */
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  banBusyName: string | null
  /** Extra classes for the list wrapper — the two callers pad differently. */
  className?: string
}

export function ReadOnlyDayList({
  workout,
  onSwap,
  onBan,
  onOpenDetail,
  onOpenHistory,
  banBusyName,
  className,
}: ReadOnlyDayListProps) {
  const [explainedKey, setExplainedKey] = useState<string | null>(null)
  // WHY THIS EXERCISE, on the browse surface too. Separate from explainedKey
  // above, which explains the WEIGHT — two different questions, and a shared
  // key would make opening one close the other.
  //
  // VISION.md calls the rationale "the clearest signal that a coach designed
  // the session rather than a filter". It shipped on today's session rows
  // (ExerciseRow) and never here, so the whole Full Program view — the one
  // place you go to understand the SHAPE of the plan — showed none of it.
  // Measured across a 64-plan sweep: 4,292 of 24,592 exercise slots (17.5%)
  // carry a note, in 60 of the 64 plans. All of it was invisible while
  // browsing.
  //
  // Exactly the asymmetry that made "How to do it" dead on the session
  // screen, in the other direction — which is what this file's own header
  // warns about: sharing the row was never enough.
  const [explainedPickKey, setExplainedPickKey] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const groups = groupExercises(workout.exercises)
  // Via the shared helper, which falls back to the day's hardest standalone
  // movement when the day has no tier-1 at all — 37.5% of generated days, and
  // every one of them on bodyweight or minimalist.
  const firstMainLiftGroupIndex = mainLiftGroupIndex(groups, workout.exercises)

  // Browse surfaces never see 'logged' provenance — that requires the live
  // progression engine, which only runs for today's session (§2.2). Both
  // callers previously derived this identically; now they cannot disagree.
  const loadSourceFor = (ex: Exercise): LoadSource | undefined =>
    ex.suggested_load_kg == null ? undefined : (ex.load_source ?? 'estimate')

  const renderRow = (ex: Exercise, exIndex: number, supersetLabel?: string) => {
    const key = `${exIndex}:${ex.name}`
    const expanded = expandedKey === key
    const ramp = formatRampSets(ex)
    return (
      <div key={key} className="space-y-2">
        <ExerciseLine
          ex={ex}
          supersetLabel={supersetLabel}
          loadSource={loadSourceFor(ex)}
          expanded={expanded}
          onToggleExpanded={() => setExpandedKey(prev => (prev === key ? null : key))}
          trailing={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Exercise options">
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
                  <DropdownMenuItem onClick={() => onOpenHistory(ex.id ?? getExerciseId(ex.name), ex.name)}>
                    <History className="size-3.5" />
                    Past sessions
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onSwap(exIndex, ex.name)}>
                  <ArrowRightLeft className="size-3.5" />
                  Swap exercise
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={banBusyName === ex.name} onClick={() => onBan(ex.name)}>
                  <Ban className="size-3.5" />
                  {banBusyName === ex.name ? 'Removing…' : 'Never show this again'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        {expanded && (
          <div className="space-y-1.5">
            {/* The ramp ladder is why a day is worth opening at all — it is
                the safety-relevant half of the prescription, behind one tap
                rather than always on screen. */}
            {ramp && <RampStrip ramp={ramp} />}
            <LoadChip
              ex={ex}
              source={loadSourceFor(ex)}
              explained={explainedKey === key}
              onToggleExplain={() => setExplainedKey(prev => (prev === key ? null : key))}
            />
            {/* REST, which no browse surface showed at all. ExerciseLine's
                summary carries sets×reps · load · assist · tempo and stops
                there, so the rest prescription existed only inside a live
                session, as the timer's duration.
                That is a real gap: this repo treats rest as safety-relevant
                enough to have a hard floor per goal, and Ashley's 3 Sep 2026
                ruling — two minutes on a loaded main lift, conditioning keeps
                90 seconds — was invisible on the one screen where you would
                go to check it. (The handover even told her to verify it on
                the Full Program screen, which could not be done.)
                In the expanded body rather than the summary line, for the
                same reason the ramp ladder is: it is worth one tap, and the
                collapsed row is already dense. */}
            {ex.rest && (
              <p className="text-[0.625rem] text-muted-foreground">
                Rest <span className="tabular-mono">{ex.rest === 'alternate' ? 'alternate — no rest between' : ex.rest}</span>
              </p>
            )}
            {/* Same control, same words and same behaviour as today's rows in
                ExerciseRow.tsx — a note that reads one way on one screen and
                another way on the next is the drift this file exists to stop. */}
            {ex.selection_note && (
              <div>
                <button
                  type="button"
                  onClick={() => setExplainedPickKey(prev => (prev === key ? null : key))}
                  aria-label="Why this exercise"
                  className="inline-flex items-center gap-1 text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <Info className="size-2.5" />
                  <span className="text-[0.5625rem] italic">why this exercise</span>
                </button>
                {explainedPickKey === key && (
                  <p className="mt-0.5 text-[0.625rem] text-muted-foreground/80 italic max-w-xs">{ex.selection_note}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const isGroupExpanded = (g: ExerciseGroup) =>
    g.kind === 'single'
      ? expandedKey === `${g.exIndex}:${g.ex.name}`
      : g.members.some(m => expandedKey === `${m.exIndex}:${m.ex.name}`)

  return (
    // Same list chrome as today's ExerciseList: hairline-separated rows in one
    // column, not gap-separated cards and not a data table.
    <div className={`flex flex-col ${className ?? ''}`}>
      {groups.map((g, i) => (
        <div
          key={i}
          className="flex flex-col gap-2.5 py-3"
          style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
        >
          <SectionLabel
            text={sectionLabelFor(g, i === firstMainLiftGroupIndex)}
            expanded={isGroupExpanded(g)}
          />
          {/* Via the SAME shell today's supersets use — the rail, the A1/A2
              labels, and the "alternate — no rest between" instruction. That
              last one is an instruction, not decoration. */}
          {g.kind === 'single'
            ? renderRow(g.ex, g.exIndex)
            : (
              <SupersetShell
                label={g.label}
                count={g.members.length}
                renderMember={(idx, memberLabel) => renderRow(g.members[idx].ex, g.members[idx].exIndex, memberLabel)}
              />
            )}
        </div>
      ))}
    </div>
  )
}
