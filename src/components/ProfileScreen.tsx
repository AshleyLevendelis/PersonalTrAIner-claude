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
import { updateProfileField } from '@/lib/profile-store'
import { useAppearance } from '@/hooks/useAppearance'
import type { ThemeName, AccentOverride } from '@/lib/appearance-store'
import type { RevealSpeed } from '@/lib/reveal-speed-store'
import {
  EXPERIENCE_OPTIONS, EQUIPMENT_OPTIONS, STYLE_OPTIONS, RECOVERY_OPTIONS,
  CONDITIONING_PREF_OPTIONS, ACTIVITY_OPTIONS, DIETARY_OPTIONS, FAVORITE_CUISINE_OPTIONS,
  INJURY_OPTIONS, COOKING_TIME_OPTIONS, MEALS_PER_DAY_OPTIONS, DURATION_OPTIONS, BREAKFAST_STYLE_OPTIONS,
  DAYS_FULL,
} from '@/lib/onboarding-slots'
import type { UserProfile, TrainingDay, TrainingExperience, EquipmentAccess, TrainingStyle } from '@/lib/types'

const GENDER_OPTIONS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]

// Turn 9 — swatch/gradient values lifted verbatim from the design doc's own
// 9c Settings preview and 9d theme-comparison cards (project
// 46c718f3-7619-4f0f-9016-7b75f2df1a78, "Density Pass.dc.html").
const THEME_OPTIONS: { value: ThemeName; label: string; subtitle: string; swatches: [string, string, string, string] }[] = [
  { value: 'nightshift', label: 'Nightshift', subtitle: 'deep violet · mint', swatches: ['#1A1636', '#241E4E', '#5BE9C2', '#9C8DFF'] },
  { value: 'ember', label: 'Ember', subtitle: 'brown · orange', swatches: ['#15100C', '#241812', '#FF7A2F', '#D9A066'] },
  { value: 'field', label: 'Field', subtitle: 'khaki · military', swatches: ['#14170F', '#212617', '#C7D14A', '#7FA98F'] },
  { value: 'graphite', label: 'Graphite', subtitle: 'purple · grey', swatches: ['#121216', '#1D1D24', '#9B7DF5', '#C4B5FD'] },
]
const ACCENT_OPTIONS: { value: AccentOverride; label: string; from: string; to: string; glowRgb: string }[] = [
  { value: 'mint', label: 'Mint', from: '#7CF3D4', to: '#3ED3AA', glowRgb: '91,233,194' },
  { value: 'orange', label: 'Orange', from: '#FF9A54', to: '#E8601A', glowRgb: '255,122,47' },
  { value: 'yellowgreen', label: 'Yellow-green', from: '#D6DF6B', to: '#A8B434', glowRgb: '199,209,74' },
  { value: 'purple', label: 'Purple', from: '#B49BFF', to: '#7C5AE0', glowRgb: '155,125,245' },
  { value: 'blue', label: 'Blue', from: '#8FC7FF', to: '#3B82F6', glowRgb: '59,130,246' },
]
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
  /** Fired after any memory (goal/fact/context) edit/delete — same contract MemoryScreen had. */
  onMemoryChanged: () => void | Promise<void>
  /** Chat receipt deep-links land here, scrolled to the relevant memory section. 'dietary' — surfacing round — is where the meal-plan "unrecognised restriction" banner's "Open Profile" button lands. */
  initialSection?: 'goals' | 'facts' | 'context' | 'dietary'
  /** Chat typewriter reveal-speed preference — see reveal-speed-store.ts. */
  revealSpeed: RevealSpeed
  onRevealSpeedChange: (speed: RevealSpeed) => void
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

