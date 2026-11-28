import { useState } from 'react'
import { Minus, Plus, X, Dumbbell, Activity, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PRIMARY_CTA_CLASS, PRIMARY_CTA_STYLE } from '@/components/OnePage'
import { cardioPresetsFor } from '@/lib/cardio-presets'
import { getAppNow } from '@/lib/dev-clock'
import { stepOwnRest, restWords } from '@/lib/own-workout'
import {
  type OwnPlan, type PlanLift, type PlanCardio, type PlanItem,
  newPlanLift, newPlanCardio, stepPlanSets, planProblem, saveOwnPlan, deleteOwnPlan,
} from '@/lib/own-workout-plans'
import type { EquipmentAccess, UserProfile } from '@/lib/types'
import { ExercisePicker } from './OwnWorkoutSheet'

/**
 * BUILD A WORKOUT AHEAD ("My workouts", his request 25 Nov 2026: "Add squat, add bench press, add deadlift, rest, add an
 * exercise ... Have it all ready, and you go to the gym and you just start"). A name, then each exercise with its sets,
 * reps, an optional weight and his rest, and any cardio with its minutes. Save keeps it by name; Delete removes it.
 */
export default function OwnPlanEditor({ profileId, plan: initial, isNew, equipmentAccess, profile, exclusions, onSaved, onClose }: {
  profileId: string
  plan: OwnPlan
  isNew: boolean
  equipmentAccess?: EquipmentAccess | null
  profile?: UserProfile | null
  exclusions?: string[]
  onSaved: (plan: OwnPlan) => void
  onClose: () => void
}) {
  const [p, setP] = useState<OwnPlan>(initial)
  const [picking, setPicking] = useState<null | 'lift' | 'cardio'>(isNew && initial.items.length === 0 ? 'lift' : null)
  const [note, setNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const now = () => getAppNow(profileId).toISOString()
  const setItem = (key: string, next: PlanItem) => setP({ ...p, items: p.items.map(i => (i.key === key ? next : i)) })
  const removeItem = (key: string) => setP({ ...p, items: p.items.filter(i => i.key !== key) })
  const move = (key: string, dir: -1 | 1) => {
    const at = p.items.findIndex(i => i.key === key)
    const to = at + dir
    if (at < 0 || to < 0 || to >= p.items.length) return
    const items = [...p.items]
    ;[items[at], items[to]] = [items[to], items[at]]
    setP({ ...p, items })
  }
  const save = () => {
    const problem = planProblem(p, profile)
    if (problem) { setNote(problem); return }
    const stamp = now()
    if (!saveOwnPlan(profileId, p, stamp)) { setNote("Couldn't keep it on your phone. Try again."); return }
    onSaved({ ...p, name: p.name.trim(), updatedAt: stamp })
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Build a workout" data-testid="own-plan-editor"
      className="fixed inset-0 z-[80] overflow-y-auto bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto max-w-[520px] px-[22px] pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[.2em] text-primary-text">{isNew ? 'New workout' : 'Edit workout'}</span>
          <button type="button" aria-label="Close" data-testid="own-plan-close" onClick={onClose} className="flex size-11 items-center justify-center rounded-full">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <Input aria-label="Workout name" placeholder="Name it: Push day, Legs…" data-testid="own-plan-name" value={p.name}
          onChange={e => setP({ ...p, name: e.target.value })}
          className="mt-1 h-12 border-0 bg-transparent px-0 text-[1.75rem] font-bold tracking-[-.02em] focus-visible:ring-0" />

        <div className="mt-4 flex flex-col gap-3">
          {p.items.map((item, idx) => item.kind === 'lift'
            ? <PlanLiftCard key={item.key} lift={item} first={idx === 0} last={idx === p.items.length - 1} onChange={n => setItem(item.key, n)} onRemove={() => removeItem(item.key)} onMove={d => move(item.key, d)} />
            : <PlanCardioCard key={item.key} cardio={item} first={idx === 0} last={idx === p.items.length - 1} onChange={n => setItem(item.key, n)} onRemove={() => removeItem(item.key)} onMove={d => move(item.key, d)} />)}
        </div>

        {picking === 'lift' ? (
          <ExercisePicker profile={profile} exclusions={exclusions} onPick={name => { setP({ ...p, items: [...p.items, newPlanLift(name)] }); setPicking(null) }} onCancel={() => setPicking(null)} />
        ) : picking === 'cardio' ? (
          <div className="mt-3 rounded-2xl bg-[color:var(--surface-deep)] p-3" data-testid="own-plan-cardio-picker">
            <div className="flex flex-wrap gap-2">
              {cardioPresetsFor(equipmentAccess).map(c => (
                <button key={c.label} type="button" data-testid="own-plan-cardio-pick" className="min-h-11 rounded-full border px-3.5 text-[0.875rem]"
                  onClick={() => { setP({ ...p, items: [...p.items, newPlanCardio(c.activity, String(c.minutes))] }); setPicking(null) }}>{c.label}</button>
              ))}
              <button type="button" className="min-h-11 rounded-full border px-3.5 text-[0.875rem]" onClick={() => { setP({ ...p, items: [...p.items, newPlanCardio()] }); setPicking(null) }}>Something else</button>
            </div>
            <button type="button" className="mt-2 min-h-11 text-[0.8125rem] text-muted-foreground" onClick={() => setPicking(null)}>Cancel</button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" data-testid="own-plan-add-exercise" onClick={() => setPicking('lift')}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[0.875rem] font-semibold text-primary-text"
              style={{ background: 'rgba(var(--glow-rgb), .12)', border: '1px solid rgba(var(--glow-rgb), .35)' }}>
              <Dumbbell className="size-4" aria-hidden /> Add exercise
            </button>
            <button type="button" data-testid="own-plan-add-cardio" onClick={() => setPicking('cardio')}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border text-[0.875rem] font-semibold">
              <Activity className="size-4" aria-hidden /> Add cardio
            </button>
          </div>
        )}

        {note && <p className="mt-3 text-[0.8125rem]" role="status" data-testid="own-plan-note">{note}</p>}

        <div className="mt-5 flex flex-col gap-2 pb-8">
          <button type="button" className={PRIMARY_CTA_CLASS} style={PRIMARY_CTA_STYLE} data-testid="own-plan-save" onClick={save}>Save workout</button>
          {!isNew && (confirmDelete ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2" data-testid="own-plan-delete-confirm">
              <span className="text-[0.8125rem]">Delete “{initial.name}” from your workouts?</span>
              <button type="button" className="min-h-11 px-2 text-[0.8125rem] font-semibold text-[color:var(--destructive)]" data-testid="own-plan-delete-yes"
                onClick={() => { deleteOwnPlan(profileId, initial.id, now()); onClose() }}>Delete</button>
            </div>
          ) : (
            <button type="button" className="min-h-11 text-[0.875rem] text-muted-foreground" data-testid="own-plan-delete" onClick={() => setConfirmDelete(true)}>Delete this workout</button>
          ))}
        </div>
      </div>
    </div>
  )
}

