import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { EditReasonStep, type ReasonAnswer } from './EditReasonStep'
import { ArrowRightLeft, ShieldAlert, Zap } from 'lucide-react'
import { getExerciseEntry, searchExerciseCatalog, type ExerciseEntry } from '@/lib/exercise-db'
import { getExerciseCompatibilityWarnings } from '@/lib/exercise-plan'
import { getReplacementCandidates, type SwapScope } from '@/lib/mesocycle-edit'
import type { UserProfile } from '@/lib/types'

// ---------------------------------------------------------------------------
// Shared swap confirm dialog for the today view and the peek (LAYOUT-
// DESIGN.md §4.2) — one dialog, not duplicated per surface. Scope-bearing
// (Today only / Rest of block), so it always ends in a confirm per D3's
// mechanical rule (scope beyond the tap = confirm). The legacy program
// stand-in (ExercisePlan.tsx) keeps its own copy of this same flow — kept
// separate deliberately, since that file is deleted whole in P4 rather than
// refactored to share this one.
// ---------------------------------------------------------------------------

export interface SwapTarget {
  dayName: string
  exIndex: number
  exerciseName: string
  /**
   * Set only by the program view: the week being BROWSED when the swap was
   * opened, so the edit lands on the week the trainee was looking at.
   * Absent on today's rows and the peek — the caller falls back to the
   * live week.
   */
  weekNumber?: number
}

