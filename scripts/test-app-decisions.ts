// ---------------------------------------------------------------------------
// test:app-decisions — THE COACH KNOWS THE APP'S OWN REASONS (24 Nov 2026, his "build the why sheet").
// supabase/functions/_shared/app-decisions.ts is the sheet. This holds:
//   1. every entry points at code that still exists (a renamed or deleted rule fails here, not in a chat)
//   2. every app file that records a coaching (CSCS) decision has an entry or a written exemption
//   3. entries are plain words: no internal names, no dates, no rulings or names of who decided
//   4. every number an entry states is a number its own file holds (as itself, or as a fraction)
//   5. real questions reach the right entry, and small talk reaches none
//   6. the coach is given it, for the message it is answering, with the "do not invent" rule
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { APP_DECISIONS, APP_DECISIONS_EXEMPT, pickAppDecisions, appDecisionsFor, type AppDecision } from '../supabase/functions/_shared/app-decisions'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : ''

console.log(`\n(${APP_DECISIONS.length} entries)`)

console.log('\n1. Every entry points at code that exists')
const missing = APP_DECISIONS.flatMap(d => [d.anchor, ...(d.numbersFrom ?? [])]).filter(a => !stripComments(read(a.file)).includes(a.token)).map(a => `${a.file} ${a.token}`)
check('every anchor token is in its file\'s code (comments do not count)', missing.length === 0, missing)

console.log('\n2. Every file that records a coaching decision is on the sheet')
/** The files under src/lib whose comments record a CSCS decision. */
function cscsFiles(): string[] {
  const dir = join(ROOT, 'src/lib')
  return readdirSync(dir).filter(f => f.endsWith('.ts') && /CSCS/.test(readFileSync(join(dir, f), 'utf8'))).map(f => `src/lib/${f}`)
}
function uncovered(files: string[], entries: AppDecision[], exempt: Record<string, string>): string[] {
  const anchored = new Set(entries.map(d => d.anchor.file))
  return files.filter(f => !anchored.has(f) && !exempt[f])
}
const files = cscsFiles()
check(`the detector finds the files (${files.length})`, files.length >= 50, files.length)
check('the detector catches a file with no entry (proven on the real list minus one entry)', uncovered(files, APP_DECISIONS.filter(d => d.anchor.file !== 'src/lib/warmup-rest.ts'), APP_DECISIONS_EXEMPT).includes('src/lib/warmup-rest.ts'))
const gaps = uncovered(files, APP_DECISIONS, APP_DECISIONS_EXEMPT)
check('every such file has an entry or a written exemption', gaps.length === 0, gaps)
const staleExempt = Object.keys(APP_DECISIONS_EXEMPT).filter(f => !read(f))
check('every exemption names a file that exists', staleExempt.length === 0, staleExempt)

console.log('\n3. Plain words')
const internal = APP_DECISIONS.filter(d => {
  const t = `${d.rule} ${d.why}`
  return /\b[a-z]+[A-Z][a-zA-Z]*\b/.test(t) || /\b[a-z]+_[a-z_]+\b/.test(t) || /\.tsx?\b/.test(t) || /\bAshley\b|\bCSCS\b|his ruling|\b20\d\d\b|BACKLOG|\bslot\b|tier[_ -]?\d/i.test(t)
}).map(d => d.rule.slice(0, 80))
check('no internal name, file, date, ruling or who-decided in any entry', internal.length === 0, internal)
check('every entry has a rule of one or two sentences', APP_DECISIONS.every(d => d.rule.length > 20 && d.rule.length <= 400), APP_DECISIONS.filter(d => d.rule.length > 400).map(d => d.rule.slice(0, 60)))
const noWhy = APP_DECISIONS.filter(d => !d.why).length
check(`entries with no recorded reason are few (${noWhy}) and say so to the coach`, noWhy <= 3 && /No reason is recorded/.test(appDecisionsFor('pregnant 28 weeks why is my effort capped at 7')))

