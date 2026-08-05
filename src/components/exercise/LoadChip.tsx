import { Dumbbell, Info } from 'lucide-react'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// The provenance-styled load chip (LAYOUT-DESIGN.md §1.6.3 / §6.2) — three
// states app-wide, Exercise is the source of truth: 'estimate' (unverified
// standards-table guess), 'known_weight' (a real number the trainee
// reported at onboarding), 'logged' (the live progression engine's
// recommendation from an actual past session — only ever true on today's
// session; browse/peek surfaces never pass this). Bodyweight
// (source === undefined) renders no chip and no ⓘ — there is no load to
// explain.
//
// The ⓘ is an explicit, always-visible affordance wherever a chip exists
// (today's ExercisePlan.tsx made the whole chip a silent role="button" only
// when estimate — this renders a real glyph for every state that has copy).
// ---------------------------------------------------------------------------

export type LoadSource = 'estimate' | 'known_weight' | 'logged'

const ESTIMATE_CHIP_CLASS = 'border-dashed border-muted-foreground/40 text-muted-foreground/70'
const CONFIDENT_CHIP_CLASS = 'border-foreground/25 bg-foreground/5 text-foreground/90 font-medium'

export function loadChipClass(source: LoadSource | undefined): string {
  return source === 'estimate' ? ESTIMATE_CHIP_CLASS : CONFIDENT_CHIP_CLASS
}

export function loadSourceLabel(source: LoadSource | undefined): string | null {
  if (source === 'estimate') return 'suggested'
  if (source === 'known_weight') return 'you told us'
  if (source === 'logged') return 'from your last session'
  return null
}

function explainerFor(source: LoadSource | undefined, loadGuidance?: string): string | null {
  if (source === 'estimate') {
    return "A starting suggestion — we haven't seen you lift yet. Find your real weight and log it; the plan rebuilds from your numbers." + (loadGuidance ? ` ${loadGuidance}` : '')
  }
  if (source === 'known_weight') {
    return 'From what you told us at setup. Log a set and it updates from your real numbers.' + (loadGuidance ? ` ${loadGuidance}` : '')
  }
  if (source === 'logged') {
    return 'Calculated from your last session on this lift.' + (loadGuidance ? ` ${loadGuidance}` : '')
  }
  return null
}

export function LoadChip({
  ex,
  source,
  explained,
  onToggleExplain,
  progressionNote,
}: {
  ex: Exercise
  source: LoadSource | undefined
  explained: boolean
  onToggleExplain: () => void
  /** Progression engine's per-row note (didProgress/hold copy) — today-session only. */
  progressionNote?: { note: string; didProgress: boolean }
}) {
  if (source == null) return null
  const explainer = explainerFor(source, ex.load_guidance)
  const label = loadSourceLabel(source)

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {ex.intensity && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
          {ex.intensity}
        </span>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {ex.per_set_load && ex.per_set_load.length > 0 ? (
          <>
            <Dumbbell className="size-2.5 text-muted-foreground shrink-0" />
            {ex.per_set_load.map(s => (
              <span
                key={s.set_number}
                className={`inline-flex items-center rounded border px-1 py-0 text-[10px] leading-4 ${loadChipClass(source)}`}
                title={s.display}
              >
                S{s.set_number}: {s.load_kg}kg
              </span>
            ))}
            {ex.per_set_load[0].display.includes('per hand') && (
              <span className="text-[10px] text-muted-foreground/70">per hand</span>
            )}
            {ex.per_set_load[0].display.includes('single side') && (
              <span className="text-[10px] text-muted-foreground/70">single side</span>
            )}
          </>
        ) : ex.suggested_load && (
          <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] leading-4 ${loadChipClass(source)}`}>
            <Dumbbell className="size-2.5" />{ex.suggested_load}
          </span>
        )}
        {label && <span className="text-[9px] italic text-muted-foreground/60">{label}</span>}
        {explainer && (
          <button
            type="button"
            onClick={onToggleExplain}
            aria-label="Why this weight"
            className="text-muted-foreground/60 hover:text-muted-foreground"
          >
            <Info className="size-2.5" />
          </button>
        )}
      </div>
      {explained && explainer && (
        <p className="text-[10px] text-muted-foreground/80 italic max-w-xs">{explainer}</p>
      )}
      {progressionNote && (
        <span className={`text-[10px] italic ${progressionNote.didProgress ? 'text-primary' : 'text-muted-foreground/80'}`}>
          {progressionNote.note}
        </span>
      )}
    </div>
  )
}
