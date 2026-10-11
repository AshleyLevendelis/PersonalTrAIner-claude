import { useEffect, useState } from 'react'
import { ChevronLeft, Info, Minus, Plus, Timer, Vibrate, Volume2, VolumeX } from 'lucide-react'
import { DialogTitle } from '@/components/ui/dialog'
import { useTimers } from '@/hooks/useTimers'
import { RoundCard } from '@/components/timers/RoundCard'
import { PresetCards, protocolChoices, selectedChoiceKey } from '@/components/timers/ProtocolChips'
import { roundStyleOf, type RoundConfig, type RoundLogSummary } from '@/lib/timer-engine'
import {
  clock, doneAt, nextCountdown, roundCaption, roundsLabel, startLabel, stepConfig, timelineSegments, workingSeconds,
} from '@/lib/round-setup'

// ---------------------------------------------------------------------------
// THE ROUND-TIMER SETUP SHEET — design handoff 4c (4b is the same sheet,
// interactive), 10 Oct 2026. Replaces the idle RoundCard, the chip row and
// the Custom panel inside the Timers dialog. The running card and the
// full-screen field are unchanged.
//
// WHAT CHANGED IN BEHAVIOUR, and only this:
// - every number is a stepper, and any change is a draft that lights Custom;
// - the countdown is chosen (Off, 5, 10, 15), and the Start button says it;
// - beeps and buzz can be switched off (the round timer only — the rest
//   timer's chime is untouched);
// - "Full screen" no longer starts the round by itself: a switch decides
//   whether Start opens it.
// ---------------------------------------------------------------------------

