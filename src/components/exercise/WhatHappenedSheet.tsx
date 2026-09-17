// ---------------------------------------------------------------------------
// WHAT HAPPENED TO THIS SESSION — the five verbs, on the screen.
//
// Ashley, 10 Sep 2026, from the must-have audit: four of these existed as
// coach tools only (move, rest day, something else instead, did it elsewhere)
// and "missed" existed nowhere — the week strip guessed it once the date had
// passed, and the coach's only offer for such a day rewrote it as a rest.
//
// Every verb here writes through the SAME function the coach's confirm card
// calls (daily-tracking's four day-flag writers, set-log-store's history
// writer, the cardio log), so the two surfaces cannot disagree about a day.
// Her ruling on the one new fact: a missed day stays missed — it is never
// folded into rest, and after recording it the sheet offers to move the work,
// which changes where it is owed, not whether the day was missed.
//
// Two things deliberately NOT here. "I did it, not in the app" for TODAY —
// the history writer refuses today by design (it protects the live session),
// and today's grid is right underneath; the sheet says so. And a shortcut
// that marks a day done with nothing in it — an empty finished session is not
// done (Ashley, 3 Sep), and no number is ever invented (log-correction).
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { markSessionCompleted, setDeliberateRest, setMarkedMissed, setSessionMove, setSwappedForActivity } from '@/lib/daily-tracking'
import { ensureSessionSynced, prescriptionUnit, writeHistoricalSession, type SetUnit } from '@/lib/set-log-store'
import { isPlausibleCardioDuration, saveCardioLog } from '@/lib/cardio-log-store'
import { resolveMoveTarget, sessionForDate, type MoveTarget, type SessionMove } from '@/lib/session-move'
import { getExerciseEntry, getExerciseId } from '@/lib/exercise-db'
import { isExternallyLoaded } from '@/lib/load-prescription'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import type { WorkoutDay } from '@/lib/types'
import { estimateDaySeconds } from '@/lib/session-duration'

export interface WhatHappenedTarget {
  date: string
  dayName: string
}

type Verb = 'did_elsewhere' | 'missed' | 'move' | 'rest' | 'something_else' | 'shorten' | 'lighter' | 'rebuild'
type Phase = 'menu' | 'did_elsewhere' | 'move' | 'something_else' | 'missed_recorded' | 'shorten' | 'rebuild'

/**
 * THE TIMES SOMEBODY ACTUALLY SAYS. "I've only got half an hour" — not a
 * free-text minute box, which on a gym floor is a keyboard between you and
 * your session. Filtered at render to the ones genuinely shorter than the day
 * in front of them, so the sheet never offers to shorten a 30-minute session
 * to 45.
 */
const SHORTEN_CHOICES = [20, 30, 40, 45] as const

/** What the middle column counts, in the word the person would use. A 40m carry is not 40 reps. */
const UNIT_WORD: Record<SetUnit, string> = { reps: 'reps', seconds: 'secs', meters: 'm' }

/** The low end of a rep range — "8-10" → 8, "12" → 12, anything else → 10. */
function lowReps(label: string | undefined): number {
  const m = /(\d+)/.exec(label ?? '')
  return m ? Number(m[1]) : 10
}

