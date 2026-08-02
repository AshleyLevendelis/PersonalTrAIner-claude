import * as fs from 'fs'
import * as path from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, MesocycleWeek, WorkoutDay, FitnessGoal, TrainingExperience, EquipmentAccess } from '../src/lib/types'

// ---------------------------------------------------------------------------
// LLM-as-coach plan review (manual use — not part of the automated gate)
// ---------------------------------------------------------------------------
// Everything the quality-score harness checks is a rule someone had to think
// of in advance. This asks a model to just look at a rendered plan the way a
// strength coach would and say what's wrong with it — a different, useful
// kind of scrutiny that catches "this is technically compliant but no coach
// would actually program it this way."

interface RepresentativeProfile {
  label: string
  goal: FitnessGoal
  experience: TrainingExperience
  equipment: EquipmentAccess
}

// ~12 profiles spanning goal x experience x equipment extremes — not a full
// cross product (4 x 4 x 4 = 64), a deliberately curated spread so every goal
// and every experience level appears at least once, and both equipment
// extremes (full_gym vs bodyweight-only) are represented.
const REPRESENTATIVE_PROFILES: RepresentativeProfile[] = [
  { label: 'Hypertrophy / Beginner / Full Gym', goal: 'hypertrophy', experience: 'beginner', equipment: 'full_gym' },
  { label: 'Hypertrophy / Advanced / Bodyweight', goal: 'hypertrophy', experience: 'advanced', equipment: 'bodyweight' },
  { label: 'Hypertrophy / Intermediate / Minimalist', goal: 'hypertrophy', experience: 'intermediate', equipment: 'minimalist' },
  { label: 'Fat Loss / Novice / Home Gym', goal: 'fat_loss', experience: 'novice', equipment: 'home_gym' },
  { label: 'Fat Loss / Advanced / Full Gym', goal: 'fat_loss', experience: 'advanced', equipment: 'full_gym' },
  { label: 'Fat Loss / Beginner / Bodyweight', goal: 'fat_loss', experience: 'beginner', equipment: 'bodyweight' },
  { label: 'Conditioning / Beginner / Minimalist', goal: 'conditioning', experience: 'beginner', equipment: 'minimalist' },
  { label: 'Conditioning / Intermediate / Full Gym', goal: 'conditioning', experience: 'intermediate', equipment: 'full_gym' },
  { label: 'Conditioning / Advanced / Home Gym', goal: 'conditioning', experience: 'advanced', equipment: 'home_gym' },
  { label: 'Functional / Novice / Bodyweight', goal: 'functional', experience: 'novice', equipment: 'bodyweight' },
  { label: 'Functional / Advanced / Full Gym', goal: 'functional', experience: 'advanced', equipment: 'full_gym' },
  { label: 'Functional / Intermediate / Home Gym', goal: 'functional', experience: 'intermediate', equipment: 'home_gym' },
]

function buildProfile(rp: RepresentativeProfile): UserProfile {
  return {
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: rp.goal,
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: rp.equipment,
    injuries: [],
    training_style: 'hybrid',
    training_experience: rp.experience,
    session_duration_preference: '45-60',
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
  }
}

// Days with zero exercises are not all the same thing: a true off day and a
// dedicated Zone-2/active-recovery day both have `exercises.length === 0`,
// but calling both "rest" is exactly the mislabeling multiple reviews
// caught ("Wednesday and Saturday say 'rest' and then prescribe 45 min of
// Zone 2... either call them what they are or drop the session"). Use the
// day's actual focus/conditioning_note instead of a blanket "rest" label.
const ALL_WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function renderDay(day: WorkoutDay): string {
  if (day.exercises.length === 0) {
    if (day.conditioning_note) {
      return `  ${day.day}: active recovery / conditioning day — ${day.conditioning_note}`
    }
    return `  ${day.day}: rest (no training, no conditioning scheduled)`
  }
  const lines = [`  ${day.day} (${day.focus}):`]
  if (day.warmup) {
    lines.push(`    Warm-up (~${Math.round(day.warmup.total_seconds / 60)}min)`)
  }
  for (const ex of day.exercises) {
    const load = ex.suggested_load ?? (ex.suggested_load_kg != null ? `${ex.suggested_load_kg}kg` : 'bodyweight')
    const superset = ex.superset_label ? ` [${ex.superset_label}]` : ''
    lines.push(`    - ${ex.name}${superset}: ${ex.sets}x${ex.reps} @ ${ex.intensity ?? '-'}, load ${load}, rest ${ex.rest}`)
  }
  return lines.join('\n')
}

