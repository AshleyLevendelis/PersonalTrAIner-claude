import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import {
  saveCardioLog, deleteCardioLog, isCardioLogUndoable, isPlausibleCardioDuration,
  MAX_PLAUSIBLE_CARDIO_MINUTES, getCardioLogsForDateMerged, subscribeCardioLogStore,
  type CardioLogView,
} from '@/lib/cardio-log-store'
import { EFFORTS, effortForRpe, rpeToStore, cardioReadback, type EffortKey } from '@/lib/cardio-effort'
import { prescriptionLine } from '@/lib/activity-day'

// ---------------------------------------------------------------------------
// CARDIO, LOGGED LIKE A LIFTING SET.
//
// Ashley, 24 Sep 2026: "The loggin cardio system needs a revamp to fit with
// the aesthetic of the rest of the app." Asked which look to use everywhere,
// from three options, she chose "Like a lifting set": the same boxes and mint
// ✓ as a set row, planned cardio pre-filled so one tap logs it, a saved row
// that reads back what was done — "✓ Walk · 20 min · Easy" — with Undo, and
// effort as Easy / Steady / Hard everywhere.
//
// Before this, FIVE screens wrote a cardio log and each looked like a
// different app: an amber strip with an outline "Log", three tiles that wrote
// on tap, a two-box form, a 5-10 number strip, and a sheet with two text
// fields. Two of them recorded an effort nobody chose (4 and 6) and no screen
// ever showed it. Every one of them now draws its row from this file.
//
// THE PIECES MIRROR SetGrid ON PURPOSE, so they read as one grammar rather
// than a lookalike: 44px surface-raised boxes with no border, a muted column
// header above them, the lit mint ✓ as the one thing asking to be tapped, a
// mint rail down the left, and a saved row that tints mint and reads back.
// ---------------------------------------------------------------------------

/** 9.5px uppercase micro-label — the same voice the set grid's captions use. */
const MICRO = 'text-[0.625rem] uppercase tracking-[.12em] whitespace-nowrap'
const RAIL = { borderLeft: '2px solid color-mix(in srgb, var(--primary) 55%, transparent)' }

/**
 * TODAY'S CARDIO LOGS, READ BACK — so a saved row is still saved when you come
 * back to it.
 *
 * Every "Logged" on these rows used to be component state, so leaving Today
 * and returning showed the finisher un-logged and offered to log it a second
 * time. A set row reads its logs; this is the cardio twin of that.
 *
 * Only the newest request's answer is applied. A save and an undo each fire
 * several store notifications, and an older fetch landing after a newer one
 * would put an undone walk straight back on screen.
 */
export function useCardioLogsToday(): CardioLogView[] {
  const { profileId, date } = useActiveSession()
  const [logs, setLogs] = useState<CardioLogView[]>([])
  useEffect(() => {
    if (!profileId) return
    let live = true
    let seq = 0
    const load = () => {
      const mine = ++seq
      void getCardioLogsForDateMerged(profileId, date).then(rows => {
        if (live && mine === seq) setLogs(rows)
      })
    }
    load()
    const unsub = subscribeCardioLogStore(load)
    return () => { live = false; unsub() }
  }, [profileId, date])
  return logs
}

/** Same identity test the whole file uses: the client id when there is one, else the server id. */
const sameLog = (a: CardioLogView, b: CardioLogView) =>
  (!!a.clientId && a.clientId === b.clientId) || (!!a.id && a.id === b.id)

/**
 * "Rowing Intervals — 6 rounds of 20s hard / 40s easy" → the name and the
 * protocol. An en/em dash or a spaced hyphen, because the catalogue uses more
 * than one. Moved here from FinisherRow with Ashley's 14 Sep report behind it:
 * the protocol is the instruction, not decoration, and a truncated one-liner
 * ate it.
 */
export function splitActivity(activity: string): { name: string; protocol: string | null } {
  const m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(activity.trim())
  return m ? { name: m[1], protocol: m[2] } : { name: activity.trim(), protocol: null }
}

