// ---------------------------------------------------------------------------
// Standalone timers surface — the round setup, and the stopwatch.
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
// clock to switch. So there are two exports now, each mounted where it is
// used: the round setup unfolds under the Custom chip, and the stopwatch opens
// on its own from "Also here".
//
// All state lives in useTimers (deadline-anchored, persisted, ticked by the
// same useDeadlineTick hook the rest timer uses) — this file is presentation.
// ---------------------------------------------------------------------------

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTimers } from '@/hooks/useTimers'
import { secondsPhrase, type RoundConfig } from '@/lib/timer-engine'

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

/** Selected and unselected chip, in tokens. */
function chipStyle(on: boolean): CSSProperties {
  return on
    ? { background: 'rgba(var(--glow-rgb), .14)', border: '1px solid rgba(var(--glow-rgb), .45)', color: 'var(--primary-text)' }
    : { background: 'var(--surface-raised)', border: '1px solid transparent', color: 'var(--text-tertiary)' }
}

function Chip({ on, onClick, children, ...rest }: {
  on: boolean
  onClick: () => void
  children: ReactNode
} & Record<string, unknown>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="min-h-[44px] rounded-xl px-3 text-[0.875rem] font-medium"
      style={chipStyle(on)}
      {...rest}
    >
      {children}
    </button>
  )
}

/** The seconds a work interval can be, as people say them. */
const WORK_CHOICES = [20, 30, 45, 60, 120, 180, 300]
/** And the rest, with None first because it is a protocol, not an absence. */
const REST_CHOICES = [0, 10, 15, 20, 30, 60]

const secondsLabel = (s: number) => s < 60 ? `${s}s` : s === 60 ? '1 min' : `${s / 60} min`

export function RoundSetupPanel({ onDone }: { onDone: () => void }) {
  const timers = useTimers()
  const seed = timers.customRoundConfig ?? timers.selectedRoundConfig
  const [rounds, setRounds] = useState(seed?.rounds ?? 6)
  const [workSeconds, setWorkSeconds] = useState(seed?.workSeconds ?? 60)
  const [restSeconds, setRestSeconds] = useState(seed?.restSeconds ?? 30)
  // CUSTOM IS REACHABLE, both sides. The handoff names it for Work; Rest gets
  // one for the same reason — a 45-second rest is an ordinary prescription
  // and a chip row that cannot express it would send someone back to a screen
  // that no longer exists.
  const [customWork, setCustomWork] = useState(!WORK_CHOICES.includes(seed?.workSeconds ?? 60))
  const [customRest, setCustomRest] = useState(!REST_CHOICES.includes(seed?.restSeconds ?? 30))

  // AN EMOM IS REST = NONE, and nothing else. One fact, derived, rather than a
  // `style` flag kept in step with a number that already says the same thing.
  const isEmom = restSeconds === 0

  /**
   * EVERY TAP WRITES. 4a: "Changing any chip re-reads the card's total live,
   * so the number you're about to commit to is always the one on the card."
   * A Save button would let the card and these chips disagree for as long as
   * it went untapped, which is the whole thing this layout is for.
   */
  const commit = (next: Partial<Pick<RoundConfig, 'rounds' | 'workSeconds' | 'restSeconds'>>) => {
    const merged = { rounds, workSeconds, restSeconds, ...next }
    if (merged.rounds !== rounds) setRounds(merged.rounds)
    if (merged.workSeconds !== workSeconds) setWorkSeconds(merged.workSeconds)
    if (merged.restSeconds !== restSeconds) setRestSeconds(merged.restSeconds)
    timers.setCustomRoundConfig({
      rounds: Math.max(1, merged.rounds),
      workSeconds: Math.max(1, merged.workSeconds),
      restSeconds: Math.max(0, merged.restSeconds),
      ...(merged.restSeconds === 0 ? { style: 'emom' as const } : {}),
    })
  }

  return (
    <div
      data-round-setup
      className="flex flex-col gap-3.5 pb-0.5 pt-3.5"
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      <div>
        <p className="ds-label">Work</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WORK_CHOICES.map(sec => (
            <Chip key={sec} data-work={sec} on={!customWork && workSeconds === sec} onClick={() => { setCustomWork(false); commit({ workSeconds: sec }) }}>
              {secondsLabel(sec)}
            </Chip>
          ))}
          <Chip data-work="custom" on={customWork} onClick={() => setCustomWork(true)}>Custom</Chip>
        </div>
        {customWork && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Seconds
            <Input type="number" min="1" className="w-24" value={String(workSeconds)} onChange={e => commit({ workSeconds: parseInt(e.target.value, 10) || 0 })} />
          </label>
        )}
      </div>

      <div>
        <p className="ds-label">Rest</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REST_CHOICES.map(sec => (
            <Chip key={sec} data-rest={sec} on={!customRest && restSeconds === sec} onClick={() => { setCustomRest(false); commit({ restSeconds: sec }) }}>
              {sec === 0 ? 'None' : secondsLabel(sec)}
            </Chip>
          ))}
          <Chip data-rest="custom" on={customRest} onClick={() => setCustomRest(true)}>Custom</Chip>
        </div>
        {customRest && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Seconds
            <Input type="number" min="0" className="w-24" value={String(restSeconds)} onChange={e => commit({ restSeconds: parseInt(e.target.value, 10) || 0 })} />
          </label>
        )}
        {isEmom && <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">No rest makes it an EMOM.</p>}
      </div>

      <div>
        <p className="ds-label">{isEmom ? (workSeconds === 60 ? 'Minutes' : 'Intervals') : 'Rounds'}</p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            data-rounds-down
            aria-label="One fewer round"
            onClick={() => commit({ rounds: Math.max(1, rounds - 1) })}
            className="rounded-xl text-xl"
            style={{ width: 52, height: 52, ...chipStyle(false) }}
          >
            −
          </button>
          <span className="tabular-mono" style={{ fontSize: '2.125rem', fontWeight: 700, minWidth: '2.5ch', textAlign: 'center' }}>{rounds}</span>
          <button
            type="button"
            data-rounds-up
            aria-label="One more round"
            onClick={() => commit({ rounds: rounds + 1 })}
            className="rounded-xl text-xl"
            style={{ width: 52, height: 52, ...chipStyle(false) }}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span data-round-summary className="text-[0.75rem] text-muted-foreground">
          Saved as your Custom chip · {secondsPhrase({ rounds, workSeconds, restSeconds, ...(isEmom ? { style: 'emom' as const } : {}) })}
        </span>
        <button
          type="button"
          data-round-setup-done
          onClick={onDone}
          className="shrink-0 text-[0.78125rem] font-semibold"
          style={{ color: 'var(--primary-text)' }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
