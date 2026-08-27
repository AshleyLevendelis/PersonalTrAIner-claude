import { useState } from 'react'
import { ChevronDown, MoreVertical, ListPlus, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'

// ---------------------------------------------------------------------------
// Turn 5 — merges what were three separate rows (WeekStrip, ContextLine,
// IdentityLine's day/focus text) into one. The week-glyph strip and the
// Wk n/N · phase text now share a single line; IdentityLine's own two jobs
// split cleanly: the day/focus TEXT moves into TodayPanel's new hero block
// (this component doesn't render it), and the timers ENTRY POINT moves into
// the new day-level "⋮" menu here, alongside "Add unplanned work" (also
// relocated out of its old always-visible bottom-of-list button per turn 5's
// "unplanned work moved to header overflow").
//
// ContextLine's tap-to-expand phase-focus/coach-note disclosure is preserved
// verbatim (same expand-state shape), just triggered from this row instead.
// ---------------------------------------------------------------------------

const GLYPH: Record<TrainingWeekDay['state'], string> = {
  done: '✓',
  partial: '◐',
  due: '●',
  missed: '○',
  rest: '–',
  recovery: '~',
  // A training day that fell before this plan existed. Deliberately the
  // faintest mark in the set: it is not a rest day (the plan didn't choose
  // it) and emphatically not a missed one (nothing was ever owed).
  before_plan: '·',
  // Lifting deliberately swapped for something else, announced at the time.
  // Distinct from every mark above because it is the only one that says work
  // HAPPENED but not this work — an arrow, not an absence.
  swapped: '⇄',
}

const SHORT_DAY: Record<string, string> = {
  Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'T',
  Friday: 'F', Saturday: 'S', Sunday: 'S',
}

export function WeekContextRow({
  days,
  todayName,
  onSelectDay,
  weekNumber,
  totalWeeks,
  blockNumber,
  phaseLabel,
  isDeload,
  isCalibrationWeek,
  phaseFocus,
  coachNote,
  estimatedMinutes,
  onOpenProgram,
  onAddUnplannedWork,
  onOpenSessionHistory,
}: {
  days: TrainingWeekDay[]
  todayName: string
  onSelectDay: (dayName: string) => void
  weekNumber: number
  totalWeeks: number
  blockNumber?: number
  phaseLabel?: string
  isDeload?: boolean
  isCalibrationWeek?: boolean
  phaseFocus?: string
  coachNote?: string
  estimatedMinutes?: number
  onOpenProgram?: () => void
  onAddUnplannedWork?: () => void
  onOpenSessionHistory?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const phaseToken = isCalibrationWeek ? 'Calibration' : isDeload ? 'Deload week' : phaseLabel

  // Tab-restructure handoff — "Wk 3/16 · B1 Hypertrophy · ~52 min" as one
  // line, block number included (blockNumber was accepted as a prop before
  // this round but never actually rendered).
  const headerParts = [`Wk ${weekNumber}/${totalWeeks}`]
  if (phaseToken) headerParts.push(blockNumber != null ? `B${blockNumber} ${phaseToken}` : phaseToken)
  if (estimatedMinutes != null) headerParts.push(`~${estimatedMinutes} min`)

  return (
    <div data-tour="extoday" className="rounded-2xl p-3.5" style={{ background: 'var(--surface-raised)' }}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-[12.5px] text-foreground"
          onClick={onOpenProgram}
        >
          {headerParts.join(' · ')}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {(phaseFocus || coachNote) && (
            <button
              type="button"
              className="hit-slop-44 text-primary"
              onClick={() => setExpanded(v => !v)}
              aria-label="Expand phase context"
            >
              <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          {(onAddUnplannedWork || onOpenSessionHistory) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="More options">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onAddUnplannedWork && (
                  <DropdownMenuItem onClick={onAddUnplannedWork}>
                    <ListPlus className="size-3.5" />
                    Add unplanned work
                  </DropdownMenuItem>
                )}
                {onOpenSessionHistory && (
                  <DropdownMenuItem onClick={onOpenSessionHistory}>
                    <History className="size-3.5" />
                    Session history
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {expanded && (phaseFocus || coachNote) && (
        <div className="mt-2.5 space-y-1.5">
          {phaseFocus && <p className="text-xs leading-[1.5] text-text-tertiary">{phaseFocus}</p>}
          {coachNote && <p className="text-xs leading-[1.5]" style={{ color: 'var(--role-ai-text)' }}>Coach: {coachNote}</p>}
        </div>
      )}

      <div className="mt-3.5 flex items-start justify-between">
        {days.map(d => {
          const isToday = d.dayName === todayName
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => { if (!isToday) onSelectDay(d.dayName) }}
              className="hit-slop-day flex flex-col items-center gap-1 rounded-[9px] px-1.5 py-1"
              style={isToday ? { background: 'rgba(var(--glow-rgb),.14)', border: '1px solid rgba(var(--glow-rgb),.4)' } : undefined}
              aria-label={`${d.dayName}: ${d.state}`}
            >
              <span className={`text-[9px] uppercase tracking-[.08em] ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 1)}
              </span>
              {isToday && d.state === 'due' ? (
                <span aria-hidden className="size-[7px] rounded-full bg-primary glow-dot" />
              ) : (
                <span className={`text-[12px] leading-none ${isToday ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                  {GLYPH[d.state]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {onOpenProgram && (
        <button type="button" className="mt-3 text-[11.5px] font-semibold text-primary" onClick={onOpenProgram}>
          See the whole program ›
        </button>
      )}
    </div>
  )
}
