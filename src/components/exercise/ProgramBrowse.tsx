import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { tabHash } from '@/lib/app-route'
import { useActiveSession } from '@/hooks/useActiveSession'
import { estimateDaySeconds } from '@/lib/session-duration'
import { groupExercises, mainLiftGroupIndex } from '@/lib/session-derive'
import { getLoggedPlanDays } from '@/lib/exercise-history'
import { weekNoteText } from '@/lib/week-note'
import { weekDelta } from '@/lib/week-delta'
import { ReadOnlyDayList } from './ReadOnlyDayList'
import { WarmupSection } from './WarmupSection'
import type { MesocycleWeek, WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// PROGRAM BROWSE — design handoff 5a "Index", 1 Sep 2026. Replaces the
// retired ExercisePlan.tsx (the "browse stand-in" its own header promised to
// retire). One screen: a 16-week tick strip, a week bar with a delta chip,
// the week's context rendered ONCE, and seven day rows that expand in place.
//
// The tick strip is the only navigator — ProgramArc, the gradient pager
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
  /** From the route hash (`#/exercise/program/{n}`) — where paging starts. */
  initialWeek?: number
  /** Swaps carry the BROWSED week — a swap made while reading week 9 must land on week 9, not the live week. */
  onOpenSwap: (target: { weekNumber: number; dayName: string; exIndex: number; exerciseName: string }) => void
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
}

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
  initialWeek,
  onOpenSwap,
  onBanExercise,
  onOpenHistory,
}: ProgramBrowseProps) {
  // The only session-identity values this browse surface needs: where paging
  // starts and which row is "today". No logs facade, no write path.
  const { liveWeek, dayName: todayName } = useActiveSession()
  const hasMesocycle = !!mesocycle && mesocycle.length > 0
  // 4 weeks PER BLOCK, not 4 total — mesocycle.length is the truth.
  const totalWeeks = hasMesocycle ? mesocycle.length : 4
  const clampWeek = (w: number) => Math.min(totalWeeks, Math.max(1, w))

  const [browseWeek, setBrowseWeek] = useState(() => clampWeek(initialWeek ?? liveWeek))
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [warmupOpen, setWarmupOpen] = useState(false)
  const [banBusy, setBanBusy] = useState<string | null>(null)

  const weekObj = hasMesocycle ? mesocycle.find(w => w.week_number === browseWeek) : undefined
  const days = weekObj?.days ?? plan

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
    setOpenDay(browseWeek === liveWeek
      ? (days.find(x => x.day === todayName)?.exercises.length ? todayName : fallback)
      : fallback)
    setWarmupOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseWeek, liveWeek, todayName, weekObj])

  // Every day's bar is drawn against the week's biggest day, so the bars
  // compare days WITHIN a week rather than across weeks.
  const maxSets = Math.max(1, ...DAY_ORDER.map(d => daySets(days.find(x => x.day === d))))

  const blockCount = hasMesocycle ? Math.max(...mesocycle.map(w => w.block_number ?? 1)) : 1
  const blockWeeks = hasMesocycle
    ? mesocycle.filter(w => (w.block_number ?? 1) === (weekObj?.block_number ?? 1)).map(w => w.week_number)
    : [1]

  const weeksSorted = useMemo(
    () => (hasMesocycle ? [...mesocycle].sort((a, b) => a.week_number - b.week_number) : []),
    [mesocycle, hasMesocycle],
  )

  // Week note and delta chip — both trimmed to what this week actually is,
  // in week-note.ts / week-delta.ts, where they can be tested against real
  // generated plans rather than eyeballed on a screenshot. See those files
  // for the defects that put them there.
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
      </div>
      <p className="mt-2.5 text-[1.875rem] font-bold leading-[1.04] tracking-[-.035em]">
        {weekObj?.phase_label ?? weekObj?.label ?? 'Your program'}
      </p>
      {hasMesocycle && (
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">
          Block {weekObj?.block_number ?? 1} of {blockCount} · weeks {Math.min(...blockWeeks)}–{Math.max(...blockWeeks)}
        </p>
      )}

      {/* Tick strip — the one navigator. Blocks read from the 9px gap on
          each block's first week and from deload weeks being short. */}
      {hasMesocycle && (
        <>
          <div className="mt-4 flex items-end gap-[3px] h-[22px]">
            {weeksSorted.map((w, i) => {
              const selected = w.week_number === browseWeek
              const isLive = w.week_number === liveWeek
              const newBlock = i > 0 && (w.block_number ?? 1) !== (weeksSorted[i - 1].block_number ?? 1)
              const height = selected ? 22 : w.is_deload ? 8 : 14
              const fill = selected
                ? 'var(--primary)'
                : w.week_number < liveWeek
                  ? 'color-mix(in srgb, var(--primary) 34%, transparent)'
                  : 'color-mix(in srgb, var(--border) 90%, transparent)'
              return (
                <button
                  key={w.week_number}
                  aria-label={`Week ${w.week_number}${w.is_deload ? ' (deload)' : ''}`}
                  onClick={() => setBrowseWeek(w.week_number)}
                  className="border-0 p-0 cursor-pointer"
                  style={{
                    flex: 1,
                    height,
                    borderRadius: 2,
                    background: fill,
                    marginLeft: newBlock ? 9 : 0,
                    boxShadow: isLive && !selected ? 'inset 0 0 0 1px var(--primary)' : undefined,
                  }}
                />
              )
            })}
          </div>
          {blockCount > 1 && (
            <div className="mt-[7px] flex justify-between text-[0.625rem] uppercase tracking-[.1em] text-muted-foreground/80">
              {Array.from({ length: blockCount }, (_, i) => <span key={i}>B{i + 1}</span>)}
            </div>
          )}
        </>
      )}

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
                : { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
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
          const workout = days.find(d => d.day === dayName)
          const isRest = !workout
          const isActiveRecovery = !!workout && workout.exercises.length === 0
          const trains = !!workout && workout.exercises.length > 0
          const isToday = dayName === todayName && browseWeek === liveWeek
          const done = loggedDays.has(`${browseWeek}|${dayName}`)
          const dim = done && !isToday
          const open = openDay === dayName && trains
          const sets = daySets(workout)
          const mins = trains ? Math.round(estimateDaySeconds(workout) / 60) : 0
          const main = trains ? mainLiftLine(workout) : null
          const restNote = isRest
            ? 'Sleep, hydration, and your baseline nutrition targets.'
            : isActiveRecovery
              ? (workout?.recommendedCardio
                  ? `${workout.recommendedCardio.activity} · ${workout.recommendedCardio.duration} min @ RPE ${workout.recommendedCardio.targetRpe}`
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
                  opacity: dim ? 0.55 : 1,
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
                  style={{ color: isToday ? 'var(--primary)' : 'color-mix(in srgb, var(--muted-foreground) 70%, transparent)' }}
                >
                  {DAY_ABBR[dayName]}
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={trains ? 'text-[0.96875rem] font-semibold tracking-[-.012em]' : 'text-[0.8125rem]'}
                      style={trains ? undefined : { color: 'color-mix(in srgb, var(--muted-foreground) 70%, transparent)' }}
                    >
                      {workout?.focus ?? 'Rest'}
                    </span>
                    {isToday && (
                      <span className="text-[0.5625rem] font-bold uppercase tracking-[.12em] rounded px-[5px] py-[2px] bg-primary text-primary-foreground">
                        Today
                      </span>
                    )}
                  </div>
                  {trains && (
                    <div className="flex flex-col gap-[5px]">
                      {main && (
                        <span className="text-[0.8125rem]" style={{ color: 'color-mix(in srgb, var(--foreground) 76%, transparent)' }}>
                          {main.name}{' '}
                          <span className="tabular-mono text-[0.6875rem]" style={{ color: 'color-mix(in srgb, var(--muted-foreground) 70%, transparent)' }}>
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
                        <span className="tabular-mono text-[0.65625rem] shrink-0" style={{ color: 'color-mix(in srgb, var(--muted-foreground) 70%, transparent)' }}>
                          {sets} sets · ~{mins} min
                        </span>
                      </div>
                    </div>
                  )}
                  {restNote && (
                    <span className="text-[0.71875rem]" style={{ color: 'color-mix(in srgb, var(--muted-foreground) 60%, transparent)' }}>
                      {restNote}
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
                <div style={{ padding: '4px 2px 18px 46px' }} className="flex flex-col gap-3">
                  {/* Day-level notes the old cards carried — kept, quietly. */}
                  {workout.recommendedCardio && (
                    <p className="text-xs text-muted-foreground">
                      {workout.recommendedCardio.activity} · {workout.recommendedCardio.duration} min @ RPE {workout.recommendedCardio.targetRpe}
                      {workout.recommendedCardio.timing === 'post_session' ? ' — after the lifting' : ''}
                    </p>
                  )}
                  {workout.conditioning_note && !workout.recommendedCardio && (
                    <p className="text-xs text-muted-foreground">{workout.conditioning_note}</p>
                  )}
                  {workout.pattern_gap_note && (
                    <p className="text-xs" style={{ color: 'var(--role-warn)' }}>{workout.pattern_gap_note}</p>
                  )}
                  {workout.block_size_note && (
                    <p className="text-xs text-muted-foreground">{workout.block_size_note}</p>
                  )}
                  <ReadOnlyDayList
                    workout={workout}
                    onSwap={(exIndex, exerciseName) => onOpenSwap({ weekNumber: browseWeek, dayName, exIndex, exerciseName })}
                    onBan={async exerciseName => {
                      setBanBusy(exerciseName)
                      try { await onBanExercise(exerciseName) } finally { setBanBusy(null) }
                    }}
                    onOpenHistory={onOpenHistory}
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
      {/* "Compare to W{n}" from the handoff is deliberately NOT built —
          unspecified in the design; logged in BACKLOG as its own piece. */}
    </div>
  )
}
