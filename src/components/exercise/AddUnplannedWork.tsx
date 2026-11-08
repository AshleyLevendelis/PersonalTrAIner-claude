import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, X, Dumbbell, Activity } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { UnplannedCardioEntry, EaseOffAsk, type CardioPick } from './CardioSetRow'
import type { EaseOffQuestion } from '@/lib/cardio-ease-off'
import type { CardioLogView } from '@/lib/cardio-log-store'
import { BLOCK_NAMES, blockChipLabel } from '@/lib/circuit'
import { cardioPresetsFor } from '@/lib/cardio-presets'
import type { EquipmentAccess, UserProfile } from '@/lib/types'
import { searchExercisesToLog } from '@/lib/exercise-db'
import { ensureNearCopies } from '@/lib/near-copies-loader'
import { getExerciseCompatibilityWarnings } from '@/lib/exercise-plan'

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
// other cardio log.
//
// WHICH FOUR depends on the kit since 9 Oct 2026 — see cardio-presets.ts. This
// file used to hold one list for everybody, and a tester training at home was
// offered a treadmill, a heavy bag and an assault bike.

/** The timer's chips: what a block usually is, at the minutes the timer counted, effort left to her. */
function timerBlockPicks(minutes: number, shape?: string): CardioPick[] {
  return BLOCK_NAMES.map(name => ({ label: blockChipLabel(name), activity: name, minutes, detail: shape?.trim() || undefined }))
}

