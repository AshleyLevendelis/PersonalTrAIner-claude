import type * as React from 'react'
import { TOUR_OPENS, useTourStage } from '@/lib/tour-stage'
import { useRef } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MoreHorizontal, History, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { dayLabel, weekBoundaryIndex, weekBoundaryNote } from '@/lib/week-glyphs'

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
  // A SESSION DAY'S DOT IS MINT (Exercise Week X1, 12 Nov 2026): a done day now carries a tick, so a dot only ever
  // means a session still to come, and the two cannot be confused.
  due: { background: 'color-mix(in srgb, var(--primary) 75%, transparent)' },
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
  selectedDate,
  onSelectDate,
  onPage,
  onBackToToday,
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
  weekOpen = false,
  onToggleWeek,
  weekSummary,
}: {
  days: TrainingWeekDay[]
  todayName: string
  /** Today's date, so the line under the strip can say whether the new training week has begun. Optional: without it no line is drawn. */
  todayDate?: string
  /** The date on screen — today, or the day being peeked at. Defaults to today. */
  selectedDate?: string
  onSelectDate: (date: string) => void
  /**
   * PAGE THE STRIP (his ruling 15 Nov 2026, "Next 7 days from today but arrow and swipe to see previous and next
   * days"): -7 or +7. Absent, no arrows are drawn and a swipe does nothing.
   */
  onPage?: (step: number) => void
  /** Shown while the strip is paged away from today: brings it back. */
  onBackToToday?: () => void
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
  /** XW3 (his 12 Nov 2026 handoff): the week view is open. The strip, the notes and the card step aside for it. */
  weekOpen?: boolean
  /** The "Week ▾" pill. Absent, no pill is drawn. */
  onToggleWeek?: () => void
  /** The week view's own header: its date range for the kicker, and the line under the title. */
  weekSummary?: { range: string; line: React.ReactNode }
}) {
  const tourStage = useTourStage()
  const phaseToken = isCalibrationWeek ? 'Calibration' : isDeload ? 'Deload week' : phaseLabel
  const boundary = weekBoundaryIndex(days)
  const boundaryNote = todayDate ? weekBoundaryNote(days, todayDate) : null

  // Tab-restructure handoff — "Wk 3/16 · B1 Hypertrophy · ~52 min" as one
  // line, block number included (blockNumber was accepted as a prop before
  // this round but never actually rendered).
  // DESIGN HANDOFF 2c: "Week 3 of 16 · Hypertrophy" as the row's label. The
  // day's length moved to the hero's meta line, beside the sets count.
  const headerParts = [`Week ${weekNumber} of ${totalWeeks}`]
  if (phaseToken) headerParts.push(blockNumber != null ? `B${blockNumber} ${phaseToken}` : phaseToken)

  // THE EYEBROW (tab polish, Exercise 2a): "Week 2 of 16 · B1", and the week's
  // kind when it is one a lifter must know about (a calibration or deload week).
  const eyebrowParts = [`Week ${weekNumber} of ${totalWeeks}`]
  if (blockNumber != null) eyebrowParts.push(`B${blockNumber}`)
  if (isCalibrationWeek || isDeload) eyebrowParts.push(phaseToken!)

  const pill = 'hit-slop-44 flex h-[30px] items-center gap-1 whitespace-nowrap rounded-full px-[11px] text-[0.75rem] font-semibold text-primary-text'
  const pillStyle = { background: 'rgba(var(--glow-rgb), .12)', border: '1px solid rgba(var(--glow-rgb), .3)' }
  // A SWIPE ACROSS THE STRIP PAGES IT: left for later days, right for earlier ones. Mostly sideways and over 40px, so a
  // scroll down the page or a tap on a day is never read as one.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipeFrom.current = t ? { x: t.clientX, y: t.clientY } : null }
  const onTouchEnd = (e: React.TouchEvent) => {
    const from = swipeFrom.current; swipeFrom.current = null
    const t = e.changedTouches[0]
    if (!from || !t || !onPage) return
    const dx = t.clientX - from.x, dy = t.clientY - from.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) onPage(dx < 0 ? 7 : -7)
  }
  const first = days[0]?.date, last = days[days.length - 1]?.date
  const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div data-tour="extoday">
      {/* THE PAGE'S HEADER (2a; Exercise Week X1, 12 Nov 2026): where he is in the plan over "Exercise", and two pills,
          "Program ›" and "Week ▾", beside the day menu. In the week view the kicker is the week's dates and the pill
          reads "Week ▴" and closes it. The week line still opens the programme too, and its chevron the week's notes. */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1">
            {weekOpen && weekSummary ? (
              <span className="block truncate text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground" data-testid="week-view-range">{weekSummary.range}</span>
            ) : (
              <button
                type="button"
                className="hit-slop-44 min-w-0 text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground"
                onClick={onOpenProgram}
                data-testid="week-context-header"
                aria-label={`${headerParts.join(' · ')} — open the whole program`}
              >
                {/* The text clips in its own span: a clipped BUTTON would clip its 44px slop with it. */}
                <span className="block truncate">{eyebrowParts.join(' · ')}</span>
              </button>
            )}
            {!weekOpen && (phaseFocus || coachNote) && (
              <button
                type="button"
                className="hit-slop-44 text-primary-text"
                onClick={() => onToggleExpanded(!expanded)}
                aria-label={expanded ? "Hide the Personal TrAIner's notes on this week" : "Show the Personal TrAIner's notes on this week"}
                aria-expanded={expanded}
              >
                <ChevronDown className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <h2 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">Exercise</h2>
        </div>
        <div className="mb-0.5 flex shrink-0 items-center gap-1.5">
          {onOpenProgram && (
            <button type="button" onClick={onOpenProgram} data-testid="program-pill" className={pill} style={pillStyle}>
              Program
              <ChevronRight className="size-3" aria-hidden />
            </button>
          )}
          {onToggleWeek && (
            <button
              type="button"
              onClick={onToggleWeek}
              data-testid="week-pill"
              aria-expanded={weekOpen}
              aria-label={weekOpen ? 'Close the week view' : 'Show the whole week'}
              className={pill}
              style={pillStyle}
            >
              Week
              {weekOpen ? <ChevronUp className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
            </button>
          )}
          {/* "Add unplanned work" LEFT THIS MENU on 6 Sep 2026: it is the "I also
              did…" line at the foot of the list. Moved, not copied. */}
          {(onOpenSessionHistory || onOpenWhatHappened) && (
            // Held open while the app tour's day-menu stop is on screen (22 Nov 2026, tour-stage.ts).
            <DropdownMenu open={tourStage === TOUR_OPENS.dayMenu ? true : undefined}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hit-slop-44 size-7 shrink-0 text-muted-foreground" aria-label="More options" data-tour="daymenu">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-tour={tourStage === TOUR_OPENS.dayMenu ? 'daymenu-open' : undefined}>
                {/* THE DAY'S OWN VERBS — missed, moved, rested, swapped, did it
                    elsewhere (Ashley, 10 Sep 2026). */}
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

      {weekOpen ? (
        weekSummary && <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[0.8125rem]" data-testid="week-view-line">{weekSummary.line}</div>
      ) : (
        <>
          {/* THE DAY STRIP (Exercise Week X1): today and the next six days, paged by the arrows or a swipe (his ruling
              15 Nov 2026; it replaces Monday to Sunday for this strip, while every "this week" count stays Monday to
              Sunday), each day's short name over its date
              and its mark. Today is outlined mint; the day on screen (a peek) is boxed; a done day carries a tick, a
              session still to come a dot, a missed day the warning dot, a rest day the dash (his 1 Nov "Dash on both").
              Tapping another day keeps the peek it always opened. A hairline before the first day of a new training
              week says where the week changes. */}
          <div className="mt-4 grid grid-cols-7 gap-1" data-exercise-strip onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {days.map((d, i) => {
              // BY DATE: the strip can hold two Sundays' worth of days as it pages, so a weekday name is not a day.
              const isToday = todayDate ? d.date === todayDate : d.dayName === todayName
              const isSelected = d.date === (selectedDate ?? todayDate)
              const dot = stripDot(d.state)
              const rest = dot === 'none'
              const dateNum = Number(d.date.slice(8, 10))
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onSelectDate(d.date)}
                  data-strip-day={d.dayName}
                  data-strip-date={d.date}
                  data-dot={dot}
                  data-week-boundary={i === boundary ? 'start' : undefined}
                  aria-current={isSelected ? 'date' : undefined}
                  className="relative flex min-h-[58px] flex-col items-center justify-start gap-0.5 rounded-[14px] py-1.5"
                  style={isToday
                    ? { background: 'color-mix(in srgb, var(--primary) 10%, var(--surface-raised))', boxShadow: 'inset 0 0 0 1px rgba(var(--glow-rgb), .55)' }
                    : isSelected ? { background: 'var(--surface-raised)', boxShadow: 'inset 0 0 0 1px var(--hairline)' } : undefined}
                  // dayLabel is the vocabulary's own sentence, shared with Home's
                  // strip, and names what a swapped day was swapped for (M14).
                  aria-label={dayLabel(d)}
                >
                  {i === boundary && <span aria-hidden className="absolute -left-[3px] top-1 bottom-1 w-px bg-border" data-testid="week-boundary-mark" />}
                  {/* A REST DAY'S NAME READS LIKE ANY OTHER (2 Nov 2026): the dash under it already says rest. verify:strip-readable. */}
                  <span aria-hidden className={`text-[0.5625rem] font-semibold uppercase tracking-[.08em] ${isToday ? 'text-primary-text' : 'text-muted-foreground'}`}>
                    {isToday ? 'Today' : (DAY3[d.dayName] ?? d.dayName)}
                  </span>
                  <span aria-hidden className={`tabular-mono text-[1rem] font-semibold leading-none ${isSelected ? 'text-foreground' : 'text-text-tertiary'}`}>{dateNum}</span>
                  <span aria-hidden className="flex h-3 items-center justify-center text-[0.6875rem] leading-none text-muted-foreground">
                    {isSelected && (rest || dot === 'away') ? (
                      // A SELECTED REST DAY IS STILL A REST DAY: the dash, as on Home. Her ruling 1 Nov 2026, "Dash
                      // on both", over a mint dot on whatever day is selected, so a dot only ever means a session.
                      // A day whose session MOVED AWAY holds none either (whole-app QA walk, 7 Nov 2026).
                      <span data-selected-dot={rest ? 'rest' : 'away'}>–</span>
                    ) : dot === 'done' ? (
                      <Check className="size-3 text-primary-text" strokeWidth={3} data-selected-dot={isSelected ? 'plain' : undefined} />
                    ) : isSelected ? (
                      // A SELECTED MISSED DAY STAYS MISSED (run 7, M52).
                      <span className="size-1.5 rounded-full" data-selected-dot={dot === 'missed' ? 'missed' : 'plain'} style={dot === 'missed' ? DOT_STYLE.missed! : { background: 'var(--primary)' }} />
                    ) : DOT_STYLE[dot] ? (
                      <span className="size-1.5 rounded-full" style={DOT_STYLE[dot]!} />
                    ) : (
                      <span>–</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {onPage && first && last && (
            <div className="mt-1 flex items-center justify-between gap-2" data-testid="strip-pager">
              <button type="button" onClick={() => onPage(-7)} className="flex size-11 items-center justify-center rounded-full text-muted-foreground" aria-label="Show the 7 days before" data-testid="strip-prev">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="min-w-0 truncate text-center text-[0.6875rem] text-muted-foreground" data-testid="strip-range">
                {shortDate(first)} – {shortDate(last)}
                {onBackToToday && (
                  <button type="button" onClick={onBackToToday} className="hit-slop-44 ml-2 font-semibold text-primary-text" data-testid="strip-today">Today</button>
                )}
              </span>
              <button type="button" onClick={() => onPage(7)} className="flex size-11 items-center justify-center rounded-full text-muted-foreground" aria-label="Show the next 7 days" data-testid="strip-next">
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {boundaryNote && <p className="mt-1.5 text-center text-[0.6875rem] text-muted-foreground" data-testid="week-boundary-note">{boundaryNote}</p>}

          {/* THE NOTES ARE ON SCREEN, NOT ONLY BEHIND THE CHEVRON (Ashley, 3 Sep 2026: "the notes section doesn't
              populate") — unless the coach line below is already saying the note, when one screen must not carry the
              sentence twice. Out of the card since 12 Nov 2026: the card is the day's workout and nothing else. */}
          {!expanded && coachNote && !coachNoteShownBelow && (
            <button
              type="button"
              onClick={() => onToggleExpanded(true)}
              className="mt-2.5 w-full text-left text-xs leading-[1.5] line-clamp-1"
              style={{ color: 'var(--role-ai-text)' }}
              aria-label="Show the Personal TrAIner's notes on this week"
              data-testid="week-note-line"
            >
              {coachNote}
            </button>
          )}
          {/* Expanded, the note is STILL only in one place. */}
          {expanded && (phaseFocus || (coachNote && !coachNoteShownBelow)) && (
            <div className="mt-2.5 space-y-1.5" data-testid="week-notes">
              {phaseFocus && <p className="text-xs leading-[1.5] text-text-tertiary">{phaseFocus}</p>}
              {coachNote && !coachNoteShownBelow && <p className="text-xs leading-[1.5]" style={{ color: 'var(--role-ai-text)' }}>{coachNote}</p>}
            </div>
          )}

          {/* THE TODAY CARD (Exercise Week X1): today's session and nothing else, from TodayPanel, which knows the day.
              No rings and no week counts in it (his 12 Nov 2026 ruling); on a rest day, a peek or a moved day there is
              no card here, and the day's own card below says the rest. */}
          {hero && (
            <div
              className="mt-4 rounded-[24px] p-5"
              data-exercise-hero
              style={{
                background: 'radial-gradient(120% 90% at 100% 0%, rgba(var(--glow-rgb), .20), transparent 55%), var(--surface-deep)',
                border: '1px solid rgba(var(--glow-rgb), .30)',
                boxShadow: '0 10px 30px rgba(0, 0, 0, .35)',
              }}
            >
              {hero}
            </div>
          )}
        </>
      )}
    </div>
  )
}
