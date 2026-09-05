/**
 * Gate: everything the client sends the coach is actually read, and there is
 * only ever ONE source for a logged set's time.
 *
 * Two failures, one shape, both live on Ashley's phone within a week of each
 * other:
 *
 * 1. `steps_summary` was computed, packed into the context, and sent — and
 *    the edge function never read it. The prompt meanwhile told the model
 *    twice to "add it to the count in the STEPS line of their context". There
 *    was no STEPS line. The model was being asked to reason from a number it
 *    had never been given, and `log_steps` REPLACES the day's total, so an
 *    invented base was a destructive write. The gate that shipped with that
 *    feature only checked the client SENT the field.
 *
 * 2. The edge function independently fetched exercise_set_logs and built its
 *    own block — a 48-hour window titled "TODAY'S", timestamped with
 *    `toLocaleTimeString()`, which in Deno is UTC. A set logged at 11pm the
 *    night before was presented as today at 10:00 PM. The client was already
 *    sending the same facts, correctly, in `workout_log_history`.
 *
 * So this is a gate about the CLASS, not either instance: a field that is
 * sent and not read is a fact the model will be asked to supply from
 * nowhere, and two sources for one fact means one of them is wrong.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const client = read('src/components/ChatAssistant.tsx')
const server = read('supabase/functions/chat-gemini/index.ts')

/**
 * The server with its comments removed.
 *
 * §2 and §3 assert things the PROMPT does not say and the CODE does not do —
 * and the deleted block left a long gravestone comment behind that quotes the
 * exact strings being banned. A check that reads comments cannot tell the
 * difference between the bug and the note explaining why the bug is gone,
 * which would mean deleting the explanation to keep a gate green. Strip them.
 */
const serverCode = server
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

/**
 * The TOP-LEVEL keys of buildContext's returned object.
 *
 * Brace-counted rather than regex-windowed, deliberately. A character budget
 * over this object would either stop early (missing the proactive fields at
 * the bottom, which is where the next steps_summary will be added) or run
 * past the end into unrelated code — this repo has two separate gates whose
 * comments record exactly that failure.
 */
function contextKeys(): string[] {
  const start = client.indexOf('const buildContext = () => {')
  if (start < 0) return []
  const lines = client.slice(start).split('\n')
  const keys: string[] = []
  let depth = 0
  let started = false
  for (const line of lines) {
    if (!started) {
      if (line.trim() === 'return {') { started = true; depth = 1 }
      continue
    }
    if (depth === 1) {
      // `key: value` AND bare shorthand `key,`. The first version of this
      // required the colon and silently missed `macros,` — which the server
      // does read, so the miss showed up in the reverse check below rather
      // than as a false pass. A one-sided extractor is how a gate comes to
      // check one direction of a two-directional rule.
      const m = /^([a-z_0-9]+)\s*[:,]/.exec(line.trim())
      if (m) keys.push(m[1])
    }
    depth += (line.match(/[{[]/g)?.length ?? 0) - (line.match(/[}\]]/g)?.length ?? 0)
    if (depth <= 0) break
  }
  return keys
}

console.log('\n1. Every field the client sends is read by the server\n')
const keys = contextKeys()
// SANITY CHECK ON THIS CHECK. If the extractor silently found nothing — a
// rename, a refactor to a helper — the loop below is vacuous and passes on an
// edge function that reads none of it. Caught by mutation: renaming
// buildContext left the whole section green.
check('buildContext was found and its keys extracted', keys.length >= 25, keys.length)

const unread = keys.filter(k => !server.includes(`context.${k}`))
check('...and every one of them is read as context.<field>', unread.length === 0, unread)

// The other half of the same rule, from the other direction: a field the
// server reads that the client never sends is `undefined` at runtime and
// silently renders as an empty prompt line.
const serverReads = [...server.matchAll(/context\.([a-z_0-9]+)/g)].map(m => m[1])
const unsent = [...new Set(serverReads)].filter(k => !keys.includes(k))
check('and nothing is read that is never sent', unsent.length === 0, unsent)