// A day absent from week.days entirely is a genuine day off — nothing
// trains it, nothing claims it. Previously invisible to the reviewer (the
// render loop only walked week.days), which combined with the "rest" label
// on cardio days above to make every profile look like a 6-7 day training
// week with zero real rest — a repeated top-3 finding that was actually a
// rendering artifact of this script, not the generated plan.
function renderWeekDays(days: WorkoutDay[]): string[] {
  const byName = new Map(days.map(d => [d.day, d]))
  return ALL_WEEK_DAYS.map(name => {
    const day = byName.get(name)
    return day ? renderDay(day) : `  ${name}: off (no training, no conditioning scheduled)`
  })
}

function renderPlanAsText(profile: UserProfile, mesocycle: MesocycleWeek[]): string {
  const lines: string[] = []
  lines.push(`PROFILE: ${profile.training_experience} trainee, goal=${profile.fitness_goal}, equipment=${profile.equipment_access}, ${profile.session_duration_preference}min sessions, recovery_capacity=${profile.recovery_capacity}, conditioning_preference=${profile.conditioning_preference}`)
  lines.push('')

  lines.push('MACROCYCLE OVERVIEW:')
  const blocks = new Map<number, MesocycleWeek>()
  for (const week of mesocycle) {
    if (!blocks.has(week.block_number ?? 0)) blocks.set(week.block_number ?? 0, week)
  }
  for (const [blockNum, week] of blocks) {
    lines.push(`  Block ${blockNum}: ${week.phase_label} — ${week.phase_focus}`)
  }
  lines.push('')

  const week1 = mesocycle.find(w => w.week_number === 1)
  const week3 = mesocycle.find(w => w.week_number === 3)
  const deloadWeek = mesocycle.find(w => w.is_deload)

  if (week1) {
    lines.push(`--- WEEK 1 (${week1.phase_label}${week1.isCalibrationWeek ? ', CALIBRATION WEEK' : ''}) ---`)
    if (week1.coach_note) lines.push(`Coach note: ${week1.coach_note}`)
    lines.push(...renderWeekDays(week1.days))
    lines.push('')
  }

  if (week3) {
    lines.push(`--- WEEK 3 (${week3.phase_label}) ---`)
    lines.push(...renderWeekDays(week3.days))
    lines.push('')
  }

  const deloadDay = deloadWeek?.days.find(d => d.exercises.length > 0)
  if (deloadWeek && deloadDay) {
    lines.push(`--- DELOAD SAMPLE: week ${deloadWeek.week_number} (${deloadWeek.phase_label}: Deload) ---`)
    if (deloadWeek.coach_note) lines.push(`Coach note: ${deloadWeek.coach_note}`)
    lines.push(renderDay(deloadDay))
    lines.push('')
  }

  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a experienced, no-nonsense strength and conditioning coach reviewing a training program that was generated by an app for a specific client profile. You've coached for 15 years and have seen every kind of badly-designed program. Be direct and specific — vague praise or vague criticism is useless to the team reading this.

Given a rendered training plan (profile, macrocycle overview, week 1, week 3, and a deload-week sample day), respond with exactly these four sections, in this order, using these exact headers:

SCORE: <a single number 0-10, one decimal place>

TOP 3 ISSUES:
1. <specific, concrete problem — name the exercise/day/week it shows up in>
2. ...
3. ...

TOP 3 STRENGTHS:
1. <specific, concrete thing this program does well>
2. ...
3. ...

VERDICT: <would a paying client fire this coach over this program? Answer "Yes" or "No" and give one or two sentences of concrete reasoning tied to what's actually in the plan.>`

interface ReviewResult {
  label: string
  planText: string
  reviewText: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const NETWORK_RETRY_ATTEMPTS = 2
const NETWORK_RETRY_BACKOFF_MS = [2000, 4000]

async function callAnthropicOnce(apiKey: string, planText: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: planText }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Anthropic API returned ${response.status}: ${body}`)
  }

  const data = await response.json() as { stop_reason?: string; content: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal') {
    return '(review declined by the model — no content returned)'
  }
  return data.content.find(block => block.type === 'text')?.text ?? '(no text content in response)'
}

/**
 * Two profiles previously failed with `TypeError: fetch failed` — a
 * transient connection-level error (DNS/socket reset), not a real API
 * response — while every other profile in the same run succeeded, so it
 * wasn't a billing or auth problem. Retries ONLY that class of failure:
 * `fetch()` itself throwing before a response comes back. An actual API
 * error response (`!response.ok`, e.g. the 400 "credit balance too low"
 * seen in an earlier run) is a real answer from the server, not a network
 * fault — retrying it blindly wastes quota and won't change the outcome,
 * so those still surface immediately without a retry.
 */
async function callAnthropic(apiKey: string, planText: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
      return await callAnthropicOnce(apiKey, planText)
    } catch (err) {
      const isNetworkError = err instanceof TypeError
      if (!isNetworkError || attempt === NETWORK_RETRY_ATTEMPTS) throw err
      lastError = err
      console.log(`  Network error (attempt ${attempt + 1}/${NETWORK_RETRY_ATTEMPTS + 1}): ${err} — retrying in ${NETWORK_RETRY_BACKOFF_MS[attempt] / 1000}s...`)
      await sleep(NETWORK_RETRY_BACKOFF_MS[attempt])
    }
  }
  throw lastError
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY is not set — skipping LLM review. Set it in your environment to run this script.')
    process.exit(0)
  }

  console.log(`Running LLM coach review on ${REPRESENTATIVE_PROFILES.length} representative profiles...`)
  console.log('')

  const results: ReviewResult[] = []

  for (const rp of REPRESENTATIVE_PROFILES) {
    console.log(`Generating + reviewing: ${rp.label}...`)
    const profile = buildProfile(rp)

    setRandomSource(seededRngFromKey(rp.label))
    const mesocycle = generateMesocycle(profile)
    resetRandomSource()

    const planText = renderPlanAsText(profile, mesocycle)

    try {
      const reviewText = await callAnthropic(apiKey, planText)
      results.push({ label: rp.label, planText, reviewText })
    } catch (err) {
      console.error(`  Failed: ${err}`)
      results.push({ label: rp.label, planText, reviewText: `(review failed: ${err})` })
    }
  }

  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push(`LLM COACH REVIEW — ${new Date().toISOString()}`)
  lines.push('='.repeat(80))
  for (const r of results) {
    lines.push('')
    lines.push('-'.repeat(80))
    lines.push(r.label)
    lines.push('-'.repeat(80))
    lines.push(r.reviewText)
  }
  lines.push('')
  lines.push('='.repeat(80))

  const formatted = lines.join('\n')
  console.log('')
  console.log(formatted)

  const outputPath = path.join(process.cwd(), 'llm-review-report.txt')
  fs.appendFileSync(outputPath, formatted + '\n\n', 'utf-8')
  console.log(`\nAppended to: ${outputPath}`)
}

main().catch(err => {
  console.error('LLM review failed:', err)
  process.exit(1)
})
