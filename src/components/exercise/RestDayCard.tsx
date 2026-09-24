import { lazy, Suspense, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heart, ChevronRight, ArrowRight, Footprints, Bike, Waves, Dumbbell, CalendarDays } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getRecentActivityDurations, DEFAULT_ACTIVITY_MINUTES, type CardioLogView } from '@/lib/cardio-log-store'
import { PlannedCardioRow, UnplannedCardioEntry, CardioReadback, useCardioLogsToday, type CardioPick } from './CardioSetRow'
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
 * commonest case the most expensive one.
 *
 * THE DURATION IS THE PERSON'S OWN LAST ONE. A chip that silently logs thirty
 * minutes for somebody whose walk is always fifty is putting a number they did
 * not choose into their record — so the default is read from their history and
 * falls back to thirty only when there is none. It is on the chip face before
 * the tap, which is what makes one tap honest rather than merely quick.
 *
 * LIKE A LIFTING SET since 24 Sep 2026 (Ashley's ruling — see CardioSetRow).
 * A chip no longer writes on the tap; it fills the row under it, and the mint
 * ✓ writes. Walk starts chosen, so the commonest answer is STILL one tap —
 * and now the minutes and the effort it will record are on screen first, where
 * the chip used to record an effort of 4 that nobody ever saw.
 *
 * The effort each chip starts on is Easy: this card asks about movement on a
 * day off, and an easy walk, ride or swim is what that question is for. It is
 * RPE 4, the number the chips always wrote, so an untouched tap records what it
 * did before.
 */
const QUICK_ACTIVITIES = [
  { label: 'Walk', Icon: Footprints },
  { label: 'Cycle', Icon: Bike },
  { label: 'Swim', Icon: Waves },
] as const
const QUICK_RPE = 4

function ActivityLogEntry({ alsoLabel = false, claimed = [] }: {
  alsoLabel?: boolean
  /**
   * The activities a PRESCRIBED row on this card reads back. Each claims ONE
   * log — the same first match PlannedCardioRow takes — so a second walk
   * logged here on a walking day still reads back here rather than vanishing
   * behind the first.
   */
  claimed?: readonly string[]
}) {
  const { profileId } = useActiveSession()
  const [defaults, setDefaults] = useState<Record<string, number>>({})
  const logs = useCardioLogsToday()
  const [undone, setUndone] = useState<CardioLogView[]>([])

  // Their own recent durations, per chip. Starts empty and fills in — a chip
  // is tappable the whole time, just with the fallback on it until this lands.
  useEffect(() => {
    if (!profileId) return
    let live = true
    void getRecentActivityDurations(profileId, QUICK_ACTIVITIES.map(a => a.label))
      .then(found => { if (live) setDefaults(found) })
    return () => { live = false }
  }, [profileId])

  const picks: CardioPick[] = QUICK_ACTIVITIES.map(({ label, Icon }) => ({
    label,
    activity: label,
    minutes: defaults[label] ?? DEFAULT_ACTIVITY_MINUTES,
    rpe: QUICK_RPE,
    Icon,
  }))

  // WHAT WAS ALREADY LOGGED TODAY READS BACK ABOVE THE ROW, the way a set's
  // saved rows sit above the next empty one. A log a prescribed row on this
  // card has claimed is left out: it reads itself back there.
  const isUndone = (l: CardioLogView) => undone.some(u =>
    (!!u.clientId && u.clientId === l.clientId) || (!!u.id && u.id === l.id))
  const live = logs.filter(l => !isUndone(l))
  const taken = new Set(claimed.map(name => live.find(l => l.activity_name === name)).filter(Boolean))
  const receipts = live.filter(l => !taken.has(l))
  const asked = alsoLabel || receipts.length > 0
  // ONE LIT ✓ PER CARD. Walk is pre-chosen only when nothing else on the card
  // is asking to be tapped: on a walking day the prescribed walk is the
  // session, and a second glowing ✓ under it for "anything else" split the
  // card's one call to action in two — read off the screenshot, 24 Sep 2026.
  const preselect = claimed.length === 0 && receipts.length === 0

  return (
    <div className="mt-[18px] space-y-2" data-testid="activity-quick-log">
      <div className="flex items-center justify-between gap-2 px-0.5">
        {/* When the day already PRESCRIBES an activity, that activity has its
            own row above this. Offering "did you move today?" underneath a
            prescribed walk reads as the same question twice, so this one asks
            what it is actually for — and so does a day with a log on it. */}
        <span className={`${MICRO} text-[color:var(--role-ai-text)]`}>
          {asked ? 'Did anything else?' : 'Did you move today?'}
        </span>
        <span className={`${MICRO} text-muted-foreground`}>{preselect ? 'optional · one tap' : 'optional'}</span>
      </div>
      {receipts.length > 0 && (
        <div className="space-y-1" data-testid="activity-logged">
          {receipts.map(r => (
            <CardioReadback key={r.clientId ?? r.id} log={r} onUndone={() => setUndone(u => [...u, r])} />
          ))}
        </div>
      )}
      {/* KEYED ON THE PRE-SELECTION, so the entry starts on Walk only while
          nothing is logged and nothing else on the card asks: after a save it
          comes back with nothing chosen, and a second tap on the ✓ cannot log
          the same walk twice. */}
      <UnplannedCardioEntry key={preselect ? 'first' : 'more'} picks={picks} initialPick={preselect ? 0 : null} />
      {/* Dropped when the day already prescribes something: the plan DOES
          change on such a day, it just changed before you got here. */}
      {!alsoLabel && (
        <p className="mx-0.5 text-[0.6875rem] leading-[1.4] text-muted-foreground">
          Logs it for today. Your plan doesn&apos;t change.
        </p>
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
        {/* LOGGED LIKE A SET since 24 Sep 2026 — the plan's minutes in the box
            and its effort already chosen, so the ✓ alone logs the walk the plan
            asked for. PlannedCardioRow reads itself back from today's logs, so
            a walk logged this morning is still ticked this afternoon; the old
            row forgot on every tab change and offered to log it again. */}
        {planned && (
          <div className="space-y-1.5" data-testid="planned-activity">
            <PlannedCardioRow prescription={planned} />
            {planned.reason && (
              <p className="text-xs leading-[1.5] text-muted-foreground px-0.5">{planned.reason}</p>
            )}
          </div>
        )}
        {/* NOT BOTH. recommendedCardio is a SUGGESTION for an otherwise-empty
            day; plannedActivity is what the plan prescribes for it. Showing
            both put "Cycle · 35m · RPE 3" directly above "Active Recovery Walk
            or Light Swim" and left the person to guess which was the session —
            the same unanswerable question the type comment warns about, on
            screen instead of in the data. Found by the driver, on a real card. */}
        {!planned && cardio && <PlannedCardioRow prescription={cardio} label="Suggested" />}
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry alsoLabel={!!planned} claimed={planned ? [planned.activity] : cardio ? [cardio.activity] : []} />
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