const box = 'h-11 border bg-[color:var(--surface-deep)] text-center tabular-mono'

function Reorder({ first, last, onMove, onRemove, name }: { first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void; name: string }) {
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" aria-label={`Move ${name} up`} disabled={first} onClick={() => onMove(-1)} className="flex size-9 items-center justify-center text-muted-foreground disabled:opacity-30">↑</button>
      <button type="button" aria-label={`Move ${name} down`} disabled={last} onClick={() => onMove(1)} className="flex size-9 items-center justify-center text-muted-foreground disabled:opacity-30">↓</button>
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="flex size-9 items-center justify-center text-muted-foreground"><Trash2 className="size-4" aria-hidden /></button>
    </span>
  )
}

function PlanLiftCard({ lift, first, last, onChange, onRemove, onMove }: { lift: PlanLift; first: boolean; last: boolean; onChange: (l: PlanLift) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  return (
    <div className="rounded-2xl bg-card p-3.5" data-testid="own-plan-lift" data-name={lift.name}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[1rem] font-semibold leading-tight">{lift.name}</p>
        <Reorder first={first} last={last} onMove={onMove} onRemove={onRemove} name={lift.name} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label="One set fewer" data-testid="own-plan-sets-minus" onClick={() => onChange({ ...lift, sets: stepPlanSets(lift.sets, -1) })} className="flex size-11 items-center justify-center rounded-full border"><Minus className="size-4" aria-hidden /></button>
        <span className="min-w-[56px] text-center text-[0.9375rem] font-semibold" data-testid="own-plan-sets">{lift.sets} set{lift.sets === 1 ? '' : 's'}</span>
        <button type="button" aria-label="One set more" data-testid="own-plan-sets-plus" onClick={() => onChange({ ...lift, sets: stepPlanSets(lift.sets, 1) })} className="flex size-11 items-center justify-center rounded-full border"><Plus className="size-4" aria-hidden /></button>
        <span className="ml-1 text-muted-foreground">×</span>
        <Input aria-label={`${lift.name} reps`} data-testid="own-plan-reps" value={lift.reps} placeholder="reps" onChange={e => onChange({ ...lift, reps: e.target.value })} className={`${box} w-[72px]`} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input inputMode="decimal" aria-label={`${lift.name} weight`} data-testid="own-plan-weight" value={lift.weight} placeholder="–" onChange={e => onChange({ ...lift, weight: e.target.value })} className={`${box} w-[84px]`} />
        <span className="text-[0.8125rem] text-muted-foreground">kg</span>
        <span className="ml-auto text-[0.8125rem] text-muted-foreground">Rest</span>
        <button type="button" aria-label="Shorter rest" data-testid="own-plan-rest-minus" onClick={() => onChange({ ...lift, restSeconds: stepOwnRest(lift.restSeconds, -1) })} className="flex size-11 items-center justify-center rounded-full border"><Minus className="size-4" aria-hidden /></button>
        <span className="min-w-[44px] text-center text-[0.875rem] font-semibold" data-testid="own-plan-rest">{restWords(lift.restSeconds)}</span>
        <button type="button" aria-label="Longer rest" data-testid="own-plan-rest-plus" onClick={() => onChange({ ...lift, restSeconds: stepOwnRest(lift.restSeconds, 1) })} className="flex size-11 items-center justify-center rounded-full border"><Plus className="size-4" aria-hidden /></button>
      </div>
    </div>
  )
}

function PlanCardioCard({ cardio, first, last, onChange, onRemove, onMove }: { cardio: PlanCardio; first: boolean; last: boolean; onChange: (c: PlanCardio) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  return (
    <div className="rounded-2xl bg-card p-3.5" data-testid="own-plan-cardio">
      <div className="flex items-start justify-between gap-2">
        <Input aria-label="Activity" placeholder="Run, skipping, rower…" value={cardio.activity} data-testid="own-plan-cardio-activity" onChange={e => onChange({ ...cardio, activity: e.target.value })} className="h-11 border bg-[color:var(--surface-deep)]" />
        <Reorder first={first} last={last} onMove={onMove} onRemove={onRemove} name={cardio.activity || 'cardio'} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input inputMode="numeric" aria-label="Minutes" value={cardio.minutes} placeholder="0" data-testid="own-plan-cardio-minutes" onChange={e => onChange({ ...cardio, minutes: e.target.value })} className={`${box} w-[72px]`} />
        <span className="text-[0.8125rem] text-muted-foreground">min</span>
      </div>
    </div>
  )
}
