// ---------------------------------------------------------------------------
// ONE EXERCISE, ONE SCREEN — Summary · History · How to.
//
// Ashley asked for this twice.
//
//   First: "I want there to be exercise demonstrations in the app and form
//   cues, currently the chat can link to a YouTube video but there's nowhere
//   in the app to see an exercise." Only the SECOND half of that sentence was
//   built. The cues got a panel; the demonstrations were never started, and no
//   document anywhere recorded a decision to drop them.
//
//   Again, 5 Sep 2026, with two screenshots: "we need to be able to
//   demonstrate how to do an exercise in the app… users should also be able to
//   see in the app similarly to the images attached." One showed a video; the
//   other showed exactly this screen — tabs, an anatomical figure with the
//   working muscles lit, a progress chart.
//
// The striking part, again, is how much already existed and could not be seen
// together. The cues lived here; the chart, the PRs and the past sessions
// lived in a SECOND dialog (ExerciseHistoryDialog, now deleted and absorbed),
// reached from a different menu item. Two pop-ups about one exercise, neither
// aware of the other. This is one screen with three tabs, and both menu items
// open it at the tab they name.
//
// WHAT EACH TAB IS FOR, and the reason there are three:
//   Summary — what this trains (the muscle map) and how it has gone (chart).
//   History — every session it appears in, newest first, and the PRs.
//   How to  — the cues, the facts, and the honest line about what cues are.
//
// The muscle map is the part that works for all 199 live exercises with no
// signal. The video is the part that only appears where a person has watched
// one and vouched for it. Neither pretends to be the other.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Play } from 'lucide-react'
import { getExerciseEntry, getExerciseId, jointListDisplay } from '@/lib/exercise-db'
import { formatCompletedSummary } from '@/lib/session-derive'
import {
  getExerciseHistory,
  deriveStrengthTrend,
  hasEnoughTrendData,
  derivePRHistory,
  type ExerciseHistorySession,
} from '@/lib/exercise-history'
import { ExerciseStrengthChart } from './ExerciseStrengthChart'
import { MuscleMap } from './MuscleMap'

export type ExerciseDetailTab = 'summary' | 'history' | 'howto'

