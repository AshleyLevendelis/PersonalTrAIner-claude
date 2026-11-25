import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Minus, Plus, X, Dumbbell, Activity, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useActiveSession } from '@/hooks/useActiveSession'
import { PRIMARY_CTA_CLASS, PRIMARY_CTA_STYLE } from '@/components/OnePage'
import { getExerciseId, searchExercisesToLog } from '@/lib/exercise-db'
import { ensureNearCopies } from '@/lib/near-copies-loader'
import { getExerciseCompatibilityWarnings } from '@/lib/exercise-plan'
import { getSetsForDates, writeHistoricalSession, ensureSessionSynced } from '@/lib/set-log-store'
import { deleteCardioLog, isCardioLogUndoable, type CardioLogView } from '@/lib/cardio-log-store'
import { markSessionCompleted } from '@/lib/daily-tracking'
import { effortForRpe, effortLabel } from '@/lib/cardio-effort'
import { cardioPresetsFor } from '@/lib/cardio-presets'
import { getAppNow } from '@/lib/dev-clock'
import type { EquipmentAccess, UserProfile } from '@/lib/types'
import { UnplannedCardioEntry, type CardioPick } from './CardioSetRow'
import {
  type OwnWorkout, type OwnLift, type OwnCardio, type OwnItem,
  saveOwnWorkout, removeOwnWorkout, newOwnLift, withAnotherSet, newOwnCardio, setIsSavable,
  readWeight, readReps, hasAnythingSaved, ownWorkoutSummary, stepOwnRest, restWords,
} from '@/lib/own-workout'

/**
 * YOUR OWN WORKOUT, FULL SCREEN (his request 25 Nov 2026; the rules are in own-workout.ts). Live, today: add an exercise
 * as you go, tick each set (saved there and then), start your own rest at the length you choose, add cardio, Finish.
 * After the fact, a past day: the same list with no ticks or timers, and one Save that writes it to that day.
 */