export function SwapDialog({
  target,
  onClose,
  profile,
  exclusions,
  softExercisePreferences,
  onConfirm,
  impactFor,
  onReason,
}: {
  target: SwapTarget | null
  onClose: () => void
  profile?: UserProfile
  exclusions: string[]
  /** Soft likes/dislikes — floats liked swaps up, sinks disliked ones. Removes nothing. */
  softExercisePreferences?: { liked: string[]; disliked: string[] }
  onConfirm: (exIndex: number, dayName: string, newExercise: ExerciseEntry, scope: SwapScope) => Promise<void>
  /**
   * What this swap would cost the week, and what the app will even out on
   * other days. Async because a swap recomputes the incoming lift's load
   * before anything can be said about the week it lands in.
   *
   * Asked only once the candidate is chosen, never per row: running a real
   * trial for every replacement in the list would be a dozen plan edits to
   * render a list nobody has decided from yet.
   */
  impactFor?: (candidate: ExerciseEntry) => Promise<{ cost: string | null; balancing: string | null }>
  /**
   * WHY FIRST. The four answers a swap can have route to four different
   * things, and two of them are not swaps at all — "it hurts" is the injury
   * path and "I haven't got the kit" rebuilds the week around what they have.
   * Returns a refusal string or null. Unwired, the dialog behaves exactly as
   * it did.
   */
  onReason?: (answer: ReasonAnswer) => Promise<string | null>
}) {
  const [asked, setAsked] = useState(false)
  const [reasonBusy, setReasonBusy] = useState(false)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [pendingSwap, setPendingSwap] = useState<ExerciseEntry | null>(null)
  const [impact, setImpact] = useState<{ cost: string | null; balancing: string | null } | null>(null)
  const [showAllReplacements, setShowAllReplacements] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setAsked(false); setReasonBusy(false); setReasonError(null)
    setPendingSwap(null)
    setImpact(null)
    setShowAllReplacements(false)
    setSearchQuery('')
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const replacements = target && profile
    ? getReplacementCandidates(target.exerciseName, profile, exclusions, softExercisePreferences)
    : []
  const INITIAL_SHOWN = 4
  const visibleReplacements = showAllReplacements ? replacements : replacements.slice(0, INITIAL_SHOWN)
  const currentEntry = target ? getExerciseEntry(target.exerciseName) : undefined
  const searchResults = target && searchQuery.trim()
    ? searchExerciseCatalog(searchQuery, 20).filter(e =>
        e.name.toLowerCase() !== target.exerciseName.toLowerCase() &&
        !replacements.some(r => r.exercise.name === e.name)
      )
    : []

  // THE TRIAL, ONCE A CANDIDATE IS CHOSEN. Cancelled on unmount and on a
  // change of candidate, so a slow trial for a swap the person backed out of
  // can never land its sentence on a different one.
  useEffect(() => {
    if (!pendingSwap || !impactFor) { setImpact(null); return }
    let cancelled = false
    setImpact(null)
    void impactFor(pendingSwap)
      .then(r => { if (!cancelled) setImpact(r) })
      // A trial that throws says nothing rather than guessing. The swap
      // itself is unaffected — this is a sentence, not a gate.
      .catch(() => { if (!cancelled) setImpact(null) })
    return () => { cancelled = true }
  }, [pendingSwap, impactFor])

  const applyScope = async (scope: SwapScope) => {
    if (!target || !pendingSwap) return
    setBusy(true)
    try {
      await onConfirm(target.exIndex, target.dayName, pendingSwap, scope)
    } finally {
      setBusy(false)
      reset()
      onClose()
    }
  }

  const askingWhy = !!onReason && !asked && !pendingSwap

  const answerReason = async (a: ReasonAnswer) => {
    // Busy and don't-like-it are still swaps — the answer only says which
    // scope the person is really after, and the list below is the same list.
    if (a.type === 'reason') { setAsked(true); return }
    setReasonBusy(true); setReasonError(null)
    const refusal = await onReason?.(a) ?? null
    setReasonBusy(false)
    if (refusal) { setReasonError(refusal); return }
    handleClose()
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="max-w-lg" data-testid="swap-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-4" />
            {pendingSwap ? 'Apply this swap' : askingWhy ? `Swap ${target?.exerciseName}?` : 'Smart Exercise Swap'}
          </DialogTitle>
          <DialogDescription>
            {pendingSwap ? (
              <>Swap <span className="font-semibold text-foreground">{target?.exerciseName}</span> for <span className="font-semibold text-foreground">{pendingSwap.name}</span></>
            ) : askingWhy ? (
              // NOT "constraint-checked replacements" WHILE STILL ASKING WHY.
              // Two of the four answers never reach a replacement list at all,
              // so promising one above the question is the app describing
              // something it may not be about to do.
              <>{target?.dayName}</>
            ) : (
              <>Constraint-checked replacements for <span className="font-semibold text-foreground">{target?.exerciseName}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        {askingWhy ? (
          <>
            <EditReasonStep
              kind="swap"
              exerciseName={target?.exerciseName ?? 'it'}
              busy={reasonBusy}
              onAnswer={answerReason}
              onSkip={() => setAsked(true)}
            />
            {reasonError && <p className="text-xs text-destructive" data-testid="swap-reason-error">{reasonError}</p>}
          </>
        ) : (<>
        {!pendingSwap && currentEntry && (
          <div className="flex flex-wrap gap-1.5 pb-2">
            <Badge variant="outline" className="text-xs">{currentEntry.movement_pattern.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline" className="text-xs">{currentEntry.mechanics_tier.replace(/_/g, ' ')}</Badge>
            <Badge variant={currentEntry.joint_stress === 'high' ? 'destructive' : 'secondary'} className="text-xs">
              <ShieldAlert className="size-3 mr-1" />
              {currentEntry.joint_stress} joint stress
            </Badge>
          </div>
        )}

        {!pendingSwap && <Separator />}

        {!pendingSwap && (
          replacements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No alternative exercises fit your equipment, injuries, style, and skill level for this movement pattern. Search below to pick anything from the full catalog instead.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {visibleReplacements.map(({ exercise, note }) => (
                <button
                  key={exercise.name}
                  className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors"
                  onClick={() => setPendingSwap(exercise)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{exercise.name}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-xs">{exercise.mechanics_tier.replace(/_/g, ' ')}</Badge>
                        {exercise.joint_stress === 'low' && currentEntry?.joint_stress !== 'low' && (
                          <Badge className="text-xs bg-primary/15 text-primary-text">
                            lower stress
                          </Badge>
                        )}
                      </div>
                      {note && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Zap className="size-3 mt-0.5 shrink-0 text-primary-text" />
                          <span>{note}</span>
                        </p>
                      )}
                    </div>
                    <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground mt-1" />
                  </div>
                </button>
              ))}
              {!showAllReplacements && replacements.length > INITIAL_SHOWN && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAllReplacements(true)}>
                  Show {replacements.length - INITIAL_SHOWN} more
                </Button>
              )}
              {/* A SHORT LIST EXPLAINS ITSELF. The empty case has said why since
                  it was written; one or two options said nothing, so the screen
                  looked like a complete answer. Ashley met that on 8 Sep 2026 —
                  one suggestion above a search box that turned up three more
                  perfectly good ones the moment she typed. The list is honest
                  again now; this is what keeps it honest when a movement really
                  does have few alternatives. */}
              {replacements.length < INITIAL_SHOWN && (
                <p className="text-xs text-muted-foreground px-1 pt-1">
                  {replacements.length === 1 ? "That's the only alternative" : `Only ${replacements.length} alternatives`} that fit your
                  equipment, injuries, style and skill level for this movement. Search below for anything else in the catalog.
                </p>
              )}
            </div>
          )
        )}

        {!pendingSwap && (
          <div className="space-y-2 pt-1">
            <Separator />
            <p className="text-xs font-medium text-muted-foreground pt-1">Machine busy? Search all exercises</p>
            <Input
              placeholder="e.g. Smith Machine Squat"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
            {searchQuery.trim() && (
              searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No matching exercise found.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map(exercise => {
                    const warnings = profile ? getExerciseCompatibilityWarnings(exercise, profile, exclusions) : []
                    return (
                      <button
                        key={exercise.name}
                        className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors"
                        onClick={() => setPendingSwap(exercise)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="font-medium text-sm">{exercise.name}</p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">{exercise.movement_pattern.replace(/_/g, ' ')}</Badge>
                              <Badge variant="secondary" className="text-xs">{exercise.mechanics_tier.replace(/_/g, ' ')}</Badge>
                            </div>
                            {/* THE NOTE THE RANKED LIST HAS AND THIS ONE DID NOT.
                                Searching the catalogue told you strictly less
                                than browsing it: two taxonomy badges and no
                                coaching sentence at all, on the surface where
                                you are least likely to know the movement. */}
                            {exercise.coach_note_swap && (
                              <p className="text-xs leading-[1.45] text-muted-foreground">{exercise.coach_note_swap}</p>
                            )}
                            {warnings.map((w, i) => (
                              <p key={i} className="text-xs text-[color:var(--role-warn-text)] mt-1 flex items-start gap-1">
                                <ShieldAlert className="size-3 mt-0.5 shrink-0" />
                                <span>{w}</span>
                              </p>
                            ))}
                          </div>
                          <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground mt-1" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {pendingSwap && (
          <div className="space-y-2 py-1">
            {profile && getExerciseCompatibilityWarnings(pendingSwap, profile, exclusions).map((w, i) => (
              <p key={i} className="text-xs text-[color:var(--role-warn-text)] flex items-start gap-1.5 rounded-lg bg-[color:var(--role-warn-bg)] p-2">
                <ShieldAlert className="size-3.5 mt-0.5 shrink-0" />
                <span>{w}</span>
              </p>
            ))}
            {/* WHAT IT COSTS, AND WHAT THE APP WILL DO ABOUT IT — the same two
                sentences the removal sheet shows, from the same helper, so the
                two paths cannot describe one week differently. Added 13 Sep
                2026: until then a swap said nothing at all about the week it
                landed in, and re-ran none of the passes that keep it sane. */}
            {impact?.cost && <p className="text-xs text-[color:var(--role-warn-text)]" data-testid="swap-balance-cost">{impact.cost}</p>}
            {impact?.balancing && <p className="text-xs text-muted-foreground" data-testid="swap-balancing">{impact.balancing}</p>}
            <button
              className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
              disabled={busy}
              onClick={() => applyScope('today')}
            >
              <p className="font-medium text-sm">Today only</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only this session changes. Next time this day comes around it reverts, and your original lift's progression keeps going from its last logged session.
              </p>
            </button>
            <button
              className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
              disabled={busy}
              onClick={() => applyScope('permanent')}
            >
              <p className="font-medium text-sm">Rest of block</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Swaps it for the rest of this training block; later blocks re-plan from your base program.
                {currentEntry?.mechanics_tier === 'tier1_compound'
                  ? ' Main lift — this resets to a conservative starting weight so you can find it fresh, rather than inheriting a number that belonged to a different movement.'
                  : ' Loads recompute for the new movement right away.'}
              </p>
            </button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingSwap(null)}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Applying...
                </span>
              ) : 'Back'}
            </Button>
          </div>
        )}
        </>)}
      </DialogContent>
    </Dialog>
  )
}
