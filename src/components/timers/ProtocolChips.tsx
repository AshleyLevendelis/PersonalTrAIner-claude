import { Star } from 'lucide-react'
import { useTimers } from '@/hooks/useTimers'
import {
  ROUND_PRESETS, chipNumbers, describeRoundPreset, presetForConfig, sameRoundConfig, sessionRoundNumber, sessionTotalRounds,
  type RoundConfig,
} from '@/lib/timer-engine'

// ---------------------------------------------------------------------------
// THE PROTOCOLS, AS THE WHOLE CONTROL SURFACE — design handoff frame 4a,
// 13 Sep 2026. This replaces the "Change the intervals" row.
//
// WHY THE ROW HAD TO GO. It was one tap to a second screen to choose between
// six things that fit on one line each. On a gym floor that is a tap, a
// scroll, a decision and a tap back, to answer a question ("Tabata or 40/20?")
// that has about six real answers. The chips ARE the answers, they are always
// on screen under the card, and the card's total re-reads the moment one is
// tapped — so the number you are committing to is visible before you commit.
//
// EVERY CHIP CARRIES ITS OWN NUMBERS. "Tabata" alone assumes you know what
// Tabata is; "Tabata · 8×20/10" does not, and the suffix is read from the
// config rather than typed beside it, so a chip cannot come to describe a
// protocol it does not run.
//
// A TAP WHILE RUNNING QUEUES. Never mid-round: the round you are in is the one
// thing you cannot get back. The chip takes an amber badge, the card grows a
// strip saying which round it lands on, and Undo sits inside that strip.
// ---------------------------------------------------------------------------

export interface ProtocolChoice {
  key: string
  label: string
  config: RoundConfig
  /** Today's conditioning gets the star, and comes first. */
  fromToday?: boolean
}

/**
 * The chips, in the order 4a puts them: today's session first when the app
 * can actually read one off the plan, then the protocol table, then Custom.
 */
export function protocolChoices(
  todaysConfig: RoundConfig | null,
  customConfig: RoundConfig | null,
): ProtocolChoice[] {
  const out: ProtocolChoice[] = []
  // FIRST, WHEN IT EXISTS. The one protocol the app already knows she is
  // supposed to be doing today should not be the one she has to go and find.
  if (todaysConfig) out.push({ key: 'today', label: 'Today', config: todaysConfig, fromToday: true })
  // READ FROM THE PRESET TABLE, never a second list beside it — a chip row
  // that could name a protocol the table does not hold is the tile that
  // advertised EMOM before EMOM existed, in a new shape.
  for (const p of ROUND_PRESETS) out.push({ key: p.key, label: p.label, config: p.config })
  out.push({
    key: 'custom',
    label: 'Custom',
    // Her saved values when she has some. The fallback is a plain one-minute
    // round rather than a copy of a preset, so "Custom" never silently reads
    // as a duplicate of the chip beside it.
    config: customConfig ?? { rounds: 6, workSeconds: 60, restSeconds: 30 },
  })
  return out
}

export function ProtocolChips({ choices, live, selected, customOpen, onOpenCustom }: {
  choices: ProtocolChoice[]
  /** A round is running, so a tap queues rather than selects. */
  live: boolean
  /**
   * What is chosen right now — passed in rather than read from the provider,
   * because the tab resolves "nothing chosen yet" to today's conditioning or
   * the first protocol, and the card and the chips have to agree about that
   * fallback or the card describes a protocol no chip is showing as picked.
   */
  selected: RoundConfig | null
  customOpen: boolean
  onOpenCustom: (open: boolean) => void
}) {
  const timers = useTimers()
  const active = live ? timers.roundConfig : selected
  const queued = timers.queuedRoundConfig

  // Which round a queued switch would land on, said the same way the card
  // says it — one derivation, so the badge and the strip cannot disagree.
  const landsOn = live && timers.roundConfig
    ? Math.min(sessionRoundNumber(timers.roundConfig, timers.currentRound) + 1, sessionTotalRounds(timers.roundConfig))
    : 0

  const onTap = (choice: ProtocolChoice) => {
    if (choice.key === 'custom') { onOpenCustom(!customOpen); return }
    onOpenCustom(false)
    if (live) timers.queueRoundConfig(choice.config)
    else timers.selectRoundConfig(choice.config)
  }

  return (
    <div className="flex flex-wrap gap-2" data-protocol-chips>
      {choices.map(choice => {
        // THE CUSTOM CHIP IS ON WHEN ITS PANEL IS OPEN or when what is
        // selected is genuinely custom — a config that matches no preset. A
        // bare numbers match would light Custom whenever her saved numbers
        // happened to equal a preset's, showing two chips selected at once.
        const on = choice.key === 'custom'
          ? customOpen || (!!active && !presetForConfig(active) && sameRoundConfig(active, choice.config))
          : !!active && sameRoundConfig(active, choice.config)
        const isQueued = !!queued && sameRoundConfig(queued, choice.config)
        return (
          <button
            key={choice.key}
            type="button"
            data-protocol={choice.key}
            aria-pressed={on}
            title={choice.key === 'custom' ? undefined : describeRoundPreset({ key: choice.key, label: choice.label, config: choice.config })}
            onClick={() => onTap(choice)}
            className="flex items-center gap-[7px] rounded-full px-[13px] text-[0.8125rem] font-semibold"
            style={{
              height: 44,
              background: on ? 'rgba(var(--glow-rgb), .14)' : 'var(--surface-raised)',
              border: isQueued
                ? '1px solid var(--role-warn)'
                : on ? '1px solid rgba(var(--glow-rgb), .45)' : '1px solid transparent',
              color: on ? 'var(--primary-text)' : 'var(--foreground)',
            }}
          >
            {choice.fromToday && <Star className="size-[13px] shrink-0" aria-hidden />}
            {choice.label}
            <span
              className="tabular-mono text-[0.6875rem] font-medium"
              style={{ color: on ? 'color-mix(in srgb, var(--primary-text) 75%, transparent)' : 'var(--muted-foreground)' }}
            >
              {chipNumbers(choice.config, choice.label)}
            </span>
            {isQueued && (
              <span
                data-protocol-queued-badge
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold"
                style={{ background: 'var(--role-warn)', color: 'var(--phase-rest-ink)' }}
              >
                from round {landsOn}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
