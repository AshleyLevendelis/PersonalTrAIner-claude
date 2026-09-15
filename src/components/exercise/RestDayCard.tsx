import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, ChevronRight, Loader2, ArrowRight } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { isPlausibleCardioDuration, MAX_PLAUSIBLE_CARDIO_MINUTES, saveCardioLog, deleteCardioLog } from '@/lib/cardio-log-store'
import { prescriptionLine } from '@/lib/activity-day'
import type { WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// Rest and active-recovery days as first-class calm states (LAYOUT-DESIGN.md
// §1.8) — today both are dead ends with zero controls. Rebuilt: the week
// tally, a preview of tomorrow's session (tap -> peek), an activity log
// entry, and (rest day only) a "Train anyway" escape onto another training
// day's prescription.
// ---------------------------------------------------------------------------

function ActivityLogEntry({ alsoLabel = false }: { alsoLabel?: boolean }) {
  const { profileId, date } = useActiveSession()
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState('')
  const [duration, setDuration] = useState('')
  const [durationError, setDurationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loggedClientId, setLoggedClientId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const handleUndo = async () => {
    if (!loggedClientId) return
    setUndoing(true)
    try {
      await deleteCardioLog(loggedClientId)
      setLoggedClientId(null)
      setActivity('')
      setDuration('')
    } finally {
      setUndoing(false)
    }
  }

  if (loggedClientId) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Activity logged for today.</span>
        <button type="button" className="font-semibold text-primary-text disabled:opacity-50" disabled={undoing} onClick={handleUndo}>
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        {/* When the day already PRESCRIBES an activity, that activity has its
            own one-tap Log above this. Offering "log a walk" underneath a
            prescribed walk reads as the same button twice, so this one says
            what it is actually for. */}
        {alsoLabel ? 'Log something else you did' : 'Log a walk or other activity'}
      </button>
    )
  }

  const handleSave = () => {
    if (!profileId || !activity.trim() || !duration) return
    // `min="1"` on the input is a hint the browser does not enforce: -5 typed
    // here parsed, passed the truthiness check, and was stored as minus five
    // minutes of cardio. The store refuses it now; this is what tells the
    // person holding the phone, instead of a spinner that stops and no row.
    const minutes = parseInt(duration, 10)
    if (!isPlausibleCardioDuration(minutes)) {
      setDurationError(`Enter between 1 and ${MAX_PLAUSIBLE_CARDIO_MINUTES} minutes.`)
      return
    }
    setDurationError(null)
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: activity.trim(),
      durationMinutes: minutes,
      intensityRpe: 4,
    })
    setSaving(false)
    if (!view) {
      setDurationError("That didn't save — check the number and try again.")
      return
    }
    setLoggedClientId(view.clientId ?? null)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Activity"
          value={activity}
          onChange={e => setActivity(e.target.value)}
          className="h-8 text-sm"
          autoFocus
        />
        <Input
          type="number"
          min="1"
          max={MAX_PLAUSIBLE_CARDIO_MINUTES}
          placeholder="Mins"
          value={duration}
          onChange={e => setDuration(e.target.value)}
          className="h-8 text-sm w-20"
        />
        <Button size="sm" className="h-8 shrink-0" disabled={!activity.trim() || !duration || saving} onClick={handleSave}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {durationError && (
        <p className="text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">{durationError}</p>
      )}
    </div>
  )
}

function TomorrowPreview({
  tomorrow,
  onPeek,
}: {
  tomorrow: { dayName: string; focus: string; detail: string }
  onPeek?: (dayName: string) => void
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-between gap-2 rounded-lg bg-[color:var(--surface-raised)] px-3 py-2 text-left hover:bg-accent/40 transition-colors disabled:opacity-50"
      onClick={() => onPeek?.(tomorrow.dayName)}
      disabled={!onPeek}
    >
      <span className="text-xs text-foreground">
        {/* The third clause is a STRING, not an exercise count, because an
            activity day has none: "Walk · 0 exercises" was the same lie the
            empty card told, one row smaller. The caller says what the day is
            measured in — exercises, or minutes. */}
        Tomorrow · {tomorrow.focus} · {tomorrow.detail}
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
    </button>
  )
}

