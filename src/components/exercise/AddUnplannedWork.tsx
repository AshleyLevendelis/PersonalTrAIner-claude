import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, X, Dumbbell, Activity, Clock, Flame, Loader2 } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { isPlausibleCardioDuration, MAX_PLAUSIBLE_CARDIO_MINUTES, saveCardioLog } from '@/lib/cardio-log-store'

// ---------------------------------------------------------------------------
// One entry point for off-plan lifts AND ad-hoc cardio (LAYOUT-DESIGN.md
// §1.7 G) — replaces the two footer buttons ("Add Extra Lift" / "Log
// Cardio") and the standalone CardioLogger. Visually and verbally a
// LOGGING act ("unplanned"), never a plan edit (§4.4) — a declared lift
// just adds a name to today's session record; nothing here touches the
// mesocycle.
// ---------------------------------------------------------------------------

const CONDITIONING_PRESETS = [
  { label: '15m Incline Walk', activity: 'Incline Treadmill Walk', duration: 15, rpe: 4 },
  { label: '15m Heavy Bag', activity: 'Heavy Bag / Functional Circuit', duration: 15, rpe: 7 },
  { label: '10m HIIT Bike', activity: 'HIIT / Assault Bike', duration: 10, rpe: 8 },
  { label: '15m Zone 2', activity: 'Zone 2 Cardio', duration: 15, rpe: 5 },
] as const

const RPE_CHOICES = [5, 6, 7, 8, 9, 10]

