import { ChevronDown } from 'lucide-react'
import { isUnverifiedLoadSource } from '@/lib/load-prescription'
import { describeTempo } from '@/lib/periodization'
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
}) {
  // "Is this number still a guess?" — the dotted underline that marks an
  // unverified load. undefined is excluded deliberately: that means
  // bodyweight, where there is no load to be unsure about.
  const loadIsUnverified = loadSource != null && isUnverifiedLoadSource(loadSource)

  const summary = allSetsLogged && loggedSummary ? (
    <span className="tabular-mono text-xs text-primary glow-mint">✓ {loggedSummary}</span>
  ) : (
    <span className="tabular-mono text-xs text-muted-foreground">
      {ex.sets}×{ex.reps}
      {ex.suggested_load_kg != null ? ` · ${ex.suggested_load_kg}kg` : ''}
      {ex.suggested_assistance_kg != null ? ` · ${ex.assistance_ready_to_graduate ? 'no assist' : `${ex.suggested_assistance_kg}kg assist`}` : ''}
      {/* Sits where the weight would be, because it IS the weight's stand-in:
          the progression lever for a lift with nothing to load. Stored as
          '3-0-1' and rendered in words — the notation means nothing to a
          trainee who has never seen it. */}
      {describeTempo(ex.tempo) ? ` · ${describeTempo(ex.tempo)}` : ''}
    </span>
  )

  return (
    <div className="flex items-baseline justify-between gap-2.5">
      {/* A plain div, not a <button> — the expanded body below can contain
          its own buttons (LoadChip's "why this weight"), and a button may not
          legally contain another. role="button" + tabIndex + Enter/Space
          keeps this a real, keyboard-operable control. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
        className="min-w-0 flex-1 text-left flex items-baseline justify-between gap-2.5 cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {supersetLabel && (
            <span className="shrink-0 font-mono text-[10px] font-semibold text-primary glow-mint">{supersetLabel}</span>
          )}
          <span
            className={`truncate ${expanded ? 'text-[19px] font-semibold' : 'text-[15.5px] font-medium'} ${
              allSetsLogged ? 'line-through text-muted-foreground' : ''
            } ${!expanded && loadIsUnverified ? 'border-b border-dotted border-muted-foreground/50' : ''}`}
          >
            {ex.name}
          </span>
        </div>
        {!expanded && (
          <span className="flex shrink-0 items-center gap-1">
            {summary}
            <ChevronDown className="size-3.5 text-muted-foreground" />
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
  return (
    <span className={expanded ? 'ds-label-compact text-primary glow-mint' : 'ds-label-compact'}>
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
