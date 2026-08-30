/**
 * Gate: "New Plan" really starts a new plan.
 *
 * ROOT INCIDENT, reported live. Tapping New Plan dropped straight onto the
 * review card — every previous answer filled in, Generate armed — instead of a
 * fresh conversation. `handleReset` wiped the profile and six caches but not
 * `fitplan_onboarding_draft`, which is a single GLOBAL key rather than a
 * per-profile one. So the next run restored a draft with every slot confirmed,
 * `readyToGenerate` was true on mount, and the review opened immediately.
 * Completion already cleared it; reset was the one path that did not.
 *
 * WHY THIS IS A LIST AND NOT ONE CHECK. The bug is not "we forgot this key",
 * it is "nothing says which keys a reset owns". So every GLOBAL localStorage
 * key in src/ must be classified here — cleared, or deliberately kept with a
 * stated reason. A new global key fails this until someone decides which it
 * is, which is the only version of this check that stops the next one.
 *
 * Per-profile keys (`something_${profileId}`) are exempt by construction: a
 * reset mints a new profile id, so the next run cannot read the old value.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

/** Every global (non-profile-scoped) localStorage key, and what a reset must do with it. */
const KEYS: Record<string, { clear: boolean; why: string }> = {
  fitplan_profile_id: { clear: true, why: 'the profile itself' },
  active_session_cache: { clear: true, why: "the old profile's live session" },
  offline_log_queue: { clear: true, why: 'queued writes for a profile about to become unreachable' },
  exercise_plan_cache: { clear: true, why: "the old profile's plan" },
  user_profile_cache: { clear: true, why: "the old profile" },
  mesocycle_cache: { clear: true, why: "the old profile's mesocycle" },
  fitplan_onboarding_draft: { clear: true, why: 'THE INCIDENT — a kept draft restores every answer and arms Generate' },
  fitplan_last_tab: { clear: true, why: 'found by this gate: the old profile\'s last tab would greet the new one' },

  fitplan_appearance_v1: { clear: false, why: 'a theme choice is not plan data; resetting it would be a surprise' },
  fitplan_appearance_v2: { clear: false, why: 'same — appearance survives a new plan on purpose' },
  fitplan_dev_mode: { clear: false, why: 'developer tooling, not user data' },
  fitplan_voice_debug: { clear: false, why: 'a debug toggle the user turned on deliberately' },

  // "New Plan" replaces the training block. It does not un-say "not now" to
  // the email prompt — that answer was about the ACCOUNT, which the new plan
  // is built inside, not about the plan being replaced. Clearing it would
  // re-ask somebody who declined two days ago simply because they rebuilt
  // their week, which is exactly the nagging Ashley's ruling ruled out.
  fitplan_email_prompt_dismissed_until: { clear: false, why: 'a "not now" about the account survives replacing the plan inside it' },

  // EVERY offline queue is kept, for one reason: each entry carries its own
  // profile id, so it can still sync for the profile that created it. Reset
  // already gives them a best-effort flush first. Dropping them would delete
  // logged work — sets, water, meals — that simply had not reached the server
  // yet, which is the failure this whole local-first layer exists to prevent.
  fitplan_setlog_pending_v1: { clear: false, why: 'offline set-log queue' },
  fitplan_setlog_sessions_v1: { clear: false, why: 'set-log session registry the queue reads' },
  fitplan_setlog_deadletter_v1: { clear: false, why: 'set writes that already failed; dropping them loses logged work silently' },
  fitplan_water_pending_v1: { clear: false, why: 'offline water queue' },
  fitplan_water_deadletter_v1: { clear: false, why: 'water writes that already failed' },
  fitplan_cardio_pending_v1: { clear: false, why: 'offline cardio queue' },
  fitplan_grocery_pending_v1: { clear: false, why: 'offline grocery queue' },
  fitplan_grocery_deadletter_v1: { clear: false, why: 'grocery writes that already failed' },
  fitplan_mealevent_pending_v1: { clear: false, why: 'offline meal-event queue' },
  fitplan_mealevent_deadletter_v1: { clear: false, why: 'meal writes that already failed' },
}

/** Resolve `const SOME_KEY = 'literal'` across src/, so a key named by a constant is still found. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}
const files = walk(join(ROOT, 'src'))
// PER FILE, not one shared map. Five different stores each declare a
// `PENDING_KEY` and three a `DEAD_LETTER_KEY`, with different literals — a
// single map keeps whichever file was read last, which is exactly how the
// first version of this gate reported set-log keys living in the cardio and
// grocery stores. The gate found that in itself before it found anything
// else.
const constsIn = (src: string) => {
  const m = new Map<string, string>()
  for (const c of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g)) m.set(c[1], c[2])
  return m
}
const appConsts = constsIn(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))

console.log('\n1. Every global localStorage key in src/ is classified above')
{
  const found = new Set<string>()
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const local = constsIn(src)
    for (const m of src.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^),\n]+)/g)) {
      const arg = m[1].trim()
      if (arg.includes('${') || arg.includes('+')) continue // per-profile, exempt by construction
      const lit = /^['"]([^'"]+)['"]$/.exec(arg)
      const key = lit ? lit[1] : local.get(arg)
      if (key) found.add(key)
    }
  }
  check('some global keys were found (sanity check on this gate)', found.size > 5, found.size)
  const unclassified = [...found].filter(k => !(k in KEYS))
  check('no global key is missing from the list above', unclassified.length === 0, unclassified)
  // The other direction: a key removed from the app should not linger here
  // pretending to be covered.
  const stale = Object.keys(KEYS).filter(k => !found.has(k))
  check('...and nothing in the list has disappeared from the app', stale.length === 0, stale)
}

console.log('\n2. handleReset clears exactly the keys marked clear:true')
{
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  const body = app.slice(app.indexOf('const handleReset'), app.indexOf('const handleMacroModeChange'))
  check('handleReset was found (sanity check on this gate)', body.length > 200)

  const clearedLiterals = [...body.matchAll(/localStorage\.removeItem\(\s*([^)]+)\)/g)]
    .map(m => m[1].trim())
    .map(a => /^['"]([^'"]+)['"]$/.exec(a)?.[1] ?? appConsts.get(a) ?? a)
  // The draft has its own module-level clearer rather than a removeItem call.
  const cleared = new Set(clearedLiterals)
  if (/\bclearOnboardingDraft\(\)/.test(body)) cleared.add('fitplan_onboarding_draft')

  for (const [key, { clear, why }] of Object.entries(KEYS)) {
    if (clear) check(`clears ${key} — ${why}`, cleared.has(key), [...cleared])
    else check(`keeps ${key} — ${why}`, !cleared.has(key))
  }
}

console.log('\n3. The draft is cleared on completion too, so only ONE path ever had the gap')
{
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('the completion path clears the draft as well',
    (app.match(/clearOnboardingDraft\(\)/g) ?? []).length >= 2,
    (app.match(/clearOnboardingDraft\(\)/g) ?? []).length)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll reset checks passed.\n')
