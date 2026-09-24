import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, X, Dumbbell, Activity } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { UnplannedCardioEntry, type CardioPick } from './CardioSetRow'

// ---------------------------------------------------------------------------
// One entry point for off-plan lifts AND ad-hoc cardio (LAYOUT-DESIGN.md
// §1.7 G) — replaces the two footer buttons ("Add Extra Lift" / "Log
// Cardio") and the standalone CardioLogger. Visually and verbally a
// LOGGING act ("unplanned"), never a plan edit (§4.4) — a declared lift
// just adds a name to today's session record; nothing here touches the
// mesocycle.
// ---------------------------------------------------------------------------

// LOGGED LIKE A LIFTING SET since 24 Sep 2026 (Ashley's ruling — see
// CardioSetRow). The presets were buttons that filled two text boxes and a
// 5-10 number strip; they are the row's activity chips now, each carrying its
// minutes and its effort, and the effort is Easy / Steady / Hard like every
// other cardio log. The activity strings are unchanged — they are what the
// log has always recorded — and so are the RPEs, which a preset logged as-is
// still stores exactly (see rpeToStore): the HIIT bike is still an 8.
const CONDITIONING_PRESETS: readonly CardioPick[] = [
  { label: 'Incline walk', activity: 'Incline Treadmill Walk', minutes: 15, rpe: 4 },
  { label: 'Heavy bag', activity: 'Heavy Bag / Functional Circuit', minutes: 15, rpe: 7 },
  { label: 'HIIT bike', activity: 'HIIT / Assault Bike', minutes: 10, rpe: 8 },
  { label: 'Zone 2', activity: 'Zone 2 Cardio', minutes: 15, rpe: 5 },
]

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
  const { declareOffPlan } = useActiveSession()
  const [mode, setMode] = useState<null | 'lift' | 'cardio'>(null)
  const [liftName, setLiftName] = useState('')

  // Controlled mode: opening from outside (the day-level menu) needs a
  // default sub-tab, since nothing here set `mode` yet. A prefill says which
  // one and fills it — conditioning, because that is the only shape a prefill
  // currently arrives in.
  useEffect(() => {
    if (!hideTrigger || !open || mode !== null) return
    // The row itself takes the prefill's name and minutes (UnplannedCardioEntry's
    // `prefill`), and leaves the effort blank for her.
    if (prefill) {
      setMode('cardio')
      return
    }
    setMode('lift')
  }, [hideTrigger, open, mode, prefill])

  const reset = () => {
    setMode(null)
    setLiftName('')
    onOpenChange?.(false)
  }

  const visible = hideTrigger ? !!open : mode !== null

  const handleAddLift = () => {
    if (!liftName.trim()) return
    declareOffPlan(liftName.trim())
    onLiftAdded?.()
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
        <UnplannedCardioEntry
          picks={CONDITIONING_PRESETS}
          prefill={prefill}
          // "3 rounds · 120s work / 30s rest" — what the timer actually ran, so
          // the log says more than "Intervals, 7 min" when she reads it back.
          notes={prefill?.notes ?? null}
          onLogged={() => { onCardioLogged?.(); reset() }}
        />
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
