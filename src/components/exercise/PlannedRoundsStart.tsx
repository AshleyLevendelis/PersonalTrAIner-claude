import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Timer } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTimers } from '@/hooks/useTimers'
import { blockShape, type RoundConfig } from '@/lib/timer-engine'
import { startLabel } from '@/lib/round-setup'
import type { EffortKey } from '@/lib/cardio-effort'
import { tabHash } from '@/lib/app-route'
import { PLANNED_ROUNDS_WORDS, plannedRoundsOf, roundIsPlannedSession } from '@/lib/planned-rounds'
import { EffortBox, logPlannedRound, logPlannedTimed, useCardioLogsToday } from './CardioSetRow'

// ---------------------------------------------------------------------------
// START THE PLANNED ROUNDS, AND LOG THEM WHEN THEY END (Ashley, 23 Nov 2026, option A): "you could just start the
// workout, it starts the round timer, you do the exercises, and you log it completed at the end."
//
// Sits above the session's ordinary row (PlannedCardioRow), which stays as the way to log it without the timer and is
// what reads the session back as done: the effort tap here writes the same activity name that row reads.
// ---------------------------------------------------------------------------

type Planned = { activity: string; targetRpe?: number; rounds?: { rounds: number; workSeconds: number; restSeconds: number }; reason?: string; duration?: number }

/** THE EFFORT QUESTION AT THE END, one tap logs it. Used on the day's card and in the round timer's own sheet. */
export function PlannedRoundEffort({ planned, config, onLogged }: { planned: Planned; config: RoundConfig; onLogged?: () => void }) {
  const { profileId, date } = useActiveSession()
  const timers = useTimers()
  const [error, setError] = useState<string | null>(null)
  const log = (effort: EffortKey) => {
    if (!profileId) return
    // Released only after the write: resetting first is what threw a finished round away before (ToolsTab's logSheet).
    if (!logPlannedRound({ profileId, date, planned, config, effort })) { setError("That didn't save — try again in a moment."); return }
    timers.reset()
    onLogged?.()
  }
  return (
    <div className="space-y-1.5" data-testid="planned-rounds-effort">
      <p className="text-sm font-medium text-foreground px-0.5">{PLANNED_ROUNDS_WORDS.howHard}</p>
      <EffortBox effort={null} onEffort={log} subject={planned.activity} />
      {error && <p className="text-[0.625rem] text-destructive px-1">{error}</p>}
    </div>
  )
}

/**
 * WHERE THIS SESSION'S ROUNDS ARE: none (not intervals, or logged already), idle (Start), mine (its round is running),
 * done (its round has ended, the effort question), busy (another round is running). One answer for the card's Start
 * and for the row under it, which steps aside while the timer runs or asks, so the card never offers two ways to log.
 */
export function usePlannedRound(planned: Planned | null | undefined): 'none' | 'idle' | 'mine' | 'done' | 'busy' {
  const { date } = useActiveSession()
  const timers = useTimers()
  const logs = useCardioLogsToday()
  if (!planned || !plannedRoundsOf(planned)) return 'none'
  // LOGGED ALREADY: the row reads it back; nothing left to start.
  if (logs.some(l => l.activity_name === planned.activity)) return 'none'
  const live = timers.mode === 'round' && !!timers.roundConfig && (timers.running || timers.isRoundComplete || timers.isActive)
  if (!live) return 'idle'
  if (!roundIsPlannedSession(timers.roundConfig, planned.activity, date)) return 'busy'
  return timers.isRoundComplete ? 'done' : 'mine'
}

