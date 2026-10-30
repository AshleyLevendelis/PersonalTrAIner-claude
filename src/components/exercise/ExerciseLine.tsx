import { ArrowUp } from 'lucide-react'
import { isUnverifiedLoadSource } from '@/lib/load-prescription'
import { describeExerciseTempo } from '@/lib/periodization'
import type { LoadSource } from './LoadChip'
import type { Exercise } from '@/lib/types'
import type { ExerciseGroup } from '@/lib/session-derive'

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
  /** Right-hand controls that sit outside the tap target (the `⋯` menu). */
  trailing?: React.ReactNode
  /** Its place in the day, "01" (design handoff 2c). */
  index?: number
  /** Today only: working sets logged — the filled dots. Absent on a peek, which draws none. */
  setsDone?: number
  /** Today only: the load went up from last session (the row's own progression note). */
  progressing?: boolean
}) {
  const loadIsUnverified = loadSource != null && isUnverifiedLoadSource(loadSource)

  // THE CHIP (2c) carries the load as the plan wrote it — ex.suggested_load,
  // NOT a re-formatted suggested_load_kg. The string is written by formatLoad
  // and already carries the unit: "~14kg per hand" for a dumbbell pair,
  // "~42.5kg" for a barbell. A chip printing `${kg} kg` would put a per-hand
  // number in the same format as a total (1126 of 2356 prescriptions did once).
  const chip = ex.suggested_load_kg != null
    ? (ex.suggested_load ?? `~${ex.suggested_load_kg}kg`)
    : ex.suggested_assistance_kg != null
      ? (ex.assistance_ready_to_graduate ? 'no assist' : `${ex.suggested_assistance_kg}kg assist`)
      // Signed, always: "+15kg" beside a pull-up is weight to add.
      : ex.suggested_added_load_kg != null ? `+${ex.suggested_added_load_kg}kg` : null
  const tempo = describeExerciseTempo(ex)
  const done = Math.max(0, Math.min(setsDone ?? 0, ex.sets))

  if (expanded) {
    return (
      <div className="flex items-baseline justify-between gap-2.5">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleExpanded}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
          className="hit-slop-44 flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          {supersetLabel && <span className="shrink-0 font-mono text-[0.625rem] font-semibold text-primary-text glow-mint">{supersetLabel}</span>}
          <span className={`text-[1.1875rem] font-semibold ${allSetsLogged ? 'line-through text-muted-foreground' : ''}`}>{ex.name}</span>
        </div>
        {trailing}
      </div>
    )
  }

  return (
    <div className="flex min-h-[62px] items-center gap-2.5">
      {/* A plain div, not a <button> — the expanded body below can contain
          its own buttons (LoadChip's "why this weight"), and a button may not
          legally contain another. role="button" + tabIndex + Enter/Space
          keeps this a real, keyboard-operable control. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
        className="hit-slop-44 flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
      >
        {/* NO 01 / 02 NUMBERS (30 Oct 2026, "less is more"): the list's order already says it. */}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {supersetLabel && <span className="shrink-0 font-mono text-[0.625rem] font-semibold text-primary-text glow-mint">{supersetLabel}</span>}
            {/* TWO LINES, NOT ONE HARD CUT — "you can't see the exercises until
                you click into it" (Ashley, from a phone): a name is the row. */}
            <span
              className={`line-clamp-2 text-[0.90625rem] font-medium ${allSetsLogged ? 'line-through text-muted-foreground' : ''} ${loadIsUnverified ? 'border-b border-dotted border-muted-foreground/50' : ''}`}
            >
              {ex.name}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {setsDone != null && (
              <span className="flex items-center gap-1" aria-label={`${done} of ${ex.sets} sets logged`} data-set-dots>
                {Array.from({ length: ex.sets }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="size-[7px] rounded-full"
                    style={i < done
                      ? { background: 'var(--primary)', boxShadow: '0 0 calc(6px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .6)' }
                      : { boxShadow: 'inset 0 0 0 1px var(--text-dim)' }}
                  />
                ))}
              </span>
            )}
            {allSetsLogged && loggedSummary ? (
              <span className="tabular-mono text-[0.6875rem] text-primary-text glow-mint">✓ {loggedSummary}</span>
            ) : (
              <span className="tabular-mono text-[0.6875rem] text-muted-foreground">
                {ex.sets} × {ex.reps}{tempo ? ` · ${tempo}` : ''}
              </span>
            )}
          </span>
        </span>
        {chip && (
          <span
            className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 tabular-mono text-[0.75rem] font-semibold"
            style={progressing
              ? { background: 'rgba(var(--glow-rgb), .12)', color: 'var(--primary-text)' }
              : { background: 'var(--surface-raised)', color: 'var(--foreground)' }}
            data-load-chip={progressing ? 'up' : 'hold'}
          >
            {progressing && <ArrowUp className="size-3" aria-label="up from last session" />}
            {chip}
          </span>
        )}
      </div>
      {trailing}
    </div>
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
export function sectionLabelFor(group: ExerciseGroup, isFirstMainLift: boolean): string {
  if (group.kind === 'superset') return `Superset ${group.label}`
  if (isFirstMainLift) return 'Main lift'
  if (group.ex.tier === 'tier_0_primer') return 'Primer'
  if (group.ex.tier === 'tier_4_finisher') return 'Finisher'
  return 'Accessory'
}
