import { Clock } from 'lucide-react'
import { splitActivity } from '@/lib/cardio-lines'
import { effortForRpe, effortLabel } from '@/lib/cardio-effort'
import { plannedRoundsOf, plannedSessionRow, sessionMinutesFor } from '@/lib/planned-rounds'
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

export function PlannedSessionHero({ dayName, focus, planned }: { dayName: string; focus: string; planned: Planned }) {
  const logs = useCardioLogsToday()
  const done = logs.some(l => l.activity_name === planned.activity)
  const row = plannedSessionRow(planned)
  const rounds = plannedRoundsOf(planned)
  const minutes = sessionMinutesFor(planned.duration, rounds)
  const timerBusy = usePlannedTimerBusy(planned)
  const { name } = splitActivity(planned.activity)
  const key = effortForRpe(planned.targetRpe)
  const title = (focus || name).trim().split(/\s+/)
  const work = rounds ? (rounds.workSeconds % 60 === 0 ? `× ${rounds.workSeconds / 60} min` : `× ${rounds.workSeconds}s`) : ''
  return (
    <div className="space-y-3.5" data-testid="planned-activity">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[.12em] text-primary-text">{`Today · ${dayName}`}</span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[0.75rem] text-text-tertiary" data-testid="planned-hero-status">
            {done ? 'Done' : <><Clock className="size-3.5" aria-hidden /> {`${minutes} min`}</>}
          </span>
        </div>
        <p className="mt-2 break-words text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]" data-testid="activity-day-title">
          {title.slice(0, -1).join(' ')}{title.length > 1 ? ' ' : ''}
          <span className="text-primary-text glow-text">{title[title.length - 1]}</span>
        </p>
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
      {planned.heldBack && <p className="text-xs leading-[1.5] text-foreground px-0.5" data-testid="run-held-back">{planned.heldBack}</p>}
      {/* ONE BIG START, the way to do it; the boxes under it are the quiet second way, still one tap for the plan. */}
      <PlannedCardioRow prescription={planned}
        timer={<PlannedSessionStart planned={planned} big />}
        hideEntry={timerBusy}
        hideTitle
        entryLabel="Or log it yourself"
      />
      {planned.reason && <p className="text-[0.8125rem] leading-[1.5] text-muted-foreground px-0.5" data-testid="planned-reason">{planned.reason}</p>}
    </div>
  )
}
