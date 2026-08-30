import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRightLeft, BookOpen, Ban, MoreVertical, X } from 'lucide-react'
import { formatRampSets, groupExercises, mainLiftGroupIndex, type ExerciseGroup } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import { ExerciseLine, SectionLabel, sectionLabelFor } from './ExerciseLine'
import { SupersetShell } from './SupersetGroup'
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
  onOpenDetail,
  banBusyName,
}: {
  workout: WorkoutDay
  onExit: () => void
  onSwap: (exIndex: number, exerciseName: string) => void
  onBan: (exerciseName: string) => void | Promise<void>
  /** Same technique panel the day view opens — one dialog, two entry points. */
  onOpenDetail?: (exerciseName: string) => void
  banBusyName: string | null
}) {
  const [explainedKey, setExplainedKey] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const groups = groupExercises(workout.exercises)
  // Via the shared helper, which falls back to the day's hardest standalone
  // movement when the day has no tier-1 at all — 37.5% of generated days, and
  // every one of them on bodyweight or minimalist. Both screens had their own
  // copy of the tier-1 findIndex; that duplication is the same shape that let
  // this panel's superset chrome drift until a screenshot caught it.
  const firstMainLiftGroupIndex = mainLiftGroupIndex(groups, workout.exercises)

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
      {/* THE SAME HERO AS TODAY, and deliberately so.
       *
       * This was one small line — "Friday · Full Body Power" at text-sm —
       * while today's screen gave the focus a 36px bold headline. Ashley's
       * ask: "I want all days to look like that, but still make it obvious
       * which is the current day's plan." A day's focus is the one thing
       * that tells you what the session IS; it should read the same on
       * Friday as it does on Wednesday.
       *
       * WHAT STILL SEPARATES TODAY, now that the type matches — three
       * things, none of them the headline:
       *   1. the eyebrow. Today's reads "Today · Wednesday" in mint with a
       *      glow; a peeked day reads just "Friday", muted and unglowing.
       *      Same slot, same size, deliberately different colour, so the
       *      distinction sits exactly where the eye already goes.
       *   2. today has Start session. A peeked day has an X.
       *   3. today has the session-progress line under the title. A day
       *      that is not today has no progress to show.
       *
       * Kept a touch smaller than today's 36px (30px): identical size with
       * a different colour reads as a bug, whereas a clear step down reads
       * as a deliberate hierarchy — today first, this second. */}
      <div className="flex items-start justify-between gap-2.5 px-4 pt-3.5 pb-3 border-b">
        <div className="min-w-0">
          <span className="text-[0.65625rem] uppercase tracking-[.2em] text-muted-foreground">
            {workout.day}
          </span>
          <p className="mt-1.5 text-[1.875rem] font-bold leading-[1.05] tracking-[-.03em]">{workout.focus}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onExit} aria-label="Close">
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
            {/* Via the SAME shell today's supersets use. This used to map the
                members into two bare rows both badged with the group letter
                — no rail, no A1/A2, and no "alternate — no rest between".
                That last one is an instruction, not decoration: a peeked day
                was showing the two exercises without saying they alternate.
                The header comment above promises these two surfaces cannot
                drift because ExerciseLine is shared; that was true of the row
                and false of everything around it. */}
            {g.kind === 'single'
              ? renderRow(g.ex, g.exIndex)
              : (
                <SupersetShell
                  label={g.label}
                  count={g.members.length}
                  renderMember={(i, memberLabel) => renderRow(g.members[i].ex, g.members[i].exIndex, memberLabel)}
                />
              )}
          </div>
        ))}
      </div>
    </div>
  )
}
