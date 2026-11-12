import { Check } from 'lucide-react'
import { isUnverifiedLoadSource, unloadedLoadLabel } from '@/lib/load-prescription'
import { getExerciseEntry } from '@/lib/exercise-db'
import { exerciseLoadBadge, exerciseLegend } from '@/lib/exercise-week'
import { LoadBadgeView, SetBar, SetLegend } from './ExerciseBar'
import type { LoadSource } from './LoadChip'
import type { Exercise } from '@/lib/types'
import { formatRampSets, type ExerciseGroup } from '@/lib/session-derive'

// ---------------------------------------------------------------------------
// The collapsed exercise line, shared by today's list and the upcoming-day
// peek so the two cannot drift apart.
//
// Extracted because they HAD drifted: today's day rendered as hairline-
// separated bare lines with a tier label and a mono "3×6-8 · 42.5kg" summary,
// while a peeked day rendered as a stack of raised cards with everything
// forced open — ramp box, RPE, per-set chips, two always-visible icons. Same
// data, same app, two visual languages, and the difference was pure markup
// duplication rather than any real difference in what the surfaces know.
//
// Deliberately knows NOTHING about the live session: no useActiveSession, no
// SetGrid, no logSet. That is what lets the peek use it without breaking its
// own structural read-only guarantee (see PeekPanel's header). Today's row
// passes its session-derived values IN — `loggedSummary` for the "✓ 3×8 @
// 40kg" replacement, `allSetsLogged` for the struck-through treatment.
// ---------------------------------------------------------------------------

export function ExerciseLine({
  ex,
  supersetLabel,
  loadSource,
  expanded,
  onToggleExpanded,
  allSetsLogged = false,
  loggedSummary,
  trailing,
  setsDone,
  progressing,
  eyebrow,
  rampDone = 0,
}: {
  ex: Exercise
  supersetLabel?: string
  loadSource: LoadSource | undefined
  expanded: boolean
  onToggleExpanded: () => void
  /** Today only — a peeked day has no logged sets by definition. */
  allSetsLogged?: boolean
  /** Today only — replaces the sets×reps summary once every set is in. */
  loggedSummary?: string
  /** Right-hand controls that sit outside the tap target (the `⋮` menu). */
  trailing?: React.ReactNode
  /** Its place in the day, "01" (design handoff 2c). */
  index?: number
  /** Today only: working sets logged — the status circle. Absent on a peek, which draws none. */
  setsDone?: number
  /** Today only: the load went up from last session (the row's own progression note). */
  progressing?: boolean
  /** "Main lift", "Primer" — the small label over a collapsed row (2a), where it says something. */
  eyebrow?: string
  /** Today only: warm-up rows logged, for the violet half of the set bar. */
  rampDone?: number
}) {
  const loadIsUnverified = loadSource != null && isUnverifiedLoadSource(loadSource)

  const done = Math.max(0, Math.min(setsDone ?? 0, ex.sets))
  // THE ROW'S LOAD, SET BAR AND LEGEND (Exercise Week, 12 Nov 2026): the load on the right in its own unit with its
  // qualifier, one segment per set under the name, and what the segments are. Read off the plan; a peeked day has
  // nothing logged, so its bar is all to do.
  const entry = getExerciseEntry(ex.name)
  const hasLoadStatement = ex.suggested_load_kg != null || ex.suggested_assistance_kg != null || ex.suggested_added_load_kg != null
  const badge = exerciseLoadBadge(ex, entry && !hasLoadStatement ? unloadedLoadLabel(entry) : null)
  const ramp = formatRampSets(ex)
  const rampTotal = ramp && ramp.kind !== 'stale' ? ramp.sets.length : 0
  const legend = exerciseLegend(ex, rampTotal)
  const mainLift = eyebrow === 'Main lift'

  if (expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
        className="hit-slop-44 mt-[3px] flex min-w-0 cursor-pointer items-center gap-2 text-left"
      >
        {supersetLabel && <span className="shrink-0 font-mono text-[0.625rem] font-semibold text-primary-text glow-mint">{supersetLabel}</span>}
        <span className={`text-[1.0625rem] font-bold tracking-[-.01em] ${allSetsLogged ? 'line-through text-muted-foreground' : ''}`}>{ex.name}</span>
      </div>
    )
  }

  // A HAIRLINE ROW (Exercise Week X1, 12 Nov 2026): the status circle, the tag over the name, the load on the right,
  // then the set bar and its legend. The ⋮ sits outside the tap target, as it always has (his 14 Sep "all of them
  // behind the ⋮").
  return (
    <div className="flex items-start gap-1.5 py-3">
      {/* A plain div, not a <button> — a button may not legally contain the
          buttons a row can grow. role="button" + tabIndex + Enter/Space keeps
          this a real, keyboard-operable control. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
        className="hit-slop-44 flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
      >
        {setsDone != null && <StatusCircle done={done} sets={ex.sets} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              {eyebrow && (
                <span className={`block text-[0.65625rem] font-semibold uppercase tracking-[.12em] ${mainLift ? 'text-primary-text' : 'text-muted-foreground'}`} data-testid="exercise-eyebrow">{eyebrow}</span>
              )}
              <span className="flex items-center gap-2">
                {supersetLabel && <span className="shrink-0 font-mono text-[0.625rem] font-semibold text-primary-text glow-mint">{supersetLabel}</span>}
                {/* TWO LINES, NOT ONE HARD CUT — "you can't see the exercises until
                    you click into it" (Ashley, from a phone): a name is the row. */}
                <span
                  className={`line-clamp-2 text-[0.96875rem] font-semibold leading-[1.3] ${allSetsLogged ? 'text-text-tertiary' : ''} ${loadIsUnverified ? 'border-b border-dotted border-muted-foreground/50' : ''}`}
                >
                  {ex.name}
                </span>
              </span>
            </span>
            {badge && <LoadBadgeView badge={badge} progressing={progressing} />}
          </span>
          <SetBar className="mt-2.5" rampTotal={rampTotal} rampDone={rampDone} workingTotal={ex.sets} workingDone={done} />
          {/* A FINISHED ROW KEEPS ITS LEGEND (the handoff's X1b): its bar is full and its circle ticked; what was lifted is
              on the card and in the history. */}
          <SetLegend className="mt-1.5" warmups={legend.warmups} dose={legend.dose} word={legend.word} />
        </span>
      </div>
      {trailing && <div className="shrink-0 -mr-1">{trailing}</div>}
    </div>
  )
}