/**
 * THE SAVED ROW. Tinted mint with the rail, a ✓ and the read-back — the cardio
 * version of a set's receipt. Undo only while the store can still honour it
 * (see isCardioLogUndoable): an Undo that quietly did nothing would leave the
 * log counted while the screen said it was gone.
 */
export function CardioReadback({
  log,
  displayName,
  onUndone,
}: {
  log: CardioLogView
  /** The short name to read back — "Rowing Intervals", not the whole protocol. */
  displayName?: string
  onUndone?: () => void
}) {
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const undoable = isCardioLogUndoable(log.clientId)
  const line = cardioReadback({
    activity: displayName ?? splitActivity(log.activity_name).name,
    minutes: log.duration_minutes,
    rpe: log.intensity_rpe,
  })

  const handleUndo = async () => {
    if (!log.clientId) return
    // Asked again at the tap, not only at render: the window can close while
    // the row sits on screen.
    if (!isCardioLogUndoable(log.clientId)) {
      setError('Too late to undo that one — it has already been saved.')
      return
    }
    setUndoing(true)
    setError(null)
    try {
      await deleteCardioLog(log.clientId)
      onUndone?.()
    } catch (e) {
      console.error('[cardio] undo failed', e)
      setError("That didn't undo — try again in a moment.")
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div>
      <div
        data-testid="cardio-readback"
        style={RAIL}
        className="flex items-center justify-between gap-2 rounded-r-[8px] bg-primary/10 min-h-11 pl-2.5 pr-1"
      >
        <p className="flex items-center gap-1.5 min-w-0 text-[0.8125rem] text-primary-text">
          <Check className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{line}</span>
        </p>
        {undoable && (
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoing}
            className="shrink-0 min-h-11 px-2 text-xs font-semibold text-primary-text disabled:opacity-50"
            aria-label={`Undo ${line}`}
          >
            {undoing ? 'Undoing…' : 'Undo'}
          </button>
        )}
      </div>
      {error && <p className="text-[0.625rem] text-destructive px-1 mt-0.5">{error}</p>}
    </div>
  )
}

/**
 * EASY / STEADY / HARD, as one 44px box of three segments — so each is a
 * full-height target rather than a chip. Exported for the one form that logs
 * cardio without being a row (What happened → something else), so effort is
 * the same three words there too.
 */
