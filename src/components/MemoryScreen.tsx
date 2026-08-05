// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §1 Part 4 — "What I know about you." Every active
// fact/goal/context-note, grouped by kind, each showing provenance and when
// it was learned. Edit is inline (display_text only — re-resolving a target
// name is a new fact, not an edit, matching §1.4's "the payload is
// immutable" rule loosely: this app doesn't implement supersedes_id chains
// yet, so "edit" here is a straightforward update+re-effect, and "delete"
// is a REAL delete (not retire) — Part 4 is explicit that a deleted memory
// must stop affecting plans, and a permanently-deleted row can never be
// read by fact-compiler again, which retire (still a DB row, just
// status='retired') already guarantees just as well; delete is used here
// so the row disappears from a distinguishing "is this SDK compilable"
// query even to a component that forgot to filter status.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import {
  getAllFacts, getAllGoals, getAllContextFacts,
  deleteFactPermanently, deleteGoalPermanently, deleteContextFactPermanently,
  type UserFactRow, type UserGoalRow, type UserContextFactRow,
} from '@/lib/memory-store'
import { supabase } from '@/lib/supabase'
import { computeGoalProgress } from '@/lib/goal-progress'

interface MemoryScreenProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId?: string
  latestWeightKg?: number | null
  /** Fired after any edit/delete so App.tsx's compiled exclusions/dislikes refresh immediately — a deleted fact must stop affecting the very next generation call, not just the next reload. */
  onMemoryChanged: () => void | Promise<void>
}

const FACT_KIND_LABEL: Record<UserFactRow['kind'], string> = {
  food_preference: 'Food preferences',
  exercise_preference: 'Exercise preferences',
  timing_rule: 'Timing rules',
  hard_constraint: 'Hard constraints',
}

function ProvenanceBadge({ source, createdAt }: { source: string; createdAt: string }) {
  const date = new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return <span className="text-[10px] text-muted-foreground">{source} · {date}</span>
}

function EffectLine({ text }: { text: string }) {
  return <p className="text-[11px] text-muted-foreground italic mt-0.5">{text}</p>
}

function factEffect(fact: UserFactRow): string {
  if (fact.kind === 'food_preference' || fact.kind === 'exercise_preference') {
    const n = fact.resolved_refs?.length ?? 0
    if (fact.hardness === 'hard') {
      return fact.kind === 'exercise_preference' ? `excludes ${n} exercise${n === 1 ? '' : 's'}` : 'excluded from your meals'
    }
    return 'biases suggestions — nothing removed'
  }
  if (fact.kind === 'timing_rule') {
    return fact.timing_anchor === 'slot' ? `applied to your ${fact.timing_slot} pool` : 'recorded — not yet applied (needs day-context meal generation doesn\'t have yet)'
  }
  return 'recorded — not yet applied (takes effect on your next plan regeneration)'
}

