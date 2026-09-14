// ---------------------------------------------------------------------------
// THE PROFILE SCREEN, ON A REAL MOUNT.
//
// Until 13 Sep 2026 nothing in this folder mounted ProfileScreen at all:
// real.tsx reproduces App's settings wrapper and hands ProfileMenu an
// `onOpenProfile={noop}`, so tapping the gear opened a dropdown whose
// "Profile" item did nothing. Every Profile row the app has ever shipped was
// therefore verified by source check only — including three new ones that cap
// every prescribed weight.
//
// WHY A FOURTH ENTRY POINT RATHER THAN A FLAG ON real.tsx: the same argument
// chat.tsx makes for itself. real.tsx renders its screens inside a
// `max-w-md px-4 pb-40 pt-14` main, and ProfileScreen is a full-screen Dialog
// — measuring one inside the other answers a question about the harness.
//
// WHAT IS REPRODUCED RATHER THAN REAL, stated so the result is not overread.
// App owns the profile state and the persistence around a ceiling correction:
// it merges the patch, re-prices, saves only the weeks that moved, reverts on
// a failed save. That plumbing is reproduced here, so this page CANNOT be
// evidence about it — `test:setup-answers` §8 is what holds it, by source.
//
// What IS real and is the whole point: ProfileScreen itself, its rows and
// their gating, and `repriceForCorrectedProfile` / `describeReprice` from
// src/lib/reprice-plan.ts, called with a real generated mesocycle. The
// receipt this page displays is the app's own sentence, not a restatement —
// a harness that restates what it is testing will eventually disagree with
// it, and the disagreement looks like a bug in the app.
//
// ?fullgym=1 — the SAME page with a full-gym tier, because the rows must be
// ABSENT there. assembleProfile discards all three ceilings for a full-gym
// answer, so offering them would be a control that cannot take effect.
// ---------------------------------------------------------------------------
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { setSupabaseClient } from '@/lib/supabase'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { generateMesocycle, setRandomSource, resetRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { repriceForCorrectedProfile, repriceableWeekNumbers, describeReprice } from '@/lib/reprice-plan'
import { ProfileScreen } from '@/components/ProfileScreen'
import { AppearanceProvider } from '@/hooks/useAppearance'
import type { UserProfile, MesocycleWeek } from '@/lib/types'
import { setDevClockOverride } from '@/lib/dev-clock'
import { ANCHOR_ISO, anchorDate, anchorNowMs, iso as isoOf } from './anchor.mjs'
import '@/index.css'

const PROFILE_ID = 'harness-profile'

// PINNED BEFORE FIRST RENDER — see .tour-harness/anchor.mjs. One fixed
// "today" for every run, so a driver's day-name assertions stop depending on
// what day it is where the machine is.
setDevClockOverride(PROFILE_ID, ANCHOR_ISO)
const FULL_GYM = new URLSearchParams(location.search).get('fullgym') === '1'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const availableIdx = new Set([0, 1, 3, 4])

// home_gym by default. NOT real.tsx's ?legcurl=1, which also flips the split
// to push/pull/legs — a second change this page has no opinion about.
const baseProfile: UserProfile = {
  id: PROFILE_ID,
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'build_muscle', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: FULL_GYM ? 'full_gym' : 'home_gym',
  injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower',
  training_days: DAYS.map((day, i) => ({ day, available: availableIdx.has(i) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  // ANSWERED, so the row renders with a value and the driver's change is a
  // CORRECTION rather than a first answer — same reasoning as the ceilings
  // below. 'train' is the answer that produced this (lifting) plan, so
  // switching to 'move_more' is the interesting direction: it is the one that
  // means the plan on screen is the wrong KIND of plan.
  start_preference: 'train',
  // SKIPPED THE CALIBRATION WEEK, with the three lifts answered — the case
  // where correcting one genuinely changes the plan, and so the case worth
  // driving. Her ruling's other half (a calibrated plan is told the correction
  // changes nothing) is held by test:setup-answers §9 off the source.
  skip_calibration_week: true,
  known_squat_kg: 100,
  known_bench_kg: 60,
  known_deadlift_kg: 120,
  // A STATED CEILING ALREADY SET, so the rows render with a value in them and
  // the driver's edit is a CORRECTION rather than a first answer — which is
  // the case this feature exists for.
  max_dumbbell_kg: 30,
  max_single_implement_kg: 32,
  max_improvised_kg: 20,
  created_at: new Date(anchorNowMs() - 9 * 86400000).toISOString(),
} as UserProfile

setRandomSource(seededRngFromKey('profile-harness'))
const MESO = generateMesocycle(baseProfile)
resetRandomSource()

const db: Db = {
  fitness_profiles: [{ ...baseProfile }],
  daily_metrics: [], water_logs: [], exercise_set_logs: [], workout_sessions: [],
  cardio_logs: [], daily_steps: [], meal_events: [], user_facts: [], user_goals: [],
} as unknown as Db
setSupabaseClient(makeFakeSupabase(db) as never)

function Harness() {
  // ITS OWN STATE, because fake-supabase's update() mutates the row in `db`
  // and never the object handed to components. Without this the rows would
  // show the old number after every save and the driver would be reading a
  // stale screen. real.tsx makes the same move for its mesocycle.
  const [profile, setProfile] = useState<UserProfile>(baseProfile)
  const [mesocycle, setMesocycle] = useState<MesocycleWeek[]>(MESO)
  const [receipt, setReceipt] = useState<string | null>(null)
  // App holds this in a dialog; here it is a plain element, for the same
  // reason the receipt is: this page reproduces App's plumbing so the SCREEN
  // can be driven, and test:rebuild-offer §4 holds App's own half by source
  // (nothing rebuilds without a confirm, raised from exactly one place).
  const [invalidation, setInvalidation] = useState<{ title: string; detail: string } | null>(null)
  const [open, setOpen] = useState(true)

  // App's handler, reproduced — see the header. The two functions it calls are
  // the real ones.
  const onCeilingsCorrected = (patch: Partial<UserProfile>) => {
    const corrected = { ...profile, ...patch } as UserProfile
    const { mesocycle: repriced, changes } = repriceForCorrectedProfile(
      mesocycle, profile, corrected, repriceableWeekNumbers(mesocycle, 1),
    )
    if (changes.length === 0) return
    setMesocycle(repriced)
    setReceipt(describeReprice(changes))
  }

  return (
    <AppearanceProvider>
      <div className="min-h-[100dvh] bg-background text-foreground">
        {/* Reopening is how the driver checks a saved value survives the
            dialog closing — Profile has no other route in this page. */}
        <button type="button" data-testid="open-profile" className="m-4 h-11 px-4" onClick={() => setOpen(true)}>
          Open Profile
        </button>
        {receipt && (
          <p className="m-4 text-sm" data-testid="reprice-receipt">{receipt}</p>
        )}
        {invalidation && (
          <div className="m-4 text-sm" data-testid="plan-invalidation">
            <p data-testid="plan-invalidation-title">{invalidation.title}</p>
            <p data-testid="plan-invalidation-detail">{invalidation.detail}</p>
          </div>
        )}
        {/* THE PLAN'S OWN WEIGHTS, so the driver can check the receipt against
            what the plan actually holds rather than against itself. */}
        <div hidden data-testid="plan-weights">{JSON.stringify(
          mesocycle.flatMap(w => w.days.flatMap(d => d.exercises
            .filter(e => e.suggested_load_kg != null)
            .map(e => ({ w: w.week_number, d: d.day, n: e.name, kg: e.suggested_load_kg })))),
        )}</div>
        <ProfileScreen
          exercisePlan={mesocycle[0].days}
          open={open}
          onOpenChange={setOpen}
          profile={profile}
          latestWeightKg={80}
          onProfileChanged={patch => setProfile(prev => ({ ...prev, ...patch }))}
          onCeilingsCorrected={onCeilingsCorrected}
          onPlanInvalidated={setInvalidation}
          onMemoryChanged={() => {}}
          revealSpeed="normal"
          onRevealSpeedChange={() => {}}
          onNewPlan={() => {}}
        />
      </div>
    </AppearanceProvider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