/**
 * "MAKE THIS A CARDIO DAY" — the screen half of propose_cardio_session.
 *
 * Parity, not decoration (CLAUDE.md rule 4): the coach gained a tool that puts
 * a cardio session on a day, and a coach tool with no screen path is a gap
 * unless the exceptions list gives a reason. The only reason available here
 * would have been "not built yet", which is not one.
 *
 * SAME VERB, SAME SCOPE, SAME EXECUTOR. The coach's version writes every week
 * of the block, because "Wednesday is my cardio day" is a standing statement;
 * so does this. Both go through executeCardioSession, so the two surfaces
 * cannot drift about what adding a session means.
 *
 * EFFORT IS THREE CHIPS, NOT A 1-10 BOX. The scale is the coach's own
 * (conversational / steady / hard), and nobody standing in a kitchen wants to
 * pick a number between one and ten for a walk.
 */
const EFFORTS: { label: string; note: string; rpe: number }[] = [
  { label: 'Easy', note: 'can hold a conversation', rpe: 3 },
  { label: 'Steady', note: 'working, but not gasping', rpe: 5 },
  { label: 'Hard', note: 'intervals', rpe: 7 },
]

function AddCardioSession({ dayName, onAdd }: { dayName: string; onAdd: (a: string, m: number, rpe: number) => Promise<string | null> }) {
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState('')
  const [minutes, setMinutes] = useState('')
  const [rpe, setRpe] = useState(EFFORTS[1].rpe)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        Make {dayName} a cardio day →
      </button>
    )
  }

  const mins = parseInt(minutes, 10)
  const ready = !!activity.trim() && Number.isFinite(mins) && mins > 0

  const handleSave = async () => {
    if (!ready) return
    // The same bound the logging form uses, for the same reason: `min` on a
    // number input is a hint the browser does not enforce.
    if (!isPlausibleCardioDuration(mins)) {
      setError(`Enter between 1 and ${MAX_PLAUSIBLE_CARDIO_MINUTES} minutes.`)
      return
    }
    setError(null)
    setSaving(true)
    const failure = await onAdd(activity.trim(), mins, rpe)
    setSaving(false)
    if (failure) { setError(failure); return }
    setOpen(false)
    setActivity(''); setMinutes('')
  }

  return (
    <div className="space-y-2" data-testid="add-cardio">
      <p className="text-xs text-muted-foreground">
        This goes on {dayName} for the rest of this block — not just today.
      </p>
      <div className="flex items-center gap-2">
        <Input placeholder="Run, Cycle, Swim…" value={activity} onChange={e => setActivity(e.target.value)} className="h-8 text-sm" autoFocus />
        <Input
          type="number" min="1" max={MAX_PLAUSIBLE_CARDIO_MINUTES} placeholder="Mins"
          value={minutes} onChange={e => setMinutes(e.target.value)} className="h-8 text-sm w-20"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EFFORTS.map(e => (
          <Button
            key={e.rpe}
            variant={rpe === e.rpe ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setRpe(e.rpe)}
            title={e.note}
          >
            {e.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8" disabled={!ready || saving} onClick={handleSave}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : 'Add it'}
        </Button>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setOpen(false); setError(null) }}>
          Cancel
        </button>
      </div>
      {error && <p className="text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">{error}</p>}
    </div>
  )
}