/**
 * The status circle (2a): a faint ring with nothing done, a mint arc filling
 * as working sets land, filled with a tick when they all have; the set to do
 * now wears a glowing ring. Its spoken label says the count.
 */
export function StatusCircle({ done, sets, current = false }: { done: number; sets: number; current?: boolean }) {
  const d = Math.max(0, Math.min(done, sets))
  const complete = sets > 0 && d >= sets
  const share = sets > 0 ? d / sets : 0
  return (
    <span
      role="img"
      aria-label={`${d} of ${sets} sets logged`}
      data-set-dots
      data-status={complete ? 'done' : d > 0 ? 'part' : current ? 'now' : 'none'}
      className="mt-px flex size-[26px] shrink-0 items-center justify-center rounded-full"
      style={complete
        ? { background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))', color: 'var(--primary-foreground)' }
        : d > 0
          ? { background: `conic-gradient(var(--primary) ${share * 360}deg, color-mix(in srgb, var(--foreground) 22%, transparent) 0)`, WebkitMask: 'radial-gradient(circle, transparent 10px, #000 10.5px)', mask: 'radial-gradient(circle, transparent 10px, #000 10.5px)' }
          : current
            ? { boxShadow: 'inset 0 0 0 2px var(--primary), 0 0 10px rgba(var(--glow-rgb), .5)' }
            : { boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--foreground) 22%, transparent)' }}
    >
      {complete && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
    </span>
  )
}

/**
 * The uppercase tier label above each row ("Primer", "Main lift",
 * "Accessory"). Shared for the same reason as the line itself — a peeked day
 * that lost these read as an undifferentiated list of names.
 */
export function SectionLabel({ text, expanded }: { text: string; expanded: boolean }) {
  // LABELS ONLY WHERE THEY SAY SOMETHING (design handoff 2c, 10 Oct 2026).
  // The brief draws a plain numbered list. "Accessory" is what every row is
  // unless it is something else, so it is the one label dropped; Main lift
  // (the lift a shortened or rebuilt day protects), Primer, Finisher and
  // Superset each tell the lifter something about how to treat the row.
  if (text === 'Accessory') return null
  return (
    <span className={expanded ? 'ds-label-compact text-primary-text glow-mint' : 'ds-label-compact'}>
      {text}{expanded ? ' · open' : ''}
    </span>
  )
}

/**
 * The vocabulary itself. Shared rather than duplicated per panel: the peek
 * briefly had its own copy of this function, which is precisely how the two
 * surfaces diverged in the first place.
 */
export function sectionLabelFor(group: ExerciseGroup, isFirstMainLift: boolean, conditioningDay = false): string {
  if (group.kind === 'superset') return `Superset ${group.label}`
  if (isFirstMainLift) return 'Main lift'
  // "WARM-UP MOVE" (his Exercise Week handoff, 12 Nov 2026): the movement prep before the work, in his words.
  if (group.ex.tier === 'tier_0_primer') return 'Warm-up move'
  // On a day of conditioning the intervals ARE the session, not a finisher after it.
  if (group.ex.tier === 'tier_4_finisher') return conditioningDay ? 'Conditioning' : 'Finisher'
  return 'Accessory'
}
