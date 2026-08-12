import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Companion to smoke-regen-week.ts: reads the freshly-regenerated
// mesocycle_weeks row back for a profile and checks week 1's training days
// against the smoke-check's mechanical assertions — duration budget,
// duplicate movement family, and a jargon/internal-token sweep over every
// visible string. This covers what a screenshot can miss across days that
// weren't the one live "today" session in the browser.

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=')
      if (key && value) process.env[key.trim()] = value.trim()
    }
  }
}

import { setSupabaseClient } from '../src/lib/supabase'
import { restoreMesocycle } from '../src/lib/mesocycle-persistence'
import { estimateDaySeconds, getDurationBudgetSeconds } from '../src/lib/session-duration'
import { getMovementFamily } from '../src/lib/exercise-db'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import type { WorkoutDay, SessionDuration } from '../src/lib/types'

const dbByName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))

function sameImplement(a: any, b: any): boolean {
  return a.equipment.some((eq: string) => b.equipment.includes(eq))
}
function isGenuineDuplicate(a: any, b: any): boolean {
  return a.angle_vector === b.angle_vector && sameImplement(a, b)
}

function checkDuplicates(day: WorkoutDay): string[] {
  const families = new Map<string, string[]>()
  for (const ex of day.exercises) {
    const entry = dbByName.get(ex.name)
    if (!entry) continue
    const fam = getMovementFamily(entry)
    if (!families.has(fam)) families.set(fam, [])
    families.get(fam)!.push(ex.name)
  }
  const issues: string[] = []
  for (const [fam, names] of families) {
    if (names.length <= 1) continue
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = dbByName.get(names[i])!, b = dbByName.get(names[j])!
        if (isGenuineDuplicate(a, b)) issues.push(`${fam}: "${names[i]}" + "${names[j]}"`)
      }
    }
  }
  return issues
}

// Raw internal tokens that should never reach rendered text.
const JARGON_PATTERNS = [/tier_0_primer/, /tier_1_primary/, /tier_2_/, /substitution_group/, /angle_vector/, /slot_appropriate/, /coherence_group/]

// Only fields whose values are actually rendered as free text somewhere in
// the UI — NOT internal enum/categorization fields like `tier`,
// `movement_pattern`, `substitution_group` etc., which are legitimate
// internal keys mapped to clean display text (e.g. tier 'tier_0_primer' ->
// rendered label "Primer") and would false-positive on any jargon-pattern
// scan of the raw data object.
const RENDERED_TEXT_FIELDS = new Set(['name', 'focus', 'conditioning_note', 'load_guidance', 'coach_note', 'pattern_gap_note', 'label', 'substitution', 'suggested_load'])

function scanJargon(obj: any, path: string, hits: string[], key?: string) {
  if (typeof obj === 'string') {
    if (key && RENDERED_TEXT_FIELDS.has(key)) {
      for (const pat of JARGON_PATTERNS) {
        if (pat.test(obj)) hits.push(`${path}: "${obj}"`)
      }
    }
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanJargon(v, `${path}[${i}]`, hits, key))
    return
  }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) scanJargon(obj[k], `${path}.${k}`, hits, k)
  }
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('Missing env'); process.exit(1) }
  if (!url!.includes('vswuurrtbzbrgubddefv')) { console.error('Refusing non-TEST URL'); process.exit(1) }
  const supabase = createClient(url!, key!)
  setSupabaseClient(supabase as any)

  const profileArg = process.argv.find(a => a.startsWith('--profile='))
  if (!profileArg) { console.error('Usage: --profile=<uuid> --budget=<SessionDuration>'); process.exit(1) }
  const profileId = profileArg.split('=')[1]
  const budgetArg = process.argv.find(a => a.startsWith('--budget='))
  const budget = (budgetArg ? budgetArg.split('=')[1] : '45-60') as SessionDuration

  const restored = await restoreMesocycle(profileId)
  if (!restored) { console.error('No mesocycle found'); process.exit(1) }
  const week1 = restored.weeks.find(w => w.week_number === 1)
  if (!week1) { console.error('No week 1'); process.exit(1) }

  const budgetSeconds = getDurationBudgetSeconds(budget)
  console.log(`Budget: ${budget} (${Math.round(budgetSeconds / 60)} min)`)

  for (const day of week1.days) {
    if (!day.exercises || day.exercises.length === 0) {
      console.log(`${day.day}: no exercises (rest/recovery) — skip`)
      continue
    }
    const estSeconds = estimateDaySeconds(day)
    const estMin = Math.round(estSeconds / 60)
    const withinBudget = estSeconds <= budgetSeconds * 1.15 // matching SessionDurationNote's own tolerance if any; flag if grossly over
    const dupes = checkDuplicates(day)
    console.log(`${day.day} (${day.focus}): ~${estMin} min estimated${withinBudget ? '' : '  <-- OVER BUDGET'}${dupes.length ? `  <-- DUPLICATES: ${dupes.join('; ')}` : ''}`)
  }

  const jargonHits: string[] = []
  scanJargon(week1, 'week1', jargonHits)
  if (jargonHits.length) {
    console.log('JARGON/INTERNAL TOKENS FOUND:')
    jargonHits.forEach(h => console.log('  ' + h))
  } else {
    console.log('No raw jargon/internal tokens found in week 1 data.')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