console.log('\n2. One source for a logged set, and it is the client\n')
// The deleted block's own shape, held down by name so it cannot come back:
// the edge function must not query the set log at all.
check('the edge function does not query exercise_set_logs itself',
  !/from\(['"]exercise_set_logs['"]\)/.test(serverCode))
// toLocaleTimeString/toLocaleDateString with no timezone renders UTC in Deno,
// which is what produced "10:00 PM" for a set logged at 11pm BST. There is no
// correct use of them in a server that does not know the user's timezone.
// The server runs in UTC, so its own clock is the wrong day for part of every
// day in almost every timezone. The client sends current_local_date and
// day_of_week; the ONLY permitted `new Date()` here is the deploy-gap fallback
// that fills those two in, which is why this counts rather than forbids.
const ownClockUses = (serverCode.match(/new Date\(\)\.toLocale|new Date\(\)\.toISOString\(\)\.split/g) ?? []).length
// THREE, and they are the three fallback lines below — one per clock field
// the client sends. Any fourth is a handler reading the server's own clock
// again, which is the bug this section exists for.
check('the server derives day, date and time from the client, not its own UTC clock',
  ownClockUses === 3, ownClockUses)
check('...and all three that remain are the deploy-gap fallback, in one block',
  /if \(!context\.current_local_date\)[\s\S]{0,600}?if \(!context\.day_of_week\)[\s\S]{0,600}?if \(!context\.current_time_formatted\)/.test(serverCode))
check('...so every handler stamps rows with the client\'s date',
  !/todayDate = new Date\(\)/.test(serverCode) && /todayDate = context\.current_local_date/.test(serverCode))
check('and no set-log time is rendered in the server\'s locale',
  !/toLocaleTimeString\(/.test(serverCode))
check('the client-side history is still what carries it',
  /context\.workout_log_history/.test(serverCode) && /workout_log_history:/.test(client))
// A window titled "today" that is not today is the second half of the bug:
// the block was 48 hours wide and said TODAY'S.
check('no prompt block claims "today" over a multi-hour lookback window',
  !/TODAY'S LOGGED WORKOUT SETS/.test(serverCode))

console.log('\n3. The prompt does not point at context that is not there\n')
// Every `the X line of their context` style instruction has to name a line
// the prompt actually builds. STEPS is the one that was wrong; asserting the
// label exists is what would have caught it.
/**
 * A prompt heading only counts if it CARRIES DATA.
 *
 * The first version of this check looked for a line starting with the label
 * — and passed with `STEPS: ${context.steps_summary}` renamed away, because
 * the rules block above it also opens with a bare `STEPS:` heading. A label
 * with no interpolation under it is exactly the state the bug was in: the
 * word was in the prompt, the number was not. Found by mutation.
 */
function headingCarries(label: string, field: string): boolean {
  // EVERY occurrence, not the first. STEPS appears twice — once as the
  // log_steps rules' own heading and once as the line that carries the
  // number — and `indexOf` found the rules block, 35 lines above the data.
  // A section can also be long (the exercise plan's "@" legend runs to
  // twenty lines before the summary), so the window is the distance to the
  // NEXT blank-line-delimited heading rather than a character budget.
  let at = serverCode.indexOf(`\n${label}`)
  while (at >= 0) {
    const rest = serverCode.slice(at + 1)
    // The next line that is ENTIRELY a heading. Not "starts with capitals":
    // this prompt is full of mid-paragraph lead-ins like "ONE THING THE PLAN
    // DOES NOT KNOW: for the four movements..." which a starts-with test cuts
    // the section at, seven lines above the data it was looking for.
    const end = rest.search(/\n[A-Z][A-Z0-9 ,'"()\u2014-]{3,}:?[ \t]*(?=\n)/)
    if (rest.slice(0, end < 0 ? rest.length : end).includes(`\${context.${field}`)) return true
    at = serverCode.indexOf(`\n${label}`, at + 1)
  }
  return false
}
for (const [label, field] of [['STEPS', 'steps_summary'], ['CURRENT EXERCISE PLAN', 'exercise_summary']] as const) {
  check(`the ${label} line exists AND carries context.${field}`, headingCarries(label, field))
}

/**
 * And the rule stated generally, derived from the prompt's own words: every
 * time the prompt tells the model to read "the X line of their context",
 * there has to BE an X line. This is the check that would have caught
 * steps_summary without anyone naming steps_summary — the instruction was
 * already written, twice, pointing at nothing.
 */
const referenced = [...new Set([...serverCode.matchAll(/the ([A-Z][A-Z ]{2,30}) line of their context/g)].map(m => m[1].trim()))]
check('at least one "the X line of their context" instruction was found (sanity check on this check)',
  referenced.length > 0, referenced)
for (const label of referenced) {
  check(`...and the prompt builds the ${label} line it points at`,
    new RegExp(`\\n${label}[ :(]`).test(serverCode))
}
// remaining_macros_today never existed. The prompt modelled fabricating from
// it in two worked examples.
check('no prompt text refers to remaining_macros_today',
  !/remaining_macros_today/.test(serverCode))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log(`\n${keys.length} context fields sent, ${keys.length} read.\n`)
