import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRightLeft, Ban, MoreVertical, X } from 'lucide-react'
import { formatRampSets, groupExercises, type ExerciseGroup } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import { ExerciseLine, SectionLabel, sectionLabelFor } from './ExerciseLine'
import type { Exercise, WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §2.2 — one other day's content, in place, one tap, one
// tap back. Read-only for logging: no set grid, no logSet reachable
// (asserted structurally — this component never imports SetGrid or the
// hook's write facade). progressedLoads is suppressed by construction: the
// caller passes plan-derived loads only, never the today-only progression
// map, so a peeked day never shows a 'logged' provenance it hasn't earned.
// Swap/ban stay available (they're plan edits, not session acts) via
// callbacks — the confirm dialog itself is owned by the caller (ExerciseTab)
// and shared with the main day's rows.
//
// LOOKS LIKE TODAY, DELIBERATELY. This used to render a stack of raised
// cards with every exercise forced open — ramp box, RPE line, per-set chips,
// two always-visible icons — while today's list was hairline-separated bare
// lines with a tier label and a mono "3×6-8 · 42.5kg" summary. Same data,
// same app, two visual languages, and nothing about being read-only required
// the difference: it was markup duplication, not a real constraint. The
// collapsed line and the tier label now come from ExerciseLine, shared with
// today's rows so they cannot drift apart again. What stays different is
// only what genuinely differs — no set grid, no logged-set state, no
// calibration cue, no plate calculator.
// ---------------------------------------------------------------------------

export function PeekPanel({
  workout,
  onExit,
  onSwap,
  onBan,
  banBusyName,
}: {
  workout: WorkoutDay
  onExit: () => void
  onSwap: (exIndex: number, exerciseName: string) => void
  onBan: (exerciseName: string) => void | Promise<void>
  banBusyName: string | null
}) {
  const [explainedKey, setExplainedKey] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const groups = groupExercises(workout.exercises)
  const firstMainLiftGroupIndex = groups.findIndex(
    g => g.kind === 'single' && g.ex.tier === 'tier_1_primary'
  )

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
            {/* The ramp ladder is why a peeked day is worth opening at all —
                it is the safety-relevant half of the prescription, and it
                stays exactly as it was, just behind one tap now instead of
                always on screen. */}
            {ramp && <RampStrip ramp={ramp} />}
            <LoadChip
              ex={ex}
              source={loadSourceFor(ex)}
              explained={explainedKey === key}
              onToggleExplain={() => setExplainedKey(prev => (prev === key ? null : key))}
            />
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
    <div className="rounded-xl bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium">{workout.day} · {workout.focus}</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onExit} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      {/* Same list chrome as today's ExerciseList: hairline-separated rows in
          one column, not gap-separated cards. */}
      <div className="flex flex-col px-4 pb-2">
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
            {g.kind === 'single'
              ? renderRow(g.ex, g.exIndex)
              : g.members.map(m => renderRow(m.ex, m.exIndex, g.label))}
          </div>
        ))}
      </div>
    </div>
  )
}
