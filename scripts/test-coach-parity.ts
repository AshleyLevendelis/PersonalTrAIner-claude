// ---------------------------------------------------------------------------
// EVERY COACH TOOL IS CLASSIFIED, AND NONE OF THEM QUIETLY DECLINES.
//
// Ashley's second promise: everything the app can do can be done by tapping OR
// by asking. CLAUDE.md's rule 4 says parity is checked both ways against a
// written exceptions list — and that until that list exists, every one-sided
// capability counts as a gap. docs/coach-screen-parity.md is that list; this
// file is what stops it going stale.
//
// THE HOLE THIS CLOSES, named in CLAUDE.md: "No GENERAL gate distinguishes a
// declared coach tool from a declining stub." That is how ban_exercise sat for
// weeks declared to the model and declining in the handler, while the must-have
// list recorded it as working on both surfaces. test:meal-food-edit §8 does this
// for its own three tools; this does it for all of them.
//
// WHAT IT CANNOT DO, said plainly: it cannot tell whether the screen control a
// row names really exists — that is a human reading, and the file records when
// it was last done. What it CAN do is make the list impossible to ignore: a new
// tool with no row fails, a row naming no tool fails, and a tool that declines
// fails whatever the list says about it.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const chat = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
const doc = readFileSync('docs/coach-screen-parity.md', 'utf8')

const declared = [...new Set([...chat.matchAll(/^\s*name:\s*"([a-z_]+)",\s*$/gm)].map(m => m[1]))].sort()

console.log('\n1. The list covers every tool the coach is given\n')
check(`there are tools to check, so this has teeth (${declared.length})`, declared.length >= 20, declared.length)

// A row is `| \`tool\` | MARK | notes |`.
const rows = new Map<string, { mark: string; notes: string }>()
for (const m of doc.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*([A-Z]+)\s*\|\s*([^|]*)\|/gm)) {
  rows.set(m[1], { mark: m[2].trim(), notes: m[3].trim() })
}
check(`the list has rows, so this has teeth (${rows.size})`, rows.size >= 20, rows.size)

for (const tool of declared) {
  check(`${tool} is in the parity list`, rows.has(tool))
}
const ghosts = [...rows.keys()].filter(t => !declared.includes(t))
check('...and the list names no tool that does not exist', ghosts.length === 0, ghosts)

console.log('\n2. Each row says which side it lives on, and an exception says why\n')
for (const [tool, row] of rows) {
  check(`${tool}: marked SCREEN or EXCEPTION`, row.mark === 'SCREEN' || row.mark === 'EXCEPTION', row.mark)
  if (row.mark === 'EXCEPTION') {
    // A REASON, not a restatement. Short notes like "coach only" would make
    // the list a tally rather than a record of decisions, which is the thing
    // rule 4 asks for.
    check(`${tool}: the exception carries a reason`, row.notes.length >= 40, row.notes)
  } else {
    check(`${tool}: names the control that does the same thing`, row.notes.length >= 10, row.notes)
  }
}

console.log('\n3. No declared tool is a declining stub\n')
// A DECLINE IS A HANDLER WHOSE ONLY ANSWER IS A REFUSAL. Detected by the phrase
// the app's declines have always used, and proved on a synthetic handler first
// so the rule cannot go vacuous when — as now — nothing declines.
const DECLINE = /coming in an update soon|can't .{0,40} through chat yet|is not available from chat/i
const handlerOf = (tool: string): string => {
  const at = chat.indexOf(`name === "${tool}"`)
  if (at < 0) return ''
  const next = chat.indexOf('if (name === "', at + 5)
  return chat.slice(at, next < 0 ? at + 6000 : next)
}
check('the decline detector detects (proved on a synthetic handler)',
  DECLINE.test('return json({ reply: "I can\'t do that through chat yet — coming in an update soon." })'))
for (const tool of declared) {
  check(`${tool}: reachable — the handler compares on its name`, chat.includes(`name === "${tool}"`))
  check(`${tool}: not a declining stub`, !DECLINE.test(handlerOf(tool)), handlerOf(tool).slice(0, 120))
}

console.log('\n4. The screen-only section is a real answer, not an empty heading\n')
const screenOnly = doc.slice(doc.indexOf('## Things the screen can do that the coach cannot'))
check('the screen-only section states a count or lists entries',
  /\*\*None,/.test(screenOnly) || /^- /m.test(screenOnly), screenOnly.slice(0, 120))
check('...and says when that was last measured', /\d{1,2} Sep 2026/.test(doc))

console.log(failures === 0
  ? '\nEvery coach tool is classified, and none of them declines.\n'
  : `\n${failures} parity failure(s).\n`)
process.exit(failures === 0 ? 0 : 1)
