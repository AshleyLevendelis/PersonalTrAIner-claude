// ---------------------------------------------------------------------------
// Standalone timers surface — the stopwatch. (The round setup moved to its own
// sheet, RoundTimerSheet, with design handoff 4c on 10 Oct 2026.)
//
// TURN 12 ("one owner per fact") moved this out of an Exercise-tab dialog into
// the Tools tab. 2a made the round setup chips instead of three number inputs.
// 4a, 13 Sep 2026, took away the last thing holding the three modes together:
// the Stopwatch / Lap / Round tab strip.
//
// WHY THE STRIP HAD TO GO. Round is now the Tools tab's own content — the card
// is permanently on screen and the protocols sit under it — so a tab labelled
// "Round" beside all that was the surface competing with itself. Stopwatch and
// Lap were never two things either: a stopwatch with laps is one timer, and
// splitting it across two tabs meant starting on the wrong one and losing the
// clock to switch. The stopwatch opens on its own from the Timers list.
//
// All state lives in useTimers (deadline-anchored, persisted, ticked by the
// same useDeadlineTick hook the rest timer uses) — this file is presentation.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTimers } from '@/hooks/useTimers'

function formatMs(ms: number, withTenths = false): string {
  const totalMs = Math.max(0, ms)
  const totalSeconds = Math.floor(totalMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!withTenths) return `${minutes}:${seconds.toString().padStart(2, '0')}`
  const tenths = Math.floor((totalMs % 1000) / 100)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

/**
 * Two timers with no explanation is a support question. The rest timer inside
 * a session is automatic and this one is not, and nothing on screen said so.
 */
const TIMER_SCOPE_NOTE = "Your rest timer runs itself inside a session — this is for everything else."

/**
 * THE STOPWATCH, WITH ITS LAPS — one timer, not two tabs.
 *
 * Merged 13 Sep 2026. They shared a clock, a start, a stop and a reset, and
 * differed by one button; being on the wrong one meant resetting to move.
 */
export function StopwatchPanel() {
  const timers = useTimers()
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="tabular-mono text-[2.75rem] font-bold leading-none tracking-[-.03em]">{formatMs(timers.elapsedMs, true)}</div>
      <p className="max-w-[34ch] text-center text-[0.6875rem] leading-[1.45] text-muted-foreground">{TIMER_SCOPE_NOTE}</p>
      <div className="flex gap-2">
        {timers.running ? (
          <>
            <Button className="h-11" onClick={timers.lap}>Lap</Button>
            <Button variant="outline" className="h-11" onClick={timers.stop}>Stop</Button>
          </>
        ) : (
          <Button className="h-11" onClick={timers.start}>{timers.elapsedMs > 0 ? 'Resume' : 'Start'}</Button>
        )}
        <Button variant="outline" className="h-11" onClick={timers.reset} disabled={timers.running && timers.elapsedMs === 0}>
          Reset
        </Button>
      </div>
      {timers.laps.length > 0 && (
        <div className="max-h-48 w-full space-y-1 overflow-y-auto">
          {[...timers.laps].reverse().map(lap => (
            <div key={lap.lapNumber} className="flex justify-between rounded-md bg-muted px-2 py-1 text-sm">
              <span className="text-muted-foreground">Lap {lap.lapNumber}</span>
              <span className="tabular-mono">{formatMs(lap.elapsedMs, true)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ROUND SETUP AS CHIPS — design handoff 2a, 12 Sep 2026; opened in place, 4a.
//
// It was three number inputs. On a phone, in a gym, "how long is a work
// interval" is a question with about seven real answers and typing is the
// worst way to give any of them. So the answers are chips, and the numbers
// stay reachable behind a Custom chip for the protocol nobody anticipated.
//
// REST "NONE" IS THE EMOM PATH, not a new one. Zero rest with style 'emom' is
// exactly what the engine already runs and what the labels already switch on
// — the chip just makes the door visible.
//
// NO START BUTTON AND NO PRESET LIST ANY MORE. Both moved up: the protocols
// are the chip row this panel unfolds beneath, and Start is on the card that
// is already showing the total these chips are changing. Leaving either here
// would be two controls doing one job, six inches apart.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE COUNTDOWN TIMER — his request, 20 Nov 2026: "Add a normal timer that you can set for a set amount of time."
//
// Minutes as chips (the answers people actually give in a gym), minutes and seconds typed for anything else. The
// clock is big enough to read from the floor, as he asked of the round timer the same day. It keeps time through a
// locked phone and a reload (useTimers: the same anchor the stopwatch uses), keeps the screen awake while it runs,
// and beeps and buzzes at zero by the round timer's own Beeps and Buzz switches.
// ---------------------------------------------------------------------------

const COUNTDOWN_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30]

function countdownClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** The length typed into the two boxes, in ms, or null when it is not a time (empty, zero, or over 24 hours). */
export function typedCountdownMs(minutes: string, seconds: string): number | null {
  const m = minutes.trim() === '' ? 0 : Number(minutes)
  const s = seconds.trim() === '' ? 0 : Number(seconds)
  if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || !Number.isInteger(m) || !Number.isInteger(s)) return null
  const total = m * 60 + s
  if (total <= 0 || total > 24 * 3600) return null
  return total * 1000
}

export function CountdownPanel() {
  const timers = useTimers()
  const length = timers.countdownMs
  const remaining = timers.countdownRemainingMs
  const inUse = timers.mode === 'countdown' && length != null && (timers.running || timers.isActive)
  const done = timers.isCountdownDone
  const startMin = length != null ? Math.floor(length / 60000) : 5
  const startSec = length != null ? Math.round((length % 60000) / 1000) : 0
  const [minutes, setMinutes] = useState(String(startMin))
  const [seconds, setSeconds] = useState(startSec ? String(startSec) : '')
  const typed = typedCountdownMs(minutes, seconds)
  const progress = inUse && length ? 1 - (remaining ?? 0) / length : 0

  if (inUse) {
    return (
      <div className="flex flex-col items-center gap-4 py-2" data-countdown={done ? 'done' : timers.running ? 'running' : 'paused'}>
        <div
          role="timer"
          aria-label={done ? "Time's up" : `${countdownClock(remaining ?? 0)} left`}
          className="tabular-mono font-bold leading-none tracking-[-.04em]"
          style={{ fontSize: 'clamp(4rem, 22vw, 6rem)' }}
          data-countdown-clock
        >
          {countdownClock(remaining ?? 0)}
        </div>
        <p className="m-0 text-sm font-semibold" style={{ color: done ? 'var(--primary-text)' : 'var(--muted-foreground)' }}>
          {done ? "Time's up" : timers.running ? `of ${countdownClock(length!)}` : `Paused · of ${countdownClock(length!)}`}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--hairline)' }} aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: 'var(--primary)' }} />
        </div>
        <div className="flex w-full gap-2">
          {done ? (
            <Button className="h-14 flex-1 text-base" onClick={() => timers.startCountdown(length!)} data-countdown-again>
              Again · {countdownClock(length!)}
            </Button>
          ) : timers.running ? (
            <Button className="h-14 flex-1 text-base" onClick={timers.stop}>Pause</Button>
          ) : (
            <Button className="h-14 flex-1 text-base" onClick={timers.start}>Resume</Button>
          )}
          <Button variant="outline" className="h-14 px-6 text-base" onClick={timers.reset} data-countdown-reset>
            {done ? 'Done' : 'Reset'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 py-2" data-countdown="setup">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Minutes">
        {COUNTDOWN_MINUTES.map(m => (
          <Button
            key={m}
            variant="outline"
            className="h-11"
            data-countdown-chip={m}
            onClick={() => timers.startCountdown(m * 60000)}
          >
            {m} min
          </Button>
        ))}
      </div>
      <p className="m-0 text-center text-[0.75rem] text-muted-foreground">Tap a time to start, or set your own:</p>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-[0.75rem] text-muted-foreground">
          Minutes
          <input
            id="countdown-minutes"
            inputMode="numeric"
            className="h-11 rounded-md border bg-background px-3 text-base text-foreground tabular-mono"
            value={minutes}
            onChange={e => setMinutes(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[0.75rem] text-muted-foreground">
          Seconds
          <input
            id="countdown-seconds"
            inputMode="numeric"
            className="h-11 rounded-md border bg-background px-3 text-base text-foreground tabular-mono"
            value={seconds}
            onChange={e => setSeconds(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
          />
        </label>
        <Button className="h-11 px-5" disabled={typed == null} onClick={() => typed != null && timers.startCountdown(typed)} data-countdown-start>
          Start{typed != null ? ` ${countdownClock(typed)}` : ''}
        </Button>
      </div>
    </div>
  )
}