export function EffortBox({ effort, onEffort, subject }: { effort: EffortKey | null; onEffort: (e: EffortKey) => void; subject?: string }) {
  return (
    <div role="radiogroup" aria-label={subject ? `How hard was ${subject}` : 'How hard'} className="grid grid-cols-3 h-11 rounded-md overflow-hidden bg-[color:var(--surface-raised)]">
      {EFFORTS.map(e => {
        const on = effort === e.key
        return (
          <button
            key={e.key}
            type="button"
            role="radio"
            aria-checked={on}
            title={e.note}
            data-effort={e.key}
            onClick={() => onEffort(e.key)}
            className={`h-11 text-xs transition-colors ${on ? 'bg-primary/20 text-primary-text font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {e.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * THE BOXES AND THE ✓. Controlled: whoever owns the row owns what it logs.
 *
 * The minutes box shows the suggestion faint, exactly as a set row shows its
 * reps, and a ✓ on an empty box takes it — which is what makes a planned row
 * one tap. The effort box is three segments in one 44px box, so each segment
 * is a full-height target rather than a chip.
 */
function EntryBoxes({
  minutes,
  onMinutes,
  minutesHint,
  effort,
  onEffort,
  ready,
  saving,
  onSave,
  saveLabel,
  invalid,
  subject,
}: {
  minutes: string
  onMinutes: (v: string) => void
  minutesHint: number | null
  effort: EffortKey | null
  onEffort: (e: EffortKey) => void
  /** Lights the ✓. Off, it still answers a tap — with the reason — as a set row's does. */
  ready: boolean
  saving: boolean
  onSave: () => void
  saveLabel: string
  invalid: boolean
  /**
   * What this row is ABOUT, for its spoken names. Two rows must not share one
   * spoken name: a finisher's box and the What-happened sheet's box both read
   * "Minutes" at first, and a screen reader — and a driver — could not tell
   * which was which.
   */
  subject?: string
}) {
  return (
    <div className="space-y-1">
      {/* pr-2, not the set grid's pr-1: the ✓'s invisible 44px tap area
          reaches 8px past its 28px face, and at pr-1 it hung off the card's
          edge — measured by verify:finisher's overflow check. */}
      <div className="grid grid-cols-[4.5rem_1fr_auto] gap-1.5 text-xs text-muted-foreground font-medium pl-2.5 pr-2">
        <span>Minutes</span>
        <span>How hard</span>
        <span className="w-7" />
      </div>
      <div style={RAIL} className="grid grid-cols-[4.5rem_1fr_auto] gap-1.5 items-center rounded-r-[8px] pl-2.5 pr-2 py-0.5">
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          max={MAX_PLAUSIBLE_CARDIO_MINUTES}
          step="1"
          aria-label={subject ? `${subject} minutes` : 'Minutes'}
          data-field="minutes"
          placeholder={minutesHint != null ? String(minutesHint) : 'min'}
          value={minutes}
          onChange={e => onMinutes(e.target.value)}
          className={`h-11 border-0 bg-[color:var(--surface-raised)] text-sm shadow-none ${invalid ? 'ring-1 ring-destructive' : ''}`}
        />
        <EffortBox effort={effort} onEffort={onEffort} subject={subject} />
        {/* THE LIT MINT SQUARE, the same control and the same glow as a set's —
            but only lit when a tap would log. Unready, it stays tappable and
            says what is missing, the way a set row refuses a blank weight. */}
        <Button
          variant="ghost"
          size="icon"
          data-testid="cardio-save"
          disabled={saving}
          className={`size-7 shrink-0 p-0 ${ready ? 'glow-pulse' : 'text-muted-foreground bg-[color:var(--surface-raised)]'}`}
          style={ready ? {
            background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))',
            color: 'var(--primary-foreground)',
          } : undefined}
          onClick={onSave}
          aria-label={saveLabel}
        >
          <Check className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

/** What the minutes box would log: the typed number, else the suggestion. */
function minutesToLog(typed: string, hint: number | null): number | null {
  if (typed.trim() !== '') return parseInt(typed, 10)
  return hint
}

// ===========================================================================
// PLANNED — the finisher, the optional close-out, the walk that IS the day.
// ===========================================================================

/**
 * ONE ROW FOR ANYTHING THE PLAN PRESCRIBES BY TIME AND EFFORT. The plan's
 * minutes sit in the box and its effort is already chosen, so the ✓ alone logs
 * exactly what was prescribed; change either first and it logs what you did.
 *
 * Reads itself back from today's logs by the plan's own activity string —
 * which is also what it writes — so it stays saved across a tab change.
 */
export function PlannedCardioRow({
  prescription,
  label,
  onLogged,
  testid,
}: {
  prescription: { activity: string; duration: number; targetRpe?: number }
  /** The micro-label over the row — "Finisher", "Optional", "Suggested". */
  label?: string
  onLogged?: () => void
  testid?: string
}) {
  const { profileId, date } = useActiveSession()
  const logs = useCardioLogsToday()
  const { name, protocol } = splitActivity(prescription.activity)
  const [minutes, setMinutes] = useState('')
  const [effort, setEffort] = useState<EffortKey | null>(effortForRpe(prescription.targetRpe))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState<CardioLogView | null>(null)
  // Undone logs stay hidden even if a slower read still carries them.
  const undone = useRef<CardioLogView[]>([])

  const fromLogs = logs.find(l => l.activity_name === prescription.activity && !undone.current.some(u => sameLog(u, l))) ?? null
  const saved = justSaved ?? fromLogs

  const handleSave = () => {
    if (!profileId || saving) return
    const mins = minutesToLog(minutes, prescription.duration)
    if (mins == null || !isPlausibleCardioDuration(mins ?? NaN)) {
      setError(`Enter between 1 and ${MAX_PLAUSIBLE_CARDIO_MINUTES} minutes.`)
      return
    }
    if (!effort) { setError('Pick how hard it felt.'); return }
    setError(null)
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: prescription.activity,
      durationMinutes: mins,
      intensityRpe: rpeToStore(effort, prescription.targetRpe),
    })
    setSaving(false)
    // "Logged" over a row that never wrote is the lie this whole file exists
    // to stop telling, so the row only turns mint when the store said yes.
    if (!view) { setError("That didn't save — try again in a moment."); return }
    setJustSaved(view)
    onLogged?.()
  }

  return (
    <div className="space-y-1.5" data-testid={testid ?? 'cardio-planned'}>
      <div className="pl-2.5 pr-1">
        {label && <p className={`${MICRO} text-primary-text`}>{label}</p>}
        {/* WHAT THE PLAN ASKS, in the exact words the saved row will use for
            what was DONE — "Walk · 20 min · Easy" over "✓ Walk · 20 min ·
            Easy" — so the two can be compared by eye. The short name, because
            the protocol has its own line under it. */}
        <p className="text-sm font-medium text-foreground leading-snug" data-testid="cardio-prescription">
          {prescriptionLine({ activity: name, duration: prescription.duration, targetRpe: prescription.targetRpe })}
        </p>
        {protocol && <p className="text-[0.6875rem] leading-4 text-muted-foreground">{protocol}</p>}
      </div>
      {saved ? (
        <CardioReadback
          log={saved}
          displayName={name}
          onUndone={() => { undone.current = [...undone.current, saved]; setJustSaved(null); setMinutes('') }}
        />
      ) : (
        <EntryBoxes
          minutes={minutes}
          onMinutes={v => { setMinutes(v); setError(null) }}
          minutesHint={prescription.duration}
          effort={effort}
          onEffort={e => { setEffort(e); setError(null) }}
          ready={!!effort}
          saving={saving}
          onSave={handleSave}
          saveLabel={`Log ${name}`}
          invalid={!!error && /minutes/i.test(error)}
          subject={name}
        />
      )}
      {error && <p className="text-[0.625rem] text-destructive px-1">{error}</p>}
    </div>
  )
}

// ===========================================================================
// UNPLANNED — "did you move today?", and the Cardio half of unplanned work.
// ===========================================================================

export interface CardioPick {
  /** The chip's face. */
  label: string
  /** What is written to the log — the same literal the duration memory reads. */
  activity: string
  /** The suggested minutes. */
  minutes: number
  /** The suggested effort, as an RPE so an exact preset number survives (see rpeToStore). */
  rpe?: number
  Icon?: typeof Check
}

/**
 * THE ACTIVITY CHIPS AND ONE ROW. A chip chooses what the row will log, and
 * the row logs it — the same two steps as a set, with the first one already
 * taken when the caller pre-selects (the rest day pre-selects Walk, which
 * keeps its commonest answer at one tap). "Other" opens a name box in the
 * same style as the others.
 *
 * After a save it resets to NOTHING chosen, never back to the pre-selection:
 * a second tap on a still-lit ✓ would otherwise log the same walk twice.
 */
export function UnplannedCardioEntry({
  picks,
  initialPick = null,
  prefill,
  notes,
  onLogged,
  saveVerb = 'Log',
}: {
  picks: readonly CardioPick[]
  /** Index into picks to start on, or null for nothing chosen. */
  initialPick?: number | null
  /** The round timer's hand-off: name and minutes filled in, effort left to her. */
  prefill?: { activityName: string; durationMinutes: number }
  notes?: string | null
  onLogged?: (view: CardioLogView) => void
  saveVerb?: string
}) {
  const { profileId, date } = useActiveSession()
  const [pick, setPick] = useState<number | 'other' | null>(prefill ? 'other' : initialPick)
  const [otherName, setOtherName] = useState(prefill?.activityName ?? '')
  const [minutes, setMinutes] = useState(prefill ? String(prefill.durationMinutes) : '')
  const chosen = typeof pick === 'number' ? picks[pick] : null
  // AN EFFORT IS ONLY EVER PRE-CHOSEN FROM A PICK THAT CARRIES ONE. "Other"
  // and the timer's prefill start blank: the app cannot know how a round or a
  // class felt, and a lit "Steady" would be it inventing the answer.
  const [effort, setEffort] = useState<EffortKey | null>(chosen ? effortForRpe(chosen.rpe) : null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const choose = (next: number | 'other') => {
    setPick(next)
    setError(null)
    setMinutes('')
    setEffort(typeof next === 'number' ? effortForRpe(picks[next].rpe) : null)
  }

  const activityName = pick === 'other' ? otherName.trim() : chosen?.activity ?? ''
  const hint = chosen?.minutes ?? null
  const ready = !!activityName && !!effort && (minutes.trim() !== '' || hint != null)

  const handleSave = () => {
    if (!profileId || saving) return
    if (pick == null) { setError('Pick what you did first.'); return }
    if (!activityName) { setError('Name what you did — a walk, a class, a swim.'); return }
    const mins = minutesToLog(minutes, hint)
    if (mins == null) { setError('Enter how many minutes.'); return }
    // `min="1"` is a hint the browser does not enforce: -5 typed here once
    // parsed, passed, and was stored as minus five minutes of cardio.
    if (!isPlausibleCardioDuration(mins)) {
      setError(`Enter between 1 and ${MAX_PLAUSIBLE_CARDIO_MINUTES} minutes.`)
      return
    }
    if (!effort) { setError('Pick how hard it felt.'); return }
    setError(null)
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName,
      durationMinutes: mins,
      intensityRpe: rpeToStore(effort, chosen?.rpe),
      notes: notes ?? null,
    })
    setSaving(false)
    if (!view) { setError("That didn't save — try again in a moment."); return }
    setPick(null)
    setOtherName('')
    setMinutes('')
    setEffort(null)
    onLogged?.(view)
  }

  // THREE ACROSS WHEN THERE ARE MORE THAN THREE. Unplanned work carries four
  // presets and "Other", and five in a row at 390px left "Incline walk" to
  // truncate to a word and a half.
  const wide = picks.length > 3
  const chip = (on: boolean, size = wide ? '' : 'flex-1') =>
    `${size} min-w-0 h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${
      on
        ? 'border-primary/60 bg-primary/10 text-primary-text'
        : 'border-[color:var(--hairline)] bg-[color:var(--surface-raised)] text-foreground hover:bg-accent/40'
    }`

  return (
    <div className="space-y-2" data-testid="cardio-unplanned">
      <div className={wide ? 'grid grid-cols-3 gap-1.5' : 'flex items-stretch gap-1.5'} role="radiogroup" aria-label="What did you do">
        {picks.map((p, i) => {
          const on = pick === i
          const Icon = p.Icon
          return (
            <button
              key={p.label}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`quick-log-${p.label.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => choose(i)}
              className={chip(on)}
            >
              {Icon && <Icon className="size-4" />}
              <span className="text-xs leading-none truncate max-w-full px-1">{p.label}</span>
              <span className={`text-[0.625rem] leading-none ${on ? 'text-primary-text/80' : 'text-muted-foreground'}`}>{p.minutes} min</span>
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={pick === 'other'}
          data-testid="quick-log-other"
          onClick={() => choose('other')}
          className={chip(pick === 'other', wide ? '' : 'w-[3.25rem] shrink-0')}
        >
          <span className="text-xs leading-none">Other</span>
        </button>
      </div>
      {pick === 'other' && (
        <Input
          aria-label="Other activity"
          data-field="activity"
          placeholder="What did you do? e.g. run, class, row"
          value={otherName}
          onChange={e => { setOtherName(e.target.value); setError(null) }}
          className="h-11 border-0 bg-[color:var(--surface-raised)] text-sm shadow-none"
          autoFocus={!prefill}
        />
      )}
      <EntryBoxes
        minutes={minutes}
        onMinutes={v => { setMinutes(v); setError(null) }}
        minutesHint={hint}
        effort={effort}
        onEffort={e => { setEffort(e); setError(null) }}
        ready={ready}
        saving={saving}
        onSave={handleSave}
        saveLabel={activityName ? `${saveVerb} ${activityName}` : `${saveVerb} activity`}
        invalid={!!error && /minutes/i.test(error)}
        subject={activityName || 'this activity'}
      />
      {error && <p className="text-[0.625rem] text-destructive px-1">{error}</p>}
    </div>
  )
}
