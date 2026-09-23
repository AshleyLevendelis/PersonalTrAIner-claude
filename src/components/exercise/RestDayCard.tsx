import { lazy, Suspense, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, ChevronRight, Loader2, ArrowRight, Footprints, Bike, Waves, Plus, Dumbbell, CalendarDays } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import {
  isPlausibleCardioDuration, MAX_PLAUSIBLE_CARDIO_MINUTES, saveCardioLog, deleteCardioLog,
  getRecentActivityDurations, DEFAULT_ACTIVITY_MINUTES,
} from '@/lib/cardio-log-store'
import { prescriptionLine } from '@/lib/activity-day'
// Its own chunk — see the file for the measurement that put it there.
const AddCardioSession = lazy(() => import('./AddCardioSessionSheet').then(m => ({ default: m.AddCardioSession })))
import type { WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// Rest and active-recovery days as first-class calm states (LAYOUT-DESIGN.md
// §1.8) — today both are dead ends with zero controls. Rebuilt: the week
// tally, a preview of tomorrow's session (tap -> peek), an activity log
// entry, and (rest day only) a "Train anyway" escape onto another training
// day's prescription.
//
// REBUILT AGAIN 20 Sep 2026 from the `4a` handoff, and the whole point of that
// round is one sentence: THE CARD ENDED IN THREE DOTTED LINKS OF IDENTICAL
// WEIGHT, TWO OF WHICH DID COMPLETELY DIFFERENT THINGS. "Log a walk" writes one
// cardio row for today and touches nothing else; "Make Sunday a cardio day"
// runs executeCardioSession and rewrites every Sunday to the end of the block.
// Nothing on screen said so, and two of the three collided on one line —
// "Make Sunday a cardio day →Train anyway →" — the same defect MovedDayCard's
// own comment already documented, still live one card over.
//
// So the three are now three different KINDS of thing, and the kind is legible
// before the tap: logging is a one-tap chip, plan changes sit under their own
// "Change the plan" heading with their scope written in the subtitle, and no
// two controls ever share a line.
//
// COLOUR CARRIES THE SAME SPLIT: violet (--role-ai-text) is recovery and
// not-training-work, mint (--primary) is training, logged and done. That is the
// convention the exercise screen already uses for the ramp, extended here.
// ---------------------------------------------------------------------------

/** 9.5px uppercase micro-label — the card's smallest voice, used for every section heading and the track's two ends. */
const MICRO = 'text-[0.59375rem] uppercase tracking-[.12em] whitespace-nowrap'

/**
 * THE SEGMENTED WEEK TRACK, replacing "This week: 3 of 3 sessions done."
 *
 * One segment per PLANNED session, mint when done. The sentence carried the
 * same two numbers and made the reader do the arithmetic; the track is the
 * grammar the set grid already uses for progress, so a glance answers it.
 * Renders nothing when the plan has no sessions this week — the same guard the
 * sentence had, because "0 of 0" is not a reassuring thing to show somebody.
 */
function WeekTrack({ done, planned }: { done: number; planned: number }) {
  if (planned <= 0) return null
  const complete = done >= planned
  return (
    <div className="mt-3.5" data-testid="week-track">
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: planned }, (_, i) => (
          <span
            key={i}
            data-testid={i < done ? 'week-seg-done' : 'week-seg-todo'}
            className="flex-1 h-1 rounded-[2px]"
            style={{ background: i < done ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 22%, transparent)' }}
          />
        ))}
      </div>
      <div className="mt-[5px] flex items-center justify-between gap-2">
        <span className={`${MICRO} text-primary-text glow-mint`}>This week · {done} of {planned} done</span>
        <span className={`${MICRO} text-muted-foreground`}>{complete ? 'week complete' : `${planned - done} to go`}</span>
      </div>
    </div>
  )
}

