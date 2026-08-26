// ---------------------------------------------------------------------------
// SEE THE APP WITHOUT A PHONE.
//
// WHY THIS EXISTS. Three UI defects in one week were found the same way:
// Ashley opened the deployed app on her phone, hit something broken, and sent
// a screenshot. Each cost a full deploy round-trip, and two of them were
// visible in the markup the whole time —
//
//   "B · 3×9-11 · 25kg · 2s down · drive up"   ← "B" was Backpack Row
//   the onboarding composer, below the fold behind the keyboard
//
// Nothing in the gate suite could see either. Every existing gate reasons
// about DATA — is the load right, does the rest floor hold, is the audit
// clean — and all of them passed while the app was showing a one-letter
// exercise name. A layout defect is invisible to an assertion about kilograms.
//
// So this renders the REAL components, with REAL generated plans, at a REAL
// phone width, and takes a picture. It is not a replacement for Ashley's
// phone — no live data, no session state, no touch, and effects never run
// (see below). It is the cheap pass that should catch the "B" class of bug
// before a human has to.
//
// HOW, and the deliberate limits:
//   - renderToStaticMarkup, NOT a browser-run React app. So useEffect never
//     fires and every component renders in its INITIAL state. That is the
//     limitation and also the point: no Supabase, no mocking layer, no auth,
//     nothing to drift out of sync with the app. What it cannot show is
//     anything that only appears after an effect.
//   - Props come from generateExercisePlan / generateMesocycle — the real
//     engine, the real exercise names, the real prescriptions — so a row is
//     as long as it will really be. A hand-written fixture would have quietly
//     used short names and hidden the exact bug this was built for.
//   - The CSS is dist/assets/index-*.css, the app's own compiled stylesheet.
//     Requires `npm run build` first; the script says so rather than
//     rendering something unstyled and calling it a screen.
//
// Screenshots land in .screens/ (gitignored). Not asserted against goldens on
// purpose: a pixel-diff gate on a UI still being designed fails on every
// intentional change and gets muted within a week. This is a LOOKING tool.
// ---------------------------------------------------------------------------

