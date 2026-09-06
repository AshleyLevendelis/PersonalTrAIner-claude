import { ChevronDown, MoreVertical, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { GLYPH, STATE_LABEL } from '@/lib/week-glyphs'

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

// GLYPH and STATE_LABEL come from the shared vocabulary. They used to be a
// private copy here, while the extraction that was supposed to prevent exactly
// that drift (week-glyphs.ts) was wired into WeekStrip.tsx — a file nothing
// imports. So the marks Home and Exercise show were never actually shared, and
// the gate asserting they were read the dead file. Deleted; this reads the one
// source. SHORT_DAY stays local: single letters here, three on Home, which is
// presentation and legitimately differs.
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
  shortfallNote,
  onOpenProgram,
  onOpenSessionHistory,
  coachNoteShownBelow,
  expanded,
  onToggleExpanded,
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
  /** Why today runs shorter than the length they asked for — see session-shortfall.ts. Absent when it does not. */
  shortfallNote?: string
  onOpenProgram?: () => void
  onOpenSessionHistory?: () => void
  /** The TrAIner nudge below is already showing `coachNote`, so this row must not repeat it. */
  coachNoteShownBelow?: boolean
  /**
   * CONTROLLED, since 6 Sep 2026. The disclosure has two triggers now — this
   * row's chevron and the clamped TrAIner nudge above it — and two triggers
   * over one private useState is how "expanded" comes to mean two different
   * things on one screen. TodayPanel owns the flag.
   */
  expanded: boolean
  onToggleExpanded: (next: boolean) => void
}) {
  const phaseToken = isCalibrationWeek ? 'Calibration' : isDeload ? 'Deload week' : phaseLabel

  // Tab-restructure handoff — "Wk 3/16 · B1 Hypertrophy · ~52 min" as one
  // line, block number included (blockNumber was accepted as a prop before
  // this round but never actually rendered).
  const headerParts = [`Wk ${weekNumber}/${totalWeeks}`]
  if (phaseToken) headerParts.push(blockNumber != null ? `B${blockNumber} ${phaseToken}` : phaseToken)
  if (estimatedMinutes != null) headerParts.push(`~${estimatedMinutes} min`)

  return (
    // NO CARD. The --surface-raised box around this row went on 6 Sep 2026
    // (design_handoff_app_polish, Exercise §1): it is context, not content,
    // and a raised panel was giving the week's admin more visual weight than
    // the session underneath it. The week strip now sits directly under the
    // line it belongs to.
    <div data-tour="extoday">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-[0.78125rem] text-text-tertiary"
          onClick={onOpenProgram}
        >
          {headerParts.join(' · ')}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {(phaseFocus || coachNote) && (
            <button
              type="button"
              className="hit-slop-44 text-primary"
              onClick={() => onToggleExpanded(!expanded)}
              aria-label={expanded ? "Hide the Personal TrAIner's notes on this week" : "Show the Personal TrAIner's notes on this week"}
              aria-expanded={expanded}
            >
              <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          {/* "Add unplanned work" LEFT THIS MENU on 6 Sep 2026 and is a
              visible line at the foot of the exercise list again
              (design_handoff_app_polish, Exercise §6). Moved, not copied:
              two entry points to one dialog is how they drift apart. */}
          {onOpenSessionHistory && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="More options">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onOpenSessionHistory}>
                  <History className="size-3.5" />
                  Session history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ALWAYS VISIBLE, not behind the expander. The "~35 min" beside a
          request for 45-60 is right there in the header; the reason has to be
          too, or somebody reads the number and concludes the app ignored what
          they asked for. Audit §6.5. */}
      {shortfallNote && (
        <p className="mt-2 text-xs leading-[1.5] text-muted-foreground">{shortfallNote}</p>
      )}

      {/* THE NOTES ARE ON SCREEN, NOT ONLY BEHIND THE CHEVRON. The tour
          promises "my notes on it" for this tab, and every week of every plan
          carries one (mesocycle_weeks.coach_note) — but it rendered only once
          the chevron was tapped, so a trainee who never tapped it saw the tab
          the tour described as having notes with no notes on it (Ashley,
          3 Sep 2026: "the notes section doesn't populate"). Collapsed, the
          first line of the note shows and reads as the thing to tap;
          expanded, the phase focus and the whole note. */}
      {/* ...UNLESS THE NUDGE ABOVE IS ALREADY SAYING IT. From 6 Sep 2026 the
          TrAIner's line under the hero falls back to this same note when it
          has nothing more specific to say, and one screen must not carry the
          sentence twice. Ashley's requirement is untouched either way: the
          note is on screen without a tap — here when the nudge is saying
          something else, there when it is not. */}
      {!expanded && coachNote && !coachNoteShownBelow && (
        <button
          type="button"
          onClick={() => onToggleExpanded(true)}
          className="mt-2 w-full text-left text-xs leading-[1.5] line-clamp-1"
          style={{ color: 'var(--role-ai-text)' }}
          aria-label="Show the Personal TrAIner's notes on this week"
        >
          {coachNote}
        </button>
      )}
      {/* Expanded, the note is STILL only in one place. When the nudge below
          is carrying it, expanding reveals the phase focus here and unclamps
          the note down there — otherwise tapping "read the rest" would print
          the same paragraph twice, one above the other. */}
      {expanded && (phaseFocus || (coachNote && !coachNoteShownBelow)) && (
        <div className="mt-2.5 space-y-1.5">
          {phaseFocus && <p className="text-xs leading-[1.5] text-text-tertiary">{phaseFocus}</p>}
          {coachNote && !coachNoteShownBelow && <p className="text-xs leading-[1.5]" style={{ color: 'var(--role-ai-text)' }}>{coachNote}</p>}
        </div>
      )}

      <div className="mt-3 flex items-start justify-between">
        {days.map(d => {
          const isToday = d.dayName === todayName
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => { if (!isToday) onSelectDay(d.dayName) }}
              className="hit-slop-day flex flex-col items-center gap-1 rounded-[9px] px-1.5 py-1"
              style={isToday ? { background: 'rgba(var(--glow-rgb),.14)', border: '1px solid rgba(var(--glow-rgb),.4)' } : undefined}
              // This used to interpolate the raw state, so a screen reader
              // announced "Monday: before_plan" — an identifier, not English.
              // The same defect STATE_LABEL was written to fix, still live
              // here because that fix went into the copy nothing renders.
              aria-label={`${d.dayName}: ${STATE_LABEL[d.state]}`}
            >
              <span className={`text-[0.5625rem] uppercase tracking-[.08em] ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 1)}
              </span>
              {isToday && d.state === 'due' ? (
                <span aria-hidden className="size-[7px] rounded-full bg-primary glow-dot" />
              ) : (
                <span className={`text-[0.75rem] leading-none ${isToday ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                  {GLYPH[d.state]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {onOpenProgram && (
        <button type="button" className="mt-3 text-[0.71875rem] font-semibold text-primary" onClick={onOpenProgram}>
          See the whole program ›
        </button>
      )}
    </div>
  )
}
