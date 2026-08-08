import { useState } from 'react'
import { ChevronDown, MoreVertical, Timer, ListPlus, History } from 'lucide-react'
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
  onOpenTimers,
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
  onOpenTimers?: () => void
  onAddUnplannedWork?: () => void
  onOpenSessionHistory?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const phaseToken = isCalibrationWeek ? 'Calibration' : isDeload ? 'Deload week' : phaseLabel

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {days.map(d => {
            const isToday = d.dayName === todayName
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => { if (!isToday) onSelectDay(d.dayName) }}
                className="hit-slop-day flex flex-col items-center gap-0.5"
                aria-label={`${d.dayName}: ${d.state}`}
              >
                <span className={`text-[9.5px] tracking-[.08em] ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                  {SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 1)}
                </span>
                {isToday && d.state === 'due' ? (
                  <span aria-hidden className="mt-[2px] size-[7px] rounded-full bg-primary glow-dot" />
                ) : (
                  <span className={`text-[11px] leading-none ${isToday ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                    {GLYPH[d.state]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-right text-[9.5px] uppercase leading-[1.3] tracking-[.16em] text-muted-foreground hover:text-foreground"
            onClick={onOpenProgram}
          >
            Wk {weekNumber} · {phaseToken ?? `of ${totalWeeks}`}
            {estimatedMinutes != null && <><br />~{estimatedMinutes} min</>}
          </button>
          {(phaseFocus || coachNote) && (
            <button
              type="button"
              className="hit-slop-44 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(v => !v)}
              aria-label="Expand phase context"
            >
              <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          {(onOpenTimers || onAddUnplannedWork || onOpenSessionHistory) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="More options">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onOpenTimers && (
                  <DropdownMenuItem onClick={onOpenTimers}>
                    <Timer className="size-3.5" />
                    Open timers
                  </DropdownMenuItem>
                )}
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
        <div className="mt-2 space-y-1">
          {phaseFocus && <p className="text-[11px] text-muted-foreground">{phaseFocus}</p>}
          {coachNote && <p className="text-[11px] text-muted-foreground/80 italic">{coachNote}</p>}
        </div>
      )}
    </div>
  )
}