export function MemoryScreen({ open, onOpenChange, profileId, latestWeightKg, onMemoryChanged }: MemoryScreenProps) {
  const [facts, setFacts] = useState<UserFactRow[]>([])
  const [goals, setGoals] = useState<UserGoalRow[]>([])
  const [contextFacts, setContextFacts] = useState<UserContextFactRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    if (!profileId) return
    setLoading(true)
    try {
      const [f, g, c] = await Promise.all([getAllFacts(profileId), getAllGoals(profileId), getAllContextFacts(profileId)])
      setFacts(f.filter(x => x.status === 'active'))
      setGoals(g.filter(x => x.status !== 'superseded'))
      setContextFacts(c.filter(x => x.status === 'active'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open) void reload() }, [open, profileId])

  const startEdit = (id: string, current: string) => { setEditingId(id); setEditValue(current) }
  const cancelEdit = () => { setEditingId(null); setEditValue('') }

  const saveFactEdit = async (id: string) => {
    await supabase.from('user_facts').update({ display_text: editValue }).eq('id', id)
    cancelEdit(); await reload(); await onMemoryChanged()
  }
  const saveGoalEdit = async (id: string) => {
    await supabase.from('user_goals').update({ display_text: editValue }).eq('id', id)
    cancelEdit(); await reload(); await onMemoryChanged()
  }
  const saveContextEdit = async (id: string) => {
    await supabase.from('user_context_facts').update({ display_text: editValue }).eq('id', id)
    cancelEdit(); await reload(); await onMemoryChanged()
  }

  const deleteFact = async (id: string) => { await deleteFactPermanently(id); await reload(); await onMemoryChanged() }
  const deleteGoal = async (id: string) => { await deleteGoalPermanently(id); await reload(); await onMemoryChanged() }
  const deleteContext = async (id: string) => { await deleteContextFactPermanently(id); await reload(); await onMemoryChanged() }

  const grouped = (['food_preference', 'exercise_preference', 'timing_rule', 'hard_constraint'] as const)
    .map(kind => ({ kind, items: facts.filter(f => f.kind === kind) }))
    .filter(g => g.items.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What I know about you</DialogTitle>
          <DialogDescription>Everything the app has learned — correct or remove anything here.</DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {goals.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goals</h3>
            {goals.map(g => {
              const progress = profileId ? computeGoalProgress(g, profileId, latestWeightKg ?? null) : { current: null, percent: null }
              return (
                <div key={g.id} className="rounded-md border p-2.5 space-y-1">
                  {editingId === g.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => saveGoalEdit(g.id)}><Check className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{g.display_text}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="size-6" onClick={() => startEdit(g.id, g.display_text)}><Pencil className="size-3" /></Button>
                        <Button size="icon" variant="ghost" className="size-6 text-destructive" onClick={() => deleteGoal(g.id)}><Trash2 className="size-3" /></Button>
                      </div>
                    </div>
                  )}
                  {g.status === 'needs_baseline' && <EffectLine text="Waiting on a baseline before this can be tracked" />}
                  {g.trackable === 'directional' && <EffectLine text="Directional — biases your plan, never reported as a tracked percentage" />}
                  {g.trackable === 'measurable' && g.status === 'active' && (
                    <div className="text-[11px] text-muted-foreground">
                      {progress.current != null
                        ? `Current: ${progress.current} · Target: ${g.target_value} · ${progress.percent}% there`
                        : `Baseline: ${g.baseline_value} · Target: ${g.target_value} · current not yet known`}
                    </div>
                  )}
                  <ProvenanceBadge source={g.source} createdAt={g.created_at} />
                </div>
              )
            })}
            <Separator className="my-2" />
          </div>
        )}

        {grouped.map(({ kind, items }) => (
          <div key={kind} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FACT_KIND_LABEL[kind]}</h3>
            {items.map(f => (
              <div key={f.id} className="rounded-md border p-2.5 space-y-1">
                {editingId === f.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => saveFactEdit(f.id)}><Check className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{f.display_text}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {f.hardness && <Badge variant="outline" className="text-[9px] px-1 py-0">{f.hardness}</Badge>}
                      <Button size="icon" variant="ghost" className="size-6" onClick={() => startEdit(f.id, f.display_text)}><Pencil className="size-3" /></Button>
                      <Button size="icon" variant="ghost" className="size-6 text-destructive" onClick={() => deleteFact(f.id)}><Trash2 className="size-3" /></Button>
                    </div>
                  </div>
                )}
                <EffectLine text={factEffect(f)} />
                <ProvenanceBadge source={f.source} createdAt={f.created_at} />
              </div>
            ))}
            <Separator className="my-2" />
          </div>
        ))}

        {contextFacts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tone &amp; context</h3>
            {contextFacts.map(c => (
              <div key={c.id} className="rounded-md border p-2.5 space-y-1">
                {editingId === c.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => saveContextEdit(c.id)}><Check className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{c.display_text}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="size-6" onClick={() => startEdit(c.id, c.display_text)}><Pencil className="size-3" /></Button>
                      <Button size="icon" variant="ghost" className="size-6 text-destructive" onClick={() => deleteContext(c.id)}><Trash2 className="size-3" /></Button>
                    </div>
                  </div>
                )}
                <EffectLine text="Shapes how the coach talks to you — never your plan" />
                <ProvenanceBadge source={c.source} createdAt={c.created_at} />
              </div>
            ))}
          </div>
        )}

        {!loading && goals.length === 0 && grouped.length === 0 && contextFacts.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing recorded yet — state a preference, goal, or constraint in chat and it'll show up here.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
