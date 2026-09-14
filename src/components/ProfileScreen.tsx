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
import { Pencil, Trash2, Check, X, Plus, ChevronDown } from 'lucide-react'
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
  EXPERIENCE_OPTIONS, EQUIPMENT_OPTIONS, STYLE_OPTIONS, RECOVERY_OPTIONS, START_PREFERENCE_OPTIONS,
  CONDITIONING_PREF_OPTIONS, ACTIVITY_OPTIONS, DIETARY_OPTIONS, FAVORITE_CUISINE_OPTIONS,
  INJURY_OPTIONS, COOKING_TIME_OPTIONS, MEALS_PER_DAY_OPTIONS, DURATION_OPTIONS, BREAKFAST_STYLE_OPTIONS,
  DAYS_FULL, partitionInjuries, GOAL_OPTIONS,
} from '@/lib/onboarding-slots'
import { detectPlanInvalidation, type PlanInvalidation } from '@/lib/plan-invalidation'
import { getShopDay, setShopDay, defaultShopDay, DAY_NAMES, type DayName } from '@/lib/shop-day-store'
import type { UserProfile, TrainingDay, TrainingExperience, EquipmentAccess, TrainingStyle, WorkoutDay, StartPreference } from '@/lib/types'
import { describeActivity } from '@/lib/concurrent-activity'
import { resolveExerciseName } from '@/lib/set-parse'
import { resolveExerciseDislike } from '@/lib/fact-compiler'
import { buildDataExport, downloadExport, summariseExport, deleteAllUserData } from '@/lib/user-data'

const GENDER_OPTIONS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]

// THEME/ACCENT tables moved to src/lib/appearance-palette.ts — the settings
// sheet is no longer the only reader (the live preview needs them too), and
// they now carry the light-canvas flag and the dark accent step.
// The canonical day ordering now comes from the shared slot module rather
// than a second hand-typed copy that could drift.
const DAY_ORDER = DAYS_FULL

/**
 * "Work it out for me" is a real option, not a null wearing a label: it is the
 * derived default (the day before the week's first training day), and it moves
 * with the plan. Naming the day it currently resolves to means the row says
 * what will actually happen rather than only what the setting is.
 */
const SHOP_DAY_OPTIONS = (plan: WorkoutDay[] | undefined) => [
  { value: 'auto', label: 'Work it out for me', description: `Currently ${defaultShopDay(plan)} — the day before your week starts` },
  ...DAY_NAMES.map(d => ({ value: d, label: d, description: `Shop on ${d}` })),
]

/** Her stored choice, or 'auto' when she has not made one. */
function readShopDayChoice(): string {
  // getShopDay falls back to the derived day, which is indistinguishable from
  // a choice — so the picker asks whether a choice EXISTS by comparing the two
  // against a plan-less derivation. Cheap, and it keeps the store's own
  // "unset" meaning in one place rather than exporting a second reader.
  const stored = getShopDay(undefined)
  return stored === defaultShopDay(undefined) ? 'auto' : stored
}

interface ProfileScreenProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserProfile
  /** For the shopping-day picker's automatic option — the day before the week's first training day. */
  exercisePlan?: WorkoutDay[]
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
  /**
   * Fired after a corrected implement ceiling is SAVED — the three numbers
   * that cap every prescribed weight.
   *
   * Separate from `onPlanInvalidated` on purpose, and the separation is the
   * point: those fields invalidate the PLAN (which exercises it holds) and end
   * in a confirm dialog. A ceiling invalidates only the WEIGHTS, and Ashley's
   * ruling of 13 Sep 2026 was to apply it rather than ask — the same shape
   * ceiling-reconcile already runs on. Reporting it the same way would put a
   * "Rebuild my plan" dialog in front of a change that must not rebuild
   * anything.
   */
  onCeilingsCorrected?: (corrected: Partial<UserProfile>) => void
  /** Fired after any memory (goal/fact/context) edit/delete — same contract MemoryScreen had. */
  onMemoryChanged: () => void | Promise<void>
  /** Chat receipt deep-links land here, scrolled to the relevant memory section. 'dietary' — surfacing round — is where the meal-plan "unrecognised restriction" banner's "Open Profile" button lands. */
  initialSection?: 'goals' | 'facts' | 'context' | 'dietary'
  /** Chat typewriter reveal-speed preference — see reveal-speed-store.ts. */
  revealSpeed: RevealSpeed
  onRevealSpeedChange: (speed: RevealSpeed) => void
  /** Opens App.tsx's existing New Plan confirm dialog — the footer's only job. */
  onNewPlan: () => void
}