export function PlannedRoundsStart({ planned }: { planned: Planned }) {
  const { date } = useActiveSession()
  const timers = useTimers()
  const state = usePlannedRound(planned)
  const config = plannedRoundsOf(planned)
  if (state === 'none' || !config) return null
  const openIt = () => { timers.setRoundFullScreen(true); window.location.hash = tabHash('tools') }

  if (state === 'done' && timers.roundConfig) {
    return <PlannedRoundEffort planned={planned} config={timers.roundConfig} />
  }
  if (state === 'mine' || state === 'busy') {
    const mine = state === 'mine'
    // A ROUND ALREADY RUNNING IS NEVER RESTARTED (the chat's timer button's rule): this one opens it.
    return (
      <Button variant="outline" className="w-full min-h-11 gap-2" data-testid="planned-rounds-open" onClick={openIt}>
        <Timer className="size-4" />
        {mine ? PLANNED_ROUNDS_WORDS.running : 'A round is running · Open it'}
      </Button>
    )
  }
  const lead = timers.timerPrefs.countdownSeconds
  return (
    <Button
      className="w-full min-h-11 gap-2"
      data-testid="planned-rounds-start"
      onClick={() => {
        timers.startRound({ ...config, leadInSeconds: lead, planned: { activity: planned.activity, date } })
        openIt()
      }}
    >
      <Play className="size-4" />
      {`${blockShape(config)} · ${startLabel(lead)}`}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// A TIMED SESSION RUNS ON A TIMER TOO (his message 24 Nov 2026): "if I say add a 30min jog to my plan it could add a
// workout with timer built in", and the optional cardio on a rest day the same. A session that is not rounds but has
// minutes gets Start: the countdown at those minutes, tagged with the session. When it reaches zero, or he stops it,
// one effort tap logs the minutes it actually ran under the session's name, as the round's tap does.
// ---------------------------------------------------------------------------

/** The minutes a timed session's countdown runs, or null for rounds (the round timer's) or no minutes. */
export function plannedTimedMinutes(planned: Planned | null | undefined): number | null {
  if (!planned || plannedRoundsOf(planned)) return null
  const m = Number(planned.duration)
  return Number.isFinite(m) && m >= 1 && m <= 240 ? Math.round(m) : null
}

/** none (not timed, or logged already), idle (Start), mine (its countdown runs), done (stopped or finished: the effort question), busy (another timer is live). */
export function usePlannedTimed(planned: Planned | null | undefined): 'none' | 'idle' | 'mine' | 'done' | 'busy' {
  const { date } = useActiveSession()
  const timers = useTimers()
  const logs = useCardioLogsToday()
  if (!planned || plannedTimedMinutes(planned) == null) return 'none'
  if (logs.some(l => l.activity_name === planned.activity)) return 'none'
  const tag = timers.countdownPlanned
  const mineTag = timers.mode === 'countdown' && !!tag && tag.activity === planned.activity && tag.date === date
  if (mineTag) {
    if (timers.running) return 'mine'
    if (timers.elapsedMs > 0 || timers.isCountdownDone) return 'done'
    return 'idle'
  }
  // ANOTHER TIMER IS LIVE: never started over (the chat's timer button's rule).
  if (timers.running || timers.isActive) return 'busy'
  return 'idle'
}

/** THE QUESTION AT THE END of a timed session, one tap logs it. On the day's card and under the countdown on Tools. */
export function PlannedTimedEffort({ planned, onLogged }: { planned: Planned; onLogged?: () => void }) {
  const { profileId, date } = useActiveSession()
  const timers = useTimers()
  const [error, setError] = useState<string | null>(null)
  const minutes = Math.max(1, Math.round(timers.elapsedMs / 60000))
  const log = (effort: EffortKey) => {
    if (!profileId) return
    if (!logPlannedTimed({ profileId, date, planned, minutes, effort })) { setError("That didn't save — try again in a moment."); return }
    timers.reset()
    onLogged?.()
  }
  return (
    <div className="space-y-1.5" data-testid="planned-timed-effort">
      <p className="text-sm font-medium text-foreground px-0.5">{`${minutes} min · ${PLANNED_ROUNDS_WORDS.howHard}`}</p>
      <EffortBox effort={null} onEffort={log} subject={planned.activity} />
      {!timers.isCountdownDone && (
        <Button variant="ghost" className="w-full min-h-11 text-muted-foreground" data-testid="planned-timed-resume" onClick={() => timers.start()}>
          Keep going
        </Button>
      )}
      {error && <p className="text-[0.625rem] text-destructive px-1">{error}</p>}
    </div>
  )
}

export function PlannedTimedStart({ planned }: { planned: Planned }) {
  const { date } = useActiveSession()
  const timers = useTimers()
  const state = usePlannedTimed(planned)
  const minutes = plannedTimedMinutes(planned)
  if (state === 'none' || minutes == null) return null
  const openIt = () => { window.location.hash = tabHash('tools'); timers.requestScreenOpen() }
  if (state === 'done') return <PlannedTimedEffort planned={planned} />
  if (state === 'mine' || state === 'busy') {
    const mine = state === 'mine'
    return (
      <div className="space-y-1.5">
        <Button variant="outline" className="w-full min-h-11 gap-2" data-testid="planned-timed-open" onClick={openIt}>
          <Timer className="size-4" />
          {mine ? 'Timer running · Open it' : 'A timer is running · Open it'}
        </Button>
        {mine && (
          <Button variant="ghost" className="w-full min-h-11 text-muted-foreground" data-testid="planned-timed-finish" onClick={() => timers.stop()}>
            Finish and log it
          </Button>
        )}
      </div>
    )
  }
  return (
    <Button
      className="w-full min-h-11 gap-2"
      data-testid="planned-timed-start"
      onClick={() => { timers.startCountdown(minutes * 60_000, { activity: planned.activity, date }); openIt() }}
    >
      <Play className="size-4" />
      {`Start ${minutes} min timer`}
    </Button>
  )
}

/** THE START FOR ANY PLANNED CARDIO: the round timer for rounds, the countdown for minutes. */
export function PlannedSessionStart({ planned }: { planned: Planned }) {
  return plannedRoundsOf(planned) ? <PlannedRoundsStart planned={planned} /> : <PlannedTimedStart planned={planned} />
}

/** While the session's timer runs or asks how hard it was, the row's boxes step aside: one way to log at a time. */
export function usePlannedTimerBusy(planned: Planned | null | undefined): boolean {
  const round = usePlannedRound(planned)
  const timed = usePlannedTimed(planned)
  return round === 'mine' || round === 'done' || timed === 'mine' || timed === 'done'
}

/** Under the countdown on Tools: a planned session's countdown, finished or stopped, asks its one question there too. */
export function PlannedCountdownLog({ planned }: { planned: Planned | null }) {
  const state = usePlannedTimed(planned)
  if (!planned || state !== 'done') return null
  return <PlannedTimedEffort planned={planned} />
}
