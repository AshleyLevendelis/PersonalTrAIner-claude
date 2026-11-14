import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { lazyWithReload } from '@/lib/chunk-reload'
import { ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { tabHash } from '@/lib/app-route'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { dayLengthParts, formatDayLength, isSeparateSession } from '@/lib/session-duration'
import { describeDayGap } from '@/lib/day-gap-note'
import { SEPARATE_SESSION_LABEL } from './FinisherRow'
import { groupExercises, mainLiftGroupIndex } from '@/lib/session-derive'
import { getLoggedPlanDays } from '@/lib/exercise-history'
import { weekNoteText } from '@/lib/week-note'
import { weekDelta } from '@/lib/week-delta'
import { weekRole } from '@/lib/week-role'
import { prescriptionLine } from '@/lib/activity-day'
import { shortPhaseLabel } from '@/lib/periodization'
import { ReadOnlyDayList } from './ReadOnlyDayList'
import { buildProgramCalendar } from '@/lib/program-calendar'
import { WarmupSection } from './WarmupSection'
import type { MesocycleWeek, UserProfile, WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// PROGRAM BROWSE — design handoff 5a "Index", 1 Sep 2026. Replaces the
// retired ExercisePlan.tsx (the "browse stand-in" its own header promised to
// retire). One screen: this week's ROLE as the heading, the block named
// beneath it, a sixteen-week strip grouped into four named blocks, a week bar
// with a delta chip, the week's context rendered ONCE, and seven day rows that
// expand in place.
//
// THE HEADING WAS WRONG TWICE IN ONE DAY, in the same direction, and the
// history is worth keeping because the second attempt looked like a fix.
// Ashley: "each block still shows the same phase. 4 weeks all show
// hypertrophy rather than going through each phase." It was the bare phase
// name over sixteen anonymous ticks labelled B1-B4 — a strip that could say
// where she was and never what any of it was for. The first fix made the
// heading "Block 4: Hypertrophy" and split the strip into a block rail plus a
// four-week sub-phase strip. That named things, and the heading STILL repeated
// for four weeks, which was the actual complaint. Her own mockup settled it:
// lead with the week. The heading is now Baseline / Building / Peak / Deload —
// a different word every week — the block is named on the line under it, and
// the sixteen ticks came back with the block names beneath them.
//
// The strip is the only navigator — ProgramArc, the gradient pager
// card, the B1–B4 pills and the week dots are all gone from this surface.
//
// READ-ONLY FOR LOGGING (§7.3): completion marks come from a one-shot,
// read-only query of logged plan days; no SetGrid, no write facade. Loads
// stay plan-derived with honest provenance (§2.2/§7.4) — live progression
// numbers belong to TodayPanel alone. The expanded day renders through the
// shared ReadOnlyDayList, so this surface cannot grow its own day-rendering
// (the one-day-one-look rule); only the COLLAPSED index rows — a summary,
// not a day — are new chrome.
// ---------------------------------------------------------------------------

interface ProgramBrowseProps {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  profileId?: string
  /** The person's current flags — the day's gap note is derived from them when the day is shown, never stored. */
  injuries?: string[]
  /**
   * The profile the pool is built from today (the saved one with any running ease-off or kit change laid over it).
   * The gap note asks it whether a press fits the kit; without it the note never makes a kit claim.
   */
  poolProfile?: UserProfile
  /** From the route hash (`#/exercise/program/{n}`) — where paging starts. */
  initialWeek?: number
  /** When the plan began: the calendar view lays every date out in the plan week it is in (program-calendar.ts). */
  planCreatedAt?: string
  /**
   * App's logsVersion. ExerciseTab has had it all along and did not pass it
   * on, which is half of why this screen never showed a move: with no refresh
   * token the week read keys on profile and date only, so a move confirmed in
   * chat while this screen was mounted could not reach it.
   */
  refreshToken?: number
  /** Swaps carry the BROWSED week — a swap made while reading week 9 must land on week 9, not the live week. */
  onOpenSwap: (target: { weekNumber: number; dayName: string; sayDay?: string; exIndex: number; exerciseName: string }) => void
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  /**
   * Opens the technique tab. THIS PROP DID NOT EXIST UNTIL 5 Sep 2026, and
   * its absence was pinned by test:exercise-detail as a decision rather than
   * an omission: the program view had no detail dialog wired to it, and "a
   * menu item that opens nothing is worse than an absent one".
   *
   * That reason expired when the two dialogs merged. One dialog now serves
   * technique AND history, the program view already opens it for history, so
   * withholding the technique item would hide a tab the user can already
   * reach by tapping the other item — on the one screen where you browse
   * movements you have NOT yet performed, which is exactly where "how does
   * this go?" gets asked.
   */
  onOpenDetail?: (exerciseName: string) => void
}

const PROGRAM_VIEW_KEY = 'program-view'
// Loaded when it is first asked for: most visits never open it, and the app's first download has a budget (test:bundle).
const ProgramCalendar = lazyWithReload(() => import('./ProgramCalendar').then(m => ({ default: m.ProgramCalendar })))
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_ABBR: Record<string, string> = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU',
  Friday: 'FRI', Saturday: 'SAT', Sunday: 'SUN',
}

const daySets = (w: WorkoutDay | undefined): number =>
  w ? w.exercises.reduce((s, ex) => s + ex.sets, 0) : 0

/** The one line a collapsed row gives a training day: its main lift and the prescription. */
function mainLiftLine(workout: WorkoutDay): { name: string; summary: string } | null {
  if (workout.exercises.length === 0) return null
  const groups = groupExercises(workout.exercises)
  const idx = mainLiftGroupIndex(groups, workout.exercises)
  const g = groups[idx]
  const ex = g ? (g.kind === 'single' ? g.ex : g.members[0]?.ex) : workout.exercises[0]
  if (!ex) return null
  // THE PLAN'S OWN STRING, not a re-formatted number — the same rule
  // ExerciseLine states and test:load-display enforces across every
  // component. `loadingMode` prices anything dumbbell-capable PER HAND
  // (measured at 47.8% of prescriptions), so `~14kg` on this line sat
  // directly above `~14kg per hand` inside the expanded day and read as a
  // third of a lift that is two-thirds of it. This line shipped in the
  // browse redesign and was the gate's one offender.
  const load = ex.suggested_load_kg != null
    ? ` · ${ex.suggested_load ?? `~${ex.suggested_load_kg}kg`}`
    : ex.suggested_load?.toLowerCase() === 'bodyweight' ? ' · bodyweight' : ''
  return { name: ex.name, summary: `${ex.sets}×${ex.reps}${load}` }
}

export function ProgramBrowse({
  plan,
  mesocycle,
  profileId,
  injuries,
  poolProfile,
  initialWeek,
  planCreatedAt,
  refreshToken,
  onOpenSwap,
  onBanExercise,
  onOpenHistory,
  onOpenDetail,
}: ProgramBrowseProps) {
  // The only session-identity values this browse surface needs: where paging
  // starts and which row is "today". No logs facade, no write path.
  const { liveWeek, dayName: todayName, date: todayDate } = useActiveSession()
  const hasMesocycle = !!mesocycle && mesocycle.length > 0
  // 4 weeks PER BLOCK, not 4 total — mesocycle.length is the truth.
  const totalWeeks = hasMesocycle ? mesocycle.length : 4
  const clampWeek = (w: number) => Math.min(totalWeeks, Math.max(1, w))

  const [browseWeek, setBrowseWeek] = useState(() => clampWeek(initialWeek ?? liveWeek))
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [warmupOpen, setWarmupOpen] = useState(false)
  const [banBusy, setBanBusy] = useState<string | null>(null)
  // LIST OR CALENDAR (10 Nov 2026, his "the option to see my training weeks as a calendar view"). The list stays the
  // default and the place every change lives; the calendar is a way to look, remembered on this phone only.
  const [view, setViewState] = useState<'list' | 'calendar'>(() => {
    try { return window.localStorage.getItem(PROGRAM_VIEW_KEY) === 'calendar' ? 'calendar' : 'list' } catch { return 'list' }
  })
  const setView = (v: 'list' | 'calendar') => {
    setViewState(v)
    try { window.localStorage.setItem(PROGRAM_VIEW_KEY, v) } catch { /* a private window keeps the choice for this visit */ }
  }
  /** A day picked on the calendar, opened once the list has drawn its week. */
  const pickedDay = useRef<string | null>(null)

  const weekObj = hasMesocycle ? mesocycle.find(w => w.week_number === browseWeek) : undefined
  const days = weekObj?.days ?? plan

  // ---------------------------------------------------------------------------
  // MOVES. Ashley, 12 Sep 2026: she moved Saturday's session to Sunday from the
  // chat, the card confirmed it, and this screen went on showing Full Body
  // Power on Saturday with the TODAY badge and "Rest" on Sunday.
  //
  // THE REPORT SAID IT WAS A CACHE THAT NEEDED INVALIDATING. It was not: this
  // component had never read a move in its life — no sessionForDate, no move
  // rows, nothing to invalidate. Re-rendering it any number of times would draw
  // the same week. `days.find(d => d.day === dayName)` below was the SIXTH
  // surviving instance of the naive weekday lookup that session-move.ts's
  // header says was eliminated everywhere.
  //
  // ONLY ON THE LIVE WEEK, and that is not a shortcut. A move is a one-off
  // against real dates — "Saturday the 12th happens on Sunday the 13th" — not
  // an edit to the plan. Applying it while browsing week 9 would rewrite a
  // template from a fact about this week, which is the opposite of true.
  const liveDays = hasMesocycle ? mesocycle.find(w => w.week_number === liveWeek)?.days ?? plan : plan
  const trainingWeek = useTrainingWeek(profileId, todayDate, liveDays, undefined, refreshToken)
  const browsingLiveWeek = browseWeek === liveWeek
  const cellFor = (dayName: string) =>
    browsingLiveWeek && !trainingWeek.loading
      ? trainingWeek.days.find(d => d.dayName === dayName) ?? null
      : null

  // Completion is real data this view used to throw away. One read-only
  // fetch; a `${week}|${day}` set is the whole contract (§7.3).
  const [loggedDays, setLoggedDays] = useState<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false
    if (!profileId) return
    getLoggedPlanDays(profileId).then(set => { if (!cancelled) setLoggedDays(set) })
    return () => { cancelled = true }
  }, [profileId])

  // One day open at a time: today when browsing the live week, the first
  // training day otherwise.
  useEffect(() => {
    const fallback = DAY_ORDER.find(d => (days.find(x => x.day === d)?.exercises.length ?? 0) > 0) ?? null
    if (pickedDay.current) {
      const picked = pickedDay.current
      pickedDay.current = null
      setOpenDay(picked)
      setWarmupOpen(false)
      requestAnimationFrame(() => document.querySelector(`[data-program-day="${picked}"]`)?.scrollIntoView({ block: 'center' }))
      return
    }
    setOpenDay(browseWeek === liveWeek
      ? (days.find(x => x.day === todayName)?.exercises.length ? todayName : fallback)
      : fallback)
    setWarmupOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseWeek, liveWeek, todayName, weekObj])

  // Every day's bar is drawn against the week's biggest day, so the bars
  // compare days WITHIN a week rather than across weeks.
  const maxSets = Math.max(1, ...DAY_ORDER.map(d => daySets(days.find(x => x.day === d))))

  const weeksSorted = useMemo(
    () => (hasMesocycle ? [...mesocycle].sort((a, b) => a.week_number - b.week_number) : []),
    [mesocycle, hasMesocycle],
  )

  // THE PLAN GROUPED THE WAY IT IS ACTUALLY SHAPED, once, so the block rail,
  // the week strip and the "Block N of M" line cannot disagree with each
  // other. Three independent derivations off `mesocycle` was the previous
  // arrangement and is how two of them drift.
  //
  // Each block takes its name from its FIRST week's phase_label. Every week of
  // a block is stamped with the same label by the generator, so first-week is
  // simply the cheapest read — not an assumption that the others might differ.
  const blocks = useMemo(() => {
    const byNumber = new Map<number, MesocycleWeek[]>()
    for (const w of weeksSorted) {
      const n = w.block_number ?? 1
      const bucket = byNumber.get(n)
      if (bucket) bucket.push(w)
      else byNumber.set(n, [w])
    }
    return [...byNumber.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, weeks]) => ({
        number,
        weeks,
        label: weeks[0]?.phase_label ?? `Block ${number}`,
      }))
  }, [weeksSorted])

  const currentBlockNumber = weekObj?.block_number ?? 1
  const currentBlock = blocks.find(b => b.number === currentBlockNumber)
  const blockCount = blocks.length || 1
  const blockWeeks = currentBlock?.weeks.map(w => w.week_number) ?? [1]

  // Week note and delta chip — both trimmed to what this week actually is,
  // in week-note.ts / week-delta.ts, where they can be tested against real
  // generated plans rather than eyeballed on a screenshot. See those files
  // for the defects that put them there.
  const calendarRows = useMemo(() => buildProgramCalendar(mesocycle, planCreatedAt), [mesocycle, planCreatedAt])
  const liveCells = useMemo(
    () => new Map(trainingWeek.loading ? [] : trainingWeek.days.map(d => [d.date, d] as const)),
    [trainingWeek.days, trainingWeek.loading],
  )
  const openFromCalendar = (week: number, dayName: string) => {
    pickedDay.current = dayName
    setView('list')
    if (week === browseWeek) {
      // Same week: the effect that opens a day will not run again, so open it here.
      pickedDay.current = null
      setOpenDay(dayName)
      setWarmupOpen(false)
      requestAnimationFrame(() => document.querySelector(`[data-program-day="${dayName}"]`)?.scrollIntoView({ block: 'center' }))
    } else {
      setBrowseWeek(clampWeek(week))
    }
  }
  const note = weekNoteText(weekObj)
  const deltaChip = hasMesocycle && weekObj ? weekDelta(weekObj, mesocycle) : null

  return (
    <div className="flex flex-col px-1">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => { window.location.hash = tabHash('exercise') }}
          className="text-xs text-muted-foreground bg-transparent border-0 p-0 cursor-pointer"
        >
          ‹ Today
        </button>
        <span className="ds-label">Full program</span>
        {hasMesocycle && calendarRows.length > 0 && (
          <div role="group" aria-label="Show the program as" className="ml-auto flex items-center" data-testid="program-view-toggle">
            {(['list', 'calendar'] as const).map(v => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className="inline-flex min-h-[44px] items-center border-0 bg-transparent px-0.5"
              >
                <span
                  className="inline-flex h-8 items-center rounded-full px-3 text-[0.75rem] font-semibold"
                  style={view === v
                    ? { background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary-text)' }
                    : { color: 'var(--muted-foreground)' }}
                >
                  {v === 'list' ? 'List' : 'Calendar'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* LEAD WITH THE WEEK. Ashley's ruling, 1 Sep 2026, on a mockup she
          drew: the biggest text on the page is what THIS WEEK is for, and the
          block is named on the line beneath.
          The heading has now been wrong twice in one day in the same
          direction. It was the phase name alone — four weeks of "Hypertrophy"
          over a plan whose loads were climbing — and her complaint was that
          it never changed. The first fix made it "Block 4: Hypertrophy",
          which still repeats for four weeks. This is the one that actually
          answers her: Baseline, Building, Peak, Deload, a different word every
          week. */}
      <p className="mt-2.5 text-[1.875rem] font-bold leading-[1.04] tracking-[-.035em]">
        {hasMesocycle && weekObj
          ? weekRole(weekObj).label
          : weekObj?.phase_label ?? weekObj?.label ?? 'Your program'}
      </p>
      {hasMesocycle && (
        /* THE PHASE NAME LIVES HERE NOW, at full length. Her mockup dropped it
           from this line and left it only as a 10px label under the strip —
           which would bury the very thing she asked to be able to see. There
           is room on one line for all three facts; use it. */
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">
          Block {currentBlockNumber} of {blockCount}
          {weekObj?.phase_label ? ` · ${weekObj.phase_label}` : ''}
          {` · weeks ${Math.min(...blockWeeks)}–${Math.max(...blockWeeks)}`}
        </p>
      )}

      {/* THE STRIP — sixteen weeks, grouped into four named blocks.
          Restored from before the block rail, with two changes. The B1/B2/B3/B4
          labels are the block NAMES now, which is what Ashley could not see
          from the old version: it could say where she was and never what any
          of it was for. And the ticks and their label are nested inside one
          per-block column, so the name sits under its own four weeks BY
          CONSTRUCTION — the previous version spread four labels across the row
          with justify-between and hoped. */}
      {hasMesocycle && (
        <div className="mt-4 flex gap-[9px]">
          {blocks.map(b => {
            const isCurrentBlock = b.number === currentBlockNumber
            return (
              <div key={b.number} className="min-w-0 flex flex-col" style={{ flex: b.weeks.length }}>
                <div className="flex items-end gap-[3px] h-[22px]">
                  {b.weeks.map(w => {
                    const role = weekRole(w)
                    const selected = w.week_number === browseWeek
                    const isLive = w.week_number === liveWeek
                    // THE DELOAD IS THE ONE WEEK THAT MEANS DO LESS, and it is
                    // the piece of meaning most easily lost in a rewrite of
                    // this strip. Short AND amber: the height alone was the
                    // old signal and it survives a screenshot badly. The delta
                    // chip below already spends --role-warn on exactly this
                    // ("Deload · 28% fewer sets than W3"), so the strip agrees
                    // with it rather than inventing a colour.
                    const fill = role.key === 'deload'
                      ? (selected ? 'var(--role-warn)' : 'color-mix(in srgb, var(--role-warn) 45%, transparent)')
                      : selected
                        ? 'var(--primary)'
                        : w.week_number < liveWeek
                          ? 'color-mix(in srgb, var(--primary) 34%, transparent)'
                          : 'color-mix(in srgb, var(--border) 90%, transparent)'
                    return (
                      <button
                        key={w.week_number}
                        aria-label={`Week ${w.week_number}, ${role.label}${selected ? ', showing' : ''}`}
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => setBrowseWeek(w.week_number)}
                        className="border-0 p-0 cursor-pointer"
                        style={{
                          flex: 1,
                          height: selected ? 22 : role.key === 'deload' ? 8 : 14,
                          borderRadius: 2,
                          background: fill,
                          boxShadow: isLive && !selected ? 'inset 0 0 0 1px var(--primary)' : undefined,
                        }}
                      />
                    )
                  })}
                </div>
                {blockCount > 1 && (
                  <span
                    className={`mt-[7px] truncate text-center text-[0.625rem] uppercase tracking-[.1em] ${isCurrentBlock ? 'font-semibold' : 'text-muted-foreground'}`}
                    style={isCurrentBlock ? { color: 'var(--primary-text)' } : undefined}
                  >
                    {shortPhaseLabel(b.label)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {view === 'calendar' && calendarRows.length > 0 ? (
        <Suspense fallback={<div className="mt-5 h-40" aria-busy="true" />}>
          <ProgramCalendar
            rows={calendarRows}
            todayDate={todayDate}
            liveCells={liveCells}
            loggedDays={loggedDays}
            browseWeek={browseWeek}
            onPick={openFromCalendar}
          />
        </Suspense>
      ) : (<>
      {/* Week bar */}
      <div
        className="mt-5 flex items-center justify-between gap-2 px-1 py-2.5"
        style={{ borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }}
      >
        <button
          aria-label="Previous week"
          disabled={browseWeek <= 1}
          onClick={() => setBrowseWeek(w => clampWeek(w - 1))}
          className="w-[34px] h-[34px] rounded-[9px] border bg-transparent text-foreground cursor-pointer disabled:opacity-40 grid place-items-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex flex-col items-center gap-[5px]">
          <span className="text-base font-semibold tracking-[-.01em]">Week {browseWeek}</span>
          {deltaChip && (
            <span
              className="tabular-mono inline-flex items-center text-[0.6875rem] font-semibold px-2 py-[3px] rounded-md"
              style={deltaChip.warn
                ? { background: 'color-mix(in srgb, var(--role-warn) 12%, transparent)', color: 'var(--role-warn)' }
                : { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-text)' }}
            >
              {deltaChip.text}
            </span>
          )}
        </div>
        <button
          aria-label="Next week"
          disabled={browseWeek >= totalWeeks}
          onClick={() => setBrowseWeek(w => clampWeek(w + 1))}
          className="w-[34px] h-[34px] rounded-[9px] border bg-transparent text-foreground cursor-pointer disabled:opacity-40 grid place-items-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Week note — once, not once per day */}
      {note && (
        <p
          className="mt-3.5 text-[0.78125rem] leading-normal"
          style={{ color: 'color-mix(in srgb, var(--foreground) 76%, transparent)', borderLeft: '2px solid var(--primary)', paddingLeft: 11 }}
        >
          {note}
        </p>
      )}

      {/* Day list */}
      <div className="mt-5 flex flex-col">
        {DAY_ORDER.map((dayName, di) => {
          // WHAT ACTUALLY RUNS HERE. On a move ORIGIN that is nothing — the
          // session has left — and on the day it landed on it is the session
          // that travelled in, still called by the day it came from.
          const cell = cellFor(dayName)
          const movedTo = cell?.movedTo ?? null
          const movedFrom = cell?.movedFrom ?? null
          const workout = movedTo ? undefined : (cell?.session ?? days.find(d => d.day === dayName))
          // The plan's own row, read deliberately raw, so the origin can still
          // NAME what left after the resolver has correctly emptied the day.
          const leftBehind = movedTo ? days.find(d => d.day === dayName) : undefined
          const isRest = !workout
          const isActiveRecovery = !!workout && workout.exercises.length === 0
          const trains = !!workout && workout.exercises.length > 0
          const isToday = dayName === todayName && browseWeek === liveWeek
          const done = loggedDays.has(`${browseWeek}|${dayName}`)
          const dim = done && !isToday
          const open = openDay === dayName && trains
          const sets = daySets(workout)
          // ONE helper for a day's printed length, shared with the Exercise tab's
          // header and Home — see dayLengthParts. The bar beside it still scales
          // on every row's sets (`sets`), which is a comparison between days.
          const length = trains ? dayLengthParts(workout) : null
          const main = trains ? mainLiftLine(workout) : null
          // WHAT WAS DONE INSTEAD, on the live week only — for the reason a
          // move is: a swap is a fact about one date, not an edit to the plan
          // (M14, 9 Oct 2026). The row keeps the planned session and says what
          // replaced it, in the words the day card uses.
          const swappedFor = cell?.state === 'swapped' ? cell.swappedLine ?? null : null
          const restNote = movedTo
            ? `Moved to ${movedTo.dayName} — nothing to train here.`
            : isRest
            ? 'Sleep, hydration, and your baseline nutrition targets.'
            : isActiveRecovery
              // A PRESCRIBED ACTIVITY OUTRANKS A FINISHER HERE. When the day's
              // whole plan is a walk, plannedActivity IS the session and
              // recommendedCardio is at most an extra bolted on — reading the
              // add-on first (or, with neither, calling a prescribed 20-minute
              // walk "light movement and mobility") is the browse-list version
              // of the empty card on Today.
              ? (workout?.plannedActivity
                  ? prescriptionLine(workout.plannedActivity)
                  : workout?.recommendedCardio
                  // OPTIONAL, SAID AS SUCH (Sal/Margaret, 14 Nov 2026): a rest day's cardio is a suggestion.
                  ? `Optional: ${prescriptionLine(workout.recommendedCardio)}`
                  : 'Light movement and mobility.')
              : null

          return (
            <div
              key={dayName}
              style={{
                borderTop: di > 0 ? '1px solid var(--hairline)' : undefined,
                background: open ? 'linear-gradient(180deg, color-mix(in srgb, var(--primary) 6%, transparent), transparent)' : undefined,
              }}
            >
              {/* role="button", not <button>: the expanded body contains its
                  own buttons and a button may not nest (same reasoning as
                  ExerciseLine's header). */}
              <div
                role="button"
                tabIndex={trains ? 0 : -1}
                aria-expanded={trains ? open : undefined}
                data-program-day={dayName}
                onClick={() => { if (trains) { setOpenDay(prev => (prev === dayName ? null : dayName)); setWarmupOpen(false) } }}
                onKeyDown={e => {
                  if (trains && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    setOpenDay(prev => (prev === dayName ? null : dayName))
                    setWarmupOpen(false)
                  }
                }}
                className="flex items-center gap-[11px] px-0.5"
                style={{
                  paddingTop: trains ? 13 : 9,
                  paddingBottom: trains ? 13 : 9,
                  cursor: trains ? 'pointer' : 'default',
                }}
              >
                <span
                  className="shrink-0 w-[3px] self-stretch rounded-[2px]"
                  style={{
                    background: isToday
                      ? 'var(--primary)'
                      : isRest || isActiveRecovery
                        ? 'transparent'
                        : done
                          ? 'color-mix(in srgb, var(--primary) 30%, transparent)'
                          : 'color-mix(in srgb, var(--border) 90%, transparent)',
                  }}
                />
                <span
                  className="tabular-mono shrink-0 w-8 text-[0.65625rem] font-semibold tracking-[.06em]"
                  style={{ color: isToday ? 'var(--primary-text)' : 'var(--muted-foreground)' }}
                >
                  {DAY_ABBR[dayName]}
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {/* THE WORKOUT'S NAME IS THE ROW'S ONE HEADLINE (Ashley, 10 Nov 2026: "not very clearly visible at first
                        glance which are a title of a workout and which are the exercises themselves"). It was 15.5px
                        semibold over a 13px near-white exercise name, and the opened exercises were 15px in the same
                        white, further LEFT than the title they belong to. Now: larger and bold, its last word in the
                        accent as Home's and Exercise's own session cards draw a workout's name; the line under it
                        reads as detail; the exercises hang off a rail to its right (below). */}
                    <span
                      className={trains ? 'text-[1.0625rem] font-bold leading-tight tracking-[-.015em]' : 'text-[0.8125rem]'}
                      data-program-title={trains ? 'workout' : 'rest'}
                      // A DAY ALREADY DONE RECEDES BY ITS TITLE'S COLOUR, not by fading the row (2 Nov 2026, the UX pass): the
                      // row at 55% put its small print at 2.9-3.7:1. verify:small-print.
                      style={trains ? (dim ? { color: 'var(--muted-foreground)' } : undefined) : { color: 'var(--muted-foreground)' }}
                    >
                      {(() => {
                        const title = movedTo ? (leftBehind?.focus ?? 'Rest') : (workout?.focus ?? 'Rest')
                        const cut = title.lastIndexOf(' ')
                        if (!trains || dim || cut <= 0) return title
                        return <>{title.slice(0, cut + 1)}<span style={{ color: 'var(--primary-text)' }}>{title.slice(cut + 1)}</span></>
                      })()}
                    </span>
                    {/* SAID ON THE ROW, not left to be inferred from an empty
                        day. The badge is the same shape the week strip uses,
                        so the two screens describe one move the same way. */}
                    {movedTo && (
                      <span className="text-[0.5625rem] font-bold uppercase tracking-[.12em] rounded px-[5px] py-[2px] border" style={{ color: 'var(--muted-foreground)', borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                        Moved
                      </span>
                    )}
                    {movedFrom && (
                      <span className="text-[0.5625rem] font-bold uppercase tracking-[.12em] rounded px-[5px] py-[2px] border" style={{ color: 'var(--primary)', borderColor: 'color-mix(in srgb, var(--primary) 45%, transparent)' }}>
                        {movedFrom.dayName}&rsquo;s
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[0.5625rem] font-bold uppercase tracking-[.12em] rounded px-[5px] py-[2px] bg-primary text-primary-foreground">
                        Today
                      </span>
                    )}
                  </div>
                  {trains && (
                    <div className="flex flex-col gap-[5px]">
                      {main && (
                        // DETAIL, NOT A SECOND HEADLINE: said to be the main lift, and in the quiet colour throughout.
                        <span className="text-[0.75rem] leading-snug" style={{ color: 'var(--muted-foreground)' }} data-program-main>
                          <span className="text-[0.5625rem] font-semibold uppercase tracking-[.12em]">Main lift</span>{' '}
                          {main.name}{' '}
                          <span className="tabular-mono text-[0.6875rem]">
                            {main.summary}
                          </span>
                        </span>
                      )}
                      <div className="flex items-center gap-[9px]">
                        <div className="flex-1 h-[3px] rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--border) 55%, transparent)' }}>
                          <span
                            className="block h-[3px] rounded-[2px]"
                            style={{
                              width: `${Math.round((sets / maxSets) * 100)}%`,
                              background: isToday
                                ? 'var(--primary)'
                                : done
                                  ? 'color-mix(in srgb, var(--primary) 34%, transparent)'
                                  : 'color-mix(in srgb, var(--primary) 18%, transparent)',
                            }}
                          />
                        </div>
                        <span className="tabular-mono text-[0.65625rem] shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                          <span data-testid="program-day-length">{length ? `${length.workingSets} sets · ${formatDayLength(length)}` : ''}</span>
                        </span>
                      </div>
                    </div>
                  )}
                  {restNote && (
                    <span className="text-[0.71875rem]" style={{ color: 'var(--muted-foreground)' }}>
                      {restNote}
                    </span>
                  )}
                  {swappedFor && (
                    <span className="text-[0.71875rem] text-[color:var(--role-ai-text)]" data-testid="program-swapped">
                      You did something else instead: {swappedFor}
                    </span>
                  )}
                </div>
                {/* Transparent (not absent) when unlogged, so row width holds. */}
                <Check className="size-[11px] shrink-0" style={{ color: done ? 'var(--primary)' : 'transparent' }} aria-hidden={!done} />
                <ChevronDown
                  className="size-3.5 shrink-0 transition-transform duration-150"
                  style={{ transform: open ? 'rotate(180deg)' : undefined, opacity: trains ? 1 : 0, color: 'var(--muted-foreground)' }}
                />
              </div>

              {open && workout && (
                // UNDER THE TITLE AND TO ITS RIGHT, on a rail: the exercises belong to the workout above them. They used
                // to start 13px LEFT of its name (46px against the title's 59).
                <div
                  style={{ margin: '2px 2px 18px 59px', paddingLeft: 12, borderLeft: '2px solid color-mix(in srgb, var(--primary) 28%, transparent)' }}
                  className="flex flex-col gap-3"
                  data-program-day-body
                >
                  <p className="flex items-baseline justify-between pt-1 text-[0.625rem] font-semibold uppercase tracking-[.12em] text-text-tertiary" data-testid="program-exercises-heading">
                    <span>Exercises</span>
                    <span className="tabular-mono font-normal normal-case tracking-normal">{workout.exercises.length}</span>
                  </p>
                  {/* Day-level notes the old cards carried — kept, quietly. */}
                  {workout.recommendedCardio && (
                    <p className="text-xs text-muted-foreground" data-testid="program-day-cardio">
                      {isSeparateSession(workout.recommendedCardio) ? `${SEPARATE_SESSION_LABEL}: ` : ''}
                      {prescriptionLine(workout.recommendedCardio)}
                      {workout.recommendedCardio.timing === 'post_session' ? ' — after the lifting' : ''}
                    </p>
                  )}
                  {workout.mobilityFiller && (
                    <p className="text-xs text-muted-foreground">
                      Optional: {prescriptionLine(workout.mobilityFiller)}
                    </p>
                  )}
                  {workout.conditioning_note && !workout.recommendedCardio && (
                    <p className="text-xs text-muted-foreground">{workout.conditioning_note}</p>
                  )}
                  {(() => {
                    const gap = describeDayGap(workout, poolProfile ?? { injuries: injuries ?? [] }, injuries ?? [])
                    return gap ? <p className="text-xs text-muted-foreground" data-testid="day-gap-note">{gap}</p> : null
                  })()}
                  {workout.block_size_note && (
                    <p className="text-xs text-muted-foreground">{workout.block_size_note}</p>
                  )}
                  <ReadOnlyDayList
                    workout={workout}
                    // Keyed by the row the session LIVES in, said as the
                    // day it is listed under: a session moved onto this day
                    // is another weekday's row, and the list's own weekday
                    // is the empty one (H19).
                    onSwap={(exIndex, exerciseName) => onOpenSwap({ weekNumber: browseWeek, dayName: workout.day, sayDay: dayName, exIndex, exerciseName })}
                    onBan={async exerciseName => {
                      setBanBusy(exerciseName)
                      try { await onBanExercise(exerciseName) } finally { setBanBusy(null) }
                    }}
                    onOpenHistory={onOpenHistory}
                    onOpenDetail={onOpenDetail}
                    banBusyName={banBusy}
                  />
                  <WarmupSection
                    warmup={workout.warmup}
                    open={warmupOpen}
                    onToggle={() => setWarmupOpen(o => !o)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>)}
      {/* "Compare to W{n}" from the handoff is deliberately NOT built —
          unspecified in the design; logged in BACKLOG as its own piece. */}
    </div>
  )
}
