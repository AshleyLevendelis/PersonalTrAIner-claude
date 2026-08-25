import { Plus, Info } from 'lucide-react'
import { useState } from 'react'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// LoadChip's counterpart for a lift you hang weight ON rather than lift —
// a weighted pull-up, chin-up or dip (Exercise.suggested_added_load_kg).
//
// Separate component for the same reason AssistanceChip is: the number means
// something different. LoadChip's "42.5kg" is the weight you move; this
// "+15kg" is what you add to a body the app is not weighing for you. Rendering
// it through LoadChip would put a bare "15kg" beside "Pull-Ups", which reads
// as LIFT 15kg — the exact class of untrue statement LoadChip's own header
// exists to prevent.
//
// The sign is not decoration. It is the whole difference between "your pull-up
// weighs 15kg" and "add 15kg to yourself", so it is baked into the string
// rather than left to a label beside it that could be truncated away.
// ---------------------------------------------------------------------------

export function AddedLoadChip({ ex }: { ex: Exercise }) {
  const [explained, setExplained] = useState(false)
  if (ex.suggested_added_load_kg == null) return null

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {ex.intensity && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
          {ex.intensity}
        </span>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] leading-4 border-foreground/25 bg-foreground/5 text-foreground/90 font-medium">
          <Plus className="size-2.5" />{ex.suggested_added_load_kg}kg added
        </span>
        <span className="text-[9px] italic text-muted-foreground/60">on top of bodyweight</span>
        {ex.load_guidance && (
          <button
            type="button"
            onClick={() => setExplained(v => !v)}
            aria-label="Why this weight"
            className="text-muted-foreground/60 hover:text-muted-foreground"
          >
            <Info className="size-2.5" />
          </button>
        )}
      </div>
      {explained && ex.load_guidance && (
        <p className="text-[10px] text-muted-foreground/80 italic max-w-xs">{ex.load_guidance}</p>
      )}
    </div>
  )
}
