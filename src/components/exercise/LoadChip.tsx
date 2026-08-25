import { Dumbbell, Info, Timer } from 'lucide-react'
import { describeTempo } from '@/lib/periodization'
import type { Exercise } from '@/lib/types'
import type { PrescribedLoadSource } from '@/lib/load-prescription'

// ---------------------------------------------------------------------------
// The provenance-styled load chip (LAYOUT-DESIGN.md §1.6.3 / §6.2) — four
// states app-wide, Exercise is the source of truth:
//
//   'assumed_body'  a standards guess we could not build from this person's
//                   body, because they declined a weight/age/sex. Held
//                   deliberately low (load-prescription.ts's
//                   assumedBodyConservatism) and labelled as such.
//   'estimate'      a standards guess from body metrics they DID give.
//   'known_weight'  a real number the trainee reported at onboarding.
//   'logged'        the live progression engine's recommendation from an
//                   actual past session — only ever true on today's session;
//                   browse/peek surfaces never pass this.
//
// Bodyweight (source === undefined) renders no chip and no ⓘ — there is no
// load to explain.
//
// 'assumed_body' was split out of 'estimate' because one word was covering
// two very different claims. A 55kg woman who declined her weight was shown
// a 30-year-old man's squat under the label "suggested" — the same word used
// for a number derived from her own body. The chip is the last place that
// distinction is visible to her, so it has to carry it.
//
// The ⓘ is an explicit, always-visible affordance wherever a chip exists
// (today's ExercisePlan.tsx made the whole chip a silent role="button" only
// when estimate — this renders a real glyph for every state that has copy).
// ---------------------------------------------------------------------------

export type LoadSource = PrescribedLoadSource | 'logged'

const ESTIMATE_CHIP_CLASS = 'border-dashed border-muted-foreground/40 text-muted-foreground/70'
// Fainter still than an estimate, and italic: the visual order on screen has
// to match the confidence order, or the styling is just decoration.
const ASSUMED_CHIP_CLASS = 'border-dashed border-muted-foreground/30 text-muted-foreground/60 italic'
const CONFIDENT_CHIP_CLASS = 'border-foreground/25 bg-foreground/5 text-foreground/90 font-medium'

export function loadChipClass(source: LoadSource | undefined): string {
  if (source === 'assumed_body') return ASSUMED_CHIP_CLASS
  return source === 'estimate' ? ESTIMATE_CHIP_CLASS : CONFIDENT_CHIP_CLASS
}

export function loadSourceLabel(source: LoadSource | undefined): string | null {
  // Not "suggested" — that word implies we suggested it FOR THEM. This number
  // is a floor to start from, and saying so is the whole point of the state.
  if (source === 'assumed_body') return 'starting light'
  if (source === 'estimate') return 'suggested'
  if (source === 'known_weight') return 'you told us'
  if (source === 'logged') return 'from your last session'
  return null
}

function explainerFor(source: LoadSource | undefined, loadGuidance?: string): string | null {
  if (source === 'assumed_body') {
    // MissingBodyMetricsNotice's rule: name the gap, say what still works,
    // give one action, stop. No placeholder figure dressed up as a
    // measurement — the number IS real, it is just deliberately low.
    return "We don't have the body details this would normally be worked out from, so it starts low on purpose rather than guessing. Log what you actually lift and the plan rebuilds from it — or add your weight in Profile." + (loadGuidance ? ` ${loadGuidance}` : '')
  }
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

/**
 * The tempo chip — deliberately rendered in the SAME slot a weight would
 * occupy, because it is the weight's stand-in. For a lift with nothing to
 * load, tempo is the progression lever, and putting it anywhere else would
 * leave that slot reading as empty on the one lift class where the whole
 * defect was "the numbers change and nothing explains why".
 *
 * Styled as CONFIDENT rather than estimate-dashed: unlike a standards-derived
 * weight, this is not a guess about the trainee — it is an instruction, and
 * the visual order on screen has to match the confidence order.
 */
export function TempoChip({ tempo }: { tempo: string | undefined }) {
  const described = describeTempo(tempo)
  if (!described) return null
  return (
    <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] leading-4 ${CONFIDENT_CHIP_CLASS}`}>
      <Timer className="size-2.5" />{described}
    </span>
  )
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
