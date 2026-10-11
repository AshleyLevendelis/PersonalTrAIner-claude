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
            <Button onClick={timers.lap}>Lap</Button>
            <Button variant="outline" onClick={timers.stop}>Stop</Button>
          </>
        ) : (
          <Button onClick={timers.start}>{timers.elapsedMs > 0 ? 'Resume' : 'Start'}</Button>
        )}
        <Button variant="outline" onClick={timers.reset} disabled={timers.running && timers.elapsedMs === 0}>
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
