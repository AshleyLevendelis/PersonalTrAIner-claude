// ---------------------------------------------------------------------------
// test:functions-parse — every edge function file is valid TypeScript syntax (18 Nov 2026).
//
// `npx tsc --noEmit` covers `src` only, so nothing type-checks or even parses `supabase/functions`. On 17 Nov 2026 the
// photo build left one stray "` : ''}" in the coach's system prompt (chat-gemini/index.ts). The file no longer parsed,
// every `chat-gemini` deploy from that commit on would have failed at the bundle step, and it was merged to main: the
// source checks read the file as TEXT and passed, and the only gates that import it (the deno smokes) run in a full
// sweep. This parses every file in seconds, so the derived set catches it at the commit.
//
// It proves SYNTAX only: not types, not imports resolving, not behaviour. The deno smokes still do that.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { transformSync } from 'esbuild'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

const ROOT = 'supabase/functions'
const files: string[] = []
const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p) } }
walk(ROOT)

const parseError = (source: string, file: string): string | null => {
  try { transformSync(source, { loader: file.endsWith('.tsx') ? 'tsx' : 'ts', logLevel: 'silent' }); return null }
  catch (e) { const err = (e as { errors?: { text: string; location?: { line: number; column: number } }[] }).errors?.[0]; return err ? `${err.text} at ${err.location?.line}:${err.location?.column}` : String(e).slice(0, 200) }
}

console.log('\n1. The detector works')
check('it reads valid TypeScript as valid', parseError('const a: number = 1\nexport const p = `x ${a ? `y` : \'\'} z`\n', 'a.ts') === null)
check('...and catches the very slip that shipped: a doubled "` : \'\'}" after a conditional block in a template', parseError('const c = { a: 1, b: 2 }\nexport const p = `x ${c.a ? `\ny\n` : \'\'}` : \'\'}${c.b ? `z` : \'\'}`\n', 'a.ts') !== null)

console.log('\n2. Every edge function file parses')
check('the functions were found: each of the deployed functions has an index.ts (20 or more files in all)',
  files.length >= 20 && ['chat-gemini', 'generate-meals', 'onboarding-chat', 'coach-reach-out'].every(fn => files.includes(join(ROOT, fn, 'index.ts'))), files.length)
const broken = files.map(f => ({ f, e: parseError(readFileSync(f, 'utf8'), f) })).filter(x => x.e != null)
check('none has a syntax error', broken.length === 0, broken.slice(0, 5))
const coach = readFileSync(join(ROOT, 'chat-gemini/index.ts'), 'utf8')
check('the coach\'s file is the big one it should be (over 3,000 lines), so the parse above read the real thing', coach.split('\n').length > 3000, coach.split('\n').length)

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} FAILED`); process.exitCode = 1 } else console.log('Every edge function file parses.')
