// ---------------------------------------------------------------------------
// HOW TO DO IT — the exercise's own technique cues.
//
// Ashley: "I want there to be exercise demonstrations in the app and form
// cues, currently the chat can link to a YouTube video but there's nowhere in
// the app to see an exercise."
//
// She was right that there was nowhere, and the striking part is that the
// content was already written. All 158 catalogue entries carry `form_cues` —
// 635 cues, about four each — and until this dialog NOTHING IN THE REPO READ
// THEM. Not the UI, not a prompt, not a test. They shipped in every bundle
// and were never once shown to anyone.
//
// `coach_note_swap` was barely better off: rendered only on the ALTERNATIVES
// inside SwapDialog, so the app would explain a movement you were considering
// and never the one you were about to perform.
//
// One shared instance owned by ExerciseTab and opened from either ⋮ menu,
// following the ExerciseHistoryDialog / PlateCalculator precedent.
// ---------------------------------------------------------------------------

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getExerciseEntry, jointListDisplay } from '@/lib/exercise-db'

/** Sentence case for a tag like `resistance band` or `low`. */
function tidy(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function ExerciseDetailDialog({
  open,
  onOpenChange,
  exerciseName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exerciseName: string | null
}) {
  const entry = exerciseName ? getExerciseEntry(exerciseName) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">{exerciseName ?? 'Exercise'}</DialogTitle>
        </DialogHeader>

        {/* An off-plan or renamed movement has no catalogue entry. Say so
            rather than rendering an empty panel that reads as a bug. */}
        {!entry ? (
          <p className="text-sm text-muted-foreground">
            I don&apos;t have notes on this one — it isn&apos;t in the exercise catalogue.
            Ask me in chat and I&apos;ll talk you through it.
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="ds-label">How to do it</p>
              <ol className="mt-2 space-y-2">
                {entry.form_cues.map((cue, i) => (
                  <li key={cue} className="flex gap-2.5 text-[0.84375rem] leading-[1.5]">
                    <span className="tabular-mono shrink-0 text-[0.6875rem] text-muted-foreground pt-[3px]">{i + 1}</span>
                    <span>{cue}</span>
                  </li>
                ))}
              </ol>
            </div>

            {entry.coach_note_swap && (
              <div>
                <p className="ds-label">Why it&apos;s in your plan</p>
                <p className="mt-1.5 text-[0.8125rem] leading-[1.5] text-text-tertiary">{entry.coach_note_swap}</p>
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.75rem] text-muted-foreground">Works</span>
                <span className="text-right text-[0.78125rem]">{entry.primary_muscles.map(tidy).join(', ')}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '10px' }}>
                <span className="text-[0.75rem] text-muted-foreground">Needs</span>
                <span className="text-right text-[0.78125rem]">{entry.equipment.map(tidy).join(entry.equipment_alternatives ? ' or ' : ' + ')}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '10px' }}>
                <span className="text-[0.75rem] text-muted-foreground">Joint load</span>
                <span className="text-right text-[0.78125rem]">{tidy(entry.joint_stress)}</span>
              </div>
              {/* Through jointListDisplay, never the raw tag. That helper exists
                  because `lower_back_axial` is not a phrase — anyone with a bad
                  back once read "Loads your lower back axial". */}
              {(entry.indicated_joints?.length ?? 0) > 0 && (
                <div className="flex items-baseline justify-between gap-3" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '10px' }}>
                  <span className="text-[0.75rem] text-muted-foreground">Good for</span>
                  <span className="text-right text-[0.78125rem] text-primary">{jointListDisplay(entry.indicated_joints ?? [])}</span>
                </div>
              )}
              {(entry.contraindicated_joints?.length ?? 0) > 0 && (
                <div className="flex items-baseline justify-between gap-3" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '10px' }}>
                  <span className="text-[0.75rem] text-muted-foreground">Avoid with</span>
                  <span className="text-right text-[0.78125rem] text-[color:var(--role-warn-text)]">{jointListDisplay(entry.contraindicated_joints ?? [])}</span>
                </div>
              )}
            </div>

            {/* WHAT THIS IS NOT. Four bullet points are a reminder for a
                movement you have done before, not instruction in a lift you
                have not. VISION.md: never claim a capability the app does not
                have. Saying so costs one line and stops the panel reading as
                more authority than it is. */}
            <p className="text-[0.71875rem] leading-[1.5] text-muted-foreground" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
              These are reminders, not coaching. If a movement is new to you, start light and
              get eyes on it. Anything that hurts is a reason to stop, not to push.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
