import { useState } from 'react'
import { Clock, Heart, Minus, Pencil, Plus } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { splitActivity } from '@/lib/cardio-lines'
import { effortForRpe, effortLabel } from '@/lib/cardio-effort'
import { plannedRoundsOf, plannedSessionRow, sessionMinutesFor, stepTodayMinutes, stepTodayRounds, withTodayChange, type TodayChange } from '@/lib/planned-rounds'
import { clock } from '@/lib/round-setup'
import { blockShape } from '@/lib/timer-engine'
import type { PlannedActivity } from '@/lib/types'
import { SetBar, Swatch } from './ExerciseBar'
import { PlannedSessionStart, usePlannedTimerBusy } from './PlannedRoundsStart'
import { PlannedCardioRow, useCardioLogsToday } from './CardioSetRow'

// ---------------------------------------------------------------------------
// TODAY'S CARDIO SESSION, DRAWN AS A SESSION (his request 25 Nov 2026, with his Wednesday Assault Bike card: "cardio
// has never been great to log ... Work on improving how we log cardio. Im taking specifically about the look of it.
// Use your best judgment. How do the best other apps do it and how can we fit that into our aesthetic").
//
// What the best apps share (Strava's activity page, Apple Fitness's workout goal, Nike Run Club): the session's
// numbers are the headline, big, a few at most, each with its label under it; ONE large Start; logging by hand is the
// quiet second way. Fitted to this app: the weight day's hero (the mint kicker, the length on the right, the name with
// its last word lit), the swatch-and-mono numbers of an exercise row, the round bar of the upcoming-day card, and the
// primary button every Start in the app uses. Presentation only: the Start, its timer, the one-tap log (his 24 Sep
// "the plan pre-filled so one tap logs it") and the read-back with Undo are the same components as before.
// ---------------------------------------------------------------------------

type Planned = PlannedActivity & { heldBack?: string | null }

/** One number, big, its unit small beside it and its label under it (Strava's stat block, in the app's swatches). */
function Stat({ value, unit, label, color, testid }: { value: string; unit?: string; label: string; color: string; testid: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5" data-testid={testid}>
      <span className="flex items-baseline gap-1.5">
        <span className="self-center"><Swatch color={color} /></span>
        <span className="tabular-mono text-[1.375rem] font-bold leading-none tracking-[-.02em] text-foreground">{value}</span>
        {unit && <span className="truncate text-[0.75rem] font-medium text-text-tertiary">{unit}</span>}
      </span>
      <span className="mt-1.5 block text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CHANGE IT FOR TODAY (his request 25 Nov 2026: "say for example the user had less time and can't do 8x3 they should
// easily be able to change it to 6x3 ... Let them be able to edit it"). Steppers under the numbers; the figures, the
// bar, the Start and the log all follow; "Back to the plan" puts it back. Kept on the phone for that date only, so a
// tab change keeps it and tomorrow starts from the plan; the plan itself is never written.
// ---------------------------------------------------------------------------

const changeKey = (who: string, date: string, activity: string) => `planned-today-change:${who}:${date}:${activity}`

function readChange(key: string): TodayChange | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as TodayChange : null } catch { return null }
}

function useTodayChange(activity: string): [TodayChange | null, (c: TodayChange | null) => void] {
  const { profileId, date } = useActiveSession()
  const key = changeKey(profileId ?? 'anon', date, activity)
  const [state, setState] = useState<{ key: string; change: TodayChange | null }>(() => ({ key, change: readChange(key) }))
  const change = state.key === key ? state.change : readChange(key)
  const set = (c: TodayChange | null) => {
    try { if (c) localStorage.setItem(key, JSON.stringify(c)); else localStorage.removeItem(key) } catch { /* kept for this visit only */ }
    setState({ key, change: c })
  }
  return [change, set]
}

/** One stepper row: the name, − the value +, each button a 44px target. */
function StepRow({ label, value, onMinus, onPlus, testid }: { label: string; value: string; onMinus: () => void; onPlus: () => void; testid: string }) {
  const btn = 'flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-deep)] text-foreground active:scale-95 transition-transform'
  return (
    <div className="flex items-center justify-between gap-3" data-testid={`planned-adjust-${testid}`}>
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-3">
        <button type="button" className={btn} onClick={onMinus} aria-label={`Less ${label.toLowerCase()}`} data-testid={`planned-adjust-${testid}-minus`}><Minus className="size-4" /></button>
        <span className="w-14 text-center tabular-mono text-[1.0625rem] font-bold text-foreground" data-testid={`planned-adjust-${testid}-value`}>{value}</span>
        <button type="button" className={btn} onClick={onPlus} aria-label={`More ${label.toLowerCase()}`} data-testid={`planned-adjust-${testid}-plus`}><Plus className="size-4" /></button>
      </span>
    </div>
  )
}

