import { useState } from 'react'
import { ChevronRight, Disc, Minus, Plus } from 'lucide-react'
import {
  stepPlateKg, clampPlateKg, eachSidePlates, PLATE_LOOK, PLATE_INK, PLATE_CARD_BAR_KG, PLATE_CARD_STEP_KG,
  PLATE_CARD_MIN_KG, PLATE_CARD_MAX_KG,
} from '@/lib/tools-card'

// ---------------------------------------------------------------------------
// THE PLATE CARD ON TOOLS — design handoff 2a (31 Oct 2026). A live answer to
// "what goes on the bar", one tap from the full calculator: a ±2.5 kg stepper
// started on her next barbell lift, and the plates for each side as chips in
// competition colours. The chips are plate-math's own greedy pass; the full
// PlateCalculator (every way to load it, any bar) is what the rest of the card
// opens. Changes nothing in the plan, so it is a tool, not an edit.
// ---------------------------------------------------------------------------

const fmtKg = (kg: number) => String(Math.round(kg * 100) / 100)

export function PlateCard({ liftName, startKg, onOpen }: {
  /** The next prescribed barbell lift's name, or null when the plan has none ahead (no name is shown then). */
  liftName: string | null
  /** Where the stepper starts: that lift's weight, or the default. */
  startKg: number
  /** Opens the full calculator on the weight the card is showing. */
  onOpen: (kg: number) => void
}) {
  const [kg, setKg] = useState(() => clampPlateKg(startKg))
  // A new lift (the plan moved on, a session was logged) starts the stepper
  // again; her own taps hold until then.
  const [lastStart, setLastStart] = useState(startKg)
  if (startKg !== lastStart) {
    setLastStart(startKg)
    setKg(clampPlateKg(startKg))
  }
  const plates = eachSidePlates(kg)
  const segment = 'flex size-11 items-center justify-center disabled:opacity-40'

  return (
    <div
      data-plate-card
      className="rounded-[20px] p-3.5"
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-plate-open="title"
          onClick={() => onOpen(kg)}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--chart-2) 14%, transparent)', color: 'var(--role-ai-label)' }}
          >
            <Disc className="size-[17px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-medium">Plate calculator</span>
            {/* Wraps rather than cuts: a lift name is never shown half-spelled. */}
            <span data-plate-lift className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">
              {liftName && <>{liftName} · </>}<span className="whitespace-nowrap">± {PLATE_CARD_STEP_KG} kg</span>
            </span>
          </span>
        </button>
        <span
          className="flex h-11 shrink-0 items-center rounded-xl"
          style={{ background: 'color-mix(in srgb, var(--background) 60%, transparent)', border: '1px solid color-mix(in srgb, var(--chart-2) 35%, transparent)' }}
        >
          <button
            type="button"
            data-plate-step="down"
            aria-label={`${PLATE_CARD_STEP_KG} kg lighter`}
            disabled={kg <= PLATE_CARD_MIN_KG}
            onClick={() => setKg(k => stepPlateKg(k, -1))}
            className={segment}
          >
            <Minus className="size-[15px]" aria-hidden />
          </button>
          <span
            className="flex h-11 min-w-[56px] items-baseline justify-center gap-[3px] px-1 leading-[44px]"
            style={{ borderLeft: '1px solid var(--hairline)', borderRight: '1px solid var(--hairline)' }}
          >
            <span data-plate-kg className="tabular-mono text-base font-bold">{fmtKg(kg)}</span>
            <span className="text-[0.6875rem] text-muted-foreground">kg</span>
          </span>
          <button
            type="button"
            data-plate-step="up"
            aria-label={`${PLATE_CARD_STEP_KG} kg heavier`}
            disabled={kg >= PLATE_CARD_MAX_KG}
            onClick={() => setKg(k => stepPlateKg(k, 1))}
            className={segment}
          >
            <Plus className="size-[15px]" aria-hidden />
          </button>
        </span>
      </div>
      <button
        type="button"
        data-plate-open="plates"
        onClick={() => onOpen(kg)}
        aria-label={`Each side: ${plates.length ? plates.map(p => `${fmtKg(p)} kg`).join(', ') : 'bar only'}. Open the plate calculator`}
        className="mt-3 flex min-h-[44px] w-full items-center gap-2 pt-3 text-left"
        style={{ borderTop: '1px solid var(--hairline)' }}
      >
        <span className="shrink-0 text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">Each side</span>
        <span className="flex min-h-10 min-w-0 flex-wrap items-center gap-1" data-plate-chips>
          {plates.map((p, i) => (
            <span
              key={`${p}-${i}`}
              data-plate-chip={p}
              className="tabular-mono box-border flex items-center justify-center rounded-[7px] px-1.5 font-bold"
              style={{
                height: PLATE_LOOK[p].h,
                minWidth: p >= 10 ? 34 : 28,
                fontSize: p >= 5 ? '0.75rem' : '0.65625rem',
                background: PLATE_LOOK[p].bg,
                color: PLATE_INK,
                // A white or silver plate on a light theme needs an edge to be seen at all.
                border: p === 5 || p === 1.25 ? '1px solid var(--hairline)' : 'none',
              }}
            >
              {fmtKg(p)}
            </span>
          ))}
          {plates.length === 0 && <span className="text-xs text-text-tertiary">Bar only</span>}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 whitespace-nowrap text-[0.71875rem] text-muted-foreground">{PLATE_CARD_BAR_KG} kg bar</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </div>
  )
}
