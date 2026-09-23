import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { isPlausibleCardioDuration, MAX_PLAUSIBLE_CARDIO_MINUTES } from '@/lib/cardio-log-store'

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
 * ITS OWN CHUNK, like every other sheet in this app (SwapDialog,
 * TightnessSheet, RemoveExerciseSheet, AddExerciseSheet, the three meal
 * sheets). It was inline at first and the app chunk went 917 -> 921 kB
 * against a 920 budget — measured on a clean worktree of the commit before,
 * not inferred. Nobody sees this form until they tap the link, so its weight
 * has no business on the path to first paint.
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

export function AddCardioSession({
  dayName,
  onAdd,
  startOpen = false,
  onClose,
}: {
  dayName: string
  onAdd: (a: string, m: number, rpe: number) => Promise<string | null>
  /**
   * WHO OWNS THE TRIGGER. Default false keeps the dotted-underline link this
   * component has always rendered, which is still right for ActiveRecoveryCard
   * — there the control is an aside on a day that already has a session.
   *
   * RestDayCard passes true because the rest-day rebuild (20 Sep 2026) moved
   * that trigger into its "Change the plan" group, where it sits as a row with
   * its scope in a subtitle. It had to move: as a bare link it was one of three
   * identical dotted underlines, indistinguishable from "log a walk" — which
   * writes one row for today, where this rewrites every one of these weekdays
   * to the end of the block. The FORM is unchanged either way; only the thing
   * that opens it moved.
   */
  startOpen?: boolean
  /** Called when the form closes itself, so an owner rendering the trigger can drop back to it. */
  onClose?: () => void
}) {
  const [open, setOpen] = useState(startOpen)
  const [activity, setActivity] = useState('')
  const [minutes, setMinutes] = useState('')
  const [rpe, setRpe] = useState(EFFORTS[1].rpe)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => { setOpen(false); setError(null); onClose?.() }

  if (!open) {
    // Only reachable when this component owns its trigger — see startOpen.
    if (startOpen) return null
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
    close()
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
        <button type="button" className="text-xs text-muted-foreground underline" onClick={close}>
          Cancel
        </button>
      </div>
      {error && <p className="text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">{error}</p>}
    </div>
  )
}

