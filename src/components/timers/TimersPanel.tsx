// ---------------------------------------------------------------------------
// Standalone timers surface — stopwatch, lap, and round modes. Turn 12 ("one
// owner per fact") moved this from an Exercise-tab dialog into the Tools
// tab as an inline panel — TimersPanel is the content, no Dialog wrapper;
// ToolsTab.tsx mounts it directly. All state lives in useTimers
// (deadline-anchored, persisted, ticked by the same useDeadlineTick hook the
// rest timer uses) — this component is presentation only.
// ---------------------------------------------------------------------------

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTimers, ROUND_LEAD_IN_SECONDS } from '@/hooks/useTimers'
import { parseConditioningInterval, ROUND_PRESETS, describeRoundPreset, type RoundConfig, type RoundPreset } from '@/lib/timer-engine'
import type { WorkoutDay } from '@/lib/types'

function formatMs(ms: number, withTenths = false): string {
  const totalMs = Math.max(0, ms)
  const totalSeconds = Math.floor(totalMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!withTenths) return `${minutes}:${seconds.toString().padStart(2, '0')}`
  const tenths = Math.floor((totalMs % 1000) / 100)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

export function TimersPanel({
  todaysConditioning,
}: {
  /** Today's conditioning prescription, if any — offers a one-tap prefill for the round timer when it parses as a structured interval. */
  todaysConditioning?: WorkoutDay['recommendedCardio']
}) {
  const timers = useTimers()
  const prefill = parseConditioningInterval(todaysConditioning?.activity)

  return (
    <Tabs value={timers.mode} onValueChange={v => timers.setMode(v as typeof timers.mode)}>
      {/* A HAIRLINE UNDERLINE, not a filled 3-up. Tools was the last tab
          still on bordered cards and a filled segmented control, which made
          it read as a different app's screen. Underlined labels are the same
          affordance at a fraction of the ink. */}
      <TabsList className="grid w-full grid-cols-3 gap-0 rounded-none bg-transparent p-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
        {(['stopwatch', 'lap', 'round'] as const).map(mode => (
          <TabsTrigger
            key={mode}
            value={mode}
            className="rounded-none border-0 bg-transparent px-0 pb-2 text-[0.8125rem] capitalize shadow-none data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[color:var(--primary-text)] data-[state=active]:shadow-[inset_0_-2px_0_0_var(--primary)]"
          >
            {mode}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="stopwatch">
        <StopwatchPanel />
      </TabsContent>
      <TabsContent value="lap">
        <LapPanel />
      </TabsContent>
      <TabsContent value="round">
        <RoundPanel prefill={prefill} />
      </TabsContent>
    </Tabs>
  )
}

/**
 * Two timers with no explanation is a support question. The rest timer inside
 * a session is automatic and this one is not, and nothing on screen said so.
 */
const TIMER_SCOPE_NOTE = "Your rest timer runs itself inside a session — this is for everything else."

function StopwatchPanel() {
  const timers = useTimers()
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="tabular-mono text-[2.75rem] font-bold leading-none tracking-[-.03em]">{formatMs(timers.elapsedMs, true)}</div>
      <p className="max-w-[34ch] text-center text-[0.6875rem] leading-[1.45] text-muted-foreground">{TIMER_SCOPE_NOTE}</p>
      <div className="flex gap-2">
        {timers.running ? (
          <Button onClick={timers.stop}>Stop</Button>
        ) : (
          <Button onClick={timers.start}>{timers.elapsedMs > 0 ? 'Resume' : 'Start'}</Button>
        )}
        <Button variant="outline" onClick={timers.reset} disabled={timers.running && timers.elapsedMs === 0}>
          Reset
        </Button>
      </div>
    </div>
  )
}

function LapPanel() {
  const timers = useTimers()
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="ds-num-hero tabular-mono">{formatMs(timers.elapsedMs, true)}</div>
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
        <div className="w-full max-h-48 overflow-y-auto space-y-1">
          {[...timers.laps].reverse().map(lap => (
            <div key={lap.lapNumber} className="flex justify-between text-sm px-2 py-1 rounded-md bg-muted">
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
// ROUND SETUP AS CHIPS — design handoff 2a, 12 Sep 2026.
//
// It was three number inputs. On a phone, in a gym, "how long is a work
// interval" is a question with about seven real answers and typing is the
// worst way to give any of them. So the answers are chips, and the numbers
// stay reachable behind a Custom chip for the protocol nobody anticipated.
//
// REST "NONE" IS THE EMOM PATH, not a new one. Zero rest with style 'emom' is
// exactly what the engine already runs and what the labels already switch on
// — the chip just makes the door visible.
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

function RoundPanel({ prefill }: { prefill: RoundConfig | null }) {
  const timers = useTimers()
  const [rounds, setRounds] = useState(prefill?.rounds ?? timers.roundConfig?.rounds ?? 8)
  const [workSeconds, setWorkSeconds] = useState(prefill?.workSeconds ?? timers.roundConfig?.workSeconds ?? 30)
  const [restSeconds, setRestSeconds] = useState(prefill?.restSeconds ?? timers.roundConfig?.restSeconds ?? 30)
  // CUSTOM IS REACHABLE, both sides. The handoff names it for Work; Rest gets
  // one for the same reason — a 45-second rest is an ordinary prescription
  // and a chip row that cannot express it would send someone back to a screen
  // that no longer exists.
  const [customWork, setCustomWork] = useState(false)
  const [customRest, setCustomRest] = useState(false)

  // AN EMOM IS REST = NONE, and nothing else. One fact, derived, rather than a
  // `style` flag kept in step with a number that already says the same thing.
  const isEmom = restSeconds === 0

  const applyPreset = (p: RoundPreset) => {
    setRounds(p.config.rounds)
    setWorkSeconds(p.config.workSeconds)
    setRestSeconds(p.config.restSeconds)
    setCustomWork(!WORK_CHOICES.includes(p.config.workSeconds))
    setCustomRest(!REST_CHOICES.includes(p.config.restSeconds))
  }

  const applyPrefill = () => {
    if (!prefill) return
    setRounds(prefill.rounds)
    setWorkSeconds(prefill.workSeconds)
    setRestSeconds(prefill.restSeconds)
    setCustomWork(!WORK_CHOICES.includes(prefill.workSeconds))
    setCustomRest(!REST_CHOICES.includes(prefill.restSeconds))
  }

  const handleStart = () => {
    timers.startRound({
      rounds: Math.max(1, rounds),
      workSeconds: Math.max(1, workSeconds),
      restSeconds: Math.max(0, restSeconds),
      ...(isEmom ? { style: 'emom' as const } : {}),
    })
  }

  // The block's own length, by the engine's rule: no rest hangs off the end.
  const totalSeconds = isEmom
    ? rounds * workSeconds
    : rounds * workSeconds + (rounds - 1) * restSeconds
  const totalLabel = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
  const summary = isEmom
    ? `${rounds} × every ${secondsLabel(workSeconds)}`
    : `${rounds} × ${secondsLabel(workSeconds)} work · ${secondsLabel(restSeconds)} rest`

  return (
    <div className="flex flex-col gap-5 py-4">
      {prefill && (
        <Button variant="outline" size="sm" className="min-h-11" onClick={applyPrefill}>
          Use today's · {prefill.rounds} × {prefill.workSeconds}/{prefill.restSeconds}
        </Button>
      )}

      <div>
        <p className="ds-label">Start from a protocol</p>
        {/* THEY FILL THE CHIPS, THEY DO NOT START. Unchanged behaviour, and
            deliberately: the choice stays on screen and stays editable, so a
            preset is a shortcut rather than a black box. */}
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {ROUND_PRESETS.map(p => (
            <Chip
              key={p.key}
              data-preset={p.key}
              on={p.config.rounds === rounds && p.config.workSeconds === workSeconds && p.config.restSeconds === restSeconds}
              onClick={() => applyPreset(p)}
            >
              <span className="block text-left">{p.label}</span>
              <span className="block text-left text-[0.6875rem] font-normal opacity-70">{describeRoundPreset(p)}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="ds-label">Work</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {WORK_CHOICES.map(sec => (
            <Chip key={sec} data-work={sec} on={!customWork && workSeconds === sec} onClick={() => { setCustomWork(false); setWorkSeconds(sec) }}>
              {secondsLabel(sec)}
            </Chip>
          ))}
          <Chip data-work="custom" on={customWork} onClick={() => setCustomWork(true)}>Custom</Chip>
        </div>
        {customWork && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Seconds
            <Input type="number" min="1" className="w-24" value={String(workSeconds)} onChange={e => setWorkSeconds(parseInt(e.target.value, 10) || 0)} />
          </label>
        )}
      </div>

      <div>
        <p className="ds-label">Rest</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {REST_CHOICES.map(sec => (
            <Chip key={sec} data-rest={sec} on={!customRest && restSeconds === sec} onClick={() => { setCustomRest(false); setRestSeconds(sec) }}>
              {sec === 0 ? 'None' : secondsLabel(sec)}
            </Chip>
          ))}
          <Chip data-rest="custom" on={customRest} onClick={() => setCustomRest(true)}>Custom</Chip>
        </div>
        {customRest && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Seconds
            <Input type="number" min="0" className="w-24" value={String(restSeconds)} onChange={e => setRestSeconds(parseInt(e.target.value, 10) || 0)} />
          </label>
        )}
        {isEmom && (
          <p className="mt-2 text-xs text-muted-foreground">
            Every {workSeconds} seconds a new one starts. Finish the work, and whatever is left is your rest.
          </p>
        )}
      </div>

      <div>
        <p className="ds-label">{isEmom ? (workSeconds === 60 ? 'Minutes' : 'Intervals') : 'Rounds'}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="button"
            data-rounds-down
            aria-label="One fewer round"
            onClick={() => setRounds(r => Math.max(1, r - 1))}
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
            onClick={() => setRounds(r => r + 1)}
            className="rounded-xl text-xl"
            style={{ width: 52, height: 52, ...chipStyle(false) }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--hairline)' }} className="pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span data-round-summary className="text-[0.8125rem] text-muted-foreground">{summary}</span>
          <span className="tabular-mono text-[0.9375rem] font-semibold" style={{ color: 'var(--primary-text)' }}>{totalLabel}</span>
        </div>
        <Button className="mt-3 w-full" style={{ height: 56 }} onClick={handleStart}>
          Start · {ROUND_LEAD_IN_SECONDS}s countdown
        </Button>
        {/* SAY IT BEFORE IT HAPPENS. The countdown is a deliberate delay, and
            an app that pauses for ten seconds without having said it would is
            indistinguishable from one that has not started. */}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Tap the screen to go sooner.
        </p>
      </div>
    </div>
  )
}