/**
 * THE ONE-TAP CHIPS, replacing the blank "what did you do" form.
 *
 * The form was not wrong, it was just the wrong DEFAULT: a rest day's most
 * likely answer is a walk, and asking for it in two free-text fields made the
 * commonest case the most expensive one. Walk / Cycle / Swim write immediately;
 * "Other" opens the very same form, unchanged, for everything else.
 *
 * THE DURATION IS THE PERSON'S OWN LAST ONE. A chip that silently logs thirty
 * minutes for somebody whose walk is always fifty is putting a number they did
 * not choose into their record — so the default is read from their history and
 * falls back to thirty only when there is none. It is on the chip face before
 * the tap, which is what makes one tap honest rather than merely quick.
 */
const QUICK_ACTIVITIES = [
  { label: 'Walk', Icon: Footprints },
  { label: 'Cycle', Icon: Bike },
  { label: 'Swim', Icon: Waves },
] as const

function ActivityLogEntry({ alsoLabel = false }: { alsoLabel?: boolean }) {
  const { profileId, date } = useActiveSession()
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState('')
  const [duration, setDuration] = useState('')
  const [durationError, setDurationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loggedClientId, setLoggedClientId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)
  const [defaults, setDefaults] = useState<Record<string, number>>({})

  // Their own recent durations, per chip. Starts empty and fills in — a chip
  // is tappable the whole time, just with the fallback on it until this lands.
  useEffect(() => {
    if (!profileId) return
    let live = true
    void getRecentActivityDurations(profileId, QUICK_ACTIVITIES.map(a => a.label))
      .then(found => { if (live) setDefaults(found) })
    return () => { live = false }
  }, [profileId])

  const minutesFor = (label: string) => defaults[label] ?? DEFAULT_ACTIVITY_MINUTES

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

  // ONE TAP IS STILL A WRITE THAT CAN FAIL, and it fails the same way the typed
  // form does rather than reverting to a chip row that looks untouched.
  const handleQuickLog = (label: string) => {
    if (!profileId || saving) return
    setDurationError(null)
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: label,
      durationMinutes: minutesFor(label),
      intensityRpe: 4,
    })
    setSaving(false)
    if (!view) {
      setDurationError("That didn't save — try again in a moment.")
      return
    }
    setLoggedClientId(view.clientId ?? null)
  }

  if (loggedClientId) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" data-testid="activity-logged">
        <span>Activity logged for today.</span>
        <button type="button" className="font-semibold text-primary-text disabled:opacity-50" disabled={undoing} onClick={handleUndo}>
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
      </div>
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
    <div className="mt-[18px]" data-testid="activity-quick-log">
      <div className="flex items-center justify-between gap-2 px-0.5">
        {/* When the day already PRESCRIBES an activity, that activity has its
            own one-tap Log above this. Offering "did you move today?" underneath
            a prescribed walk reads as the same question twice, so this one asks
            what it is actually for. */}
        <span className={`${MICRO} text-[color:var(--role-ai-text)]`}>
          {alsoLabel ? 'Did anything else?' : 'Did you move today?'}
        </span>
        <span className={`${MICRO} text-muted-foreground`}>optional · one tap</span>
      </div>

      {open ? (
        <div className="mt-2 space-y-1.5">
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
      ) : (
        <>
          <div className="mt-2 flex items-stretch gap-2">
            {QUICK_ACTIVITIES.map(({ label, Icon }) => (
              <button
                key={label}
                type="button"
                data-testid={`quick-log-${label.toLowerCase()}`}
                disabled={saving || !profileId}
                onClick={() => handleQuickLog(label)}
                className="flex-1 h-16 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--hairline)] flex flex-col items-center justify-center gap-1 transition-colors hover:bg-accent/40 disabled:opacity-50"
              >
                <Icon className="size-[17px] text-secondary-foreground" />
                <span className="text-xs text-foreground leading-none">{label}</span>
                <span className="text-[0.625rem] text-muted-foreground leading-none">{minutesFor(label)} min</span>
              </button>
            ))}
            <button
              type="button"
              data-testid="quick-log-other"
              onClick={() => setOpen(true)}
              className="w-[52px] shrink-0 h-16 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--hairline)] flex flex-col items-center justify-center gap-1 transition-colors hover:bg-accent/40"
            >
              <Plus className="size-[17px] text-muted-foreground" />
              <span className="text-[0.625rem] text-muted-foreground leading-none">Other</span>
            </button>
          </div>
          {/* Dropped when the day already prescribes something: the plan DOES
              change on such a day, it just changed before you got here. */}
          {!alsoLabel && (
            <p className="mt-2 mx-0.5 text-[0.6875rem] leading-[1.4] text-muted-foreground">
              Logs it for today. Your plan doesn&apos;t change.
            </p>
          )}
          {durationError && (
            <p className="mt-2 mx-0.5 text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">{durationError}</p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * THE PLAN-CHANGE GROUP — the fix this whole rebuild is for.
 *
 * Everything above this line writes a LOG. Everything inside it rewrites the
 * PLAN. The heading and the hairline are what make that a visible boundary
 * rather than a fact only the code knows, and each row's subtitle states its
 * own reach, because "today only" and "every Sunday for the rest of this
 * block" are the two things a person must not confuse.
 */
function PlanActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[18px] border-t border-[color:var(--hairline)]" data-testid="change-the-plan">
      <p className={`${MICRO} text-muted-foreground pt-3 pb-1.5 px-0.5`}>Change the plan</p>
      {children}
    </div>
  )
}

/**
 * One plan action. A ROW, never a dotted-underline link, and never beside
 * another one: the collision this replaces was two inline links wrapping onto
 * a single line, which a full-width row cannot do.
 */
function PlanActionRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
  testid,
}: {
  icon: typeof Dumbbell
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
  testid: string
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className="w-full min-h-11 flex items-center gap-2.5 py-[9px] px-0.5 text-left transition-colors hover:bg-accent/30 rounded-lg disabled:opacity-50"
    >
      <Icon className="size-4 shrink-0 text-[color:var(--role-ai-text)]" />
      <span className="flex-1 min-w-0">
        <span className="block text-[0.8125rem] text-foreground leading-tight">{title}</span>
        <span className="block text-[0.6875rem] text-muted-foreground leading-tight mt-0.5">{subtitle}</span>
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
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
      className="mt-3.5 w-full flex items-center justify-between gap-3 rounded-[14px] bg-[color:var(--surface-raised)] px-3.5 py-3 text-left hover:bg-accent/40 transition-colors disabled:opacity-50"
      onClick={() => onPeek?.(tomorrow.dayName)}
      disabled={!onPeek}
    >
      <span className="flex flex-col gap-[3px] min-w-0">
        <span className={`${MICRO} text-primary-text glow-mint`}>Tomorrow · {tomorrow.dayName}</span>
        <span className="text-base font-semibold text-foreground leading-tight truncate">{tomorrow.focus}</span>
        {/* A STRING, not an exercise count, because an activity day has none:
            "Walk · 0 exercises" was the same lie the empty card told, one row
            smaller. The caller says what the day is measured in — exercises,
            or minutes — and this does not reformat it. */}
        <span className="text-[0.71875rem] text-muted-foreground leading-tight truncate">{tomorrow.detail}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </button>
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
  const [cardioOpen, setCardioOpen] = useState(false)

  return (
    <Card className="bg-[color:var(--surface-deep)]">
      <CardContent className="pt-3.5 px-3 pb-5">
        <div className="flex items-center gap-3">
          {/* VIOLET, not muted grey. The colour is the fastest thing on the
              card and it should say "this is recovery", which is a state the
              plan chose — not "this is the disabled version of a training day". */}
          <div
            className="flex items-center justify-center size-10 rounded-full shrink-0"
            style={{ background: 'color-mix(in srgb, var(--role-ai) 16%, transparent)' }}
          >
            <Heart className="size-[19px] text-[color:var(--role-ai-text)]" />
          </div>
          <div className="min-w-0">
            {/* It is the page's subject, so it reads like one. */}
            <p className="text-[1.1875rem] font-semibold tracking-[-.01em] text-foreground leading-tight">Rest day · {dayName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Recovery is where the adaptation happens.</p>
          </div>
        </div>

        <WeekTrack done={weekTally.done} planned={weekTally.planned} />
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry />

        {/* ONE GROUP, because these two are the only controls on the card that
            change the plan — and the subtitles are what stop them reading as
            the same action twice. */}
        {(trainAnywayOptions.length > 0 || onAddCardio) && (
          <PlanActions>
            {trainAnywayOptions.length > 0 && !pickerOpen && (
              <PlanActionRow
                icon={Dumbbell}
                title="Train anyway"
                subtitle="Borrow another day's session — today only"
                testid="train-anyway"
                onClick={() => setPickerOpen(true)}
              />
            )}
            {pickerOpen && (
              <div className="flex flex-wrap gap-1.5 py-1.5 px-0.5">
                {trainAnywayOptions.map(d => (
                  <Button key={d} variant="outline" size="sm" className="h-8 text-xs" onClick={() => onTrainAnyway(d)}>
                    {d}
                  </Button>
                ))}
              </div>
            )}
            {onAddCardio && !cardioOpen && (
              <PlanActionRow
                icon={CalendarDays}
                title={`Make ${dayName}s a cardio day`}
                /* THE PLURAL IS DELIBERATE and so is this line: executeCardioSession
                   writes a STANDING session, every one of these weekdays to the end
                   of the block. The old "Make Sunday a cardio day →" read like a
                   one-off beside a link that genuinely was one. */
                subtitle={`Every ${dayName} for the rest of this block`}
                testid="make-cardio-day"
                onClick={() => setCardioOpen(true)}
              />
            )}
            {onAddCardio && cardioOpen && (
              <div className="pt-1">
                <Suspense fallback={null}>
                  <AddCardioSession dayName={dayName} onAdd={onAddCardio} startOpen onClose={() => setCardioOpen(false)} />
                </Suspense>
              </div>
            )}
          </PlanActions>
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
      <CardContent className="pt-3.5 px-3 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center size-10 rounded-full shrink-0"
            style={{ background: 'color-mix(in srgb, var(--role-ai) 16%, transparent)' }}
          >
            <ArrowRight className="size-[19px] text-[color:var(--role-ai-text)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[1.1875rem] font-semibold tracking-[-.01em] text-foreground leading-tight" data-testid="moved-away">{focus ?? "Today's session"} → {toDayName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Moved to {toDayName}. Nothing owed here today.</p>
          </div>
        </div>

        <WeekTrack done={weekTally.done} planned={weekTally.planned} />
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry />

        {/* THE SAME GROUP AS THE REST DAY, for the same reason. This used to be
            a bare dotted link in its own <div> — the div being the fix for two
            links running together as "Log a walk or other activityDo it today
            instead". The group is the better version of that fix: it is a row,
            so it cannot share a line with anything, and it now says what it
            reaches. One action here, not two, because unmaking a move is the
            only plan change this day offers. */}
        <PlanActions>
          <PlanActionRow
            icon={Dumbbell}
            title={busy ? 'Putting it back…' : 'Do it today instead'}
            subtitle={`Brings the session back from ${toDayName} — it stops being owed there`}
            testid="do-it-today"
            disabled={busy}
            onClick={handleDoItToday}
          />
        </PlanActions>
        {failed && (
          <p className="mt-2 text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">
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
        <WeekTrack done={weekTally.done} planned={weekTally.planned} />
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
        {onAddCardio && !planned && <Suspense fallback={null}><AddCardioSession dayName={workout.day} onAdd={onAddCardio} /></Suspense>}
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
