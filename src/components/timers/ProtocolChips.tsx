import { useLayoutEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { useTimers } from '@/hooks/useTimers'
import {
  ROUND_PRESETS, chipNumbers, describeRoundPreset, roundStyleOf, sameRoundConfig, sessionRoundNumber, sessionTotalRounds,
  type RoundConfig,
} from '@/lib/timer-engine'
import { clock, workingSeconds } from '@/lib/round-setup'

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

/**
 * WHICH CARD IS LIT — 4c. The first card whose numbers ARE the selection:
 * Today, then the table. Nothing matching means the selection is her own
 * numbers, and that is the Custom card.
 */
export function selectedChoiceKey(choices: ProtocolChoice[], active: RoundConfig | null): string | null {
  if (!active) return null
  return choices.find(c => c.key !== 'custom' && sameRoundConfig(c.config, active))?.key ?? 'custom'
}

/**
 * THE PRESET CARDS — design handoff 4c, 10 Oct 2026, replacing the chip row.
 *
 * A horizontal row of 98×76 cards: the name, the numbers (chipNumbers, read
 * from the config so a card cannot describe a protocol it does not run), and
 * a sub-line — the total, "every 1:00" for an EMOM, "from {session}" for
 * Today, and "save as preset" on Custom while her numbers are an unsaved draft.
 *
 * CUSTOM HAPPENS BY ITSELF. Any stepper change makes the selection a draft
 * that matches no preset, which lights Custom with the draft's numbers; a
 * tap on Custom then saves it. Step back onto a preset's numbers and that
 * preset lights instead. A tap while a round is running still QUEUES.
 */
export function PresetCards({ choices, live, selected, todaysSessionName }: {
  choices: ProtocolChoice[]
  live: boolean
  /** What Start would run (idle) — the tab resolves "nothing chosen" once, for the preview and the cards. */
  selected: RoundConfig | null
  /** The plan's name for today's session, for the Today card's "from …". */
  todaysSessionName?: string | null
}) {
  const timers = useTimers()
  const active = live ? timers.roundConfig : selected
  const queued = timers.queuedRoundConfig
  const litKey = selectedChoiceKey(choices, active)
  const saved = timers.customRoundConfig
  // A DRAFT is a selection that matches no card and is not what she saved.
  const isDraft = !live && litKey === 'custom' && !!active && !(saved && sameRoundConfig(saved, active))
  const rowRef = useRef<HTMLDivElement>(null)

  const landsOn = live && timers.roundConfig
    ? Math.min(sessionRoundNumber(timers.roundConfig, timers.currentRound) + 1, sessionTotalRounds(timers.roundConfig))
    : 0

  // THE LIT CARD IS ON SCREEN — when the sheet opens and whenever a stepper
  // moves the light to another card (Custom sits at the far end). By
  // scrollLeft, not scrollIntoView, which would also scroll the sheet itself.
  useLayoutEffect(() => {
    const row = rowRef.current
    const card = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !card) return
    const left = card.offsetLeft - row.offsetLeft
    if (left < row.scrollLeft || left + card.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, left - 18)
  }, [litKey])

  const onTap = (choice: ProtocolChoice) => {
    let config = choice.config
    if (choice.key === 'custom') {
      // SAVE THE DRAFT, or bring back what she saved.
      if (isDraft && active) { timers.setCustomRoundConfig(active); return }
      config = saved ?? choice.config
    }
    if (live) timers.queueRoundConfig(config)
    else timers.selectRoundConfig(config)
  }

  return (
    <div
      ref={rowRef}
      data-protocol-chips
      className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {choices.map(choice => {
        const on = litKey === choice.key
        const isQueued = !!queued && sameRoundConfig(queued, choice.config)
        const shown = choice.key === 'custom' && isDraft && active ? active : choice.key === 'custom' ? (saved ?? choice.config) : choice.config
        const sub = choice.fromToday
          ? (todaysSessionName ? `from ${todaysSessionName}` : 'from your plan')
          : choice.key === 'custom' && isDraft
            ? 'save as preset'
            : roundStyleOf(shown) === 'emom'
              ? `every ${clock(shown.workSeconds)}`
              : clock(workingSeconds(shown))
        return (
          <button
            key={choice.key}
            type="button"
            data-protocol={choice.key}
            aria-pressed={on}
            title={choice.key === 'custom' ? undefined : describeRoundPreset({ key: choice.key, label: choice.label, config: choice.config })}
            onClick={() => onTap(choice)}
            className="relative flex h-[76px] w-[98px] shrink-0 flex-col justify-between rounded-[14px] px-[11px] py-[10px] text-left"
            style={{
              background: on ? 'rgba(var(--glow-rgb), .14)' : 'var(--surface-raised)',
              boxShadow: isQueued
                ? 'inset 0 0 0 1.5px var(--role-warn)'
                : on ? 'inset 0 0 0 1.5px var(--primary), 0 0 calc(16px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .25)' : undefined,
            }}
          >
            <span className="flex items-center gap-1 text-[0.8125rem] font-semibold" style={{ color: on ? 'var(--primary-text)' : 'var(--foreground)' }}>
              {choice.fromToday && <Star className="size-[12px] shrink-0" aria-hidden />}
              {choice.label}
            </span>
            <span className="block">
              <span className="tabular-mono block text-[0.6875rem] text-text-tertiary">{chipNumbers(shown, choice.label)}</span>
              <span className="block truncate text-[0.625rem] text-muted-foreground">{sub}</span>
            </span>
            {isQueued && (
              <span
                data-protocol-queued-badge
                className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-semibold"
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