console.log('\n4. The numbers an entry states are its file\'s numbers')
function numbersIn(text: string): string[] {
  return [...text.replace(/,(\d{3})/g, '$1').matchAll(/\b\d+(?:\.\d+)?\b/g)].map(m => m[0])
}
function fileHolds(src: string, n: string): boolean {
  const v = Number(n)
  // As written, as a fraction (70% is 0.7, "about 5% down" is 0.95, "10% up" is 1.1), as seconds or milliseconds.
  const forms = new Set([n, String(v / 100), String(Number((1 - v / 100).toFixed(4))), String(Number((1 + v / 100).toFixed(4))), String(v * 60), String(v * 1000)])
  return [...forms].some(f => new RegExp(`(^|[^\\d.])${f.replace('.', '\\.')}0*(?![\\d])`).test(src))
}
/** Numbers that are ordinary words in a sentence, not prescriptions ("one", "two" are written as words already). */
const PROSE = new Set(['1', '2', '3', '4', '10'])
/** NEAR THE RULE, NOT ANYWHERE IN THE FILE: a 7,000-line file holds almost every small number somewhere, so "18 sets"
 *  changed to 19 passed a whole-file check (found by mutation). The lines within WINDOW of each place the token is
 *  named are the rule's own record; a number that lives elsewhere is named on the entry (numbersFrom). */
const WINDOW = 30
function nearToken(file: string, token: string): string {
  const lines = read(file).split('\n')
  const out: string[] = []
  lines.forEach((l, i) => { if (l.includes(token)) out.push(lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join('\n')) })
  return out.join('\n')
}
const wrongNumbers: string[] = []
for (const d of APP_DECISIONS) {
  const near = [d.anchor, ...(d.numbersFrom ?? [])].map(a => nearToken(a.file, a.token)).join('\n')
  for (const n of numbersIn(d.rule)) if (!PROSE.has(n) && !fileHolds(near, n)) wrongNumbers.push(`${d.anchor.token}: ${n}`)
}
check('every number in a rule is held by its own file', wrongNumbers.length === 0, wrongNumbers)

console.log('\n5. Real questions reach the right entry')
const probes: [string, string][] = [
  ['why dont i get a rest timer after my warm up sets', 'restAfterWarmupSeconds'],
  ['why is this week so much lighter, is it a deload?', 'cardLoadFor'],
  ['why does the app never give me more than 20 reps', 'LOADED_REP_CEILING'],
  ['why is my protein target lower, I am a beginner', 'BEGINNER_PROTEIN_OFFSET'],
  ['I had a month off on holiday, why are my weights lower now', 'BANDS'],
  ['why did my calories not change after I weighed in', 'getEffectiveTargetWeightKg'],
  ['why cant I do box jumps any more, im 67', 'olderAdultExclusion'],
  ['why are my first week weights so light', 'CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE'],
  ['why did the weight go up on my next set mid session', 'setNudgeFor'],
  ['how many messages a day will the coach send me', 'dailyCap'],
  ['why is the rest on my squats so long between sets', 'mainLiftRestFloor'],
  ['why does my plan only have one deadlift a week', 'isSecondFloorPull'],
]
for (const [q, token] of probes) {
  const got = pickAppDecisions(q).map(d => d.anchor.token)
  check(`"${q}" reaches its entry`, got.includes(token), got)
}
check('small talk reaches nothing', pickAppDecisions('hello how are you today').length === 0 && pickAppDecisions('what is the capital of france').length === 0)
const sizes = probes.map(([q]) => appDecisionsFor(q).length)
const biggest = Math.max(...sizes)
console.log(`  (largest block for a probe: ${biggest} characters; the coach's whole prompt is about 175,000)`)
check('the block stays small: never more than 5,000 characters', biggest <= 5000, biggest)

console.log('\n6. The coach is given it')
const chat = stripComments(read('supabase/functions/chat-gemini/index.ts'))
check('the coach imports the sheet', /import \{ appDecisionsFor \} from "\.\.\/_shared\/app-decisions\.ts"/.test(chat))
const prompt = chat.slice(chat.indexOf('const systemPrompt = `'), chat.indexOf('const systemPrompt = `') + 60000)
check('the prompt carries it for THIS message, after the why-on-every-answer section', /=== 1-WHY\. A WHY ON EVERY ANSWER[\s\S]{0,3000}\$\{appDecisionsFor\(typeof message === 'string' \? message : ''\)\}/.test(prompt))
const block = appDecisionsFor('why dont i get a rest timer after my warm up sets')
check('the block tells the coach to use the app\'s reason and never invent one', /answer with the app's OWN reason/.test(block) && /do not invent it/.test(block))
check('...and says so when nothing matches', /No entry of the app's own reasons matches/.test(appDecisionsFor('hello')))
check('the warm-up answer is in the block for his question', /no rest timer between warm-up sets/i.test(block) && /Why: /.test(block))
for (const p of ['supabase/functions/chat-gemini/index.ts', 'supabase/functions/_shared/coach-rules.ts']) {
  check(`${p.split('/').slice(-2).join('/')} no longer says the timer starts after every set`, !/starts on its own the moment a set is logged/.test(read(p)) && /between warm-up sets there is none/.test(read(p)))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