/** The sheet keeps "now" fresh enough for "done ~HH:MM" without a per-second redraw. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export function RoundTimerSheet({ todaysConfig, live, selected, todaysSessionName, onBack, onLogSession }: {
  /** Today's conditioning as a round, when the plan holds one — the Today card. */
  todaysConfig: RoundConfig | null
  /** A round is running: the preview gives way to the running card, presets queue, steppers lock. */
  live: boolean
  /** What Start would run. */
  selected: RoundConfig
  todaysSessionName?: string | null
  onBack: () => void
  onLogSession: (summary: RoundLogSummary) => void
}) {
  const timers = useTimers()
  // BUILT HERE, NOT ON THE TAB: the card row and its list load with this sheet
  // only, so the Tools tab itself carries none of it (test:bundle).
  const choices = protocolChoices(todaysConfig, timers.customRoundConfig)
  const prefs = timers.timerPrefs
  const now = useMinuteClock()
  const config = selected
  const emom = roundStyleOf(config) === 'emom'
  const litKey = selectedChoiceKey(choices, config)
  const name = choices.find(c => c.key === litKey)?.label ?? 'Custom'
  const segments = timelineSegments(config, prefs.countdownSeconds)
  const gap = segments.length > 40 ? 1 : 2

  // Locked while a round runs by the buttons' own `disabled` — one mechanism.
  const step = (field: 'rounds' | 'work' | 'rest', dir: 1 | -1) => timers.selectRoundConfig(stepConfig(config, field, dir))

  const start = () => {
    // THE COUNTDOWN SHE CHOSE, written onto the run the way startRound always
    // stored it (0 is honoured: `?? 10` only fills a missing value).
    timers.startRound({ ...config, leadInSeconds: prefs.countdownSeconds })
    if (prefs.openFullScreenOnStart) timers.setRoundFullScreen(true)
  }

  const stepRow = (field: 'rounds' | 'work' | 'rest', label: string, sub: string, value: string, isNone = false) => (
    <div className="flex min-h-[66px] items-center gap-2 py-2" style={{ borderBottom: '1px solid var(--hairline)' }} data-step-row={field}>
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-medium">{label}</p>
        <p className="text-[0.71875rem] text-muted-foreground">{sub}</p>
      </div>
      <button
        type="button"
        data-step={field}
        data-dir="down"
        aria-label={`Less ${label.toLowerCase()}`}
        disabled={live}
        onClick={() => step(field, -1)}
        className="flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        style={{ background: 'var(--surface-raised)' }}
      >
        <Minus className="size-[18px]" aria-hidden />
      </button>
      <span
        data-step-value={field}
        className="tabular-mono min-w-[74px] text-center text-[1.5rem] font-bold"
        style={isNone ? { color: 'color-mix(in oklab, var(--chart-2) 62%, white)' } : undefined}
      >
        {value}
      </span>
      <button
        type="button"
        data-step={field}
        data-dir="up"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={live}
        onClick={() => step(field, 1)}
        className="flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        style={{ background: 'var(--surface-raised)' }}
      >
        <Plus className="size-[18px]" aria-hidden />
      </button>
    </div>
  )

  const optionChip = (key: string, icon: React.ReactNode, label: string, state: string, on: boolean, onClick: () => void) => (
    <button
      type="button"
      data-option={key}
      aria-pressed={on}
      onClick={onClick}
      className="flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[0.78125rem]"
      style={{ background: 'var(--surface-raised)' }}
    >
      {icon}
      <span>{label}</span>
      <span className="tabular-mono font-semibold" style={{ color: on ? 'var(--primary-text)' : 'var(--muted-foreground)' }}>{state}</span>
    </button>
  )

  return (
    // MIN-W-0: the dialog body is a grid, and a grid item is as wide as its
    // widest content by default — the preset row is 7 × 98px, so without this
    // the whole sheet was 780px wide and the page scrolled sideways.
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-round-sheet>
      {/* TOP BAR */}
      <div className="relative flex h-[52px] shrink-0 items-center justify-between px-[14px]">
        <button type="button" onClick={onBack} aria-label="Back to the timer list" className="flex h-11 items-center gap-0.5 pr-2 text-[0.8125rem] text-muted-foreground">
          <ChevronLeft className="size-[18px]" aria-hidden /> Timers
        </button>
        <DialogTitle className="pointer-events-none absolute inset-x-0 text-center text-[0.9375rem] font-semibold">Round timer</DialogTitle>
        <button
          type="button"
          data-sound-toggle
          aria-pressed={prefs.beepsOn}
          aria-label={prefs.beepsOn ? 'Beeps on — turn off' : 'Beeps off — turn on'}
          onClick={() => timers.setTimerPrefs({ beepsOn: !prefs.beepsOn })}
          className="flex size-10 items-center justify-center rounded-full"
        >
          {prefs.beepsOn ? <Volume2 className="size-[18px]" aria-hidden /> : <VolumeX className="size-[18px] text-muted-foreground" aria-hidden />}
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <div className="px-[18px]">
          <PresetCards choices={choices} live={live} selected={live ? timers.roundConfig : config} todaysSessionName={todaysSessionName} />
        </div>

        {live ? (
          <div className="px-[18px]">
            <RoundCard live idleConfig={config} onLogSession={onLogSession} />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-[22px]" data-round-preview>
            <div className="flex items-end justify-between gap-3">
              <span
                data-round-total
                className="tabular-mono glow-mint-lg text-[3.5rem] font-bold leading-[0.92] tracking-[-0.04em]"
                style={{ color: 'var(--num-hero)' }}
              >
                {clock(workingSeconds(config))}
              </span>
              <span data-round-done-at className="pb-1 text-[0.75rem] text-muted-foreground">done ~{doneAt(now, config, prefs.countdownSeconds)}</span>
            </div>
            <p data-round-caption className="text-[0.8125rem] text-text-tertiary">{roundCaption(config, name)}</p>
            <div className="flex h-[14px] w-full" style={{ gap }} data-round-timeline aria-hidden>
              {segments.map((s, i) => (
                <span
                  key={i}
                  data-segment={s.kind}
                  className="min-w-px rounded-[3px]"
                  style={{
                    flexGrow: s.seconds,
                    flexBasis: 0,
                    background: s.kind === 'countdown' ? 'var(--chart-2)' : s.kind === 'work' ? 'var(--primary)' : 'color-mix(in srgb, var(--role-warn) 55%, transparent)',
                    boxShadow: s.kind === 'work' ? '0 0 calc(6px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .45)' : undefined,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.6875rem] text-muted-foreground" data-round-legend>
              {prefs.countdownSeconds > 0 && (
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: 'var(--chart-2)' }} />countdown</span>
              )}
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: 'var(--primary)' }} />{emom ? (config.workSeconds === 60 ? 'each minute' : 'each interval') : 'work'}</span>
              {!emom && (
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--role-warn) 55%, transparent)' }} />rest</span>
              )}
            </div>
          </div>
        )}

        <div className="px-[18px]">
          <div style={{ borderTop: '1px solid var(--hairline)' }}>
            {stepRow('rounds', roundsLabel(config), emom ? 'how many intervals' : 'work blocks', String(config.rounds))}
            {stepRow('work', 'Work', 'each interval', clock(config.workSeconds))}
            {stepRow('rest', 'Rest', 'between rounds', config.restSeconds === 0 ? 'None' : clock(config.restSeconds), config.restSeconds === 0)}
          </div>
          {config.restSeconds === 0 && (
            <p
              data-emom-note
              className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-[1.45]"
              style={{ background: 'var(--role-ai-bg)', border: '1px solid var(--role-ai-border)', color: 'var(--role-ai-text)' }}
            >
              <Info className="mt-0.5 size-[15px] shrink-0" aria-hidden />
              No rest makes it an EMOM. Whatever's left of each {config.workSeconds === 60 ? 'minute' : 'interval'} is your rest.
            </p>
          )}
          <div className="mt-3.5 flex flex-wrap gap-2">
            {optionChip('countdown', <Timer className="size-[15px]" aria-hidden />, 'Countdown',
              prefs.countdownSeconds > 0 ? `${prefs.countdownSeconds}s` : 'Off', prefs.countdownSeconds > 0,
              () => timers.setTimerPrefs({ countdownSeconds: nextCountdown(prefs.countdownSeconds) }))}
            {optionChip('beeps', prefs.beepsOn ? <Volume2 className="size-[15px]" aria-hidden /> : <VolumeX className="size-[15px]" aria-hidden />, 'Beeps',
              prefs.beepsOn ? 'On' : 'Off', prefs.beepsOn, () => timers.setTimerPrefs({ beepsOn: !prefs.beepsOn }))}
            {/* NOT OFFERED WHERE IT CANNOT WORK. iPhones have no vibration API;
                a Buzz switch there would be a control that does nothing. */}
            {canVibrate() && optionChip('buzz', <Vibrate className="size-[15px]" aria-hidden />, 'Buzz',
              prefs.buzzOn ? 'On' : 'Off', prefs.buzzOn, () => timers.setTimerPrefs({ buzzOn: !prefs.buzzOn }))}
          </div>
          <p className="mt-3.5 text-[0.71875rem] leading-[1.45] text-muted-foreground">
            Rest between sets runs itself in the session dock — this is for conditioning.
          </p>
        </div>
      </div>

      {!live && (
        <div className="shrink-0 px-[18px] pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--background)' }}>
          <button
            type="button"
            data-round-sheet-start
            onClick={start}
            className="glow-mint-box h-[52px] w-full rounded-[14px] text-[0.9375rem] font-bold"
            style={{
              background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, var(--primary-2) 100%)',
              color: 'var(--primary-foreground)',
            }}
          >
            {startLabel(prefs.countdownSeconds)}
          </button>
          <button
            type="button"
            role="switch"
            data-fullscreen-switch
            aria-checked={prefs.openFullScreenOnStart}
            onClick={() => timers.setTimerPrefs({ openFullScreenOnStart: !prefs.openFullScreenOnStart })}
            className="mx-auto mt-1 flex min-h-[44px] items-center gap-2.5 text-[0.78125rem] text-text-tertiary"
          >
            <span
              className="relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors"
              style={{ background: prefs.openFullScreenOnStart ? 'var(--primary)' : 'rgba(69,60,142,.5)' }}
            >
              <span
                className="absolute top-[2px] size-[14px] rounded-full bg-white transition-[left]"
                style={{ left: prefs.openFullScreenOnStart ? 14 : 2 }}
              />
            </span>
            Open full screen when it starts
          </button>
        </div>
      )}
    </div>
  )
}
