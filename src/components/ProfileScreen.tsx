// ---------------------------------------------------------------------------
// The merged "what this app knows about me" surface — Profile (identity,
// metrics, training setup, injuries, dietary/cooking settings) plus
// everything that used to live on the separate Memory screen (goals, food/
// exercise preferences, timing rules, hard constraints, tone & context),
// each still showing provenance and delete exactly as Memory did. The
// goals/facts/context sections below are relocated verbatim from
// MemoryScreen.tsx — same components, same store calls, same edit/delete
// semantics (edit touches display_text only; delete is a real DB delete,
// not retire — see that file's original doc comment for why).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { InsightBanner } from '@/components/ui/insight-banner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Pencil, Trash2, Check, X, Plus } from 'lucide-react'
import {
  getAllFacts, getAllGoals, getAllContextFacts, createFact,
  deleteFactPermanently, deleteGoalPermanently, deleteContextFactPermanently,
  type UserFactRow, type UserGoalRow, type UserContextFactRow,
} from '@/lib/memory-store'
import { resolveFoodTarget } from '@/lib/fact-compiler'
import { supabase } from '@/lib/supabase'
import { computeGoalProgress } from '@/lib/goal-progress'
import { GoalWeightSetter } from '@/components/GoalWeightSetter'
import { derivedStepsTargetFor } from '@/lib/steps-target'
import { updateProfileField } from '@/lib/profile-store'
import { useAppearance } from '@/hooks/useAppearance'
import { AppearanceSection } from '@/components/AppearanceSection'
import type { ThemeName, AccentOverride } from '@/lib/appearance-store'
import type { RevealSpeed } from '@/lib/reveal-speed-store'
import {
  EXPERIENCE_OPTIONS, EQUIPMENT_OPTIONS, STYLE_OPTIONS, RECOVERY_OPTIONS,
  CONDITIONING_PREF_OPTIONS, ACTIVITY_OPTIONS, DIETARY_OPTIONS, FAVORITE_CUISINE_OPTIONS,
  INJURY_OPTIONS, COOKING_TIME_OPTIONS, MEALS_PER_DAY_OPTIONS, DURATION_OPTIONS, BREAKFAST_STYLE_OPTIONS,
  DAYS_FULL, partitionInjuries,
} from '@/lib/onboarding-slots'
import { detectPlanInvalidation, type PlanInvalidation } from '@/lib/plan-invalidation'
import type { UserProfile, TrainingDay, TrainingExperience, EquipmentAccess, TrainingStyle } from '@/lib/types'
import { buildDataExport, downloadExport, summariseExport, deleteAllUserData } from '@/lib/user-data'

const GENDER_OPTIONS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]

// THEME/ACCENT tables moved to src/lib/appearance-palette.ts — the settings
// sheet is no longer the only reader (the live preview needs them too), and
// they now carry the light-canvas flag and the dark accent step.
// The canonical day ordering now comes from the shared slot module rather
// than a second hand-typed copy that could drift.
const DAY_ORDER = DAYS_FULL

interface ProfileScreenProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserProfile
  latestWeightKg?: number | null
  /** Fired after any profile-field edit — App.tsx merges the patch into its own profile state, no refetch needed. */
  onProfileChanged: (patch: Partial<UserProfile>) => void
  /**
   * Fired when the edit just made leaves the existing plan wrong — an injury
   * added, or equipment changed (audit §2.1).
   *
   * This screen does NOT rebuild anything itself: App owns the mesocycle, and
   * a rebuild rewrites the weeks ahead. It reports, App asks, and only an
   * explicit confirm changes a plan.
   */
  onPlanInvalidated?: (invalidation: PlanInvalidation) => void
  /** Fired after any memory (goal/fact/context) edit/delete — same contract MemoryScreen had. */
  onMemoryChanged: () => void | Promise<void>
  /** Chat receipt deep-links land here, scrolled to the relevant memory section. 'dietary' — surfacing round — is where the meal-plan "unrecognised restriction" banner's "Open Profile" button lands. */
  initialSection?: 'goals' | 'facts' | 'context' | 'dietary'
  /** Chat typewriter reveal-speed preference — see reveal-speed-store.ts. */
  revealSpeed: RevealSpeed
  onRevealSpeedChange: (speed: RevealSpeed) => void
  /** "Show times in chat" — a 10px time under each run of the conversation. Off by default. */
  chatTimestamps: boolean
  onChatTimestampsChange: (on: boolean) => void
}

// ---- Shared small field-row components (scoped to this screen) -----------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  )
}

/**
 * value may be undefined — a body metric the user hasn't given. The field
 * stays fully editable in that state (the slot stays OPEN, per the refusal
 * ruling); it just starts empty and shows a "Not set" placeholder rather
 * than pretending to hold a number.
 */
