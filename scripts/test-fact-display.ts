/**
 * test:fact-display — A REMEMBERED NOTE READS IN PLAIN WORDS (the Profile walk, 18 Nov 2026, findings P4, P6, P7).
 *
 * Profile's "Remembers" list printed "won't eat/do Barbell Squats", a pill reading "hard", and "manual · Sep 16,
 * 2026". This holds the words (by kind, by source, the date as the app writes dates), that every WRITER of a firm
 * "never" uses the one function, and the two small lines found on the same walk ("1 meals planned", and the old
 * "12 in a row" pill in the Appearance preview, which his 13 Nov ruling removed everywhere else).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wontText, factText, factSourceLine, timingRuleEffect, APPLIES_AT_NEXT_REBUILD } from '../src/lib/fact-display'
import { starterDayLine } from '../src/lib/show-numbers'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with comments taken out, so a note about the old label cannot satisfy (or fail) a check on it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('\n[1] The label is written by kind')
check('a food is eaten: "won\'t eat pork"', wontText('food_preference', 'pork') === "won't eat pork", wontText('food_preference', 'pork'))
check('an exercise is done: "won\'t do Barbell Squats"', wontText('exercise_preference', 'Barbell Squats') === "won't do Barbell Squats", wontText('exercise_preference', 'Barbell Squats'))
check('neither says "eat/do"', !/eat\/do/.test(wontText('food_preference', 'x') + wontText('exercise_preference', 'x')))

console.log('\n[2] A note saved under the old label reads by its kind')
check('an old food note: "won\'t eat mushrooms"', factText({ kind: 'food_preference', display_text: "won't eat/do mushrooms" }) === "won't eat mushrooms")
check('an old exercise note: "won\'t do Burpees"', factText({ kind: 'exercise_preference', display_text: "won't eat/do Burpees" }) === "won't do Burpees")
check('any other note is left word for word', factText({ kind: 'food_preference', display_text: 'likes curry' }) === 'likes curry' && factText({ kind: 'timing_rule', display_text: 'no caffeine after 2pm' }) === 'no caffeine after 2pm')
check('...and so is another kind of note that happens to start the same way (nothing is guessed)', factText({ kind: 'hard_constraint', display_text: "won't eat/do x" }) === "won't eat/do x")

console.log('\n[3] Where it came from, in words, with the date as the app writes one')
const at = '2026-09-16T12:00:00'
check('"manual" reads "Added by you · 16 Sep 2026"', factSourceLine('manual', at) === 'Added by you · 16 Sep 2026', factSourceLine('manual', at))
check('"chat" reads "From chat · 16 Sep 2026"', factSourceLine('chat', at) === 'From chat · 16 Sep 2026', factSourceLine('chat', at))
check('"onboarding" reads "From setup · ..."', factSourceLine('onboarding', at) === 'From setup · 16 Sep 2026', factSourceLine('onboarding', at))
check('no stored label is ever printed raw: not "manual", "onboarding" or "logged_data"', ['manual', 'chat', 'onboarding', 'logged_data'].every(s => !/manual|onboarding|logged_data/.test(factSourceLine(s, at))))
check('a source the app does not know is left out, the date kept', factSourceLine('import_v2', at) === '16 Sep 2026', factSourceLine('import_v2', at))
check('a date that cannot be read is left out, the words kept (never "Invalid Date")', factSourceLine('chat', 'not a date') === 'From chat', factSourceLine('chat', 'not a date'))
check('every month is three letters, the same on every phone ("Sep", never "Sept")', Array.from({ length: 12 }, (_, m) => factSourceLine('chat', `2026-${String(m + 1).padStart(2, '0')}-10T12:00:00`)).every(l => /^From chat · 10 [A-Z][a-z]{2} 2026$/.test(l)))

console.log('\n[4] Every writer of a firm "never" uses the one function')
{
  const files: string[] = []
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p) } }
  walk(join(ROOT, 'src'))
  const literal = files.filter(p => !p.endsWith('fact-display.ts') && /won't eat\/do|won.t eat\/do/.test(code(p.slice(ROOT.length + 1)))).map(p => p.slice(ROOT.length + 1))
  check('no file in src writes "won\'t eat/do" itself', files.length > 100 && literal.length === 0, literal)
  const writers = ['src/App.tsx', 'src/components/ChatAssistant.tsx', 'src/components/ProfileScreen.tsx', 'src/lib/pending-action-executor.ts', 'src/lib/screen-ban.ts']
  const calls = writers.map(p => [p, (code(p).match(/wontText\(/g) ?? []).length] as const)
  check('each of the five writers calls wontText( (App twice, the chat twice)', calls.every(([, n]) => n >= 1) && calls[0][1] >= 2 && calls[1][1] >= 2, calls)
}

console.log('\n[5] Profile draws the note through the reader, with no internal pill')
{
  const profile = code('src/components/ProfileScreen.tsx')
  check('the note\'s text is factText(f), never the stored text raw', /data-testid="fact-text">\{factText\(f\)\}/.test(profile) && !/>\{f\.display_text\}</.test(profile))
  check('where it came from is factSourceLine(', /factSourceLine\(source, createdAt\)/.test(profile) && !/\{source\} · \{date\}/.test(profile))
  check('no pill prints the stored "hard" / "soft"', !/\{f\.hardness\}/.test(profile))
  check('"Download my data", "Delete everything" and the confirm step under it are 44px tall (they were 32)', (profile.match(/className="h-11 text-xs" onClick=\{handleDownloadData\}/g) ?? []).length === 1 && /className="h-11 text-xs text-destructive border-destructive\/40"/.test(profile) && /className="h-11 text-xs bg-destructive/.test(profile) && !/\bh-8\b/.test(profile))
}

console.log('\n[5b] What a rule does, in plain words, the same on Profile and on the chat\'s receipt')
{
  const slot = timingRuleEffect('slot', 'breakfast'), training = timingRuleEffect('training', null)
  check('a rule about a meal is applied to that meal: "applied to your breakfast options"', slot === 'applied to your breakfast options', slot)
  check('a rule about training says it is kept and NOT applied', /^remembered, not applied: /.test(training) && /when you train/.test(training), training)
  check('...and a rule with no anchor, or a slot rule with no slot, is never claimed as applied', /not applied/.test(timingRuleEffect(null, null)) && /not applied/.test(timingRuleEffect('slot', null)) && /not applied/.test(timingRuleEffect(undefined, 'lunch')))
  const lines = [slot, training, APPLIES_AT_NEXT_REBUILD]
  check('no line uses a builder\'s word ("pool", "day-context", "generation", "regeneration") or promises with "yet"', lines.every(l => !/\bpool\b|day-context|generation|\byet\b/i.test(l)), lines)
  const profile = code('src/components/ProfileScreen.tsx'), chat = code('src/components/ChatAssistant.tsx')
  check('Profile and the chat both call the one function, and neither writes the old sentence', /timingRuleEffect\(fact\.timing_anchor, fact\.timing_slot\)/.test(profile) && /timingRuleEffect\(timingAnchor, timingSlot\)/.test(chat) && !/not yet applied/.test(profile + chat))
  check('...and both use the one line for a day he cannot train', /return APPLIES_AT_NEXT_REBUILD/.test(profile) && /\? APPLIES_AT_NEXT_REBUILD :/.test(chat))
}

console.log('\n[6] Two lines from the same walk')
check('one meal is "1 meal planned", never "1 meals planned"', starterDayLine(0, 1) === '1 meal planned' && starterDayLine(0, 3) === '3 meals planned', [starterDayLine(0, 1), starterDayLine(0, 3)])
check('...and "Logged 1 of 1 meal"; three stay "meals"; none is "No meals planned"', starterDayLine(1, 1) === 'Logged 1 of 1 meal' && starterDayLine(1, 3) === 'Logged 1 of 3 meals' && starterDayLine(0, 0) === 'No meals planned', [starterDayLine(1, 1), starterDayLine(1, 3)])
{
  const appearance = code('src/components/AppearanceSection.tsx')
  check('the Appearance preview shows weeks on plan, never a run ("12 in a row" went on 13 Nov everywhere else)', /of 12 weeks/.test(appearance) && !/in a row/.test(appearance))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('A remembered note reads in plain words.')