export default function OwnWorkoutSheet({
  profileId, workout: initial, dayLabel, weekNumber, dayName, markDayDone, equipmentAccess, profile, exclusions, onClose,
}: {
  profileId: string
  workout: OwnWorkout
  /** "Today · Tue 25 Nov" / "Mon 24 Nov". */
  dayLabel: string
  weekNumber: number | null
  dayName: string
  /** True on a day with no session of the plan's: finishing marks the day trained. False on a plan day (it stays the plan's). */
  markDayDone: boolean
  equipmentAccess?: EquipmentAccess | null
  profile?: UserProfile | null
  exclusions?: string[]
  onClose: () => void
}) {
  const session = useActiveSession()
  const live = initial.mode === 'live'
  const [w, setW] = useState<OwnWorkout>(initial)
  const [picking, setPicking] = useState<null | 'lift'>(initial.items.length === 0 ? 'lift' : null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  // THE SET NUMBERS ALREADY USED ON THAT DATE, by exercise: today from the session's own logs, a past day read once.
  const [pastTaken, setPastTaken] = useState<Map<string, number[]> | null>(null)
  useEffect(() => {
    if (live) return
    let alive = true
    void getSetsForDates(profileId, [w.date]).then(m => {
      if (!alive) return
      const by = new Map<string, number[]>()
      for (const l of m.get(w.date) ?? []) {
        const id = l.exercise_id ?? getExerciseId(l.exercise_name)
        by.set(id, [...(by.get(id) ?? []), l.set_number])
      }
      setPastTaken(by)
    }).catch(() => { if (alive) setPastTaken(new Map()) })
    return () => { alive = false }
  }, [live, profileId, w.date])
  const taken = (exerciseId: string): number[] => live
    ? session.logs.filter(l => (l.exercise_id ?? getExerciseId(l.exercise_name)) === exerciseId).map(l => l.set_number)
    : pastTaken?.get(exerciseId) ?? []

  // Every change is kept on the phone at once, so closing the app mid-workout loses nothing.
  const update = (next: OwnWorkout) => {
    setW(next)
    if (!saveOwnWorkout(profileId, next)) setNote("Couldn't keep this on your phone. Your ticked sets are saved.")
  }
  const updateItem = (key: string, fn: (i: OwnItem) => OwnItem) => update({ ...w, items: w.items.map(i => (i.key === key ? fn(i) : i)) })
  const removeItem = (key: string) => update({ ...w, items: w.items.filter(i => i.key !== key) })

  const close = () => {
    // NOTHING SAVED, NOTHING KEPT: an opened-and-closed workout leaves no empty card on the day.
    if (!hasAnythingSaved(w) && !w.finishedAtIso) removeOwnWorkout(profileId, w.id)
    onClose()
  }

  // ---- live: one set ----
  const tickSet = (lift: OwnLift, i: number) => {
    const s = lift.sets[i]
    if (s.done) {
      session.deleteSet({ userId: profileId, date: w.date, exerciseId: lift.exerciseId, setNumber: s.setNumber, isWarmup: false, dropIndex: 0 })
      session.refresh()
      updateItem(lift.key, it => ({ ...(it as OwnLift), sets: (it as OwnLift).sets.map((x, j) => (j === i ? { ...x, done: false } : x)) }))
      return
    }
    const weight = readWeight(s.weight)
    const reps = readReps(s.reps)
    if (weight == null || reps == null) { setNote(reps == null ? 'Type the reps first.' : "That weight doesn't read as a number."); return }
    const saved = session.logOwnSet({
      userId: profileId, date: w.date, weekNumber, day: dayName, exerciseId: lift.exerciseId, exerciseName: lift.name,
      setNumber: s.setNumber, weightKg: weight, repsCompleted: reps, isBodyweight: weight === 0,
    })
    if (!saved) { setNote("That weight is more than anyone lifts, so it wasn't saved."); return }
    setNote(null)
    session.refresh()
    updateItem(lift.key, it => ({ ...(it as OwnLift), sets: (it as OwnLift).sets.map((x, j) => (j === i ? { ...x, done: true } : x)) }))
  }

  // ---- one cardio: logged by the app's one shared cardio row (his 24 Sep ruling), on this workout's day ----
  const cardioLogged = (c: OwnCardio, view: CardioLogView) => {
    setNote(null)
    updateItem(c.key, it => ({
      ...(it as OwnCardio), done: true, clientId: view.clientId, activity: view.activity_name,
      minutes: String(view.duration_minutes), effort: effortForRpe(view.intensity_rpe),
      distanceKm: view.distance_km != null ? String(view.distance_km) : '',
    }))
  }
  const undoCardio = (c: OwnCardio) => {
    if (!c.clientId || !isCardioLogUndoable(c.clientId)) { setNote('That cardio is saved, and too long ago to take back here.'); return }
    void deleteCardioLog(c.clientId)
    updateItem(c.key, it => ({ ...(it as OwnCardio), done: false, clientId: undefined }))
  }

  const markDay = async (at: Date): Promise<boolean> => {
    if (!markDayDone) return true
    try {
      const id = await ensureSessionSynced(profileId, w.date)
      await markSessionCompleted(id, at)
      return true
    } catch {
      return false
    }
  }

  // ---- live: finish ----
  const finish = async () => {
    if (!hasAnythingSaved(w)) { setNote('Tick a set or a cardio first, or close it.'); return }
    setSaving(true)
    const now = getAppNow(profileId)
    const marked = await markDay(now)
    const next = { ...w, finishedAtIso: now.toISOString() }
    update(next)
    session.refresh()
    setSaving(false)
    setDone(marked ? `Saved · ${ownWorkoutSummary(next)}` : `Saved · ${ownWorkoutSummary(next)}. The day couldn't be marked trained yet; it will once you have signal.`)
  }

  // ---- after the fact: save everything typed ----
  const saveAfter = async () => {
    const lifts = w.items.filter((i): i is OwnLift => i.kind === 'lift')
    const typed = lifts.flatMap(l => l.sets.filter(s => !s.done && (s.reps.trim() || s.weight.trim())).map(s => ({ l, s })))
    const unreadable = typed.filter(({ s }) => !setIsSavable(s))
    if (unreadable.length > 0) { setNote(`${unreadable[0].l.name}: every set needs its reps, and a weight that reads (blank is bodyweight).`); return }
    if (typed.length === 0 && !hasAnythingSaved(w)) { setNote('Add an exercise or log a cardio first.'); return }
    setSaving(true)
    const noon = `${w.date}T12:00:00`
    try {
      if (typed.length > 0) {
        await writeHistoricalSession({
          userId: profileId, date: w.date, weekNumber, day: dayName,
          sets: typed.map(({ l, s }) => {
            const kg = readWeight(s.weight)!
            return { exerciseId: l.exerciseId, exerciseName: l.name, setNumber: s.setNumber, weightKg: kg, repsCompleted: readReps(s.reps)!, isBodyweight: kg === 0, completedAt: noon }
          }),
        })
      }
    } catch {
      setSaving(false)
      setNote("Couldn't save it. Check your signal and tap Save again; nothing was written.")
      return
    }
    const marked = await markDay(new Date(noon))
    const next: OwnWorkout = {
      ...w,
      finishedAtIso: w.finishedAtIso ?? new Date(noon).toISOString(),
      items: w.items.map(i => i.kind === 'lift'
        ? { ...i, sets: i.sets.filter(s => s.done || setIsSavable(s)).map(s => ({ ...s, done: true })) }
        : i),
    }
    update(next)
    session.refresh()
    setSaving(false)
    setDone(marked ? `Saved to ${dayLabel} · ${ownWorkoutSummary(next)}` : `Saved to ${dayLabel} · ${ownWorkoutSummary(next)}. The day couldn't be marked trained yet.`)
  }

  const addLift = (name: string) => {
    const id = getExerciseId(name)
    update({ ...w, items: [...w.items, newOwnLift(name, id, taken(id))] })
    setPicking(null)
  }
  const addCardio = () => {
    update({ ...w, items: [...w.items, newOwnCardio()] })
    setPicking(null)
  }

  if (done) {
    return (
      <Shell onClose={onClose} dayLabel={dayLabel} live={live} name={w.name} profileId={profileId}>
        <div className="mt-10 flex flex-col items-center gap-4 text-center" data-testid="own-done">
          <div className="flex size-14 items-center justify-center rounded-full" style={{ background: 'rgba(var(--glow-rgb), .16)' }}>
            <Check className="size-7 text-primary-text" aria-hidden />
          </div>
          <p className="text-[1.0625rem] font-semibold" data-testid="own-done-line">{done}</p>
          <button type="button" className={PRIMARY_CTA_CLASS} style={PRIMARY_CTA_STYLE} data-testid="own-done-close" onClick={onClose}>Done</button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell onClose={close} dayLabel={dayLabel} live={live} name={w.name} startedAtIso={live ? w.startedAtIso : null} profileId={profileId}>
      <Input
        aria-label="Workout name"
        data-testid="own-name"
        value={w.name}
        onChange={e => update({ ...w, name: e.target.value })}
        className="mt-1 h-11 border-0 bg-transparent px-0 text-[1.75rem] font-bold tracking-[-.02em] focus-visible:ring-0"
      />
      {!live && <p className="text-[0.8125rem] text-muted-foreground" data-testid="own-after-line">Type what you did. Save writes it to {dayLabel}.</p>}

      <div className="mt-4 flex flex-col gap-3">
        {w.items.map(item => item.kind === 'lift'
          ? <LiftCard key={item.key} lift={item} live={live} restOn={session.restLabel === restKey(w, item)} restRemainingMs={session.restRemainingMs}
              onChange={next => updateItem(item.key, () => next)}
              onTick={i => tickSet(item, i)}
              onAddSet={() => updateItem(item.key, it => withAnotherSet(it as OwnLift, taken((it as OwnLift).exerciseId)))}
              onRemove={item.sets.some(s => s.done) ? undefined : () => removeItem(item.key)}
              onStartRest={() => session.startRest(restKey(w, item), item.restSeconds)}
              onRestAdjust={d => session.adjustRest(d)}
              onRestDone={() => session.dismissRest()} />
          : <OwnCardioBlock key={item.key} cardio={item} live={live} date={w.date} presets={cardioPresetsFor(equipmentAccess)}
              onLogged={view => cardioLogged(item, view)} onUndo={() => undoCardio(item)}
              onRemove={item.done ? undefined : () => removeItem(item.key)} />)}
      </div>

      {picking === 'lift' ? (
        <ExercisePicker profile={profile} exclusions={exclusions} onPick={addLift} onCancel={() => setPicking(null)} />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-testid="own-add-exercise" onClick={() => setPicking('lift')}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[0.875rem] font-semibold text-primary-text"
            style={{ background: 'rgba(var(--glow-rgb), .12)', border: '1px solid rgba(var(--glow-rgb), .35)' }}>
            <Dumbbell className="size-4" aria-hidden /> Add exercise
          </button>
          <button type="button" data-testid="own-add-cardio" onClick={addCardio}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border text-[0.875rem] font-semibold">
            <Activity className="size-4" aria-hidden /> Add cardio
          </button>
        </div>
      )}

      {note && <p className="mt-3 text-[0.8125rem] text-foreground" role="status" data-testid="own-note">{note}</p>}

      <div className="mt-5 pb-8">
        <button type="button" disabled={saving} className={PRIMARY_CTA_CLASS} style={PRIMARY_CTA_STYLE}
          data-testid={live ? 'own-finish' : 'own-save'} onClick={() => { void (live ? finish() : saveAfter()) }}>
          {saving ? 'Saving…' : live ? 'Finish workout' : 'Save workout'}
        </button>
      </div>
    </Shell>
  )
}

/** One rest per lift at a time: the label the session's one rest timer carries, so this card knows the rest is its own. */
function restKey(w: OwnWorkout, lift: OwnLift): string {
  return `own:${w.id}:${lift.key}`
}

function Shell({ children, onClose, dayLabel, live, name, startedAtIso, profileId }: { children: React.ReactNode; onClose: () => void; dayLabel: string; live: boolean; name: string; startedAtIso?: string | null; profileId: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={name || 'Your workout'} data-testid="own-workout"
      className="fixed inset-0 z-[80] overflow-y-auto bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto max-w-[520px] px-[22px] pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[.2em] text-primary-text" data-testid="own-kicker">
            {live ? dayLabel : `Logging · ${dayLabel}`}
          </span>
          <div className="flex items-center gap-3">
            {startedAtIso && <Elapsed fromIso={startedAtIso} nowMs={() => getAppNow(profileId).getTime()} />}
            <button type="button" aria-label="Close" data-testid="own-close" onClick={onClose} className="flex size-11 items-center justify-center rounded-full">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/** How long the workout has run, on the app's own clock (the one its start was stamped with). */
function Elapsed({ fromIso, nowMs }: { fromIso: string; nowMs: () => number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 1000); return () => window.clearInterval(t) }, [])
  const s = Math.max(0, Math.floor((nowMs() - new Date(fromIso).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return <span className="tabular-mono text-[0.875rem] text-muted-foreground" data-testid="own-elapsed">{h > 0 ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`}</span>
}

function LiftCard({ lift, live, restOn, restRemainingMs, onChange, onTick, onAddSet, onRemove, onStartRest, onRestAdjust, onRestDone }: {
  lift: OwnLift; live: boolean; restOn: boolean; restRemainingMs: number | null
  onChange: (l: OwnLift) => void; onTick: (i: number) => void; onAddSet: () => void; onRemove?: () => void
  onStartRest: () => void; onRestAdjust: (d: number) => void; onRestDone: () => void
}) {
  const lastDone = lift.sets.reduce((at, s, i) => (s.done ? i : at), -1)
  const setField = (i: number, field: 'weight' | 'reps', v: string) => onChange({ ...lift, sets: lift.sets.map((s, j) => (j === i ? { ...s, [field]: v } : s)) })
  const removeSet = (i: number) => onChange({ ...lift, sets: lift.sets.filter((_, j) => j !== i) })
  return (
    <div className="rounded-2xl bg-card p-3.5" data-testid="own-lift" data-name={lift.name}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[1rem] font-semibold leading-tight">{lift.name}</p>
        {onRemove && <button type="button" aria-label={`Remove ${lift.name}`} className="flex size-9 items-center justify-center text-muted-foreground" onClick={onRemove}><Trash2 className="size-4" aria-hidden /></button>}
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {lift.sets.map((s, i) => (
          <div key={s.setNumber} className="flex items-center gap-2" data-testid="own-set" data-done={s.done ? 'true' : 'false'}>
            <span className="w-11 shrink-0 text-[0.75rem] text-muted-foreground">Set {i + 1}</span>
            <Input inputMode="decimal" aria-label={`${lift.name} set ${i + 1} weight`} placeholder="kg" value={s.weight} disabled={s.done}
              data-testid="own-weight" onChange={e => setField(i, 'weight', e.target.value)} className="h-11 w-[84px] text-center tabular-mono border bg-[color:var(--surface-deep)]" />
            <span className="text-muted-foreground">×</span>
            <Input inputMode="numeric" aria-label={`${lift.name} set ${i + 1} reps`} placeholder="reps" value={s.reps} disabled={s.done}
              data-testid="own-reps" onChange={e => setField(i, 'reps', e.target.value)} className="h-11 w-[72px] text-center tabular-mono border bg-[color:var(--surface-deep)]" />
            {live ? (
              <button type="button" aria-label={s.done ? `Undo ${lift.name} set ${i + 1}` : `Save ${lift.name} set ${i + 1}`} aria-pressed={s.done}
                data-testid="own-tick" onClick={() => onTick(i)}
                className="ml-auto flex size-11 items-center justify-center rounded-full border"
                style={s.done ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'transparent' } : undefined}>
                <Check className="size-5" aria-hidden />
              </button>
            ) : s.done ? (
              <span className="ml-auto text-[0.75rem] text-muted-foreground" data-testid="own-saved">Saved</span>
            ) : lift.sets.length > 1 ? (
              <button type="button" aria-label={`Remove ${lift.name} set ${i + 1}`} className="ml-auto flex size-11 items-center justify-center text-muted-foreground" onClick={() => removeSet(i)}><X className="size-4" aria-hidden /></button>
            ) : null}
          </div>
        ))}
      </div>
      {/* YOUR OWN REST, after a ticked set: the length is his and stays for the next set; Start runs it, Done ends it. */}
      {live && lastDone >= 0 && (
        restOn && restRemainingMs != null ? (
          <div className="mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(var(--glow-rgb), .10)' }} data-testid="own-rest-running">
            <span className="text-[0.8125rem] text-muted-foreground">Rest</span>
            <span className="tabular-mono text-[1.125rem] font-bold" data-testid="own-rest-left">{clock(restRemainingMs)}</span>
            <button type="button" aria-label="15 seconds less rest" className="ml-auto min-h-11 px-2 text-[0.8125rem]" onClick={() => onRestAdjust(-15)}>−15</button>
            <button type="button" aria-label="15 seconds more rest" className="min-h-11 px-2 text-[0.8125rem]" onClick={() => onRestAdjust(15)}>+15</button>
            <button type="button" className="min-h-11 px-2 text-[0.8125rem] font-semibold text-primary-text" data-testid="own-rest-done" onClick={onRestDone}>Done</button>
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-1.5" data-testid="own-rest">
            <button type="button" aria-label="Shorter rest" className="flex size-11 items-center justify-center rounded-full border" data-testid="own-rest-minus" onClick={() => onChange({ ...lift, restSeconds: stepOwnRest(lift.restSeconds, -1) })}><Minus className="size-4" aria-hidden /></button>
            <button type="button" data-testid="own-rest-start" onClick={onStartRest} className="min-h-11 flex-1 rounded-full border px-3 text-[0.875rem] font-semibold">
              Start rest · <span data-testid="own-rest-length">{restWords(lift.restSeconds)}</span>
            </button>
            <button type="button" aria-label="Longer rest" className="flex size-11 items-center justify-center rounded-full border" data-testid="own-rest-plus" onClick={() => onChange({ ...lift, restSeconds: stepOwnRest(lift.restSeconds, 1) })}><Plus className="size-4" aria-hidden /></button>
          </div>
        )
      )}
      <button type="button" data-testid="own-add-set" onClick={onAddSet} className="mt-2 flex min-h-11 items-center gap-1.5 text-[0.875rem] font-semibold text-primary-text">
        <Plus className="size-4" aria-hidden /> Add set
      </button>
    </div>
  )
}

function clock(ms: number): string {
  const over = ms < 0
  const s = Math.ceil(Math.abs(ms) / 1000)
  return `${over ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * ONE CARDIO IN HIS OWN WORKOUT: the app's shared cardio row until it is logged (chips, minutes, km, Easy/Steady/Hard,
 * the one-tap log), then a read-back. A cardio from a saved workout starts on its own activity and minutes.
 */
function OwnCardioBlock({ cardio, live, date, presets, onLogged, onUndo, onRemove }: {
  cardio: OwnCardio; live: boolean; date: string; presets: readonly { label: string; activity: string; minutes: number; rpe: number }[]
  onLogged: (view: CardioLogView) => void; onUndo: () => void; onRemove?: () => void
}) {
  if (cardio.done) {
    const effort = cardio.effort ? ` · ${effortLabel(cardio.effort)}` : ''
    const km = cardio.distanceKm ? ` · ${cardio.distanceKm} km` : ''
    return (
      <div className="flex min-h-[52px] items-center gap-2 rounded-2xl bg-card px-3.5" data-testid="own-cardio" data-done="true">
        <Check className="size-4 shrink-0 text-primary-text" aria-hidden />
        <span className="flex-1 text-[0.9375rem]" data-testid="own-cardio-readback">{cardio.activity} · {cardio.minutes} min{km}{effort}</span>
        {live && <button type="button" data-testid="own-cardio-undo" onClick={onUndo} className="min-h-11 px-2 text-[0.8125rem] font-semibold text-primary-text">Undo</button>}
      </div>
    )
  }
  const minutes = Number(cardio.minutes)
  const matched = presets.findIndex(p => p.activity === cardio.activity)
  const own: CardioPick[] = cardio.activity && matched < 0
    ? [{ label: cardio.activity.length > 18 ? `${cardio.activity.slice(0, 16)}…` : cardio.activity, activity: cardio.activity, minutes: minutes > 0 ? minutes : 15 }]
    : []
  const picks: CardioPick[] = [...own, ...presets.map(p => ({ ...p, minutes: p.activity === cardio.activity && minutes > 0 ? minutes : p.minutes }))]
  const initial = own.length > 0 ? 0 : matched >= 0 ? matched : null
  return (
    <div className="rounded-2xl bg-card p-3.5" data-testid="own-cardio" data-done="false">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[1rem] font-semibold leading-tight">Cardio</p>
        {onRemove && <button type="button" aria-label="Remove cardio" className="flex size-9 shrink-0 items-center justify-center text-muted-foreground" onClick={onRemove}><Trash2 className="size-4" aria-hidden /></button>}
      </div>
      <UnplannedCardioEntry picks={picks} initialPick={initial} date={date} onLogged={onLogged} />
    </div>
  )
}

export function ExercisePicker({ profile, exclusions, onPick, onCancel }: { profile?: UserProfile | null; exclusions?: string[]; onPick: (name: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState('')
  const [ready, setReady] = useState(0)
  useEffect(() => { let alive = true; void ensureNearCopies().then(() => { if (alive) setReady(n => n + 1) }); return () => { alive = false } }, [])
  const found = useMemo(() => (q.trim().length < 2 ? [] : searchExercisesToLog(q.trim(), 8)), [q, ready])
  const exact = found.some(e => e.name.toLowerCase() === q.trim().toLowerCase())
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="mt-3 rounded-2xl bg-[color:var(--surface-deep)] p-3" data-testid="own-picker">
      <div className="flex items-center gap-2">
        <Input ref={input} autoFocus aria-label="Exercise" placeholder="Search: bench, leg press, cable row…" value={q} data-testid="own-search"
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && q.trim()) onPick(found[0]?.name ?? q.trim()) }} className="h-11" />
        <button type="button" className="min-h-11 px-2 text-[0.8125rem] text-muted-foreground" onClick={onCancel}>Cancel</button>
      </div>
      {found.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {found.map(e => {
            const marks = profile ? getExerciseCompatibilityWarnings(e, profile, exclusions ?? []) : []
            return (
              <li key={e.name}>
                <button type="button" data-testid="own-search-result" data-name={e.name} onClick={() => onPick(e.name)}
                  className="w-full min-h-11 rounded-lg bg-[color:var(--surface)] px-3 py-2 text-left text-[0.875rem]">
                  {e.name}
                  {marks.length > 0 && <span className="block text-[0.75rem] text-muted-foreground">{marks[0]}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {q.trim().length >= 2 && !exact && (
        <button type="button" data-testid="own-search-typed" onClick={() => onPick(q.trim())} className="mt-1 min-h-11 text-[0.8125rem] font-semibold text-primary-text">
          Add “{q.trim()}”
        </button>
      )}
    </div>
  )
}
