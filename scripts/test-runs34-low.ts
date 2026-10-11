/**
 * Gate: the small things from runs 3-4 of the live-app test (10 Oct 2026, LOW).
 *
 * Each is a sentence or a label that was untrue or unreadable on a real phone:
 *   - the swap and add sheets said "tier2 compound" and "catalog";
 *   - a finished round still said "A round is running" on Tools;
 *   - Profile said "nothing is capped" under a filled-in 24 kg dumbbell, and a
 *     number typed in later never cleared the "not sure";
 *   - a meal method read "flakingly combine".
 * The evening food line and the finished-session bar have their own homes
 * (test:nutrition-layout and verify:finish-check).
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tierWords } from '../src/lib/coach-voice'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
// Comments out, so a note explaining a removal cannot satisfy the removal.
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

// ---------------------------------------------------------------------------
console.log('\n1. An exercise\'s kind is said in words, on every sheet that shows it')
// ---------------------------------------------------------------------------
{
  const tiers = [...new Set(EXERCISE_DATABASE.map(e => e.mechanics_tier))]
  const said = tiers.map(t => [t, tierWords(t)] as const)
  check('the catalogue has several kinds (sanity check on the next one)', tiers.length >= 3, tiers)
  check('no kind is said with a tier number or an underscore', said.every(([, w]) => w.length > 0 && !/tier|_|\d/i.test(w)), said)
  check('the three lifting kinds read as a coach would say them',
    tierWords('tier1_compound') === 'main compound' && tierWords('tier2_compound') === 'compound' && tierWords('tier3_isolation') === 'isolation')
  check('a kind nobody named yet still loses its number', tierWords('tier4_whatever') === 'whatever' && tierWords(null) === 'exercise')
  for (const f of ['src/components/exercise/SwapDialog.tsx', 'src/components/exercise/AddExerciseSheet.tsx']) {
    const c = code(f)
    check(`${f.split('/').pop()} renders the kind through tierWords(`, /tierWords\(\w+\??\.mechanics_tier\)/.test(c))
    check('...and never the raw value', !/mechanics_tier\.replace\(/.test(c))
  }
  const swap = code('src/components/exercise/SwapDialog.tsx')
  check('the swap sheet never says "catalog" to the person', !/catalog\b/i.test(swap.replace(/searchExerciseCatalogByWords|catalogEntry\w*/g, '')))
}

// ---------------------------------------------------------------------------
console.log('\n2. A finished round does not say it is running')
// ---------------------------------------------------------------------------
{
  const tools = code('src/components/ToolsTab.tsx')
  const sub = /sub: roundLive \? ([^\n]+)/.exec(tools)?.[1] ?? ''
  check('the Timers tile asks whether the round is complete', /timers\.isRoundComplete \? 'Round finished — log it' : 'A round is running'/.test(sub), sub)
}

// ---------------------------------------------------------------------------
console.log('\n3. "Nothing is capped" only when nothing is')
// ---------------------------------------------------------------------------
{
  const profile = code('src/components/ProfileScreen.tsx')
  const cond = /\{([^{}]*)&& \(\s*<p[^>]*data-testid="ceilings-declined"/.exec(profile)?.[1] ?? ''
  check('the note is found (sanity check on the next one)', cond.includes('load_ceilings_declined'), cond)
  for (const col of ['max_dumbbell_kg', 'max_single_implement_kg', 'max_improvised_kg']) {
    check(`...and it is hidden once ${col} holds a number`, new RegExp(`profile\\.${col} == null`).test(cond), cond)
  }
  const prompt = code('src/lib/load-ceiling-prompt.ts')
  const save = /export async function saveStatedCeiling[\s\S]*?\n\}/.exec(prompt)?.[0] ?? ''
  check('a number stated later clears "not sure" in the same write', /\.update\(\{[^}]*\[LOAD_CEILING_COLUMN\[kind\]\]: kg[^}]*load_ceilings_declined: false[^}]*\}\)/.test(save), save.slice(0, 400))
}

// ---------------------------------------------------------------------------
console.log('\n4. A method is written in plain cooking English')
// ---------------------------------------------------------------------------
{
  const gen = read('supabase/functions/generate-meals/index.ts')
  const rule6 = /\n6\. "prep" is the COOKING METHOD[^\n]*/.exec(gen)?.[0] ?? ''
  check('rule 6 asks for plain, everyday cooking English', /plain, everyday cooking English/.test(rule6), rule6.slice(-200))
  check('...and names the word the tester saw as the thing not to do', /never an invented or unusual word \("flakingly combine"\)/.test(rule6))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} runs34-low check(s) FAILED\n`); process.exit(1) }
console.log('All runs34-low checks passed.\n')