function EditableTextField({
  value, unit, onSave, min, max,
}: { value: number; unit?: string; onSave: (n: number) => void; min?: number; max?: number }) {
  const [input, setInput] = useState(String(value))
  useEffect(() => { setInput(String(value)) }, [value])
  const commit = () => {
    const n = Number(input)
    if (Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max) && n !== value) onSave(n)
    else setInput(String(value))
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="h-7 w-20 text-sm text-right"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

function EditableSelectField<T extends string | number>({
  value, options, onSave,
}: { value: T; options: { value: T; label: string }[]; onSave: (v: T) => void }) {
  return (
    <Select value={String(value)} onValueChange={v => {
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
          <Badge key={v} variant="secondary" className="text-[10px] gap-1 pr-1">
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
        <Button size="icon" variant="outline" className="size-7 shrink-0" onClick={add} disabled={!input.trim()}>
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
        <ToggleGroupItem key={day} value={day} className="text-[10px] px-2 h-7">{day.slice(0, 3)}</ToggleGroupItem>
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

export function ProfileScreen({ open, onOpenChange, profile, latestWeightKg, onProfileChanged, onMemoryChanged, initialSection, revealSpeed, onRevealSpeedChange }: ProfileScreenProps) {
  const [facts, setFacts] = useState<UserFactRow[]>([])
  const [goals, setGoals] = useState<UserGoalRow[]>([])
  const [contextFacts, setContextFacts] = useState<UserContextFactRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [armedDeleteKey, setArmedDeleteKey] = useState<string | null>(null)
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
  const hardFoodDislikes = facts.filter(f => f.kind === 'food_preference' && f.polarity === 'dislike' && f.hardness === 'hard')
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
      items: facts.filter(f => f.kind === kind && !(kind === 'food_preference' && f.polarity === 'dislike' && f.hardness === 'hard')),
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const savePatch = (patch: Partial<UserProfile>) => {
    if (!profileId) return
    const revertPatch = Object.fromEntries(
      Object.keys(patch).map(k => [k, profile[k as keyof UserProfile]])
    ) as Partial<UserProfile>
    onProfileChanged(patch)
    updateProfileField(profileId, patch).catch(err => {
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

        {/* Appearance — design doc option 1f. Both axes apply instantly and
            everywhere: glow is one intensity variable, canvas swaps the
            surface ramp. No separate themes, nothing to reload. */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h3>
          <div className="space-y-4 rounded-md bg-[color:var(--surface-deep)] p-3">
            <div>
              <p className="text-sm font-medium">Glow effects</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Halos on the action button, active states and key numbers</p>
              <div className="mt-3 flex gap-[3px] rounded-xl bg-background p-[3px]">
                {(['off', 'subtle', 'full'] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={appearance.glow === level}
                    onClick={() => appearance.setGlow(level)}
                    className={`h-[38px] flex-1 rounded-[9px] text-[13px] capitalize transition-colors ${
                      appearance.glow === level
                        ? 'font-semibold text-[color:var(--primary-foreground)] glow-mint-box'
                        : 'text-muted-foreground'
                    }`}
                    style={appearance.glow === level ? { background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' } : undefined}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sets canvas, surfaces and text. Complete stays green and attention stays amber in every theme, so status never depends on your pick.
              </p>
              <div className="mt-3 flex flex-col">
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={appearance.theme === opt.value}
                    onClick={() => appearance.setTheme(opt.value)}
                    className="flex items-center gap-3.5 py-3.5"
                    style={{ borderTop: '1px solid var(--hairline)' }}
                  >
                    <span className="flex shrink-0 gap-[5px]">
                      {opt.swatches.map((c, i) => (
                        <span key={i} className="size-[22px] rounded-[7px]" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-[15px] font-semibold">{opt.label}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{opt.subtitle}</span>
                    </span>
                    {appearance.theme === opt.value && (
                      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground glow-mint-box">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Action colour</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Buttons, links and the chat key. Defaults to your theme — override it here.</p>
              <div className="mt-3 flex items-center gap-2.5">
                {ACCENT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={appearance.accent === opt.value}
                    aria-label={`${opt.label} accent`}
                    onClick={() => appearance.setAccent(opt.value)}
                    className="size-[38px] shrink-0 rounded-xl"
                    style={{
                      background: `linear-gradient(180deg, ${opt.from}, ${opt.to})`,
                      boxShadow: appearance.accent === opt.value ? `0 0 16px rgba(${opt.glowRgb},.6), inset 0 0 0 2px rgba(255,255,255,.85)` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            <p className="text-[11.5px] leading-[1.5] text-muted-foreground/80">
              Both apply instantly, everywhere. Theme sets canvas and surfaces; action colour is an independent override — no separate light/dark modes to manage.
            </p>

            <div>
              <p className="text-sm font-medium">Chat reveal speed</p>
              <p className="mt-0.5 text-xs text-muted-foreground">How fast the coach's replies type out — Off shows them instantly</p>
              <div className="mt-3 flex gap-[3px] rounded-xl bg-background p-[3px]">
                {(['off', 'slow', 'normal', 'fast'] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={revealSpeed === level}
                    onClick={() => onRevealSpeedChange(level)}
                    className={`h-[38px] flex-1 rounded-[9px] text-[13px] capitalize transition-colors ${
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
              <p className="mt-2 text-[11.5px] leading-[1.5] text-muted-foreground/80">
                Reduced-motion system settings always show replies instantly, regardless of this choice.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Identity & metrics */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity &amp; metrics</h3>
          <div className="rounded-md border p-2.5 space-y-2 text-sm">
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
            <Row label="Recovery capacity"><EditableSelectField value={profile.recovery_capacity} options={RECOVERY_OPTIONS} onSave={v => savePatch({ recovery_capacity: v })} /></Row>
            <Row label="Conditioning"><EditableSelectField value={profile.conditioning_preference} options={CONDITIONING_PREF_OPTIONS} onSave={v => savePatch({ conditioning_preference: v })} /></Row>
          </div>
        </div>

        {/* Injuries */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Injuries</h3>
          <div className="rounded-md border p-2.5">
            <EditableTagList
              values={profile.injuries}
              onSave={v => savePatch({ injuries: v })}
              placeholder={`e.g. ${INJURY_OPTIONS[0]?.label ?? 'lower back'}`}
            />
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
              <p className="text-[11px] leading-snug text-muted-foreground/70">Diets and allergies the app enforces when building your meals.</p>
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
                    className="h-8 rounded-full border px-2.5 text-[11px] data-[state=on]:border-primary data-[state=on]:text-primary"
                  >
                    {o.icon} {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground">Foods to avoid</span>
              <p className="text-[11px] leading-snug text-muted-foreground/70">Anything else you'd rather not see. Matched by name.</p>
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
            <p className="pt-2 text-[11px] leading-snug text-muted-foreground/70" style={{ borderTop: '1px solid var(--hairline)' }}>
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
            {goals.map(g => {
              const progress = profileId ? computeGoalProgress(g, profileId, latestWeightKg ?? null) : { current: null, percent: null }
              return (
                <div key={g.id} className="rounded-md border p-2.5 space-y-1">
                  {editingId === g.id ? (
                    <div className="flex items-center gap-2.5">
                      <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveGoalEdit(g.id)}><Check className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{g.display_text}</span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(g.id, g.display_text)}><Pencil className="size-3" /></Button>
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
                        <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveFactEdit(f.id)}><Check className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{f.display_text}</span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {f.hardness && <Badge variant="outline" className="text-[9px] px-1 py-0">{f.hardness}</Badge>}
                          <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(f.id, f.display_text)}><Pencil className="size-3" /></Button>
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
            {contextFacts.map(c => (
              <div key={c.id} className="rounded-md border p-2.5 space-y-1">
                {editingId === c.id ? (
                  <div className="flex items-center gap-2.5">
                    <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm" />
                    <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={() => saveContextEdit(c.id)}><Check className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="hit-slop-44 size-7" onClick={cancelEdit}><X className="size-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{c.display_text}</span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <Button size="icon" variant="ghost" className="hit-slop-44 size-6" onClick={() => startEdit(c.id, c.display_text)}><Pencil className="size-3" /></Button>
                      <Button
                        size="icon" variant="ghost"
                        className={armedDeleteKey === `context:${c.id}` ? 'hit-slop-44 size-6 bg-destructive text-destructive-foreground' : 'hit-slop-44 size-6 text-destructive'}
                        onClick={() => requestDelete(`context:${c.id}`, () => deleteContext(c.id))}
                        aria-label={armedDeleteKey === `context:${c.id}` ? 'Tap again to permanently delete this' : 'Delete'}
                      ><Trash2 className="size-3" /></Button>
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