export function AddUnplannedWork({
  onLiftAdded,
  onCardioLogged,
  open,
  onOpenChange,
  hideTrigger,
  prefill,
  overlay,
  equipmentAccess,
  profile,
  exclusions,
}: {
  /**
   * For the marks on the name suggestions (3 Nov 2026): the same kit, injury and ban warnings the swap search shows,
   * so a near-copy of a lift her injury rules out says so. Left out, the suggestions carry no marks.
   */
  profile?: UserProfile | null
  exclusions?: string[]
  onLiftAdded?: () => void
  onCardioLogged?: (view: CardioLogView) => void
  /**
   * The person's kit tier, so the quick-pick cardio options are ones they can
   * do. Left out, the options are the ones that need no kit at all.
   */
  equipmentAccess?: EquipmentAccess | null
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
  prefill?: { durationMinutes: number; notes?: string }
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
  // HELD HERE, NOT IN THE ROW: the panel closes on a save, and the ease-off question asked after a run must still be
  // on screen where the tap was (cardio-ease-off.ts).
  const [easeOff, setEaseOff] = useState<EaseOffQuestion | null>(null)
  // WHAT SHE CAN LOG, as she types (her ruling "Searchable, log-only", 3 Nov 2026): plan exercises first, then the
  // near-copies (a paused squat, a wide-grip pulldown), each tap filling the exact name so the set lands in its own
  // history. Hidden once the box already holds one of them exactly.
  // The near-copies arrive in their own chunk; the box asks for them and redraws when they land.
  const [copiesReady, setCopiesReady] = useState(0)
  useEffect(() => {
    let live = true
    void ensureNearCopies().then(() => { if (live) setCopiesReady(n => n + 1) })
    return () => { live = false }
  }, [])
  const suggestions = useMemo(() => {
    const typed = liftName.trim()
    if (typed.length < 2) return []
    const found = searchExercisesToLog(typed, 6)
    return found.some(e => e.name.toLowerCase() === typed.toLowerCase()) ? [] : found
  }, [liftName, copiesReady])
  // ON SCREEN, NOT MERELY IN THE PAGE (read off the first screenshot, 3 Nov 2026): the list opened under the floating
  // Start bar, its "Log only" line and its marks hidden until she scrolled. So it brings itself into view, clear of
  // the docked bars (scroll-margin), each time it appears or changes size.
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (suggestions.length === 0) return
    // MEASURED, not left to scrollIntoView: its margin was not honoured here and the last row stayed 15px under the
    // Start bar. The docked bars take about 240px of the bottom of a phone screen; the list ends above that line.
    const frame = requestAnimationFrame(() => {
      const r = listRef.current?.getBoundingClientRect()
      const line = window.innerHeight - 240
      if (r && r.bottom > line) window.scrollBy(0, Math.min(r.bottom - line, Math.max(0, r.top - 80)))
    })
    return () => cancelAnimationFrame(frame)
  }, [suggestions.length])
  const easeOffAsk = easeOff ? <EaseOffAsk question={easeOff} onDone={() => setEaseOff(null)} /> : null

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
    if (hideTrigger) return easeOffAsk
    return (
      <>
        {easeOffAsk}
        <Button variant="outline" size="sm" className="w-full text-xs h-11" onClick={() => setMode('lift')}>
          <Plus className="size-3 mr-1" />
          Add unplanned work
        </Button>
      </>
    )
  }

  const body = (
    <div className="rounded-xl p-3 space-y-3 bg-[color:var(--surface-deep)]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            variant={mode === 'lift' ? 'default' : 'ghost'}
            size="sm"
            className="h-11 text-xs gap-1"
            onClick={() => setMode('lift')}
          >
            <Dumbbell className="size-3" />
            Lift
          </Button>
          <Button
            variant={mode === 'cardio' ? 'default' : 'ghost'}
            size="sm"
            className="h-11 text-xs gap-1"
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
            className="h-11 text-sm"
            onKeyDown={e => { if (e.key === 'Enter' && liftName.trim()) handleAddLift() }}
            autoFocus
          />
          <Button size="sm" className="h-11 shrink-0" disabled={!liftName.trim()} onClick={handleAddLift}>
            Add
          </Button>
        </div>
      )}
      {mode === 'lift' && suggestions.length > 0 && (
        <ul ref={listRef} data-testid="log-suggestions" className="space-y-1">
          {suggestions.map(e => {
            const marks = profile ? getExerciseCompatibilityWarnings(e, profile, exclusions ?? []) : []
            return (
              <li key={e.name}>
                <button
                  type="button"
                  data-testid="log-suggestion"
                  data-name={e.name}
                  data-log-only={e.log_only ? 'true' : 'false'}
                  className="w-full min-h-11 rounded-lg px-3 py-2 text-left text-sm bg-[color:var(--surface)] hover:bg-[color:var(--surface-raised)] focus-visible:outline focus-visible:outline-2"
                  onClick={() => setLiftName(e.name)}
                >
                  <span className="block">{e.name}</span>
                  {e.log_only && e.parent && (
                    <span data-testid="log-suggestion-kind" className="block text-xs text-muted-foreground">Log only · a version of {e.parent}</span>
                  )}
                  {!e.log_only && e.parent && (
                    <span data-testid="log-suggestion-kind" className="block text-xs text-muted-foreground">A version of {e.parent}</span>
                  )}
                  {marks.map(m => (
                    <span key={m} data-testid="log-suggestion-mark" className="block text-xs text-amber-600 dark:text-amber-400">{m}</span>
                  ))}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {mode === 'cardio' && (
        <UnplannedCardioEntry
          // A TIMER BLOCK IS NAMED, NOT "INTERVALS" (Ashley's ruling A, 8 Oct
          // 2026): the chips are what a block usually is, each carrying the
          // timer's own minutes and no effort, and Other keeps the minutes too.
          // Otherwise the quick picks fit the kit (cardio-presets.ts, 9 Oct 2026).
          picks={prefill ? timerBlockPicks(prefill.durationMinutes, prefill.notes) : cardioPresetsFor(equipmentAccess)}
          defaultMinutes={prefill?.durationMinutes}
          // "5 × 3 min" — what the timer actually ran, so the log says more
          // than a name and a minute count when she reads it back.
          notes={prefill?.notes ?? null}
          onLogged={view => { onCardioLogged?.(view); reset() }}
          onEaseOffQuestion={setEaseOff}
        />
      )}
    </div>
  )

  // THE SAME SHELL EVERY OTHER SHEET IN THE APP USES (Dialog, z-50), so it
  // clears RoundField's z-30 by construction rather than by a number chosen
  // here — and picks up the scrim, the escape key and the focus trap that a
  // hand-rolled overlay would have had to reinvent.
  // ROOM TO SCROLL INTO: inline, this sheet is the last thing on the page, so a list growing under it had nowhere to
  // scroll to and stayed beneath the docked bars. While suggestions show, the page gets that room below them.
  // The wrapper is ALWAYS there and only its padding changes: swapping `body` for a wrapped `body` remounted the box
  // on the first suggestion, which on a phone drops the keyboard mid-word.
  if (!overlay) return <div style={{ paddingBottom: mode === 'lift' && suggestions.length > 0 ? 240 : 0 }}>{body}</div>
  return (
    <Dialog open onOpenChange={o => { if (!o) reset() }}>
      <DialogContent data-testid="unplanned-work-sheet">
        <DialogHeader>
          <DialogTitle className="pr-8">{prefill ? 'What was this block?' : 'Log what you did'}</DialogTitle>
          <DialogDescription>{prefill?.notes ?? 'Anything you did that was not on the plan.'}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