export function WhatHappenedSheet({
  target,
  onClose,
  profileId,
  today,
  plan,
  weekDays,
  moves,
  weekOf,
  weekNumber,
  onChanged,
  onShorten,
  onRebuild,
  onLighter,
}: {
  target: WhatHappenedTarget | null
  onClose: () => void
  profileId?: string
  /** The app's today (dev clock respected), as YYYY-MM-DD. */
  today: string
  /** The LIVE week's plan — the same days the week strip is drawn from. */
  plan: WorkoutDay[]
  weekDays: TrainingWeekDay[]
  moves: SessionMove[]
  /** Which mesocycle week a date falls in — the move resolver keeps a move inside its own week. */
  weekOf: (date: string) => number
  weekNumber: number | null
  /** Fired after any write lands, so the strip, Home and the chat re-read. */
  onChanged: () => void
  /**
   * Cut today's session down to `minutes`. Returns a refusal to show, or null
   * on success.
   *
   * OWNED BY THE CALLER, deliberately. Every other verb here writes a DAY FLAG
   * and this sheet is asserted never to reach the database itself
   * (test:what-happened). These two edit the PLAN, which is TodayPanel's job
   * through applySessionEdit — the same route the exercise row menu already
   * takes. Absent means the verb is not offered at all.
   */
  onShorten?: (minutes: number) => Promise<string | null>
  /** Rebuild today's session around the main lift — Ashley's ruling, 16 Sep 2026. */
  onRebuild?: () => Promise<string | null>
  /** Same contract: one step lighter, today only. */
  onLighter?: () => Promise<string | null>
}) {
  const [phase, setPhase] = useState<Phase>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState('')
  const [minutes, setMinutes] = useState('')
  const [rows, setRows] = useState<Record<number, { sets: string; reps: string; weight: string }>>({})

  const date = target?.date ?? ''
  const dayName = target?.dayName ?? ''
  const cell = weekDays.find(d => d.date === date)
  const resolved = useMemo(() => (target ? sessionForDate({ date, plan, moves }) : null), [target, date, plan, moves])
  const session = resolved?.day ?? null
  const hasSession = !!session && session.exercises.length > 0
  const isPast = date < today
  const isToday = date === today
  const isDone = cell?.state === 'done'
  const movedAway = resolved?.movedTo ?? null

  const declared = {
    missed: !!cell?.markedMissed,
    rest: !!cell?.deliberateRest,
    swapped: cell?.swappedForActivity ?? null,
  }

  // WHICH VERBS APPLY. Computed from the day's state, never a fixed list: a
  // logged day has nothing to explain, a future day can be moved or rested
  // but not missed, and a day already moved away is answered by its undo.
  const verbs: Verb[] = useMemo(() => {
    if (!target || isDone || !hasSession || movedAway) return []
    const out: Verb[] = []
    if (isPast) out.push('did_elsewhere')
    if ((isPast || isToday) && !declared.missed) out.push('missed')
    out.push('move')
    if (!declared.rest) out.push('rest')
    if ((isPast || isToday) && !declared.swapped) out.push('something_else')
    // TODAY ONLY, and only while there is still a session to change. A past
    // day cannot be made shorter — it already happened — and a future one is
    // the ongoing volume change's job, not this one's. Both are also gated on
    // the caller supplying a handler, so a surface that cannot edit the plan
    // never shows a control that would do nothing.
    if (isToday && !declared.rest && !declared.missed && !declared.swapped) {
      if (onShorten) out.push('shorten')
      if (onLighter) out.push('lighter')
      if (onRebuild) out.push('rebuild')
    }
    return out
  }, [target, isDone, hasSession, movedAway, isPast, isToday, declared.missed, declared.rest, declared.swapped, onShorten, onLighter, onRebuild])

  // Every day this week the resolver would accept as a destination — the
  // same function, the same rules (a free day, inside this mesocycle week,
  // not before tomorrow-or-today), so the screen never offers a day the coach
  // would refuse.
  const moveCandidates = useMemo(() => {
    if (!target) return [] as { date: string; dayName: string; remapFrom?: string }[]
    return weekDays
      .filter(d => d.date !== date)
      .map(d => resolveMoveTarget({ fromDate: date, requestedDate: d.date, todayDate: today, plan, weekOf, existing: moves }))
      .filter((r): r is Extract<MoveTarget, { ok: true }> => r.ok && r.asWanted)
      .map(r => ({ date: r.date, dayName: r.dayName, remapFrom: r.remapFrom }))
  }, [target, weekDays, date, today, plan, weekOf, moves])

  const nextFree = useMemo(() => {
    if (!target) return null
    const r = resolveMoveTarget({ fromDate: date, todayDate: today, plan, weekOf, existing: moves })
    return r.ok ? { date: r.date, dayName: r.dayName, remapFrom: r.remapFrom } : null
  }, [target, date, today, plan, weekOf, moves])

  const reset = () => { setPhase('menu'); setBusy(false); setError(null); setActivity(''); setMinutes(''); setRows({}) }
  const close = () => { reset(); onClose() }

  /** Runs one write; a false lands as a sentence on screen, never as a silent tick. */
  const run = async (fn: () => Promise<boolean>, then: 'close' | Phase) => {
    if (!profileId) return
    setBusy(true); setError(null)
    let ok = false
    try { ok = await fn() } catch (e) { console.error('[what-happened]', e); ok = false }
    setBusy(false)
    if (!ok) { setError("Couldn't save that — try again in a moment."); return }
    onChanged()
    if (then === 'close') close(); else setPhase(then)
  }

  const markMissed = () => run(() => setMarkedMissed(profileId!, date, true), 'missed_recorded')
  const markRest = () => run(() => setDeliberateRest(profileId!, date, true), 'close')
  const moveTo = (to: { date: string; remapFrom?: string }) => run(() => setSessionMove(profileId!, to.remapFrom ?? date, to.date), 'close')
  const undoMissed = () => run(() => setMarkedMissed(profileId!, date, false), 'close')
  const undoRest = () => run(() => setDeliberateRest(profileId!, date, false), 'close')
  const undoSwap = () => run(() => setSwappedForActivity(profileId!, date, null), 'close')
  const undoMove = () => run(() => setSessionMove(profileId!, date, null), 'close')

  /**
   * The two plan edits, run through the CALLER rather than through `run`.
   *
   * `run` is for day flags: it takes a `Promise<boolean>` and turns false into
   * one sentence. These return a refusal STRING instead, because a shortening
   * can fail in ways worth reading ("that session already fits in 30 minutes",
   * "every exercise is already at its minimum") and flattening them all to
   * "couldn't save that" would throw away the only useful part.
   */
  const runEdit = async (fn: () => Promise<string | null>) => {
    setBusy(true); setError(null)
    let refusal: string | null = null
    try { refusal = await fn() } catch (e) { console.error('[what-happened]', e); refusal = "Couldn't change that — try again in a moment." }
    setBusy(false)
    if (refusal) { setError(refusal); return }
    onChanged()
    close()
  }
  const runShorten = (minutes: number) => runEdit(() => onShorten!(minutes))
  const runRebuild = () => runEdit(() => onRebuild!())
  const runLighter = () => runEdit(() => onLighter!())

  /**
   * Only times genuinely shorter than the session in front of them, with a
   * five-minute margin so "shorten my 32-minute session to 30" is not offered
   * as though it were worth a tap.
   */
  const shortenChoices = useMemo(() => {
    const day = plan.find(d => d.day === target?.dayName)
    if (!day || day.exercises.length === 0) return [] as number[]
    const nowMinutes = estimateDaySeconds(day) / 60
    return SHORTEN_CHOICES.filter(m => m <= nowMinutes - 5)
  }, [plan, target?.dayName])

  const saveSomethingElse = () => {
    const name = activity.trim()
    const mins = Number(minutes)
    if (!name) { setError('Name what you did — a walk, a class, a swim.'); return }
    if (minutes.trim() && !isPlausibleCardioDuration(mins)) { setError('Minutes look off — between 1 and 600.'); return }
    return run(async () => {
      const ok = await setSwappedForActivity(profileId!, date, name)
      if (!ok) return false
      // The activity's own log, exactly as the coach's tool writes it — so
      // "I did a swim instead" and "swap today for a swim" leave the same rows.
      if (minutes.trim()) {
        saveCardioLog({ userId: profileId!, date, activityName: name, durationMinutes: Math.round(mins), intensityRpe: 6, notes: 'Swapped in place of the prescribed lifting session' })
      }
      return true
    }, 'close')
  }

  const rowFor = (i: number, ex: WorkoutDay['exercises'][number]) => rows[i] ?? {
    sets: String(ex.sets ?? 3),
    reps: String(lowReps(ex.reps)),
    weight: ex.suggested_load_kg != null ? String(ex.suggested_load_kg) : '',
  }
  const setRow = (i: number, ex: WorkoutDay['exercises'][number], patch: Partial<{ sets: string; reps: string; weight: string }>) =>
    setRows(prev => ({ ...prev, [i]: { ...rowFor(i, ex), ...patch } }))

  const saveDidElsewhere = () => {
    if (!session) return
    return run(async () => {
      const sets: Parameters<typeof writeHistoricalSession>[0]['sets'] = []
      session.exercises.forEach((ex, i) => {
        const r = rowFor(i, ex)
        const entry = getExerciseEntry(ex.name)
        const bodyweight = entry ? !isExternallyLoaded(entry) : r.weight.trim() === ''
        const n = Math.max(0, Math.min(20, Math.round(Number(r.sets) || 0)))
        const reps = Math.max(0, Math.round(Number(r.reps) || 0))
        const weight = bodyweight ? 0 : Number(r.weight) || 0
        for (let s = 1; s <= n; s++) {
          sets.push({
            exerciseId: getExerciseId(ex.name),
            exerciseName: ex.name,
            setNumber: s,
            weightKg: weight,
            repsCompleted: reps,
            // The prescription's own unit, from the same helper the live
            // grid uses — a 40m carry logged here is 40 metres, not 40 reps.
            unit: prescriptionUnit(ex.prescription_type),
            isBodyweight: bodyweight,
            completedAt: `${date}T12:00:00.000Z`,
          })
        }
      })
      if (sets.length === 0) { setError('Add at least one set — or use "I missed it".'); return false }
      // The row first, so it can be completed: the history writer creates it
      // if needed but leaves it open, and an open session with sets reads
      // "partial" — which is not what "I did it" means.
      const sessionId = await ensureSessionSynced(profileId!, date, 'seeded')
      await writeHistoricalSession({ userId: profileId!, date, weekNumber, day: dayName, sets })
      await markSessionCompleted(sessionId, new Date(`${date}T12:00:00`))
      return true
    }, 'close')
  }

  const focus = session?.focus ?? plan.find(d => d.day === dayName)?.focus ?? 'session'
  const when = isToday ? 'today' : `${dayName}`
  /**
   * The same word, capitalised, for the two places it STARTS a sentence.
   *
   * FOUND ON A REAL SCREEN, 16 Sep 2026, by the rebuild driver's screenshot —
   * "…and I'll tell you which. today is back to the planned session next week."
   * The shorten copy beside it has read that way since 13 Sep and every source
   * check passed it, because a lowercase sentence start is not a string any of
   * them look for. This is what CLAUDE.md means by a browser driver finding
   * what no `test:` gate can.
   */
  const When = isToday ? 'Today' : `${dayName}`

  return (
    <Dialog open={!!target} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="what-happened-sheet">
        <DialogHeader>
          <DialogTitle>What happened {when}?</DialogTitle>
          <DialogDescription>{focus}{isToday ? '' : ` · ${date}`}</DialogDescription>
        </DialogHeader>

        {/* WHAT IS ALREADY SAID, with the way to unsay it. */}
        {(declared.missed || declared.rest || declared.swapped || movedAway) && phase === 'menu' && (
          <div className="space-y-2 rounded-lg border border-border/60 p-3 text-sm" data-testid="what-happened-declared">
            {declared.missed && (
              <div className="flex items-center justify-between gap-3">
                <span>You marked this day <span className="font-semibold">missed</span>.</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={undoMissed} aria-label="Undo marking this day missed">Undo</Button>
              </div>
            )}
            {declared.rest && (
              <div className="flex items-center justify-between gap-3">
                <span>You called this a <span className="font-semibold">rest day</span>.</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={undoRest} aria-label="Undo the rest day">Undo</Button>
              </div>
            )}
            {declared.swapped && (
              <div className="flex items-center justify-between gap-3">
                <span>You did <span className="font-semibold">{declared.swapped}</span> instead. Its log stays.</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={undoSwap} aria-label="Undo the swap">Undo</Button>
              </div>
            )}
            {movedAway && (
              <div className="flex items-center justify-between gap-3">
                <span>Moved to <span className="font-semibold">{movedAway.dayName}</span>.</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={undoMove} aria-label="Undo the move">Do it {isToday ? 'today' : `on ${dayName}`}</Button>
              </div>
            )}
          </div>
        )}

        {phase === 'menu' && (
          <div className="space-y-2" data-testid="what-happened-verbs">
            {isDone && <p className="text-sm text-muted-foreground">Nothing to explain — this session is logged.</p>}
            {!isDone && !hasSession && !movedAway && <p className="text-sm text-muted-foreground">No session was planned for {when}.</p>}
            {isToday && hasSession && !isDone && (
              <p className="text-xs text-muted-foreground">Did it? Tick the sets below — every one you log counts.</p>
            )}
            {verbs.includes('did_elsewhere') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setPhase('did_elsewhere')} data-verb="did_elsewhere">I did it, not in the app</Button>
            )}
            {verbs.includes('missed') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={markMissed} data-verb="missed">I missed it</Button>
            )}
            {verbs.includes('move') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy || moveCandidates.length === 0} onClick={() => setPhase('move')} data-verb="move">
                {moveCandidates.length > 0 ? 'Move it to another day' : 'Move it — no free day left this week'}
              </Button>
            )}
            {verbs.includes('rest') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={markRest} data-verb="rest">Make it a rest day</Button>
            )}
            {verbs.includes('something_else') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setPhase('something_else')} data-verb="something_else">I did something else instead</Button>
            )}
            {verbs.includes('shorten') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setPhase('shorten')} data-verb="shorten">I&rsquo;m short of time today</Button>
            )}
            {verbs.includes('rebuild') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setPhase('rebuild')} data-verb="rebuild">Give me a different session</Button>
            )}
            {verbs.includes('lighter') && (
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={runLighter} data-verb="lighter">Make it easier today</Button>
            )}
          </div>
        )}

        {phase === 'shorten' && (
          <div className="space-y-2" data-testid="what-happened-shorten">
            <p className="text-sm">How long have you got?</p>
            <p className="text-xs text-muted-foreground">
              Your main lift stays exactly as it is, and so do at least two others. The accessory work at the end
              comes out until it fits — or until only those are left, whichever comes first. {When} is back to the
              full session next week.
            </p>
            <div className="flex flex-wrap gap-2">
              {shortenChoices.map(m => (
                <Button key={m} size="sm" variant="outline" disabled={busy} onClick={() => runShorten(m)} data-shorten-minutes={m}>{m} min</Button>
              ))}
            </div>
            {shortenChoices.length === 0 && (
              <p className="text-sm text-muted-foreground">This session is already about as short as it gets.</p>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPhase('menu')}>Back</Button>
          </div>
        )}

        {phase === 'rebuild' && (
          <div className="space-y-2" data-testid="what-happened-rebuild">
            <p className="text-sm">A different session, same main lift?</p>
            {/* SAYS WHAT SURVIVES BEFORE THE TAP, not after. Her ruling is
                about the progression thread, and someone about to change their
                whole session needs to know the one thing that is not changing. */}
            <p className="text-xs text-muted-foreground">
              Your main lift stays exactly as it is — same weight, same sets — so this week&rsquo;s progression on it
              is untouched. Everything else gets swapped for something that fits your equipment and injuries.
              Anything with no real alternative stays put, and I&rsquo;ll tell you which. {When} is back to the
              planned session next week.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={runRebuild} data-testid="rebuild-confirm">Rebuild it</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPhase('menu')}>Back</Button>
            </div>
          </div>
        )}

        {phase === 'missed_recorded' && (
          <div className="space-y-3" data-testid="what-happened-missed-recorded">
            <p className="text-sm">Recorded as missed. The session stays on the plan.</p>
            {nextFree ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => moveTo(nextFree)} data-verb="move-after-missed">Move it to {nextFree.dayName}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={close}>Leave it</Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">No free day left this week to move it to.</p>
                <Button size="sm" variant="ghost" onClick={close}>Done</Button>
              </div>
            )}
          </div>
        )}

        {phase === 'move' && (
          <div className="space-y-2" data-testid="what-happened-move">
            <p className="text-sm">Which day?</p>
            {moveCandidates.map(c => (
              <Button key={c.date} variant="outline" className="w-full justify-start" disabled={busy} onClick={() => moveTo(c)} data-move-to={c.dayName}>{c.dayName}</Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setPhase('menu')}>Back</Button>
          </div>
        )}

        {phase === 'something_else' && (
          <div className="space-y-2" data-testid="what-happened-something-else">
            <Input value={activity} onChange={e => setActivity(e.target.value)} placeholder="What did you do? e.g. swim, class, run" aria-label="Activity" />
            <Input value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="Minutes (optional)" inputMode="numeric" aria-label="Minutes" />
            <div className="flex gap-2">
              <Button disabled={busy} onClick={saveSomethingElse} data-verb="save-something-else">Save</Button>
              <Button variant="ghost" onClick={() => setPhase('menu')}>Back</Button>
            </div>
          </div>
        )}

        {phase === 'did_elsewhere' && session && (
          <div className="space-y-3" data-testid="what-happened-did-elsewhere">
            <p className="text-xs text-muted-foreground">The plan's numbers are filled in — change any you did differently. Nothing is logged until you tap Log it.</p>
            {session.exercises.map((ex, i) => {
              const r = rowFor(i, ex)
              const entry = getExerciseEntry(ex.name)
              const bodyweight = entry ? !isExternallyLoaded(entry) : false
              const unitWord = UNIT_WORD[prescriptionUnit(ex.prescription_type)]
              return (
                <div key={`${ex.name}-${i}`} className="space-y-1">
                  <p className="text-sm font-medium">{ex.name} <span className="text-xs text-muted-foreground">· sets × {unitWord}{bodyweight ? '' : ' × kg'}</span></p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={r.sets} onChange={e => setRow(i, ex, { sets: e.target.value })} inputMode="numeric" aria-label={`${ex.name} sets`} placeholder="sets" />
                    <Input value={r.reps} onChange={e => setRow(i, ex, { reps: e.target.value })} inputMode="numeric" aria-label={`${ex.name} ${unitWord}`} placeholder={unitWord} />
                    {bodyweight
                      ? <div className="flex items-center justify-center rounded-md border border-border/60 text-xs text-muted-foreground">BW</div>
                      : <Input value={r.weight} onChange={e => setRow(i, ex, { weight: e.target.value })} inputMode="decimal" aria-label={`${ex.name} weight kg`} placeholder="kg" />}
                  </div>
                </div>
              )
            })}
            <div className="flex gap-2">
              <Button disabled={busy} onClick={saveDidElsewhere} data-verb="save-did-elsewhere">Log it</Button>
              <Button variant="ghost" onClick={() => setPhase('menu')}>Back</Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive" data-testid="what-happened-error">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
