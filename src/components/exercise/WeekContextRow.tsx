import type * as React from 'react'
import { ChevronDown, MoreHorizontal, History, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { dayLabel, weekBoundaryIndex, weekBoundaryNote } from '@/lib/week-glyphs'
import { tallyWeek } from '@/hooks/useTrainingWeek'
import { weekSetCount } from '@/lib/one-page'

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
/**
 * THE DOT UNDER A DAY (design handoff 2c, 10 Oct 2026): accent when the day's
 * training is done, warn when it was missed, none on a rest day. The brief
 * names three; the week has ten states, and each maps to the nearest — the
 * full state is still SPOKEN through dayLabel. Exported so the gate asks it.
 *   done, swapped (did something else instead) → done
 *   partial → part (a half-strength accent)
 *   missed → missed
 *   due (a training day not yet trained) → due (a dim dot, so it does not
 *     read as a rest day)
 *   moved → away (dim, like rest: the session is on the day it moved to)
 *   rest, recovery, rest_chosen, before_plan → none
 */
export type StripDot = 'done' | 'part' | 'missed' | 'due' | 'away' | 'none'
export function stripDot(state: TrainingWeekDay['state']): StripDot {
  switch (state) {
    case 'done': case 'swapped': return 'done'
    case 'partial': return 'part'
    case 'missed': return 'missed'
    case 'due': return 'due'
    case 'moved': return 'away'
    default: return 'none'
  }
}
const DOT_STYLE: Record<StripDot, React.CSSProperties | null> = {
  done: { background: 'var(--primary)' },
  part: { background: 'color-mix(in srgb, var(--primary) 50%, transparent)' },
  missed: { background: 'var(--role-warn)' },
  due: { background: 'var(--text-dim)' },
  away: { boxShadow: 'inset 0 0 0 1px var(--text-dim)' },
  none: null,
}
const DAY3: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
}

