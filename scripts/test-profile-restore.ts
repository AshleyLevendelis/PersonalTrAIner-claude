// ---------------------------------------------------------------------------
// Gate: every profile column the app READS must survive a reload.
//
// WHY THIS EXISTS. `App.tsx`'s `restoreSession` rebuilds the profile column by
// column — 40-odd hand-written lines — so a column missing from that list is
// `undefined` for the entire session however faithfully Postgres stored it.
// Eight had gone missing, all of them written correctly and none of them read
// back:
//
//   max_dumbbell_kg / _single_implement_ / _improvised_   asked again every
//                                                          session; a stated
//                                                          ceiling never applied
//   load_ceilings_declined                                 "I'm not sure" never
//                                                          stuck
//   macro_split_preset / _protein_per_kg / _fat_percent    split silently
//                                                          reverted to Balanced
//   water_target_ml                                        reverted to 2000ml
//
// The ceilings RE-ASK, which is at least visible. The macro split silently
// moves a protein target on the next open and tells nobody.
//
// THE GATE IS THE DURABLE FIX, not the eight lines. Nothing about that
// function stops a ninth column arriving the same way — it is a hand-written
// list, and hand-written lists rot. This is written to fail on any column
// that has a consumer and no restore line, so the next one is caught the day
// it is added rather than whenever someone happens to look.
//
// It deliberately does NOT demand that restoreSession become a generic
// mapper. It is explicit on purpose: several fields need real coercion
// (`Number(null)` is 0, not undefined — its own top comment records that
// shipping once), and a blanket spread would reintroduce exactly that bug.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail, null, 1).slice(0, 900)}` : ''}`) }
}

/** Every column fitness_profiles has, per the migrations. */
function profileColumns(): Set<string> {
  const cols = new Set<string>()
  const dir = join(ROOT, 'supabase/migrations')
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8')
    const create = /create table (?:if not exists )?(?:public\.)?fitness_profiles\s*\(([\s\S]*?)\n\);/i.exec(sql)
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = /^\s*([a-z_]+)\s+[a-z]/.exec(line)
        if (m && !['primary', 'constraint', 'unique', 'foreign', 'check'].includes(m[1])) cols.add(m[1])
      }
    }
    // Only ALTER statements that actually name the table, to its terminating
    // semicolon — a looser scan picked up columns from workout_sessions and
    // mesocycle_weeks and reported nine false positives.
    for (const alt of sql.matchAll(/alter table (?:public\.)?fitness_profiles([\s\S]*?);/gi)) {
      for (const m of alt[1].matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) cols.add(m[1])
      for (const m of alt[1].matchAll(/drop column (?:if exists )?([a-z_]+)/gi)) cols.delete(m[1])
    }
  }
  return cols
}

/** Everything restoreSession puts on the profile, however it gets there. */
function restoredKeys(app: string): Set<string> {
  const block = /const restoredProfile: UserProfile = \{([\s\S]*?)\n    \}/.exec(app)?.[1] ?? ''
  const keys = new Set([...block.matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]))
  // Some columns are read outside the object literal (exercise_exclusions
  // becomes its own state). Reading profileRow.<col> anywhere counts.
  for (const m of app.matchAll(/profileRow\.([a-z_]+)/g)) keys.add(m[1])
  return keys
}

/**
 * Files that read this column off a profile-shaped object.
 *
 * SEARCHES THE EDGE FUNCTIONS TOO, and that is not thoroughness for its own
 * sake — the first version walked only src/ and reported
 * training_time_preference as having no consumer at all. It has one, in
 * chat-gemini's system prompt, which the client never sends a value for, so
 * it printed a constant "morning" beside the real preferred_time on the line
 * above. A gate that decides what is dead has to look everywhere the thing
 * could be alive.
 */
function consumersOf(col: string): string[] {
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const f = join(dir, e)
      if (statSync(f).isDirectory()) walk(f)
      else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('App.tsx')) {
        // COMMENTS STRIPPED FIRST. A column named only in prose about it is
        // not a consumer, and counting one made this gate demand that
        // owner_id be restored onto the client profile — a column auth.ts
        // only ever discusses, never reads. Naming a thing is not using it.
        if (stripComments(readFileSync(f, 'utf8')).includes(col)) hits.push(f.replace(ROOT + '/', ''))
      }
    }
  }
  walk(join(ROOT, 'src'))
  walk(join(ROOT, 'supabase/functions'))
  return hits
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Columns that exist for the database's benefit and are never meant to reach
 * the client profile. Listed so they are not reported as dead code either —
 * "unused" and "used only by Postgres" are different answers.
 */
const SERVER_SIDE_ONLY: Record<string, string> = {
  owner_id: 'the row\'s auth.users owner — read by RLS policies and claim_profile, never by the app',
}

const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
const cols = profileColumns()
const restored = restoredKeys(app)

// ---------------------------------------------------------------------------
console.log('\n1. Nothing the app reads is dropped on reload')
// ---------------------------------------------------------------------------
{
  check(`the migrations were parsed (${cols.size} columns on fitness_profiles)`, cols.size > 30, cols.size)
  check(`restoreSession was parsed (${restored.size} keys)`, restored.size > 30, restored.size)

  const dropped = [...cols].filter(c => !restored.has(c)).sort()
  const withConsumers = dropped
    .map(c => ({ column: c, readBy: consumersOf(c) }))
    .filter(x => x.readBy.length > 0)

  check(`every column with a consumer is restored (${dropped.length} unrestored, ${withConsumers.length} of them live)`,
    withConsumers.length === 0,
    withConsumers.map(x => `${x.column} — read by ${x.readBy.slice(0, 2).join(', ')}`))

  // A column with NO consumer is a different problem and must not be silently
  // mapped: restoring dead weight makes it look load-bearing to the next
  // person. Listed, never failed.
  const dead = dropped.filter(c => consumersOf(c).length === 0 && !(c in SERVER_SIDE_ONLY))
  if (dead.length) console.log(`    · unrestored with no consumer at all (dead, decide separately): ${dead.join(', ')}`)
  for (const [col, why] of Object.entries(SERVER_SIDE_ONLY)) {
    if (dropped.includes(col)) console.log(`    · not restored on purpose: ${col} — ${why}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. Absent still means absent')
// ---------------------------------------------------------------------------
{
  // restoreSession's own top comment exists because `Number(null)` is 0 —
  // "that silently turned 'never given' back into a fabricated measurement
  // right at the restore boundary". A restore line that coerces a null to a
  // number or a zero reintroduces it.
  const block = /const restoredProfile: UserProfile = \{([\s\S]*?)\n    \}/.exec(app)?.[1] ?? ''
  const NULLABLE = [
    'max_dumbbell_kg', 'max_single_implement_kg', 'max_improvised_kg',
    'daily_step_target', 'water_target_ml', 'macro_protein_per_kg', 'macro_fat_percent',
  ]
  const coerced = NULLABLE.filter(c => {
    const line = new RegExp(`^\\s*${c}:.*$`, 'm').exec(block)?.[0] ?? ''
    return /\?\? 0\b/.test(line) || new RegExp(`Number\\(profileRow\\.${c}\\)`).test(line)
  })
  check('no nullable number is restored as 0 or bare Number()', coerced.length === 0, coerced)
}

console.log(failures === 0 ? '\nAll profile-restore checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