import React from 'react'
import { MessageCircle } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { generateMesocycle, setRandomSource, resetRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { PeekPanel } from '@/components/exercise/PeekPanel'
import { RestDayCard } from '@/components/exercise/RestDayCard'
import { WarmupSection } from '@/components/exercise/WarmupSection'
import { LoadCeilingPrompt } from '@/components/exercise/LoadCeilingPrompt'
import { SlotChipsCard } from '@/components/onboarding/SlotChipsCard'
import { initialSlotValues, ONBOARDING_SLOTS } from '@/lib/onboarding-slots'
import { buildFirstRunIntro } from '@/lib/first-run-intro'
import type { UserProfile, WorkoutDay, EquipmentAccess } from '@/lib/types'

const CHROMIUM = '/opt/pw-browsers/chromium'
const OUT = '.screens'
const WIDTH = 412            // a common Android logical width; Ashley's phone
const SCALE = 2

// --- plans, from the real engine -------------------------------------------

function profile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

function quiet<T>(fn: () => T): T {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

/**
 * ALWAYS FROM THE MESOCYCLE, never from generateExercisePlan directly.
 *
 * The first run of this harness rendered "Barbell Squats" under an ACCESSORY
 * label with no MAIN LIFT anywhere, which looked exactly like a real defect.
 * It was not. generateExercisePlan returns exercises with `tier` UNDEFINED;
 * generateMesocycle is what assigns tier_0_primer / tier_1_primary / etc, and
 * the app only ever renders mesocycle days. Feeding the panel a base week was
 * showing a state no user can reach.
 *
 * Recorded because it is the harness's own first lesson, and the general one:
 * a screenshot of the wrong data is a confident picture of nothing. If a
 * screen here disagrees with the app, suspect the props before the component.
 */
function weekFor(equipment_access: EquipmentAccess, seed: string, weekNumber: number): WorkoutDay[] {
  return quiet(() => {
    setRandomSource(seededRngFromKey(seed))
    try {
      const weeks = generateMesocycle(profile({ equipment_access }))
      const wk = weeks.find(w => w.week_number === weekNumber)
      if (!wk) throw new Error(`week ${weekNumber} not in a ${weeks.length}-week mesocycle`)
      return wk.days
    } finally { resetRandomSource() }
  })
}

const noop = () => {}

// --- the screens -----------------------------------------------------------

interface Screen { name: string; title: string; node: React.ReactNode }

// Week 11 for bodyweight: deep enough that tempo and capped loads are really
// in the prescription, which is where the longest rows live.
const bodyweightLate = weekFor('bodyweight', 'screens:bw', 11)
const fullGym = weekFor('full_gym', 'screens:fg', 1)
const minimalist = weekFor('minimalist', 'screens:min', 11)

/** The day with the LONGEST row content — the worst case is the one worth seeing. */
function worstDay(days: WorkoutDay[]): WorkoutDay {
  const cost = (d: WorkoutDay) => Math.max(0, ...d.exercises.map(e =>
    e.name.length + String(e.reps).length + (e.tempo ? 14 : 0) + (e.suggested_load_kg != null ? 6 : 0)))
  return [...days].filter(d => d.exercises.length > 0).sort((a, b) => cost(b) - cost(a))[0]
}

/**
 * The first-run intro, at phone width.
 *
 * ChatAssistant itself cannot render here — it needs a live session, a
 * profile and a Supabase client, so it lands in `skipped`. The message-row
 * markup below is therefore a REPLICA of ChatAssistant's assistant turn
 * (avatar column, max-w-[80%], pl-9 offset, the quick-reply pill classes),
 * copied class-for-class.
 *
 * What is NOT a replica is the part that matters: the words and the chips
 * come from buildFirstRunIntro — the same function the app calls — so the
 * question this screen answers ("does that middle paragraph read as a wall on
 * a phone, and do three chips fit?") is answered about the real strings. If
 * the chrome drifts, the screen looks slightly wrong; if the copy drifts, it
 * cannot, because there is only one copy.
 */
function FirstRunChat() {
  const intro = buildFirstRunIntro('Morning, Ashley', "It's a squat and carry day — six exercises, about 50 minutes.")
  return (
    <div className="space-y-3 px-4 py-3">
      {intro.map((msg, i) => (
        <div key={i} className="flex justify-start">
          <div className="max-w-[80%]">
            <div className="flex items-start gap-2.5">
              <span
                className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[#08281F]"
                style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))', boxShadow: '0 0 18px rgba(var(--glow-rgb),.45)' }}
              >
                <MessageCircle className="size-3.5" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-foreground">
                {msg.content}
              </div>
            </div>
            {msg.quickReplies && msg.quickReplies.length > 0 && (
              <div className="pl-9">
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.quickReplies.map(option => (
                    <button
                      key={option}
                      type="button"
                      className="rounded-full bg-[color:var(--surface-raised)] px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 min-h-[44px]"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const screens: Screen[] = [
  {
    name: 'day-bodyweight-week11',
    title: 'Another day · bodyweight, week 11 (tempo + capped loads)',
    node: <PeekPanel workout={worstDay(bodyweightLate)} onExit={noop} onSwap={noop} onBan={noop} banBusyName={null} />,
  },
  {
    name: 'day-full-gym',
    title: 'Another day · full gym',
    node: <PeekPanel workout={worstDay(fullGym)} onExit={noop} onSwap={noop} onBan={noop} banBusyName={null} />,
  },
  {
    name: 'day-minimalist',
    title: 'Another day · minimalist',
    node: <PeekPanel workout={worstDay(minimalist)} onExit={noop} onSwap={noop} onBan={noop} banBusyName={null} />,
  },
  {
    name: 'rest-day',
    title: 'Rest day',
    node: (
      <RestDayCard
        dayName="Saturday"
        weekTally={{ done: 2, planned: 4 }}
        tomorrow={{ dayName: 'Sunday', focus: 'Upper Body Strength', exerciseCount: 6 }}
        trainAnywayOptions={['Monday', 'Tuesday']}
        onTrainAnyway={noop}
      />
    ),
  },
  {
    name: 'warmup-open',
    title: 'Warm-up, expanded',
    node: <WarmupSection warmup={fullGym.find(d => d.warmup)?.warmup} open onToggle={noop} />,
  },
  {
    name: 'load-ceiling-prompt',
    title: 'What can you actually load',
    node: <LoadCeilingPrompt kind="dumbbell" onSave={async () => {}} onDecline={async () => {}} />,
  },
  {
    name: 'first-run-chat',
    title: 'Coach chat · the first thing a new user ever sees',
    node: <FirstRunChat />,
  },
]

// Every onboarding question that renders chips — the screen a new user meets
// first, and the one that has now drifted behind the chat three times.
for (const def of ONBOARDING_SLOTS) {
  if (def.control !== 'single' && def.control !== 'multi') continue
  if (!def.options?.length) continue
  screens.push({
    name: `onboarding-${def.key}`,
    title: `Onboarding · ${def.question}`,
    node: (
      <div className="max-w-md w-full mx-auto">
        <div className="mr-auto max-w-[85%] w-fit rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm mb-2">{def.question}</div>
        <SlotChipsCard
          slotKey={def.key}
          values={initialSlotValues()}
          resolved={false}
          busy={false}
          onToggleMulti={noop}
          onResolveSingle={noop}
          onResolveMulti={noop}
          onDecline={noop}
        />
      </div>
    ),
  })
}

// --- render ----------------------------------------------------------------

function cssPath(): string {
  const dir = 'dist/assets'
  if (!existsSync(dir)) throw new Error('dist/assets missing — run `npm run build` first, or this renders unstyled markup and lies about what the screen looks like.')
  const f = readdirSync(dir).find(n => /^index-.*\.css$/.test(n))
  if (!f) throw new Error('no compiled index-*.css in dist/assets — run `npm run build` first.')
  return join(dir, f)
}

const css = readFileSync(cssPath(), 'utf8')
mkdirSync(OUT, { recursive: true })

let shot = 0
const skipped: { name: string; why: string }[] = []
for (const s of screens) {
  // A screen that needs live session context cannot render here, and that is
  // a FACT ABOUT THE TOOL, not a failure of the screen. Reported by name at
  // the end rather than swallowed — a harness that silently renders 14 of 20
  // screens and prints "done" is worse than no harness, because it reads as
  // coverage it does not have.
  let markup: string
  try {
    markup = renderToStaticMarkup(s.node as React.ReactElement)
  } catch (err) {
    skipped.push({ name: s.name, why: err instanceof Error ? err.message : String(err) })
    console.log(`  – ${s.name} (not renderable here)`)
    continue
  }
  const html = `<!doctype html><html class="dark"><head><meta charset="utf-8">
<style>${css}</style>
<style>
 html,body{margin:0;width:${WIDTH}px;overflow-x:hidden;background:var(--background);color:var(--foreground)}
 body{padding:10px;font-family:system-ui,-apple-system,sans-serif}
 .harness-title{color:#7c6fd0;font:700 9.5px system-ui;letter-spacing:.14em;text-transform:uppercase;margin:0 2px 8px;display:block}
</style></head><body>
<span class="harness-title">${s.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
${markup}
</body></html>`
  const htmlPath = join(OUT, `${s.name}.html`)
  writeFileSync(htmlPath, html)
  execFileSync(CHROMIUM, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--force-device-scale-factor=${SCALE}`, `--window-size=${WIDTH},900`,
    `--screenshot=${join(OUT, `${s.name}.png`)}`, `file://${process.cwd()}/${htmlPath}`,
  ], { stdio: 'ignore' })
  shot++
  console.log(`  ✓ ${s.name}`)
}

console.log(`\n${shot} screens rendered to ${OUT}/`)
if (skipped.length) {
  console.log(`\n${skipped.length} NOT rendered — these still need a real phone or a browser:`)
  for (const s of skipped) console.log(`  ${s.name.padEnd(28)} ${s.why.split('\n')[0]}`)
}
console.log('\nEffects never run here, so anything that appears only after one is out of scope.')