/**
 * IT'S YOUR REST DAY (his words 25 Nov 2026, over the optional cardio drawn as a session: "with a banner to say its
 * optional, so users dont think they are being forced into a workout in their rest day"). First thing on the card,
 * before the name, in the recovery colour; it says what skipping costs, which is nothing (a rest day is never missed).
 */
export const OPTIONAL_BANNER = {
  title: 'Optional · rest day',
  body: 'Only if you feel like moving. Skip it and nothing is missed: rest is the plan.',
} as const

function OptionalBanner() {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[14px] px-3 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--role-ai) 14%, transparent)' }}
      data-testid="optional-banner"
    >
      <Heart className="mt-0.5 size-4 shrink-0 text-[color:var(--role-ai-text)]" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-semibold text-foreground">{OPTIONAL_BANNER.title}</span>
        <span className="block text-[0.75rem] leading-[1.45] text-muted-foreground">{OPTIONAL_BANNER.body}</span>
      </span>
    </div>
  )
}

export function PlannedSessionHero({ dayName, focus, planned: asPlanned, optional = false, subtitle, kicker, onDate, previewNote, testid }: {
  dayName: string
  focus: string
  planned: Planned
  /** A rest day's optional cardio: the banner first, and the card never reads as a session owed. */
  optional?: boolean
  /** A line under the title (the optional cardio's choices and pace). */
  subtitle?: string | null
  /** Over the title; "Today · <day>" unless another day's card says its own. */
  kicker?: string
  /** A past day: logged to that date, no timer (it is over), no change for today. */
  onDate?: string
  /** A day to come: the numbers and this line, no Start and no boxes. */
  previewNote?: string
  testid?: string
}) {
  const [change, setChange] = useTodayChange(asPlanned.activity)
  const notToday = !!onDate || !!previewNote
  const [editing, setEditing] = useState(false)
  // THE SESSION AS HE WILL DO IT TODAY, handed to every part below, so the figures, the Start and the log agree.
  const planned = withTodayChange(asPlanned, change)
  const planRounds = plannedRoundsOf(asPlanned)
  const changed = planned !== asPlanned
  const logs = useCardioLogsToday(onDate)
  const done = logs.some(l => l.activity_name === planned.activity)
  const row = plannedSessionRow(planned)
  const rounds = plannedRoundsOf(planned)
  const minutes = sessionMinutesFor(planned.duration, rounds)
  const timerBusy = usePlannedTimerBusy(planned)
  const { name } = splitActivity(planned.activity)
  const key = effortForRpe(planned.targetRpe)
  const title = (focus || name).trim().split(/\s+/)
  const work = rounds ? (rounds.workSeconds % 60 === 0 ? `× ${rounds.workSeconds / 60} min` : `× ${rounds.workSeconds}s`) : ''
  const canEdit = !done && !timerBusy && !notToday
  const stepRounds = (field: 'rounds' | 'work' | 'rest', dir: 1 | -1) => rounds && setChange({ rounds: stepTodayRounds(rounds, field, dir) })
  const stepMinutes = (dir: 1 | -1) => setChange({ minutes: stepTodayMinutes(planned.duration, dir) })
  // WHAT THE PLAN SAID, beside the change, so the change is never mistaken for the plan.
  const planWords = planRounds ? blockShape(planRounds) : `${asPlanned.duration} min`
  return (
    <div className="space-y-3.5" data-testid={testid ?? 'planned-activity'}>
      {optional && <OptionalBanner />}
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[.12em] text-primary-text" data-testid="planned-hero-kicker">{kicker ?? `Today · ${dayName}`}</span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[0.75rem] text-text-tertiary" data-testid="planned-hero-status">
            {done ? 'Done' : <><Clock className="size-3.5" aria-hidden /> {`${minutes} min`}</>}
          </span>
        </div>
        <p className="mt-2 break-words text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]" data-testid="activity-day-title">
          {title.slice(0, -1).join(' ')}{title.length > 1 ? ' ' : ''}
          <span className="text-primary-text glow-text">{title[title.length - 1]}</span>
        </p>
        {subtitle && <p className="mt-1.5 text-[0.8125rem] leading-[1.45] text-muted-foreground" data-testid="planned-hero-subtitle">{subtitle}</p>}
      </div>
      {/* THE NUMBERS, then the rounds as a bar that fills once it is logged (the set bar of an exercise row). */}
      <div className="rounded-[14px] bg-[color:var(--surface-raised)]" data-testid="cardio-prescription">
        <div className={`grid ${rounds ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-[color:var(--hairline)]`}>
          <Stat value={String(minutes)} unit="min" label="Time" color="var(--working-track-done)" testid="planned-stat-time" />
          {rounds && <Stat value={String(rounds.rounds)} unit={work} label="Rounds" color="var(--working-track-done)" testid="planned-stat-rounds" />}
          <Stat value={key ? effortLabel(key) : '—'} label="Effort" color="var(--chart-3)" testid="planned-stat-effort" />
        </div>
        {rounds && (
          <div className="px-3 pb-3">
            <SetBar rampTotal={0} rampDone={0} workingTotal={rounds.rounds} workingDone={done ? rounds.rounds : 0} />
            {/* WHAT THE SEGMENTS ARE, as an exercise row's legend says it. */}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5" data-testid="planned-stat-legend">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Swatch color="var(--working-track-done)" />
                <span className="tabular-mono text-[0.8125rem] font-bold text-foreground">{row.dose}</span>
                <span className="text-[0.75rem] text-text-tertiary">{row.doseWord}</span>
              </span>
              {row.rest && (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Swatch color="var(--working-track-pending)" />
                  <span className="tabular-mono text-[0.8125rem] font-bold text-foreground">{row.rest}</span>
                  <span className="text-[0.75rem] text-text-tertiary">rest</span>
                </span>
              )}
            </span>
          </div>
        )}
      </div>
      {/* CHANGE IT FOR TODAY: one quiet button; open, the steppers; changed, a line naming the plan and the way back. */}
      {canEdit && (editing ? (
        <div className="space-y-2.5 rounded-[14px] border border-[color:var(--hairline)] px-3 py-3" data-testid="planned-adjust">
          {rounds ? (
            <>
              <StepRow label="Rounds" value={String(rounds.rounds)} onMinus={() => stepRounds('rounds', -1)} onPlus={() => stepRounds('rounds', 1)} testid="rounds" />
              <StepRow label="Work" value={clock(rounds.workSeconds)} onMinus={() => stepRounds('work', -1)} onPlus={() => stepRounds('work', 1)} testid="work" />
              <StepRow label="Rest" value={clock(rounds.restSeconds)} onMinus={() => stepRounds('rest', -1)} onPlus={() => stepRounds('rest', 1)} testid="rest" />
            </>
          ) : (
            <StepRow label="Minutes" value={String(planned.duration)} onMinus={() => stepMinutes(-1)} onPlus={() => stepMinutes(1)} testid="minutes" />
          )}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {changed ? (
              <button type="button" className="min-h-11 px-1 text-[0.8125rem] font-semibold text-primary-text" onClick={() => setChange(null)} data-testid="planned-adjust-reset">Back to the plan</button>
            ) : <span />}
            <button type="button" className="min-h-11 px-1 text-[0.8125rem] font-semibold text-foreground" onClick={() => setEditing(false)} data-testid="planned-adjust-done">Done</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="flex min-h-11 items-center gap-1.5 px-0.5 text-[0.8125rem] font-semibold text-primary-text" onClick={() => setEditing(true)} data-testid="planned-adjust-open">
            <Pencil className="size-3.5" aria-hidden /> Change for today
          </button>
          {changed && (
            <span className="text-[0.75rem] text-text-tertiary" data-testid="planned-adjust-note">{`Plan: ${planWords}`}</span>
          )}
        </div>
      ))}
      {planned.heldBack && <p className="text-xs leading-[1.5] text-foreground px-0.5" data-testid="run-held-back">{planned.heldBack}</p>}
      {/* ONE BIG START, the way to do it; the boxes under it are the quiet second way, still one tap for the plan. */}
      <PlannedCardioRow prescription={planned}
        timer={notToday ? undefined : <PlannedSessionStart planned={planned} big />}
        hideEntry={timerBusy}
        hideTitle
        entryLabel={notToday ? (onDate ? 'Did it? Log it' : undefined) : 'Or log it yourself'}
        onDate={onDate}
        previewNote={previewNote}
      />
      {planned.reason && <p className="text-[0.8125rem] leading-[1.5] text-muted-foreground px-0.5" data-testid="planned-reason">{planned.reason}</p>}
    </div>
  )
}