// ---- Shared small field-row components (scoped to this screen) -----------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      <span className="shrink-0 text-[0.875rem] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/**
 * ONE OF FOUR. Profile used to be eight headings and every editor in the app
 * open at once — about six screens of controls, most of them set once. The
 * design handoff's answer is four named groups you drill into; this is that,
 * with the existing editors moved inside unchanged rather than rebuilt as
 * sub-screens (there are none, and `initialSection` is a scroll-to-ref, not a
 * route).
 *
 * `forceOpen` is what keeps that ref working: a section somebody was sent
 * here to fix ("your dietary restrictions can't be enforced") must not land
 * inside a collapsed group, which would scroll to nothing.
 */
function Group({
  label, forceOpen, children,
}: { label: string; forceOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const isOpen = open || !!forceOpen
  return (
    <div style={{ borderTop: '1px solid var(--hairline)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={isOpen}
        className="hit-slop-44 flex w-full items-center justify-between gap-2 py-3 text-left"
      >
        <span className="ds-label">{label}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-primary-text transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div hidden={!isOpen} className="pb-4 space-y-4">{children}</div>
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
        // 44px, NOT 28px, AND AN INPUT IS THE ONE CONTROL THAT CANNOT CHEAT
        // THIS. The app's tap-target bar is a 44px thumb reach, and 68
        // controls meet it with `hit-slop-44`, which expands the touch area
        // via ::after without changing the layout. ::after does not render on
        // a replaced element, so an input has no such escape: its reach IS
        // its height. Probed at 390x844 on the three weight-cap rows, all
        // three were 28px and two of the three lost a tap to the dead space
        // of a neighbouring row. Lifts every numeric Profile row — age,
        // height, onboarding weight, daily steps — which had the same defect
        // and had never been measured, because ProfileScreen was mounted in
        // no browser harness until 13 Sep 2026.
        className={placeholder ? 'h-11 w-44 text-sm text-right' : 'h-11 w-20 text-sm text-right'}
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

/**
 * value may be undefined — see EditableTextField. Renders unselected, still choosable.
 *
 * Options carrying a `description` show it under the label IN THE OPEN LIST.
 * Roadmap item 11: changing your equipment here used to offer four bare words
 * ("Minimalist"), while onboarding showed the same four with a description
 * beside each — so the one screen where you CHANGE the answer was the one that
 * told you least about it. The trigger stays label-only (see SelectItem).
 */
function EditableSelectField<T extends string | number>({
  value, options, onSave,
}: { value?: T; options: { value: T; label: string; description?: string }[]; onSave: (v: T) => void }) {
  return (
    <Select value={value == null ? undefined : String(value)} onValueChange={v => {
      const match = options.find(o => String(o.value) === v)
      if (match) onSave(match.value)
    }}>
      <SelectTrigger className="h-7 w-auto text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={String(o.value)} value={String(o.value)} hint={o.description}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * THE TYPED WORD SURVIVES A FAILED SAVE.
 *
 * This renders the "Foods to avoid" list, among others, and until 5 Sep 2026
 * `add` cleared the input before the save had even been awaited — `onSave`
 * returned `void`, so a rejected write was an unhandled promise rejection and
 * nothing else. Someone typing "shellfish" on a bad connection watched the box
 * empty, saw no tag, saw no error, and had every reason to read that as the
 * app having taken it. On this particular field that reading is dangerous.
 *
 * So the input is cleared only once the save resolves, the button is held
 * while it is in flight (which also stops a double-tap writing twice), and a
 * rejection leaves the word exactly where the user typed it. The caller is
 * responsible for the message — see saveDislikedFoods and savePatch, which
 * both put one in this screen's existing error banner.
 */
function EditableTagList({
  values, onSave, placeholder,
}: { values: string[]; onSave: (next: string[]) => void | Promise<void>; placeholder: string }) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const add = async () => {
    const v = input.trim()
    if (!v || values.includes(v)) { setInput(''); return }
    setSaving(true)
    try {
      await onSave([...values, v])
      setInput('')
    } catch {
      // Left in the box on purpose. The caller has shown the error; retyping
      // a word you already typed is the thing this avoids.
    } finally {
      setSaving(false)
    }
  }
  const remove = async (v: string) => {
    setSaving(true)
    // Nothing to preserve on a removal — the tag stays visible because
    // `values` only changes once the caller's reload confirms it did.
    try { await onSave(values.filter(x => x !== v)) } catch { /* caller surfaces it */ }
    finally { setSaving(false) }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-2.5 gap-y-2.5">
        {values.map(v => (
          <Badge key={v} variant="secondary" className="text-[0.625rem] gap-1 pr-1">
            {v}
            <button type="button" onClick={() => void remove(v)} disabled={saving} aria-label={`Remove ${v}`} className="hit-slop-44 disabled:opacity-50"><X className="size-2.5" /></button>
          </Badge>
        ))}
        {values.length === 0 && <span className="text-xs text-muted-foreground/70">None yet</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void add() }}
          placeholder={placeholder}
          className="h-7 text-xs flex-1 min-w-0"
        />
        <Button size="icon" variant="outline" aria-label="Add" className="size-7 shrink-0" onClick={() => void add()} disabled={!input.trim() || saving}>
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

export function ProfileScreen({ open, onOpenChange, profile, latestWeightKg, onProfileChanged, onPlanInvalidated, onCeilingsCorrected, onMemoryChanged, initialSection, revealSpeed, onRevealSpeedChange, onNewPlan, exercisePlan }: ProfileScreenProps) {
  // Read once on mount: the store is the owner, this is the control's echo of
  // it. `null` means she has not chosen, which the picker shows as automatic.
  const [shopDayChoice, setShopDayChoice] = useState<string>(() => readShopDayChoice())
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

  /**
   * SAFETY-ADJACENT, AND IT SAYS SO WHEN IT FAILS.
   *
   * This is the write behind "Foods to avoid". Every one of these calls can
   * reject, and none of them was caught — so a failed add left no tag, no
   * message, and an empty input box, which reads as success. Under CLAUDE.md
   * this is dietary enforcement, and the one thing it must never do is let
   * someone believe a food is excluded when the app has no record of it.
   *
   * The reload runs whether or not the writes landed, because Promise.all can
   * fail with some of them already applied and the list has to show what is
   * actually stored, not what was attempted. Then it rethrows, which is what
   * keeps the typed word in the box for a retry.
   */
  const saveDislikedFoods = async (next: string[]) => {
    if (!profileId) return
    const added = next.filter(v => !hardFoodDislikeValues.includes(v))
    const removed = hardFoodDislikes.filter(f => !next.includes(f.resolved_refs?.[0] ?? f.display_text))
    try {
      await Promise.all([
        ...added.map(v => createFact({
          profileId, kind: 'food_preference', source: 'manual',
          rawPhrase: v, displayText: `won't eat/do ${v}`,
          polarity: 'dislike', hardness: 'hard', resolvedRefs: resolveFoodTarget(v),
        })),
        ...removed.map(f => deleteFactPermanently(f.id)),
      ])
    } catch (err) {
      console.error('Saving foods to avoid failed:', err)
      await reload().catch(() => {})
      await Promise.resolve(onMemoryChanged()).catch(() => {})
      setSaveError(
        added.length > 0
          ? "That wasn't saved, so it is NOT being avoided yet. Check your connection and add it again."
          : "That wasn't removed — it's still being avoided. Check your connection and try again.",
      )
      throw err
    }
    setSaveError(null)
    await reload()
    await onMemoryChanged()
  }

  /**
   * EXERCISES SHE NEVER WANTS TO SEE — added 14 Sep 2026, closing the half of
   * this the screen could not do.
   *
   * CLAUDE.md recorded exercise dislikes as `coach only`. Measured on 14 Sep,
   * that was half wrong: this screen already LISTS every exercise_preference
   * fact with edit and delete, so an existing one could always be changed or
   * removed here. What it could not do was ADD one — and the whole group is
   * hidden when there are none, so a first dislike had no screen route at all.
   * The accurate line was "edit and delete on both, add on the coach only",
   * and this closes it.
   *
   * THE SAME SHAPE AS "FOODS TO AVOID", deliberately: same component, same
   * create/delete pair, same failure handling. A dislike that silently failed
   * to save would leave someone believing an exercise is banned when the app
   * has no record of it — the exercise version of the one thing the dietary
   * list must never do.
   */
  const exerciseDislikes = facts.filter(f => f.kind === 'exercise_preference' && f.polarity === 'dislike')
  const exerciseDislikeValues = exerciseDislikes.map(f => f.resolved_refs?.[0] ?? f.display_text)

  const saveDislikedExercises = async (next: string[]) => {
    if (!profileId) return
    const added = next.filter(v => !exerciseDislikeValues.includes(v))
    const removed = exerciseDislikes.filter(f => !next.includes(f.resolved_refs?.[0] ?? f.display_text))

    // RESOLVED AGAINST THE CATALOGUE, NEVER STORED AS TYPED.
    //
    // The exclusion filter matches a FULL exercise name, case-insensitively
    // (exercise-plan.ts: `ex.toLowerCase() === e.name.toLowerCase()`). So
    // "squats" stored verbatim matches nothing the catalogue is called —
    // the tag would sit on this screen looking like a ban and never remove a
    // single exercise. A control that appears to work and does not is worse
    // than no control.
    //
    // AND AMBIGUITY IS A QUESTION, NOT A GUESS — the rule the coach's ban card
    // already follows, for the same reason and off the same resolver. "row"
    // resolves to "Rowing Machine", a cardio machine; banning it on a guess is
    // silent and permanent.
    const resolutions: { typed: string; name: string }[] = []
    for (const typed of added) {
      const out = resolveExerciseDislike(typed, resolveExerciseName)
      if (out.ok) { resolutions.push({ typed, name: out.name }); continue }
      setSaveError(out.reason)
      throw new Error('unresolved exercise dislike')
    }

    try {
      await Promise.all([
        ...resolutions.map(({ typed, name }) => createFact({
          profileId, kind: 'exercise_preference', source: 'manual',
          rawPhrase: typed, displayText: `won't do ${name}`,
          polarity: 'dislike', hardness: 'hard', resolvedRefs: [name],
        })),
        ...removed.map(f => deleteFactPermanently(f.id)),
      ])
    } catch (err) {
      console.error('Saving exercises to avoid failed:', err)
      await reload().catch(() => {})
      await Promise.resolve(onMemoryChanged()).catch(() => {})
      setSaveError(
        added.length > 0
          ? "That wasn't saved, so it is NOT being avoided yet. Check your connection and add it again."
          : "That wasn't removed — it's still being avoided. Check your connection and try again.",
      )
      throw err
    }
    setSaveError(null)
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

  /**
   * The three columns `statedCeilingKg` reads. Named once here rather than
   * spelled out at the comparison, so adding a fourth implement cannot leave
   * the re-price silently not firing for it.
   */
  const CEILING_FIELDS = ['max_dumbbell_kg', 'max_single_implement_kg', 'max_improvised_kg'] as const

  /**
   * Whether the three known lifts were ever answered. Onboarding asks them of
   * somebody skipping the calibration week and keeps any that were volunteered
   * otherwise, so "answered" is the honest test for showing the rows rather
   * than the skip flag alone.
   */
  const knownLiftsAnswered = profile.known_squat_kg != null
    || profile.known_bench_kg != null
    || profile.known_deadlift_kg != null

  const savePatch = (patch: Partial<UserProfile>) => {
    if (!profileId) return
    const revertPatch = Object.fromEntries(
      Object.keys(patch).map(k => [k, profile[k as keyof UserProfile]])
    ) as Partial<UserProfile>
    // Computed BEFORE the merge, against the profile as it was. Comparing the
    // patch to an already-updated profile would find no change and offer
    // nothing, which is how this fix would silently do nothing at all.
    const invalidation = detectPlanInvalidation(profile, patch)
    // A CORRECTED CEILING IS A DIFFERENT KIND OF WRONG. Compared here, before
    // the merge, for the same reason the invalidation is.
    const ceilingsMoved = CEILING_FIELDS.some(k => k in patch && patch[k] !== profile[k])
    onProfileChanged(patch)
    updateProfileField(profileId, patch).then(() => {
      // Only once the write actually lands. Offering to rebuild around an
      // injury whose save then failed would rebuild the plan around something
      // the database does not know about.
      if (invalidation) onPlanInvalidated?.(invalidation)
      if (ceilingsMoved) onCeilingsCorrected?.(patch)
    }).catch(err => {
      console.error('Profile field save failed — reverting', err)
      onProfileChanged(revertPatch)
      setSaveError("Couldn't save that change — it's been reverted. Check your connection and try again.")
    })
  }

  // "Fat loss · 4 days/week · Home gym" — read off the profile, never stored.
  // Every part is dropped rather than guessed at when its field is unset, so
  // an activity-format profile (no equipment tier) shows two facts, not a
  // blank where the third should be.
  const identitySummary = [
    GOAL_OPTIONS.find(o => o.value === profile.fitness_goal)?.label,
    // THE DAYS SHE TRAINS, NOT THE LENGTH OF THE ARRAY. training_days is
    // contractually ALWAYS seven entries with an `available` flag —
    // assembleProfile says so in as many words ("ALWAYS a 7-entry array, both
    // formats") — so `.length` is the constant 7 and this line read
    // "7 days/week" for every user in the app, whatever they actually train.
    // Found 13 Sep 2026 by reading a screenshot of a four-day profile.
    // ChatAssistant already counts it correctly; this was the copy that
    // didn't. Zero available still drops the clause, which is the existing
    // rule for a fact we don't have.
    profile.training_days?.filter(d => d.available).length
      ? `${profile.training_days.filter(d => d.available).length} days/week` : null,
    EQUIPMENT_OPTIONS.find(o => o.value === profile.equipment_access)?.label,
  ].filter(Boolean).join(' · ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader className="sr-only">
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Everything the app knows about you — correct or remove anything here.</DialogDescription>
        </DialogHeader>

        {/* WHO THIS IS, before the list of what it knows. The one-line
            summary underneath is read straight off the profile rather than
            stored: goal, days a week, equipment — the three answers that
            decide what every screen in the app shows. */}
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full text-[1.25rem] font-bold"
            style={{ background: 'color-mix(in oklab, var(--surface-raised) 50%, var(--surface-deep))' }}
          >
            {(profile.display_name?.trim()?.[0] ?? '·').toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[1.25rem] font-bold tracking-[-.02em]">
              {profile.display_name?.trim() || 'Your profile'}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{identitySummary}</p>
          </div>
        </div>

        {saveError && (
          <InsightBanner tone="warning" className="items-start justify-between">
            <span>{saveError}</span>
            <button type="button" onClick={() => setSaveError(null)} className="shrink-0 text-xs font-semibold underline">
              Dismiss
            </button>
          </InsightBanner>
        )}

        {/* FOUR GROUPS, and everything that used to be eight headings open at
            once now lives inside one of them. The editors themselves are
            unchanged — this is where they sit, not how they work. */}
        <Group label="You">
        {/* Identity & metrics */}
        <div className="space-y-2">
          <h3 className="ds-label">Identity &amp; metrics</h3>
          <div className="text-sm">
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
          <h3 className="ds-label">Training setup</h3>
          <div className="text-sm">
            {/* The three gym-only fields below are optional on UserProfile (an
                activity-format profile has no equipment tier or lifting style).
                The `??` here is display-only — an activity profile shows the
                same neutral placeholder any unset field would, rather than
                these rows vanishing mid-edit. */}
            <Row label="Experience"><EditableSelectField value={profile.training_experience ?? ''} options={EXPERIENCE_OPTIONS} onSave={v => savePatch({ training_experience: v as TrainingExperience })} /></Row>
            <Row label="Equipment"><EditableSelectField value={profile.equipment_access ?? ''} options={EQUIPMENT_OPTIONS} onSave={v => savePatch({ equipment_access: v as EquipmentAccess })} /></Row>
            {/* WHERE YOU'RE STARTING FROM — added 14 Sep 2026, on Ashley's
                instruction to close the setup answers that could never be
                changed afterwards. This one was the most consequential of them:
                starting-out.ts reads exactly this field to decide whether the
                app builds the easing-in walking plan or a training plan, so
                being stuck on the wrong answer meant being stuck on the wrong
                KIND of plan with no way to say so.

                It sits on the rebuild path with goal and style, not the
                re-price one, because it does not change a number — it changes
                which plan you have. detectPlanInvalidation offers the rebuild
                and nothing happens until the offer is accepted. */}
            <Row label="Starting from"><EditableSelectField
              value={profile.start_preference ?? ''}
              options={START_PREFERENCE_OPTIONS}
              onSave={v => savePatch({ start_preference: v as StartPreference })}
            /></Row>
            {/* WHAT YOU CAN LIFT — added 13 Sep 2026, beside Equipment
                because that is the field that decides whether these apply at
                all, and because they are the same kind of fact: what this
                person's training actually has available.

                NOT A FIFTH GROUP, though the first attempt made one.
                test:profile-groups pins exactly four, and it is right to:
                the design handoff's answer to "eight headings and every
                editor open at once" was four named groups, and a fifth for
                three rows would start the drift back. The gate blocked a
                change that should have fitted the design instead of bending
                it.

                These three were collected at setup and then locked — no way
                to see them, no way to correct them. They are not preferences:
                `statedCeilingKg` treats any number it finds as a HARD CLAMP
                on every prescribed weight (load-prescription.ts:818), so a
                wrong one quietly holds every session below what she can
                actually do, and she had no way to say so.

                ONLY FOR A TRAINEE WHOSE KIT IS LIMITED. `assembleProfile`
                discards all three for a full-gym answer
                (onboarding-slots.ts:1138) — "a FULL-GYM ANSWER DISCARDS
                THEM… writing it anyway would clamp a gym trainee to a home
                number for sixteen weeks". Offering the rows to a gym trainee
                would be a control that must not take effect. */}
            {profile.equipment_access !== 'full_gym' && (
              <div data-testid="stated-ceilings">
                <Row label="Heaviest dumbbell (per hand)">
                  <EditableTextField
                    value={profile.max_dumbbell_kg ?? undefined}
                    unit="kg" min={1} max={100}
                    onSave={n => savePatch({ max_dumbbell_kg: n, load_ceilings_declined: false })}
                  />
                </Row>
                <Row label="Heaviest single weight">
                  <EditableTextField
                    value={profile.max_single_implement_kg ?? undefined}
                    unit="kg" min={1} max={100}
                    onSave={n => savePatch({ max_single_implement_kg: n, load_ceilings_declined: false })}
                  />
                </Row>
                <Row label="What your backpack holds">
                  <EditableTextField
                    value={profile.max_improvised_kg ?? undefined}
                    unit="kg" min={1} max={60}
                    onSave={n => savePatch({ max_improvised_kg: n, load_ceilings_declined: false })}
                  />
                </Row>
                {/* A DECLINE IS A VALUE, NOT AN ABSENCE — the reason
                    load_ceilings_declined is its own column. Reversible from
                    here, because "I'm not sure" stops the app asking and
                    somebody who later finds out needs a way back in. */}
                {profile.load_ceilings_declined && (
                  <p className="pt-1 text-xs text-muted-foreground" data-testid="ceilings-declined">
                    You said you weren't sure what these weigh, so nothing is capped. Fill any of them
                    in and I'll use it.
                  </p>
                )}
              </div>
            )}

            {/* THE THREE KNOWN LIFTS — the last setup answers that could never
                be corrected. Added 14 Sep 2026 on Ashley's ruling: "rebuild
                only when it matters".
                ONLY SHOWN WHEN THEY WERE ASKED. Onboarding asks these of
                someone skipping the calibration week, or keeps whatever was
                volunteered. Rendering three empty boxes to somebody who was
                never asked would be a control that cannot take effect — the
                same rule the weight caps above follow for a full-gym profile. */}
            {(profile.skip_calibration_week || knownLiftsAnswered) && (
              <div data-testid="known-lifts" className="space-y-1">
                <Row label="Your squat">
                  <EditableTextField
                    value={profile.known_squat_kg ?? undefined}
                    unit="kg" min={20} max={400}
                    onSave={n => savePatch({ known_squat_kg: n })}
                  />
                </Row>
                <Row label="Your bench press">
                  <EditableTextField
                    value={profile.known_bench_kg ?? undefined}
                    unit="kg" min={20} max={300}
                    onSave={n => savePatch({ known_bench_kg: n })}
                  />
                </Row>
                <Row label="Your deadlift">
                  <EditableTextField
                    value={profile.known_deadlift_kg ?? undefined}
                    unit="kg" min={20} max={500}
                    onSave={n => savePatch({ known_deadlift_kg: n })}
                  />
                </Row>
                {/* HER RULING'S OTHER HALF, and it has to be on the screen or
                    the app is silently doing nothing. After a calibration week
                    the plan is anchored to what was actually lifted, so these
                    numbers are a record and correcting one changes no weight.
                    Saying so is the difference between "nothing happened" and
                    "nothing happened, and here is why". */}
                {!profile.skip_calibration_week && (
                  <p className="pt-1 text-xs text-muted-foreground" data-testid="known-lifts-record-only">
                    Your plan follows what you've actually lifted since your first week, so correcting
                    one of these updates the record and changes no weights.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <span className="text-muted-foreground">Training days</span>
              <TrainingDaysEditor days={profile.training_days} onSave={v => savePatch({ training_days: v })} />
            </div>
            {/* OTHER TRAINING — a second sport on a standing weekly schedule.
                Written by the coach (propose_concurrent_activity) and shown
                here so a stored activity is never invisible until someone
                asks about it. Adding stays chat-only: the coach is the
                surface that can ask which evenings. Removing is here, through
                the same armed delete every other row uses, and goes through
                savePatch so the plan-invalidation offer fires — the week was
                built AROUND this, so taking it away is a reason to rebuild. */}
            <div className="space-y-1">
              <span className="text-muted-foreground">Other training</span>
              {(profile.concurrent_activities ?? []).length === 0 ? (
                <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">None yet — tell your Personal TrAIner in chat ("I also do Muay Thai on Tuesday and Thursday evenings") and the plan is rebuilt around it.</p>
              ) : (
                <div className="flex flex-wrap gap-x-2.5 gap-y-2.5">
                  {(profile.concurrent_activities ?? []).map(a => {
                    const key = `activity:${a.name}`
                    return (
                      <Badge key={key} variant="secondary" className="text-[0.625rem] gap-1 pr-1">
                        {describeActivity(a)}
                        <button
                          type="button"
                          onClick={() => requestDelete(key, async () => { savePatch({ concurrent_activities: (profile.concurrent_activities ?? []).filter(x => x.name !== a.name) }) })}
                          aria-label={armedDeleteKey === key ? `Tap again to remove ${a.name}` : `Remove ${a.name}`}
                          className={`hit-slop-44 ${armedDeleteKey === key ? 'text-destructive' : ''}`}
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}
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

        </Group>

        <Group label="Nutrition" forceOpen={initialSection === 'dietary'}>
        {/* Dietary & cooking */}
        <div className="space-y-2">
          <h3 className="ds-label">Dietary &amp; cooking</h3>
          <div className="space-y-3 text-sm">
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
                    className="h-8 rounded-full border px-2.5 text-[0.6875rem] data-[state=on]:border-primary data-[state=on]:text-primary-text"
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
            {/* EXERCISES TO AVOID — the same control, the other side of the
                app. These become the same user_facts rows a "never give me
                burpees" chat turn produces, so the coach and the screen are
                writing to one place rather than two. */}
            <div className="space-y-1.5">
              <span className="text-muted-foreground">Exercises to avoid</span>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">Anything you'd rather never see in a session.</p>
              <EditableTagList values={exerciseDislikeValues} onSave={saveDislikedExercises} placeholder="e.g. burpees" />
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
            {/* WHICH DAY SHE SHOPS — design handoff 2d. The Home card is
                driven by it, and a card that appears on a day the app chose
                for her with no way to move it is the app being confidently
                wrong on the screen she opens first. Local, like the theme:
                see shop-day-store for why it is not a profile column.
                "Work it out for me" is a real option, not a null hiding as
                one — it is the derived default, and it moves with the plan. */}
            <Row label="Shopping day">
              <EditableSelectField
                value={shopDayChoice}
                options={SHOP_DAY_OPTIONS(exercisePlan)}
                onSave={v => { setShopDay(v === 'auto' ? null : v as DayName); setShopDayChoice(v as string) }}
              />
            </Row>
            <Row label="Breakfast style"><EditableSelectField value={profile.breakfast_style ?? 'cooked'} options={BREAKFAST_STYLE_OPTIONS} onSave={v => savePatch({ breakfast_style: v })} /></Row>
          </div>
        </div>

        </Group>

        {/* goals / facts / context ALL live in this group — every
            initialSection value except 'dietary' scrolls to a ref inside it,
            and a ref inside a collapsed group scrolls to nothing. */}
        <Group label="Personal TrAIner" forceOpen={initialSection === 'goals' || initialSection === 'facts' || initialSection === 'context'}>
        {/* INJURIES MOVED HERE, 6 Sep 2026. It sat between the training
            settings and the dietary ones, which put "my shoulder hurts"
            among the dropdowns. It belongs with the things the Personal
            TrAIner works around and remembers — the handoff's own grouping,
            and the honest one. The picker itself is untouched. */}
        {/* Injuries — a picker, for the same reason the dietary restrictions
            above are one. Audit §2.2: this was free text, and the plan engine
            only understands eight exact codes, so twelve of fourteen ordinary
            entries were stored, shown back, and changed nothing. "Lower back"
            — the field's own placeholder — was one of them. */}
        <div className="space-y-2">
          <h3 className="ds-label">Injuries</h3>
          <div className="space-y-2.5 text-sm">
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
                  className="h-8 rounded-full border px-2.5 text-[0.6875rem] data-[state=on]:border-primary data-[state=on]:text-primary-text"
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

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {goals.length > 0 && (
          <div ref={goalsRef} className="space-y-2">
            <h3 className="ds-label">Goals</h3>
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
                <h3 className="ds-label">{FACT_KIND_LABEL[kind]}</h3>
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

        {/* REPLY SPEED IS NOT A REMEMBERED FACT. It lived inside the
            `contextFacts.length > 0` branch below, so a trainee the coach had
            never stored a note about could not reach it at all — a preference
            control that appeared only once something unrelated existed.
            Hoisted out; the notes keep their own conditional block. */}
        <div className="space-y-2">
          <h3 className="ds-label">Tone</h3>
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
        </div>

        {contextFacts.length > 0 && (
          <div ref={contextRef} className="space-y-2">
            <h3 className="ds-label">Things it remembers about you</h3>
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

        </Group>

        <Group label="App">
        <AppearanceSection appearance={appearance} />

        {/* Audit §1.4 — there was neither of these. "New Plan" cleared the
            browser and started fresh without deleting a single row, so
            everything from before it stayed in the database permanently,
            unreachable. Both are obligations once there are users who aren't
            Ashley, and both are far easier to build now than after someone
            asks for them in writing. */}
        <div className="space-y-2">
          <h3 className="ds-label">Your data</h3>
          <div className="space-y-3 text-sm">
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
        </Group>

        {/* THE FOOTER. "New Plan" moved here from the gear menu — it is the
            most consequential thing a person can do from a settings surface
            (a brand-new profile row; the old plan, its adaptations and its
            history are left behind), and it sat in a dropdown between
            "Profile" and "Replay the tour" as if it were the same weight of
            action. Moved, not copied: the menu no longer offers it. The
            confirm dialog it opens is unchanged, and still names what is
            lost. */}
        <div className="pt-1" style={{ borderTop: '1px solid var(--hairline)' }}>
          <Button
            variant="outline"
            className="hit-slop-44 h-11 w-full border-destructive/40 text-destructive"
            onClick={() => { onOpenChange(false); onNewPlan() }}
          >
            Start a new plan…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
