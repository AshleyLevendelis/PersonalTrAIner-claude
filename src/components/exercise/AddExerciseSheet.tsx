import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Plus, ShieldAlert, Zap, Clock } from 'lucide-react'
import { searchExerciseCatalog, type ExerciseEntry } from '@/lib/exercise-db'
import { getExerciseCompatibilityWarnings } from '@/lib/exercise-plan'
import { getAdditionCandidates } from '@/lib/exercise-add-candidates'
import type { SwapScope } from '@/lib/mesocycle-edit'
import type { UserProfile, WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// PUTTING ONE EXERCISE INTO A SESSION — the last operation in the exercise
// grain, built 13 Sep 2026.
//
// Deliberately SwapDialog's shape rather than a new one: ranked rows with a
// reason, a search box underneath that reaches the whole catalogue and states
// the clash, and the same two scope words to the letter. Someone who has used
// the swap sheet has already used this one.
//
// ASHLEY'S TWO RULINGS LIVE HERE.
//
// 1. THE TIME CAP (13 Sep). Adding work makes the session longer and the app
//    SAYS the new length rather than trimming something else to pay for it.
//    "You asked for the exercise, so you get the exercise." So this sheet
//    states the new length before the tap and nothing on the day is touched.
//    The number comes from a TRIAL of the real edit measured with the header's
//    own estimator — never a second guess at what the edit would do, which is
//    exactly how the shorten work managed to print "20 min" beside "~26 min".
//
// 2. THE PICKER (13 Sep). *Show everything, warn me.* The ranked list is the
//    constrained pool; the search box is the catalogue with warnings on the
//    row. Same answer the swap sheet gives, so the app does not contradict
//    itself between two screens.
// ---------------------------------------------------------------------------

/** What the sheet needs to know about the session it is adding to. */
export interface AddExerciseTarget {
  dayName: string
  day: WorkoutDay
}

export interface AddImpact {
  cost: string | null
  balancing: string | null
  /** The session's new length in minutes, and the asked-for cap it is measured against. */
  minutes: number | null
  overBy: number | null
}

export function AddExerciseSheet({
  target,
  onClose,
  profile,
  exclusions,
  onConfirm,
  impactFor,
}: {
  target: AddExerciseTarget | null
  onClose: () => void
  profile?: UserProfile
  exclusions: string[]
  onConfirm: (entry: ExerciseEntry, scope: SwapScope) => Promise<string | null>
  /**
   * What adding this one does to the week and to the clock. Async for the
   * same reason the swap sheet's is: pricing the incoming lift reaches the
   * progression engine. Asked once a candidate is chosen, never per row.
   */
  impactFor?: (candidate: ExerciseEntry) => Promise<AddImpact>
}) {
  const [pending, setPending] = useState<ExerciseEntry | null>(null)
  const [impact, setImpact] = useState<AddImpact | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPending(null)
    setImpact(null)
    setSearchQuery('')
    setError(null)
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const suggestions = target && profile
    ? getAdditionCandidates(target.day, profile, exclusions)
    : []
  const present = new Set((target?.day.exercises ?? []).map(e => e.name.toLowerCase()))
  const searchResults = target && searchQuery.trim()
    ? searchExerciseCatalog(searchQuery, 20).filter(e =>
        !present.has(e.name.toLowerCase()) &&
        !suggestions.some(s => s.exercise.name === e.name)
      )
    : []

  // THE TRIAL, ONCE A CANDIDATE IS CHOSEN — cancelled on unmount and on a
  // change of candidate, so a slow trial for one the person backed out of can
  // never land its sentence on a different one. SwapDialog's rule, verbatim.
  useEffect(() => {
    if (!pending || !impactFor) { setImpact(null); return }
    let cancelled = false
    setImpact(null)
    void impactFor(pending)
      .then(r => { if (!cancelled) setImpact(r) })
      .catch(() => { if (!cancelled) setImpact(null) })
    return () => { cancelled = true }
  }, [pending, impactFor])

  const applyScope = async (scope: SwapScope) => {
    if (!target || !pending) return
    setBusy(true)
    try {
      const refusal = await onConfirm(pending, scope)
      if (refusal) { setError(refusal); return }
      reset()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const row = (exercise: ExerciseEntry, note: string | null, warnings: string[]) => (
    <button
      key={exercise.name}
      data-add-candidate={exercise.name}
      className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors"
      onClick={() => setPending(exercise)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-sm">{exercise.name}</p>
          {/* DE-DUPLICATED. Battle Ropes is movement_pattern 'cardio' AND
              mechanics_tier 'cardio', so the row printed "cardio  cardio" —
              found by reading a screenshot, not by a check. Two badges saying
              one thing is worse than one badge. */}
          <div className="flex flex-wrap gap-1">
            {[...new Set([
              exercise.movement_pattern.replace(/_/g, ' '),
              exercise.mechanics_tier.replace(/_/g, ' '),
            ])].map(label => (
              <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
            ))}
          </div>
          {note && (
            <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
              <Zap className="size-3 mt-0.5 shrink-0 text-primary-text" />
              <span>{note}</span>
            </p>
          )}
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-[color:var(--role-warn-text)] mt-1 flex items-start gap-1">
              <ShieldAlert className="size-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </p>
          ))}
        </div>
        <Plus className="size-4 shrink-0 text-muted-foreground mt-1" />
      </div>
    </button>
  )

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="max-w-lg" data-testid="add-exercise-sheet">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4" />
            {pending ? 'Add this exercise' : 'Add an exercise'}
          </DialogTitle>
          <DialogDescription>
            {pending
              ? <>Add <span className="font-semibold text-foreground">{pending.name}</span> to {target?.dayName}</>
              : <>What {target?.dayName} could use</>}
          </DialogDescription>
        </DialogHeader>

        {!pending && (
          <>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nothing left that fits your equipment, injuries, style and skill level and isn't already in this session. Search below to pick anything from the full catalog instead.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {suggestions.map(({ exercise, note }) => row(exercise, note, []))}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <Separator />
              <p className="text-xs font-medium text-muted-foreground pt-1">Something specific? Search all exercises</p>
              <Input
                placeholder="e.g. Face Pull"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
                data-testid="add-exercise-search"
              />
              {searchQuery.trim() && (
                searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">No matching exercise found.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {/* HER RULING: everything is findable and the clash is
                        stated, never hidden. Same warnings the swap search
                        shows, from the same helper. */}
                    {searchResults.map(exercise => row(
                      exercise,
                      exercise.coach_note_swap ?? null,
                      profile ? getExerciseCompatibilityWarnings(exercise, profile, exclusions) : [],
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}

        {pending && (
          <div className="space-y-2 py-1">
            {profile && getExerciseCompatibilityWarnings(pending, profile, exclusions).map((w, i) => (
              <p key={i} className="text-xs text-[color:var(--role-warn-text)] flex items-start gap-1.5 rounded-lg bg-[color:var(--role-warn-bg)] p-2">
                <ShieldAlert className="size-3.5 mt-0.5 shrink-0" />
                <span>{w}</span>
              </p>
            ))}

            {/* THE NEW LENGTH, BEFORE THE TAP — her ruling. Read off a trial of
                the real edit through the same estimator the session header
                uses, so the two cannot disagree. */}
            {impact?.minutes != null && (
              <p className="text-xs flex items-start gap-1.5" data-testid="add-length" style={{ color: impact.overBy ? 'var(--role-warn-text)' : undefined }}>
                <Clock className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  {impact.overBy
                    ? `${target?.dayName} becomes about ${impact.minutes} min — ${impact.overBy} min over the session length you asked for. Nothing else is taken out to make room.`
                    : `${target?.dayName} becomes about ${impact.minutes} min, still inside the session length you asked for.`}
                </span>
              </p>
            )}
            {impact?.cost && <p className="text-xs text-[color:var(--role-warn-text)]" data-testid="add-balance-cost">{impact.cost}</p>}
            {impact?.balancing && <p className="text-xs text-muted-foreground" data-testid="add-balancing">{impact.balancing}</p>}
            {error && <p className="text-xs text-destructive" data-testid="add-error">{error}</p>}

            {/* THE SCOPE WORDS ARE SwapDialog's AND RemoveExerciseSheet's, TO
                THE LETTER. A third vocabulary for the same choice is how two
                screens start meaning different things by one word. */}
            <button
              className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
              disabled={busy}
              data-scope="today"
              onClick={() => applyScope('today')}
            >
              <p className="font-medium text-sm">Today only</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only this session gains it. Next time this day comes around it's back to the planned session.
              </p>
            </button>
            <button
              className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
              disabled={busy}
              data-scope="permanent"
              onClick={() => applyScope('permanent')}
            >
              <p className="font-medium text-sm">Rest of block</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds it to this day for the rest of this training block; later blocks re-plan from your base program.
                {' '}It starts at a conservative weight so you can find your working number, then ramps from there.
              </p>
            </button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setPending(null); setError(null) }}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Adding...
                </span>
              ) : 'Back'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