export function WeekContextRow({
  days,
  todayName,
  todayDate,
  selectedDay,
  onSelectDay,
  weekNumber,
  totalWeeks,
  blockNumber,
  phaseLabel,
  isDeload,
  isCalibrationWeek,
  phaseFocus,
  coachNote,
  onOpenProgram,
  onOpenSessionHistory,
  onOpenWhatHappened,
  coachNoteShownBelow,
  expanded,
  onToggleExpanded,
  hero,
}: {
  days: TrainingWeekDay[]
  todayName: string
  /** Today's date, so the line under the strip can say whether the new training week has begun. Optional: without it no line is drawn. */
  todayDate?: string
  /** The day on screen — today, or the day being peeked at. Defaults to today. */
  selectedDay?: string
  onSelectDay: (dayName: string) => void
  weekNumber: number
  totalWeeks: number
  blockNumber?: number
  phaseLabel?: string
  isDeload?: boolean
  isCalibrationWeek?: boolean
  phaseFocus?: string
  coachNote?: string
  onOpenProgram?: () => void
  onOpenSessionHistory?: () => void
  /** Opens the "What happened?" sheet for the day on screen — the five day-level verbs, on the screen too (10 Sep 2026). */
  onOpenWhatHappened?: () => void
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
  /**
   * THE LEFT HALF OF THE HERO (one-page Exercise, 5c·4, 17 Oct 2026): today's session name and its meta
   * line, from TodayPanel, which knows the day. Absent on a rest day, a peek or a moved day: the hero then
   * says what the week has done, and the day's own card below says the rest.
   */
  hero?: React.ReactNode
}) {
  const phaseToken = isCalibrationWeek ? 'Calibration' : isDeload ? 'Deload week' : phaseLabel
  const boundary = weekBoundaryIndex(days)
  const boundaryNote = todayDate ? weekBoundaryNote(days, todayDate) : null
  const tally = tallyWeek(days, todayDate ?? '')
  const sets = weekSetCount(days)

  // Tab-restructure handoff — "Wk 3/16 · B1 Hypertrophy · ~52 min" as one
  // line, block number included (blockNumber was accepted as a prop before
  // this round but never actually rendered).
  // DESIGN HANDOFF 2c: "Week 3 of 16 · Hypertrophy" as the row's label. The
  // day's length moved to the hero's meta line, beside the sets count.
  const headerParts = [`Week ${weekNumber} of ${totalWeeks}`]
  if (phaseToken) headerParts.push(blockNumber != null ? `B${blockNumber} ${phaseToken}` : phaseToken)

  return (
    // NO CARD. The --surface-raised box around this row went on 6 Sep 2026
    // (design_handoff_app_polish, Exercise §1): it is context, not content,
    // and a raised panel was giving the week's admin more visual weight than
    // the session underneath it. The week strip now sits directly under the
    // line it belongs to.
    <div data-tour="extoday">
      {/* THE PAGE'S HEADER (5c·4): "Exercise", and where she is in the plan beside the notes and the menu.
          The week number opens the programme, as the old label did. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">Exercise</h2>
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="hit-slop-44 min-w-0 truncate text-[0.75rem] text-muted-foreground"
            onClick={onOpenProgram}
            data-testid="week-context-header"
            aria-label={`${headerParts.join(' · ')} — open the whole program`}
          >
            Week {weekNumber} of {totalWeeks}
          </button>
          {(phaseFocus || coachNote) && (
            <button
              type="button"
              className="hit-slop-44 text-primary-text"
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
          {(onOpenSessionHistory || onOpenWhatHappened) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="More options">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* THE DAY'S OWN VERBS. Missed, moved, rested, swapped, did it
                    elsewhere — four of which the coach could do and the screen
                    could only display, and one of which nobody could say at
                    all. Ashley, 10 Sep 2026. */}
                {onOpenWhatHappened && (
                  <DropdownMenuItem onClick={onOpenWhatHappened} data-testid="what-happened-item">
                    <CalendarDays className="size-3.5" />
                    What happened?
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

      {/* TODAY'S TITLE, FULL WIDTH (30 Oct 2026, "less is more"). The week's two rings and their two-row key
          said one fraction three times; the week is now one line over the strip it describes, with the
          same counts the strip and Home use (tallyWeek, weekSetCount). */}
      <div className="mt-[14px]" data-exercise-hero>
        {hero ?? (
          <p className="glow-mint text-[0.65625rem] font-semibold uppercase tracking-[.2em] text-primary-text">This week</p>
        )}
      </div>
      <p
        className="mt-[18px] flex items-baseline justify-between gap-3 text-[0.75rem] text-muted-foreground"
        data-testid="week-meter"
        aria-label={`${tally.sessionsDone} of ${tally.sessionsPlanned} sessions and ${sets.logged} of ${sets.planned} sets done this week`}
      >
        <span>This week</span>
        <span className="tabular-mono" data-testid="week-key">
          <span className="text-foreground" data-testid="week-meter-count">{tally.sessionsDone} of {tally.sessionsPlanned}</span> session{tally.sessionsPlanned === 1 ? '' : 's'} · {sets.logged}/{sets.planned} sets
        </span>
      </p>

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

      {/* THE DAY STRIP (2c): seven equal columns, 46px tall — the day's name
          over a 5px dot. The day on screen (today, or the day peeked at) is
          lifted, its name in accent and its dot hollow. Tapping another day
          keeps the peek it always opened. A hairline before the first day of
          a new training week says where the week changes (week boundaries S5). */}
      <div className="mt-2 grid grid-cols-7 gap-1" data-exercise-strip>
        {days.map((d, i) => {
          const isToday = d.dayName === todayName
          const isSelected = d.dayName === (selectedDay ?? todayName)
          const dot = stripDot(d.state)
          const rest = dot === 'none'
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => { if (!isToday) onSelectDay(d.dayName) }}
              data-strip-day={d.dayName}
              data-dot={dot}
              data-week-boundary={i === boundary ? 'start' : undefined}
              aria-current={isSelected ? 'date' : undefined}
              className="relative flex h-[46px] flex-col items-center justify-center gap-1.5 rounded-xl"
              style={isSelected ? { background: 'var(--surface-raised)', boxShadow: 'inset 0 0 0 1px rgba(var(--glow-rgb), .4)' } : undefined}
              // This used to interpolate the raw state, so a screen reader
              // announced "Monday: before_plan" — an identifier, not English.
              // dayLabel is the vocabulary's own sentence, shared with Home's
              // strip, and names what a swapped day was swapped for (M14).
              aria-label={dayLabel(d)}
            >
              {i === boundary && <span aria-hidden className="absolute -left-[3px] top-1 bottom-1 w-px bg-border" data-testid="week-boundary-mark" />}
              <span className={`text-[0.6875rem] ${isSelected ? 'font-semibold text-primary-text' : rest ? 'text-[color:var(--text-dim)]' : 'text-text-tertiary'}`}>
                {(DAY3[d.dayName] ?? d.dayName).slice(0, 1)}
              </span>
              {isSelected ? (
                // A SELECTED MISSED DAY STAYS MISSED (run 7, M52): the ring took the warning dot's place, so tapping
                // Monday made it look like any planned day.
                <span aria-hidden className="size-[5px] rounded-full" data-selected-dot={dot === 'missed' ? 'missed' : 'plain'} style={dot === 'missed' ? DOT_STYLE.missed! : { boxShadow: 'inset 0 0 0 1px var(--primary)' }} />
              ) : DOT_STYLE[dot] ? (
                <span aria-hidden className={`size-[5px] rounded-full ${dot === 'done' ? 'glow-mint-box' : ''}`} style={DOT_STYLE[dot]!} />
              ) : (
                <span aria-hidden className="size-[5px]" />
              )}
            </button>
          )
        })}
      </div>

      {boundaryNote && <p className="mt-1.5 text-center text-[0.6875rem] text-muted-foreground" data-testid="week-boundary-note">{boundaryNote}</p>}

    </div>
  )
}