function EditableTextField({
  value, unit, onSave, min, max, placeholder,
}: { value?: number; unit?: string; onSave: (n: number) => void; min?: number; max?: number
     /** Shown when nothing is set — used by Daily steps to display the value the field would take from elsewhere, so an empty box reads as a default rather than a gap. */
     placeholder?: string }) {
  const [input, setInput] = useState(value == null ? '' : String(value))
  useEffect(() => { setInput(value == null ? '' : String(value)) }, [value])
  const commit = () => {
    const n = Number(input)
    if (Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max) && n !== value) onSave(n)
    else setInput(value == null ? '' : String(value))
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        placeholder={placeholder}
        className={placeholder ? 'h-7 w-44 text-sm text-right' : 'h-7 w-20 text-sm text-right'}
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

/**
 * A free-text field. Despite its name, EditableTextField above is numeric —
 * it coerces with Number() and validates against min/max — so a plain string
 * needs its own control rather than a fifth parameter on that one.
 *
 * Blank is a real answer here: the name is optional throughout (see
 * canDeclineSlot in onboarding-slots.ts), and clearing it simply means the
 * coach stops using one rather than being a validation error.
 */
function EditableStringField({
  value, placeholder, maxLength = 30, onSave,
}: { value?: string; placeholder?: string; maxLength?: number; onSave: (v: string) => void }) {
  const [input, setInput] = useState(value ?? '')
  useEffect(() => { setInput(value ?? '') }, [value])
  const commit = () => {
    const next = input.trim().slice(0, maxLength)
    if (next !== (value ?? '')) onSave(next)
    else setInput(value ?? '')
  }
  return (
    <Input
      value={input}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={e => setInput(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="h-7 w-32 text-sm text-right"
    />
  )
}

/** value may be undefined — see EditableTextField. Renders unselected, still choosable. */
function EditableSelectField<T extends string | number>({
  value, options, onSave,
}: { value?: T; options: { value: T; label: string }[]; onSave: (v: T) => void }) {
  return (
    <Select value={value == null ? undefined : String(value)} onValueChange={v => {
      const match = options.find(o => String(o.value) === v)
      if (match) onSave(match.value)
    }}>
      <SelectTrigger className="h-7 w-auto text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function EditableTagList({
  values, onSave, placeholder,
}: { values: string[]; onSave: (next: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (!v || values.includes(v)) { setInput(''); return }
    onSave([...values, v])
    setInput('')
  }
  const remove = (v: string) => onSave(values.filter(x => x !== v))
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-2.5 gap-y-2.5">
        {values.map(v => (
          <Badge key={v} variant="secondary" className="text-[0.625rem] gap-1 pr-1">
            {v}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`} className="hit-slop-44"><X className="size-2.5" /></button>
          </Badge>
        ))}
        {values.length === 0 && <span className="text-xs text-muted-foreground/70">None yet</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder={placeholder}
          className="h-7 text-xs flex-1 min-w-0"
        />
        <Button size="icon" variant="outline" aria-label="Add" className="size-7 shrink-0" onClick={add} disabled={!input.trim()}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function TrainingDaysEditor({ days, onSave }: { days: TrainingDay[]; onSave: (next: TrainingDay[]) => void }) {
  const available = days.filter(d => d.available).map(d => d.day)
  return (
    <ToggleGroup
      type="multiple"
      value={available}
      onValueChange={(next: string[]) => {
        onSave(DAY_ORDER.map(day => ({ day, available: next.includes(day) })))
      }}
      className="flex-wrap"
    >
      {DAY_ORDER.map(day => (
        <ToggleGroupItem key={day} value={day} className="text-[0.625rem] px-2 h-7">{day.slice(0, 3)}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// ---- Relocated Memory helpers (verbatim from MemoryScreen.tsx) -----------

const FACT_KIND_LABEL: Record<UserFactRow['kind'], string> = {
  food_preference: 'Food preferences',
  exercise_preference: 'Exercise preferences',
  timing_rule: 'Timing rules',
  hard_constraint: 'Hard constraints',
}

function ProvenanceBadge({ source, createdAt }: { source: string; createdAt: string }) {
  const date = new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return <span className="text-[0.625rem] text-muted-foreground">{source} · {date}</span>
}

function EffectLine({ text }: { text: string }) {
  return <p className="text-[0.6875rem] text-muted-foreground italic mt-0.5">{text}</p>
}

function factEffect(fact: UserFactRow): string {
  if (fact.kind === 'food_preference' || fact.kind === 'exercise_preference') {
    const n = fact.resolved_refs?.length ?? 0
    // A FOOD DISLIKE IS ALWAYS A BAN NOW (Ashley's ruling, 30 Aug 2026), so
    // this reads polarity rather than hardness for food. It still read
    // hardness after that change shipped, which meant a softly-worded dislike
    // was being enforced as a filter while this screen told the user it
    // "biases suggestions — nothing removed" — the same false-effect claim
    // that ruling existed to remove, pointing the other way.
    if (fact.kind === 'food_preference' && fact.polarity === 'dislike') return 'excluded from your meals'
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

export function ProfileScreen({ open, onOpenChange, profile, latestWeightKg, onProfileChanged, onPlanInvalidated, onMemoryChanged, initialSection, revealSpeed, onRevealSpeedChange, chatTimestamps, onChatTimestampsChange }: ProfileScreenProps) {
  const [facts, setFacts] = useState<UserFactRow[]>([])
  const [goals, setGoals] = useState<UserGoalRow[]>([])
  const [contextFacts, setContextFacts] = useState<UserContextFactRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [armedDeleteKey, setArmedDeleteKey] = useState<string | null>(null)
  /** One place this screen reports a write that didn't land — savePatch's revert, and the six memory edit/delete handlers below. Declared here with the rest of the state rather than beside its first user, because it now has six. */
  const [saveError, setSaveError] = useState<string | null>(null)
  const armedDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const appearance = useAppearance()
  const goalsRef = useRef<HTMLDivElement>(null)
  const factsRef = useRef<HTMLDivElement>(null)
  const contextRef = useRef<HTMLDivElement>(null)
  const dietaryRef = useRef<HTMLDivElement>(null)

  const profileId = profile.id

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

  useEffect(() => {
    if (!open || !initialSection) return
    const ref = initialSection === 'goals' ? goalsRef : initialSection === 'facts' ? factsRef : initialSection === 'dietary' ? dietaryRef : contextRef
    // Content loads async (reload() above) — give it a tick before scrolling.
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
  }, [open, initialSection])

  const startEdit = (id: string, current: string) => { setEditingId(id); setEditValue(current) }
  const cancelEdit = () => { setEditingId(null); setEditValue('') }

  /**
   * Audit §3.4 — these three ignored the error the update returns. Supabase
   * does not throw on a failed write; it hands back `{ error }`, which was
   * dropped. reload() then refetched and the user's correction silently
   * reverted on screen with no explanation. Not a lie, but this is the one
   * place someone goes to fix what the coach believes about them, and
   * "your edit vanished" is a bad thing to leave them guessing about.
   */
  const saveMemoryEdit = async (
    table: 'user_facts' | 'user_goals' | 'user_context_facts',
    id: string,
    noun: string,
  ) => {
    const { error } = await supabase.from(table).update({ display_text: editValue }).eq('id', id)
    if (error) {
      console.error(`Editing ${noun} failed:`, error)
      setSaveError(`Couldn't save that ${noun} — check your connection and try again.`)
      return
    }
    setSaveError(null)
    cancelEdit(); await reload(); await onMemoryChanged()
  }
  const saveFactEdit = (id: string) => saveMemoryEdit('user_facts', id, 'note')
  const saveGoalEdit = (id: string) => saveMemoryEdit('user_goals', id, 'goal')
  const saveContextEdit = (id: string) => saveMemoryEdit('user_context_facts', id, 'note')

  /**
   * The delete helpers DO throw (memory-store checks the error and rethrows),
   * so these were failing loudly into an unhandled rejection — invisible to
   * the user in exactly the same way. Same treatment: the row stays, and the
   * screen says why.
   */
  const runDelete = async (fn: () => Promise<void>, noun: string) => {
    try {
      await fn()
      setSaveError(null)
      await reload(); await onMemoryChanged()
    } catch (err) {
      console.error(`Deleting ${noun} failed:`, err)
      setSaveError(`Couldn't remove that ${noun} — check your connection and try again.`)
    }
  }
  const deleteFact = (id: string) => runDelete(() => deleteFactPermanently(id), 'note')
  const deleteGoal = (id: string) => runDelete(() => deleteGoalPermanently(id), 'goal')
  const deleteContext = (id: string) => runDelete(() => deleteContextFactPermanently(id), 'note')

  /** Armed-then-confirm delete (no window.confirm — clashes with the app's
   * themed UI and is silently suppressible in PWA contexts). First tap arms
   * a 3s window; a second tap on the same row within it actually deletes. */
  const requestDelete = (key: string, action: () => Promise<void>) => {
    if (armedDeleteTimer.current) clearTimeout(armedDeleteTimer.current)
    if (armedDeleteKey !== key) {
      setArmedDeleteKey(key)
      armedDeleteTimer.current = setTimeout(() => setArmedDeleteKey(prev => (prev === key ? null : prev)), 3000)
      return
    }
    setArmedDeleteKey(null)
    void action()
  }

  // Fix — food/exercise preferences have two competing stores: this is now
  // the ONE editable list for hard food dislikes, whether created here or
  // by "I hate marmite" in chat — both call the same createFact shape, so
  // both land as one row here. Excluded from the generic FOOD PREFERENCES
  // card group below (via `grouped`) so nothing renders twice.
  // Every food dislike, not only the hard-worded ones. Filtering to 'hard'
  // left a softly-filed ban enforced but ABSENT from the list of what is
  // banned, so the two halves of this screen disagreed about the same row.
  const hardFoodDislikes = facts.filter(f => f.kind === 'food_preference' && f.polarity === 'dislike')
  const hardFoodDislikeValues = hardFoodDislikes.map(f => f.resolved_refs?.[0] ?? f.display_text)

  const saveDislikedFoods = async (next: string[]) => {
    if (!profileId) return
    const added = next.filter(v => !hardFoodDislikeValues.includes(v))
    const removed = hardFoodDislikes.filter(f => !next.includes(f.resolved_refs?.[0] ?? f.display_text))
    await Promise.all([
      ...added.map(v => createFact({
        profileId, kind: 'food_preference', source: 'manual',
        rawPhrase: v, displayText: `won't eat/do ${v}`,
        polarity: 'dislike', hardness: 'hard', resolvedRefs: resolveFoodTarget(v),
      })),
      ...removed.map(f => deleteFactPermanently(f.id)),
    ])
    await reload()
    await onMemoryChanged()
  }

  const grouped = (['food_preference', 'exercise_preference', 'timing_rule', 'hard_constraint'] as const)
    .map(kind => ({
      kind,
      // Must exclude exactly what hardFoodDislikes now INCLUDES, or a softly
      // filed dislike renders twice — once in the "won't eat" list and again
      // here. Caught by the gate the moment that list widened.
      items: facts.filter(f => f.kind === kind && !(kind === 'food_preference' && f.polarity === 'dislike')),
    }))
    .filter(g => g.items.length > 0)

  // Editing a field here does NOT recompute macros/targets (no computeTargets/
  // setMacros call) — matches Memory's own edits, which never recomputed
  // anything either. This screen corrects/maintains profile data; live
  // target recalculation off an arbitrary field edit is a separate feature.
  //
  // Fix 0.11 — this used to be pure fire-and-forget: the optimistic
  // onProfileChanged() applied unconditionally and the write's outcome was
  // never observed, so an offline/failed save looked identical to a
  // successful one for the rest of the session and only reverted silently
  // on the next launch. Now the write's rejection reverts the optimistic
  // patch back to the pre-edit values (read from `profile`, captured before
  // the optimistic apply) and surfaces a dismissible error, matching every
  // other confirm-action in this app.
  /**
   * Stored injuries, split into the ones the plan engine acts on and the ones
   * it doesn't. Recomputed on every render from `profile.injuries` rather than
   * held in state, so a save (or its revert) is reflected without a second
   * source of truth to keep in step.
   */
  const { codes: injuryCodes, unrecognised: unrecognisedInjuries } = partitionInjuries(profile.injuries ?? [])

  // --- Your data (audit §1.4) -------------------------------------------
  const [dataBusy, setDataBusy] = useState<'export' | 'delete' | null>(null)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const handleDownloadData = async () => {
    if (!profileId) return
    setDataBusy('export')
    setExportNote(null)
    try {
      const exported = await buildDataExport(profileId)
      downloadExport(exported)
      const { total } = summariseExport(exported)
      // An export that quietly omitted a table would be a lie about
      // completeness, so a partial read says so rather than reporting a
      // clean number.
      setExportNote(exported.incomplete.length > 0
        ? `Downloaded ${total} records. ${exported.incomplete.length} part${exported.incomplete.length === 1 ? '' : 's'} couldn't be read — they're listed inside the file.`
        : `Downloaded ${total} records.`)
    } catch (err) {
      console.error('Data export failed:', err)
      setExportNote("Couldn't gather your data — check your connection and try again.")
    } finally {
      setDataBusy(null)
    }
  }

  const handleDeleteEverything = async () => {
    if (!profileId || deleteConfirm.trim().toLowerCase() !== 'delete') return
    setDataBusy('delete')
    const result = await deleteAllUserData(profileId)
    setDataBusy(null)
    if (!result.ok) {
      setSaveError(`Couldn't delete your data — ${result.error ?? 'try again'}.`)
      return
    }
    // The rows are gone; the browser must not keep pointing at them. Reload
    // rather than unwinding App's state by hand — every store, cache and
    // queue is keyed by a profile that no longer exists, and a fresh load is
    // the only state that is honestly consistent.
    //
    // No key-clearing here on purpose. restoreSession already handles "the
    // stored id has no row": it removes the key and drops to onboarding. A
    // second list of keys to clear, living beside handleReset's, is exactly
    // the duplicated rule test:reset-clears-draft exists to prevent — and it
    // would be the copy that goes stale first, because deletion is the path
    // nobody exercises.
    onOpenChange(false)
    window.location.reload()
  }

  const savePatch = (patch: Partial<UserProfile>) => {
    if (!profileId) return
    const revertPatch = Object.fromEntries(
      Object.keys(patch).map(k => [k, profile[k as keyof UserProfile]])
    ) as Partial<UserProfile>
    // Computed BEFORE the merge, against the profile as it was. Comparing the
    // patch to an already-updated profile would find no change and offer
    // nothing, which is how this fix would silently do nothing at all.
    const invalidation = detectPlanInvalidation(profile, patch)
    onProfileChanged(patch)
    updateProfileField(profileId, patch).then(() => {
      // Only once the write actually lands. Offering to rebuild around an
      // injury whose save then failed would rebuild the plan around something
      // the database does not know about.
      if (invalidation) onPlanInvalidated?.(invalidation)
    }).catch(err => {
      console.error('Profile field save failed — reverting', err)
      onProfileChanged(revertPatch)
      setSaveError("Couldn't save that change — it's been reverted. Check your connection and try again.")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Everything the app knows about you — correct or remove anything here.</DialogDescription>
        </DialogHeader>

        {saveError && (
          <InsightBanner tone="warning" className="items-start justify-between">
            <span>{saveError}</span>
            <button type="button" onClick={() => setSaveError(null)} className="shrink-0 text-xs font-semibold underline">
              Dismiss
            </button>
          </InsightBanner>
        )}

        <AppearanceSection appearance={appearance} />

        <Separator />

        {/* Identity & metrics */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity &amp; metrics</h3>
          <div className="rounded-md border p-2.5 space-y-2 text-sm">
            <Row label="Name"><EditableStringField value={profile.display_name} placeholder="Not set" onSave={v => savePatch({ display_name: v })} /></Row>
            <Row label="Age"><EditableTextField value={profile.age} unit="years" min={13} max={100} onSave={n => savePatch({ age: n })} /></Row>
            <Row label="Gender"><EditableSelectField value={profile.gender} options={GENDER_OPTIONS as { value: 'male' | 'female'; label: string }[]} onSave={v => savePatch({ gender: v })} /></Row>
            <Row label="Height"><EditableTextField value={profile.height_cm} unit="cm" min={100} max={250} onSave={n => savePatch({ height_cm: n })} /></Row>
            <Row label="Onboarding weight"><EditableTextField value={profile.weight_kg} unit="kg" min={25} max={350} onSave={n => savePatch({ weight_kg: n })} /></Row>
            <Row label="Current weight">
              <span className="text-sm">{latestWeightKg != null && latestWeightKg > 0 ? `${latestWeightKg} kg` : 'Log a weigh-in on Dashboard'}</span>
            </Row>
          </div>
        </div>

        {/* Training setup */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Training setup</h3>
          <div className="rounded-md border p-2.5 space-y-2 text-sm">
            {/* The three gym-only fields below are optional on UserProfile (an
                activity-format profile has no equipment tier or lifting style).
                The `??` here is display-only — an activity profile shows the
                same neutral placeholder any unset field would, rather than
                these rows vanishing mid-edit. */}
            <Row label="Experience"><EditableSelectField value={profile.training_experience ?? ''} options={EXPERIENCE_OPTIONS} onSave={v => savePatch({ training_experience: v as TrainingExperience })} /></Row>
            <Row label="Equipment"><EditableSelectField value={profile.equipment_access ?? ''} options={EQUIPMENT_OPTIONS} onSave={v => savePatch({ equipment_access: v as EquipmentAccess })} /></Row>
            <div className="space-y-1">
              <span className="text-muted-foreground">Training days</span>
              <TrainingDaysEditor days={profile.training_days} onSave={v => savePatch({ training_days: v })} />
            </div>
            <Row label="Session length"><EditableSelectField value={profile.session_duration_preference} options={DURATION_OPTIONS} onSave={v => savePatch({ session_duration_preference: v })} /></Row>
            <Row label="Style"><EditableSelectField value={profile.training_style ?? ''} options={STYLE_OPTIONS} onSave={v => savePatch({ training_style: v as TrainingStyle })} /></Row>
            <Row label="Activity level"><EditableSelectField value={profile.activity_level} options={ACTIVITY_OPTIONS} onSave={v => savePatch({ activity_level: v })} /></Row>
            {/* Directly under Activity level, because that is what it
                overrides. The placeholder shows the band that activity level
                produces, so leaving it alone is visibly a choice rather than
                an empty field — and someone who types the same number is not
                changing anything they weren't already getting. */}
            <Row label="Daily steps">
              <EditableTextField
                value={profile.daily_step_target ?? undefined}
                unit="steps"
                min={1000}
                max={50000}
                placeholder={`${derivedStepsTargetFor(profile.activity_level).toLocaleString()} (from activity level)`}
                onSave={n => savePatch({ daily_step_target: n })}
              />
            </Row>
            <Row label="Recovery capacity"><EditableSelectField value={profile.recovery_capacity} options={RECOVERY_OPTIONS} onSave={v => savePatch({ recovery_capacity: v })} /></Row>
            <Row label="Conditioning"><EditableSelectField value={profile.conditioning_preference} options={CONDITIONING_PREF_OPTIONS} onSave={v => savePatch({ conditioning_preference: v })} /></Row>
          </div>
        </div>

        {/* Injuries — a picker, for the same reason the dietary restrictions
            above are one. Audit §2.2: this was free text, and the plan engine
            only understands eight exact codes, so twelve of fourteen ordinary
            entries were stored, shown back, and changed nothing. "Lower back"
            — the field's own placeholder — was one of them. */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Injuries</h3>
          <div className="rounded-md border p-2.5 space-y-2.5 text-sm">
            <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">Areas to work around. Picking one changes which exercises your plan gives you.</p>
            <ToggleGroup
              type="multiple"
              value={injuryCodes}
              onValueChange={(next: string[]) => savePatch({ injuries: [...next, ...unrecognisedInjuries] })}
              className="flex flex-wrap justify-start gap-1.5"
            >
              {INJURY_OPTIONS.map(o => (
                <ToggleGroupItem
                  key={o.value}
                  value={o.value}
                  className="h-8 rounded-full border px-2.5 text-[0.6875rem] data-[state=on]:border-primary data-[state=on]:text-primary"
                >
                  {o.icon} {o.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {unrecognisedInjuries.length > 0 && (
              /* Kept, not deleted. These were typed when the field was free
                 text; they never changed the plan, and quietly removing them
                 would be the same silent discarding this fix is about. Said
                 plainly, with a way to clear each one. */
              <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid var(--hairline)' }}>
                <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">
                  These are saved but don't change your plan — the app can only work around the areas above. Tell your Personal TrAIner in Chat about anything else.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unrecognisedInjuries.map((v: string) => (
                    <span key={v} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[0.6875rem] text-muted-foreground">
                      {v}
                      <button
                        type="button"
                        aria-label={`Remove ${v}`}
                        className="hit-slop-44 text-muted-foreground hover:text-foreground"
                        onClick={() => savePatch({ injuries: [...injuryCodes, ...unrecognisedInjuries.filter((u: string) => u !== v)] })}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dietary & cooking */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dietary &amp; cooking</h3>
          <div className="rounded-md border p-2.5 space-y-3 text-sm">
            {/* Dietary-safety round 2 — the two lanes are now visibly
                different things, and only the canonical one is pickable.
                This was free text before, which let a user type an
                unenforceable value ("shellfish") that looked saved and did
                nothing. Copy explains the difference in strength without a
                word about tags or the food database. */}
            <div ref={dietaryRef} className="space-y-1.5">
              <span className="text-muted-foreground">Dietary restrictions</span>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">Diets and allergies the app enforces when building your meals.</p>
              <ToggleGroup
                type="multiple"
                value={profile.dietary_preferences}
                onValueChange={(next: string[]) => savePatch({ dietary_preferences: next })}
                className="flex flex-wrap justify-start gap-1.5"
              >
                {DIETARY_OPTIONS.map(o => (
                  <ToggleGroupItem
                    key={o.value}
                    value={o.value}
                    className="h-8 rounded-full border px-2.5 text-[0.6875rem] data-[state=on]:border-primary data-[state=on]:text-primary"
                  >
                    {o.icon} {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground">Foods to avoid</span>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">Anything else you'd rather not see. Matched by name.</p>
              <EditableTagList values={hardFoodDislikeValues} onSave={saveDislikedFoods} placeholder="e.g. mushrooms" />
            </div>
            {/* Honesty-copy round — applies to BOTH fields above (the
                canonical picker's tag-based checks AND the free-text
                avoid-list's literal name match, which has its own blind spot:
                no synonym expansion, so "sesame" doesn't catch "tahini").
                Deliberately placed after both, with a hairline rule, rather
                than nested inside the picker's own div — nested there it read
                as belonging only to the ToggleGroup, at the same space-y-3 gap
                as every other unrelated field in this card, which risked
                being misread as "the avoid-list doesn't have this limitation." */}
            <p className="pt-2 text-[0.6875rem] leading-snug text-muted-foreground/70" style={{ borderTop: '1px solid var(--hairline)' }}>
              These filters check ingredients we recognise. We can't check brands,
              preparation, or cross-contamination. If you have a food allergy,
              always check ingredients yourself.
            </p>
            <div className="space-y-1">
              <span className="text-muted-foreground">Favorite cuisines</span>
              <EditableTagList values={profile.favorite_cuisines ?? []} onSave={v => savePatch({ favorite_cuisines: v })} placeholder={`e.g. ${FAVORITE_CUISINE_OPTIONS[0]?.label ?? 'Italian'}`} />
            </div>
            <Row label="Cooking time"><EditableSelectField value={profile.cooking_time_preference ?? 'moderate'} options={COOKING_TIME_OPTIONS} onSave={v => savePatch({ cooking_time_preference: v })} /></Row>
            <Row label="Meals per day"><EditableSelectField value={profile.meals_per_day ?? 3} options={MEALS_PER_DAY_OPTIONS} onSave={v => savePatch({ meals_per_day: v })} /></Row>
            <Row label="Include snacks">
              <Button size="sm" variant={profile.include_snacks ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => savePatch({ include_snacks: !profile.include_snacks })}>
                {profile.include_snacks ? 'Yes' : 'No'}
              </Button>
            </Row>
            <Row label="Breakfast style"><EditableSelectField value={profile.breakfast_style ?? 'cooked'} options={BREAKFAST_STYLE_OPTIONS} onSave={v => savePatch({ breakfast_style: v })} /></Row>
          </div>
        </div>

        <Separator />

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {goals.length > 0 && (
          <div ref={goalsRef} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goals</h3>
            {/* SETTING a goal weight lives here now, next to where a set one
                already appeared. It used to be an input row on the dashboard —
                the only place to create one was a screen it did not belong on,
                and it cost the home screen an input box permanently for
                something people do once. Shown only when there is no body-weight
                goal yet, same condition the dashboard used. */}
            {(() => {
              // THE BASELINE HAS TO BE REAL. A goal weight stores where you
              // started, and computeGoalProgress measures against it — so
              // `?? 0` would have written a fabricated starting weight of zero
              // for anyone who has not weighed in and never stated a weight,
              // and every percentage off it would have been nonsense. Latest
              // weigh-in first, then the weight given at onboarding, and if
              // there is neither, say so instead of inventing one.
              const baseline = latestWeightKg ?? profile.weight_kg ?? null
              const alreadySet = goals.some(g => g.metric === 'body_weight_kg' && g.status === 'active')
              if (!profileId || alreadySet) return null
              if (baseline == null) {
                return (
                  <p className="text-xs text-muted-foreground">
                    Log a weigh-in first — a goal weight needs a starting point to measure from.
                  </p>
                )
              }
              return (
                <GoalWeightSetter
                  profileId={profileId}
                  baselineKg={baseline}
                  onSet={async () => { await reload(); await onMemoryChanged() }}
                />
              )
            })()}
            {goals.map(g => {
              const progress = profileId ? computeGoalProgress(g, profileId, latestWeightKg ?? null) : { current: null, percent: null }
              return (
                <div key={g.id} className="rounded-md border p-2.5 space-y-1">
                  {editingId === g.id ? (
                    <div className="flex items-center gap-2.5">
                      <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveGoalEdit(g.id)} aria-label="Save this goal"><Check className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit} aria-label="Cancel editing"><X className="size-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{g.display_text}</span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(g.id, g.display_text)} aria-label={`Edit goal: ${g.display_text}`}><Pencil className="size-3" /></Button>
                        <Button
                          size="icon" variant="ghost"
                          className={armedDeleteKey === `goal:${g.id}` ? 'hit-slop-44 size-6 bg-destructive text-destructive-foreground' : 'hit-slop-44 size-6 text-destructive'}
                          onClick={() => requestDelete(`goal:${g.id}`, () => deleteGoal(g.id))}
                          aria-label={armedDeleteKey === `goal:${g.id}` ? 'Tap again to permanently delete this goal' : 'Delete goal'}
                        ><Trash2 className="size-3" /></Button>
                      </div>
                    </div>
                  )}
                  {g.status === 'needs_baseline' && <EffectLine text="Waiting on a baseline before this can be tracked" />}
                  {g.trackable === 'directional' && <EffectLine text="Directional — biases your plan, never reported as a tracked percentage" />}
                  {g.trackable === 'measurable' && g.status === 'active' && (
                    <div className="text-[0.6875rem] text-muted-foreground">
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

        {grouped.length > 0 && (
          <div ref={factsRef} className="space-y-4">
            {grouped.map(({ kind, items }) => (
              <div key={kind} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FACT_KIND_LABEL[kind]}</h3>
                {items.map(f => (
                  <div key={f.id} className="rounded-md border p-2.5 space-y-1">
                    {editingId === f.id ? (
                      <div className="flex items-center gap-2.5">
                        <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                        <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveFactEdit(f.id)} aria-label="Save this note"><Check className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit} aria-label="Cancel editing"><X className="size-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{f.display_text}</span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {f.hardness && <Badge variant="outline" className="text-[0.5625rem] px-1 py-0">{f.hardness}</Badge>}
                          <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(f.id, f.display_text)} aria-label={`Edit note: ${f.display_text}`}><Pencil className="size-3" /></Button>
                          <Button
                            size="icon" variant="ghost"
                            className={armedDeleteKey === `fact:${f.id}` ? 'hit-slop-44 size-6 bg-destructive text-destructive-foreground' : 'hit-slop-44 size-6 text-destructive'}
                            onClick={() => requestDelete(`fact:${f.id}`, () => deleteFact(f.id))}
                            aria-label={armedDeleteKey === `fact:${f.id}` ? 'Tap again to permanently delete this fact' : 'Delete fact'}
                          ><Trash2 className="size-3" /></Button>
                        </div>
                      </div>
                    )}
                    <EffectLine text={factEffect(f)} />
                    <ProvenanceBadge source={f.source} createdAt={f.created_at} />
                  </div>
                ))}
              </div>
            ))}
            <Separator className="my-2" />
          </div>
        )}

        {contextFacts.length > 0 && (
          <div ref={contextRef} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tone &amp; context</h3>
            <div>
            <p className="text-sm font-medium">Chat reveal speed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">How fast your Personal TrAIner's replies type out — Off shows them instantly</p>
            <div className="mt-3 flex gap-[3px] rounded-xl bg-background p-[3px]">
              {(['off', 'slow', 'normal', 'fast'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={revealSpeed === level}
                  onClick={() => onRevealSpeedChange(level)}
                  className={`h-[38px] flex-1 rounded-[9px] text-[0.8125rem] capitalize transition-colors ${
                    revealSpeed === level
                      ? 'font-semibold text-[color:var(--primary-foreground)] glow-mint-box'
                      : 'text-muted-foreground'
                  }`}
                  style={revealSpeed === level ? { background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' } : undefined}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[0.71875rem] leading-[1.5] text-muted-foreground/80">
              Reduced-motion system settings always show replies instantly, regardless of this choice.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Show times in chat</p>
              <p className="mt-0.5 text-xs text-muted-foreground">A small time under each message</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={chatTimestamps}
              aria-label="Show times in chat"
              onClick={() => onChatTimestampsChange(!chatTimestamps)}
              className={`hit-slop-44 relative h-7 w-12 shrink-0 rounded-full transition-colors ${chatTimestamps ? 'bg-primary glow-mint-box' : 'bg-[color:var(--surface-raised)]'}`}
            >
              <span className={`absolute top-1 size-5 rounded-full bg-[color:var(--foreground)] transition-[left] ${chatTimestamps ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
            {contextFacts.map(c => (
              <div key={c.id} className="rounded-md border p-2.5 space-y-1">
                {editingId === c.id ? (
                  <div className="flex items-center gap-2.5">
                    <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                    <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveContextEdit(c.id)} aria-label="Save this note"><Check className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit} aria-label="Cancel editing"><X className="size-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{c.display_text}</span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(c.id, c.display_text)} aria-label={`Edit note: ${c.display_text}`}><Pencil className="size-3" /></Button>
                      <Button
                        size="icon" variant="ghost"
                        className={armedDeleteKey === `context:${c.id}` ? 'hit-slop-44 size-6 bg-destructive text-destructive-foreground' : 'hit-slop-44 size-6 text-destructive'}
                        onClick={() => requestDelete(`context:${c.id}`, () => deleteContext(c.id))}
                        aria-label={armedDeleteKey === `context:${c.id}` ? 'Tap again to permanently delete this' : 'Delete'}
                      ><Trash2 className="size-3" /></Button>
                    </div>
                  </div>
                )}
                <EffectLine text="Shapes how your Personal TrAIner talks to you — never your plan" />
                <ProvenanceBadge source={c.source} createdAt={c.created_at} />
              </div>
            ))}
          </div>
        )}

        {!loading && goals.length === 0 && grouped.length === 0 && contextFacts.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing recorded yet — state a preference, goal, or constraint in chat and it'll show up here.</p>
        )}

        <Separator />

        {/* Audit §1.4 — there was neither of these. "New Plan" cleared the
            browser and started fresh without deleting a single row, so
            everything from before it stayed in the database permanently,
            unreachable. Both are obligations once there are users who aren't
            Ashley, and both are far easier to build now than after someone
            asks for them in writing. */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your data</h3>
          <div className="rounded-md border p-2.5 space-y-3 text-sm">
            <div className="space-y-1.5">
              <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">
                Everything the app has stored about you, as one file.
              </p>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleDownloadData} disabled={dataBusy !== null}>
                {dataBusy === 'export' ? 'Gathering…' : 'Download my data'}
              </Button>
              {exportNote && <p className="text-[0.6875rem] leading-snug text-muted-foreground">{exportNote}</p>}
            </div>

            <div className="space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">
                Deleting removes your plan, your meals, every weigh-in and logged set, and your whole chat history. It cannot be undone, and there is no copy.
              </p>
              {!deleteArmed ? (
                <Button
                  size="sm" variant="outline"
                  className="h-8 text-xs text-destructive border-destructive/40"
                  onClick={() => { setDeleteArmed(true); setDeleteConfirm('') }}
                >
                  Delete everything
                </Button>
              ) : (
                /* A typed confirmation, not a second tap. Arm-then-tap is
                   right for deleting one remembered note; it is far too easy
                   for the one action in this app that destroys everything and
                   cannot be undone. */
                <div className="space-y-2">
                  <label className="block text-[0.6875rem] leading-snug">
                    Type <span className="font-semibold">delete</span> to confirm.
                    <Input
                      value={deleteConfirm}
                      onChange={e => setDeleteConfirm(e.target.value)}
                      placeholder="delete"
                      aria-label="Type delete to confirm"
                      className="mt-1 h-8 text-sm"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteConfirm.trim().toLowerCase() !== 'delete' || dataBusy !== null}
                      onClick={handleDeleteEverything}
                    >
                      {dataBusy === 'delete' ? 'Deleting…' : 'Delete everything, permanently'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDeleteArmed(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