export function AddUnplannedWork({
  onLiftAdded,
  onCardioLogged,
  open,
  onOpenChange,
  hideTrigger,
  prefill,
  overlay,
}: {
  onLiftAdded?: () => void
  onCardioLogged?: () => void
  /** Turn 5: unplanned work moved behind the day-level "⋮" menu (see
   * WeekContextRow) — controlled-open mode for that call site. Omit both
   * `open`/`hideTrigger` for the previous always-visible-button behavior. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Suppresses the standalone "Add unplanned work" trigger button — the
   * caller owns opening this via `open` instead (their own menu item). */
  hideTrigger?: boolean
  /**
   * OPEN STRAIGHT INTO CONDITIONING, ALREADY FILLED IN. Added 12 Sep 2026 for
   * the finished round timer, which knows exactly what was just done and had
   * no way to say so — its "Log session" button navigated here and wrote
   * nothing.
   *
   * Everything except the effort, which the app cannot know and must not
   * invent, so the one thing left to answer is the one thing only she can.
   * The fields stay editable: a prefill is a head start, not a claim.
   */
  prefill?: { activityName: string; durationMinutes: number; notes?: string }
  /**
   * RENDER AS A REAL SHEET, ABOVE EVERYTHING — not as a block in the page.
   *
   * Ashley, 14 Sep 2026, after a finished round: "Tapping Log session in the
   * Round Timer modal after finishing 6/6 rounds does nothing. The button
   * doesn't even click, and nothing is logged or submitted."
   *
   * The button fired every time. This component returned a plain <div> in
   * normal document flow, and ToolsTab's full-screen branch renders it as a
   * sibling of RoundField — which is `fixed inset top-0 z-30` with an opaque
   * background. The form opened underneath the timer, so there was nothing to
   * see and nothing to tap.
   *
   * A PROP RATHER THAN KEYED OFF `hideTrigger`, because the two call sites
   * genuinely differ. On the exercise tab this expands inline beneath its own
   * button and that is the design; only the timer needs to clear a
   * viewport-covering field. The caller knows which it is; this component
   * cannot.
   */
  overlay?: boolean
}) {
  const { profileId, date, declareOffPlan } = useActiveSession()
  const [mode, setMode] = useState<null | 'lift' | 'cardio'>(null)
  const [liftName, setLiftName] = useState('')
  const [activity, setActivity] = useState('')
  const [duration, setDuration] = useState('')
  const [durationError, setDurationError] = useState<string | null>(null)
  const [rpe, setRpe] = useState(6)
  const [saving, setSaving] = useState(false)

  // Controlled mode: opening from outside (the day-level menu) needs a
  // default sub-tab, since nothing here set `mode` yet. A prefill says which
  // one and fills it — conditioning, because that is the only shape a prefill
  // currently arrives in.
  useEffect(() => {
    if (!hideTrigger || !open || mode !== null) return
    if (prefill) {
      setMode('cardio')
      setActivity(prefill.activityName)
      setDuration(String(prefill.durationMinutes))
      return
    }
    setMode('lift')
  }, [hideTrigger, open, mode, prefill])

  const reset = () => {
    setMode(null)
    setLiftName('')
    setActivity('')
    setDuration('')
    setRpe(6)
    onOpenChange?.(false)
  }

  const visible = hideTrigger ? !!open : mode !== null

  const handleAddLift = () => {
    if (!liftName.trim()) return
    declareOffPlan(liftName.trim())
    onLiftAdded?.()
    reset()
  }

  const handleSaveCardio = () => {
    if (!profileId || !activity.trim() || !duration) return
    // Same unenforced `min="1"` as the rest-day card had — see its handler.
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
      intensityRpe: rpe,
      // "3 rounds · 120s work / 30s rest" — what the timer actually ran, so
      // the log says more than "Intervals, 7 min" when she reads it back.
      notes: prefill?.notes ?? null,
    })
    setSaving(false)
    if (!view) {
      setDurationError("That didn't save — check the number and try again.")
      return
    }
    onCardioLogged?.()
    reset()
  }

  if (!visible) {
    if (hideTrigger) return null
    return (
      <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setMode('lift')}>
        <Plus className="size-3 mr-1" />
        Add unplanned work
      </Button>
    )
  }

  const body = (
    <div className="rounded-xl p-3 space-y-3 bg-[color:var(--surface-deep)]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            variant={mode === 'lift' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setMode('lift')}
          >
            <Dumbbell className="size-3" />
            Lift
          </Button>
          <Button
            variant={mode === 'cardio' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setMode('cardio')}
          >
            <Activity className="size-3" />
            Cardio
          </Button>
        </div>
        {/* ONE CLOSE CONTROL, NOT TWO. In overlay mode the Dialog shell draws
            its own × in the corner, and stacking a second one directly beneath
            it reads as two different exits for one sheet. Read off the
            screenshot, not reasoned about. */}
        <Button variant="ghost" size="icon" className={`hit-slop-44 size-6 ${overlay ? 'hidden' : ''}`} onClick={reset} aria-label="Cancel">
          <X className="size-3.5" />
        </Button>
      </div>

      {mode === 'lift' && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Lift name (e.g. Shrugs, Bicep Curls)"
            value={liftName}
            onChange={e => setLiftName(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={e => { if (e.key === 'Enter' && liftName.trim()) handleAddLift() }}
            autoFocus
          />
          <Button size="sm" className="h-8 shrink-0" disabled={!liftName.trim()} onClick={handleAddLift}>
            Add
          </Button>
        </div>
      )}

      {mode === 'cardio' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {CONDITIONING_PRESETS.map(preset => (
              <Button
                key={preset.activity}
                variant="outline"
                size="sm"
                className="h-7 text-[0.6875rem] justify-start px-2"
                onClick={() => { setActivity(preset.activity); setDuration(String(preset.duration)); setRpe(preset.rpe) }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Activity name"
            value={activity}
            onChange={e => setActivity(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-2">
            <Clock className="size-3 text-muted-foreground shrink-0" />
            <Input
              type="number"
              min="1"
              placeholder="Duration (mins)"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[0.625rem] text-muted-foreground flex items-center gap-1">
              <Flame className="size-2.5" /> RPE {rpe}
            </span>
            <div className="flex gap-1">
              {RPE_CHOICES.map(val => (
                <button
                  key={val}
                  type="button"
                  className={`flex-1 h-11 min-w-11 rounded text-xs font-semibold transition-all ${
                    val === rpe ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                  onClick={() => setRpe(val)}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            className="w-full h-8"
            disabled={!activity.trim() || !duration || saving}
            onClick={handleSaveCardio}
          >
            {saving ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Activity className="size-3 mr-1" />}
            Save
          </Button>
        </div>
      )}
    </div>
  )

  // THE SAME SHELL EVERY OTHER SHEET IN THE APP USES (Dialog, z-50), so it
  // clears RoundField's z-30 by construction rather than by a number chosen
  // here — and picks up the scrim, the escape key and the focus trap that a
  // hand-rolled overlay would have had to reinvent.
  if (!overlay) return body
  return (
    <Dialog open onOpenChange={o => { if (!o) reset() }}>
      <DialogContent data-testid="unplanned-work-sheet">
        <DialogHeader>
          <DialogTitle className="pr-8">Log what you did</DialogTitle>
          <DialogDescription>{prefill?.notes ?? 'Anything you did that was not on the plan.'}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