export function RestDayCard({
  dayName,
  weekTally,
  tomorrow,
  onPeek,
  trainAnywayOptions,
  onTrainAnyway,
  onAddCardio,
}: {
  dayName: string
  weekTally: { done: number; planned: number }
  tomorrow?: { dayName: string; focus: string; detail: string }
  onPeek?: (dayName: string) => void
  trainAnywayOptions: string[]
  onTrainAnyway: (sourceDayName: string) => void
  /** Returns null on success, or a sentence to show. Absent means no plan loaded yet. */
  onAddCardio?: (activity: string, minutes: number, targetRpe: number) => Promise<string | null>
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <Card className="bg-[color:var(--surface-deep)]">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-full bg-muted shrink-0">
            <Heart className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Rest day · {dayName}</p>
            <p className="text-xs text-muted-foreground">Recovery is where the adaptation happens.</p>
          </div>
        </div>
        {weekTally.planned > 0 && (
          <p className="text-xs text-muted-foreground">
            This week: {weekTally.done} of {weekTally.planned} sessions done.
          </p>
        )}
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry />
        {onAddCardio && <AddCardioSession dayName={dayName} onAdd={onAddCardio} />}
        {trainAnywayOptions.length > 0 && !pickerOpen && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={() => setPickerOpen(true)}
          >
            Train anyway →
          </button>
        )}
        {pickerOpen && (
          <div className="flex flex-wrap gap-1.5">
            {trainAnywayOptions.map(d => (
              <Button key={d} variant="outline" size="sm" className="h-7 text-xs" onClick={() => onTrainAnyway(d)}>
                {d}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * A day whose session has LEFT for another day this week — "I'll do it
 * tomorrow". The first version kept the full session on screen under a
 * banner, copying the swapped day; Ashley, 8 Sep 2026: "it didnt move my
 * workout." So this shows the moved state and nothing of the session: where
 * it went, the week's tally, tomorrow, the activity log, and one way back.
 *
 * "Do it today instead" UNMAKES the move rather than adding a second copy.
 * With the move still recorded, training today would earn this day its tick
 * (logged work outranks 'moved' in classifyDay) while the other day still
 * showed the session as moved in — the same work owed twice. The caller
 * clears the move with the write the chat's Undo uses.
 */
export function MovedDayCard({
  focus,
  toDayName,
  weekTally,
  tomorrow,
  onPeek,
  onDoItToday,
}: {
  /** What left — the plan's own session for this weekday. Null when the plan cannot say. */
  focus: string | null
  toDayName: string
  weekTally: { done: number; planned: number }
  tomorrow?: { dayName: string; focus: string; detail: string }
  onPeek?: (dayName: string) => void
  /** Resolves true when the move was cleared, false when the write failed. */
  onDoItToday: () => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleDoItToday = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const ok = await onDoItToday()
      if (!ok) setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="bg-[color:var(--surface-deep)]">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-full bg-muted shrink-0">
            <ArrowRight className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium" data-testid="moved-away">{focus ?? "Today's session"} → {toDayName}</p>
            <p className="text-xs text-muted-foreground">Moved to {toDayName}. Nothing owed here today.</p>
          </div>
        </div>
        {weekTally.planned > 0 && (
          <p className="text-xs text-muted-foreground">
            This week: {weekTally.done} of {weekTally.planned} sessions done.
          </p>
        )}
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry />
        {/* Its own block, not inline after the activity link: two text links
            on one line ran together as "Log a walk or other activityDo it
            today instead" in the first screenshot. */}
        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
            disabled={busy}
            onClick={handleDoItToday}
          >
            {busy ? 'Putting it back…' : 'Do it today instead →'}
          </button>
        </div>
        {failed && (
          <p className="text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">
            That didn&apos;t save — the session is still on {toDayName}. Try again in a moment.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function ActiveRecoveryCard({
  workout,
  weekTally,
  tomorrow,
  onPeek,
  onAddCardio,
}: {
  workout: WorkoutDay
  weekTally: { done: number; planned: number }
  tomorrow?: { dayName: string; focus: string; detail: string }
  onPeek?: (dayName: string) => void
  onAddCardio?: (activity: string, minutes: number, targetRpe: number) => Promise<string | null>
}) {
  const cardio = workout.recommendedCardio
  // A DAY WHOSE WHOLE PLAN IS AN ACTIVITY SHOWS THE ACTIVITY. The beginner's
  // walking plan (toStartingOutDay) has always carried a real prescription —
  // minutes, effort, and a reason written for a person — and no screen read it,
  // so the one card that could render it fell straight through to the blank
  // "log a walk" form. The plan said walk 20 minutes; the screen asked what you
  // did. This is not an add-on like recommendedCardio: it IS the session, which
  // is why it leads the card and why the card stops calling itself recovery.
  const planned = workout.plannedActivity
  return (
    <Card className="border-[color:var(--role-warn-border)] bg-gradient-to-br from-[color:var(--role-warn-bg)] to-background">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-[color:var(--role-warn-bg)] flex items-center justify-center shrink-0">
            <Heart className="size-5 text-[color:var(--role-warn)]" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium" data-testid="activity-day-title">
              {planned ? `${workout.focus} · ${workout.day}` : `Active recovery · ${workout.day}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {planned ? "This is today's session." : workout.focus}
            </p>
          </div>
        </div>
        {weekTally.planned > 0 && (
          <p className="text-xs text-muted-foreground">
            This week: {weekTally.done} of {weekTally.planned} sessions done.
          </p>
        )}
        {planned && (
          <div className="space-y-1.5" data-testid="planned-activity">
            <PrescribedRow
              activity={planned.activity}
              duration={planned.duration}
              targetRpe={planned.targetRpe}
            />
            {planned.reason && (
              <p className="text-xs leading-[1.5] text-muted-foreground">{planned.reason}</p>
            )}
          </div>
        )}
        {/* NOT BOTH. recommendedCardio is a SUGGESTION for an otherwise-empty
            day; plannedActivity is what the plan prescribes for it. Showing
            both put "Cycle · 35m · RPE 3" directly above "Active Recovery Walk
            or Light Swim" and left the person to guess which was the session —
            the same unanswerable question the type comment warns about, on
            screen instead of in the data. Found by the driver, on a real card. */}
        {!planned && cardio && <PrescribedRow activity={cardio.activity} duration={cardio.duration} targetRpe={cardio.targetRpe} />}
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry alsoLabel={!!planned} />
        {/* AN EMPTY DAY IS THE ONE YOU WANT TO FILL, and this is the card an
            empty day actually gets. The control was on RestDayCard alone at
            first — which only renders when the plan has NO row for the day at
            all. A scheduled day with nothing on it comes here instead, and
            that is precisely the day somebody means by "Wednesday is my cardio
            day". Found by the driver, not by reading: it landed on a Tuesday
            reading "Active recovery" with no control on it.
            Hidden once the day HAS a prescription — there is nothing to add. */}
        {onAddCardio && !planned && <AddCardioSession dayName={workout.day} onAdd={onAddCardio} />}
      </CardContent>
    </Card>
  )
}

/**
 * ONE ROW FOR ANYTHING THE PLAN PRESCRIBES BY TIME AND EFFORT — the cardio
 * finisher bolted to a day, and the walk that IS the day. They render
 * identically on purpose: what separates them is where they sit on the card
 * and what the card says around them, not how they look.
 *
 * targetRpe is optional because PlannedActivity's is — a first walking
 * prescription may deliberately carry no effort target — so the effort clause
 * disappears rather than printing "RPE undefined".
 */
function PrescribedRow({
  activity,
  duration,
  targetRpe,
}: {
  activity: string
  duration: number
  targetRpe?: number
}) {
  const { profileId, date } = useActiveSession()
  const [saving, setSaving] = useState(false)
  const [loggedClientId, setLoggedClientId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const handleLog = () => {
    if (!profileId || loggedClientId) return
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: activity,
      durationMinutes: duration,
      // Same default the typed form below uses for an unstated effort, so one
      // convention covers both — an easy prescribed walk and a logged one land
      // on the same number rather than two.
      intensityRpe: targetRpe ?? 4,
    })
    setSaving(false)
    // The plan supplies this duration, so a refusal here means the plan holds
    // an impossible one — nothing the user can correct from this row, but it
    // must not leave the button reading "Logged" over a row that never wrote.
    if (!view) {
      console.error('Refused to log a prescribed activity:', { activity, duration })
      return
    }
    setLoggedClientId(view.clientId ?? null)
  }

  const handleUndo = async () => {
    if (!loggedClientId) return
    setUndoing(true)
    try {
      await deleteCardioLog(loggedClientId)
      setLoggedClientId(null)
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[color:var(--role-warn-bg)] px-3 py-2">
      <span className="text-xs text-foreground">
        {prescriptionLine({ activity, duration, targetRpe })}
      </span>
      {loggedClientId ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Logged</span>
          <button type="button" className="text-xs font-semibold text-primary-text disabled:opacity-50" disabled={undoing} onClick={handleUndo}>
            {undoing ? 'Undoing…' : 'Undo'}
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" disabled={saving} onClick={handleLog}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : 'Log'}
        </Button>
      )}
    </div>
  )
}