/** Sentence case for a tag like `resistance band` or `low`. */
function tidy(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * The dialog is the chrome; this is the screen. Split so the render harness
 * (scripts/render-screens.tsx) can photograph the REAL panel — a Radix dialog
 * renders through a portal and therefore renders nothing under
 * renderToStaticMarkup, and that harness's own header records what happens
 * when a screen is a hand-copied replica instead: the chrome drifts and the
 * picture quietly stops being of the app.
 */
export function ExerciseDetailPanel({
  open = true,
  exerciseName,
  exerciseId,
  profileId,
  initialTab = 'summary',
}: {
  /** Reloads history and resets the tab when the dialog is (re)opened. */
  open?: boolean
  exerciseName: string | null
  /** The plan's own id where the caller has it; derived from the name otherwise. */
  exerciseId?: string | null
  profileId?: string
  initialTab?: ExerciseDetailTab
}) {
  const entry = exerciseName ? getExerciseEntry(exerciseName) : undefined
  const resolvedId = exerciseId ?? (exerciseName ? getExerciseId(exerciseName) : null)

  const [tab, setTab] = useState<ExerciseDetailTab>(initialTab)
  const [sessions, setSessions] = useState<ExerciseHistorySession[]>([])
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)

  // Land on the tab the menu item named. Keyed on the exercise too, so opening
  // a different lift never inherits the last one's tab or its player.
  useEffect(() => {
    if (open) { setTab(initialTab); setPlaying(false) }
  }, [open, initialTab, exerciseName])

  // Loaded whichever tab is showing, so switching to History is instant rather
  // than a spinner the user waits through after they have already asked.
  useEffect(() => {
    if (!open || !resolvedId || !profileId) return
    let cancelled = false
    setLoading(true)
    getExerciseHistory(profileId, resolvedId)
      .then(result => { if (!cancelled) setSessions(result) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, resolvedId, profileId])

  const trend = deriveStrengthTrend(sessions)
  const prs = derivePRHistory(sessions)

  return (
    <Tabs value={tab} onValueChange={v => setTab(v as ExerciseDetailTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="howto">How to</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------
              SUMMARY — what it trains, and how it has gone.
              --------------------------------------------------------------- */}
          <TabsContent value="summary" className="mt-4 space-y-4">
            {!entry ? (
              <p className="text-sm text-muted-foreground">
                I don&apos;t have notes on this one — it isn&apos;t in the exercise catalogue.
                Ask me in chat and I&apos;ll talk you through it.
              </p>
            ) : (
              <>
                {/* NO "Primary: <muscle>" LINE, though the reference
                    screenshot has one and the first draft copied it. The
                    catalogue has ONE muscle field and no secondary — every
                    name in `primary_muscles` is primary — so calling the first
                    entry "Primary" and the rest nothing invents a ranking the
                    data does not hold. It read as harmless on Deadlifts
                    ("Primary: Hamstrings", already the first word of the list
                    right above it) and as nonsense on Burpees ("Primary:
                    Cardiovascular system"). The map's own caption lists all of
                    them, which is both honest and not a repeat. */}
                <MuscleMap entry={entry} />

                {/* THE VIDEO, ONLY WHERE ONE HAS BEEN WATCHED. No id, no
                    button — not a disabled button, not a button that opens a
                    search. An affordance that appears everywhere and works
                    sometimes is the promise VISION.md forbids. */}
                {entry.demo_video_id && (
                  playing ? (
                    <div className="space-y-1.5">
                      {/* youtube-nocookie, so watching a demonstration does not
                          attach tracking to the user. The service worker never
                          caches cross-origin content by design, so this needs
                          signal and always will — the line below says so
                          rather than leaving a black rectangle to interpret. */}
                      <div className="overflow-hidden rounded-xl" style={{ background: 'var(--surface-deep)' }}>
                        <iframe
                          className="aspect-video w-full"
                          src={`https://www.youtube-nocookie.com/embed/${entry.demo_video_id}?rel=0&modestbranding=1`}
                          title={`${exerciseName} demonstration`}
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                      <p className="text-[0.6875rem] leading-[1.4] text-muted-foreground">
                        {entry.demo_video_credit ? `Video by ${entry.demo_video_credit}. ` : ''}
                        Needs a connection — the cues and the muscle map work without one.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlaying(true)}
                      aria-label={`Watch a demonstration of ${exerciseName}`}
                      className="hit-slop-44 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[0.8125rem] font-semibold text-primary"
                      style={{ background: 'var(--surface-raised)' }}
                    >
                      <Play className="size-3.5 shrink-0" aria-hidden />
                      Watch demonstration
                    </button>
                  )
                )}

                {entry.coach_note_swap && (
                  <div>
                    <p className="ds-label">Why it&apos;s in your plan</p>
                    <p className="mt-1.5 text-[0.8125rem] leading-[1.5] text-text-tertiary">{entry.coach_note_swap}</p>
                  </div>
                )}
              </>
            )}

            <div>
              <p className="ds-label-compact mb-2">Strength trend</p>
              {hasEnoughTrendData(trend) ? (
                <ExerciseStrengthChart points={trend} />
              ) : (
                <p className="text-sm text-muted-foreground">Log this exercise twice to see a trend.</p>
              )}
            </div>
          </TabsContent>

          {/* ---------------------------------------------------------------
              HISTORY — absorbed wholesale from ExerciseHistoryDialog, which
              is deleted. Same three sections, same empty-state sentences.
              --------------------------------------------------------------- */}
          <TabsContent value="history" className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="ds-label-compact mb-2">PRs</p>
                  {prs.length > 0 ? (
                    <div className="space-y-1.5">
                      {prs.map(pr => (
                        <p key={`${pr.sessionId}-${pr.kind}`} className="flex items-center gap-1.5 text-sm">
                          <Trophy className="size-3.5 text-primary glow-mint shrink-0" aria-hidden />
                          <span className="tabular-mono text-primary glow-mint">{pr.weightKg}kg</span>
                          <span className="text-xs text-muted-foreground">· {pr.date}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No PRs recorded yet.</p>
                  )}
                </div>

                <div>
                  <p className="ds-label-compact mb-2">Sessions</p>
                  {sessions.length > 0 ? (
                    <div className="space-y-3">
                      {sessions.map(session => (
                        <div key={session.sessionId} className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--hairline)' }}>
                          <p className="text-xs text-muted-foreground">{session.date}</p>
                          <p className="text-sm tabular-mono">
                            {formatCompletedSummary(
                              session.sets.map(s => ({ set_number: s.setNumber, weight_kg: s.weightKg, reps_completed: s.repsCompleted, is_bodyweight: s.isBodyweight }))
                            )}
                          </p>
                          {session.sets.some(s => s.rpe != null) && (
                            <p className="text-xs text-muted-foreground">
                              RPE {session.sets.filter(s => s.rpe != null).map(s => s.rpe).join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No history yet.</p>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ---------------------------------------------------------------
              HOW TO — unchanged from the panel that shipped, moved into a tab.
              --------------------------------------------------------------- */}
          <TabsContent value="howto" className="mt-4">
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
                    have. The muscle map does not change this and neither does a
                    borrowed video: seeing which muscles work and watching
                    someone else do it are both short of being coached. */}
                <p className="text-[0.71875rem] leading-[1.5] text-muted-foreground" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
                  These are reminders, not coaching. If a movement is new to you, start light and
                  get eyes on it. Anything that hurts is a reason to stop, not to push.
                </p>
              </div>
            )}
          </TabsContent>
    </Tabs>
  )
}

export function ExerciseDetailDialog({
  open,
  onOpenChange,
  exerciseName,
  exerciseId,
  profileId,
  initialTab = 'summary',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exerciseName: string | null
  exerciseId?: string | null
  profileId?: string
  initialTab?: ExerciseDetailTab
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">{exerciseName ?? 'Exercise'}</DialogTitle>
        </DialogHeader>
        <ExerciseDetailPanel
          open={open}
          exerciseName={exerciseName}
          exerciseId={exerciseId}
          profileId={profileId}
          initialTab={initialTab}
        />
      </DialogContent>
    </Dialog>
  )
}
